"""
Feature 4: Transaction History with Audit and Export.

Idempotency strategy: `Transaction.idempotency_key` (the payment gateway's
unique event id) has a UNIQUE constraint at the DB level. When a webhook
arrives, we attempt an INSERT; the database itself rejects a duplicate via
IntegrityError, which we catch and turn into a logged "duplicate ignored"
audit event instead of creating a second transaction row. This is the only
truly safe way to guarantee idempotency under concurrent webhook retries
(gateways retry aggressively on timeout) -- a pure "check then insert" in
application code has a race window between the check and the insert.
"""
import uuid
from datetime import datetime
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.transaction import Transaction, AuditLog, TransactionStatus
from app.models.user import utcnow

# Columns a client is allowed to sort by. Whitelisted (rather than
# getattr-ing whatever string arrives) so a request can't sort by an
# internal/sensitive column (idempotency_key, gateway_payload) or resolve a
# non-column attribute like `metadata` and 500 the endpoint.
SORTABLE_COLUMNS = {"created_at", "amount", "status", "payment_mode"}


def generate_invoice_number() -> str:
    return f"INV-{utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"


async def _write_audit(db: AsyncSession, transaction_id: int | None, event_type: str, payload: dict):
    db.add(AuditLog(transaction_id=transaction_id, event_type=event_type, payload=payload))
    await db.commit()


async def handle_webhook(db: AsyncSession, payload: dict) -> dict:
    """
    Expected payload shape (mirrors a typical gateway webhook):
    {
      "event_id": "evt_abc123",       # used as idempotency_key
      "order_id": "ORD-1001",
      "user_id": 1,
      "payment_mode": "UPI",
      "amount": 1499.00,
      "status": "success" | "failed" | "refunded",
      "raw": {...}                     # full gateway payload, stored as-is
    }
    """
    idempotency_key = payload["event_id"]

    existing = await db.execute(
        select(Transaction).where(Transaction.idempotency_key == idempotency_key)
    )
    existing_txn = existing.scalar_one_or_none()
    if existing_txn is not None:
        await _write_audit(db, existing_txn.id, "duplicate_webhook_ignored", payload)
        return {"status": "duplicate_ignored", "transaction_id": existing_txn.id}

    txn = Transaction(
        user_id=payload["user_id"],
        order_id=payload["order_id"],
        idempotency_key=idempotency_key,
        invoice_number=generate_invoice_number(),
        payment_mode=payload["payment_mode"],
        amount=payload["amount"],
        status=TransactionStatus(payload["status"]),
        gateway_payload=payload.get("raw", {}),
    )
    db.add(txn)
    try:
        await db.commit()
    except IntegrityError:
        # Lost a race against a concurrent identical webhook delivery --
        # the unique constraint caught what our pre-check above missed.
        await db.rollback()
        existing = await db.execute(
            select(Transaction).where(Transaction.idempotency_key == idempotency_key)
        )
        existing_txn = existing.scalar_one()
        await _write_audit(db, existing_txn.id, "duplicate_webhook_ignored", payload)
        return {"status": "duplicate_ignored", "transaction_id": existing_txn.id}

    event_type = {
        TransactionStatus.SUCCESS: "created",
        TransactionStatus.FAILED: "failed",
        TransactionStatus.REFUNDED: "refunded",
    }.get(txn.status, "created")
    await _write_audit(db, txn.id, event_type, payload)
    return {"status": "processed", "transaction_id": txn.id}


async def list_transactions(
    db: AsyncSession, user_id: int, page: int = 1, page_size: int = 20,
    status: str | None = None, payment_mode: str | None = None,
    date_from: datetime | None = None, date_to: datetime | None = None,
    sort_by: str = "created_at", sort_dir: str = "desc",
):
    """
    Server-side filtering + sorting + pagination, designed for 10,000+ rows:
    - filters use indexed columns (status, created_at, user_id) so WHERE
      clauses hit the composite index ix_transactions_user_status_created
    - pagination uses LIMIT/OFFSET with a capped page_size (enforced by the
      router) -- for extremely deep pagination a keyset/cursor approach
      would be more efficient, noted as a future optimization
    - a single COUNT(*) query (also index-covered) returns total_count for
      the client's pagination UI without a second full table scan
    """
    query = _apply_filters(
        select(Transaction).where(Transaction.user_id == user_id),
        status=status, payment_mode=payment_mode, date_from=date_from, date_to=date_to,
    )
    count_query = _apply_filters(
        select(func.count()).select_from(Transaction).where(Transaction.user_id == user_id),
        status=status, payment_mode=payment_mode, date_from=date_from, date_to=date_to,
    )

    # Whitelist the sort column; fall back to created_at for anything not
    # explicitly allowed so untrusted input can't reach an arbitrary attribute.
    sort_key = sort_by if sort_by in SORTABLE_COLUMNS else "created_at"
    sort_col = getattr(Transaction, sort_key)
    query = query.order_by(sort_col.desc() if sort_dir != "asc" else sort_col.asc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    total = (await db.execute(count_query)).scalar_one()
    rows = (await db.execute(query)).scalars().all()
    return rows, total


def _apply_filters(query, status=None, payment_mode=None, date_from=None, date_to=None):
    """Shared WHERE-clause builder so the paginated list view and the CSV
    export apply IDENTICAL filtering -- otherwise an export could silently
    return a different set than the rows the user is looking at."""
    if status:
        query = query.where(Transaction.status == status)
    if payment_mode:
        query = query.where(Transaction.payment_mode == payment_mode)
    if date_from:
        query = query.where(Transaction.created_at >= date_from)
    if date_to:
        query = query.where(Transaction.created_at <= date_to)
    return query


async def stream_transactions_for_export(db: AsyncSession, user_id: int, **filters):
    """
    Async generator yielding Transaction rows in DB-cursor-sized chunks
    rather than loading all 10,000+ rows into memory at once. Backs the
    streaming CSV export endpoint. Honors the same filters as
    list_transactions (status, payment_mode, date_from, date_to).
    """
    chunk_size = 500
    offset = 0
    while True:
        query = _apply_filters(
            select(Transaction).where(Transaction.user_id == user_id),
            status=filters.get("status"),
            payment_mode=filters.get("payment_mode"),
            date_from=filters.get("date_from"),
            date_to=filters.get("date_to"),
        )
        query = query.order_by(Transaction.created_at.desc()).offset(offset).limit(chunk_size)
        rows = (await db.execute(query)).scalars().all()
        if not rows:
            break
        for row in rows:
            yield row
        offset += chunk_size
        if len(rows) < chunk_size:
            break

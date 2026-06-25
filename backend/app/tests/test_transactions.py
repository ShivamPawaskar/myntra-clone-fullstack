import pytest
from sqlalchemy import select, func
from app.models.user import User
from app.models.transaction import Transaction, AuditLog
from app.core.security import hash_password
from app.services import transaction_service
from app.services.export_service import csv_export_generator, generate_receipt_pdf


async def _seed_webhooks(db, user, specs):
    """specs: list of (event_suffix, payment_mode, amount)."""
    for suffix, mode, amount in specs:
        await transaction_service.handle_webhook(db, {
            "event_id": f"evt_{suffix}", "order_id": f"ORD-{suffix}", "user_id": user.id,
            "payment_mode": mode, "amount": amount, "status": "success", "raw": {},
        })


async def _make_user(db):
    user = User(email="payer@test.com", name="Payer", hashed_password=hash_password("x"))
    db.add(user)
    await db.commit()
    return user


@pytest.mark.asyncio
async def test_duplicate_webhook_does_not_create_second_transaction(db_session):
    """Simulates a payment gateway retrying the exact same webhook delivery
    (which all real gateways do on timeout) -- the second delivery must be
    a no-op, not a duplicate transaction or double-counted revenue."""
    db = db_session
    user = await _make_user(db)
    payload = {
        "event_id": "evt_test_123", "order_id": "ORD-1", "user_id": user.id,
        "payment_mode": "UPI", "amount": 500.0, "status": "success", "raw": {},
    }

    r1 = await transaction_service.handle_webhook(db, payload)
    assert r1["status"] == "processed"

    r2 = await transaction_service.handle_webhook(db, payload)
    assert r2["status"] == "duplicate_ignored"
    assert r1["transaction_id"] == r2["transaction_id"]

    count = (await db.execute(select(func.count()).select_from(Transaction))).scalar_one()
    assert count == 1


@pytest.mark.asyncio
async def test_webhook_writes_audit_log_for_both_create_and_duplicate(db_session):
    db = db_session
    user = await _make_user(db)
    payload = {
        "event_id": "evt_audit_1", "order_id": "ORD-2", "user_id": user.id,
        "payment_mode": "Card", "amount": 1200.0, "status": "success", "raw": {"x": 1},
    }
    await transaction_service.handle_webhook(db, payload)
    await transaction_service.handle_webhook(db, payload)  # duplicate

    logs = (await db.execute(select(AuditLog))).scalars().all()
    event_types = sorted(l.event_type for l in logs)
    assert event_types == ["created", "duplicate_webhook_ignored"]


@pytest.mark.asyncio
async def test_different_event_ids_create_separate_transactions(db_session):
    db = db_session
    user = await _make_user(db)
    for i in range(3):
        await transaction_service.handle_webhook(db, {
            "event_id": f"evt_{i}", "order_id": f"ORD-{i}", "user_id": user.id,
            "payment_mode": "UPI", "amount": 100.0, "status": "success", "raw": {},
        })
    count = (await db.execute(select(func.count()).select_from(Transaction))).scalar_one()
    assert count == 3


@pytest.mark.asyncio
async def test_pagination_and_filtering(db_session):
    db = db_session
    user = await _make_user(db)
    for i in range(25):
        await transaction_service.handle_webhook(db, {
            "event_id": f"evt_page_{i}", "order_id": f"ORD-P{i}", "user_id": user.id,
            "payment_mode": "UPI" if i % 2 == 0 else "Card",
            "amount": 100.0, "status": "success", "raw": {},
        })

    page1, total = await transaction_service.list_transactions(db, user.id, page=1, page_size=10)
    assert total == 25
    assert len(page1) == 10

    page3, total3 = await transaction_service.list_transactions(db, user.id, page=3, page_size=10)
    assert len(page3) == 5  # remainder

    upi_only, upi_total = await transaction_service.list_transactions(
        db, user.id, page=1, page_size=100, payment_mode="UPI"
    )
    assert upi_total == 13  # i=0,2,4,...,24 -> 13 even indices


@pytest.mark.asyncio
async def test_sort_by_amount_ascending(db_session):
    db = db_session
    user = await _make_user(db)
    await _seed_webhooks(db, user, [("a", "UPI", 300.0), ("b", "UPI", 100.0), ("c", "UPI", 200.0)])
    rows, _ = await transaction_service.list_transactions(
        db, user.id, page=1, page_size=100, sort_by="amount", sort_dir="asc"
    )
    amounts = [float(r.amount) for r in rows]
    assert amounts == [100.0, 200.0, 300.0]


@pytest.mark.asyncio
async def test_unsafe_sort_by_falls_back_to_created_at(db_session):
    """An unwhitelisted sort_by (sensitive column or a non-column attribute
    like 'metadata') must not raise -- it falls back to created_at."""
    db = db_session
    user = await _make_user(db)
    await _seed_webhooks(db, user, [("x", "UPI", 100.0), ("y", "Card", 200.0)])
    for bad in ("idempotency_key", "gateway_payload", "metadata", "__table__", "does_not_exist"):
        rows, total = await transaction_service.list_transactions(
            db, user.id, page=1, page_size=100, sort_by=bad
        )
        assert total == 2  # no 500 / no exception, query still runs


@pytest.mark.asyncio
async def test_csv_export_honors_payment_mode_filter(db_session):
    db = db_session
    user = await _make_user(db)
    await _seed_webhooks(db, user, [
        ("u1", "UPI", 100.0), ("c1", "Card", 200.0), ("u2", "UPI", 150.0),
    ])
    chunks = [c async for c in csv_export_generator(db, user.id, payment_mode="UPI")]
    content = "".join(chunks)
    lines = [ln for ln in content.splitlines() if ln.strip()]
    # header + exactly the 2 UPI rows (Card row excluded)
    assert lines[0].startswith("invoice_number,")
    data_lines = lines[1:]
    assert len(data_lines) == 2
    assert all(",UPI," in ln for ln in data_lines)
    assert not any(",Card," in ln for ln in data_lines)


@pytest.mark.asyncio
async def test_pdf_receipt_is_valid_and_named_by_invoice(db_session):
    db = db_session
    user = await _make_user(db)
    await _seed_webhooks(db, user, [("pdf", "UPI", 999.0)])
    txn = (await db.execute(select(Transaction))).scalars().one()
    pdf = generate_receipt_pdf(txn)
    assert isinstance(pdf, bytes)
    assert pdf.startswith(b"%PDF")   # well-formed PDF
    assert len(pdf) > 500
    assert txn.invoice_number.startswith("INV-")  # unique invoice identifier present

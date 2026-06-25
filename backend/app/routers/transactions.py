import hashlib
import hmac
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Header
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.core.deps import get_current_user
from app.config import settings
from app.services import transaction_service, order_tracking
from app.services.export_service import csv_export_generator, generate_receipt_pdf

router = APIRouter(prefix="/transactions", tags=["transactions"])


class WebhookPayload(BaseModel):
    """Shape of an incoming payment-gateway webhook. Validating it here means
    a malformed body returns a clean 422 instead of 500-ing on a missing key
    deep in the service layer."""
    event_id: str
    order_id: str
    user_id: int
    payment_mode: str
    amount: float
    status: str
    raw: dict = {}


def _serialize(t):
    # Storefront orders snapshot their purchased line items into
    # gateway_payload["items"]; webhook-created transactions won't have them.
    payload = t.gateway_payload if isinstance(t.gateway_payload, dict) else {}
    items = payload.get("items", [])
    return {
        "id": t.id, "invoice_number": t.invoice_number, "order_id": t.order_id,
        "payment_mode": t.payment_mode, "amount": float(t.amount), "currency": t.currency,
        "status": t.status.value, "created_at": t.created_at,
        "items": items, "item_count": sum(i.get("quantity", 0) for i in items),
        "subtotal": payload.get("subtotal"), "discount": payload.get("discount", 0),
        "coupon": payload.get("coupon"),
        "tracking": order_tracking.tracking_for(t.created_at, t.status),
    }


@router.get("")
async def list_my_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1),
    status: str | None = None,
    payment_mode: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    page_size = min(page_size, settings.MAX_PAGE_SIZE)
    rows, total = await transaction_service.list_transactions(
        db, user.id, page=page, page_size=page_size, status=status,
        payment_mode=payment_mode, date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_dir=sort_dir,
    )
    return {
        "items": [_serialize(r) for r in rows],
        "page": page, "page_size": page_size, "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/export.csv")
async def export_csv(
    status: str | None = None,
    payment_mode: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Streams rows as they're read from the DB cursor rather than building
    the full CSV string in memory first -- safe for 10,000+ row exports.
    Accepts the same filters as the list view so the export matches exactly
    what the user is looking at."""
    generator = csv_export_generator(
        db, user.id, status=status, payment_mode=payment_mode,
        date_from=date_from, date_to=date_to,
    )
    return StreamingResponse(
        generator,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=transactions.csv"},
    )


@router.get("/{transaction_id}/receipt.pdf")
async def download_receipt(transaction_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    from app.models.transaction import Transaction
    txn = await db.get(Transaction, transaction_id)
    if txn is None or txn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Transaction not found")
    pdf_bytes = generate_receipt_pdf(txn)
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={txn.invoice_number}.pdf"},
    )


@router.post("/webhook")
async def payment_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_webhook_signature: str | None = Header(default=None),
):
    """
    Payment-gateway webhook receiver. No `get_current_user` dependency --
    gateways call this server-to-server, not as a logged-in user. Instead,
    when WEBHOOK_SIGNING_SECRET is configured, every request must carry a
    valid HMAC-SHA256 signature of the raw body (the standard way gateways
    like Stripe/Razorpay authenticate webhooks). The secret is empty in dev
    so local testing needs no signing, but it MUST be set in production.
    """
    body = await request.body()

    secret = settings.WEBHOOK_SIGNING_SECRET
    if secret:
        if not x_webhook_signature:
            raise HTTPException(status_code=401, detail="Missing webhook signature")
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        # constant-time compare to avoid leaking the signature via timing
        if not hmac.compare_digest(expected, x_webhook_signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = WebhookPayload.model_validate_json(body)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())

    try:
        return await transaction_service.handle_webhook(db, payload.model_dump())
    except ValueError as e:
        # e.g. an unrecognised status value that isn't a TransactionStatus
        raise HTTPException(status_code=422, detail=str(e))

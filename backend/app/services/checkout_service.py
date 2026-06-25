"""
Storefront checkout (the "purchase" + fake payment step).

This bridges Feature 5 (cart) and Feature 4 (transactions): it validates the
active cart against live product state, then -- on a successful (simulated)
payment -- records a Transaction as the order-of-record, snapshots the
purchased line items into its gateway_payload (so "My Orders" can show what
was bought), decrements stock, writes the audit trail, and empties the
active cart. Saved-for-later items are left untouched.

The payment itself is a FAKE gateway: no real charge happens. The frontend
collects dummy card/UPI details and this endpoint just marks the order paid,
which is appropriate for a college project. To plug in a real gateway later,
this is where you'd create a pending payment and let the existing
/transactions/webhook flow finalize it.
"""
import uuid
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.cart import CartItem, CartStatus
from app.models.product import Product
from app.models.transaction import Transaction, AuditLog, TransactionStatus
from app.services import cart_service, transaction_service, coupon_service

VALID_PAYMENT_MODES = {"Card", "UPI", "NetBanking", "Cash on Delivery"}


class CheckoutError(Exception):
    """Raised when the cart can't be checked out (empty, or items out of
    stock / discontinued). Carries the validation report for the client."""
    def __init__(self, report: dict):
        self.report = report
        super().__init__("Checkout validation failed")


async def checkout(db: AsyncSession, user_id: int, payment_mode: str = "Card", coupon_code: str | None = None) -> Transaction:
    if payment_mode not in VALID_PAYMENT_MODES:
        payment_mode = "Card"

    report = await cart_service.validate_checkout(db, user_id)
    items = await cart_service.get_cart(db, user_id, CartStatus.ACTIVE)
    if not items:
        raise CheckoutError({**report, "can_checkout": False, "reason": "Your bag is empty."})
    if not report["can_checkout"]:
        raise CheckoutError(report)

    # Build the line-item snapshot from live product data and reduce stock.
    snapshot = []
    subtotal = 0.0
    for item in items:
        product = await db.get(Product, item.product_id)
        line_total = float(product.price) * item.quantity
        subtotal += line_total
        snapshot.append({
            "product_id": product.id,
            "name": product.name,
            "brand": product.brand,
            "image_url": product.image_url,
            "quantity": item.quantity,
            "unit_price": float(product.price),
            "line_total": round(line_total, 2),
        })
        product.stock = max(0, product.stock - item.quantity)

    subtotal = round(subtotal, 2)

    # Apply a coupon if one was provided and valid; otherwise ignore it
    # silently (the UI validates separately, so we don't fail checkout on it).
    discount = 0.0
    coupon_info = None
    if coupon_code:
        try:
            result = await coupon_service.compute_discount(db, coupon_code, subtotal)
            discount = result["discount"]
            coupon_info = {"code": result["code"], "discount": discount}
        except coupon_service.CouponError:
            discount, coupon_info = 0.0, None

    final_amount = round(subtotal - discount, 2)

    payload = {"gateway": "fake-demo", "items": snapshot, "subtotal": subtotal, "discount": discount}
    if coupon_info:
        payload["coupon"] = coupon_info

    txn = Transaction(
        user_id=user_id,
        order_id=f"ORD-{uuid.uuid4().hex[:10].upper()}",
        idempotency_key=f"checkout-{uuid.uuid4().hex}",
        invoice_number=transaction_service.generate_invoice_number(),
        payment_mode=payment_mode,
        amount=final_amount,
        status=TransactionStatus.SUCCESS,
        gateway_payload=payload,
    )
    db.add(txn)
    await db.flush()  # assign txn.id for the audit row

    db.add(AuditLog(
        transaction_id=txn.id,
        event_type="created",
        payload={"source": "storefront_checkout", "item_count": len(snapshot),
                 "subtotal": subtotal, "discount": discount, "amount": final_amount,
                 "coupon": coupon_info["code"] if coupon_info else None},
    ))

    # Empty the active cart; saved-for-later survives.
    await db.execute(
        delete(CartItem).where(CartItem.user_id == user_id, CartItem.status == CartStatus.ACTIVE)
    )
    await db.commit()
    return txn

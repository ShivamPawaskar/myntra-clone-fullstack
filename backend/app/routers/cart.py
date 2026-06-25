from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.core.deps import get_current_user
from app.models.cart import CartStatus
from app.services import cart_service, checkout_service, coupon_service
from app.services.order_tracking import tracking_for

router = APIRouter(prefix="/cart", tags=["cart"])


class AddItemRequest(BaseModel):
    product_id: int
    quantity: int = 1


class UpdateQuantityRequest(BaseModel):
    quantity: int
    version: int


class VersionedRequest(BaseModel):
    version: int


class CheckoutRequest(BaseModel):
    payment_mode: str = "Card"
    coupon_code: str | None = None


class CouponRequest(BaseModel):
    code: str


def _serialize(item):
    return {
        "id": item.id, "product_id": item.product_id, "quantity": item.quantity,
        "status": item.status.value, "price_snapshot": float(item.price_snapshot),
        "version": item.version, "updated_at": item.updated_at,
    }


@router.get("")
async def view_cart(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    active = await cart_service.get_cart(db, user.id, CartStatus.ACTIVE)
    saved = await cart_service.get_cart(db, user.id, CartStatus.SAVED)
    # Only ACTIVE items contribute to the total, per requirement.
    total = sum(float(i.price_snapshot) * i.quantity for i in active)
    return {
        "active": [_serialize(i) for i in active],
        "saved_for_later": [_serialize(i) for i in saved],
        "total": round(total, 2),
    }


@router.post("/items")
async def add_item(payload: AddItemRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    try:
        item = await cart_service.add_or_update_item(db, user.id, payload.product_id, payload.quantity)
    except cart_service.OutOfStockError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except cart_service.ProductDiscontinuedError as e:
        raise HTTPException(status_code=410, detail=str(e))
    except cart_service.CartConflictError as e:
        # Only reached if the bounded internal retry budget is exhausted.
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize(item)


@router.patch("/items/{item_id}")
async def update_quantity(item_id: int, payload: UpdateQuantityRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    try:
        item = await cart_service.update_quantity(db, user.id, item_id, payload.version, payload.quantity)
    except cart_service.CartConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except cart_service.OutOfStockError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except cart_service.ProductDiscontinuedError as e:
        raise HTTPException(status_code=410, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _serialize(item)


@router.post("/items/{item_id}/save-for-later")
async def save_for_later(item_id: int, payload: VersionedRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    try:
        item = await cart_service.move_to_saved(db, user.id, item_id, payload.version)
    except cart_service.CartConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _serialize(item)


@router.post("/items/{item_id}/move-to-cart")
async def move_to_cart(item_id: int, payload: VersionedRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    try:
        item = await cart_service.move_to_active(db, user.id, item_id, payload.version)
    except cart_service.CartConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except cart_service.OutOfStockError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except cart_service.ProductDiscontinuedError as e:
        raise HTTPException(status_code=410, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _serialize(item)


@router.delete("/items/{item_id}")
async def remove_item(item_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    try:
        await cart_service.remove_item(db, user.id, item_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "removed"}


@router.get("/validate-checkout")
async def validate_checkout(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    return await cart_service.validate_checkout(db, user.id)


@router.post("/preview-coupon")
async def preview_coupon(payload: CouponRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Validate a coupon against the user's current active-cart subtotal and
    return the discount, so the checkout page can show it before paying."""
    report = await cart_service.validate_checkout(db, user.id)
    try:
        result = await coupon_service.compute_discount(db, payload.code, report["subtotal"])
    except coupon_service.CouponError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/checkout")
async def checkout(payload: CheckoutRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """Place the order: process the (fake) payment, record the transaction,
    decrement stock, and empty the active bag. Returns the created order."""
    try:
        txn = await checkout_service.checkout(db, user.id, payload.payment_mode, payload.coupon_code)
    except checkout_service.CheckoutError as e:
        # 409: the cart changed / is empty since the user opened checkout.
        raise HTTPException(status_code=409, detail=e.report)
    p = txn.gateway_payload if isinstance(txn.gateway_payload, dict) else {}
    return {
        "id": txn.id,
        "order_id": txn.order_id,
        "invoice_number": txn.invoice_number,
        "payment_mode": txn.payment_mode,
        "amount": float(txn.amount),
        "subtotal": p.get("subtotal", float(txn.amount)),
        "discount": p.get("discount", 0),
        "coupon": p.get("coupon"),
        "currency": txn.currency,
        "status": txn.status.value,
        "created_at": txn.created_at,
        "items": p.get("items", []),
        "tracking": tracking_for(txn.created_at, txn.status),
    }

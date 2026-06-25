"""
Promo-code validation and discount calculation, shared by the checkout
preview (so the UI can show the discount before paying) and the actual
checkout (so the charged amount reflects it).
"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.coupon import Coupon, DiscountType


class CouponError(Exception):
    """Coupon couldn't be applied (unknown code, inactive, or min not met)."""


async def compute_discount(db: AsyncSession, code: str, subtotal: float) -> dict:
    """Validate `code` against `subtotal` and return the discount breakdown.
    Raises CouponError with a user-facing message if it can't be applied."""
    norm = (code or "").strip().upper()
    if not norm:
        raise CouponError("Enter a coupon code")

    coupon = (
        await db.execute(
            select(Coupon).where(func.upper(Coupon.code) == norm, Coupon.is_active == True)  # noqa: E712
        )
    ).scalar_one_or_none()
    if coupon is None:
        raise CouponError("Invalid or expired coupon code")
    if subtotal < float(coupon.min_order_amount):
        raise CouponError(f"Add items worth ₹{float(coupon.min_order_amount):.0f}+ to use this code")

    if coupon.discount_type == DiscountType.PERCENT:
        discount = subtotal * float(coupon.discount_value) / 100.0
    else:
        discount = float(coupon.discount_value)
    discount = round(min(discount, subtotal), 2)  # never exceed the subtotal

    return {
        "code": coupon.code,
        "description": coupon.description,
        "discount": discount,
        "final_amount": round(subtotal - discount, 2),
    }

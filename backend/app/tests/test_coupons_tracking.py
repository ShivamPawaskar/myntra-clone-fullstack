import pytest
from datetime import timedelta
from app.models.user import User, utcnow
from app.models.coupon import Coupon, DiscountType
from app.models.transaction import TransactionStatus
from app.core.security import hash_password
from app.services import coupon_service
from app.services.order_tracking import tracking_for


async def _coupons(db):
    db.add_all([
        Coupon(code="SAVE10", discount_type=DiscountType.PERCENT, discount_value=10, min_order_amount=500, description="10% off", is_active=True),
        Coupon(code="FLAT200", discount_type=DiscountType.FLAT, discount_value=200, min_order_amount=1000, description="flat 200", is_active=True),
        Coupon(code="OLD", discount_type=DiscountType.PERCENT, discount_value=50, min_order_amount=0, description="x", is_active=False),
    ])
    await db.commit()


@pytest.mark.asyncio
async def test_percent_coupon(db_session):
    await _coupons(db_session)
    r = await coupon_service.compute_discount(db_session, "save10", 1000)  # case-insensitive
    assert r["discount"] == 100.0
    assert r["final_amount"] == 900.0


@pytest.mark.asyncio
async def test_flat_coupon(db_session):
    await _coupons(db_session)
    r = await coupon_service.compute_discount(db_session, "FLAT200", 1500)
    assert r["discount"] == 200.0 and r["final_amount"] == 1300.0


@pytest.mark.asyncio
async def test_minimum_order_enforced(db_session):
    await _coupons(db_session)
    with pytest.raises(coupon_service.CouponError):
        await coupon_service.compute_discount(db_session, "FLAT200", 800)  # below ₹1000 min


@pytest.mark.asyncio
async def test_invalid_and_inactive_rejected(db_session):
    await _coupons(db_session)
    with pytest.raises(coupon_service.CouponError):
        await coupon_service.compute_discount(db_session, "NOPE", 1000)
    with pytest.raises(coupon_service.CouponError):
        await coupon_service.compute_discount(db_session, "OLD", 1000)  # inactive


@pytest.mark.asyncio
async def test_discount_never_exceeds_subtotal(db_session):
    db_session.add(Coupon(code="HUGE", discount_type=DiscountType.FLAT, discount_value=9999, min_order_amount=0, is_active=True))
    await db_session.commit()
    r = await coupon_service.compute_discount(db_session, "HUGE", 300)
    assert r["discount"] == 300.0 and r["final_amount"] == 0.0


def test_tracking_new_order_is_placed():
    t = tracking_for(utcnow(), TransactionStatus.SUCCESS)
    assert t["current"] == 0
    assert [s["label"] for s in t["stages"]][0] == "Order Placed"
    assert t["stages"][0]["done"] is True
    assert t["stages"][-1]["done"] is False  # not delivered yet


def test_tracking_old_order_is_delivered():
    t = tracking_for(utcnow() - timedelta(days=5), TransactionStatus.SUCCESS)
    assert t["current"] == len(t["stages"]) - 1
    assert all(s["done"] for s in t["stages"])


def test_tracking_failed_and_refunded_have_no_timeline():
    assert tracking_for(utcnow(), TransactionStatus.FAILED)["note"] == "Payment failed"
    assert tracking_for(utcnow(), TransactionStatus.REFUNDED)["note"] == "Order refunded"

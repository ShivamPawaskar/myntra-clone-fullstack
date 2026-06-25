import pytest
from app.models.user import User
from app.models.product import Product, Category
from app.models.transaction import Transaction, TransactionStatus
from app.core.security import hash_password
from app.services import review_service


async def _user_and_product(db):
    cat = Category(name="Footwear")
    db.add(cat)
    await db.commit()
    user = User(email="rev@test.com", name="Reviewer", hashed_password=hash_password("x"))
    product = Product(name="Nike Runner", brand="Nike", category_id=cat.id, price=2999, stock=10, is_active=True)
    db.add_all([user, product])
    await db.commit()
    return user, product


@pytest.mark.asyncio
async def test_review_without_purchase_is_unverified(db_session):
    db = db_session
    user, product = await _user_and_product(db)
    r = await review_service.upsert_review(db, user.id, product.id, 4, "Nice", "Comfortable shoes")
    assert r.verified_purchase is False
    assert r.rating == 4


@pytest.mark.asyncio
async def test_review_after_purchase_is_verified(db_session):
    db = db_session
    user, product = await _user_and_product(db)
    # a successful order that includes this product
    db.add(Transaction(
        user_id=user.id, order_id="ORD-1", idempotency_key="k1", invoice_number="INV-1",
        payment_mode="Card", amount=2999, status=TransactionStatus.SUCCESS,
        gateway_payload={"items": [{"product_id": product.id, "quantity": 1}]},
    ))
    await db.commit()
    r = await review_service.upsert_review(db, user.id, product.id, 5, "Love it", "Worth it")
    assert r.verified_purchase is True


@pytest.mark.asyncio
async def test_resubmitting_updates_not_duplicates(db_session):
    db = db_session
    user, product = await _user_and_product(db)
    await review_service.upsert_review(db, user.id, product.id, 3, "ok", "meh")
    await review_service.upsert_review(db, user.id, product.id, 5, "changed mind", "great")
    summary = await review_service.get_product_reviews(db, product.id)
    assert summary["count"] == 1            # updated, not duplicated
    assert summary["average"] == 5.0
    assert summary["reviews"][0]["title"] == "changed mind"


@pytest.mark.asyncio
async def test_review_summary_aggregates(db_session):
    db = db_session
    cat = Category(name="C")
    db.add(cat)
    await db.commit()
    product = Product(name="P", brand="B", category_id=cat.id, price=100, stock=5, is_active=True)
    users = [User(email=f"u{i}@t.com", name=f"U{i}", hashed_password=hash_password("x")) for i in range(3)]
    db.add(product)
    db.add_all(users)
    await db.commit()
    for u, rating in zip(users, [5, 4, 3]):
        await review_service.upsert_review(db, u.id, product.id, rating, "", "")
    summary = await review_service.get_product_reviews(db, product.id)
    assert summary["count"] == 3
    assert summary["average"] == 4.0
    assert summary["distribution"][5] == 1 and summary["distribution"][3] == 1


@pytest.mark.asyncio
async def test_invalid_rating_rejected(db_session):
    db = db_session
    user, product = await _user_and_product(db)
    for bad in (0, 6, -1):
        with pytest.raises(ValueError):
            await review_service.upsert_review(db, user.id, product.id, bad, "", "")

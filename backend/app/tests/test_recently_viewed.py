import pytest
from datetime import datetime, timedelta
from app.models.user import User
from app.models.product import Product, Category
from app.core.security import hash_password
from app.services import recently_viewed_service


def _naive(dt):
    """Drop tzinfo for comparison. The viewed_at column is timezone-aware, so
    Postgres returns aware datetimes while SQLite returns naive ones — compare
    the wall-clock instant either way."""
    return dt.replace(tzinfo=None) if dt and dt.tzinfo else dt


async def _make_user_and_products(db, n=25):
    cat = Category(name="Test")
    db.add(cat)
    await db.commit()
    user = User(email="rv@test.com", name="RV", hashed_password=hash_password("x"))
    db.add(user)
    products = [Product(name=f"P{i}", category_id=cat.id, price=100, stock=10) for i in range(n)]
    db.add_all(products)
    await db.commit()
    return user, products


@pytest.mark.asyncio
async def test_viewing_same_product_twice_does_not_duplicate(db_session):
    db = db_session
    user, products = await _make_user_and_products(db, n=3)
    await recently_viewed_service.record_view(db, user.id, products[0].id)
    await recently_viewed_service.record_view(db, user.id, products[0].id)
    items = await recently_viewed_service.get_recent(db, user.id)
    assert len(items) == 1


@pytest.mark.asyncio
async def test_cap_enforced_at_20(db_session):
    db = db_session
    user, products = await _make_user_and_products(db, n=25)
    for p in products:
        await recently_viewed_service.record_view(db, user.id, p.id)
    items = await recently_viewed_service.get_recent(db, user.id, limit=100)
    assert len(items) == 20
    # the most recently viewed (last 20 in insertion order) should be the ones kept
    kept_ids = {i.product_id for i in items}
    expected_ids = {p.id for p in products[5:]}
    assert kept_ids == expected_ids


@pytest.mark.asyncio
async def test_reviewing_bumps_to_most_recent(db_session):
    db = db_session
    user, products = await _make_user_and_products(db, n=3)
    for p in products:
        await recently_viewed_service.record_view(db, user.id, p.id)
    # re-view the first product -> should now be most recent
    await recently_viewed_service.record_view(db, user.id, products[0].id)
    items = await recently_viewed_service.get_recent(db, user.id)
    assert items[0].product_id == products[0].id


@pytest.mark.asyncio
async def test_merge_local_history_newest_wins(db_session):
    """If the server already has a view at T1 for a product, and the
    client's local (anonymous) history has a NEWER view at T2 for the same
    product, the merge must keep T2 (most-recent-wins), not T1."""
    db = db_session
    user, products = await _make_user_and_products(db, n=2)
    old_time = datetime(2026, 1, 1, 10, 0, 0)
    await recently_viewed_service.record_view(db, user.id, products[0].id, viewed_at=old_time)

    newer_time = datetime(2026, 1, 1, 12, 0, 0)
    await recently_viewed_service.merge_local_history(db, user.id, [
        {"product_id": products[0].id, "viewed_at": newer_time},
        {"product_id": products[1].id, "viewed_at": newer_time},
    ])

    items = await recently_viewed_service.get_recent(db, user.id)
    item0 = next(i for i in items if i.product_id == products[0].id)
    assert _naive(item0.viewed_at) == newer_time
    assert len(items) == 2  # no duplicate row created for products[0]


@pytest.mark.asyncio
async def test_merge_local_history_does_not_overwrite_with_older_timestamp(db_session):
    db = db_session
    user, products = await _make_user_and_products(db, n=1)
    newer_time = datetime(2026, 1, 1, 12, 0, 0)
    await recently_viewed_service.record_view(db, user.id, products[0].id, viewed_at=newer_time)

    older_time = datetime(2026, 1, 1, 8, 0, 0)
    await recently_viewed_service.merge_local_history(db, user.id, [
        {"product_id": products[0].id, "viewed_at": older_time},
    ])

    items = await recently_viewed_service.get_recent(db, user.id)
    assert _naive(items[0].viewed_at) == newer_time  # unchanged, server's view was newer

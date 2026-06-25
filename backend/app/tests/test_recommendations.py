import pytest
from datetime import timedelta
from sqlalchemy import select, func, text
from app.models.user import User, utcnow
from app.models.product import Product, Category
from app.models.recently_viewed import Wishlist, BrowsingHistory
from app.core.security import hash_password
from app.config import settings
from app.services.recommendation_service import (
    get_recommendations, RECOMMENDATION_SQL_SQLITE,
)
from app.services import browsing_history_service


@pytest.mark.asyncio
async def test_cold_start_falls_back_to_popularity(db_session):
    """A brand-new user with empty wishlist and empty browsing history has
    no category/wishlist-overlap/brand signal at all -- the engine must
    still return results, degrading gracefully to pure popularity rather
    than an empty list."""
    db = db_session
    cat = Category(name="Cat")
    db.add(cat)
    await db.commit()
    user = User(email="cold@test.com", name="Cold", hashed_password=hash_password("x"))
    db.add(user)
    products = [
        Product(name=f"P{i}", category_id=cat.id, price=100, stock=10, popularity_score=i * 10, is_active=True)
        for i in range(10)
    ]
    db.add_all(products)
    await db.commit()

    recs = await get_recommendations(db, user.id)
    assert len(recs) > 0
    # Highest popularity product should rank first when it's the only signal
    assert recs[0]["id"] == products[-1].id


@pytest.mark.asyncio
async def test_wishlist_overlap_signal_surfaces_similar_users_items(db_session):
    db = db_session
    cat = Category(name="Cat")
    db.add(cat)
    await db.commit()
    user1 = User(email="u1@test.com", name="U1", hashed_password=hash_password("x"))
    user2 = User(email="u2@test.com", name="U2", hashed_password=hash_password("x"))
    db.add_all([user1, user2])
    shared = Product(name="Shared", category_id=cat.id, price=100, stock=10, is_active=True)
    unique_to_u2 = Product(name="UniqueU2", category_id=cat.id, price=100, stock=10, is_active=True)
    db.add_all([shared, unique_to_u2])
    await db.commit()

    db.add_all([
        Wishlist(user_id=user1.id, product_id=shared.id),
        Wishlist(user_id=user2.id, product_id=shared.id),
        Wishlist(user_id=user2.id, product_id=unique_to_u2.id),
    ])
    await db.commit()

    recs = await get_recommendations(db, user1.id)
    rec_ids = {r["id"] for r in recs}
    assert unique_to_u2.id in rec_ids


@pytest.mark.asyncio
async def test_already_browsed_products_excluded(db_session):
    db = db_session
    cat = Category(name="Cat")
    db.add(cat)
    await db.commit()
    user = User(email="browsed@test.com", name="B", hashed_password=hash_password("x"))
    db.add(user)
    p1 = Product(name="P1", category_id=cat.id, price=100, stock=10, popularity_score=999, is_active=True)
    db.add(p1)
    await db.commit()
    db.add(BrowsingHistory(user_id=user.id, product_id=p1.id, viewed_at=utcnow(), expires_at=utcnow() + timedelta(days=30)))
    await db.commit()

    recs = await get_recommendations(db, user.id)
    rec_ids = {r["id"] for r in recs}
    assert p1.id not in rec_ids


@pytest.mark.asyncio
async def test_out_of_stock_products_excluded(db_session):
    db = db_session
    cat = Category(name="Cat")
    db.add(cat)
    await db.commit()
    user = User(email="oos@test.com", name="O", hashed_password=hash_password("x"))
    db.add(user)
    oos_product = Product(name="OOS", category_id=cat.id, price=100, stock=0, popularity_score=999, is_active=True)
    db.add(oos_product)
    await db.commit()

    recs = await get_recommendations(db, user.id)
    rec_ids = {r["id"] for r in recs}
    assert oos_product.id not in rec_ids


@pytest.mark.asyncio
async def test_category_similarity_signal_recommends_same_category(db_session):
    """Viewing a product should surface OTHER in-stock products from the
    same category, ranked above an unrelated-category product that only has
    the popularity fallback signal."""
    db = db_session
    cat_a, cat_b = Category(name="A"), Category(name="B")
    db.add_all([cat_a, cat_b])
    await db.commit()
    user = User(email="catsig@test.com", name="C", hashed_password=hash_password("x"))
    db.add(user)
    browsed = Product(name="Browsed", category_id=cat_a.id, price=100, stock=10, is_active=True)
    same_cat = Product(name="SameCat", category_id=cat_a.id, price=100, stock=10, popularity_score=5, is_active=True)
    other_cat = Product(name="OtherCat", category_id=cat_b.id, price=100, stock=10, popularity_score=5, is_active=True)
    db.add_all([browsed, same_cat, other_cat])
    await db.commit()

    await browsing_history_service.record_browsing_event(db, user.id, browsed.id)

    recs = await get_recommendations(db, user.id)
    rec_ids = [r["id"] for r in recs]
    assert browsed.id not in rec_ids               # already viewed -> excluded
    assert same_cat.id in rec_ids                  # category signal surfaces it
    # category signal (3.0) + popularity (1.0) outranks popularity-only (1.0)
    assert rec_ids.index(same_cat.id) < rec_ids.index(other_cat.id)


@pytest.mark.asyncio
async def test_browsing_history_capped_at_50_unique(db_session):
    """record_browsing_event must keep only the most recent
    BROWSING_HISTORY_MAX_ITEMS rows, dropping the oldest."""
    db = db_session
    cat = Category(name="Cap")
    db.add(cat)
    await db.commit()
    user = User(email="cap@test.com", name="Cap", hashed_password=hash_password("x"))
    db.add(user)
    cap = settings.BROWSING_HISTORY_MAX_ITEMS
    products = [Product(name=f"P{i}", category_id=cat.id, price=10, stock=5) for i in range(cap + 5)]
    db.add_all(products)
    await db.commit()

    # Seed `cap` rows with strictly increasing timestamps (oldest first).
    base = utcnow() - timedelta(hours=1)
    for i in range(cap):
        db.add(BrowsingHistory(
            user_id=user.id, product_id=products[i].id,
            viewed_at=base + timedelta(seconds=i),
            expires_at=base + timedelta(days=30),
        ))
    await db.commit()

    # Record 5 brand-new views (newest) -> table would be cap+5, cap trims oldest 5.
    for i in range(cap, cap + 5):
        await browsing_history_service.record_browsing_event(db, user.id, products[i].id)

    total = (await db.execute(
        select(func.count()).select_from(BrowsingHistory).where(BrowsingHistory.user_id == user.id)
    )).scalar_one()
    assert total == cap

    remaining = (await db.execute(
        select(BrowsingHistory.product_id).where(BrowsingHistory.user_id == user.id)
    )).scalars().all()
    # the 5 oldest seeded products were evicted; the 5 newest are present
    assert products[0].id not in remaining
    assert products[cap + 4].id in remaining


@pytest.mark.asyncio
async def test_purge_expired_removes_only_outdated_rows(db_session):
    db = db_session
    cat = Category(name="Exp")
    db.add(cat)
    await db.commit()
    user = User(email="exp@test.com", name="Exp", hashed_password=hash_password("x"))
    db.add(user)
    fresh_p = Product(name="Fresh", category_id=cat.id, price=10, stock=5)
    stale_p = Product(name="Stale", category_id=cat.id, price=10, stock=5)
    db.add_all([fresh_p, stale_p])
    await db.commit()

    now = utcnow()
    db.add_all([
        BrowsingHistory(user_id=user.id, product_id=fresh_p.id, viewed_at=now, expires_at=now + timedelta(days=1)),
        BrowsingHistory(user_id=user.id, product_id=stale_p.id, viewed_at=now - timedelta(days=40), expires_at=now - timedelta(days=1)),
    ])
    await db.commit()

    deleted = await browsing_history_service.purge_expired(db)
    assert deleted == 1
    remaining = (await db.execute(
        select(BrowsingHistory.product_id).where(BrowsingHistory.user_id == user.id)
    )).scalars().all()
    assert remaining == [fresh_p.id]


@pytest.mark.asyncio
async def test_recommendation_query_uses_indexes(db_session):
    """The 'indexing is mandatory' requirement: EXPLAIN QUERY PLAN must show
    the recommendation query exercising indexes rather than only full scans.
    SQLite-specific syntax/output, so skipped on the Postgres CI leg."""
    if db_session.get_bind().dialect.name != "sqlite":
        pytest.skip("EXPLAIN QUERY PLAN / 'USING INDEX' is SQLite-specific")
    db = db_session
    cat = Category(name="Idx")
    db.add(cat)
    await db.commit()
    user = User(email="idx@test.com", name="Idx", hashed_password=hash_password("x"))
    db.add(user)
    products = [Product(name=f"P{i}", category_id=cat.id, price=10, stock=5, popularity_score=i) for i in range(10)]
    db.add_all(products)
    await db.commit()
    for p in products[:5]:
        db.add(BrowsingHistory(user_id=user.id, product_id=p.id, viewed_at=utcnow(), expires_at=utcnow() + timedelta(days=30)))
        db.add(Wishlist(user_id=user.id, product_id=p.id))
    await db.commit()

    explain_sql = text("EXPLAIN QUERY PLAN " + RECOMMENDATION_SQL_SQLITE.text)
    rows = (await db.execute(explain_sql, {"user_id": user.id, "limit": 20})).all()
    plan = " ".join(str(r) for r in rows)
    assert "USING INDEX" in plan        # the planner reaches for indexes, not pure scans

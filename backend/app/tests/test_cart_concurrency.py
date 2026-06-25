import pytest
from sqlalchemy import select
from app.models.user import User
from app.models.product import Product, Category
from app.models.cart import CartItem, CartStatus
from app.services import cart_service
from app.core.security import hash_password


async def _make_user_and_product(db, stock=10, price=499.0, is_active=True):
    cat = Category(name="Test")
    db.add(cat)
    await db.commit()
    user = User(email="u@test.com", name="U", hashed_password=hash_password("x"))
    product = Product(name="P", category_id=cat.id, price=price, stock=stock, is_active=is_active)
    db.add_all([user, product])
    await db.commit()
    return user, product


@pytest.mark.asyncio
async def test_optimistic_lock_conflict_on_stale_version(db_session):
    """Two 'devices' read the same cart item (version=1). Device A updates
    first and succeeds; Device B then tries to update using the now-stale
    version=1 and must be rejected with CartConflictError, not silently
    overwrite Device A's change."""
    db = db_session
    user, product = await _make_user_and_product(db)

    item = await cart_service.add_or_update_item(db, user.id, product.id, quantity=1)
    assert item.version == 1
    item_id = item.id  # capture before any rollback expires the instance

    # Device A updates using version=1 -> succeeds, version becomes 2
    updated = await cart_service.update_quantity(db, user.id, item_id, version=1, quantity=2)
    assert updated.version == 2
    assert updated.quantity == 2

    # Device B still thinks version is 1 -> must be rejected
    with pytest.raises(cart_service.CartConflictError):
        await cart_service.update_quantity(db, user.id, item_id, version=1, quantity=5)

    # Confirm Device A's update was NOT clobbered (fresh read after the
    # conflict rollback)
    from sqlalchemy import select
    from app.models.cart import CartItem
    result = await db.execute(select(CartItem).where(CartItem.id == item_id))
    final = result.scalar_one()
    assert final.quantity == 2
    assert final.version == 2


@pytest.mark.asyncio
async def test_out_of_stock_rejected(db_session):
    db = db_session
    user, product = await _make_user_and_product(db, stock=2)
    with pytest.raises(cart_service.OutOfStockError):
        await cart_service.add_or_update_item(db, user.id, product.id, quantity=5)


@pytest.mark.asyncio
async def test_discontinued_product_rejected(db_session):
    db = db_session
    user, product = await _make_user_and_product(db, is_active=False)
    with pytest.raises(cart_service.ProductDiscontinuedError):
        await cart_service.add_or_update_item(db, user.id, product.id, quantity=1)


@pytest.mark.asyncio
async def test_saved_items_excluded_from_active_total_and_checkout(db_session):
    db = db_session
    user, product = await _make_user_and_product(db, stock=10, price=200.0)
    item = await cart_service.add_or_update_item(db, user.id, product.id, quantity=2)
    await cart_service.move_to_saved(db, user.id, item.id, item.version)

    report = await cart_service.validate_checkout(db, user.id)
    assert report["subtotal"] == 0.0
    assert report["can_checkout"] is True


@pytest.mark.asyncio
async def test_price_change_detected_at_checkout(db_session):
    db = db_session
    user, product = await _make_user_and_product(db, stock=10, price=100.0)
    await cart_service.add_or_update_item(db, user.id, product.id, quantity=1)

    # Price changes after the item was added
    product.price = 150.0
    await db.commit()

    report = await cart_service.validate_checkout(db, user.id)
    assert len(report["price_changes"]) == 1
    assert report["price_changes"][0]["old_price"] == 100.0
    assert report["price_changes"][0]["new_price"] == 150.0


@pytest.mark.asyncio
async def test_increment_accumulates_within_stock(db_session):
    db = db_session
    user, product = await _make_user_and_product(db, stock=10)
    first = await cart_service.add_or_update_item(db, user.id, product.id, quantity=3)
    v1 = first.version                   # capture the int (the instance is mutated in place)
    second = await cart_service.add_or_update_item(db, user.id, product.id, quantity=4)
    assert second.quantity == 7          # 3 + 4 accumulated onto one line
    assert v1 == 1 and second.version == 2  # version bumped exactly once by the increment


@pytest.mark.asyncio
async def test_increment_cannot_exceed_stock(db_session):
    """Adding more to an existing active line must validate the RESULTING
    total against stock, not just the increment -- otherwise the active
    cart could be pushed past what's available."""
    db = db_session
    user, product = await _make_user_and_product(db, stock=10)
    await cart_service.add_or_update_item(db, user.id, product.id, quantity=8)
    # 8 already in cart; adding 5 would make 13 > 10 even though 5 < 10
    with pytest.raises(cart_service.OutOfStockError):
        await cart_service.add_or_update_item(db, user.id, product.id, quantity=5)
    # the existing line is unchanged
    item = (await db.execute(select(CartItem).where(CartItem.product_id == product.id))).scalar_one()
    assert item.quantity == 8


@pytest.mark.asyncio
async def test_add_retries_and_converges_on_version_conflict(db_session, monkeypatch):
    """A version-less add that loses an optimistic-lock race must retry
    internally and converge, not surface a conflict to the user."""
    db = db_session
    user, product = await _make_user_and_product(db, stock=10)
    await cart_service.add_or_update_item(db, user.id, product.id, quantity=2)

    real_update = cart_service._optimistic_update
    calls = {"n": 0}

    async def flaky_update(db_, item_id, version, **fields):
        calls["n"] += 1
        if calls["n"] == 1:
            raise cart_service.CartConflictError("simulated concurrent update")
        return await real_update(db_, item_id, version, **fields)

    monkeypatch.setattr(cart_service, "_optimistic_update", flaky_update)
    result = await cart_service.add_or_update_item(db, user.id, product.id, quantity=3)
    assert calls["n"] == 2               # one failure, then one success
    assert result.quantity == 5          # 2 + 3, no lost update


@pytest.mark.asyncio
async def test_add_raises_conflict_after_exhausting_retries(db_session, monkeypatch):
    db = db_session
    user, product = await _make_user_and_product(db, stock=10)
    await cart_service.add_or_update_item(db, user.id, product.id, quantity=1)

    async def always_conflict(db_, item_id, version, **fields):
        raise cart_service.CartConflictError("always conflicts")

    monkeypatch.setattr(cart_service, "_optimistic_update", always_conflict)
    with pytest.raises(cart_service.CartConflictError):
        await cart_service.add_or_update_item(db, user.id, product.id, quantity=1)


@pytest.mark.asyncio
async def test_save_for_later_round_trip(db_session):
    db = db_session
    user, product = await _make_user_and_product(db, stock=10, price=200.0)
    item = await cart_service.add_or_update_item(db, user.id, product.id, quantity=2)

    saved = await cart_service.move_to_saved(db, user.id, item.id, item.version)
    assert saved.status == CartStatus.SAVED
    active = await cart_service.get_cart(db, user.id, CartStatus.ACTIVE)
    saved_list = await cart_service.get_cart(db, user.id, CartStatus.SAVED)
    assert active == [] and len(saved_list) == 1

    back = await cart_service.move_to_active(db, user.id, saved.id, saved.version)
    assert back.status == CartStatus.ACTIVE
    report = await cart_service.validate_checkout(db, user.id)
    assert report["subtotal"] == 400.0   # 2 * 200, back in the active total

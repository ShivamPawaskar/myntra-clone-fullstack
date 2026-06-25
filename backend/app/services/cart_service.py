"""
Feature 5: Concurrency-safe cart with Save for Later.

Concurrency strategy: OPTIMISTIC LOCKING via a `version` integer column,
not pessimistic row locks (SELECT ... FOR UPDATE). Rationale: cart updates
are frequent but individually fast and conflicts are rare in practice (a
user rarely edits the same cart from two devices in the same second), so
optimistic locking avoids holding DB locks across network round trips and
works identically on SQLite (no FOR UPDATE support) and Postgres -- which
matters since this app targets both in dev and prod.

Every mutating function here takes the version the caller last read and
issues an UPDATE with `WHERE id = :id AND version = :expected_version`.
If the row was changed by another session in between, 0 rows match and we
raise CartConflictError, which the API layer turns into HTTP 409 so the
client can refetch and retry -- standard optimistic-concurrency pattern.
"""
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.cart import CartItem, CartStatus
from app.models.product import Product

# Bounded retries for the version-less add-to-cart path, so concurrent adds
# of the same product converge instead of surfacing an optimistic-lock
# conflict to a user who never supplied a version.
_MAX_ADD_RETRIES = 3


class CartConflictError(Exception):
    """Raised when an update's expected `version` no longer matches the row
    -- i.e. another device/session modified this cart item concurrently."""


class OutOfStockError(Exception):
    pass


class ProductDiscontinuedError(Exception):
    pass


async def get_cart(db: AsyncSession, user_id: int, status: CartStatus):
    result = await db.execute(
        select(CartItem).where(CartItem.user_id == user_id, CartItem.status == status)
    )
    return result.scalars().all()


async def add_or_update_item(
    db: AsyncSession, user_id: int, product_id: int, quantity: int
) -> CartItem:
    """Add a product to the active cart, or increment quantity if it's
    already there. Uses INSERT ... ON CONFLICT semantics emulated via a
    read-then-conditional-write inside a DB transaction block, so two
    concurrent "add to cart" calls for a brand-new cart line don't create
    two rows (the UniqueConstraint on (user_id, product_id) is the final
    backstop if both still race past the read).

    Add-to-cart is version-less from the client's perspective (the user
    just clicks "add"), so a lost optimistic-lock race against another
    device's concurrent add must NOT bubble up as a conflict the user has
    to resolve -- we re-read and retry internally a bounded number of times,
    so two simultaneous adds of the same product converge to the correct
    summed quantity instead of one of them 500-ing.
    """
    product = await db.get(Product, product_id)
    if product is None or not product.is_active:
        raise ProductDiscontinuedError(f"Product {product_id} is no longer available")
    if quantity <= 0:
        raise ValueError("Quantity must be positive")

    for _ in range(_MAX_ADD_RETRIES):
        result = await db.execute(
            select(CartItem).where(CartItem.user_id == user_id, CartItem.product_id == product_id)
        )
        item = result.scalar_one_or_none()

        if item is None:
            # Brand-new line. Validate the requested quantity against stock.
            if product.stock < quantity:
                raise OutOfStockError(f"Only {product.stock} left in stock")
            item = CartItem(
                user_id=user_id, product_id=product_id, quantity=quantity,
                status=CartStatus.ACTIVE, price_snapshot=product.price, version=1,
            )
            db.add(item)
            try:
                await db.commit()
            except Exception:
                # Lost the race to another concurrent "add" that inserted the
                # row first -- reload and retry through the update path.
                await db.rollback()
                continue
            return item

        # Existing line: an active add ACCUMULATES, a saved item being
        # re-added becomes active at the requested quantity. Validate the
        # RESULTING total (not just the increment) against stock, so an
        # active line can never be pushed past what's available.
        new_quantity = item.quantity + quantity if item.status == CartStatus.ACTIVE else quantity
        if product.stock < new_quantity:
            raise OutOfStockError(f"Only {product.stock} left in stock")
        try:
            return await _optimistic_update(
                db, item.id, item.version,
                quantity=new_quantity, status=CartStatus.ACTIVE, price_snapshot=product.price,
            )
        except CartConflictError:
            # Another device updated this line between our read and write.
            # Re-read and recompute rather than forcing the user to retry.
            continue

    raise CartConflictError("Cart is being updated concurrently; please retry.")


async def update_quantity(db: AsyncSession, user_id: int, item_id: int, version: int, quantity: int) -> CartItem:
    item = await _get_owned_item(db, user_id, item_id)
    product = await db.get(Product, item.product_id)
    if product is None or not product.is_active:
        raise ProductDiscontinuedError("This product has been discontinued")
    if quantity > product.stock:
        raise OutOfStockError(f"Only {product.stock} left in stock")
    return await _optimistic_update(db, item_id, version, quantity=quantity)


async def move_to_saved(db: AsyncSession, user_id: int, item_id: int, version: int) -> CartItem:
    await _get_owned_item(db, user_id, item_id)
    return await _optimistic_update(db, item_id, version, status=CartStatus.SAVED)


async def move_to_active(db: AsyncSession, user_id: int, item_id: int, version: int) -> CartItem:
    item = await _get_owned_item(db, user_id, item_id)
    product = await db.get(Product, item.product_id)
    if product is None or not product.is_active:
        raise ProductDiscontinuedError("This product has been discontinued")
    if product.stock < item.quantity:
        raise OutOfStockError(f"Only {product.stock} left in stock")
    return await _optimistic_update(db, item_id, version, status=CartStatus.ACTIVE)


async def remove_item(db: AsyncSession, user_id: int, item_id: int) -> None:
    item = await _get_owned_item(db, user_id, item_id)
    await db.delete(item)
    await db.commit()


async def _get_owned_item(db: AsyncSession, user_id: int, item_id: int) -> CartItem:
    item = await db.get(CartItem, item_id)
    if item is None or item.user_id != user_id:
        raise ValueError("Cart item not found")
    return item


async def _optimistic_update(db: AsyncSession, item_id: int, expected_version: int, **fields) -> CartItem:
    stmt = (
        update(CartItem)
        .where(CartItem.id == item_id, CartItem.version == expected_version)
        .values(**fields, version=CartItem.version + 1)
    )
    result = await db.execute(stmt)
    if result.rowcount == 0:
        await db.rollback()
        raise CartConflictError(
            "This item was updated elsewhere. Please refresh and try again."
        )
    await db.commit()
    return await db.get(CartItem, item_id)


async def validate_checkout(db: AsyncSession, user_id: int) -> dict:
    """
    Pre-checkout validation: re-checks every ACTIVE item against the live
    product row for (a) price changes since it was added to cart and
    (b) stock availability and (c) discontinued status. Only ACTIVE items
    are considered -- SAVED items never contribute to cart totals or
    checkout, per the requirement that the two be cleanly separated.
    Returns a structured report instead of throwing, since checkout should
    show the user what changed rather than just failing.
    """
    items = await get_cart(db, user_id, CartStatus.ACTIVE)
    price_changes, out_of_stock, discontinued = [], [], []
    subtotal = 0.0

    for item in items:
        product = await db.get(Product, item.product_id)
        if product is None or not product.is_active:
            discontinued.append({"item_id": item.id, "product_id": item.product_id})
            continue
        if product.stock < item.quantity:
            out_of_stock.append({
                "item_id": item.id, "product_id": item.product_id,
                "requested": item.quantity, "available": product.stock,
            })
            continue
        if float(product.price) != float(item.price_snapshot):
            price_changes.append({
                "item_id": item.id, "product_id": item.product_id,
                "old_price": float(item.price_snapshot), "new_price": float(product.price),
            })
        subtotal += float(product.price) * item.quantity

    return {
        "can_checkout": not (out_of_stock or discontinued),
        "subtotal": round(subtotal, 2),
        "price_changes": price_changes,
        "out_of_stock": out_of_stock,
        "discontinued": discontinued,
    }

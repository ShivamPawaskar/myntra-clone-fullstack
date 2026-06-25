"""
Feature 1: Hybrid Recently Viewed with Cross-Device Sync.

Design:
- The client (web/mobile) keeps a local copy (localStorage / AsyncStorage)
  for instant rendering with zero network latency.
- Every view also fires record_view() against the server so the server is
  always the source of truth for a logged-in user.
- Duplicate prevention is enforced by a UNIQUE(user_id, product_id)
  constraint at the DB level (see models/recently_viewed.py), so even if
  two devices record a view for the same product within milliseconds of
  each other, the database -- not application code -- guarantees only one
  row exists. We use an upsert (INSERT ... ON CONFLICT DO UPDATE) so this
  is race-safe without needing application-level locking.
- The 20-item cap is enforced immediately after every write by deleting
  rows ranked beyond 20 for that user, ordered by viewed_at descending.
  This keeps the table small per user and keeps "read my recent items"
  a simple indexed query with no extra filtering logic.
"""
from datetime import datetime, timezone
from sqlalchemy import select, delete
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.recently_viewed import RecentlyViewed
from app.config import settings


def _dialect_insert(db: AsyncSession):
    """Pick the right ON CONFLICT-capable insert() for whichever DB is active,
    so the exact same upsert logic works on SQLite (dev) and Postgres (prod)."""
    bind = db.get_bind()
    if bind.dialect.name == "postgresql":
        return pg_insert
    return sqlite_insert


async def record_view(db: AsyncSession, user_id: int, product_id: int, viewed_at: datetime | None = None) -> None:
    viewed_at = viewed_at or datetime.now(timezone.utc)
    insert_fn = _dialect_insert(db)
    stmt = insert_fn(RecentlyViewed).values(
        user_id=user_id, product_id=product_id, viewed_at=viewed_at, source="server"
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "product_id"],
        set_={"viewed_at": viewed_at},
    )
    await db.execute(stmt)
    # Enforce the cap in the SAME transaction as the upsert and commit once,
    # so a concurrent view from another device can't observe an intermediate
    # state where the row was inserted but the cap hasn't been applied yet.
    await _enforce_cap(db, user_id)
    await db.commit()


async def _enforce_cap(db: AsyncSession, user_id: int) -> None:
    """Keep only the most recent RECENTLY_VIEWED_MAX_ITEMS rows for this user.

    Does NOT commit -- the caller owns the transaction boundary so the
    cap-delete lands atomically with whatever write triggered it.
    """
    result = await db.execute(
        select(RecentlyViewed.id)
        .where(RecentlyViewed.user_id == user_id)
        .order_by(RecentlyViewed.viewed_at.desc())
        .offset(settings.RECENTLY_VIEWED_MAX_ITEMS)
    )
    stale_ids = [row[0] for row in result.all()]
    if stale_ids:
        await db.execute(delete(RecentlyViewed).where(RecentlyViewed.id.in_(stale_ids)))


async def get_recent(db: AsyncSession, user_id: int, limit: int | None = None):
    limit = limit or settings.RECENTLY_VIEWED_MAX_ITEMS
    result = await db.execute(
        select(RecentlyViewed)
        .where(RecentlyViewed.user_id == user_id)
        .order_by(RecentlyViewed.viewed_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def merge_local_history(db: AsyncSession, user_id: int, local_entries: list[dict]) -> None:
    """
    Called once, right after login, with whatever the client tracked while
    the user was browsing anonymously.

    Merge rule: for each (product_id, viewed_at) pair from the client,
    upsert it -- but only let it overwrite the server's viewed_at if the
    local timestamp is NEWER. This preserves "most recently viewed wins"
    ordering regardless of whether the server or the local device saw the
    most recent view, and is safe to run from multiple devices/tabs
    concurrently logging in at once, since each call is just a sequence of
    idempotent upserts -- replaying it twice has no extra effect.
    """
    insert_fn = _dialect_insert(db)
    for entry in local_entries:
        stmt = insert_fn(RecentlyViewed).values(
            user_id=user_id,
            product_id=entry["product_id"],
            viewed_at=entry["viewed_at"],
            source="local_merge",
        )
        if insert_fn is pg_insert:
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "product_id"],
                set_={"viewed_at": entry["viewed_at"]},
                where=(RecentlyViewed.viewed_at < entry["viewed_at"]),
            )
        else:
            # sqlite's on_conflict_do_update doesn't support a WHERE-guarded
            # set in older versions reliably across all SQLAlchemy builds,
            # so fall back to read-compare-write for sqlite specifically.
            existing = await db.execute(
                select(RecentlyViewed).where(
                    RecentlyViewed.user_id == user_id,
                    RecentlyViewed.product_id == entry["product_id"],
                )
            )
            existing_row = existing.scalar_one_or_none()
            if existing_row is None:
                db.add(RecentlyViewed(
                    user_id=user_id, product_id=entry["product_id"],
                    viewed_at=entry["viewed_at"], source="local_merge",
                ))
            elif existing_row.viewed_at < entry["viewed_at"]:
                existing_row.viewed_at = entry["viewed_at"]
                existing_row.source = "local_merge"
            await db.commit()
            continue
        await db.execute(stmt)
    await _enforce_cap(db, user_id)
    await db.commit()

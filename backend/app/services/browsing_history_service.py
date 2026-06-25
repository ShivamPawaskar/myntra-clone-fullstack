"""
Server-side browsing history used purely as a recommendation signal
(separate from the user-facing Recently Viewed rail -- see models docstring
for why). Capped at BROWSING_HISTORY_MAX_ITEMS unique products per user,
each entry expiring after BROWSING_HISTORY_TTL_DAYS.
"""
from datetime import timedelta
from sqlalchemy import select, delete
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.recently_viewed import BrowsingHistory
from app.models.user import utcnow
from app.config import settings


def _dialect_insert(db: AsyncSession):
    bind = db.get_bind()
    return pg_insert if bind.dialect.name == "postgresql" else sqlite_insert


async def record_browsing_event(db: AsyncSession, user_id: int, product_id: int) -> None:
    now = utcnow()
    expires_at = now + timedelta(days=settings.BROWSING_HISTORY_TTL_DAYS)
    insert_fn = _dialect_insert(db)
    stmt = insert_fn(BrowsingHistory).values(
        user_id=user_id, product_id=product_id, viewed_at=now, expires_at=expires_at
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["user_id", "product_id"],
        set_={"viewed_at": now, "expires_at": expires_at},
    )
    await db.execute(stmt)
    await db.commit()

    # Enforce 50-item cap
    result = await db.execute(
        select(BrowsingHistory.id)
        .where(BrowsingHistory.user_id == user_id)
        .order_by(BrowsingHistory.viewed_at.desc())
        .offset(settings.BROWSING_HISTORY_MAX_ITEMS)
    )
    stale_ids = [row[0] for row in result.all()]
    if stale_ids:
        await db.execute(delete(BrowsingHistory).where(BrowsingHistory.id.in_(stale_ids)))
        await db.commit()


async def purge_expired(db: AsyncSession) -> int:
    """Run periodically (APScheduler job, see app/workers/scheduler.py) to
    delete rows past their expiry instead of filtering expires_at on every
    read -- keeps the recommendation query simpler and the table smaller."""
    result = await db.execute(
        delete(BrowsingHistory).where(BrowsingHistory.expires_at < utcnow())
    )
    await db.commit()
    return result.rowcount or 0

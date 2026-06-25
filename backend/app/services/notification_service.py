"""
Feature 3: Event-Driven Push Notification System.

Architecture:
  API layer (this file, async) -> writes a Notification row + enqueues an
  RQ job -> RQ worker (sync, separate process, app/workers/notification_worker.py)
  -> calls Expo's push API -> updates the row's status.

Why a DB-backed queue AND an RQ job (not just RQ alone): RQ's in-memory job
list doesn't survive a Redis restart/eviction the way a durable Notification
row does, and we need a durable record anyway for the "My Notifications" UI
and for retry bookkeeping. RQ here is just the *trigger* -- the actual
source of truth for "what's pending / how many attempts" is the DB row,
which is what makes retries safe to resume even if the worker crashed
mid-delivery.

Rate limiting: a sliding window implemented with a Redis key per user
(`ratelimit:notif:{user_id}`) using INCR + EXPIRE, capped at
NOTIFICATION_RATE_LIMIT_PER_USER_PER_HOUR. This protects users from
notification spam (e.g. a buggy retry loop or an over-eager marketing job)
without needing a DB roundtrip per check.
"""
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification import DeviceToken, Notification, NotificationType, NotificationStatus, Platform
from app.models.user import utcnow
from app.core.redis_client import redis_client
from app.config import settings
from app.workers.queue import notification_queue


async def register_device_token(db: AsyncSession, user_id: int, token: str, platform: str) -> DeviceToken:
    """Upsert by token: a token belongs to exactly one device, so if the
    same physical device re-registers (app reinstall, token refresh) under
    a different or same user we just update ownership rather than
    accumulating duplicate rows."""
    result = await db.execute(select(DeviceToken).where(DeviceToken.token == token))
    existing = result.scalar_one_or_none()
    if existing:
        existing.user_id = user_id
        existing.is_valid = True
        existing.last_used_at = utcnow()
        await db.commit()
        return existing

    device = DeviceToken(user_id=user_id, token=token, platform=Platform(platform))
    db.add(device)
    await db.commit()
    return device


def rate_limit_ok(user_id: int) -> bool:
    """Sliding-window per-user check, shared by EVERY path that can emit a
    notification -- the real-time send_notification() below AND the
    scheduled cart-abandonment sweep (app/workers/scheduler.py). Any new
    notification source must go through here so the per-user hourly cap
    can't be bypassed by writing Notification rows directly."""
    key = f"ratelimit:notif:{user_id}"
    count = redis_client.incr(key)
    if count == 1:
        redis_client.expire(key, 3600)
    return count <= settings.NOTIFICATION_RATE_LIMIT_PER_USER_PER_HOUR


async def send_notification(
    db: AsyncSession, user_id: int, notif_type: str, title: str, body: str,
    data: dict | None = None, scheduled_at: datetime | None = None,
) -> Notification | None:
    """
    Creates the Notification row and enqueues delivery.
    - Real-time (order updates): scheduled_at=None -> delivered immediately.
    - Scheduled (cart abandonment): scheduled_at=<future time> -> the
      worker's periodic sweep (app/workers/scheduler.py) picks it up once
      due, rather than enqueueing an RQ job that fires immediately.
    Returns None (and writes nothing) if the user is currently rate-limited,
    so we never even create a row we won't deliver.
    """
    if not rate_limit_ok(user_id):
        return None

    notif = Notification(
        user_id=user_id,
        type=NotificationType(notif_type),
        title=title,
        body=body,
        data=data or {},
        scheduled_at=scheduled_at or utcnow(),
        status=NotificationStatus.PENDING,
    )
    db.add(notif)
    await db.commit()

    if scheduled_at is None:
        notification_queue.enqueue("app.workers.notification_worker.deliver_notification", notif.id)

    return notif

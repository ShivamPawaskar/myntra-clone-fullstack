"""
Periodic background sweeps, started from app/main.py on FastAPI startup.
Two responsibilities:

1. sweep_due_notifications -- finds Notification rows that are PENDING and
   due (scheduled_at <= now), which covers BOTH genuinely scheduled sends
   (cart abandonment reminders) AND failed deliveries that were
   rescheduled with backoff by the worker. Enqueuing both through the same
   sweep means the retry mechanism and the scheduling mechanism are the
   same code path -- one less thing to get inconsistent.

   Known trade-off (documented, not hidden): if the sweep interval (30s)
   overlaps with a slow delivery attempt, the same notification could be
   enqueued twice, causing an occasional duplicate push. For a system at
   this scale that's an acceptable trade-off vs. the complexity of
   distributed locking; the production-grade fix would be a SELECT ...
   FOR UPDATE SKIP LOCKED claim step, called out in DESIGN_DECISIONS.md.

2. sweep_expired_browsing_history -- deletes BrowsingHistory rows past
   their TTL (feature 6 requirement), run hourly rather than checked on
   every read so the recommendation query stays simple.
"""
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select, delete
from app.database_sync import SyncSessionLocal
from app.models.notification import Notification, NotificationStatus
from app.models.user import utcnow
from app.workers.queue import notification_queue
from app.services.notification_service import rate_limit_ok
from app.config import settings


def sweep_due_notifications():
    with SyncSessionLocal() as db:
        due = db.execute(
            select(Notification).where(
                Notification.status == NotificationStatus.PENDING,
                Notification.scheduled_at <= utcnow(),
            ).limit(200)
        ).scalars().all()
        for notif in due:
            notification_queue.enqueue("app.workers.notification_worker.deliver_notification", notif.id)


def sweep_expired_browsing_history():
    from app.models.recently_viewed import BrowsingHistory
    with SyncSessionLocal() as db:
        db.execute(delete(BrowsingHistory).where(BrowsingHistory.expires_at < utcnow()))
        db.commit()


def sweep_cart_abandonment():
    """
    Example of a scheduled (non-real-time) notification: finds users whose
    active cart hasn't changed in 2-26 hours (a window, not just '>2h ago',
    so we don't re-notify the same stale cart every sweep cycle forever)
    and who haven't already gotten a cart-abandonment notification in that
    window, then queues one reminder each.
    """
    from datetime import timedelta
    from app.models.cart import CartItem, CartStatus
    from app.models.notification import NotificationType
    with SyncSessionLocal() as db:
        now = utcnow()
        window_start, window_end = now - timedelta(hours=26), now - timedelta(hours=2)

        stale_user_ids = db.execute(
            select(CartItem.user_id)
            .where(
                CartItem.status == CartStatus.ACTIVE,
                CartItem.updated_at >= window_start,
                CartItem.updated_at <= window_end,
            )
            .distinct()
        ).scalars().all()

        for user_id in stale_user_ids:
            already_notified = db.execute(
                select(Notification.id).where(
                    Notification.user_id == user_id,
                    Notification.type == NotificationType.CART_ABANDONMENT,
                    Notification.created_at >= window_start,
                )
            ).first()
            if already_notified:
                continue
            # Go through the same per-user rate limiter as real-time sends so
            # this marketing-style sweep can't push a user over the hourly
            # cap. If they're already at the limit, skip silently this cycle.
            if not rate_limit_ok(user_id):
                continue
            notif = Notification(
                user_id=user_id,
                type=NotificationType.CART_ABANDONMENT,
                title="You left something in your cart!",
                body="Your items are still waiting -- complete your purchase before they sell out.",
                data={"deeplink": "/cart"},
                scheduled_at=now,
                status=NotificationStatus.PENDING,
            )
            db.add(notif)
        db.commit()


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler()
    scheduler.add_job(sweep_due_notifications, "interval", seconds=30, id="sweep_notifications")
    scheduler.add_job(sweep_expired_browsing_history, "interval", hours=1, id="sweep_browsing_history")
    scheduler.add_job(sweep_cart_abandonment, "interval", minutes=30, id="sweep_cart_abandonment")
    scheduler.start()
    return scheduler

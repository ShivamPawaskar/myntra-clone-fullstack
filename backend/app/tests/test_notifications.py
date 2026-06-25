"""
Feature 3: Event-Driven Push Notification System.

Coverage:
  - exponential backoff schedule (pure math)
  - web-token deliverability gate while web push is stubbed
  - per-user rate limiting (the cap that prevents notification spam)
  - the durable worker's delivery outcomes: success, invalid-token
    deactivation, retry-then-permanent-fail, no-deliverable-tokens, and the
    "already processed" dedup guard that makes double-enqueue safe.
"""
import pytest
import pytest_asyncio
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401  register all models
from app.models.notification import (
    Notification, NotificationStatus, NotificationType, DeviceToken, Platform,
)
from app.config import settings
from app.workers import notification_worker
from app.services import notification_service


# --------------------------------------------------------------------------
# Pure helpers (no DB / no Redis)
# --------------------------------------------------------------------------

def test_backoff_delay_is_exponential():
    base = notification_worker.BACKOFF_BASE_SECONDS
    assert notification_worker.backoff_delay_seconds(1) == base
    assert notification_worker.backoff_delay_seconds(2) == base * 2
    assert notification_worker.backoff_delay_seconds(3) == base * 4
    # strictly increasing
    delays = [notification_worker.backoff_delay_seconds(n) for n in range(1, 6)]
    assert delays == sorted(delays) and len(set(delays)) == len(delays)


def test_mobile_tokens_always_deliverable():
    ios = DeviceToken(user_id=1, token="t", platform=Platform.IOS)
    android = DeviceToken(user_id=1, token="t", platform=Platform.ANDROID)
    assert notification_worker._is_deliverable(ios)
    assert notification_worker._is_deliverable(android)


def test_web_token_not_deliverable_while_web_push_disabled(monkeypatch):
    web = DeviceToken(user_id=1, token="t", platform=Platform.WEB)
    monkeypatch.setattr(settings, "WEB_PUSH_ENABLED", False)
    assert notification_worker._is_deliverable(web) is False
    monkeypatch.setattr(settings, "WEB_PUSH_ENABLED", True)
    assert notification_worker._is_deliverable(web) is True


# --------------------------------------------------------------------------
# Rate limiting (Redis fakeout)
# --------------------------------------------------------------------------

class _FakeRedis:
    def __init__(self):
        self.store = {}
    def incr(self, key):
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]
    def expire(self, key, seconds):
        pass


def test_rate_limit_allows_up_to_cap_then_blocks(monkeypatch):
    monkeypatch.setattr(notification_service, "redis_client", _FakeRedis())
    cap = settings.NOTIFICATION_RATE_LIMIT_PER_USER_PER_HOUR
    allowed = [notification_service.rate_limit_ok(42) for _ in range(cap)]
    assert all(allowed)                       # first `cap` calls pass
    assert notification_service.rate_limit_ok(42) is False  # one over -> blocked
    # a different user has an independent window
    assert notification_service.rate_limit_ok(99) is True


@pytest.mark.asyncio
async def test_send_notification_returns_none_when_rate_limited(db_session, monkeypatch):
    monkeypatch.setattr(notification_service, "rate_limit_ok", lambda uid: False)
    result = await notification_service.send_notification(
        db_session, user_id=1, notif_type="order_update", title="t", body="b",
    )
    assert result is None
    # nothing was written
    rows = (await db_session.execute(select(Notification))).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_send_scheduled_notification_creates_pending_row(db_session, monkeypatch):
    from datetime import timedelta
    from app.models.user import utcnow
    monkeypatch.setattr(notification_service, "rate_limit_ok", lambda uid: True)
    future = utcnow() + timedelta(hours=2)
    notif = await notification_service.send_notification(
        db_session, user_id=1, notif_type="cart_abandonment", title="t", body="b",
        scheduled_at=future,
    )
    assert notif is not None
    assert notif.status == NotificationStatus.PENDING
    assert notif.scheduled_at == future


# --------------------------------------------------------------------------
# Durable worker delivery (sync in-memory DB)
# --------------------------------------------------------------------------

@pytest.fixture
def sync_db(monkeypatch):
    """In-memory sync DB wired into the worker in place of SyncSessionLocal."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)
    monkeypatch.setattr(notification_worker, "SyncSessionLocal", TestSession)
    yield TestSession
    engine.dispose()


def _seed(session_factory, platform=Platform.IOS, token="tok"):
    """Create one PENDING notification + one valid device token for user 1."""
    with session_factory() as db:
        notif = Notification(
            user_id=1, type=NotificationType.ORDER_UPDATE, title="t", body="b",
            status=NotificationStatus.PENDING,
        )
        db.add(notif)
        db.add(DeviceToken(user_id=1, token=token, platform=platform))
        db.commit()
        return notif.id


def test_deliver_marks_sent_on_success(sync_db, monkeypatch):
    notif_id = _seed(sync_db)
    monkeypatch.setattr(notification_worker, "_send_to_device", lambda d, n: (True, False))
    notification_worker.deliver_notification(notif_id)
    with sync_db() as db:
        notif = db.get(Notification, notif_id)
        assert notif.status == NotificationStatus.SENT
        assert notif.attempts == 1
        assert notif.sent_at is not None


def test_deliver_deactivates_invalid_token(sync_db, monkeypatch):
    notif_id = _seed(sync_db)
    monkeypatch.setattr(notification_worker, "_send_to_device", lambda d, n: (False, True))
    notification_worker.deliver_notification(notif_id)
    with sync_db() as db:
        token = db.execute(select(DeviceToken)).scalars().one()
        assert token.is_valid is False
        # no success and under the cap -> stays PENDING for a retry
        notif = db.get(Notification, notif_id)
        assert notif.status == NotificationStatus.PENDING
        assert notif.attempts == 1


def test_deliver_retries_then_fails_permanently(sync_db, monkeypatch):
    notif_id = _seed(sync_db)
    monkeypatch.setattr(notification_worker, "_send_to_device", lambda d, n: (False, False))
    for _ in range(settings.NOTIFICATION_MAX_ATTEMPTS):
        notification_worker.deliver_notification(notif_id)
        # the worker reschedules into the future; reset so the next call runs
        with sync_db() as db:
            notif = db.get(Notification, notif_id)
            if notif.status == NotificationStatus.PENDING:
                from app.models.user import utcnow
                notif.scheduled_at = utcnow()
                db.commit()
    with sync_db() as db:
        notif = db.get(Notification, notif_id)
        assert notif.status == NotificationStatus.FAILED
        assert notif.attempts == settings.NOTIFICATION_MAX_ATTEMPTS


def test_deliver_fails_immediately_with_no_deliverable_tokens(sync_db, monkeypatch):
    # web token while web push is disabled => nothing deliverable
    monkeypatch.setattr(settings, "WEB_PUSH_ENABLED", False)
    notif_id = _seed(sync_db, platform=Platform.WEB, token="web-tok")
    notification_worker.deliver_notification(notif_id)
    with sync_db() as db:
        notif = db.get(Notification, notif_id)
        assert notif.status == NotificationStatus.FAILED
        # failed without burning a retry attempt
        assert notif.attempts == 0


def test_deliver_skips_already_processed(sync_db, monkeypatch):
    notif_id = _seed(sync_db)
    with sync_db() as db:
        db.get(Notification, notif_id).status = NotificationStatus.SENT
        db.commit()

    def _boom(device, notif):
        raise AssertionError("must not attempt delivery for a non-PENDING notification")

    monkeypatch.setattr(notification_worker, "_send_to_device", _boom)
    notification_worker.deliver_notification(notif_id)  # should be a no-op
    with sync_db() as db:
        assert db.get(Notification, notif_id).status == NotificationStatus.SENT

import enum
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Index, Boolean, Integer, Enum, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.user import utcnow


class Platform(str, enum.Enum):
    IOS = "ios"
    ANDROID = "android"
    WEB = "web"


class NotificationType(str, enum.Enum):
    ORDER_UPDATE = "order_update"
    CART_ABANDONMENT = "cart_abandonment"
    PROMO = "promo"
    GENERIC = "generic"


class NotificationStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class DeviceToken(Base):
    """Expo push tokens (mobile) and Web Push subscriptions both stored here,
    distinguished by `platform`. Tokens are deactivated (is_valid=False)
    rather than deleted immediately on a delivery failure that indicates the
    token is dead (Expo's DeviceNotRegistered / web push 410 Gone), so we
    keep an audit trail but stop sending to them."""
    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(512), unique=True, index=True)
    platform: Mapped[Platform] = mapped_column(Enum(Platform))
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    """
    Feature 3. A row is created for every notification we intend to send,
    whether immediate (scheduled_at <= now) or scheduled in the future
    (e.g. cart abandonment reminder 2 hours after last cart update).

    The background worker (app/workers/notification_worker.py) polls for
    rows where status=PENDING and scheduled_at <= now, attempts delivery,
    and on failure increments `attempts` and reschedules with exponential
    backoff until NOTIFICATION_MAX_ATTEMPTS is hit, at which point it's
    marked FAILED permanently. This row-based queue (rather than relying
    purely on an in-memory queue) is what makes retries durable across
    worker restarts.
    """
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(String(1000))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[NotificationStatus] = mapped_column(Enum(NotificationStatus), default=NotificationStatus.PENDING, index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_notifications_status_scheduled", "status", "scheduled_at"),
    )

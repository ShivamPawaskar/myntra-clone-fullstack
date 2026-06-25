import enum
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Index, Numeric, Enum, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.user import utcnow


class TransactionStatus(str, enum.Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    REFUNDED = "refunded"


class Transaction(Base):
    """
    Feature 4. `idempotency_key` is the payment gateway's unique event/payment
    id (e.g. Razorpay payment_id or Stripe event id). It is UNIQUE at the DB
    level -- that constraint, not application logic, is what actually makes
    webhook handling idempotent: if the gateway retries the same webhook
    (which all payment gateways do), the second INSERT raises an
    IntegrityError that the webhook handler catches and turns into a no-op
    "already processed" response instead of a duplicate transaction.
    """
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    order_id: Mapped[str] = mapped_column(String(64), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    invoice_number: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    payment_mode: Mapped[str] = mapped_column(String(64))
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    status: Mapped[TransactionStatus] = mapped_column(Enum(TransactionStatus), default=TransactionStatus.PENDING, index=True)
    gateway_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        Index("ix_transactions_user_created", "user_id", "created_at"),
        Index("ix_transactions_user_status_created", "user_id", "status", "created_at"),
    )


class AuditLog(Base):
    """Append-only event trail per transaction: created, webhook_received,
    duplicate_ignored, failed, refunded, etc. Never updated, only inserted."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

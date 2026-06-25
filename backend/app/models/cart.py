import enum
from datetime import datetime
from sqlalchemy import Integer, DateTime, ForeignKey, UniqueConstraint, Index, Enum, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.user import utcnow


class CartStatus(str, enum.Enum):
    ACTIVE = "active"
    SAVED = "saved"


class CartItem(Base):
    """
    Feature 5: one row per (user, product) regardless of whether it's
    'active' or 'saved for later'. This single-row-per-product design is
    what gives us duplicate prevention and clean active/saved separation
    for free: moving an item to Save-for-Later is an UPDATE of `status`,
    never an insert into a second table, so it can never exist in both
    places at once and cart totals only ever sum status == ACTIVE rows.

    Concurrency: `version` implements optimistic locking. Every update from
    any device must read the current version, then issue
        UPDATE ... SET ..., version = version + 1 WHERE id = :id AND version = :expected
    If 0 rows are affected, another device updated it first -> the caller
    reloads and retries (or surfaces a conflict to the user). This avoids
    long-held DB locks (works fine even on SQLite) while still preventing
    the lost-update problem from two devices editing the same cart at once.

    price_snapshot stores the unit price at the moment the item was added,
    so we can detect a price change before checkout by comparing it to the
    live Product.price without needing a separate price-history table.
    """
    __tablename__ = "cart_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[CartStatus] = mapped_column(Enum(CartStatus), default=CartStatus.ACTIVE)
    price_snapshot: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_cart_user_product"),
        Index("ix_cart_user_status", "user_id", "status"),
    )

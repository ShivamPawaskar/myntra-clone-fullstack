from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, UniqueConstraint, Index, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.user import utcnow


class Review(Base):
    """
    Product reviews & ratings. One review per (user, product) -- submitting
    again UPDATES the existing row (enforced by the unique constraint), so a
    user can revise their review but never spam duplicates.

    `verified_purchase` is computed at write time by checking whether the
    user has a SUCCESS transaction that includes this product. It's the trust
    signal that sets real reviews apart from drive-by ratings, and it reuses
    the order data we already store -- no extra bookkeeping.
    """
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..5
    title: Mapped[str] = mapped_column(String(120), default="")
    body: Mapped[str] = mapped_column(String(2000), default="")
    verified_purchase: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_review_user_product"),
        Index("ix_reviews_product_created", "product_id", "created_at"),
    )

from datetime import datetime
from sqlalchemy import Integer, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.user import utcnow


class RecentlyViewed(Base):
    """
    Feature 1: user-facing 'Recently Viewed' rail.

    One row per (user, product) -- viewing the same product again UPDATES
    viewed_at instead of inserting a new row, which is what makes duplicate
    prevention trivial (enforced at the DB level via the unique constraint,
    not just in application code, so it holds even under concurrent writes
    from two devices).

    Cap of 20 items per user is enforced server-side after every upsert
    (see services/recently_viewed_service.py) by deleting rows ranked
    beyond 20 by viewed_at. The composite index below makes that ranking
    query and the "give me my last 20" read query both index-only scans.
    """
    __tablename__ = "recently_viewed"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Monotonically increasing client-or-server version used to resolve
    # ordering when merging an anonymous (local) history into the server
    # history at login time -- see services/recently_viewed_service.merge_histories
    source: Mapped[str] = mapped_column(default="server")  # "server" | "local_merge"

    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_recently_viewed_user_product"),
        Index("ix_recently_viewed_user_viewedat", "user_id", "viewed_at"),
    )


class BrowsingHistory(Base):
    """
    Feature 6: server-side browsing signal feeding the recommendation engine.
    Deliberately a *separate* table from RecentlyViewed (rather than reusing
    it with a higher cap) because the two have different retention rules:
    RecentlyViewed has no expiry and is capped at 20 for UI purposes;
    BrowsingHistory expires after BROWSING_HISTORY_TTL_DAYS and is capped at
    50, purely as a recommendation-quality signal.
    """
    __tablename__ = "browsing_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_browsing_history_user_product"),
        Index("ix_browsing_history_user_viewedat", "user_id", "viewed_at"),
        Index("ix_browsing_history_expires", "expires_at"),
    )


class Wishlist(Base):
    __tablename__ = "wishlist"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),
        # product_id index is the one that matters for "who else wishlisted
        # the things this user wishlisted" -- it's the join key in the
        # wishlist-overlap recommendation signal.
        Index("ix_wishlist_product", "product_id"),
        Index("ix_wishlist_user", "user_id"),
    )

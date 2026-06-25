from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Index, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.user import utcnow


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(String(2000), default="")
    brand: Mapped[str] = mapped_column(String(255), default="", index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[str] = mapped_column(String(40), default="", index=True)
    image_url: Mapped[str] = mapped_column(String(1000), default="")
    # Denormalized popularity counter (e.g. incremented on purchase/view) used
    # as the cold-start / fallback signal for recommendations. Updating this
    # is O(1) per event so it scales independently of catalog size.
    popularity_score: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_products_category_active_popularity", "category_id", "is_active", "popularity_score"),
    )

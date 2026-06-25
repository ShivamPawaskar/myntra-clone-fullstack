import enum
from datetime import datetime
from sqlalchemy import String, Integer, Numeric, Boolean, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.user import utcnow


class DiscountType(str, enum.Enum):
    PERCENT = "percent"   # discount_value is a percentage (0-100)
    FLAT = "flat"         # discount_value is a flat amount in currency


class Coupon(Base):
    """Promo codes applied at checkout. A new table, so it's created by
    create_all on startup without touching existing data."""
    __tablename__ = "coupons"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    discount_type: Mapped[DiscountType] = mapped_column(Enum(DiscountType))
    discount_value: Mapped[float] = mapped_column(Numeric(10, 2))
    min_order_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    description: Mapped[str] = mapped_column(String(160), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

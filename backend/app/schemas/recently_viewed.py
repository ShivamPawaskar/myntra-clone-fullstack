from datetime import datetime
from pydantic import BaseModel, ConfigDict


class RecentlyViewedItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int
    viewed_at: datetime


class RecentlyViewedItemOut(RecentlyViewedItem):
    name: str
    price: float
    image_url: str


class LocalHistoryEntry(BaseModel):
    """What the client sends up at login time to merge anonymous browsing
    that happened before the user signed in."""
    product_id: int
    viewed_at: datetime


class MergeRequest(BaseModel):
    local_history: list[LocalHistoryEntry]


class RecordViewRequest(BaseModel):
    product_id: int

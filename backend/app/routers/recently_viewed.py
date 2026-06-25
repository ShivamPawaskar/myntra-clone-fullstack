from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.core.deps import get_current_user
from app.schemas.recently_viewed import MergeRequest
from app.services import recently_viewed_service

router = APIRouter(prefix="/recently-viewed", tags=["recently-viewed"])


@router.get("")
async def get_recently_viewed(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    items = await recently_viewed_service.get_recent(db, user.id)
    return [{"product_id": i.product_id, "viewed_at": i.viewed_at} for i in items]


@router.post("/merge")
async def merge_anonymous_history(
    payload: MergeRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    """
    Called once right after login with whatever the client tracked locally
    while browsing anonymously. See services/recently_viewed_service.merge_local_history
    for the conflict-resolution rule (newest timestamp wins, dedup via
    DB-level unique constraint).
    """
    entries = [{"product_id": e.product_id, "viewed_at": e.viewed_at} for e in payload.local_history]
    await recently_viewed_service.merge_local_history(db, user.id, entries)
    items = await recently_viewed_service.get_recent(db, user.id)
    return [{"product_id": i.product_id, "viewed_at": i.viewed_at} for i in items]

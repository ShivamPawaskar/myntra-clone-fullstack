from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.core.deps import get_current_user
from app.services.recommendation_service import get_recommendations

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("")
async def you_may_also_like(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    items = await get_recommendations(db, user.id)
    return {"items": items}

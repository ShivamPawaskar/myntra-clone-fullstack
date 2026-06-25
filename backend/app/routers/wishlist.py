from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.core.deps import get_current_user
from app.models.recently_viewed import Wishlist

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


class WishlistRequest(BaseModel):
    product_id: int


@router.get("")
async def get_wishlist(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    rows = (await db.execute(select(Wishlist).where(Wishlist.user_id == user.id))).scalars().all()
    return [r.product_id for r in rows]


@router.post("")
async def add_to_wishlist(payload: WishlistRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    existing = await db.execute(
        select(Wishlist).where(Wishlist.user_id == user.id, Wishlist.product_id == payload.product_id)
    )
    if existing.scalar_one_or_none():
        return {"status": "already_in_wishlist"}
    db.add(Wishlist(user_id=user.id, product_id=payload.product_id))
    await db.commit()
    return {"status": "added"}


@router.delete("/{product_id}")
async def remove_from_wishlist(product_id: int, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    await db.execute(delete(Wishlist).where(Wishlist.user_id == user.id, Wishlist.product_id == product_id))
    await db.commit()
    return {"status": "removed"}

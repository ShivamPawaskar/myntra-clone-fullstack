from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.core.deps import get_current_user
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


class RegisterTokenRequest(BaseModel):
    token: str
    platform: str  # "ios" | "android" | "web"


@router.post("/register-device")
async def register_device(payload: RegisterTokenRequest, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    device = await notification_service.register_device_token(db, user.id, payload.token, payload.platform)
    return {"id": device.id, "platform": device.platform.value, "is_valid": device.is_valid}

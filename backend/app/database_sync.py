"""
RQ workers run in a separate, synchronous process -- they don't share the
FastAPI event loop, so they get their own plain (non-async) SQLAlchemy
engine here, derived from the same DATABASE_URL by swapping the async
driver for its sync counterpart.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings


def _sync_url(url: str) -> str:
    # Managed hosts give `postgres://`; SQLAlchemy 2.0 needs `postgresql://`.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return (
        url.replace("postgresql+asyncpg", "postgresql+psycopg2")
        .replace("sqlite+aiosqlite", "sqlite")
    )


sync_engine = create_engine(_sync_url(settings.DATABASE_URL), pool_pre_ping=True)
SyncSessionLocal = sessionmaker(bind=sync_engine)

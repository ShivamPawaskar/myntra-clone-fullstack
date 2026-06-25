import os
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base
import app.models  # noqa: F401 register all models

# Tests default to an in-memory SQLite DB (zero setup, fast). Set
# TEST_DATABASE_URL to an async Postgres URL
# (e.g. postgresql+asyncpg://user:pass@localhost/test) to run the SAME
# suite against Postgres -- this is what catches dev/prod SQL divergences
# (naive-vs-aware datetimes, SELECT DISTINCT + ORDER BY, etc.) that SQLite
# silently tolerates. CI runs both legs; see .github/workflows/backend-tests.yml.
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite://")
IS_SQLITE = TEST_DATABASE_URL.startswith("sqlite")


@pytest_asyncio.fixture
async def db_session():
    """Fresh schema per test. For in-memory SQLite, StaticPool keeps the one
    connection alive so ':memory:' is visible across the async pool's
    connections; for Postgres we create and drop all tables around each test
    so cases stay isolated."""
    if IS_SQLITE:
        engine = create_async_engine(
            TEST_DATABASE_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        engine = create_async_engine(TEST_DATABASE_URL)

    async with engine.begin() as conn:
        if not IS_SQLITE:
            # Drop any leftovers from a previously failed run before recreating.
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    try:
        async with session_factory() as session:
            yield session
    finally:
        if not IS_SQLITE:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

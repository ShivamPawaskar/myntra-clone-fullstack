from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings


def _async_url(url: str) -> str:
    """Normalize a DB URL for SQLAlchemy's ASYNC engine. Managed hosts (Render,
    Heroku, etc.) hand out `postgres://` or `postgresql://`, but the async
    engine needs the asyncpg driver explicitly."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


ASYNC_DATABASE_URL = _async_url(settings.DATABASE_URL)

connect_args = {}
if ASYNC_DATABASE_URL.startswith("sqlite"):
    # SQLite needs this for use with FastAPI's async + multiple connections
    connect_args = {"check_same_thread": False}

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    connect_args=connect_args,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create tables. Used for local dev/tests; production uses Alembic migrations."""
    import app.models  # noqa: F401  ensure all models are registered on Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _ensure_columns()


async def _ensure_columns():
    """Lightweight dev migration: add columns that were introduced after a DB
    was first created (create_all only creates missing *tables*, not columns).
    Safe to run on every startup -- each ALTER is ignored if the column exists.
    Production uses Alembic instead."""
    from sqlalchemy import text
    # (table, column, type) added after initial release
    additions = [("products", "color", "VARCHAR(40)")]
    for table, column, coltype in additions:
        try:
            # Own transaction per ALTER: a failure (column exists) on Postgres
            # poisons the surrounding transaction, so isolate each one.
            async with engine.begin() as conn:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
        except Exception:
            pass  # column already exists

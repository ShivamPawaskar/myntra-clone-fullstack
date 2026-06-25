"""
Alembic migration environment.

Migrations run synchronously (Alembic doesn't need async), so we derive a
sync DB URL from the same DATABASE_URL the app uses -- swapping the async
driver for its sync counterpart -- and point Alembic at our models'
metadata so `alembic revision --autogenerate` can diff the schema.
"""
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

from app.config import settings
from app.database import Base
import app.models  # noqa: F401  register all models on Base.metadata

config = context.config


def _sync_url(url: str) -> str:
    return (
        url.replace("postgresql+asyncpg", "postgresql+psycopg2")
        .replace("sqlite+aiosqlite", "sqlite")
    )


config.set_main_option("sqlalchemy.url", _sync_url(settings.DATABASE_URL))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url, target_metadata=target_metadata,
        literal_binds=True, dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

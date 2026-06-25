"""
Centralized configuration. All environment-specific values (DB url, secrets,
redis url, push credentials) come from environment variables so the exact
same codebase runs in dev (SQLite) and production (Postgres) without code
changes -- only the .env file differs.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Myntra-Clone API"
    ENV: str = "development"

    # Dev default = SQLite (zero setup). Production should set:
    # postgresql+asyncpg://user:pass@host:5432/dbname
    DATABASE_URL: str = "sqlite+aiosqlite:///./app.db"

    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET: str = "dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Payment-webhook HMAC secret. When set, the /transactions/webhook
    # endpoint requires a matching X-Webhook-Signature header (HMAC-SHA256 of
    # the raw body). Left empty in dev so local testing needs no signing;
    # MUST be set in production to a value shared with the payment gateway.
    WEBHOOK_SIGNING_SECRET: str = ""

    # Feature limits (kept as config, not magic numbers, per requirements)
    RECENTLY_VIEWED_MAX_ITEMS: int = 20
    BROWSING_HISTORY_MAX_ITEMS: int = 50
    BROWSING_HISTORY_TTL_DAYS: int = 30

    # Notification system
    NOTIFICATION_MAX_ATTEMPTS: int = 5
    NOTIFICATION_RATE_LIMIT_PER_USER_PER_HOUR: int = 10
    EXPO_PUSH_URL: str = "https://exp.host/--/api/v2/push/send"
    # Web Push (VAPID) delivery is stubbed; flip to True once a real
    # web-push transport is wired into notification_worker._send_web_push.
    WEB_PUSH_ENABLED: bool = False

    # Pagination ceiling to protect the DB from abusive page sizes
    MAX_PAGE_SIZE: int = 100


settings = Settings()

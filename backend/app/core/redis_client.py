import redis
from app.config import settings

# Synchronous redis client -- used both by the RQ worker (which is itself
# sync) and by the rate-limiter helper called from async route handlers
# (redis-py's sync client is fast enough here; this is not the bottleneck).
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

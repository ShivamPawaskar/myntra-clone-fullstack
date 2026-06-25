# Myntra-Clone — Backend API

FastAPI + SQLAlchemy (async) backend powering both the web and mobile
clients. Implements six production-grade subsystems: hybrid recently-viewed
with cross-device sync, concurrency-safe cart with save-for-later,
idempotent transaction handling with audit + export, event-driven push
notifications, and a scalable "You May Also Like" recommendation engine.

## Quick start (zero setup — SQLite + local Redis)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Redis is needed for the notification queue + rate limiting
redis-server --daemonize yes

cp .env.example .env          # defaults already work for local dev
python -m app.seed            # create + populate the SQLite DB
uvicorn app.main:app --reload # API now on http://localhost:8000

# In a second terminal — the notification delivery worker:
rq worker notifications
```

Open http://localhost:8000/docs for the interactive Swagger UI.

## Production-shaped stack (Postgres + Redis + worker, via Docker)

```bash
docker compose up --build
```

This brings up Postgres, Redis, the API (auto-runs migrations on start),
and the RQ worker, matching the deployed topology. The same codebase runs
on SQLite (dev) and Postgres (prod) with no code changes — only
`DATABASE_URL` differs.

## Database migrations (Alembic)

```bash
alembic upgrade head                          # apply all migrations
alembic revision --autogenerate -m "message"  # create a new one after model changes
```

Dev mode also auto-creates tables on startup for convenience; production
relies solely on migrations.

## Tests

```bash
pytest          # unit/integration tests (isolated in-memory DB per test)
python smoke_test.py   # end-to-end test against a running server
```

The test suite specifically proves the hard parts: optimistic-locking
conflict detection, idempotent webhook de-duplication + audit logging,
recently-viewed cap/dedup/merge rules, and recommendation cold-start +
signal correctness.

## Architecture at a glance

```
app/
  models/      SQLAlchemy ORM models (the schema + indexes)
  schemas/     Pydantic request/response shapes
  routers/     FastAPI endpoints (thin — delegate to services)
  services/    All business logic lives here
  workers/     RQ notification worker + APScheduler periodic sweeps
  core/        Auth, deps, redis client
  config.py    Env-driven settings (no magic numbers)
  main.py      App assembly
```

See `DESIGN_DECISIONS.md` (project root) for the rationale behind each of
the six features — concurrency model, idempotency strategy, recommendation
complexity analysis, and the trade-offs made for this project's scope.

## Deploy

- **API + worker**: Render or Railway (Dockerfile included). Set
  `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` as env vars; both services use
  the same image, the worker overriding the command to `rq worker notifications`.
- **Postgres + Redis**: Render/Railway managed add-ons.
- Migrations run automatically on API container start.

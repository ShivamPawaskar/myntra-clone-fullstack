# Myntra-Clone — Full-Stack E-Commerce Platform

A production-shaped shopping platform with a **shared backend** serving both a
**web** client (Next.js) and a **mobile** client (React Native / Expo). Built
to satisfy six engineered requirements with real concurrency, idempotency,
and scalability guarantees.

> See **DESIGN_DECISIONS.docx** for the full technical justification of every
> design choice (complexity analysis, concurrency model, idempotency strategy,
> cold-start handling, trade-offs).

## The six features

1. **Hybrid Recently Viewed** with cross-device sync, DB-enforced dedup, 20-item cap, and anonymous→logged-in merge.
2. **Scalable theme / dark-mode architecture** — semantic design tokens, zero hardcoded colors, persistence (localStorage / AsyncStorage), no-flash load.
3. **Event-driven push notifications** — Redis/RQ queue, Expo delivery, exponential-backoff retry, rate limiting, invalid-token cleanup, foreground/background/terminated handling.
4. **Transaction history** — idempotent webhooks (DB-constraint backed), append-only audit log, server-side filter/sort/pagination, streaming CSV export, on-demand PDF receipts.
5. **Concurrency-safe cart** with Save for Later — optimistic locking via version column, price/stock/discontinued checkout validation.
6. **Scalable personalization engine** — single-query 4-signal recommender, no N+1, O(k log k) bounded cost, measured p95 ≈ 8ms, graceful cold start.

## Repository layout

```
myntra-clone/
  backend/    FastAPI + SQLAlchemy + Redis/RQ + Alembic  (the shared API)
  web/        Next.js 14 web client
  mobile/     React Native (Expo) mobile client
  DESIGN_DECISIONS.docx   Technical justification document
```

## Run it locally

### Quick start (one command)

From the repo root, the run script sets up everything (venv, pip, npm, DB seed)
and starts the full stack — backend API, RQ worker, web, and mobile:

```bash
./run.sh                 # macOS / Linux / Git Bash
./run.sh --no-mobile     # skip a piece, e.g. Expo
./run.sh --setup-only    # install + seed only
```
```powershell
./run.ps1                # Windows PowerShell (each service opens in its own window)
./run.ps1 -NoWorker      # e.g. skip the RQ worker if you have no Redis
```

> The RQ worker and push notifications need Redis on `localhost:6379`; the
> script warns (rather than fails) if it isn't running. Use `--no-worker` /
> `-NoWorker` to run without it.

### Manual setup

**1. Backend** (see backend/README.md for detail) — requires Python 3.12–3.14
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt   # runtime + test deps (use requirements.txt for runtime only)
redis-server --daemonize yes
cp .env.example .env
python -m app.seed
uvicorn app.main:app --reload     # http://localhost:8000
rq worker notifications           # in a second terminal
```

**2. Web**
```bash
cd web
npm install
cp .env.example .env.local        # points at http://localhost:8000
npm run dev                       # http://localhost:3000
```

**3. Mobile**
```bash
cd mobile
npm install
npx expo start                    # scan QR with Expo Go, or run a simulator
```

## Deploy

- **Backend**: `backend/render.yaml` provisions API + worker + Postgres + Redis on Render (migrations auto-run on deploy).
- **Web**: `web/vercel.json` deploys to Vercel.
- **Mobile**: `mobile/eas.json` builds for iOS/Android via EAS.

The same backend code runs on SQLite (dev) and PostgreSQL (prod) with only
`DATABASE_URL` changing.

## Verification

- `cd backend && pytest app/tests` — 42 unit/integration tests covering all six features (optimistic locking + stock caps, idempotent webhooks + CSV/PDF export, recently-viewed merge, notification backoff/rate-limit/invalid-token cleanup, recommendation signals + cold-start + browsing-history cap/expiry).
- `cd backend && python smoke_test.py` — end-to-end test against a running server.
- **CI** (`.github/workflows/backend-tests.yml`) runs the suite on every push against both SQLite (Python 3.12 & 3.14) and a real PostgreSQL service, so dev/prod SQL divergences are caught automatically. To run the Postgres leg locally:
  `TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost/test pytest app/tests`

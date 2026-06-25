from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.seed import seed_if_empty, seed_coupons_if_empty
from app.workers.scheduler import start_scheduler
from app.routers import auth, products, recently_viewed, cart, transactions, notifications, recommendations, wishlist


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()  # dev convenience; production uses Alembic migrations instead
    await seed_if_empty()  # storefront is never empty; no-op if already populated
    await seed_coupons_if_empty()  # demo promo codes; no-op if already present
    scheduler = start_scheduler()
    yield
    scheduler.shutdown()


app = FastAPI(title="Myntra-Clone API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the deployed web/app origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(recently_viewed.router)
app.include_router(cart.router)
app.include_router(transactions.router)
app.include_router(notifications.router)
app.include_router(recommendations.router)
app.include_router(wishlist.router)


@app.get("/health")
async def health():
    return {"status": "ok"}

"""BrewIQ API entrypoint.

Run with:  uvicorn main:app --reload
"""
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import SessionLocal, init_db
from routers import ai, demo, inventory, orders, staff
from services import analytics

scheduler = BackgroundScheduler()


def _low_stock_check():
    """Background job: log low-stock items so the demo shows the scheduler is alive."""
    db = SessionLocal()
    try:
        low = analytics.get_dashboard_summary(db)["low_stock_count"]
        if low:
            print(f"[scheduler] {low} item(s) at or below reorder level.")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup, seed demo data if empty, then ensure TODAY is populated
    # (tops up today's orders if the date rolled over since the DB was last seeded).
    init_db()
    from seed_data import ensure_today_seeded, seed_if_empty

    seed_if_empty()
    ensure_today_seeded()
    scheduler.add_job(_low_stock_check, "interval", minutes=5, id="low_stock_check")
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="BrewIQ API",
    description="AI-powered operations dashboard for coffee shops.",
    version="1.0.0",
    lifespan=lifespan,
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://brewiq.vercel.app",
    "*",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,  # must be False when allow_origins includes "*"
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orders.router)
app.include_router(inventory.router)
app.include_router(staff.router)
app.include_router(ai.router)
app.include_router(demo.router)


@app.get("/")
def root():
    return {"name": "BrewIQ API", "status": "ok", "docs": "/docs"}


def _db_record_count() -> int:
    from models import InventoryItem, Order, Staff

    db = SessionLocal()
    try:
        return (
            db.query(Order).count()
            + db.query(InventoryItem).count()
            + db.query(Staff).count()
        )
    finally:
        db.close()


@app.get("/health")
def health():
    """Deployment health check: confirms the API is up and the DB has data."""
    return {"status": "ok", "db_records": _db_record_count()}


@app.get("/api/health")
def api_health():
    return {"status": "healthy", "db_records": _db_record_count()}

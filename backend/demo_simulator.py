"""Demo simulator — makes BrewIQ feel LIVE during the hackathon demo video.

This is the secret weapon. It drives a background stream of realistic orders, can
fire a sudden "morning rush", can crash oat milk to a critical level to trigger AI
alerts, and can reset everything back to clean seed data.

All writers run inside their own DB session (so APScheduler jobs are thread-safe) and
clear the analytics caches after writing, so the dashboard reflects changes immediately.
Reliability first: every job is wrapped so one failure never kills the simulation.
"""
import json
import logging
import random
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from database import SessionLocal
from models import InventoryItem, Order
from services import ai_service, analytics

logger = logging.getLogger("brewiq.demo")

_scheduler = BackgroundScheduler()
SIM_JOB_ID = "demo_order_sim"
_state = {"running": False}

# Real wall-clock rush windows — the demo streams faster during these hours.
RUSH_HOURS = {8, 9, 12, 13}

# (name, price) with popularity weights. Rush weights favor milk drinks so the
# milk/cup inventory visibly drains.
DRINKS = [
    ("Espresso", 3.50), ("Americano", 4.00), ("Cappuccino", 5.00), ("Latte", 5.50),
    ("Cold Brew", 5.50), ("Matcha Latte", 6.00), ("Oat Milk Latte", 6.50),
]
NORMAL_WEIGHTS = [6, 9, 7, 14, 8, 5, 7]
RUSH_WEIGHTS = [4, 7, 10, 18, 6, 4, 11]
FOOD = [("Croissant", 4.50), ("Muffin", 3.50), ("Avocado Toast", 8.50)]
CUSTOMERS = ["Emma", "Liam", "Olivia", "Noah", "Ava", "Prof. Hayes", "Chloe", "Kai", None]


# =========================================================================
# Internal helpers
# =========================================================================
def _ensure_scheduler() -> None:
    if not _scheduler.running:
        _scheduler.start()


def _is_demo_rush_hour() -> bool:
    return datetime.now().hour in RUSH_HOURS


def _build_order_items(rush: bool) -> tuple[list, float]:
    weights = RUSH_WEIGHTS if rush else NORMAL_WEIGHTS
    line_items = []
    drink, price = random.choices(DRINKS, weights=weights, k=1)[0]
    line_items.append({"name": drink, "price": price, "quantity": 1})
    if random.random() < (0.25 if rush else 0.35):
        food, fprice = random.choice(FOOD)
        line_items.append({"name": food, "price": fprice, "quantity": 1})
    total = round(sum(li["price"] * li["quantity"] for li in line_items), 2)
    return line_items, total


def _consume_inventory(db, line_items: list) -> None:
    """Decrement inventory for an order using the same recipe map as burn-rate analytics."""
    from routers.inventory import RECIPES  # local import avoids any import cycle

    by_name = {i.name: i for i in db.query(InventoryItem).all()}
    for li in line_items:
        recipe = RECIPES.get(li["name"], [])
        qty = li.get("quantity", 1)
        for inv_name, per_unit in recipe:
            item = by_name.get(inv_name)
            if item is not None:
                item.quantity = max(0.0, round(item.quantity - per_unit * qty, 3))


def _make_one_order(db, rush: bool = False) -> Order:
    line_items, total = _build_order_items(rush)
    order = Order(
        created_at=datetime.now(),
        items=json.dumps(line_items),
        total_price=total,
        payment_method=random.choice(["card", "card", "mobile", "cash"]),
        status=random.choice(["pending", "preparing"]),
        customer_name=random.choice(CUSTOMERS),
        order_type=random.choice(["takeaway", "takeaway", "dine_in"]),
    )
    db.add(order)
    _consume_inventory(db, line_items)
    db.commit()
    db.refresh(order)
    return order


def _invalidate_caches() -> None:
    analytics.clear_caches()
    ai_service._briefing_cache.update(data=None, expires=datetime.min)


# =========================================================================
# 1. Continuous order simulation
# =========================================================================
def _schedule_next_tick(initial: bool = False) -> None:
    delay = 2 if initial else random.uniform(30, 45)
    _scheduler.add_job(
        _simulation_tick, "date",
        run_date=datetime.now() + timedelta(seconds=delay),
        id=SIM_JOB_ID, replace_existing=True,
    )


def _simulation_tick() -> None:
    """Create 1 order (2 during rush hours), then reschedule itself 30-45s out."""
    try:
        db = SessionLocal()
        try:
            count = random.randint(1, 2) if _is_demo_rush_hour() else 1
            for _ in range(count):
                _make_one_order(db, rush=_is_demo_rush_hour())
        finally:
            db.close()
        _invalidate_caches()
    except Exception as exc:  # never let one bad tick stop the stream
        logger.warning("Simulation tick failed: %s", exc)
    finally:
        if _state["running"]:
            _schedule_next_tick()


def start_order_simulation() -> dict:
    """Begin streaming ~1 order every 30-45 seconds (more during rush hours)."""
    _ensure_scheduler()
    if _state["running"] and _scheduler.get_job(SIM_JOB_ID):
        return {"status": "already_running", "interval": "30-45s"}
    _state["running"] = True
    _schedule_next_tick(initial=True)
    logger.info("Demo order simulation started.")
    return {"status": "started", "interval": "30-45s", "note": "More orders during 8-9am & 12-1pm."}


def stop_order_simulation() -> dict:
    _state["running"] = False
    if _scheduler.running and _scheduler.get_job(SIM_JOB_ID):
        _scheduler.remove_job(SIM_JOB_ID)
    return {"status": "stopped"}


# =========================================================================
# 2. Rush-hour burst
# =========================================================================
def _rush_worker() -> None:
    try:
        db = SessionLocal()
        try:
            _make_one_order(db, rush=True)
        finally:
            db.close()
        _invalidate_caches()
    except Exception as exc:
        logger.warning("Rush worker failed: %s", exc)


def trigger_rush_hour(count: int | None = None) -> dict:
    """Fire 8-12 orders in rapid succession (2-3s apart) to mimic a real rush."""
    _ensure_scheduler()
    n = count if count is not None else random.randint(8, 12)
    base = datetime.now()
    elapsed = 0.0
    for i in range(n):
        elapsed += random.uniform(2, 3)
        _scheduler.add_job(
            _rush_worker, "date",
            run_date=base + timedelta(seconds=elapsed),
            id=f"demo_rush_{base.timestamp()}_{i}", replace_existing=True,
        )
    logger.info("Triggered rush of %d orders.", n)
    return {
        "status": "rush_triggered",
        "orders": n,
        "spacing": "2-3s apart",
        "duration_seconds": round(elapsed),
        "note": "Watch inventory drop and AI alerts fire.",
    }


# =========================================================================
# 3. Force a critical low-stock alert
# =========================================================================
def trigger_low_stock_alert() -> dict:
    """Crash Oat Milk to a critical level and surface the urgent AI reorder rec."""
    db = SessionLocal()
    try:
        oat = db.query(InventoryItem).filter(InventoryItem.name == "Oat Milk").first()
        if oat is None:
            return {"status": "error", "detail": "Oat Milk item not found — run reset first."}
        oat.quantity = 0.5
        db.commit()

        from routers.inventory import compute_daily_usage

        usage = round(compute_daily_usage(db).get("Oat Milk", 3.0), 3)
        alert = {
            "item": "Oat Milk", "units_per_day": usage, "current_qty": 0.5,
            "cost_per_unit": oat.cost_per_unit, "unit": oat.unit,
            "supplier": oat.supplier, "urgency": "critical",
        }
    finally:
        db.close()

    _invalidate_caches()
    recs = ai_service.get_reorder_recommendations([alert])
    return {
        "status": "low_stock_triggered",
        "item": "Oat Milk",
        "new_quantity": 0.5,
        "urgency": "critical",
        "recommendation": recs[0] if recs else None,
        "note": "Oat Milk is now critical (~0.2 days left). Check AI reorder recommendations.",
    }


# =========================================================================
# 4. Reset to clean seed data
# =========================================================================
def reset_demo() -> dict:
    """Stop simulation and restore the original 30-day seed data."""
    stop_order_simulation()
    # Clear any pending rush jobs.
    if _scheduler.running:
        for job in _scheduler.get_jobs():
            if job.id.startswith("demo_rush_"):
                job.remove()

    from seed_data import seed

    counts = seed(force=True)
    _invalidate_caches()
    logger.info("Demo reset to seed data.")
    return {"status": "reset", **counts}


def get_status() -> dict:
    return {
        "simulation_running": _state["running"],
        "scheduler_running": _scheduler.running,
        "pending_jobs": len(_scheduler.get_jobs()) if _scheduler.running else 0,
    }

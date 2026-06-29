"""Seed BrewIQ with 30 days of realistic data for "The Daily Grind".

Story: a campus coffee shop, open 7am-9pm, with a morning rush (8-10am) and a
lunch rush (12-2pm). Busy weekdays, quieter weekends, one freak-busy day and one
dead day. It's running LOW on oat milk, Colombian beans, and 12oz cups -- which is
what lights up the AI restock alerts in the demo.

Usage:
    python seed_data.py            # seed only if the DB is empty (idempotent)
    python seed_data.py --force    # wipe and reseed from scratch

On startup, main.py calls seed_if_empty() so a fresh clone is demo-ready instantly.
"""
import json
import random
import sys
from collections import Counter, defaultdict
from datetime import date as date_type
from datetime import datetime, time, timedelta

from database import Base, SessionLocal, engine, init_db
from models import AIInsight, DailyMetric, InventoryItem, Order, Shift, Staff

random.seed(42)  # stable story: same busy/slow days every seed

SHOP_NAME = "The Daily Grind"
OPEN_HOUR, CLOSE_HOUR = 7, 21
DAYS = 30

# (name, price, category) — categories map loosely to the menu sections.
MENU = [
    ("Espresso", 3.50, "coffee"),
    ("Americano", 4.00, "coffee"),
    ("Cappuccino", 5.00, "coffee"),
    ("Latte", 5.50, "coffee"),
    ("Cold Brew", 5.50, "coffee"),
    ("Matcha Latte", 6.00, "tea"),
    ("Oat Milk Latte", 6.50, "coffee"),
    ("Croissant", 4.50, "food"),
    ("Muffin", 3.50, "food"),
    ("Avocado Toast", 8.50, "food"),
]
# Popularity weights (campus crowd loves lattes and americanos).
DRINKS = MENU[:7]
DRINK_WEIGHTS = [6, 9, 7, 14, 8, 5, 7]
FOOD = MENU[7:]
FOOD_WEIGHTS = [5, 4, 2]

# Hourly demand curve across opening hours (7..20). Twin peaks: 8-10 and 12-2.
HOUR_WEIGHTS = {
    7: 4, 8: 11, 9: 11, 10: 6, 11: 5, 12: 10, 13: 10,
    14: 5, 15: 4, 16: 4, 17: 3, 18: 3, 19: 2, 20: 1,
}

PAYMENTS = ["card", "card", "card", "mobile", "mobile", "cash"]
ORDER_TYPES = ["takeaway", "takeaway", "takeaway", "dine_in"]
CUSTOMERS = [
    "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Mason",
    "Isabella", "Lucas", "Mia", "Aiden", "Prof. Hayes", "Dr. Okafor",
    "Chloe", "Jackson", "Riley", "Zoe", "Kai", "Nina",
]

# Inventory — the three LOW items below their reorder level drive the AI alerts.
INVENTORY = [
    # name, category, qty, unit, reorder_level, cost, supplier, days_since_restock
    ("Colombian Beans", "beans", 3, "kg", 10, 18.0, "Andes Coffee Importers", 9),
    ("Espresso Blend Beans", "beans", 22, "kg", 10, 16.0, "Andes Coffee Importers", 2),
    ("Oat Milk", "milk", 5, "liters", 15, 2.50, "Oatly Wholesale", 8),
    ("Whole Milk", "milk", 42, "liters", 20, 1.20, "Campus Dairy Co.", 1),
    ("Almond Milk", "milk", 17, "liters", 10, 2.80, "Campus Dairy Co.", 3),
    ("Vanilla Syrup", "syrups", 8, "units", 5, 6.00, "Monin Supply", 6),
    ("Caramel Syrup", "syrups", 9, "units", 5, 6.00, "Monin Supply", 6),
    ("Matcha Powder", "syrups", 4, "kg", 2, 35.0, "Kyoto Tea Co.", 4),
    ("Disposable Cups 12oz", "cups", 80, "units", 200, 0.12, "EcoPack Supplies", 10),
    ("Disposable Cups 16oz", "cups", 360, "units", 200, 0.14, "EcoPack Supplies", 4),
    ("Lids", "cups", 520, "units", 300, 0.04, "EcoPack Supplies", 4),
    ("Napkins", "cups", 1600, "units", 500, 0.01, "EcoPack Supplies", 7),
    ("Croissants", "food", 36, "units", 24, 0.90, "Sunrise Bakery", 1),
    ("Muffins", "food", 22, "units", 20, 0.80, "Sunrise Bakery", 1),
    ("Avocados", "food", 28, "units", 15, 0.70, "Green Valley Produce", 2),
]

# Staff — two on the opening crew, two on the closing crew.
STAFF = [
    # name, role, shift_start, shift_end, hourly_rate
    ("Maya Rodriguez", "manager", time(7, 0), time(15, 0), 26.0),
    ("Jordan Lee", "barista", time(7, 0), time(15, 0), 17.0),
    ("Priya Sharma", "barista", time(13, 0), time(21, 0), 16.5),
    ("Diego Torres", "cashier", time(13, 0), time(21, 0), 15.5),
]

WEEKDAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
]


def _build_order_items() -> tuple[str, float]:
    """Pick a realistic basket: a drink, often a pastry, occasionally a second drink."""
    line_items = []

    drink, price, _ = random.choices(DRINKS, weights=DRINK_WEIGHTS, k=1)[0]
    line_items.append({"name": drink, "price": price, "quantity": 1})

    if random.random() < 0.35:  # add a pastry
        food, fprice, _ = random.choices(FOOD, weights=FOOD_WEIGHTS, k=1)[0]
        line_items.append({"name": food, "price": fprice, "quantity": 1})

    if random.random() < 0.12:  # second coffee (a pair grabbing drinks)
        d2, p2, _ = random.choices(DRINKS, weights=DRINK_WEIGHTS, k=1)[0]
        line_items.append({"name": d2, "price": p2, "quantity": 1})

    total = round(sum(li["price"] * li["quantity"] for li in line_items), 2)
    return json.dumps(line_items), total


def _allowed_hours(day: date_type, now: datetime) -> list[int]:
    """All open hours, but don't generate future orders for today."""
    hours = list(HOUR_WEIGHTS.keys())
    if day == now.date():
        hours = [h for h in hours if h <= now.hour]
    return hours


def _order_count(day: date_type, busy_day: date_type, slow_day: date_type, now: datetime) -> int:
    weekend = day.weekday() >= 5
    if day == busy_day:
        base = random.randint(195, 220)          # campus event / finals week
    elif day == slow_day:
        base = random.randint(20, 30)            # rainy dead day
    elif weekend:
        base = random.randint(40, 70)
    else:
        base = random.randint(80, 150)

    if day == now.date():
        # Today is partial — scale by how much of the open day has elapsed.
        open_hours = [h for h in HOUR_WEIGHTS if h <= now.hour]
        fraction = len(open_hours) / len(HOUR_WEIGHTS)
        base = int(base * fraction)
    return base


def _seed_orders(db, now: datetime):
    """Create 30 days of orders and return per-day aggregates for daily_metrics."""
    days = [now.date() - timedelta(days=offset) for offset in range(DAYS - 1, -1, -1)]
    weekday_pool = [d for d in days if d.weekday() < 5]
    busy_day = weekday_pool[-3] if weekday_pool else days[-2]   # a recent weekday
    slow_day = days[len(days) // 2]                             # mid-window dead day

    # Per-day rollups for the daily_metrics table.
    metrics: dict[date_type, dict] = {}
    dow_totals: Counter = Counter()
    todays_orders: list[Order] = []

    for day in days:
        hours = _allowed_hours(day, now)
        if not hours:
            continue
        weights = [HOUR_WEIGHTS[h] for h in hours]
        count = _order_count(day, busy_day, slow_day, now)

        hour_counter: Counter = Counter()
        item_counter: Counter = Counter()
        revenue = 0.0

        for _ in range(count):
            hour = random.choices(hours, weights=weights, k=1)[0]
            ts = datetime.combine(
                day, time(hour, random.randint(0, 59), random.randint(0, 59))
            )
            items_json, total = _build_order_items()
            order = Order(
                created_at=ts,
                items=items_json,
                total_price=total,
                payment_method=random.choice(PAYMENTS),
                status="completed",
                customer_name=random.choice(CUSTOMERS) if random.random() < 0.6 else None,
                order_type=random.choice(ORDER_TYPES),
            )
            db.add(order)

            revenue += total
            hour_counter[hour] += 1
            for li in json.loads(items_json):
                item_counter[li["name"]] += li["quantity"]
            if day == now.date():
                todays_orders.append(order)

        dow_totals[day.weekday()] += count
        metrics[day] = {
            "total_orders": count,
            "total_revenue": round(revenue, 2),
            "avg_order_value": round(revenue / count, 2) if count else 0.0,
            "peak_hour": hour_counter.most_common(1)[0][0] if hour_counter else None,
            "top_item": item_counter.most_common(1)[0][0] if item_counter else None,
        }

    # A handful of today's most recent orders are still in the live pipeline.
    todays_orders.sort(key=lambda o: o.created_at)
    for o, status in zip(reversed(todays_orders), ["pending", "preparing", "ready", "preparing"]):
        o.status = status

    busiest_dow = WEEKDAY_NAMES[dow_totals.most_common(1)[0][0]] if dow_totals else None
    for day, m in metrics.items():
        db.add(DailyMetric(date=day, busiest_day_of_week=busiest_dow, **m))

    db.flush()
    return metrics, busy_day, slow_day


def _seed_inventory(db, now: datetime):
    for name, category, qty, unit, reorder, cost, supplier, days_ago in INVENTORY:
        db.add(
            InventoryItem(
                name=name,
                category=category,
                quantity=qty,
                unit=unit,
                reorder_level=reorder,
                cost_per_unit=cost,
                supplier=supplier,
                last_restocked_at=now - timedelta(days=days_ago),
            )
        )
    db.flush()


def _seed_staff_and_shifts(db, now: datetime) -> int:
    members = []
    for name, role, start, end, rate in STAFF:
        m = Staff(
            name=name, role=role, shift_start=start, shift_end=end,
            hourly_rate=rate, is_active=True,
        )
        db.add(m)
        members.append(m)
    db.flush()

    opening_crew = members[:2]   # Maya + Jordan
    closing_crew = members[2:]   # Priya + Diego

    shift_count = 0
    for offset in range(DAYS - 1, -1, -1):
        day = now.date() - timedelta(days=offset)
        weekend = day.weekday() >= 5
        # Weekends run a lighter roster: one opener + one closer.
        crew = ([opening_crew[0], closing_crew[0]] if weekend
                else opening_crew + closing_crew)
        for member in crew:
            note = None
            if weekend:
                note = "Weekend light roster"
            elif day.weekday() == 0:
                note = "Monday restock & open"
            db.add(
                Shift(
                    staff_id=member.id,
                    date=day,
                    start_time=member.shift_start,
                    end_time=member.shift_end,
                    notes=note,
                )
            )
            shift_count += 1
    db.flush()
    return shift_count


def _seed_insights(db, now: datetime, metrics: dict):
    """Seed a couple of AI insights so the Insights feed isn't empty on first load."""
    low_items = [i.name for i in db.query(InventoryItem).all()
                 if i.quantity <= i.reorder_level]
    snapshot = {
        "low_stock_items": low_items,
        "tracked_days": len(metrics),
    }
    db.add(
        AIInsight(
            created_at=now,
            insight_type="restock",
            content=(
                f"3 items are at or below reorder level: {', '.join(low_items)}. "
                "Colombian Beans and 12oz cups are critical before tomorrow's morning "
                "rush — place a supplier order today."
            ),
            data_snapshot=json.dumps(snapshot),
        )
    )
    db.add(
        AIInsight(
            created_at=now - timedelta(hours=6),
            insight_type="briefing",
            content=(
                "Weekday mornings (8-10am) remain your strongest window. Lattes and "
                "Americanos drive most revenue. Keep both openers on the bar through "
                "the 10am lull to clear the rush faster."
            ),
            data_snapshot=json.dumps({"peak_window": "08:00-10:00"}),
        )
    )
    db.flush()


def _counts(db) -> dict:
    return {
        "orders": db.query(Order).count(),
        "inventory": db.query(InventoryItem).count(),
        "staff": db.query(Staff).count(),
        "shifts": db.query(Shift).count(),
        "insights": db.query(AIInsight).count(),
        "metrics": db.query(DailyMetric).count(),
    }


def seed(force: bool = False) -> dict:
    """Seed the database. Idempotent: a no-op if data already exists (unless force)."""
    if force:
        Base.metadata.drop_all(bind=engine)
    init_db()

    db = SessionLocal()
    try:
        if db.query(Order).first() is not None and not force:
            counts = _counts(db)
            print(f"[skip] Database already seeded - {counts['orders']} orders present. "
                  "Use --force to wipe and reseed.")
            return counts

        now = datetime.now()
        metrics, busy_day, slow_day = _seed_orders(db, now)
        _seed_inventory(db, now)
        shift_count = _seed_staff_and_shifts(db, now)
        _seed_insights(db, now, metrics)
        db.commit()

        counts = _counts(db)
        print(f"\n  {SHOP_NAME} - {DAYS} days of campus coffee, seeded.")
        print(f"  Busy day: {busy_day:%a %b %d}  |  Slow day: {slow_day:%a %b %d}")
        print("  Low on: Colombian Beans, Oat Milk, Disposable Cups 12oz (AI alerts armed)")
        print(
            f"\n[OK] Seeded: {counts['orders']} orders, {counts['inventory']} inventory items, "
            f"{counts['staff']} staff, {counts['shifts']} shifts "
            f"({counts['metrics']} daily metrics, {counts['insights']} AI insights)"
        )
        return counts
    finally:
        db.close()


def seed_if_empty() -> dict:
    """Called on startup — seeds only when the orders table is empty."""
    init_db()
    db = SessionLocal()
    try:
        empty = db.query(Order).first() is None
    finally:
        db.close()
    if empty:
        print(f"[startup] Empty database detected — seeding {SHOP_NAME}…")
        return seed()
    return {}


if __name__ == "__main__":
    seed(force="--force" in sys.argv)

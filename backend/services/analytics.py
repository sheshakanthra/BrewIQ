"""Analytics helpers shared by the REST API and the AI service.

Each public function opens its own short-lived session and returns plain,
JSON-serializable data, so it can be called from a FastAPI route or dropped into
the AI grounding context without passing a Session around.

Results are cached in memory for 5 minutes. We build a time-aware wrapper on top of
`functools.lru_cache` (which has no native TTL): the cache is cleared once the
lifetime elapses, then repopulated on the next call.
"""
import json
import math
from collections import Counter, defaultdict
from datetime import date as date_type
from datetime import datetime, time, timedelta
from functools import lru_cache, wraps

from database import SessionLocal
from models import Order

OPEN_HOUR, CLOSE_HOUR = 7, 21  # store open 7am-9pm; rush hours live within this.
OPEN_HOURS = list(range(OPEN_HOUR, CLOSE_HOUR))
WEEKDAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
]
CACHE_TTL_SECONDS = 300  # 5 minutes


def timed_lru_cache(seconds: int = CACHE_TTL_SECONDS, maxsize: int = 32):
    """`functools.lru_cache` with a wall-clock TTL: clears itself once stale."""
    def decorator(func):
        cached = lru_cache(maxsize=maxsize)(func)
        cached.lifetime = timedelta(seconds=seconds)
        cached.expiration = datetime.now() + cached.lifetime

        @wraps(func)
        def wrapper(*args, **kwargs):
            if datetime.now() >= cached.expiration:
                cached.cache_clear()
                cached.expiration = datetime.now() + cached.lifetime
            return cached(*args, **kwargs)

        wrapper.cache_clear = cached.cache_clear  # expose for tests/manual refresh
        return wrapper

    return decorator


# ------------------------------- internals --------------------------------
def _order_value(order: Order) -> float:
    return order.total_price or 0.0


def _window_stats(orders: list[Order], start: date_type, end: date_type) -> dict:
    """Aggregate orders whose date falls in [start, end] inclusive."""
    revenue = 0.0
    count = 0
    for o in orders:
        if o.created_at and start <= o.created_at.date() <= end:
            revenue += _order_value(o)
            count += 1
    return {
        "orders": count,
        "revenue": round(revenue, 2),
        "avg_order_value": round(revenue / count, 2) if count else 0.0,
    }


def _pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 0.0 if current == 0 else 100.0
    return round((current - previous) / previous * 100, 1)


# ----------------------------- public API ---------------------------------
@timed_lru_cache()
def get_revenue_trend(days: int = 7) -> list[dict]:
    """Daily revenue + order count for the last `days` days (oldest first)."""
    db = SessionLocal()
    try:
        today = datetime.now().date()
        start = today - timedelta(days=days - 1)
        orders = db.query(Order).filter(Order.created_at >= datetime.combine(start, time.min)).all()
    finally:
        db.close()

    buckets = {
        (start + timedelta(days=i)): {"revenue": 0.0, "orders": 0}
        for i in range(days)
    }
    for o in orders:
        key = o.created_at.date()
        if key in buckets:
            buckets[key]["revenue"] += _order_value(o)
            buckets[key]["orders"] += 1

    return [
        {
            "date": day.isoformat(),
            "day_of_week": WEEKDAY_NAMES[day.weekday()],
            "revenue": round(b["revenue"], 2),
            "orders": b["orders"],
        }
        for day, b in sorted(buckets.items())
    ]


@timed_lru_cache()
def get_rush_hour_matrix() -> dict:
    """Average orders for every (day-of-week x hour) cell across all history.

    avg = total orders in that weekday+hour bucket / number of distinct dates
    of that weekday in the dataset. This is the demand signal staffing is graded against.
    """
    db = SessionLocal()
    try:
        orders = db.query(Order.created_at).all()
    finally:
        db.close()

    bucket_counts: dict[tuple[int, int], int] = Counter()
    dates_per_dow: dict[int, set] = defaultdict(set)
    for (created_at,) in orders:
        if not created_at:
            continue
        dow = created_at.weekday()
        hour = created_at.hour
        bucket_counts[(dow, hour)] += 1
        dates_per_dow[dow].add(created_at.date())

    matrix: dict[str, dict[int, float]] = {}
    cells: list[dict] = []
    for dow, day_name in enumerate(WEEKDAY_NAMES):
        n_days = len(dates_per_dow.get(dow, set())) or 1
        matrix[day_name] = {}
        for hour in OPEN_HOURS:
            avg = round(bucket_counts.get((dow, hour), 0) / n_days, 2)
            matrix[day_name][hour] = avg
            cells.append(
                {"day_of_week": day_name, "day_index": dow, "hour": hour, "avg_orders": avg}
            )

    return {"hours": OPEN_HOURS, "days_of_week": WEEKDAY_NAMES, "matrix": matrix, "cells": cells}


def get_expected_orders_by_hour(weekday_index: int) -> dict[int, float]:
    """Expected orders per open hour for a given weekday (0=Mon), from the rush matrix."""
    matrix = get_rush_hour_matrix()["matrix"]
    return matrix.get(WEEKDAY_NAMES[weekday_index], {})


@timed_lru_cache()
def get_weekly_comparison() -> dict:
    """This week (last 7 days incl. today) vs the prior 7 days, across all KPIs."""
    db = SessionLocal()
    try:
        today = datetime.now().date()
        earliest = today - timedelta(days=13)
        orders = db.query(Order).filter(
            Order.created_at >= datetime.combine(earliest, time.min)
        ).all()
    finally:
        db.close()

    this_start = today - timedelta(days=6)
    last_start, last_end = today - timedelta(days=13), today - timedelta(days=7)

    this_week = _window_stats(orders, this_start, today)
    last_week = _window_stats(orders, last_start, last_end)

    return {
        "this_week": {**this_week, "start": this_start.isoformat(), "end": today.isoformat()},
        "last_week": {**last_week, "start": last_start.isoformat(), "end": last_end.isoformat()},
        "change_pct": {
            "orders": _pct_change(this_week["orders"], last_week["orders"]),
            "revenue": _pct_change(this_week["revenue"], last_week["revenue"]),
            "avg_order_value": _pct_change(
                this_week["avg_order_value"], last_week["avg_order_value"]
            ),
        },
    }


@timed_lru_cache()
def predict_tomorrow_rush() -> dict:
    """Forecast tomorrow's peak hour and expected order count from historical patterns."""
    tomorrow = datetime.now().date() + timedelta(days=1)
    hourly = get_expected_orders_by_hour(tomorrow.weekday())

    forecast = [
        {"hour": h, "expected_orders": round(hourly.get(h, 0.0))}
        for h in OPEN_HOURS
    ]
    peak = max(forecast, key=lambda c: c["expected_orders"]) if forecast else {"hour": None}
    expected_total = round(sum(hourly.values()))

    return {
        "date": tomorrow.isoformat(),
        "day_of_week": WEEKDAY_NAMES[tomorrow.weekday()],
        "peak_hour": peak["hour"],
        "peak_hour_orders": peak.get("expected_orders", 0),
        "expected_orders": expected_total,
        "hourly_forecast": forecast,
    }


@timed_lru_cache()
def get_top_items(limit: int = 5) -> list[dict]:
    """Best-selling menu items by revenue (parsed from each order's items JSON)."""
    db = SessionLocal()
    try:
        orders = db.query(Order.items).all()
    finally:
        db.close()

    revenue: dict[str, float] = defaultdict(float)
    qty: dict[str, int] = defaultdict(int)
    for (items_json,) in orders:
        try:
            for li in json.loads(items_json or "[]"):
                revenue[li["name"]] += li["price"] * li.get("quantity", 1)
                qty[li["name"]] += li.get("quantity", 1)
        except (json.JSONDecodeError, TypeError, KeyError):
            continue

    ranked = sorted(revenue.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [
        {"item": name, "revenue": round(rev, 2), "quantity": qty[name]}
        for name, rev in ranked
    ]


def clear_caches() -> None:
    """Drop all memoized analytics so the next read reflects fresh data.

    Used by the demo simulator after it writes orders, so dashboards update live.
    """
    for fn in (
        get_revenue_trend, get_rush_hour_matrix, get_weekly_comparison,
        predict_tomorrow_rush, get_top_items,
    ):
        fn.cache_clear()


def staff_needed_for(expected_orders: float, orders_per_barista: float = 5.0) -> int:
    """Translate predicted hourly demand into a baristas-needed count (min 1 when open)."""
    if expected_orders <= 0:
        return 1
    return max(1, math.ceil(expected_orders / orders_per_barista))

"""AI routes for BrewIQ.

Exposes the three Groq features (briefing, rush insights, reorder), a heuristic
smart-schedule planner, and a demo-only order simulator. Every AI generation is
persisted to the ai_insights table, and Groq-backed calls pass through an in-memory
rate limiter (30/min) so we stay comfortably under the free-tier ceiling.
"""
import json
import random
import time
from collections import deque
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
from models import AIInsight, InventoryItem, Order, Shift
from services import ai_service, analytics

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ============================ Rate limiting ===============================
class RateLimiter:
    """Sliding-window limiter: at most `max_calls` within `window` seconds."""

    def __init__(self, max_calls: int = 30, window: float = 60.0):
        self.max_calls = max_calls
        self.window = window
        self._hits: deque[float] = deque()

    def check_or_429(self) -> None:
        now = time.monotonic()
        while self._hits and now - self._hits[0] > self.window:
            self._hits.popleft()
        if len(self._hits) >= self.max_calls:
            retry = round(self.window - (now - self._hits[0]), 1)
            raise HTTPException(
                status_code=429,
                detail=f"AI rate limit reached ({self.max_calls}/min). Retry in ~{retry}s.",
            )
        self._hits.append(now)


groq_limiter = RateLimiter(max_calls=30, window=60.0)


def _maybe_rate_limit() -> None:
    """Only consume the Groq quota when a real key is configured."""
    if ai_service.groq_configured():
        groq_limiter.check_or_429()


# ============================== Logging ===================================
def _log_insight(db: Session, insight_type: str, content: str, snapshot: Any) -> None:
    """Persist an AI response to ai_insights (best-effort; never blocks the response)."""
    try:
        db.add(
            AIInsight(
                insight_type=insight_type,
                content=content if isinstance(content, str) else json.dumps(content, default=str),
                data_snapshot=json.dumps(snapshot, default=str),
            )
        )
        db.commit()
    except Exception:
        db.rollback()


# ============================== Schemas ===================================
class BriefingResponse(BaseModel):
    briefing_text: str
    alerts_count: int
    generated_at: str
    model: str
    key_metrics: dict


class RushInsightsResponse(BaseModel):
    explanation: str
    peak_hour: Optional[int]
    recommendation: str
    generated_at: str


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    model: str
    generated_at: str


class InsightOut(BaseModel):
    id: int
    type: str
    content: str
    created_at: str


class ReorderRequest(BaseModel):
    items: list[dict] = []


class ReorderRec(BaseModel):
    item: str
    recommended_qty: float
    estimated_cost: float
    urgency: str
    reason: str
    reasoning_steps: list[dict] = []


class ScheduleGap(BaseModel):
    date: str
    day_of_week: str
    hour: int
    expected_orders: float
    suggested_count: int
    current_count: int
    gap: int


class SimulatedOrder(BaseModel):
    id: int
    created_at: str
    items: list[dict]
    total_price: float
    payment_method: str
    status: str
    customer_name: Optional[str]
    order_type: str


# ============================ Endpoints ===================================
@router.post("/briefing", response_model=BriefingResponse)
def daily_briefing(
    refresh: bool = Query(False, description="Force regenerate, bypassing the 30-min cache"),
    db: Session = Depends(get_db),
):
    cache = ai_service._briefing_cache
    fresh = cache["data"] is not None and datetime.now() < cache["expires"]
    will_generate = refresh or not fresh

    if will_generate:
        _maybe_rate_limit()

    result = ai_service.generate_daily_briefing(db, force=refresh)

    # Log only freshly generated briefings (cached returns were logged already).
    if will_generate:
        _log_insight(db, "briefing", result["briefing_text"], result["key_metrics"])
    return result


@router.get("/rush-insights", response_model=RushInsightsResponse)
def rush_insights(db: Session = Depends(get_db)):
    analytics_data = {
        "rush_matrix": analytics.get_rush_hour_matrix(),
        "tomorrow": analytics.predict_tomorrow_rush(),
    }
    _maybe_rate_limit()
    explanation = ai_service.explain_rush_patterns(analytics_data)

    tomorrow = analytics_data["tomorrow"]
    peak_hour = tomorrow.get("peak_hour")
    peak_orders = tomorrow.get("peak_hour_orders", 0)
    needed = analytics.staff_needed_for(peak_orders)
    recommendation = (
        f"Tomorrow ({tomorrow.get('day_of_week', '')}) peaks near {peak_hour}:00 "
        f"(~{peak_orders} orders that hour) — schedule about {needed} on bar."
        if peak_hour is not None else "Not enough data to recommend staffing yet."
    )
    generated_at = datetime.now().isoformat()

    _log_insight(db, "rush", explanation, {"peak_hour": peak_hour, "tomorrow": tomorrow})
    return RushInsightsResponse(
        explanation=explanation,
        peak_hour=peak_hour,
        recommendation=recommendation,
        generated_at=generated_at,
    )


@router.post("/reorder-recommendations", response_model=list[ReorderRec])
def reorder_recommendations(payload: ReorderRequest, db: Session = Depends(get_db)):
    if not payload.items:
        return []

    # Enrich each alert with live DB facts (cost, unit, real burn rate) so the
    # recommendations are accurate regardless of how thin the client payload is.
    from routers.inventory import compute_daily_usage

    usage = compute_daily_usage(db)
    by_name = {i.name: i for i in db.query(InventoryItem).all()}
    enriched = []
    for raw in payload.items:
        name = raw.get("item") or raw.get("name")
        item = by_name.get(name)
        merged = dict(raw)
        merged["item"] = name
        if item is not None:
            merged.setdefault("cost_per_unit", item.cost_per_unit)
            merged.setdefault("unit", item.unit)
            merged.setdefault("current_qty", item.quantity)
            merged.setdefault("supplier", item.supplier)
            merged.setdefault("units_per_day", round(usage.get(name, 0.0), 3))
        enriched.append(merged)

    _maybe_rate_limit()
    recs = ai_service.get_reorder_recommendations(enriched)

    _log_insight(
        db, "reorder",
        json.dumps([{k: r[k] for k in ("item", "recommended_qty", "estimated_cost")} for r in recs]),
        {"items": [e.get("item") for e in enriched]},
    )
    return recs


@router.post("/ask")
def ask(payload: AskRequest, db: Session = Depends(get_db)):
    """Stream a free-form answer grounded in live business data (Groq Llama 3.3).

    Returns text/plain chunks. The full business context is gathered up front (sync,
    on the request session); logging happens on its own session after the stream ends.
    """
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    _maybe_rate_limit()
    snapshot = ai_service._business_snapshot(db)
    model = ai_service.MAIN_MODEL if ai_service.groq_configured() else "fallback-rules"

    def generate():
        collected: list[str] = []
        try:
            for delta in ai_service.stream_chat(question, snapshot):
                collected.append(delta)
                yield delta
        finally:
            answer = "".join(collected).strip()
            if answer:
                log_db = SessionLocal()
                try:
                    log_db.add(AIInsight(
                        insight_type="chat",
                        content=f"Q: {question}\nA: {answer}",
                        data_snapshot=json.dumps({"question": question, "model": model}),
                    ))
                    log_db.commit()
                except Exception:
                    log_db.rollback()
                finally:
                    log_db.close()

    return StreamingResponse(
        generate(),
        media_type="text/plain",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/insights", response_model=list[InsightOut])
def list_insights(
    limit: int = Query(20, ge=1, le=100),
    today_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Recent AI insights — powers the AI Activity Log timeline."""
    q = db.query(AIInsight)
    if today_only:
        start = datetime.combine(datetime.now().date(), datetime.min.time())
        q = q.filter(AIInsight.created_at >= start)
    rows = q.order_by(AIInsight.created_at.desc()).limit(limit).all()
    return [
        InsightOut(
            id=r.id,
            type=r.insight_type,
            content=(r.content[:200] + "…") if len(r.content) > 200 else r.content,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.get("/smart-schedule", response_model=list[ScheduleGap])
def smart_schedule(
    days: int = Query(7, ge=1, le=14, description="Days ahead to plan"),
    db: Session = Depends(get_db),
):
    """Per-hour staffing gaps for the next `days`, from predicted demand vs scheduled shifts."""
    today = datetime.now().date()
    gaps: list[ScheduleGap] = []

    for offset in range(days):
        day = today + timedelta(days=offset)
        expected_by_hour = analytics.get_expected_orders_by_hour(day.weekday())
        shifts = db.query(Shift).filter(Shift.date == day).all()

        for hour in analytics.OPEN_HOURS:
            expected = round(expected_by_hour.get(hour, 0.0), 1)
            suggested = analytics.staff_needed_for(expected)
            current = sum(
                1 for s in shifts
                if s.start_time and s.end_time and s.start_time.hour <= hour < s.end_time.hour
            )
            gap = suggested - current
            if gap > 0:  # only surface understaffed slots
                gaps.append(ScheduleGap(
                    date=day.isoformat(),
                    day_of_week=analytics.WEEKDAY_NAMES[day.weekday()],
                    hour=hour,
                    expected_orders=expected,
                    suggested_count=suggested,
                    current_count=current,
                    gap=gap,
                ))

    _log_insight(
        db, "schedule",
        f"Identified {len(gaps)} understaffed hour-slots over the next {days} days.",
        {"gap_count": len(gaps), "days": days},
    )
    return gaps


# Menu used by the demo order simulator (name, price), with popularity weights.
_SIM_DRINKS = [
    ("Espresso", 3.50), ("Americano", 4.00), ("Cappuccino", 5.00), ("Latte", 5.50),
    ("Cold Brew", 5.50), ("Matcha Latte", 6.00), ("Oat Milk Latte", 6.50),
]
_SIM_DRINK_WEIGHTS = [6, 9, 7, 14, 8, 5, 7]
_SIM_FOOD = [("Croissant", 4.50), ("Muffin", 3.50), ("Avocado Toast", 8.50)]
_SIM_CUSTOMERS = ["Emma", "Liam", "Olivia", "Noah", "Ava", "Prof. Hayes", "Chloe", "Kai", None]


@router.post("/simulate-order", response_model=SimulatedOrder)
def simulate_order(db: Session = Depends(get_db)):
    """Create a realistic random order right now — makes the dashboard feel live in demos."""
    line_items = []
    drink, price = random.choices(_SIM_DRINKS, weights=_SIM_DRINK_WEIGHTS, k=1)[0]
    line_items.append({"name": drink, "price": price, "quantity": 1})
    if random.random() < 0.35:
        food, fprice = random.choice(_SIM_FOOD)
        line_items.append({"name": food, "price": fprice, "quantity": 1})

    total = round(sum(li["price"] * li["quantity"] for li in line_items), 2)
    order = Order(
        created_at=datetime.now(),
        items=json.dumps(line_items),
        total_price=total,
        payment_method=random.choice(["card", "card", "mobile", "cash"]),
        status=random.choice(["pending", "preparing"]),
        customer_name=random.choice(_SIM_CUSTOMERS),
        order_type=random.choice(["takeaway", "takeaway", "dine_in"]),
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    return SimulatedOrder(
        id=order.id,
        created_at=order.created_at.isoformat(),
        items=line_items,
        total_price=order.total_price,
        payment_method=order.payment_method,
        status=order.status,
        customer_name=order.customer_name,
        order_type=order.order_type,
    )

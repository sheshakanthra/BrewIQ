"""Inventory endpoints — stock, reorder alerts, and recipe-based burn-rate analytics.

Orders store *menu items* (Latte, Americano, …), not raw ingredients, so to compute
real usage we map each menu item to the inventory it consumes via RECIPES (a simple
bill-of-materials). Burn rate = ingredient consumption over the last 7 days of orders,
which lets us project days-until-empty and grade urgency. The /alerts payload is shaped
to be dropped straight into the AI grounding context.
"""
import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from database import get_db
from models import InventoryItem, Order

router = APIRouter(prefix="/api/inventory", tags=["inventory"])

USAGE_WINDOW_DAYS = 7

# ---------------------------------------------------------------------------
# Bill of materials: menu item -> [(inventory item name, qty consumed per unit)].
# Quantities are in each ingredient's stocking unit (kg, liters, units).
# ---------------------------------------------------------------------------
RECIPES: dict[str, list[tuple[str, float]]] = {
    # Espresso-machine drinks pull from the house blend; pour-over/cold brew use
    # the single-origin Colombian. Every drink takes a cup + a lid.
    "Espresso": [
        ("Espresso Blend Beans", 0.018),
        ("Disposable Cups 12oz", 1),
        ("Lids", 1),
    ],
    "Americano": [
        ("Colombian Beans", 0.036),
        ("Disposable Cups 12oz", 1),
        ("Lids", 1),
    ],
    "Cappuccino": [
        ("Espresso Blend Beans", 0.018),
        ("Whole Milk", 0.12),
        ("Disposable Cups 12oz", 1),
        ("Lids", 1),
    ],
    "Latte": [
        ("Espresso Blend Beans", 0.018),
        ("Whole Milk", 0.18),
        ("Vanilla Syrup", 0.010),
        ("Caramel Syrup", 0.005),
        ("Disposable Cups 16oz", 1),
        ("Lids", 1),
    ],
    "Cold Brew": [
        ("Colombian Beans", 0.060),
        ("Disposable Cups 16oz", 1),
        ("Lids", 1),
    ],
    "Matcha Latte": [
        ("Matcha Powder", 0.012),
        ("Almond Milk", 0.16),
        ("Disposable Cups 16oz", 1),
        ("Lids", 1),
    ],
    "Oat Milk Latte": [
        ("Espresso Blend Beans", 0.018),
        ("Oat Milk", 0.20),
        ("Disposable Cups 16oz", 1),
        ("Lids", 1),
    ],
    "Croissant": [("Croissants", 1), ("Napkins", 2)],
    "Muffin": [("Muffins", 1), ("Napkins", 1)],
    "Avocado Toast": [("Avocados", 1), ("Napkins", 2)],
}


# --------------------------------- Schemas ---------------------------------
class InventoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    category: str
    quantity: float
    unit: str
    reorder_level: float
    cost_per_unit: float
    supplier: Optional[str] = None
    last_restocked_at: Optional[datetime] = None
    low_stock: bool = False


class AlertOut(BaseModel):
    id: int
    item: str
    category: str
    current_qty: float
    unit: str
    reorder_level: float
    units_per_day: float
    days_until_empty: Optional[float]  # None == no measured usage
    urgency: str  # critical | warning | ok
    supplier: Optional[str] = None


class BurnRateOut(BaseModel):
    item_name: str
    unit: str
    current_qty: float
    units_used_per_day: float
    projected_days_remaining: Optional[float]


class QuantityUpdate(BaseModel):
    quantity: float = Field(ge=0)


class RestockRequest(BaseModel):
    amount: float = Field(gt=0, description="Units added to current stock")
    cost_per_unit: Optional[float] = Field(default=None, ge=0)
    supplier: Optional[str] = None


class RestockResponse(BaseModel):
    message: str
    item: InventoryOut
    restocked_amount: float
    previous_quantity: float
    new_quantity: float
    restocked_at: datetime


# ------------------------------ Core helpers -------------------------------
def _is_low(item: InventoryItem) -> bool:
    return item.quantity <= item.reorder_level


def _to_out(item: InventoryItem) -> InventoryOut:
    out = InventoryOut.model_validate(item)
    out.low_stock = _is_low(item)
    return out


def compute_daily_usage(db: Session, days: int = USAGE_WINDOW_DAYS) -> dict[str, float]:
    """Average per-day consumption of each inventory item over the last `days` days.

    Reads completed-ish orders in the window, expands each menu line item through
    RECIPES, and divides total consumption by the window length.
    """
    since = datetime.now() - timedelta(days=days)
    orders = (
        db.query(Order)
        .filter(Order.created_at >= since)
        .all()
    )

    totals: dict[str, float] = defaultdict(float)
    for order in orders:
        try:
            line_items = json.loads(order.items or "[]")
        except (json.JSONDecodeError, TypeError):
            continue
        for li in line_items:
            recipe = RECIPES.get(li.get("name"))
            if not recipe:
                continue
            qty = li.get("quantity", 1) or 1
            for inv_name, per_unit in recipe:
                totals[inv_name] += per_unit * qty

    return {name: total / days for name, total in totals.items()}


def _days_until_empty(quantity: float, per_day: float) -> Optional[float]:
    if per_day <= 0:
        return None
    return round(quantity / per_day, 1)


def _urgency(days_left: Optional[float], is_low: bool) -> str:
    """Time-pressure grade. None usage on a below-reorder item is still a 'warning'."""
    if days_left is None:
        return "warning" if is_low else "ok"
    if days_left < 2:
        return "critical"
    if days_left < 5:
        return "warning"
    return "ok"


_URGENCY_RANK = {"critical": 0, "warning": 1, "ok": 2}


# ------------------------------- Endpoints ---------------------------------
@router.get("", response_model=list[InventoryOut])
def list_inventory(
    category: Optional[str] = Query(None, description="Filter by category"),
    low_stock: Optional[bool] = Query(None, description="Only items at/below reorder level"),
    db: Session = Depends(get_db),
):
    query = db.query(InventoryItem)
    if category:
        query = query.filter(InventoryItem.category == category)
    items = query.order_by(InventoryItem.name).all()

    out = [_to_out(i) for i in items]
    if low_stock is not None:
        out = [i for i in out if i.low_stock == low_stock]
    return out


@router.get("/alerts", response_model=list[AlertOut])
def inventory_alerts(db: Session = Depends(get_db)):
    """Items at/below reorder level, enriched with burn rate and sorted by urgency.

    This is the payload the AI consumes — accurate `days_until_empty` and `urgency`
    let it write specific, prioritized restock recommendations.
    """
    usage = compute_daily_usage(db)
    items = db.query(InventoryItem).all()

    alerts: list[AlertOut] = []
    for item in items:
        if not _is_low(item):
            continue
        per_day = round(usage.get(item.name, 0.0), 3)
        days_left = _days_until_empty(item.quantity, per_day)
        alerts.append(
            AlertOut(
                id=item.id,
                item=item.name,
                category=item.category,
                current_qty=item.quantity,
                unit=item.unit,
                reorder_level=item.reorder_level,
                units_per_day=per_day,
                days_until_empty=days_left,
                urgency=_urgency(days_left, True),
                supplier=item.supplier,
            )
        )

    # Most urgent first; within a grade, soonest to run out first.
    alerts.sort(
        key=lambda a: (
            _URGENCY_RANK[a.urgency],
            a.days_until_empty if a.days_until_empty is not None else float("inf"),
        )
    )
    return alerts


@router.get("/analytics", response_model=list[BurnRateOut])
def inventory_analytics(db: Session = Depends(get_db)):
    """Burn rate for every tracked item (7-day average), soonest-to-deplete first."""
    usage = compute_daily_usage(db)
    items = db.query(InventoryItem).order_by(InventoryItem.name).all()

    rows = [
        BurnRateOut(
            item_name=item.name,
            unit=item.unit,
            current_qty=item.quantity,
            units_used_per_day=round(usage.get(item.name, 0.0), 3),
            projected_days_remaining=_days_until_empty(
                item.quantity, usage.get(item.name, 0.0)
            ),
        )
        for item in items
    ]
    rows.sort(
        key=lambda r: r.projected_days_remaining
        if r.projected_days_remaining is not None
        else float("inf")
    )
    return rows


@router.put("/{item_id}", response_model=InventoryOut)
def update_quantity(item_id: int, payload: QuantityUpdate, db: Session = Depends(get_db)):
    """Set an item's quantity to an absolute value (manual stock correction)."""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    item.quantity = payload.quantity
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.post("/{item_id}/restock", response_model=RestockResponse)
def restock(item_id: int, payload: RestockRequest, db: Session = Depends(get_db)):
    """Log a restock: add `amount` to stock and stamp last_restocked_at = now."""
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    previous = item.quantity
    item.quantity = round(previous + payload.amount, 3)
    item.last_restocked_at = datetime.now()
    if payload.cost_per_unit is not None:
        item.cost_per_unit = payload.cost_per_unit
    if payload.supplier:
        item.supplier = payload.supplier

    db.commit()
    db.refresh(item)

    return RestockResponse(
        message=f"Restocked {payload.amount} {item.unit} of {item.name}.",
        item=_to_out(item),
        restocked_amount=payload.amount,
        previous_quantity=previous,
        new_quantity=item.quantity,
        restocked_at=item.last_restocked_at,
    )

"""Order endpoints (new schema: items JSON + total_price)."""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Order
from services import analytics

router = APIRouter(prefix="/api/orders", tags=["orders"])


# --------------------------------- Schemas ---------------------------------
class OrderLine(BaseModel):
    name: str
    price: float = Field(ge=0)
    quantity: int = Field(default=1, ge=1)


class OrderOut(BaseModel):
    id: int
    created_at: datetime
    items: list[OrderLine]
    total_price: float
    payment_method: str
    status: str
    customer_name: Optional[str] = None
    order_type: str


class OrderCreate(BaseModel):
    items: list[OrderLine]
    payment_method: str = "card"
    status: str = "pending"
    customer_name: Optional[str] = None
    order_type: str = "takeaway"


class OrderStatusUpdate(BaseModel):
    status: str


def _to_out(order: Order) -> OrderOut:
    try:
        lines = json.loads(order.items or "[]")
    except (json.JSONDecodeError, TypeError):
        lines = []
    return OrderOut(
        id=order.id,
        created_at=order.created_at,
        items=[OrderLine(**li) for li in lines],
        total_price=order.total_price,
        payment_method=order.payment_method,
        status=order.status,
        customer_name=order.customer_name,
        order_type=order.order_type,
    )


# ------------------------------- Endpoints ---------------------------------
@router.get("", response_model=list[OrderOut])
def list_orders(limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    orders = db.query(Order).order_by(Order.created_at.desc()).limit(limit).all()
    return [_to_out(o) for o in orders]


@router.get("/stats")
def order_stats(db: Session = Depends(get_db)):
    """KPI summary + trends for dashboards (computed from the new schema)."""
    today = datetime.now().date()
    orders = db.query(Order).all()
    todays = [o for o in orders if o.created_at and o.created_at.date() == today]

    total_revenue = round(sum(o.total_price or 0 for o in orders), 2)
    todays_revenue = round(sum(o.total_price or 0 for o in todays), 2)

    return {
        "summary": {
            "total_revenue": total_revenue,
            "todays_revenue": todays_revenue,
            "total_orders": len(orders),
            "todays_orders": len(todays),
            "avg_order_value": round(total_revenue / len(orders), 2) if orders else 0.0,
        },
        "revenue_trend": analytics.get_revenue_trend(7),
        "top_items": analytics.get_top_items(),
        "weekly_comparison": analytics.get_weekly_comparison(),
    }


@router.post("", response_model=OrderOut, status_code=201)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="An order needs at least one item.")
    total = round(sum(li.price * li.quantity for li in payload.items), 2)
    order = Order(
        created_at=datetime.now(),
        items=json.dumps([li.model_dump() for li in payload.items]),
        total_price=total,
        payment_method=payload.payment_method,
        status=payload.status,
        customer_name=payload.customer_name,
        order_type=payload.order_type,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return _to_out(order)


@router.patch("/{order_id}", response_model=OrderOut)
def update_status(order_id: int, payload: OrderStatusUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = payload.status
    db.commit()
    db.refresh(order)
    return _to_out(order)


@router.delete("/{order_id}", status_code=204)
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    db.delete(order)
    db.commit()

"""SQLAlchemy ORM models for BrewIQ.

Six tables: orders, inventory_items, staff, shifts, ai_insights, daily_metrics.
`items` (orders) and `data_snapshot` (ai_insights) hold JSON encoded as TEXT.
Indexes are declared on the `created_at` / `date` columns used for time-range queries.
"""
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.orm import relationship

from database import Base

# ---- Allowed values (documented here, enforced at the API/schema layer) ----
ORDER_STATUSES = ("pending", "preparing", "ready", "completed")
ORDER_TYPES = ("dine_in", "takeaway")
PAYMENT_METHODS = ("cash", "card", "mobile")
INVENTORY_CATEGORIES = ("beans", "milk", "syrups", "cups", "food")
INVENTORY_UNITS = ("kg", "liters", "units")
STAFF_ROLES = ("barista", "manager", "cashier")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    items = Column(Text, nullable=False, default="[]")  # JSON string of line items
    total_price = Column(Float, nullable=False, default=0.0)
    payment_method = Column(String, default="card")  # cash | card | mobile
    status = Column(String, default="pending", index=True)  # pending|preparing|ready|completed
    customer_name = Column(String, nullable=True)
    order_type = Column(String, default="takeaway")  # dine_in | takeaway


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    category = Column(String, default="beans")  # beans|milk|syrups|cups|food
    quantity = Column(Float, nullable=False, default=0.0)
    unit = Column(String, default="units")  # kg | liters | units
    reorder_level = Column(Float, default=10.0)
    cost_per_unit = Column(Float, default=0.0)
    last_restocked_at = Column(DateTime, default=datetime.utcnow)
    supplier = Column(String, nullable=True)


class Staff(Base):
    __tablename__ = "staff"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, default="barista")  # barista | manager | cashier
    shift_start = Column(Time, nullable=True)  # default/typical shift window
    shift_end = Column(Time, nullable=True)
    hourly_rate = Column(Float, default=15.0)
    is_active = Column(Boolean, default=True)

    # One staff member has many scheduled shifts.
    shifts = relationship(
        "Shift",
        back_populates="staff",
        cascade="all, delete-orphan",
        order_by="Shift.date",
    )


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("staff.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, default=date_type.today, index=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    notes = Column(Text, nullable=True)

    staff = relationship("Staff", back_populates="shifts")


class AIInsight(Base):
    __tablename__ = "ai_insights"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    insight_type = Column(String, default="general", index=True)  # e.g. briefing|restock|staffing
    content = Column(Text, nullable=False)
    data_snapshot = Column(Text, nullable=True)  # JSON string of the grounding context


class DailyMetric(Base):
    __tablename__ = "daily_metrics"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, unique=True, index=True)
    total_orders = Column(Integer, default=0)
    total_revenue = Column(Float, default=0.0)
    avg_order_value = Column(Float, default=0.0)
    peak_hour = Column(Integer, nullable=True)  # 0-23
    busiest_day_of_week = Column(String, nullable=True)  # e.g. "Saturday"
    top_item = Column(String, nullable=True)

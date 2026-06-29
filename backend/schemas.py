"""Pydantic schemas for request/response validation."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------- Orders ----------
class OrderBase(BaseModel):
    item: str
    category: str = "beverage"
    quantity: int = Field(default=1, ge=1)
    price: float = Field(ge=0)
    status: str = "completed"


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    status: Optional[str] = None
    quantity: Optional[int] = Field(default=None, ge=1)


class OrderOut(OrderBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    total: float
    created_at: datetime


# ---------- Inventory ----------
class InventoryBase(BaseModel):
    name: str
    category: str = "ingredient"
    quantity: float = Field(ge=0)
    unit: str = "units"
    reorder_level: float = Field(default=10, ge=0)
    cost_per_unit: float = Field(default=0.0, ge=0)


class InventoryCreate(InventoryBase):
    pass


class InventoryUpdate(BaseModel):
    quantity: Optional[float] = Field(default=None, ge=0)
    reorder_level: Optional[float] = Field(default=None, ge=0)
    cost_per_unit: Optional[float] = Field(default=None, ge=0)


class InventoryOut(InventoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    updated_at: datetime
    low_stock: bool = False


# ---------- Staff ----------
class StaffBase(BaseModel):
    name: str
    role: str = "barista"
    shift: str = "morning"
    hourly_rate: float = Field(default=15.0, ge=0)
    is_active: bool = True


class StaffCreate(StaffBase):
    pass


class StaffUpdate(BaseModel):
    role: Optional[str] = None
    shift: Optional[str] = None
    hourly_rate: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class StaffOut(StaffBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ---------- AI ----------
class AIQuery(BaseModel):
    question: str = Field(..., min_length=1)


class AIResponse(BaseModel):
    answer: str
    model: str

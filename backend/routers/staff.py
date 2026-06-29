"""Staff endpoints — roster, weekly schedule, and rush-aware coverage analysis.

Coverage compares the number of scheduled staff in each hour against demand predicted
by services.analytics (the same rush matrix the AI uses), so understaffed peaks surface
identically in the UI and in AI recommendations.
"""
from datetime import date as date_type
from datetime import datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from database import get_db
from models import Shift, Staff
from services import analytics

router = APIRouter(prefix="/api/staff", tags=["staff"])

# Sustainable throughput for one person on bar during a rush (milk drinks + payment).
# Tuned so the 8-10am rush reads as understaffed at the seeded 2-person opening crew.
ORDERS_PER_BARISTA_PER_HOUR = 5.0


# --------------------------------- Schemas ---------------------------------
class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    staff_id: int
    date: date_type
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    notes: Optional[str] = None


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    role: str
    shift_start: Optional[time] = None
    shift_end: Optional[time] = None
    hourly_rate: float
    is_active: bool
    today_shift: Optional[ShiftOut] = None
    on_shift_now: bool = False


class ScheduledShift(BaseModel):
    id: int
    staff_id: int
    staff_name: str
    role: str
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    notes: Optional[str] = None


class ScheduleDay(BaseModel):
    date: date_type
    day_of_week: str
    shifts: list[ScheduledShift]


class WeeklySchedule(BaseModel):
    week_start: date_type
    week_end: date_type
    days: list[ScheduleDay]


class CoverageHour(BaseModel):
    hour: int
    staff_count: int
    needed: int
    expected_orders: float
    understaffed: bool


class ShiftUpsert(BaseModel):
    id: Optional[int] = None          # provide to update, omit to create
    staff_id: int
    date: date_type
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    notes: Optional[str] = None


# ------------------------------ Core helpers -------------------------------
def _covers_hour(shift: Shift, hour: int) -> bool:
    """True if a shift is on the clock during the given hour (end is exclusive)."""
    if shift.start_time is None or shift.end_time is None:
        return True  # open-ended shift counts as present all day
    return shift.start_time.hour <= hour < shift.end_time.hour


def _on_shift_now(shift: Optional[Shift], now: datetime) -> bool:
    if not shift or shift.start_time is None or shift.end_time is None:
        return False
    return shift.start_time <= now.time() < shift.end_time


def _monday_of(d: date_type) -> date_type:
    return d - timedelta(days=d.weekday())


# ------------------------------- Endpoints ---------------------------------
@router.get("", response_model=list[StaffOut])
def list_staff(db: Session = Depends(get_db)):
    """All staff, annotated with today's scheduled shift and whether they're on now."""
    now = datetime.now()
    today = now.date()
    members = db.query(Staff).order_by(Staff.name).all()
    todays_shifts = {
        s.staff_id: s
        for s in db.query(Shift).filter(Shift.date == today).all()
    }

    result = []
    for m in members:
        shift = todays_shifts.get(m.id)
        out = StaffOut.model_validate(m)
        out.today_shift = ShiftOut.model_validate(shift) if shift else None
        out.on_shift_now = _on_shift_now(shift, now)
        result.append(out)
    return result


@router.get("/schedule", response_model=WeeklySchedule)
def weekly_schedule(
    week: Optional[date_type] = Query(
        None, description="Any date in the target week (defaults to this week)"
    ),
    db: Session = Depends(get_db),
):
    anchor = week or datetime.now().date()
    week_start = _monday_of(anchor)
    week_end = week_start + timedelta(days=6)

    shifts = (
        db.query(Shift)
        .filter(Shift.date >= week_start, Shift.date <= week_end)
        .all()
    )
    staff_by_id = {s.id: s for s in db.query(Staff).all()}

    by_date: dict[date_type, list[ScheduledShift]] = {}
    for s in shifts:
        member = staff_by_id.get(s.staff_id)
        by_date.setdefault(s.date, []).append(
            ScheduledShift(
                id=s.id,
                staff_id=s.staff_id,
                staff_name=member.name if member else "Unknown",
                role=member.role if member else "",
                start_time=s.start_time,
                end_time=s.end_time,
                notes=s.notes,
            )
        )

    days = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        day_shifts = sorted(
            by_date.get(day, []),
            key=lambda sh: (sh.start_time or time.min),
        )
        days.append(
            ScheduleDay(
                date=day,
                day_of_week=analytics.WEEKDAY_NAMES[day.weekday()],
                shifts=day_shifts,
            )
        )

    return WeeklySchedule(week_start=week_start, week_end=week_end, days=days)


@router.get("/coverage", response_model=list[CoverageHour])
def coverage(
    day: Optional[date_type] = Query(
        None, description="Day to analyze (defaults to today)"
    ),
    db: Session = Depends(get_db),
):
    """Hour-by-hour scheduled staff vs. predicted demand for a given day."""
    target = day or datetime.now().date()
    shifts = db.query(Shift).filter(Shift.date == target).all()
    expected_by_hour = analytics.get_expected_orders_by_hour(target.weekday())

    rows = []
    for hour in analytics.OPEN_HOURS:
        staff_count = sum(1 for s in shifts if _covers_hour(s, hour))
        expected = round(expected_by_hour.get(hour, 0.0), 1)
        needed = analytics.staff_needed_for(expected, ORDERS_PER_BARISTA_PER_HOUR)
        rows.append(
            CoverageHour(
                hour=hour,
                staff_count=staff_count,
                needed=needed,
                expected_orders=expected,
                understaffed=staff_count < needed,
            )
        )
    return rows


@router.post("/shifts", response_model=ShiftOut)
def upsert_shift(payload: ShiftUpsert, db: Session = Depends(get_db)):
    """Create a new shift, or update an existing one when `id` is supplied."""
    if not db.query(Staff).filter(Staff.id == payload.staff_id).first():
        raise HTTPException(status_code=404, detail="Staff member not found")

    if payload.id is not None:
        shift = db.query(Shift).filter(Shift.id == payload.id).first()
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
    else:
        shift = Shift(staff_id=payload.staff_id, date=payload.date)
        db.add(shift)

    shift.staff_id = payload.staff_id
    shift.date = payload.date
    shift.start_time = payload.start_time
    shift.end_time = payload.end_time
    shift.notes = payload.notes

    db.commit()
    db.refresh(shift)
    return ShiftOut.model_validate(shift)

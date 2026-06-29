"""Groq AI integration for BrewIQ.

Three features:
  1. generate_daily_briefing(db)        — owner's morning briefing (30-min cached)
  2. explain_rush_patterns(data)        — narrates the hourly rush matrix
  3. get_reorder_recommendations(alerts)— inventory reorder via Groq tool-calling

Groq is OpenAI-compatible, so we use client.chat.completions.create(...) with
messages/tools. Every feature degrades gracefully: if GROQ_API_KEY is unset or the
API errors/rate-limits, we fall back to deterministic rule-based output and log it.
The UI must never break because Groq is down.
"""
import json
import logging
import math
import os
import time
from collections import defaultdict
from typing import Iterator
from datetime import datetime, timedelta

from dotenv import load_dotenv
from sqlalchemy.orm import Session

from models import InventoryItem, Order, Shift
from services import analytics

load_dotenv()
logger = logging.getLogger("brewiq.ai")

# ---- Models -------------------------------------------------------------
MAIN_MODEL = "llama-3.3-70b-versatile"   # briefings, chat, tool use
FAST_MODEL = "llama-3.1-8b-instant"      # quick simple calls

# ---- Reorder planning defaults ------------------------------------------
DEFAULT_LEAD_TIME_DAYS = 3
DEFAULT_SAFETY_STOCK_DAYS = 2

BRIEFING_TTL = timedelta(minutes=30)
_briefing_cache: dict = {"expires": datetime.min, "data": None}

BRIEFING_SYSTEM_PROMPT = (
    "You are BrewIQ, an AI operations manager for The Daily Grind coffee shop.\n"
    "You give concise, actionable daily briefings to the shop owner.\n"
    "Be specific with numbers. Use a warm, professional tone.\n"
    "Structure: 1) Today's snapshot 2) Alerts needing attention 3) One smart recommendation."
)

RUSH_SYSTEM_PROMPT = (
    "You are BrewIQ, an operations analyst for The Daily Grind, a coffee shop on a "
    "university campus. You read hourly order data and explain rush patterns clearly "
    "and practically for the shop owner."
)

REORDER_SYSTEM_PROMPT = (
    "You are BrewIQ's inventory reorder assistant for The Daily Grind coffee shop. "
    "For each low-stock item, use the provided tools to calculate the reorder quantity "
    "and estimate its cost. Account for supplier lead time and a safety-stock buffer. "
    "After gathering the numbers, return a JSON array where each element is "
    '{"item": str, "recommended_qty": number, "estimated_cost": number, '
    '"urgency": "critical"|"warning"|"ok", "reason": str}. Respond with ONLY the JSON array.'
)


# =========================================================================
# Groq client
# =========================================================================
def groq_configured() -> bool:
    """True if a usable Groq API key is set (so real Groq calls will be made)."""
    key = os.getenv("GROQ_API_KEY", "").strip()
    return bool(key) and key != "your_groq_api_key_here"


def _get_client():
    """Return a Groq client, or None if no usable API key is configured."""
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key or key == "your_groq_api_key_here":
        return None
    try:
        from groq import Groq

        return Groq(api_key=key)
    except Exception as exc:  # pragma: no cover - import/credential issues
        logger.warning("Groq client unavailable: %s", exc)
        return None


# =========================================================================
# FEATURE 1 — Daily Operations Briefing
# =========================================================================
def generate_daily_briefing(db: Session, force: bool = False) -> dict:
    """Owner's morning briefing. Cached for 30 minutes to avoid hitting Groq per page load."""
    now = datetime.now()
    if not force and _briefing_cache["data"] and now < _briefing_cache["expires"]:
        return _briefing_cache["data"]

    ctx = _gather_briefing_context(db)
    context_str = _format_briefing_context(ctx)

    client = _get_client()
    if client is None:
        briefing_text = _briefing_fallback(ctx)
        model_used = "fallback-rules"
    else:
        try:
            resp = client.chat.completions.create(
                model=MAIN_MODEL,
                messages=[
                    {"role": "system", "content": BRIEFING_SYSTEM_PROMPT},
                    {"role": "user", "content": context_str},
                ],
                temperature=0.6,
                max_tokens=600,
            )
            briefing_text = resp.choices[0].message.content.strip()
            model_used = MAIN_MODEL
        except Exception as exc:
            logger.warning("Groq briefing failed, using fallback: %s", exc)
            briefing_text = _briefing_fallback(ctx)
            model_used = "fallback-rules"

    result = {
        "briefing_text": briefing_text,
        "alerts_count": ctx["alerts_count"],
        "generated_at": now.isoformat(),
        "model": model_used,
        "key_metrics": ctx["key_metrics"],
    }
    _briefing_cache["data"] = result
    _briefing_cache["expires"] = now + BRIEFING_TTL
    return result


def _day_bounds(day):
    start = datetime.combine(day, datetime.min.time())
    return start, start + timedelta(days=1)


def _parse_items(order: Order) -> list:
    try:
        return json.loads(order.items or "[]")
    except (json.JSONDecodeError, TypeError):
        return []


def _gather_briefing_context(db: Session) -> dict:
    now = datetime.now()
    today = now.date()
    yesterday = today - timedelta(days=1)

    t_start, t_end = _day_bounds(today)
    y_start, y_end = _day_bounds(yesterday)

    orders_today = db.query(Order).filter(
        Order.created_at >= t_start, Order.created_at < t_end
    ).all()
    orders_yest = db.query(Order).filter(
        Order.created_at >= y_start, Order.created_at < y_end
    ).all()

    rev_today = round(sum(o.total_price or 0 for o in orders_today), 2)
    rev_yest = round(sum(o.total_price or 0 for o in orders_yest), 2)
    rev_delta_pct = analytics._pct_change(rev_today, rev_yest)

    # Top items sold today.
    item_rev: dict = defaultdict(float)
    item_qty: dict = defaultdict(int)
    for o in orders_today:
        for li in _parse_items(o):
            item_rev[li["name"]] += li["price"] * li.get("quantity", 1)
            item_qty[li["name"]] += li.get("quantity", 1)
    top_items = sorted(item_rev.items(), key=lambda kv: kv[1], reverse=True)[:3]
    top_items_fmt = [
        {"item": n, "revenue": round(r, 2), "quantity": item_qty[n]} for n, r in top_items
    ]

    # Inventory alerts (recipe-based burn rate; reuse the inventory router's logic).
    from routers.inventory import compute_daily_usage  # local import avoids any cycle

    usage = compute_daily_usage(db)
    alerts = []
    for item in db.query(InventoryItem).all():
        if item.quantity > item.reorder_level:
            continue
        per_day = round(usage.get(item.name, 0.0), 3)
        days_left = round(item.quantity / per_day, 1) if per_day > 0 else None
        urgency = (
            "critical" if days_left is not None and days_left < 2
            else "warning" if days_left is not None and days_left < 5
            else "warning"
        )
        alerts.append({
            "item": item.name, "current_qty": item.quantity, "unit": item.unit,
            "reorder_level": item.reorder_level, "daily_usage": per_day,
            "cost_per_unit": item.cost_per_unit, "days_until_empty": days_left,
            "urgency": urgency, "supplier": item.supplier,
        })
    alerts.sort(key=lambda a: (a["days_until_empty"] is None, a["days_until_empty"] or 0))

    # Staffing vs predicted demand for today.
    shifts_today = db.query(Shift).filter(Shift.date == today).all()
    scheduled_staff = len({s.staff_id for s in shifts_today})
    expected_by_hour = analytics.get_expected_orders_by_hour(today.weekday())
    understaffed_hours = []
    for hour in analytics.OPEN_HOURS:
        cnt = sum(
            1 for s in shifts_today
            if s.start_time and s.end_time and s.start_time.hour <= hour < s.end_time.hour
        )
        if cnt < analytics.staff_needed_for(expected_by_hour.get(hour, 0.0)):
            understaffed_hours.append(hour)

    # Anomaly detection: today vs trailing 7-day average (full days only).
    trend = analytics.get_revenue_trend(8)[:-1]  # exclude today (partial)
    past_revs = [d["revenue"] for d in trend if d["revenue"] > 0]
    trailing_avg = round(sum(past_revs) / len(past_revs), 2) if past_revs else 0.0
    anomaly = None
    if trailing_avg:
        ratio = rev_today / trailing_avg
        if ratio >= 1.3:
            anomaly = f"Sales running HIGH — {round(ratio * 100)}% of the 7-day average."
        elif ratio <= 0.6 and now.hour >= 12:
            anomaly = f"Sales running LOW — only {round(ratio * 100)}% of the 7-day average."

    key_metrics = {
        "todays_revenue": rev_today,
        "todays_orders": len(orders_today),
        "yesterdays_revenue": rev_yest,
        "revenue_vs_yesterday_pct": rev_delta_pct,
        "avg_order_value": round(rev_today / len(orders_today), 2) if orders_today else 0.0,
        "alerts_count": len(alerts),
        "scheduled_staff": scheduled_staff,
        "understaffed_hours": understaffed_hours,
        "top_item": top_items_fmt[0]["item"] if top_items_fmt else None,
    }

    return {
        "now": now, "today": today,
        "rev_today": rev_today, "rev_yest": rev_yest, "rev_delta_pct": rev_delta_pct,
        "orders_today": len(orders_today), "orders_yest": len(orders_yest),
        "top_items": top_items_fmt,
        "alerts": alerts, "alerts_count": len(alerts),
        "scheduled_staff": scheduled_staff, "understaffed_hours": understaffed_hours,
        "trailing_avg": trailing_avg, "anomaly": anomaly,
        "key_metrics": key_metrics,
    }


def _format_briefing_context(ctx: dict) -> str:
    lines = [
        f"Date: {ctx['today']:%A, %B %d, %Y} (as of {ctx['now']:%I:%M %p})",
        "",
        "TODAY SO FAR:",
        f"- Revenue: ${ctx['rev_today']} across {ctx['orders_today']} orders",
        f"- Yesterday (full day): ${ctx['rev_yest']} across {ctx['orders_yest']} orders "
        f"({ctx['rev_delta_pct']:+}% revenue vs yesterday)",
        f"- 7-day average daily revenue: ${ctx['trailing_avg']}",
    ]
    if ctx["top_items"]:
        items = ", ".join(f"{t['item']} ({t['quantity']} sold)" for t in ctx["top_items"])
        lines.append(f"- Top sellers today: {items}")
    if ctx["anomaly"]:
        lines.append(f"- ANOMALY: {ctx['anomaly']}")

    lines += ["", f"INVENTORY ALERTS ({ctx['alerts_count']} low):"]
    if ctx["alerts"]:
        for a in ctx["alerts"]:
            days = f"{a['days_until_empty']} days left" if a["days_until_empty"] is not None else "usage unknown"
            lines.append(
                f"- {a['item']}: {a['current_qty']} {a['unit']} left "
                f"(reorder at {a['reorder_level']}), ~{a['daily_usage']}/day, {days} "
                f"[{a['urgency']}], supplier {a['supplier']}"
            )
    else:
        lines.append("- None. Stock levels healthy.")

    lines += ["", "STAFFING TODAY:"]
    lines.append(f"- {ctx['scheduled_staff']} staff scheduled.")
    if ctx["understaffed_hours"]:
        hrs = ", ".join(f"{h}:00" for h in ctx["understaffed_hours"])
        lines.append(f"- Predicted understaffed hours vs demand: {hrs}")
    else:
        lines.append("- Coverage matches predicted demand.")

    lines += ["", "Write the briefing now."]
    return "\n".join(lines)


def _briefing_fallback(ctx: dict) -> str:
    parts = [
        "**Today's snapshot.** "
        f"The Daily Grind has pulled ${ctx['rev_today']} from {ctx['orders_today']} orders so far "
        f"({ctx['rev_delta_pct']:+}% vs yesterday's ${ctx['rev_yest']})."
    ]
    if ctx["top_items"]:
        parts[0] += f" {ctx['top_items'][0]['item']} is leading sales."
    if ctx["anomaly"]:
        parts.append(f"**Heads up:** {ctx['anomaly']}")

    if ctx["alerts"]:
        names = ", ".join(
            f"{a['item']} ({a['days_until_empty']}d left)"
            if a["days_until_empty"] is not None else a["item"]
            for a in ctx["alerts"]
        )
        parts.append(f"**Alerts needing attention.** {ctx['alerts_count']} items low: {names}.")
    else:
        parts.append("**Alerts.** Inventory is healthy — nothing to reorder today.")

    if ctx["understaffed_hours"]:
        hrs = ", ".join(f"{h}:00" for h in ctx["understaffed_hours"])
        parts.append(
            f"**Recommendation.** Add a barista during {hrs} — predicted demand outpaces "
            "scheduled coverage during those hours."
        )
    elif ctx["alerts"]:
        soonest = ctx["alerts"][0]
        parts.append(
            f"**Recommendation.** Place a supplier order for {soonest['item']} today — "
            f"it's your most urgent at ~{soonest['daily_usage']}/day."
        )
    else:
        parts.append("**Recommendation.** Steady morning — keep the current plan and watch the lunch rush.")

    return "\n\n".join(parts)


# =========================================================================
# FEATURE 2 — Rush Hour Explainer
# =========================================================================
def explain_rush_patterns(analytics_data: dict) -> str:
    """Narrate the hourly order matrix: top patterns, why, staffing tips, tomorrow's peak."""
    client = _get_client()
    if client is None:
        return _rush_fallback(analytics_data)

    user_prompt = (
        "Here is The Daily Grind's order data.\n\n"
        f"Hourly order matrix (avg orders by day-of-week x hour):\n"
        f"{json.dumps(analytics_data.get('rush_matrix', analytics_data), default=str)}\n\n"
        f"Tomorrow's forecast: {json.dumps(analytics_data.get('tomorrow', {}), default=str)}\n\n"
        "Please:\n"
        "1. Identify the top 3 rush patterns.\n"
        "2. Explain WHY they likely occur, given this is a university campus shop.\n"
        "3. Give 2 specific staffing recommendations.\n"
        "4. Predict tomorrow's peak hour.\n"
        "Keep it under 250 words, owner-friendly."
    )
    try:
        resp = client.chat.completions.create(
            model=MAIN_MODEL,
            messages=[
                {"role": "system", "content": RUSH_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.6,
            max_tokens=500,
        )
        return resp.choices[0].message.content.strip()
    except Exception as exc:
        logger.warning("Groq rush explainer failed, using fallback: %s", exc)
        return _rush_fallback(analytics_data)


def _rush_fallback(analytics_data: dict) -> str:
    matrix = (analytics_data or {}).get("rush_matrix", {}).get("cells", [])
    tomorrow = (analytics_data or {}).get("tomorrow", {})
    top = sorted(matrix, key=lambda c: c.get("avg_orders", 0), reverse=True)[:3]

    lines = ["**Rush patterns at The Daily Grind**", ""]
    if top:
        for c in top:
            lines.append(
                f"- {c['day_of_week']} around {c['hour']}:00 — ~{c['avg_orders']} orders/hr."
            )
    lines += [
        "",
        "These peaks line up with campus rhythms: the 8-10am window is the pre-class "
        "coffee run, and 12-2pm is the lunch break. Weekends are quieter with no classes.",
        "",
        "**Staffing:** keep both openers on bar through 10am, and overlap a third hand "
        "into the lunch rush.",
    ]
    if tomorrow:
        lines.append(
            f"\n**Tomorrow ({tomorrow.get('day_of_week', '')}):** expect a peak around "
            f"{tomorrow.get('peak_hour', '?')}:00 (~{tomorrow.get('peak_hour_orders', '?')} orders "
            f"that hour, ~{tomorrow.get('expected_orders', '?')} for the day)."
        )
    return "\n".join(lines)


# =========================================================================
# FEATURE 3 — Inventory Reorder Assistant (Groq tool-calling)
# =========================================================================
REORDER_TOOLS = [
    {"type": "function", "function": {
        "name": "calculate_reorder_quantity",
        "description": "Calculate how much of an item to reorder",
        "parameters": {"type": "object", "properties": {
            "item_name": {"type": "string"},
            "daily_usage": {"type": "number"},
            "lead_time_days": {"type": "number"},
            "safety_stock_days": {"type": "number"},
        }, "required": ["item_name", "daily_usage", "lead_time_days"]},
    }},
    {"type": "function", "function": {
        "name": "estimate_cost",
        "description": "Estimate the cost of a reorder",
        "parameters": {"type": "object", "properties": {
            "item_name": {"type": "string"},
            "quantity": {"type": "number"},
            "cost_per_unit": {"type": "number"},
        }, "required": ["item_name", "quantity", "cost_per_unit"]},
    }},
]


def calculate_reorder_quantity(item_name, daily_usage, lead_time_days,
                               safety_stock_days=DEFAULT_SAFETY_STOCK_DAYS):
    """Tool: order enough to cover lead time + a safety buffer of daily usage."""
    qty = float(daily_usage) * (float(lead_time_days) + float(safety_stock_days))
    return {
        "item_name": item_name,
        "recommended_quantity": round(qty, 2),
        "formula": f"{daily_usage}/day x ({lead_time_days} lead + {safety_stock_days} safety) days",
    }


def estimate_cost(item_name, quantity, cost_per_unit):
    """Tool: total cost of a reorder."""
    total = float(quantity) * float(cost_per_unit)
    return {
        "item_name": item_name,
        "quantity": round(float(quantity), 2),
        "cost_per_unit": cost_per_unit,
        "estimated_cost": round(total, 2),
    }


_TOOL_IMPLS = {
    "calculate_reorder_quantity": calculate_reorder_quantity,
    "estimate_cost": estimate_cost,
}


def _execute_tool(name: str, args: dict) -> dict:
    fn = _TOOL_IMPLS.get(name)
    if fn is None:
        return {"error": f"unknown tool {name}"}
    try:
        return fn(**args)
    except Exception as exc:  # bad/missing args from the model
        return {"error": str(exc)}


def _alert_get(alert: dict, *keys, default=None):
    for k in keys:
        if alert.get(k) is not None:
            return alert[k]
    return default


def get_reorder_recommendations(inventory_alerts: list) -> list:
    """Recommend reorder quantities/costs for low-stock items via Groq tool-calling.

    Each recommendation includes `reasoning_steps` (the tool calls + results) so the
    frontend can show the AI's work. Falls back to deterministic math if Groq is down.
    """
    if not inventory_alerts:
        return []

    client = _get_client()
    if client is None:
        return _reorder_fallback(inventory_alerts)
    try:
        return _reorder_with_tools(client, inventory_alerts)
    except Exception as exc:
        logger.warning("Groq reorder assistant failed, using fallback: %s", exc)
        return _reorder_fallback(inventory_alerts)


def _reorder_with_tools(client, inventory_alerts: list) -> list:
    # Give the model everything it needs to call the tools with real numbers.
    enriched = [
        {
            "item_name": _alert_get(a, "item", "name"),
            "daily_usage": _alert_get(a, "daily_usage", "units_per_day", default=0),
            "current_qty": _alert_get(a, "current_qty", "quantity", default=0),
            "cost_per_unit": _alert_get(a, "cost_per_unit", default=0),
            "lead_time_days": _alert_get(a, "lead_time_days", default=DEFAULT_LEAD_TIME_DAYS),
            "safety_stock_days": _alert_get(a, "safety_stock_days", default=DEFAULT_SAFETY_STOCK_DAYS),
            "urgency": _alert_get(a, "urgency", default="warning"),
            "unit": _alert_get(a, "unit", default="units"),
        }
        for a in inventory_alerts
    ]
    messages = [
        {"role": "system", "content": REORDER_SYSTEM_PROMPT},
        {"role": "user", "content": (
            "Low-stock items needing reorder decisions:\n"
            f"{json.dumps(enriched, indent=2)}\n\n"
            "Use the tools for each item, then return the JSON array."
        )},
    ]

    steps_by_item: dict = defaultdict(list)
    final_text = ""

    for _ in range(6):  # bounded tool-call loop
        resp = client.chat.completions.create(
            model=MAIN_MODEL,
            messages=messages,
            tools=REORDER_TOOLS,
            tool_choice="auto",
            temperature=0.2,
            max_tokens=800,
        )
        msg = resp.choices[0].message
        if not msg.tool_calls:
            final_text = (msg.content or "").strip()
            break

        # Echo the assistant's tool-call turn back into the conversation.
        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ],
        })
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            result = _execute_tool(tc.function.name, args)
            steps_by_item[args.get("item_name")].append(
                {"tool": tc.function.name, "arguments": args, "result": result}
            )
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "name": tc.function.name,
                "content": json.dumps(result),
            })

    llm_recs = {r.get("item", "").lower(): r for r in _extract_json_array(final_text)}
    return _assemble_recs(enriched, steps_by_item, llm_recs)


def _assemble_recs(enriched: list, steps_by_item: dict, llm_recs: dict) -> list:
    """Build final recs from executed tool results (reliable), enriched by LLM narrative."""
    recs = []
    for item in enriched:
        name = item["item_name"]
        steps = steps_by_item.get(name, [])

        qty = next(
            (s["result"].get("recommended_quantity") for s in steps
             if s["tool"] == "calculate_reorder_quantity" and "recommended_quantity" in s["result"]),
            None,
        )
        cost = next(
            (s["result"].get("estimated_cost") for s in steps
             if s["tool"] == "estimate_cost" and "estimated_cost" in s["result"]),
            None,
        )

        # Fall back to deterministic math for anything the model didn't compute.
        if qty is None:
            qty = round(item["daily_usage"] * (item["lead_time_days"] + item["safety_stock_days"]), 2)
        if cost is None:
            cost = round(qty * item["cost_per_unit"], 2)
        qty = _round_qty(qty, item["unit"])

        llm = llm_recs.get((name or "").lower(), {})
        reason = llm.get("reason") or (
            f"At ~{item['daily_usage']} {item['unit']}/day, order {qty} {item['unit']} to cover "
            f"{item['lead_time_days']}-day supplier lead time plus a "
            f"{item['safety_stock_days']}-day safety buffer."
        )
        recs.append({
            "item": name,
            "recommended_qty": qty,
            "estimated_cost": round(cost, 2),
            "urgency": llm.get("urgency") or item["urgency"],
            "reason": reason,
            "reasoning_steps": steps,
        })
    return recs


def _reorder_fallback(inventory_alerts: list) -> list:
    """Pure rule-based recs (Groq unavailable). Still includes reasoning_steps for the UI."""
    recs = []
    for a in inventory_alerts:
        name = _alert_get(a, "item", "name")
        usage = _alert_get(a, "daily_usage", "units_per_day", default=0)
        cost_per_unit = _alert_get(a, "cost_per_unit", default=0)
        lead = _alert_get(a, "lead_time_days", default=DEFAULT_LEAD_TIME_DAYS)
        safety = _alert_get(a, "safety_stock_days", default=DEFAULT_SAFETY_STOCK_DAYS)
        unit = _alert_get(a, "unit", default="units")

        calc = calculate_reorder_quantity(name, usage, lead, safety)
        qty = _round_qty(calc["recommended_quantity"], unit)
        est = estimate_cost(name, qty, cost_per_unit)

        recs.append({
            "item": name,
            "recommended_qty": qty,
            "estimated_cost": est["estimated_cost"],
            "urgency": _alert_get(a, "urgency", default="warning"),
            "reason": (
                f"At ~{usage} {unit}/day, order {qty} {unit} to cover {lead}-day lead time "
                f"plus a {safety}-day safety buffer (~${est['estimated_cost']})."
            ),
            "reasoning_steps": [
                {"tool": "calculate_reorder_quantity",
                 "arguments": {"item_name": name, "daily_usage": usage,
                               "lead_time_days": lead, "safety_stock_days": safety},
                 "result": calc},
                {"tool": "estimate_cost",
                 "arguments": {"item_name": name, "quantity": qty, "cost_per_unit": cost_per_unit},
                 "result": est},
            ],
        })
    return recs


# =========================================================================
# FEATURE 4 — Ask BrewIQ (free-form Q&A grounded in business data)
# =========================================================================
ASK_SYSTEM_PROMPT = (
    "You are BrewIQ, the AI operations analyst for The Daily Grind coffee shop. "
    "Answer the owner's question using ONLY the JSON data snapshot provided. "
    "Be specific with numbers, concise (under 180 words), and friendly. "
    "If the snapshot doesn't contain the answer, say so plainly rather than guessing."
)


def _business_snapshot(db: Session) -> dict:
    """Compact, grounded view of the whole shop for free-form Q&A."""
    from routers.inventory import compute_daily_usage

    usage = compute_daily_usage(db)
    low_stock = []
    for i in db.query(InventoryItem).all():
        if i.quantity <= i.reorder_level:
            per = round(usage.get(i.name, 0.0), 3)
            low_stock.append({
                "item": i.name, "qty": i.quantity, "unit": i.unit, "per_day": per,
                "days_left": round(i.quantity / per, 1) if per > 0 else None,
            })

    today = datetime.now().date()
    shifts = db.query(Shift).filter(Shift.date == today).all()
    expected = analytics.get_expected_orders_by_hour(today.weekday())
    understaffed = [
        h for h in analytics.OPEN_HOURS
        if sum(1 for s in shifts if s.start_time and s.end_time and s.start_time.hour <= h < s.end_time.hour)
        < analytics.staff_needed_for(expected.get(h, 0.0))
    ]

    return {
        "revenue_trend_7d": analytics.get_revenue_trend(7),
        "weekly_comparison": analytics.get_weekly_comparison(),
        "top_items": analytics.get_top_items(),
        "tomorrow": analytics.predict_tomorrow_rush(),
        "low_stock": low_stock,
        "staffing_today": {
            "scheduled": len({s.staff_id for s in shifts}),
            "understaffed_hours": understaffed,
        },
    }


# ---- Streaming chat -----------------------------------------------------
STREAM_SYSTEM_PROMPT = (
    "You are BrewIQ, the AI operations assistant for The Daily Grind coffee shop. "
    "You have access to the shop's real operational data. Answer the owner's questions "
    "directly and specifically using the actual numbers from their data. "
    "Be conversational but precise. Format key numbers in bold. "
    "Keep responses under 150 words unless a detailed breakdown is explicitly requested."
)


def stream_chat(question: str, snapshot: dict) -> Iterator[str]:
    """Yield the answer in chunks. Streams from Groq; falls back to chunked rule-based text.

    This is a *sync* generator — Starlette iterates it in a threadpool, so the blocking
    Groq calls never stall the event loop.
    """
    client = _get_client()
    if client is None:
        yield from _stream_fallback(question, snapshot)
        return

    user_content = (
        f"Here is the shop's current operational data:\n{json.dumps(snapshot, default=str)}\n\n"
        f"Owner's question: {question}"
    )
    try:
        stream = client.chat.completions.create(
            model=MAIN_MODEL,
            messages=[
                {"role": "system", "content": STREAM_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            stream=True,
            temperature=0.6,
            max_tokens=400,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as exc:
        logger.warning("Groq stream failed, using fallback: %s", exc)
        yield from _stream_fallback(question, snapshot)


def _stream_fallback(question: str, snapshot: dict) -> Iterator[str]:
    """Chunk the deterministic answer word-by-word with a tiny delay so it reads as 'live'."""
    text = _ask_fallback(question, snapshot)
    for word in text.split(" "):
        yield word + " "
        time.sleep(0.03)


def ask_brewiq(db: Session, question: str) -> tuple[str, str]:
    """Answer a free-form question grounded in live data. Returns (answer, model)."""
    snapshot = _business_snapshot(db)
    client = _get_client()
    if client is None:
        return _ask_fallback(question, snapshot), "fallback-rules"
    try:
        resp = client.chat.completions.create(
            model=MAIN_MODEL,
            messages=[
                {"role": "system", "content": ASK_SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"Data snapshot:\n{json.dumps(snapshot, default=str)}\n\nQuestion: {question}"
                )},
            ],
            temperature=0.5,
            max_tokens=500,
        )
        return resp.choices[0].message.content.strip(), MAIN_MODEL
    except Exception as exc:
        logger.warning("Groq ask failed, using fallback: %s", exc)
        return _ask_fallback(question, snapshot), "fallback-rules"


def _ask_fallback(question: str, snap: dict) -> str:
    """Keyword-routed deterministic answer so the chat works without Groq."""
    q = question.lower()
    wk = snap["weekly_comparison"]
    staffing = snap["staffing_today"]

    # Staffing first — "weekend" contains "week", so it must beat the weekly branch.
    if any(w in q for w in ("staff", "understaff", "weekend", "schedule", "barista")):
        hrs = ", ".join(f"{h}:00" for h in staffing["understaffed_hours"]) or "none"
        return (
            f"You have {staffing['scheduled']} staff scheduled today. Predicted understaffed hours "
            f"vs demand: {hrs}. The morning rush (8–10am) is your tightest window — add a third "
            "barista there before adding evening cover."
        )
    if "week" in q:
        tw, lw, ch = wk["this_week"], wk["last_week"], wk["change_pct"]
        return (
            f"This week you've done ${tw['revenue']} across {tw['orders']} orders "
            f"(avg ${tw['avg_order_value']}). Last week was ${lw['revenue']} / {lw['orders']} orders. "
            f"That's {ch['revenue']:+}% revenue and {ch['orders']:+}% orders, with average order value "
            f"{ch['avg_order_value']:+}%."
        )
    if any(w in q for w in ("menu", "item", "drag", "top", "best", "worst", "sell")):
        items = snap["top_items"]
        if items:
            best = ", ".join(f"{i['item']} (${i['revenue']})" for i in items[:3])
            return (
                f"Your revenue leaders are {best}. Lower-volume items pull down your average — "
                "consider trimming the slowest sellers or bundling them with a top drink."
            )
    if any(w in q for w in ("attention", "need", "alert", "restock", "low", "urgent")):
        low = snap["low_stock"]
        if low:
            names = ", ".join(
                f"{i['item']} ({i['days_left']}d left)" if i["days_left"] is not None else i["item"]
                for i in low
            )
            return f"{len(low)} item(s) need attention: {names}. Reorder the critical ones today."
        return "Nothing urgent — inventory and staffing both look healthy right now."

    tom = snap["tomorrow"]
    return (
        f"Here's the headline: this week is tracking {wk['change_pct']['revenue']:+}% on revenue. "
        f"Tomorrow ({tom['day_of_week']}) should peak near {tom['peak_hour']}:00 with about "
        f"{tom['peak_hour_orders']} orders that hour. Ask me about sales, staffing, menu items, or stock."
    )


# ------------------------------ utilities ---------------------------------
def _round_qty(qty: float, unit: str) -> float:
    """Whole units for discrete items (cups, units); 1 decimal for weights/volumes."""
    if unit in ("units",):
        return float(math.ceil(qty))
    return round(qty, 1)


def _extract_json_array(text: str) -> list:
    """Best-effort parse of a JSON array from an LLM response."""
    if not text:
        return []
    try:
        start, end = text.index("["), text.rindex("]") + 1
        parsed = json.loads(text[start:end])
        return parsed if isinstance(parsed, list) else []
    except (ValueError, json.JSONDecodeError):
        return []

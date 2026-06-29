"""Demo control endpoints — gated behind DEMO_MODE so they're off in production.

Set DEMO_MODE=true in .env to enable. When disabled, every route returns 403.
"""
import os

from fastapi import APIRouter, Depends, HTTPException

import demo_simulator

router = APIRouter(prefix="/api/demo", tags=["demo"])


def _demo_enabled() -> bool:
    return os.getenv("DEMO_MODE", "false").strip().lower() in ("1", "true", "yes", "on")


def require_demo_mode() -> None:
    if not _demo_enabled():
        raise HTTPException(
            status_code=403,
            detail="Demo endpoints are disabled. Set DEMO_MODE=true in .env to enable.",
        )


# Gate the whole router.
router_dependencies = [Depends(require_demo_mode)]


@router.post("/start-simulation", dependencies=router_dependencies)
def start_simulation():
    return demo_simulator.start_order_simulation()


@router.post("/stop-simulation", dependencies=router_dependencies)
def stop_simulation():
    return demo_simulator.stop_order_simulation()


@router.post("/trigger-rush", dependencies=router_dependencies)
def trigger_rush():
    return demo_simulator.trigger_rush_hour()


@router.post("/trigger-low-stock", dependencies=router_dependencies)
def trigger_low_stock():
    return demo_simulator.trigger_low_stock_alert()


@router.post("/reset", dependencies=router_dependencies)
def reset():
    return demo_simulator.reset_demo()


@router.get("/status", dependencies=router_dependencies)
def status():
    return demo_simulator.get_status()

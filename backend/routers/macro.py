"""Macro Risk-On / Risk-Off endpoints."""

from fastapi import APIRouter, Depends, Query

from backend.database import get_db
from backend.services.macro import get_macro_hero, get_macro_history

router = APIRouter()


@router.get("/hero")
def macro_hero(
    period: int = Query(7, ge=1, le=126, description="Lookback period in days for relative returns"),
    conn=Depends(get_db),
):
    return get_macro_hero(conn, period=period)


@router.get("/history")
def macro_history(
    lookback: int = Query(300, ge=30, le=2000, description="Number of bars for time-series"),
    conn=Depends(get_db),
):
    return get_macro_history(conn, lookback=lookback)

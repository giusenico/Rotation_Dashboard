"""API routes for volatility oscillators."""

from fastapi import APIRouter, Depends, Query

from backend.database import get_db
from backend.models.schemas import (
    VolatilityDetailResponse,
    VolatilitySummary,
)
from backend.services.volatility import (
    get_volatility_detail,
    get_volatility_summary,
)

router = APIRouter()


@router.get("/summary", response_model=VolatilitySummary)
def volatility_summary(
    window: int = Query(252, ge=63, le=504),
    conn=Depends(get_db),
):
    return get_volatility_summary(conn, window=window)


@router.get("/detail", response_model=VolatilityDetailResponse)
def volatility_detail(
    lookback: int = Query(1260, ge=63, le=2520),
    window: int = Query(252, ge=63, le=504),
    conn=Depends(get_db),
):
    return get_volatility_detail(conn, lookback_bars=lookback, window=window)

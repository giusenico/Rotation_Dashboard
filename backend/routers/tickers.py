"""Ticker metadata endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from backend.database import get_db
from backend.models.schemas import TickerInfo, CategoryInfo
from backend.services.tickers import (
    get_all_tickers,
    get_ticker_detail,
    get_categories,
)

router = APIRouter()


@router.get("", response_model=list[TickerInfo])
def list_tickers(category: str | None = None, conn=Depends(get_db)):
    return get_all_tickers(conn, category)


@router.get("/categories", response_model=list[CategoryInfo])
def list_categories(conn=Depends(get_db)):
    return get_categories(conn)


@router.get("/{symbol}", response_model=TickerInfo)
def ticker_detail(symbol: str, conn=Depends(get_db)):
    result = get_ticker_detail(conn, symbol)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Ticker '{symbol}' not found")
    return result

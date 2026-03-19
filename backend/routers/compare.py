"""API routes for asset comparison."""

from fastapi import APIRouter, Depends, Query

from backend.database import get_db
from backend.services.compare import get_comparison

router = APIRouter()


@router.get("")
def compare(
    symbols: str = Query(..., description="Comma-separated symbols (2-5)"),
    lookback: int = Query(252, ge=63, le=2520),
    conn=Depends(get_db),
):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if len(symbol_list) < 2:
        return {"error": "At least 2 symbols required"}
    if len(symbol_list) > 5:
        symbol_list = symbol_list[:5]
    return get_comparison(conn, symbol_list, lookback=lookback)

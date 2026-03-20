"""API routes for asset comparison."""

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.database import get_db
from backend.utils.params import parse_symbol_list
from backend.services.compare import get_comparison

router = APIRouter()


@router.get("")
def compare(
    symbols: str = Query(..., description="Comma-separated symbols (2-5)"),
    lookback: int = Query(252, ge=63, le=2520),
    conn=Depends(get_db),
):
    symbol_list = parse_symbol_list(symbols)

    if len(symbol_list) < 2:
        raise HTTPException(status_code=400, detail="At least 2 symbols required")
    if len(symbol_list) > 5:
        raise HTTPException(status_code=400, detail="At most 5 symbols supported")

    return get_comparison(conn, symbol_list, lookback=lookback)

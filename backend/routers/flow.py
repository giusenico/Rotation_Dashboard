"""OBV Structure Ranking endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.database import get_db
from backend.utils.params import normalize_symbol, parse_symbol_list
from backend.models.schemas import (
    OBVDetailResponse,
    OBVScoreHistoryEntry,
    OBVStructureEntry,
)
from backend.services.flow import get_obv_detail, get_obv_score_history, get_obv_structure

router = APIRouter()


@router.get("/structure", response_model=list[OBVStructureEntry])
def obv_structure(
    timeframe: str = Query("daily", pattern="^(daily|4h|weekly)$"),
    conn=Depends(get_db),
):
    return get_obv_structure(conn, timeframe=timeframe)


@router.get("/score-history", response_model=list[OBVScoreHistoryEntry])
def obv_score_history(
    symbols: str | None = Query(None, description="Comma-separated list of symbols"),
    lookback: int = Query(252, ge=21, le=9999, description="Trading days of history"),
    conn=Depends(get_db),
):
    sym_list = parse_symbol_list(symbols) if symbols is not None else None
    return get_obv_score_history(conn, symbols=sym_list, lookback_days=lookback)


@router.get("/detail/{symbol}", response_model=OBVDetailResponse)
def obv_detail(
    symbol: str,
    lookback: int = Query(252, ge=21, le=9999, description="Bars of detail data"),
    timeframe: str = Query("daily", pattern="^(daily|4h|weekly)$"),
    conn=Depends(get_db),
):
    symbol = normalize_symbol(symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
    result = get_obv_detail(conn, symbol=symbol, lookback_bars=lookback, timeframe=timeframe)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found in OBV universe")
    return result

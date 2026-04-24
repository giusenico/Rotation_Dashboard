"""Market Regime indicator endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.database import get_db
from backend.models.schemas import RegimeDetailResponse, RegimeSummaryEntry
from backend.services.regime import get_regime_detail, get_regime_summary
from backend.services.crypto_regime import (
    get_crypto_regime_detail,
    get_crypto_regime_summary,
)
from backend.utils.params import normalize_symbol

router = APIRouter()


@router.get("/summary", response_model=list[RegimeSummaryEntry])
def regime_summary(
    timeframe: str = Query("daily", pattern="^(daily|4h|weekly)$"),
    overext_mode: str = Query("Z", pattern="^(Z|pct|ATR)$"),
    conn=Depends(get_db),
):
    return get_regime_summary(conn, timeframe=timeframe, overext_mode=overext_mode)


@router.get("/detail/{symbol}", response_model=RegimeDetailResponse)
def regime_detail(
    symbol: str,
    lookback: int = Query(252, ge=21, le=9999),
    timeframe: str = Query("daily", pattern="^(daily|4h|weekly)$"),
    overext_mode: str = Query("Z", pattern="^(Z|pct|ATR)$"),
    conn=Depends(get_db),
):
    symbol = normalize_symbol(symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
    result = get_regime_detail(
        conn,
        symbol=symbol,
        lookback_bars=lookback,
        timeframe=timeframe,
        overext_mode=overext_mode,
    )
    if result is None:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")
    return result


# ── Crypto universe (daily/weekly, Z|pct overext) ────────────────────

@router.get("/crypto/summary", response_model=list[RegimeSummaryEntry])
def crypto_regime_summary(
    timeframe: str = Query("daily", pattern="^(daily|weekly)$"),
    overext_mode: str = Query("Z", pattern="^(Z|pct)$"),
    universe_limit: int = Query(20, ge=5, le=50),
    conn=Depends(get_db),
):
    return get_crypto_regime_summary(
        conn, timeframe=timeframe, overext_mode=overext_mode, universe_limit=universe_limit,
    )


@router.get("/crypto/detail/{asset_id}", response_model=RegimeDetailResponse)
def crypto_regime_detail(
    asset_id: str,
    lookback: int = Query(252, ge=21, le=9999),
    timeframe: str = Query("daily", pattern="^(daily|weekly)$"),
    overext_mode: str = Query("Z", pattern="^(Z|pct)$"),
    conn=Depends(get_db),
):
    if not asset_id:
        raise HTTPException(status_code=400, detail="asset_id is required")
    result = get_crypto_regime_detail(
        conn, asset_id=asset_id, lookback_bars=lookback,
        timeframe=timeframe, overext_mode=overext_mode,
    )
    if result is None:
        raise HTTPException(status_code=404, detail=f"Crypto asset '{asset_id}' not found")
    return result

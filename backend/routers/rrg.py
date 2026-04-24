"""RRG (Relative Rotation Graph) endpoints."""

from fastapi import APIRouter, Depends, Query

from backend.database import get_db
from backend.models.schemas import RRGResponse, RankingEntry
from backend.services.rrg import (
    get_sector_rrg,
    get_cross_asset_rrg,
    get_sector_rankings,
    get_cross_asset_rankings,
)
from backend.services.crypto_rrg import get_crypto_rrg, get_crypto_rankings

router = APIRouter()


@router.get("/sectors", response_model=RRGResponse)
def sector_rrg(
    trail_length: int = Query(5, ge=1, le=30),
    rs_span: int = Query(20, ge=5, le=50),
    momentum_span: int = Query(10, ge=5, le=30),
    timeframe: str = Query("weekly", pattern="^(daily|weekly|4h)$"),
    conn=Depends(get_db),
):
    return get_sector_rrg(conn, trail_length, rs_span, momentum_span, timeframe)


@router.get("/cross-asset", response_model=RRGResponse)
def cross_asset_rrg(
    trail_length: int = Query(5, ge=1, le=30),
    rs_span: int = Query(20, ge=5, le=50),
    momentum_span: int = Query(10, ge=5, le=30),
    timeframe: str = Query("weekly", pattern="^(daily|weekly|4h)$"),
    conn=Depends(get_db),
):
    return get_cross_asset_rrg(conn, trail_length, rs_span, momentum_span, timeframe)


@router.get("/rankings/sectors", response_model=list[RankingEntry])
def sector_rankings(
    timeframe: str = Query("weekly", pattern="^(daily|weekly|4h)$"),
    conn=Depends(get_db),
):
    return get_sector_rankings(conn, timeframe)


@router.get("/rankings/cross-asset", response_model=list[RankingEntry])
def cross_asset_rankings(
    timeframe: str = Query("weekly", pattern="^(daily|weekly|4h)$"),
    conn=Depends(get_db),
):
    return get_cross_asset_rankings(conn, timeframe)


# ── Crypto universe (benchmark BTC, daily|weekly only) ───────────────

@router.get("/crypto", response_model=RRGResponse)
def crypto_rrg(
    trail_length: int = Query(5, ge=1, le=30),
    rs_span: int = Query(20, ge=5, le=50),
    momentum_span: int = Query(10, ge=5, le=30),
    timeframe: str = Query("weekly", pattern="^(daily|weekly)$"),
    universe_limit: int = Query(20, ge=5, le=50),
    conn=Depends(get_db),
):
    return get_crypto_rrg(conn, trail_length, rs_span, momentum_span, timeframe, universe_limit)


@router.get("/rankings/crypto", response_model=list[RankingEntry])
def crypto_rankings(
    timeframe: str = Query("weekly", pattern="^(daily|weekly)$"),
    universe_limit: int = Query(20, ge=5, le=50),
    conn=Depends(get_db),
):
    return get_crypto_rankings(conn, timeframe, universe_limit)

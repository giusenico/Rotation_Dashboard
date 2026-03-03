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

router = APIRouter()


@router.get("/sectors", response_model=RRGResponse)
def sector_rrg(
    trail_length: int = Query(5, ge=1, le=30),
    rs_span: int = Query(20, ge=5, le=50),
    momentum_span: int = Query(10, ge=5, le=30),
    conn=Depends(get_db),
):
    return get_sector_rrg(conn, trail_length, rs_span, momentum_span)


@router.get("/cross-asset", response_model=RRGResponse)
def cross_asset_rrg(
    trail_length: int = Query(5, ge=1, le=30),
    rs_span: int = Query(20, ge=5, le=50),
    momentum_span: int = Query(10, ge=5, le=30),
    conn=Depends(get_db),
):
    return get_cross_asset_rrg(conn, trail_length, rs_span, momentum_span)


@router.get("/rankings/sectors", response_model=list[RankingEntry])
def sector_rankings(conn=Depends(get_db)):
    return get_sector_rankings(conn)


@router.get("/rankings/cross-asset", response_model=list[RankingEntry])
def cross_asset_rankings(conn=Depends(get_db)):
    return get_cross_asset_rankings(conn)

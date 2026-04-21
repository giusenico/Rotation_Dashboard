"""Crypto market-cap ranking endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.database import get_db
from backend.models.schemas import CryptoTop20Entry, CryptoHistoryPoint
from backend.services.crypto import get_crypto_history, get_crypto_top20

router = APIRouter()


@router.get("/top20", response_model=list[CryptoTop20Entry])
def crypto_top20(
    limit: int = Query(20, ge=1, le=50),
    conn=Depends(get_db),
):
    return get_crypto_top20(conn, limit=limit)


@router.get("/history/{asset_id}", response_model=list[CryptoHistoryPoint])
def crypto_history(
    asset_id: str,
    lookback: int = Query(365, ge=7, le=3650),
    conn=Depends(get_db),
):
    if not asset_id:
        raise HTTPException(status_code=400, detail="asset_id is required")
    return get_crypto_history(conn, asset_id=asset_id, lookback_days=lookback)

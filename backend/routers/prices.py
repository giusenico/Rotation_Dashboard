"""Price data endpoints."""

from fastapi import APIRouter, Depends, Query, HTTPException

from backend.database import get_db
from backend.utils.params import normalize_symbol, parse_symbol_list
from backend.models.schemas import (
    PriceResponse,
    PerformanceEntry,
    DrawdownResponse,
    CorrelationResponse,
    DashboardSummary,
)
from backend.config import ALL_TICKERS, SECTOR_ETFS, CROSS_ASSET_ETFS
from backend.services.prices import (
    get_price_series,
    get_latest_date,
    compute_performance,
    compute_drawdown,
    compute_correlation,
)
from backend.services.tickers import get_all_tickers
from backend.services.rrg import get_sector_rankings, get_cross_asset_rankings

router = APIRouter()


@router.get("/performance", response_model=list[PerformanceEntry])
def performance(
    symbols: str = Query("all", description="Comma-separated symbols or 'all', 'sectors', 'cross-asset'"),
    conn=Depends(get_db),
):
    if symbols.strip().lower() == "all":
        sym_list = [s for s in ALL_TICKERS if s != "^GSPC"]
    elif symbols.strip().lower() == "sectors":
        sym_list = list(SECTOR_ETFS.keys())
    elif symbols.strip().lower() == "cross-asset":
        sym_list = list(CROSS_ASSET_ETFS.keys())
    else:
        sym_list = parse_symbol_list(symbols)
        if not sym_list:
            raise HTTPException(status_code=400, detail="At least 1 symbol required")
    return compute_performance(conn, sym_list)


@router.get("/correlation", response_model=CorrelationResponse)
def correlation(
    symbols: str = Query(..., description="Comma-separated symbols"),
    lookback_days: int = Query(252, ge=30, le=1000),
    conn=Depends(get_db),
):
    sym_list = parse_symbol_list(symbols)
    if not sym_list:
        raise HTTPException(status_code=400, detail="At least 1 symbol required")
    return compute_correlation(conn, sym_list, lookback_days)


@router.get("/multi", response_model=list[PriceResponse])
def multi_prices(
    symbols: str = Query(..., description="Comma-separated symbols"),
    start_date: str | None = None,
    end_date: str | None = None,
    conn=Depends(get_db),
):
    sym_list = parse_symbol_list(symbols)
    if not sym_list:
        raise HTTPException(status_code=400, detail="At least 1 symbol required")
    results = []
    for sym in sym_list:
        data = get_price_series(conn, sym, start_date, end_date)
        results.append({
            "symbol": sym,
            "name": ALL_TICKERS.get(sym, sym),
            "data": data,
        })
    return results


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(conn=Depends(get_db)):
    tickers = get_all_tickers(conn)
    latest_date = get_latest_date(conn)

    # Get leaders
    sector_ranks = get_sector_rankings(conn)
    cross_asset_ranks = get_cross_asset_rankings(conn)

    sector_leader = sector_ranks[0] if sector_ranks else None
    cross_asset_leader = cross_asset_ranks[0] if cross_asset_ranks else None

    # S&P 500 YTD
    sp500_perf = compute_performance(conn, ["^GSPC"])
    sp500_ytd = sp500_perf[0].get("return_ytd") if sp500_perf else None

    return {
        "total_tickers": len(tickers),
        "latest_date": latest_date,
        "sector_leader": sector_leader,
        "cross_asset_leader": cross_asset_leader,
        "sp500_return_ytd": sp500_ytd,
    }


@router.get("/{symbol}/drawdown", response_model=DrawdownResponse)
def drawdown(
    symbol: str,
    start_date: str | None = None,
    end_date: str | None = None,
    conn=Depends(get_db),
):
    symbol = normalize_symbol(symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
    data = compute_drawdown(conn, symbol, start_date, end_date)
    return {
        "symbol": symbol,
        "name": ALL_TICKERS.get(symbol, symbol),
        "data": data,
    }


@router.get("/{symbol}", response_model=PriceResponse)
def price_series(
    symbol: str,
    start_date: str | None = None,
    end_date: str | None = None,
    conn=Depends(get_db),
):
    symbol = normalize_symbol(symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
    data = get_price_series(conn, symbol, start_date, end_date)
    if not data:
        raise HTTPException(status_code=404, detail=f"No price data for '{symbol}'")
    return {
        "symbol": symbol,
        "name": ALL_TICKERS.get(symbol, symbol),
        "data": data,
    }

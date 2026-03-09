"""
RRG (Relative Rotation Graph) computation engine.

Implements the JdK RS-Ratio / RS-Momentum algorithm using pandas,
faithfully matching the user's original notebook calculations.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import pandas as pd

from backend.config import (
    SECTOR_ETFS,
    CROSS_ASSET_ETFS,
    ALL_TICKERS,
    CACHE_TTL,
    TICKER_CATEGORY_MAP,
)


# ── In-memory cache (bounded) ────────────────────────────────────────

MAX_CACHE_ENTRIES = 30

@dataclass
class _CacheEntry:
    data: dict
    ts: float = field(default_factory=time.time)


_cache: dict[str, _CacheEntry] = {}


def _cache_get(key: str) -> dict | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    if time.time() - entry.ts > CACHE_TTL:
        del _cache[key]
        return None
    return entry.data


def _cache_set(key: str, data: dict) -> None:
    if len(_cache) >= MAX_CACHE_ENTRIES:
        oldest_key = min(_cache, key=lambda k: _cache[k].ts)
        del _cache[oldest_key]
    _cache[key] = _CacheEntry(data=data)


def invalidate_cache() -> None:
    """Clear all RRG in-memory caches."""
    _cache.clear()


# ── Helpers ──────────────────────────────────────────────────────────

def _fetch_adj_close(conn, symbols: list[str]) -> pd.DataFrame:
    """Fetch adj_close prices for given symbols and return a pivoted DataFrame."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT symbol, date, adj_close
        FROM daily_prices
        WHERE symbol IN ({placeholders})
        ORDER BY date
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    df = pd.DataFrame(rows, columns=["symbol", "date", "adj_close"])
    df["date"] = pd.to_datetime(df["date"])
    df = df.pivot(index="date", columns="symbol", values="adj_close").sort_index()
    df = df.ffill()  # forward-fill missing dates
    return df


def _fetch_intraday_close(conn, symbols: list[str]) -> pd.DataFrame:
    """Fetch close prices from intraday_prices_4h and return a pivoted DataFrame."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT symbol, datetime, close
        FROM intraday_prices_4h
        WHERE symbol IN ({placeholders})
        ORDER BY datetime
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    df = pd.DataFrame(rows, columns=["symbol", "datetime", "close"])
    df["datetime"] = pd.to_datetime(df["datetime"], utc=True)
    df = df.pivot(index="datetime", columns="symbol", values="close").sort_index()
    df = df.ffill()
    return df


def assign_quadrant(ratio: float, momentum: float) -> str:
    if ratio >= 100 and momentum >= 100:
        return "Leading"
    if ratio >= 100 and momentum < 100:
        return "Weakening"
    if ratio < 100 and momentum < 100:
        return "Lagging"
    return "Improving"


# ── Core computation ─────────────────────────────────────────────────

def compute_rrg(
    conn,
    ticker_map: dict[str, str],
    benchmark_symbol: str = "^GSPC",
    rs_span: int = 20,
    momentum_span: int = 10,
    trail_length: int = 5,
    timeframe: str = "weekly",
) -> dict:
    """
    Compute RRG coordinates for a set of tickers relative to a benchmark.

    Returns a dict ready for serialisation as RRGResponse.
    """
    symbols = list(ticker_map.keys()) + [benchmark_symbol]

    if timeframe == "4h":
        df = _fetch_intraday_close(conn, symbols)
    else:
        df = _fetch_adj_close(conn, symbols)
        if timeframe == "weekly":
            df = df.resample("W").last()

    if benchmark_symbol not in df.columns:
        return {
            "benchmark": benchmark_symbol,
            "benchmark_name": ALL_TICKERS.get(benchmark_symbol, benchmark_symbol),
            "as_of_date": "",
            "trail_length": trail_length,
            "tickers": [],
            "data": [],
        }

    benchmark = df[benchmark_symbol]
    sectors = df.drop(columns=[benchmark_symbol], errors="ignore")
    # Keep only requested tickers that exist in the data
    available = [s for s in ticker_map if s in sectors.columns]
    sectors = sectors[available]

    # RS computation (matching user's notebook exactly)
    rs = sectors.div(benchmark / 100, axis=0).ewm(span=rs_span, adjust=False).mean()
    rel_ratio = 100 + (rs - rs.mean()) / rs.std()

    rs_momentum_pct = rel_ratio.pct_change().ewm(span=momentum_span, adjust=False).mean()
    momentum = 100 + rs_momentum_pct / rs_momentum_pct.std()

    # Build result — last N points per ticker
    ratio_tail = rel_ratio.tail(trail_length)
    momentum_tail = momentum.tail(trail_length)

    date_fmt = "%Y-%m-%d %H:%M" if timeframe == "4h" else "%Y-%m-%d"

    data_points = []
    for ticker in available:
        name = ticker_map.get(ticker, ticker)
        for date_idx in ratio_tail.index:
            r = ratio_tail.at[date_idx, ticker]
            m = momentum_tail.at[date_idx, ticker]
            if pd.notna(r) and pd.notna(m):
                data_points.append({
                    "ticker": ticker,
                    "name": name,
                    "date": date_idx.strftime(date_fmt),
                    "ratio": round(float(r), 4),
                    "momentum": round(float(m), 4),
                })

    as_of = ratio_tail.index[-1].strftime(date_fmt) if len(ratio_tail) > 0 else ""

    return {
        "benchmark": benchmark_symbol,
        "benchmark_name": ALL_TICKERS.get(benchmark_symbol, benchmark_symbol),
        "as_of_date": as_of,
        "trail_length": trail_length,
        "tickers": available,
        "data": data_points,
    }


def compute_rankings(conn, ticker_map: dict[str, str], benchmark_symbol: str = "^GSPC", timeframe: str = "weekly") -> list[dict]:
    """Compute RRG rankings sorted by score (ratio + momentum) descending."""
    result = compute_rrg(conn, ticker_map, benchmark_symbol, trail_length=1, timeframe=timeframe)
    if not result["data"]:
        return []

    # Each ticker has exactly 1 point (trail_length=1)
    entries = []
    for pt in result["data"]:
        score = pt["ratio"] + pt["momentum"]
        cat = TICKER_CATEGORY_MAP.get(pt["ticker"], "")
        entries.append({
            "ticker": pt["ticker"],
            "name": pt["name"],
            "category": cat,
            "ratio": pt["ratio"],
            "momentum": pt["momentum"],
            "score": round(score, 4),
            "quadrant": assign_quadrant(pt["ratio"], pt["momentum"]),
        })

    entries.sort(key=lambda e: e["score"], reverse=True)
    for i, e in enumerate(entries, 1):
        e["rank"] = i

    return entries


# ── Cached public API ────────────────────────────────────────────────

def get_sector_rrg(conn, trail_length: int = 5, rs_span: int = 20, momentum_span: int = 10, timeframe: str = "weekly") -> dict:
    cache_key = f"sector_rrg_{trail_length}_{rs_span}_{momentum_span}_{timeframe}"
    cached = _cache_get(cache_key)
    if cached:
        return cached
    result = compute_rrg(conn, SECTOR_ETFS, trail_length=trail_length, rs_span=rs_span, momentum_span=momentum_span, timeframe=timeframe)
    _cache_set(cache_key, result)
    return result


def get_cross_asset_rrg(conn, trail_length: int = 5, rs_span: int = 20, momentum_span: int = 10, timeframe: str = "weekly") -> dict:
    cache_key = f"cross_asset_rrg_{trail_length}_{rs_span}_{momentum_span}_{timeframe}"
    cached = _cache_get(cache_key)
    if cached:
        return cached
    result = compute_rrg(conn, CROSS_ASSET_ETFS, trail_length=trail_length, rs_span=rs_span, momentum_span=momentum_span, timeframe=timeframe)
    _cache_set(cache_key, result)
    return result


def get_sector_rankings(conn, timeframe: str = "weekly") -> list[dict]:
    cache_key = f"sector_rankings_{timeframe}"
    cached = _cache_get(cache_key)
    if cached:
        return cached
    result = compute_rankings(conn, SECTOR_ETFS, timeframe=timeframe)
    _cache_set(cache_key, result)
    return result


def get_cross_asset_rankings(conn, timeframe: str = "weekly") -> list[dict]:
    cache_key = f"cross_asset_rankings_{timeframe}"
    cached = _cache_get(cache_key)
    if cached:
        return cached
    result = compute_rankings(conn, CROSS_ASSET_ETFS, timeframe=timeframe)
    _cache_set(cache_key, result)
    return result

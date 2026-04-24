"""
RRG (Relative Rotation Graph) for the crypto universe.

Computes JdK RS-Ratio / RS-Momentum against a BTC benchmark using
`crypto_mcap_snapshots` close prices. Mirrors the math in
`backend.services.rrg.compute_rrg` but reads from the crypto
universe loader so it runs without new DB tables.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import pandas as pd

from backend.config import CACHE_TTL
from backend.services.crypto_data import (
    BENCHMARK_ASSET_ID,
    fetch_crypto_close_pivot,
    get_crypto_universe,
)
from backend.services.rrg import assign_quadrant

logger = logging.getLogger(__name__)


VALID_CRYPTO_RRG_TIMEFRAMES = ("daily", "weekly")


# ── In-memory cache ─────────────────────────────────────────────────

MAX_CACHE_ENTRIES = 20


@dataclass
class _CacheEntry:
    data: object
    ts: float = field(default_factory=time.time)


_cache: dict[str, _CacheEntry] = {}


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry is None:
        return None
    if time.time() - entry.ts > CACHE_TTL:
        del _cache[key]
        return None
    return entry.data


def _cache_set(key: str, data) -> None:
    if len(_cache) >= MAX_CACHE_ENTRIES:
        oldest_key = min(_cache, key=lambda k: _cache[k].ts)
        del _cache[oldest_key]
    _cache[key] = _CacheEntry(data=data)


def invalidate_cache() -> None:
    _cache.clear()


# ── Core computation ────────────────────────────────────────────────

def _empty_response(trail_length: int) -> dict:
    return {
        "benchmark": BENCHMARK_ASSET_ID,
        "benchmark_name": "Bitcoin",
        "as_of_date": "",
        "trail_length": trail_length,
        "tickers": [],
        "data": [],
    }


def _compute(
    conn,
    trail_length: int,
    rs_span: int,
    momentum_span: int,
    timeframe: str,
    universe_limit: int,
) -> dict:
    if timeframe not in VALID_CRYPTO_RRG_TIMEFRAMES:
        timeframe = "daily"

    universe = get_crypto_universe(conn, limit=universe_limit)
    if not universe:
        return _empty_response(trail_length)

    asset_ids = list(universe.keys())
    if BENCHMARK_ASSET_ID not in asset_ids:
        asset_ids = [BENCHMARK_ASSET_ID] + asset_ids

    pivot = fetch_crypto_close_pivot(conn, asset_ids, timeframe=timeframe)
    if pivot.empty or BENCHMARK_ASSET_ID not in pivot.columns:
        return _empty_response(trail_length)

    benchmark = pivot[BENCHMARK_ASSET_ID]
    others = pivot.drop(columns=[BENCHMARK_ASSET_ID], errors="ignore")
    available = [a for a in universe if a in others.columns and a != BENCHMARK_ASSET_ID]
    others = others[available]

    rs = others.div(benchmark / 100, axis=0).ewm(span=rs_span, adjust=False).mean()
    rel_ratio = 100 + (rs - rs.mean()) / rs.std()

    rs_momentum_pct = rel_ratio.pct_change().ewm(span=momentum_span, adjust=False).mean()
    momentum = 100 + rs_momentum_pct / rs_momentum_pct.std()

    ratio_tail = rel_ratio.tail(trail_length)
    momentum_tail = momentum.tail(trail_length)

    date_fmt = "%Y-%m-%d"

    data_points: list[dict] = []
    for aid in available:
        display_name = universe[aid]["name"]
        for date_idx in ratio_tail.index:
            r = ratio_tail.at[date_idx, aid]
            m = momentum_tail.at[date_idx, aid]
            if pd.notna(r) and pd.notna(m):
                data_points.append({
                    "ticker": aid,
                    "name": display_name,
                    "date": date_idx.strftime(date_fmt),
                    "ratio": round(float(r), 4),
                    "momentum": round(float(m), 4),
                })

    as_of = ratio_tail.index[-1].strftime(date_fmt) if len(ratio_tail) > 0 else ""

    return {
        "benchmark": BENCHMARK_ASSET_ID,
        "benchmark_name": universe.get(BENCHMARK_ASSET_ID, {}).get("name", "Bitcoin"),
        "as_of_date": as_of,
        "trail_length": trail_length,
        "tickers": available,
        "data": data_points,
    }


# ── Public API ──────────────────────────────────────────────────────

def get_crypto_rrg(
    conn,
    trail_length: int = 5,
    rs_span: int = 20,
    momentum_span: int = 10,
    timeframe: str = "weekly",
    universe_limit: int = 20,
) -> dict:
    cache_key = f"crypto_rrg_{trail_length}_{rs_span}_{momentum_span}_{timeframe}_{universe_limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]
    try:
        result = _compute(conn, trail_length, rs_span, momentum_span, timeframe, universe_limit)
    except Exception:
        logger.exception("Failed to compute crypto RRG timeframe=%s", timeframe)
        return _empty_response(trail_length)
    if result["data"]:
        _cache_set(cache_key, result)
    return result


def get_crypto_rankings(
    conn,
    timeframe: str = "weekly",
    universe_limit: int = 20,
) -> list[dict]:
    cache_key = f"crypto_rrg_rankings_{timeframe}_{universe_limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        result = _compute(conn, trail_length=1, rs_span=20, momentum_span=10,
                          timeframe=timeframe, universe_limit=universe_limit)
    except Exception:
        logger.exception("Failed to compute crypto rankings timeframe=%s", timeframe)
        return []

    if not result["data"]:
        return []

    universe = get_crypto_universe(conn, limit=universe_limit)

    entries: list[dict] = []
    for pt in result["data"]:
        score = pt["ratio"] + pt["momentum"]
        meta = universe.get(pt["ticker"], {})
        entries.append({
            "ticker": pt["ticker"],
            "name": pt["name"],
            "category": "Crypto",
            "display_symbol": meta.get("symbol") or pt["ticker"],
            "logo_url": meta.get("logo_url"),
            "style_bucket": meta.get("style_bucket"),
            "market_cap": meta.get("market_cap"),
            "asset_type": "crypto",
            "ratio": pt["ratio"],
            "momentum": pt["momentum"],
            "score": round(score, 4),
            "quadrant": assign_quadrant(pt["ratio"], pt["momentum"]),
        })

    entries.sort(key=lambda e: e["score"], reverse=True)
    for i, e in enumerate(entries, 1):
        e["rank"] = i

    if entries:
        _cache_set(cache_key, entries)
    return entries

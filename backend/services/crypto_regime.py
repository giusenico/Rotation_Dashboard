"""
Market Regime engine for the crypto universe.

Reuses the math in `backend.services.regime` (regime, overextension,
capital flow z-score). Data source is `crypto_mcap_snapshots`.

Caveat: crypto snapshots don't store intraday high/low, so `high` and
`low` fall back to close. ATR-mode overextension becomes degenerate on
crypto — the frontend restricts the overext_mode toggle to Z and pct
for the crypto universe.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from backend.config import CACHE_TTL
from backend.services.crypto_data import (
    VALID_CRYPTO_TIMEFRAMES,
    fetch_crypto_asset_meta,
    fetch_crypto_for_timeframe,
    get_crypto_universe,
)
from backend.services.regime import (
    FLOW_THRESHOLD,
    TIMEFRAME_PARAMS,
    _compute_capital_flows,
    _compute_overextension,
    _compute_regime,
    _flow_label,
    _overext_label,
    _regime_label,
    _safe_float,
)

logger = logging.getLogger(__name__)

# Crypto-specific overext modes (ATR excluded — no intraday H/L):
VALID_CRYPTO_OVEREXT_MODES = ("Z", "pct")


# ── Cache ────────────────────────────────────────────────────────────

MAX_CACHE_ENTRIES = 30


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


# ── Public API ──────────────────────────────────────────────────────

def get_crypto_regime_summary(
    conn,
    timeframe: str = "daily",
    overext_mode: str = "Z",
    universe_limit: int = 20,
) -> list[dict]:
    """Regime/overextension/flow snapshot for the crypto top-N universe."""
    if timeframe not in VALID_CRYPTO_TIMEFRAMES:
        timeframe = "daily"
    if overext_mode not in VALID_CRYPTO_OVEREXT_MODES:
        overext_mode = "Z"

    cache_key = f"crypto_regime_summary_{timeframe}_{overext_mode}_{universe_limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        universe = get_crypto_universe(conn, limit=universe_limit)
        if not universe:
            return []
        asset_ids = list(universe.keys())
        data_map = fetch_crypto_for_timeframe(conn, asset_ids, timeframe)
        params = TIMEFRAME_PARAMS[timeframe]

        results: list[dict] = []
        for aid, meta in universe.items():
            if aid not in data_map:
                continue

            df = data_map[aid]
            close = df["adj_close"]
            high = df["high"]
            low = df["low"]
            volume = df["volume"]

            regime = _compute_regime(close, params["sma_len"], params["neutral_bw"])
            overext, threshold = _compute_overextension(
                close, high, low,
                params["sma_len"], overext_mode,
                params["stdev_len"], params["atr_len"],
            )

            has_volume = volume.sum() > 0
            if has_volume:
                flow_z = _compute_capital_flows(
                    close, volume, params["flow_sma"], params["flow_z_len"],
                )
                flow_val = _safe_float(flow_z.iloc[-1])
            else:
                flow_val = None

            if pd.isna(regime.iloc[-1]):
                continue
            regime_val = int(regime.iloc[-1])
            overext_val = _safe_float(overext.iloc[-1])
            basis = close.rolling(params["sma_len"], min_periods=1).mean()

            results.append({
                "symbol": aid,
                "asset": meta["name"],
                "category": "Crypto",
                "display_symbol": meta.get("symbol"),
                "logo_url": meta.get("logo_url"),
                "asset_type": "crypto",
                "style_bucket": meta.get("style_bucket"),
                "last_price": _safe_float(close.iloc[-1], 2),
                "regime": regime_val,
                "regime_label": _regime_label(regime_val),
                "overextension": overext_val,
                "overext_label": _overext_label(overext_val, threshold),
                "capital_flow_z": flow_val,
                "flow_label": _flow_label(flow_val),
                "sma_value": _safe_float(basis.iloc[-1], 2),
            })

        results.sort(key=lambda x: x["regime"], reverse=True)
        _cache_set(cache_key, results)
        return results
    except Exception:
        logger.exception(
            "Failed to compute crypto regime summary timeframe=%s overext_mode=%s",
            timeframe, overext_mode,
        )
        return []


def get_crypto_regime_detail(
    conn,
    asset_id: str,
    lookback_bars: int = 252,
    timeframe: str = "daily",
    overext_mode: str = "Z",
) -> dict | None:
    """Full regime time-series for a single crypto asset."""
    if timeframe not in VALID_CRYPTO_TIMEFRAMES:
        timeframe = "daily"
    if overext_mode not in VALID_CRYPTO_OVEREXT_MODES:
        overext_mode = "Z"

    meta_map = fetch_crypto_asset_meta(conn, [asset_id])
    if asset_id not in meta_map:
        return None
    meta = meta_map[asset_id]

    cache_key = f"crypto_regime_detail_{asset_id}_{lookback_bars}_{timeframe}_{overext_mode}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        data_map = fetch_crypto_for_timeframe(conn, [asset_id], timeframe)
        if asset_id not in data_map:
            return None

        df = data_map[asset_id]
        close = df["adj_close"]
        high = df["high"]
        low = df["low"]
        volume = df["volume"]
        params = TIMEFRAME_PARAMS[timeframe]

        regime = _compute_regime(close, params["sma_len"], params["neutral_bw"])
        overext, threshold = _compute_overextension(
            close, high, low,
            params["sma_len"], overext_mode,
            params["stdev_len"], params["atr_len"],
        )

        has_volume = volume.sum() > 0
        if has_volume:
            flow_z = _compute_capital_flows(
                close, volume, params["flow_sma"], params["flow_z_len"],
            )
        else:
            flow_z = pd.Series(np.nan, index=close.index)

        basis = close.rolling(params["sma_len"], min_periods=1).mean()
        fmt = "%Y-%m-%d"
        tail_idx = close.tail(lookback_bars).index

        price_series = [
            {"date": idx.strftime(fmt),
             "close": _safe_float(close.at[idx], 2),
             "sma": _safe_float(basis.at[idx], 2)}
            for idx in tail_idx if pd.notna(close.at[idx])
        ]
        regime_series = [
            {"date": idx.strftime(fmt), "value": int(regime.at[idx])}
            for idx in tail_idx if pd.notna(regime.at[idx])
        ]
        overext_series = [
            {"date": idx.strftime(fmt), "value": _safe_float(overext.at[idx])}
            for idx in tail_idx
            if pd.notna(overext.at[idx]) and _safe_float(overext.at[idx]) is not None
        ]
        flow_series = [
            {"date": idx.strftime(fmt), "value": _safe_float(flow_z.at[idx])}
            for idx in tail_idx
            if pd.notna(flow_z.at[idx]) and _safe_float(flow_z.at[idx]) is not None
        ]

        result = {
            "symbol": asset_id,
            "asset": meta["name"],
            "display_symbol": meta.get("symbol"),
            "logo_url": meta.get("logo_url"),
            "asset_type": "crypto",
            "last_price": _safe_float(close.iloc[-1], 2),
            "regime_current": int(regime.iloc[-1]) if pd.notna(regime.iloc[-1]) else 0,
            "overext_current": _safe_float(overext.iloc[-1]),
            "overext_threshold": threshold,
            "flow_z_current": _safe_float(flow_z.iloc[-1]) if has_volume else None,
            "flow_threshold": FLOW_THRESHOLD,
            "price_series": price_series,
            "regime_series": regime_series,
            "overext_series": overext_series,
            "flow_series": flow_series,
        }
        _cache_set(cache_key, result)
        return result
    except Exception:
        logger.exception(
            "Failed to compute crypto regime detail asset_id=%s", asset_id,
        )
        return None

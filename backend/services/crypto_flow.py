"""
OBV-based capital-flow structure for the crypto universe.

Reuses the math in `backend.services.flow` (OBV, spread, percentile,
z-momentum, rotation score). Data source is `crypto_mcap_snapshots`
via `crypto_data.fetch_crypto_for_timeframe`.

Timeframes supported: daily, weekly (no intraday for crypto).
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
from backend.services.flow import (
    TIMEFRAME_PARAMS,
    _compute_obv,
    _compute_rolling_scores,
    _compute_spread,
    _pct_rank_last,
    _regime,
    _trailing_return,
)

logger = logging.getLogger(__name__)


# ── In-memory cache ─────────────────────────────────────────────────

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


def invalidate_cache() -> None:
    _cache.clear()


# ── Public API: crypto structure ────────────────────────────────────

def get_crypto_obv_structure(
    conn,
    timeframe: str = "daily",
    universe_limit: int = 20,
) -> list[dict]:
    """Return the OBV structure table for the crypto top-N universe."""
    if timeframe not in VALID_CRYPTO_TIMEFRAMES:
        timeframe = "daily"

    cache_key = f"crypto_obv_structure_{timeframe}_{universe_limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        universe = get_crypto_universe(conn, limit=universe_limit)
        if not universe:
            return []

        asset_ids = list(universe.keys())
        data_map = fetch_crypto_for_timeframe(conn, asset_ids, timeframe=timeframe)
        params = TIMEFRAME_PARAMS[timeframe]

        results: list[dict] = []
        for aid, meta in universe.items():
            if aid not in data_map:
                continue

            df = data_map[aid]
            close = df["adj_close"]
            volume = df["volume"]

            obv = _compute_obv(close, volume)
            spread, _ = _compute_spread(obv, params["sma_len"])

            if spread.dropna().empty:
                continue

            spread_pctl = _pct_rank_last(spread, params["rank_lookback"])
            roc = spread.diff(params["roc_len"])
            spread_vol = spread.rolling(params["rank_lookback"]).std()

            z_momo: float = np.nan
            last_vol = spread_vol.iloc[-1]
            if len(spread) > params["roc_len"] and last_vol != 0 and not pd.isna(last_vol):
                z_momo = float(np.tanh(roc.iloc[-1] / (last_vol + 1e-9)))

            mean_val = np.nanmean([spread_pctl, z_momo])
            score: float | None = (
                float(np.clip(mean_val, -1, 1)) if not np.isnan(mean_val) else None
            )

            spread_series = [
                {"date": idx.strftime("%Y-%m-%d"), "value": round(float(v), 2)}
                for idx, v in spread.dropna().tail(params["spread_bars"]).items()
            ]

            # Inline score history — tickers use /flow/score-history
            # backed by obv_daily_metrics (crypto has no equivalent table),
            # so return a short tail per-row for delta/sparkline rendering.
            score_history = _compute_rolling_scores(
                spread, params["rank_lookback"], params["roc_len"], 10, "%Y-%m-%d"
            )

            results.append({
                "asset": meta["name"],
                "symbol": aid,
                "display_symbol": meta.get("symbol"),
                "logo_url": meta.get("logo_url"),
                "asset_type": "crypto",
                "obv_regime": _regime(float(spread.iloc[-1])),
                "spread_last": round(float(spread.iloc[-1]), 4),
                "rotation_score": round(score, 4) if score is not None else None,
                "spread_percentile": round(float(spread_pctl), 4)
                    if not np.isnan(spread_pctl) else None,
                "spread_momentum_z": round(float(z_momo), 4)
                    if not np.isnan(z_momo) else None,
                "return_1m": _trailing_return(close, params["ret_1m"]),
                "return_3m": _trailing_return(close, params["ret_3m"]),
                "return_6m": _trailing_return(close, params["ret_6m"]),
                "return_ytd": _trailing_return(close, "YTD"),
                "market_cap": meta.get("market_cap"),
                "style_bucket": meta.get("style_bucket"),
                "spread_series": spread_series,
                "score_history": score_history,
            })

        results.sort(
            key=lambda x: x["rotation_score"] if x["rotation_score"] is not None else -999,
            reverse=True,
        )
        _cache_set(cache_key, results)
        return results
    except Exception:
        logger.exception("Failed to build crypto OBV structure timeframe=%s", timeframe)
        return []


# ── Public API: crypto detail ───────────────────────────────────────

def get_crypto_obv_detail(
    conn,
    asset_id: str,
    lookback_bars: int = 252,
    timeframe: str = "daily",
) -> dict | None:
    """Return single-asset crypto OBV detail (for the detail modal)."""
    if timeframe not in VALID_CRYPTO_TIMEFRAMES:
        timeframe = "daily"

    meta_map = fetch_crypto_asset_meta(conn, [asset_id])
    if asset_id not in meta_map:
        return None
    meta = meta_map[asset_id]

    cache_key = f"crypto_obv_detail_{asset_id}_{lookback_bars}_{timeframe}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        data_map = fetch_crypto_for_timeframe(conn, [asset_id], timeframe)
        if asset_id not in data_map:
            return None

        df = data_map[asset_id]
        close = df["adj_close"]
        volume = df["volume"]
        params = TIMEFRAME_PARAMS[timeframe]

        obv = _compute_obv(close, volume)
        spread, _ = _compute_spread(obv, params["sma_len"])

        if spread.dropna().empty:
            return None

        tail_obv = obv.dropna().tail(lookback_bars)
        tail_spread = spread.dropna().tail(lookback_bars)

        obv_series = [
            {"date": idx.strftime("%Y-%m-%d"), "value": round(float(v), 0)}
            for idx, v in tail_obv.items()
        ]
        spread_series_out = [
            {"date": idx.strftime("%Y-%m-%d"), "value": round(float(v), 2)}
            for idx, v in tail_spread.items()
        ]
        score_history = _compute_rolling_scores(
            spread, params["rank_lookback"], params["roc_len"], lookback_bars, "%Y-%m-%d"
        )

        spread_pctl = _pct_rank_last(spread, params["rank_lookback"])
        roc = spread.diff(params["roc_len"])
        spread_vol = spread.rolling(params["rank_lookback"]).std()
        z_momo: float = np.nan
        last_vol = spread_vol.iloc[-1]
        if len(spread) > params["roc_len"] and last_vol != 0 and not pd.isna(last_vol):
            z_momo = float(np.tanh(roc.iloc[-1] / (last_vol + 1e-9)))
        mean_val = np.nanmean([spread_pctl, z_momo])
        score: float | None = (
            float(np.clip(mean_val, -1, 1)) if not np.isnan(mean_val) else None
        )
        last_price = round(float(close.iloc[-1]), 2) if len(close) > 0 else None

        result = {
            "symbol": asset_id,
            "asset": meta["name"],
            "display_symbol": meta.get("symbol"),
            "logo_url": meta.get("logo_url"),
            "asset_type": "crypto",
            "obv_regime": _regime(float(spread.iloc[-1])),
            "last_price": last_price,
            "rotation_score": round(score, 4) if score is not None else None,
            "spread_percentile": round(float(spread_pctl), 4)
                if not np.isnan(spread_pctl) else None,
            "spread_momentum_z": round(float(z_momo), 4)
                if not np.isnan(z_momo) else None,
            "return_1m": _trailing_return(close, params["ret_1m"]),
            "return_3m": _trailing_return(close, params["ret_3m"]),
            "return_6m": _trailing_return(close, params["ret_6m"]),
            "return_ytd": _trailing_return(close, "YTD"),
            "obv_series": obv_series,
            "spread_series": spread_series_out,
            "score_history": score_history,
        }
        _cache_set(cache_key, result)
        return result
    except Exception:
        logger.exception(
            "Failed to build crypto OBV detail asset_id=%s timeframe=%s",
            asset_id, timeframe,
        )
        return None

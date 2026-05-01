"""
OBV-based capital-flow structure for the crypto universe.

Daily timeframe reads pre-computed scalars + history from
`crypto_obv_metrics` (populated by scripts/update_crypto_flow.py) so the
endpoint is a pure SELECT — no cold-start compute.

Weekly timeframe is computed on the fly and cached in-process; it shares
the math helpers in `backend.services.flow`.
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
    _days_in_regime,
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

        if timeframe == "daily":
            results = _build_daily_from_table(conn, universe)
        else:
            results = _compute_weekly_on_the_fly(conn, universe)

        results.sort(
            key=lambda x: x["rotation_score"] if x["rotation_score"] is not None else -999,
            reverse=True,
        )
        _cache_set(cache_key, results)
        return results
    except Exception:
        logger.exception("Failed to build crypto OBV structure timeframe=%s", timeframe)
        return []


# Daily path: read scalars + history from crypto_obv_metrics ─────────

def _fetch_recent_closes(
    conn, asset_ids: list[str], window: int,
) -> dict[str, list[float]]:
    """Last `window` daily closes per asset_id, oldest → newest.

    Single query so the trigger-level enrichment doesn't add 20+ round
    trips on the structure endpoint.
    """
    if not asset_ids or window <= 0:
        return {}
    placeholders = ",".join(["%s"] * len(asset_ids))
    query = f"""
        WITH ranked AS (
            SELECT asset_id, snapshot_date, price,
                   ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY snapshot_date DESC) AS rn
            FROM crypto_mcap_snapshots
            WHERE asset_id IN ({placeholders})
              AND price IS NOT NULL
        )
        SELECT asset_id, snapshot_date, price
        FROM ranked
        WHERE rn <= %s
        ORDER BY asset_id, snapshot_date
    """
    with conn.cursor() as cur:
        cur.execute(query, [*asset_ids, window])
        rows = cur.fetchall()
    out: dict[str, list[float]] = {}
    for aid, _dt, price in rows:
        out.setdefault(aid, []).append(float(price))
    return out


def _trigger_levels(closes: list[float]) -> tuple[float | None, float | None, float | None]:
    """Last-price, confirmation (recent high), invalidation (recent low).

    If the live bar prints the window extreme, pad ±0.5% so the trigger
    stays distinct from the current price (matches the ticker path).
    """
    if not closes:
        return None, None, None
    last = closes[-1]
    if len(closes) < 2:
        return round(last, 4), None, None
    hi = max(closes)
    lo = min(closes)
    confirmation = hi if hi > last * 1.001 else round(last * 1.005, 4)
    invalidation = lo if lo < last * 0.999 else round(last * 0.995, 4)
    return round(last, 4), round(confirmation, 4), round(invalidation, 4)


def _build_daily_from_table(conn, universe: dict[str, dict]) -> list[dict]:
    """Pure-SELECT version that joins the pre-computed scalars with universe metadata."""
    asset_ids = list(universe.keys())
    if not asset_ids:
        return []

    spread_bars = TIMEFRAME_PARAMS["daily"]["spread_bars"]
    score_history_bars = 10
    trigger_window = TIMEFRAME_PARAMS["daily"]["ret_1m"]
    closes_by_aid = _fetch_recent_closes(conn, asset_ids, trigger_window)

    placeholders = ",".join(["%s"] * len(asset_ids))
    # Limit the per-asset window to spread_bars rows so the query stays
    # bounded even when the table grows. ROW_NUMBER() ranks newest-first.
    query = f"""
        WITH ranked AS (
            SELECT
                asset_id, date, obv_regime, spread_last, spread_pct,
                momentum_z, rotation_score, return_1m, return_3m,
                return_6m, return_ytd,
                ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY date DESC) AS rn
            FROM crypto_obv_metrics
            WHERE asset_id IN ({placeholders})
        )
        SELECT asset_id, date, obv_regime, spread_last, spread_pct,
               momentum_z, rotation_score, return_1m, return_3m,
               return_6m, return_ytd, rn
        FROM ranked
        WHERE rn <= %s
        ORDER BY asset_id, date
    """
    with conn.cursor() as cur:
        cur.execute(query, [*asset_ids, spread_bars])
        rows = cur.fetchall()

    by_asset: dict[str, list[tuple]] = {}
    for r in rows:
        by_asset.setdefault(r[0], []).append(r)

    results: list[dict] = []
    for aid, meta in universe.items():
        asset_rows = by_asset.get(aid)
        if not asset_rows:
            continue

        # Latest row = rn == 1; rows are ordered ASC by date so it's the last one.
        latest = asset_rows[-1]
        (_aid, _dt, regime, spread_last, spread_pct, momentum_z,
         rotation_score, return_1m, return_3m, return_6m, return_ytd, _rn) = latest

        spread_series = [
            {"date": r[1].isoformat(), "value": round(float(r[3]), 2)}
            for r in asset_rows if r[3] is not None
        ]
        score_history = [
            {
                "date":          r[1].isoformat(),
                "rotation_score": round(float(r[6]), 4) if r[6] is not None else None,
                "obv_regime":    r[2],
                "spread_last":   round(float(r[3]), 4) if r[3] is not None else None,
            }
            for r in asset_rows[-score_history_bars:]
            if r[6] is not None
        ]

        # Run-length of the current regime, walking back through asset_rows
        # (ordered ASC by date). Capped by the windowed query above.
        days_in_regime: int | None = None
        if regime is not None:
            run = 0
            for r in reversed(asset_rows):
                if r[2] != regime:
                    break
                run += 1
            days_in_regime = run

        last_price, confirmation_price, invalidation_price = _trigger_levels(
            closes_by_aid.get(aid, [])
        )

        results.append({
            "asset":               meta["name"],
            "symbol":              aid,
            "display_symbol":      meta.get("symbol"),
            "logo_url":            meta.get("logo_url"),
            "asset_type":          "crypto",
            "obv_regime":          regime,
            "spread_last":         round(float(spread_last), 4) if spread_last is not None else None,
            "rotation_score":      round(float(rotation_score), 4) if rotation_score is not None else None,
            "spread_percentile":   round(float(spread_pct), 4) if spread_pct is not None else None,
            "spread_momentum_z":   round(float(momentum_z), 4) if momentum_z is not None else None,
            "return_1m":           float(return_1m) if return_1m is not None else None,
            "return_3m":           float(return_3m) if return_3m is not None else None,
            "return_6m":           float(return_6m) if return_6m is not None else None,
            "return_ytd":          float(return_ytd) if return_ytd is not None else None,
            "last_price":          last_price,
            "confirmation_price":  confirmation_price,
            "invalidation_price":  invalidation_price,
            "market_cap":          meta.get("market_cap"),
            "style_bucket":        meta.get("style_bucket"),
            "spread_series":       spread_series,
            "score_history":       score_history,
            "days_in_regime":      days_in_regime,
        })

    return results


# Weekly path: kept on the fly (low traffic, no equivalent table) ────

def _compute_weekly_on_the_fly(conn, universe: dict[str, dict]) -> list[dict]:
    asset_ids = list(universe.keys())
    data_map = fetch_crypto_for_timeframe(conn, asset_ids, timeframe="weekly")
    params = TIMEFRAME_PARAMS["weekly"]

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
        score_history = _compute_rolling_scores(
            spread, params["rank_lookback"], params["roc_len"], 10, "%Y-%m-%d"
        )

        recent_close_window = close.dropna().tail(params["ret_1m"]).tolist()
        last_price, confirmation_price, invalidation_price = _trigger_levels(
            [float(v) for v in recent_close_window]
        )

        results.append({
            "asset":               meta["name"],
            "symbol":              aid,
            "display_symbol":      meta.get("symbol"),
            "logo_url":            meta.get("logo_url"),
            "asset_type":          "crypto",
            "obv_regime":          _regime(float(spread.iloc[-1])),
            "spread_last":         round(float(spread.iloc[-1]), 4),
            "rotation_score":      round(score, 4) if score is not None else None,
            "spread_percentile":   round(float(spread_pctl), 4)
                if not np.isnan(spread_pctl) else None,
            "spread_momentum_z":   round(float(z_momo), 4)
                if not np.isnan(z_momo) else None,
            "return_1m":           _trailing_return(close, params["ret_1m"]),
            "return_3m":           _trailing_return(close, params["ret_3m"]),
            "return_6m":           _trailing_return(close, params["ret_6m"]),
            "return_ytd":          _trailing_return(close, "YTD"),
            "last_price":          last_price,
            "confirmation_price":  confirmation_price,
            "invalidation_price":  invalidation_price,
            "market_cap":          meta.get("market_cap"),
            "style_bucket":        meta.get("style_bucket"),
            "spread_series":       spread_series,
            "score_history":       score_history,
            "days_in_regime":      _days_in_regime(spread),
        })

    return results


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

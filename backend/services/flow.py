"""
OBV (On-Balance Volume) Structure Ranking engine.

Computes OBV, spread (OBV - SMA), percentile rank, z-scored momentum,
composite rotation score, and trailing returns for the cross-asset universe.

Supports three timeframes: daily, 4h (intraday), weekly (resampled from daily).

Persistence strategy (hybrid):
  - Scalar metrics (regime, spread_last, spread_pct, momentum_z, rotation_score)
    are written to `obv_daily_metrics` once per calendar day (daily timeframe only).
  - Spread / OBV time-series for charting are derived on-the-fly from raw prices.
  - Score history (rotation_score over time) is read directly from the DB table.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd

from backend.config import CACHE_TTL, CROSS_ASSET_ETFS, SECTOR_ETFS

logger = logging.getLogger(__name__)


# ── Timeframe-specific constants ─────────────────────────────────────

VALID_TIMEFRAMES = ("daily", "4h", "weekly")

TIMEFRAME_PARAMS = {
    "daily": {
        "sma_len": 50,
        "rank_lookback": 252,
        "roc_len": 20,
        "spread_bars": 252,
        "ret_1m": 21,
        "ret_3m": 63,
        "ret_6m": 126,
    },
    "4h": {
        "sma_len": 100,       # ~50 trading days at ~2 bars/day
        "rank_lookback": 504,  # ~252 trading days
        "roc_len": 40,         # ~20 trading days
        "spread_bars": 504,
        "ret_1m": 42,
        "ret_3m": 126,
        "ret_6m": 252,
    },
    "weekly": {
        "sma_len": 10,        # ~50 trading days / 5
        "rank_lookback": 52,   # ~1 year
        "roc_len": 4,          # ~1 month
        "spread_bars": 104,    # ~2 years
        "ret_1m": 4,
        "ret_3m": 13,
        "ret_6m": 26,
    },
}

# Legacy aliases for daily (used by backfill / update scripts)
OBV_SMA_LEN = 50
RANK_LOOKBACK = 252
ROC_LEN = 20
SPREAD_SERIES_BARS = 252


# ── In-memory cache (bounded) ─────────────────────────────────────────

MAX_CACHE_ENTRIES = 50

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
    # Evict oldest entries if cache is full
    if len(_cache) >= MAX_CACHE_ENTRIES:
        oldest_key = min(_cache, key=lambda k: _cache[k].ts)
        del _cache[oldest_key]
    _cache[key] = _CacheEntry(data=data)


def invalidate_cache() -> None:
    """Clear all OBV in-memory caches (call after writing new metrics)."""
    _cache.clear()


# ── Data fetching ─────────────────────────────────────────────────────

def _fetch_ticker_metadata(
    conn, symbols: list[str]
) -> dict[str, dict]:
    """Return {symbol: {market_cap, style_bucket}} for the given symbols."""
    if not symbols:
        return {}
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"SELECT symbol, market_cap, style_bucket FROM tickers WHERE symbol IN ({placeholders})"
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()
    return {
        sym: {"market_cap": mcap, "style_bucket": bucket}
        for sym, mcap, bucket in rows
    }


def _fetch_close_volume(conn, symbols: list[str]) -> dict[str, pd.DataFrame]:
    """Fetch daily close + volume from daily_prices."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT symbol, date, adj_close, volume
        FROM daily_prices
        WHERE symbol IN ({placeholders})
        ORDER BY date
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    if not rows:
        return {}

    df = pd.DataFrame(rows, columns=["symbol", "date", "adj_close", "volume"])
    df["date"] = pd.to_datetime(df["date"])

    result: dict[str, pd.DataFrame] = {}
    for sym, grp in df.groupby("symbol"):
        grp = grp.set_index("date").sort_index()[["adj_close", "volume"]]
        grp = grp.dropna(subset=["adj_close"])
        if not grp.empty:
            result[sym] = grp  # type: ignore[assignment]
    return result


def _fetch_close_volume_4h(conn, symbols: list[str]) -> dict[str, pd.DataFrame]:
    """Fetch 4h close + volume from intraday_prices_4h."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT symbol, datetime, close, volume
        FROM intraday_prices_4h
        WHERE symbol IN ({placeholders})
        ORDER BY datetime
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    if not rows:
        return {}

    df = pd.DataFrame(rows, columns=["symbol", "datetime", "adj_close", "volume"])
    df["datetime"] = pd.to_datetime(df["datetime"])

    result: dict[str, pd.DataFrame] = {}
    for sym, grp in df.groupby("symbol"):
        grp = grp.set_index("datetime").sort_index()[["adj_close", "volume"]]
        grp = grp.dropna(subset=["adj_close"])
        if not grp.empty:
            result[sym] = grp  # type: ignore[assignment]
    return result


def _resample_weekly(data_map: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """Resample daily OHLCV to weekly bars (Friday close)."""
    result: dict[str, pd.DataFrame] = {}
    for sym, df in data_map.items():
        weekly = df.resample("W-FRI").agg({"adj_close": "last", "volume": "sum"}).dropna()
        if not weekly.empty:
            result[sym] = weekly
    return result


def _fetch_for_timeframe(
    conn, symbols: list[str], timeframe: str
) -> dict[str, pd.DataFrame]:
    """Fetch close+volume data for the requested timeframe."""
    if timeframe == "4h":
        return _fetch_close_volume_4h(conn, symbols)
    data_map = _fetch_close_volume(conn, symbols)
    if timeframe == "weekly":
        return _resample_weekly(data_map)
    return data_map


# ── Core OBV math ─────────────────────────────────────────────────────

def _compute_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    sign = np.sign(close.diff()).fillna(0.0)
    return (sign * volume.fillna(0.0)).cumsum()


def _compute_spread(obv: pd.Series, length: int):
    sma = obv.rolling(length).mean()
    return obv - sma, sma


def _pct_rank_last(series: pd.Series, window: int) -> float:
    s = series.dropna()
    if len(s) < window:
        return np.nan
    w = s.iloc[-window:]
    return float((w.rank(pct=True).iloc[-1] - 0.5) * 2)


def _trailing_return(close: pd.Series, bars_or_ytd) -> float | None:
    if isinstance(bars_or_ytd, str) and bars_or_ytd.upper() == "YTD":
        this_year = close[close.index.year == close.index[-1].year]
        if this_year.empty:
            return None
        return round(float(close.iloc[-1] / this_year.iloc[0] - 1.0) * 100, 2)
    bars = int(bars_or_ytd)
    if len(close) <= bars:
        return None
    return round(float(close.iloc[-1] / close.iloc[-(bars + 1)] - 1.0) * 100, 2)


def _regime(spread_last: float) -> str:
    return "buy" if spread_last >= 0 else "sell"


def _compute_rolling_scores(
    spread: pd.Series,
    rank_lookback: int,
    roc_len: int,
    n_bars: int,
    fmt: str,
) -> list[dict]:
    """Compute rolling rotation scores for charting (all timeframes)."""
    if len(spread.dropna()) < rank_lookback:
        return []

    # Rolling percentile rank — same formula as _pct_rank_last and the notebook
    def _rank_last(w):
        last = w[-1]
        if np.isnan(last):
            return np.nan
        s = pd.Series(w)
        return (s.rank(pct=True).iloc[-1] - 0.5) * 2

    spread_pctl = spread.rolling(rank_lookback, min_periods=rank_lookback).apply(
        _rank_last, raw=True
    )

    # Momentum z-score
    roc = spread.diff(roc_len)
    spread_vol = spread.rolling(rank_lookback).std()
    z_momo = np.tanh(roc / (spread_vol + 1e-9))

    # Composite score
    score = ((spread_pctl + z_momo) / 2).clip(-1, 1)

    # Combine into DataFrame, take tail
    combined = pd.DataFrame({
        "score": score,
        "spread": spread,
    }).dropna(subset=["score"]).tail(n_bars)

    return [
        {
            "date": idx.strftime(fmt),
            "rotation_score": round(float(row["score"]), 4),
            "obv_regime": "buy" if row["spread"] >= 0 else "sell",
            "spread_last": round(float(row["spread"]), 4),
        }
        for idx, row in combined.iterrows()
    ]


# ── DB persistence helpers ────────────────────────────────────────────

def _today_already_written(conn, today_str: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM obv_daily_metrics WHERE date = %s LIMIT 1",
            (today_str,),
        )
        return cur.fetchone() is not None


def _write_daily_metrics(conn, today_str: str, rows: list[dict]) -> None:
    with conn.cursor() as cur:
        for r in rows:
            cur.execute(
                """
                INSERT INTO obv_daily_metrics
                    (date, symbol, obv_regime, spread_last, spread_pct, momentum_z, rotation_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (date, symbol) DO UPDATE SET
                    obv_regime     = EXCLUDED.obv_regime,
                    spread_last    = EXCLUDED.spread_last,
                    spread_pct     = EXCLUDED.spread_pct,
                    momentum_z     = EXCLUDED.momentum_z,
                    rotation_score = EXCLUDED.rotation_score
                """,
                (
                    today_str,
                    r["symbol"],
                    r["obv_regime"],
                    r.get("spread_last"),
                    r.get("spread_percentile"),
                    r.get("spread_momentum_z"),
                    r.get("rotation_score"),
                ),
            )
    conn.commit()


# ── Core computation (always from raw prices) ─────────────────────────

def _compute_all(
    conn,
    ticker_map: dict[str, str],
    timeframe: str = "daily",
) -> list[dict]:
    """Compute OBV structure for every ticker from raw price data."""
    params = TIMEFRAME_PARAMS[timeframe]
    symbols = list(ticker_map.keys())
    data_map = _fetch_for_timeframe(conn, symbols, timeframe)
    meta_map = _fetch_ticker_metadata(conn, symbols)

    results: list[dict] = []

    for sym, name in ticker_map.items():
        if sym not in data_map:
            continue

        df = data_map[sym]
        close = df["adj_close"]
        volume = df["volume"]

        sma_len = params["sma_len"]
        rank_lookback = params["rank_lookback"]
        roc_len = params["roc_len"]

        obv = _compute_obv(close, volume)
        spread, _ = _compute_spread(obv, sma_len)

        spread_pctl = _pct_rank_last(spread, rank_lookback)
        roc = spread.diff(roc_len)
        spread_vol = spread.rolling(rank_lookback).std()

        z_momo: float = np.nan
        last_vol = spread_vol.iloc[-1]
        if len(spread) > roc_len and last_vol != 0 and not pd.isna(last_vol):
            z_momo = float(np.tanh(roc.iloc[-1] / (last_vol + 1e-9)))

        mean_val = np.nanmean([spread_pctl, z_momo])
        score: float | None = float(np.clip(mean_val, -1, 1)) if not np.isnan(mean_val) else None

        spread_series = [
            {"date": idx.strftime("%Y-%m-%d %H:%M") if timeframe == "4h" else idx.strftime("%Y-%m-%d"), "value": round(float(v), 2)}
            for idx, v in spread.dropna().tail(params["spread_bars"]).items()
        ]

        meta = meta_map.get(sym, {})
        results.append({
            "asset": name,
            "symbol": sym,
            "obv_regime": _regime(float(spread.iloc[-1])),
            "spread_last": round(float(spread.iloc[-1]), 4),
            "rotation_score": round(score, 4) if score is not None else None,
            "spread_percentile": round(float(spread_pctl), 4) if not np.isnan(spread_pctl) else None,
            "spread_momentum_z": round(float(z_momo), 4) if not np.isnan(z_momo) else None,
            "return_1m": _trailing_return(close, params["ret_1m"]),
            "return_3m": _trailing_return(close, params["ret_3m"]),
            "return_6m": _trailing_return(close, params["ret_6m"]),
            "return_ytd": _trailing_return(close, "YTD"),
            "market_cap": meta.get("market_cap"),
            "style_bucket": meta.get("style_bucket"),
            "spread_series": spread_series,
        })

    results.sort(
        key=lambda x: x["rotation_score"] if x["rotation_score"] is not None else -999,
        reverse=True,
    )
    return results


# ── Public API: structure (current snapshot) ──────────────────────────

def get_obv_structure(
    conn,
    ticker_map: dict[str, str] | None = None,
    timeframe: str = "daily",
) -> list[dict]:
    """
    Return the full OBV structure ranking.
    Computes from raw prices, persists today's scalar metrics to DB (daily only), caches result.
    """
    if timeframe not in VALID_TIMEFRAMES:
        timeframe = "daily"

    if ticker_map is None:
        ticker_map = {**CROSS_ASSET_ETFS, **SECTOR_ETFS}

    cache_key = f"obv_structure_{timeframe}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        result = _compute_all(conn, ticker_map, timeframe=timeframe)

        # Only persist daily metrics to DB
        if timeframe == "daily":
            today_str = date.today().isoformat()
            try:
                if not _today_already_written(conn, today_str):
                    _write_daily_metrics(conn, today_str, result)
                    invalidate_cache()
                    logger.info("OBV daily metrics written for %s", today_str)
            except Exception as exc:
                logger.warning("Failed to persist OBV metrics: %s", exc)

        _cache_set(cache_key, result)
        return result
    except Exception:
        logger.exception("Failed to build OBV structure timeframe=%s", timeframe)
        return []


# ── Public API: score history ─────────────────────────────────────────

def get_obv_score_history(
    conn,
    symbols: list[str] | None = None,
    lookback_days: int = 252,
) -> list[dict]:
    """
    Return rotation_score time-series for requested symbols from DB.
    Returns: [{symbol, asset, data: [{date, rotation_score, obv_regime}]}]
    Note: only daily scores are persisted, so this always returns daily history.
    """
    ticker_map = {**CROSS_ASSET_ETFS, **SECTOR_ETFS}
    if symbols:
        ticker_map = {s: ticker_map[s] for s in symbols if s in ticker_map}

    if not ticker_map:
        return []

    syms = list(ticker_map.keys())
    cache_key = f"obv_history_{'_'.join(sorted(syms))}_{lookback_days}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        placeholders = ",".join(["%s"] * len(syms))
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT symbol, date, rotation_score, obv_regime
                FROM obv_daily_metrics
                WHERE symbol IN ({placeholders})
                  AND date >= CURRENT_DATE - INTERVAL '{int(lookback_days)} days'
                ORDER BY symbol, date
                """,
                syms,
            )
            rows = cur.fetchall()

        grouped: dict[str, list[dict]] = {s: [] for s in syms}
        for sym, dt, score, regime in rows:
            grouped[sym].append({
                "date": dt.isoformat() if hasattr(dt, "isoformat") else str(dt),
                "rotation_score": score,
                "obv_regime": regime,
            })

        result = [
            {"symbol": sym, "asset": ticker_map[sym], "data": grouped[sym]}
            for sym in syms
            if grouped[sym]
        ]

        _cache_set(cache_key, result)
        return result
    except Exception:
        logger.exception("Failed to build OBV score history symbols=%s lookback=%d", syms, lookback_days)
        return []


# ── Public API: single-asset detail ──────────────────────────────────

def get_obv_detail(
    conn,
    symbol: str,
    lookback_bars: int = SPREAD_SERIES_BARS,
    timeframe: str = "daily",
) -> dict | None:
    """
    Return detailed OBV data for a single symbol:
      obv_series, spread_series  — computed on-the-fly from raw prices
      score_history              — read from DB (daily only)
      current metrics            — computed on-the-fly
    """
    if timeframe not in VALID_TIMEFRAMES:
        timeframe = "daily"

    ticker_map = {**CROSS_ASSET_ETFS, **SECTOR_ETFS}
    if symbol not in ticker_map:
        return None

    cache_key = f"obv_detail_{symbol}_{lookback_bars}_{timeframe}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    try:
        data_map = _fetch_for_timeframe(conn, [symbol], timeframe)
        if symbol not in data_map:
            return None

        df = data_map[symbol]
        close = df["adj_close"]
        volume = df["volume"]

        params = TIMEFRAME_PARAMS[timeframe]
        sma_len = params["sma_len"]
        rank_lookback = params["rank_lookback"]
        roc_len = params["roc_len"]

        obv = _compute_obv(close, volume)
        spread, _ = _compute_spread(obv, sma_len)

        tail_obv = obv.dropna().tail(lookback_bars)
        tail_spread = spread.dropna().tail(lookback_bars)

        fmt = "%Y-%m-%d %H:%M" if timeframe == "4h" else "%Y-%m-%d"

        obv_series = [
            {"date": idx.strftime(fmt), "value": round(float(v), 0)}
            for idx, v in tail_obv.items()
        ]
        spread_series_out = [
            {"date": idx.strftime(fmt), "value": round(float(v), 2)}
            for idx, v in tail_spread.items()
        ]

        # Score history (computed on-the-fly for all timeframes)
        score_history = _compute_rolling_scores(
            spread, rank_lookback, roc_len, lookback_bars, fmt
        )

        # Current metrics
        spread_pctl = _pct_rank_last(spread, rank_lookback)
        roc = spread.diff(roc_len)
        spread_vol = spread.rolling(rank_lookback).std()
        z_momo: float = np.nan
        last_vol = spread_vol.iloc[-1]
        if len(spread) > roc_len and last_vol != 0 and not pd.isna(last_vol):
            z_momo = float(np.tanh(roc.iloc[-1] / (last_vol + 1e-9)))
        mean_val = np.nanmean([spread_pctl, z_momo])
        score: float | None = float(np.clip(mean_val, -1, 1)) if not np.isnan(mean_val) else None

        last_price = round(float(close.iloc[-1]), 2) if len(close) > 0 else None

        result = {
            "symbol": symbol,
            "asset": ticker_map[symbol],
            "obv_regime": _regime(float(spread.iloc[-1])),
            "last_price": last_price,
            "rotation_score": round(score, 4) if score is not None else None,
            "spread_percentile": round(float(spread_pctl), 4) if not np.isnan(spread_pctl) else None,
            "spread_momentum_z": round(float(z_momo), 4) if not np.isnan(z_momo) else None,
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
        logger.exception("Failed to build OBV detail symbol=%s timeframe=%s", symbol, timeframe)
        return None

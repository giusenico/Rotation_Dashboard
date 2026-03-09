"""
Market Regime indicator engine.

Three components per ticker, translated from Pine Script:
  1. Regime      — price vs SMA with neutral band → +1 / 0 / -1
  2. Overextension — distance from SMA normalised (Z-score, %, or ATR)
  3. Capital Flows — OBV spread z-score

All computed on-the-fly from existing OHLCV data.  No new DB tables.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from backend.config import ALL_TICKERS, CACHE_TTL, TICKER_CATEGORY_MAP

logger = logging.getLogger(__name__)

# ── Valid options ────────────────────────────────────────────────────

VALID_TIMEFRAMES = ("daily", "4h", "weekly")
VALID_OVEREXT_MODES = ("Z", "pct", "ATR")

TIMEFRAME_PARAMS = {
    "daily": {
        "sma_len": 20,
        "neutral_bw": 0.02,
        "stdev_len": 50,
        "atr_len": 14,
        "flow_sma": 20,
        "flow_z_len": 100,
        "lookback_default": 252,
    },
    "4h": {
        "sma_len": 40,
        "neutral_bw": 0.02,
        "stdev_len": 100,
        "atr_len": 28,
        "flow_sma": 40,
        "flow_z_len": 200,
        "lookback_default": 504,
    },
    "weekly": {
        "sma_len": 4,
        "neutral_bw": 0.02,
        "stdev_len": 10,
        "atr_len": 3,
        "flow_sma": 4,
        "flow_z_len": 20,
        "lookback_default": 104,
    },
}

OVEREXT_THRESHOLDS = {"Z": 2.0, "pct": 2.0, "ATR": 2.0}
FLOW_THRESHOLD = 1.5


# ── In-memory cache ─────────────────────────────────────────────────

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
    if len(_cache) >= MAX_CACHE_ENTRIES:
        oldest_key = min(_cache, key=lambda k: _cache[k].ts)
        del _cache[oldest_key]
    _cache[key] = _CacheEntry(data=data)


# ── Data fetching ────────────────────────────────────────────────────

def _fetch_ohlcv(conn, symbols: list[str]) -> dict[str, pd.DataFrame]:
    """Fetch daily OHLCV from daily_prices."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT symbol, date, high, low, close, adj_close, volume
        FROM daily_prices
        WHERE symbol IN ({placeholders})
        ORDER BY date
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    if not rows:
        return {}

    df = pd.DataFrame(rows, columns=["symbol", "date", "high", "low", "close", "adj_close", "volume"])
    df["date"] = pd.to_datetime(df["date"])

    result: dict[str, pd.DataFrame] = {}
    for sym, grp in df.groupby("symbol"):
        grp = grp.set_index("date").sort_index()
        grp = grp[["high", "low", "close", "adj_close", "volume"]].dropna(subset=["adj_close"])
        if not grp.empty:
            result[sym] = grp
    return result


def _fetch_ohlcv_4h(conn, symbols: list[str]) -> dict[str, pd.DataFrame]:
    """Fetch 4h OHLCV from intraday_prices_4h."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT symbol, datetime, high, low, close, volume
        FROM intraday_prices_4h
        WHERE symbol IN ({placeholders})
        ORDER BY datetime
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    if not rows:
        return {}

    df = pd.DataFrame(rows, columns=["symbol", "datetime", "high", "low", "close", "volume"])
    df["datetime"] = pd.to_datetime(df["datetime"])

    result: dict[str, pd.DataFrame] = {}
    for sym, grp in df.groupby("symbol"):
        grp = grp.set_index("datetime").sort_index()
        grp = grp[["high", "low", "close", "volume"]].dropna(subset=["close"])
        # Alias close → adj_close for uniform downstream access
        grp["adj_close"] = grp["close"]
        if not grp.empty:
            result[sym] = grp
    return result


def _resample_weekly_ohlcv(data_map: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    """Resample daily OHLCV to weekly bars (Friday close)."""
    result: dict[str, pd.DataFrame] = {}
    for sym, df in data_map.items():
        weekly = df.resample("W-FRI").agg({
            "high": "max",
            "low": "min",
            "close": "last",
            "adj_close": "last",
            "volume": "sum",
        }).dropna(subset=["adj_close"])
        if not weekly.empty:
            result[sym] = weekly
    return result


def _fetch_for_timeframe(conn, symbols: list[str], timeframe: str) -> dict[str, pd.DataFrame]:
    if timeframe == "4h":
        return _fetch_ohlcv_4h(conn, symbols)
    data_map = _fetch_ohlcv(conn, symbols)
    if timeframe == "weekly":
        return _resample_weekly_ohlcv(data_map)
    return data_map


# ── Core computation (Pine Script translations) ─────────────────────

def _compute_regime(close: pd.Series, sma_len: int, neutral_bw: float) -> pd.Series:
    """
    Pine: basis = SMA(close, coreLen)
          tol   = basis * (neutralBw / 100)
          regime = close > basis+tol ? 1 : close < basis-tol ? -1 : 0
    """
    basis = close.rolling(sma_len, min_periods=sma_len).mean()
    tol = basis * (neutral_bw / 100.0)
    regime = pd.Series(0, index=close.index, dtype=int)
    regime[close > basis + tol] = 1
    regime[close < basis - tol] = -1
    return regime


def _compute_overextension(
    close: pd.Series,
    high: pd.Series,
    low: pd.Series,
    sma_len: int,
    mode: str,
    stdev_len: int,
    atr_len: int,
) -> tuple[pd.Series, float]:
    """
    Pine: dist = close - SMA(close, coreLen)
          Z:   dist / stdev(dist, extLook)
          %:   (dist / basis) * 100
          ATR: dist / ATR(atrLen)

    Returns (overext_series, threshold).
    """
    basis = close.rolling(sma_len, min_periods=sma_len).mean()
    dist = close - basis

    if mode == "Z":
        stdev = dist.rolling(stdev_len, min_periods=stdev_len).std(ddof=0)
        overext = dist / stdev.replace(0, np.nan)
        threshold = OVEREXT_THRESHOLDS["Z"]
    elif mode == "pct":
        overext = (dist / basis.replace(0, np.nan)) * 100.0
        threshold = OVEREXT_THRESHOLDS["pct"]
    else:  # ATR
        prev_close = close.shift(1)
        tr = pd.concat([
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ], axis=1).max(axis=1)
        atr = tr.rolling(atr_len, min_periods=atr_len).mean()
        overext = dist / atr.replace(0, np.nan)
        threshold = OVEREXT_THRESHOLDS["ATR"]

    return overext, threshold


def _compute_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    """OBV = cumulative signed volume (identical to Pine Script capFlows)."""
    sign = np.sign(close.diff()).fillna(0.0)
    return (sign * volume.fillna(0.0)).cumsum()


def _compute_capital_flows(
    close: pd.Series,
    volume: pd.Series,
    sma_len: int,
    z_len: int,
) -> pd.Series:
    """
    Pine: capFlows  = cum(sign(Δclose) * volume)       -- OBV
          spread    = capFlows - SMA(capFlows, flowLen)
          flowZ     = (spread - SMA(spread, flowNorm)) / stdev(spread, flowNorm)
    """
    obv = _compute_obv(close, volume)
    spread = obv - obv.rolling(sma_len, min_periods=sma_len).mean()
    flow_mu = spread.rolling(z_len, min_periods=z_len).mean()
    flow_sd = spread.rolling(z_len, min_periods=z_len).std(ddof=0)
    flow_z = (spread - flow_mu) / flow_sd.replace(0, np.nan)
    return flow_z


# ── Label helpers ────────────────────────────────────────────────────

def _regime_label(val: int) -> str:
    if val == 1:
        return "bullish"
    if val == -1:
        return "bearish"
    return "neutral"


def _overext_label(val: float | None, threshold: float) -> str:
    if val is None or np.isnan(val):
        return "neutral"
    if val >= threshold:
        return "overbought"
    if val <= -threshold:
        return "oversold"
    return "neutral"


def _flow_label(val: float | None) -> str:
    if val is None or np.isnan(val):
        return "neutral"
    if val >= FLOW_THRESHOLD:
        return "strong_inflow"
    if val <= -FLOW_THRESHOLD:
        return "strong_outflow"
    return "neutral"


def _safe_float(v, decimals: int = 4) -> float | None:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return round(float(v), decimals)


# ── Public API: summary ──────────────────────────────────────────────

def get_regime_summary(
    conn,
    timeframe: str = "daily",
    overext_mode: str = "Z",
) -> list[dict]:
    """Compute regime/overextension/flows for all tickers (latest values)."""
    if timeframe not in VALID_TIMEFRAMES:
        timeframe = "daily"
    if overext_mode not in VALID_OVEREXT_MODES:
        overext_mode = "Z"

    cache_key = f"regime_summary_{timeframe}_{overext_mode}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    params = TIMEFRAME_PARAMS[timeframe]
    ticker_map = ALL_TICKERS
    symbols = list(ticker_map.keys())
    data_map = _fetch_for_timeframe(conn, symbols, timeframe)

    results: list[dict] = []
    for sym, name in ticker_map.items():
        if sym not in data_map:
            continue

        df = data_map[sym]
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

        # Capital flows: skip if volume is all zeros (e.g. ^GSPC)
        has_volume = volume.sum() > 0
        if has_volume:
            flow_z = _compute_capital_flows(
                close, volume, params["flow_sma"], params["flow_z_len"],
            )
            flow_val = _safe_float(flow_z.iloc[-1])
        else:
            flow_val = None

        regime_val = int(regime.iloc[-1])
        overext_val = _safe_float(overext.iloc[-1])
        basis = close.rolling(params["sma_len"], min_periods=1).mean()

        results.append({
            "symbol": sym,
            "asset": name,
            "category": TICKER_CATEGORY_MAP.get(sym, ""),
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


# ── Public API: detail ───────────────────────────────────────────────

def get_regime_detail(
    conn,
    symbol: str,
    lookback_bars: int = 252,
    timeframe: str = "daily",
    overext_mode: str = "Z",
) -> dict | None:
    """Compute full time-series for a single ticker."""
    if timeframe not in VALID_TIMEFRAMES:
        timeframe = "daily"
    if overext_mode not in VALID_OVEREXT_MODES:
        overext_mode = "Z"

    ticker_map = ALL_TICKERS
    if symbol not in ticker_map:
        return None

    cache_key = f"regime_detail_{symbol}_{lookback_bars}_{timeframe}_{overext_mode}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    params = TIMEFRAME_PARAMS[timeframe]
    data_map = _fetch_for_timeframe(conn, [symbol], timeframe)
    if symbol not in data_map:
        return None

    df = data_map[symbol]
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
    else:
        flow_z = pd.Series(np.nan, index=close.index)

    basis = close.rolling(params["sma_len"], min_periods=1).mean()

    fmt = "%Y-%m-%d %H:%M" if timeframe == "4h" else "%Y-%m-%d"

    # Build tail series
    tail_idx = close.tail(lookback_bars).index

    price_series = [
        {"date": idx.strftime(fmt), "close": _safe_float(close.at[idx], 2), "sma": _safe_float(basis.at[idx], 2)}
        for idx in tail_idx
        if pd.notna(close.at[idx])
    ]
    regime_series = [
        {"date": idx.strftime(fmt), "value": int(regime.at[idx])}
        for idx in tail_idx
        if pd.notna(regime.at[idx])
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
        "symbol": symbol,
        "asset": ticker_map[symbol],
        "last_price": _safe_float(close.iloc[-1], 2),
        "regime_current": int(regime.iloc[-1]),
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

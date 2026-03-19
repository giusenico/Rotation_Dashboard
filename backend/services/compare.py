"""
Asset Comparison engine.

Computes head-to-head comparison metrics for 2–5 assets:
  - Normalised price overlay (cumulative % return)
  - Rolling correlation between pairs
  - RSI (14) per asset
  - Volume comparison
  - OBV regime & score (from obv_daily_metrics)
  - Market regime (from regime engine)
  - Relative strength ratio (first asset / second asset)

All computed on-the-fly from daily_prices + obv_daily_metrics.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from backend.config import CACHE_TTL, ALL_TICKERS

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────

RSI_PERIOD = 14
CORR_WINDOWS = [21, 63, 126]
DEFAULT_LOOKBACK = 252

# ── In-memory cache ──────────────────────────────────────────────────

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


# ── Data fetching ────────────────────────────────────────────────────

def _fetch_ohlcv(conn, symbols: list[str], lookback: int) -> pd.DataFrame:
    """Fetch daily OHLCV for given symbols, last `lookback` trading days."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT symbol, date, open, high, low, close, adj_close, volume
        FROM daily_prices
        WHERE symbol IN ({placeholders})
        ORDER BY date
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=["symbol", "date", "open", "high", "low", "close", "adj_close", "volume"])
    df["date"] = pd.to_datetime(df["date"])

    # Keep only last N trading days (based on union of all dates)
    all_dates = sorted(df["date"].unique())
    if len(all_dates) > lookback:
        cutoff = all_dates[-lookback]
        df = df[df["date"] >= cutoff]

    return df


def _fetch_obv_latest(conn, symbols: list[str]) -> dict:
    """Fetch latest OBV metrics for given symbols."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT DISTINCT ON (symbol) symbol, date, obv_regime, rotation_score
        FROM obv_daily_metrics
        WHERE symbol IN ({placeholders})
        ORDER BY symbol, date DESC
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    result = {}
    for row in rows:
        result[row[0]] = {
            "obv_regime": row[2],
            "rotation_score": row[3],
        }
    return result


# ── Computations ─────────────────────────────────────────────────────

def _compute_normalised_prices(df: pd.DataFrame) -> dict:
    """Compute cumulative % return from first available date per symbol."""
    result = {}
    for symbol, grp in df.groupby("symbol"):
        grp = grp.sort_values("date")
        price = grp["adj_close"].fillna(grp["close"])
        first_price = price.iloc[0]
        if first_price == 0 or pd.isna(first_price):
            continue
        pct = ((price / first_price) - 1) * 100
        dates = grp["date"].dt.strftime("%Y-%m-%d").tolist()
        result[symbol] = {"dates": dates, "values": pct.round(2).tolist()}
    return result


def _compute_rsi(series: pd.Series, period: int = RSI_PERIOD) -> pd.Series:
    """Compute RSI for a price series."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def _compute_rsi_per_asset(df: pd.DataFrame) -> dict:
    """Compute latest RSI and recent RSI series per symbol."""
    result = {}
    for symbol, grp in df.groupby("symbol"):
        grp = grp.sort_values("date")
        price = grp["adj_close"].fillna(grp["close"])
        rsi = _compute_rsi(price)
        last_val = rsi.iloc[-1] if len(rsi) > 0 and not pd.isna(rsi.iloc[-1]) else None
        # Last 60 days of RSI for sparkline
        tail = rsi.tail(60)
        dates = grp["date"].tail(60).dt.strftime("%Y-%m-%d").tolist()
        vals = [round(v, 1) if not pd.isna(v) else None for v in tail.tolist()]
        result[symbol] = {"current": round(last_val, 1) if last_val is not None else None,
                          "dates": dates, "values": vals}
    return result


def _compute_correlation_matrix(df: pd.DataFrame, symbols: list[str]) -> dict:
    """Compute pairwise correlation matrix from returns."""
    pivot = df.pivot_table(index="date", columns="symbol", values="adj_close")
    # Fill adj_close NaN with close
    if pivot.isna().any().any():
        close_pivot = df.pivot_table(index="date", columns="symbol", values="close")
        pivot = pivot.fillna(close_pivot)

    returns = pivot.pct_change().dropna()
    # Ensure column order matches symbols
    cols = [s for s in symbols if s in returns.columns]
    if len(cols) < 2:
        return {"symbols": cols, "matrix": []}
    corr = returns[cols].corr()
    return {
        "symbols": cols,
        "matrix": corr.values.round(3).tolist(),
    }


def _compute_rolling_correlation(df: pd.DataFrame, sym_a: str, sym_b: str, window: int = 63) -> dict:
    """Compute rolling correlation between two assets."""
    pivot = df.pivot_table(index="date", columns="symbol", values="adj_close")
    if pivot.isna().any().any():
        close_pivot = df.pivot_table(index="date", columns="symbol", values="close")
        pivot = pivot.fillna(close_pivot)

    if sym_a not in pivot.columns or sym_b not in pivot.columns:
        return {"dates": [], "values": []}

    returns = pivot[[sym_a, sym_b]].pct_change().dropna()
    rolling_corr = returns[sym_a].rolling(window).corr(returns[sym_b])
    valid = rolling_corr.dropna()
    dates = valid.index.strftime("%Y-%m-%d").tolist()
    vals = valid.round(3).tolist()
    return {"dates": dates, "values": vals}


def _compute_volume_comparison(df: pd.DataFrame) -> dict:
    """Compute volume data for comparison (last 60 bars)."""
    result = {}
    for symbol, grp in df.groupby("symbol"):
        grp = grp.sort_values("date")
        tail = grp.tail(60)
        dates = tail["date"].dt.strftime("%Y-%m-%d").tolist()
        volumes = tail["volume"].fillna(0).astype(int).tolist()
        result[symbol] = {"dates": dates, "values": volumes}
    return result


def _compute_relative_strength(df: pd.DataFrame, sym_a: str, sym_b: str) -> dict:
    """Compute ratio of adj_close A / adj_close B over time."""
    pivot = df.pivot_table(index="date", columns="symbol", values="adj_close")
    if pivot.isna().any().any():
        close_pivot = df.pivot_table(index="date", columns="symbol", values="close")
        pivot = pivot.fillna(close_pivot)

    if sym_a not in pivot.columns or sym_b not in pivot.columns:
        return {"dates": [], "values": []}

    ratio = pivot[sym_a] / pivot[sym_b].replace(0, np.nan)
    valid = ratio.dropna()
    dates = valid.index.strftime("%Y-%m-%d").tolist()
    vals = valid.round(4).tolist()
    return {"dates": dates, "values": vals}


def _compute_performance(df: pd.DataFrame) -> dict:
    """Compute multi-period returns per symbol."""
    result = {}
    for symbol, grp in df.groupby("symbol"):
        grp = grp.sort_values("date")
        price = grp["adj_close"].fillna(grp["close"])
        last = price.iloc[-1] if len(price) > 0 else None
        if last is None or last == 0:
            continue

        def _ret(n):
            if len(price) < n + 1:
                return None
            prev = price.iloc[-(n + 1)]
            if prev == 0 or pd.isna(prev):
                return None
            return round((last / prev - 1) * 100, 2)

        # YTD
        year_start = grp[grp["date"].dt.month == 1].head(1)
        ytd = None
        if len(year_start) > 0:
            p0 = (year_start["adj_close"].fillna(year_start["close"])).iloc[0]
            if p0 and p0 != 0:
                ytd = round((last / p0 - 1) * 100, 2)

        result[symbol] = {
            "last_price": round(float(last), 2),
            "return_1w": _ret(5),
            "return_1m": _ret(21),
            "return_3m": _ret(63),
            "return_6m": _ret(126),
            "return_1y": _ret(252),
            "return_ytd": ytd,
        }
    return result


def _compute_regime_simple(df: pd.DataFrame, sma_len: int = 50) -> dict:
    """Compute simple regime (price vs SMA) per symbol."""
    result = {}
    for symbol, grp in df.groupby("symbol"):
        grp = grp.sort_values("date")
        price = grp["adj_close"].fillna(grp["close"])
        sma = price.rolling(sma_len).mean()
        last_price = price.iloc[-1] if len(price) > 0 else None
        last_sma = sma.iloc[-1] if len(sma) > 0 else None
        if last_price is not None and last_sma is not None and not pd.isna(last_sma):
            regime = "bullish" if last_price > last_sma else "bearish"
            distance_pct = round(((last_price / last_sma) - 1) * 100, 2)
        else:
            regime = "unknown"
            distance_pct = None
        result[symbol] = {
            "regime": regime,
            "sma_distance_pct": distance_pct,
        }
    return result


# ── Main entry point ─────────────────────────────────────────────────

def get_comparison(conn, symbols: list[str], lookback: int = DEFAULT_LOOKBACK) -> dict:
    """Build full comparison payload for the given symbols."""
    cache_key = f"compare:{'|'.join(sorted(symbols))}:{lookback}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    logger.info("Computing comparison for %s (lookback=%d)", symbols, lookback)

    df = _fetch_ohlcv(conn, symbols, lookback)
    if df.empty:
        return {"symbols": symbols, "error": "No data found"}

    obv_data = _fetch_obv_latest(conn, symbols)

    # Build asset info
    assets = []
    performance = _compute_performance(df)
    regime = _compute_regime_simple(df)
    for sym in symbols:
        name = ALL_TICKERS.get(sym, sym)
        perf = performance.get(sym, {})
        reg = regime.get(sym, {})
        obv = obv_data.get(sym, {})
        assets.append({
            "symbol": sym,
            "name": name,
            "last_price": perf.get("last_price"),
            "return_1w": perf.get("return_1w"),
            "return_1m": perf.get("return_1m"),
            "return_3m": perf.get("return_3m"),
            "return_6m": perf.get("return_6m"),
            "return_1y": perf.get("return_1y"),
            "return_ytd": perf.get("return_ytd"),
            "regime": reg.get("regime", "unknown"),
            "sma_distance_pct": reg.get("sma_distance_pct"),
            "obv_regime": obv.get("obv_regime"),
            "rotation_score": obv.get("rotation_score"),
        })

    # Normalised prices
    norm_prices = _compute_normalised_prices(df)

    # Correlation matrix
    corr_matrix = _compute_correlation_matrix(df, symbols)

    # Rolling correlation (only for first pair)
    rolling_corr = _compute_rolling_correlation(df, symbols[0], symbols[1], window=63) if len(symbols) >= 2 else {}

    # RSI per asset
    rsi = _compute_rsi_per_asset(df)

    # Volume
    volume = _compute_volume_comparison(df)

    # Relative strength (A/B ratio) for first pair
    rel_strength = _compute_relative_strength(df, symbols[0], symbols[1]) if len(symbols) >= 2 else {}

    # As-of date
    as_of = df["date"].max().strftime("%Y-%m-%d") if len(df) > 0 else None

    result = {
        "symbols": symbols,
        "lookback": lookback,
        "as_of_date": as_of,
        "assets": assets,
        "normalised_prices": norm_prices,
        "correlation": corr_matrix,
        "rolling_correlation": rolling_corr,
        "rsi": rsi,
        "volume": volume,
        "relative_strength": rel_strength,
    }

    _cache_set(cache_key, result)
    return result

"""
Volatility Oscillator engine.

Computes VIX term-structure oscillators from daily_prices:
  - VIX Oscillator: VIX normalised 0-1 over rolling window
  - VIX Ratio Oscillator: (VIX / VIX3M) normalised 0-1
  - Backtest: buy S&P 500 when VIX Oscillator < threshold

All computed on-the-fly from daily_prices.  No new DB tables.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from backend.config import CACHE_TTL

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────

VIX_SYMBOLS = ["^VIX", "^VIX3M", "^GSPC"]
RATIO_MA_LEN = 50
BUY_THRESHOLD = 0.3
TRADING_FEE = 0.001

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


# ── Data fetching ────────────────────────────────────────────────────

def _fetch_close_daily(conn, symbols: list[str]) -> dict[str, pd.Series]:
    """Fetch daily close prices."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT symbol, date, close
        FROM daily_prices
        WHERE symbol IN ({placeholders})
        ORDER BY date
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    if not rows:
        return {}

    df = pd.DataFrame(rows, columns=["symbol", "date", "close"])
    df["date"] = pd.to_datetime(df["date"])

    result: dict[str, pd.Series] = {}
    for sym, grp in df.groupby("symbol"):
        s = grp.set_index("date")["close"].sort_index().dropna()
        if not s.empty:
            result[sym] = s
    return result


# ── Core computation ─────────────────────────────────────────────────

def _normalise_oscillator(series: pd.Series, window: int) -> pd.Series:
    """Normalise a series to 0-1 using rolling min/max."""
    roll_min = series.rolling(window=window, min_periods=window).min()
    roll_max = series.rolling(window=window, min_periods=window).max()
    return (series - roll_min) / (roll_max - roll_min)


# ── VIX term-structure helpers ───────────────────────────────────────

def _compute_vix_all(
    close_map: dict[str, pd.Series],
    window: int,
) -> pd.DataFrame | None:
    """Build aligned DataFrame with VIX-specific derived columns."""
    vix = close_map.get("^VIX")
    vix3m = close_map.get("^VIX3M")
    gspc = close_map.get("^GSPC")

    if vix is None or vix3m is None or gspc is None:
        return None

    combined = pd.DataFrame({
        "vix": vix, "vix3m": vix3m, "sp500": gspc,
    }).dropna()

    if combined.empty:
        return None

    combined["vix_ratio"] = combined["vix"] / combined["vix3m"]
    combined["vix_oscillator"] = _normalise_oscillator(combined["vix"], window)
    combined["ratio_oscillator"] = _normalise_oscillator(combined["vix_ratio"], window)
    combined["ratio_ma50"] = combined["vix_ratio"].rolling(RATIO_MA_LEN).mean()
    return combined


def _compute_backtest(df: pd.DataFrame) -> pd.DataFrame:
    """Run the VIX oscillator strategy backtest."""
    bt = df[["sp500", "vix_oscillator"]].dropna().copy()
    if bt.empty:
        return pd.DataFrame()

    signal = bt["vix_oscillator"].shift(1) < BUY_THRESHOLD
    bt["position"] = np.where(signal, 1, 0)
    bt["sp500_return"] = bt["sp500"].pct_change()
    trades = bt["position"].diff().abs()
    bt["strategy_return"] = bt["position"].shift(1) * bt["sp500_return"] - trades * TRADING_FEE
    bt["strategy_cum"] = (1 + bt["strategy_return"]).cumprod()
    bt["sp500_cum"] = (1 + bt["sp500_return"]).cumprod()
    return bt


def _signal_label(vix_osc: float | None, ratio_osc: float | None) -> str:
    if vix_osc is None:
        return "neutral"
    if vix_osc < 0.3:
        return "buy"
    if vix_osc > 0.7:
        return "sell"
    if ratio_osc is not None and ratio_osc > 0.7:
        return "caution"
    return "neutral"


# ── Helpers ──────────────────────────────────────────────────────────

def _safe_float(v, decimals: int = 4) -> float | None:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    try:
        return round(float(v), decimals)
    except (TypeError, ValueError):
        return None


# ── Public API: VIX summary (market context) ────────────────────────

def get_volatility_summary(conn, window: int = 252) -> dict:
    """Latest scalar values for the VIX dashboard cards."""
    cache_key = f"vol_summary_{window}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    close_map = _fetch_close_daily(conn, VIX_SYMBOLS)
    combined = _compute_vix_all(close_map, window)

    if combined is None or combined.empty:
        return {
            "vix_last": None, "vix3m_last": None, "sp500_last": None,
            "vix_ratio": None, "ratio_ma50": None,
            "vix_oscillator": None, "ratio_oscillator": None,
            "signal": "neutral", "position": "cash",
            "as_of_date": "",
        }

    last = combined.iloc[-1]
    vix_osc = _safe_float(last.get("vix_oscillator"))
    ratio_osc = _safe_float(last.get("ratio_oscillator"))

    # Determine current strategy position (invested if previous day osc < 0.3)
    if len(combined) >= 2:
        prev_osc = _safe_float(combined["vix_oscillator"].iloc[-2])
        position = "invested" if (prev_osc is not None and prev_osc < BUY_THRESHOLD) else "cash"
    else:
        position = "cash"

    result = {
        "vix_last": _safe_float(last["vix"], 2),
        "vix3m_last": _safe_float(last["vix3m"], 2),
        "sp500_last": _safe_float(last["sp500"], 2),
        "vix_ratio": _safe_float(last["vix_ratio"], 4),
        "ratio_ma50": _safe_float(last["ratio_ma50"], 4),
        "vix_oscillator": vix_osc,
        "ratio_oscillator": ratio_osc,
        "signal": _signal_label(vix_osc, ratio_osc),
        "position": position,
        "as_of_date": combined.index[-1].strftime("%Y-%m-%d"),
    }

    _cache_set(cache_key, result)
    return result


# ── Public API: VIX detail (charts) ─────────────────────────────────

def get_volatility_detail(
    conn,
    lookback_bars: int = 500,
    window: int = 252,
) -> dict:
    """Time-series data for the VIX context charts."""
    cache_key = f"vol_detail_{lookback_bars}_{window}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    close_map = _fetch_close_daily(conn, VIX_SYMBOLS)
    combined = _compute_vix_all(close_map, window)

    empty_result = {
        "summary": get_volatility_summary(conn, window),
        "vix_series": [],
        "oscillator_series": [],
        "ratio_series": [],
        "backtest_series": [],
    }

    if combined is None or combined.empty:
        return empty_result

    bt = _compute_backtest(combined)
    tail = combined.tail(lookback_bars)
    fmt = "%Y-%m-%d"

    vix_series = [
        {"date": idx.strftime(fmt),
         "vix": _safe_float(row["vix"], 2),
         "vix3m": _safe_float(row["vix3m"], 2)}
        for idx, row in tail.iterrows()
    ]

    oscillator_series = [
        {"date": idx.strftime(fmt),
         "vix_osc": _safe_float(row["vix_oscillator"]),
         "ratio_osc": _safe_float(row["ratio_oscillator"])}
        for idx, row in tail.iterrows()
        if pd.notna(row.get("vix_oscillator"))
    ]

    ratio_series = [
        {"date": idx.strftime(fmt),
         "ratio": _safe_float(row["vix_ratio"], 4),
         "ratio_ma50": _safe_float(row["ratio_ma50"], 4)}
        for idx, row in tail.iterrows()
        if pd.notna(row.get("vix_ratio"))
    ]

    backtest_series = []
    if not bt.empty:
        bt_tail = bt.tail(lookback_bars)
        backtest_series = [
            {"date": idx.strftime(fmt),
             "strategy": _safe_float(row["strategy_cum"], 4),
             "benchmark": _safe_float(row["sp500_cum"], 4),
             "position": int(row["position"])}
            for idx, row in bt_tail.iterrows()
            if pd.notna(row.get("strategy_cum"))
        ]

    summary = get_volatility_summary(conn, window)

    result = {
        "summary": summary,
        "vix_series": vix_series,
        "oscillator_series": oscillator_series,
        "ratio_series": ratio_series,
        "backtest_series": backtest_series,
    }

    _cache_set(cache_key, result)
    return result

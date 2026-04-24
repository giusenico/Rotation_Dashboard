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

from backend.config import CACHE_TTL, ALL_TICKERS, SECTOR_ETFS, CROSS_ASSET_ETFS

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

def _classify_symbols(conn, symbols: list[str]) -> tuple[dict[str, str], dict[str, dict]]:
    """
    Classify each symbol as "ticker" or "crypto" by presence in crypto_assets.
    Returns (classification, crypto_meta).

      classification[sym] -> "crypto" if sym is a CoinGecko asset_id, else "ticker"
      crypto_meta[asset_id] -> {display_symbol, name, logo_url}
    """
    if not symbols:
        return {}, {}
    placeholders = ",".join(["%s"] * len(symbols))
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT id, symbol, name, logo_url FROM crypto_assets WHERE id IN ({placeholders})",
                symbols,
            )
            rows = cur.fetchall()
    except Exception:
        logger.exception("Failed to classify symbols %s", symbols)
        rows = []
    crypto_meta = {
        aid: {"display_symbol": sym, "name": name, "logo_url": logo}
        for aid, sym, name, logo in rows
    }
    classification = {s: "crypto" if s in crypto_meta else "ticker" for s in symbols}
    return classification, crypto_meta


def _fetch_ohlcv(conn, symbols: list[str], lookback: int) -> pd.DataFrame:
    """
    Fetch daily OHLCV for a mixed list of tickers and crypto asset_ids.

    Tickers come from `daily_prices`; crypto come from `crypto_mcap_snapshots`
    (OHLC filled with price since daily crypto snapshots only store close).
    Output has the same column schema the compute layer already relies on.
    """
    classification, _ = _classify_symbols(conn, symbols)
    ticker_syms = [s for s, k in classification.items() if k == "ticker"]
    crypto_syms = [s for s, k in classification.items() if k == "crypto"]

    frames: list[pd.DataFrame] = []

    if ticker_syms:
        placeholders = ",".join(["%s"] * len(ticker_syms))
        query = f"""
            SELECT symbol, date, open, high, low, close, adj_close, volume
            FROM daily_prices
            WHERE symbol IN ({placeholders})
            ORDER BY date
        """
        with conn.cursor() as cur:
            cur.execute(query, ticker_syms)
            rows = cur.fetchall()
        if rows:
            df = pd.DataFrame(
                rows,
                columns=["symbol", "date", "open", "high", "low", "close", "adj_close", "volume"],
            )
            df["date"] = pd.to_datetime(df["date"])
            frames.append(df)

    if crypto_syms:
        placeholders = ",".join(["%s"] * len(crypto_syms))
        query = f"""
            SELECT asset_id, snapshot_date, price, volume_24h
            FROM crypto_mcap_snapshots
            WHERE asset_id IN ({placeholders})
            ORDER BY snapshot_date
        """
        with conn.cursor() as cur:
            cur.execute(query, crypto_syms)
            rows = cur.fetchall()
        if rows:
            df = pd.DataFrame(rows, columns=["symbol", "date", "close", "volume"])
            df["date"] = pd.to_datetime(df["date"])
            df["close"] = df["close"].astype(float)
            df["adj_close"] = df["close"]
            df["open"] = df["close"]
            df["high"] = df["close"]
            df["low"] = df["close"]
            df["volume"] = df["volume"].fillna(0).astype(float)
            frames.append(df[["symbol", "date", "open", "high", "low", "close", "adj_close", "volume"]])

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True)

    # Keep last N + buffer trading days so that return calculations
    # (which need lookback+1 points) always have enough data.
    fetch_size = lookback + 30
    all_dates = sorted(combined["date"].unique())
    if len(all_dates) > fetch_size:
        cutoff = all_dates[-fetch_size]
        combined = combined[combined["date"] >= cutoff]

    return combined


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

        # YTD — first trading day of the current year
        last_date = grp["date"].iloc[-1]
        year_start_date = pd.Timestamp(year=last_date.year, month=1, day=1)
        ytd_rows = grp[grp["date"] >= year_start_date].head(1)
        ytd = None
        if len(ytd_rows) > 0:
            p0 = (ytd_rows["adj_close"].fillna(ytd_rows["close"])).iloc[0]
            if p0 and p0 != 0:
                ytd = round((float(last) / float(p0) - 1) * 100, 2)

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


def _compute_rrg_positions(
    conn, symbols: list[str],
    rs_span: int = 20, momentum_span: int = 10, trail_length: int = 5,
) -> dict:
    """Compute RRG RS-Ratio & RS-Momentum for given symbols vs an adaptive benchmark.

    Benchmark rule:
      - All tickers       → ^GSPC from daily_prices
      - All crypto        → bitcoin from crypto_mcap_snapshots
      - Mixed             → skip (returns {}) — no meaningful cross-universe benchmark

    Returns {symbol: {ratio, momentum, quadrant, trail: […]}}.
    """
    from backend.services.rrg import assign_quadrant

    classification, _ = _classify_symbols(conn, symbols)
    ticker_syms = [s for s, k in classification.items() if k == "ticker"]
    crypto_syms = [s for s, k in classification.items() if k == "crypto"]

    if ticker_syms and crypto_syms:
        return {}  # cross-universe RRG is not defined

    if ticker_syms and not crypto_syms:
        benchmark_symbol = "^GSPC"
        all_syms = list(set(ticker_syms + [benchmark_symbol]))
        placeholders = ",".join(["%s"] * len(all_syms))
        query = f"""
            SELECT symbol, date, adj_close
            FROM daily_prices
            WHERE symbol IN ({placeholders})
            ORDER BY date
        """
        with conn.cursor() as cur:
            cur.execute(query, all_syms)
            rows = cur.fetchall()
        if not rows:
            return {}
        df = pd.DataFrame(rows, columns=["symbol", "date", "adj_close"])
    else:  # crypto only
        benchmark_symbol = "bitcoin"
        all_syms = list(set(crypto_syms + [benchmark_symbol]))
        placeholders = ",".join(["%s"] * len(all_syms))
        query = f"""
            SELECT asset_id, snapshot_date, price
            FROM crypto_mcap_snapshots
            WHERE asset_id IN ({placeholders})
            ORDER BY snapshot_date
        """
        with conn.cursor() as cur:
            cur.execute(query, all_syms)
            rows = cur.fetchall()
        if not rows:
            return {}
        df = pd.DataFrame(rows, columns=["symbol", "date", "adj_close"])

    df["date"] = pd.to_datetime(df["date"])
    pivot = df.pivot(index="date", columns="symbol", values="adj_close").sort_index()
    pivot = pivot.ffill()

    # Resample to weekly (matches RRG page default)
    pivot = pivot.resample("W").last()

    if benchmark_symbol not in pivot.columns:
        return {}

    benchmark = pivot[benchmark_symbol]
    target_syms = ticker_syms or crypto_syms
    available = [s for s in target_syms if s in pivot.columns]
    if not available:
        return {}

    sectors = pivot[available]

    rs = sectors.div(benchmark / 100, axis=0).ewm(span=rs_span, adjust=False).mean()
    rel_ratio = 100 + (rs - rs.mean()) / rs.std()

    rs_momentum_pct = rel_ratio.pct_change().ewm(span=momentum_span, adjust=False).mean()
    momentum = 100 + rs_momentum_pct / rs_momentum_pct.std()

    result = {}
    ratio_tail = rel_ratio.tail(trail_length)
    momentum_tail = momentum.tail(trail_length)

    for sym in available:
        trail = []
        for date_idx in ratio_tail.index:
            r = ratio_tail.at[date_idx, sym]
            m = momentum_tail.at[date_idx, sym]
            if pd.notna(r) and pd.notna(m):
                trail.append({
                    "date": date_idx.strftime("%Y-%m-%d"),
                    "ratio": round(float(r), 4),
                    "momentum": round(float(m), 4),
                })
        if trail:
            latest = trail[-1]
            result[sym] = {
                "ratio": latest["ratio"],
                "momentum": latest["momentum"],
                "quadrant": assign_quadrant(latest["ratio"], latest["momentum"]),
                "trail": trail,
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


# ── Result reordering (for cache hits with different symbol order) ────

def _reorder_result(result: dict, symbols: list[str]) -> dict:
    """Return a copy of the cached result reordered to match `symbols`."""
    cached_symbols = result["symbols"]
    # Build index map: new position -> old position
    idx_map = {sym: i for i, sym in enumerate(cached_symbols)}

    reordered = {**result, "symbols": symbols}

    # Reorder assets list
    reordered["assets"] = [result["assets"][idx_map[s]] for s in symbols]

    # Swap relative_strength direction if the pair order flipped
    if len(symbols) >= 2 and symbols[0] != cached_symbols[0]:
        rs = result.get("relative_strength")
        if rs and rs.get("values"):
            reordered["relative_strength"] = {
                **rs,
                "values": [1.0 / v if v else v for v in rs["values"]],
            }
        rc = result.get("rolling_correlation")
        if rc:
            reordered["rolling_correlation"] = rc  # correlation is symmetric

    return reordered


# ── Main entry point ─────────────────────────────────────────────────

def get_comparison(conn, symbols: list[str], lookback: int = DEFAULT_LOOKBACK) -> dict:
    """Build full comparison payload for the given symbols."""
    cache_key = f"compare:{'|'.join(sorted(symbols))}:{lookback}"
    cached = _cache_get(cache_key)
    if cached is not None:
        # Reorder result to match requested symbol order (cache key is sorted)
        if cached.get("symbols") != symbols:
            return _reorder_result(cached, symbols)
        return cached

    try:
        logger.info("Computing comparison for %s (lookback=%d)", symbols, lookback)

        df = _fetch_ohlcv(conn, symbols, lookback)
        if df.empty:
            return {"symbols": symbols, "error": "No data found"}

        classification, crypto_meta = _classify_symbols(conn, symbols)
        ticker_syms = [s for s, k in classification.items() if k == "ticker"]

        # OBV data only exists for tickers (obv_daily_metrics is ticker-only).
        obv_data = _fetch_obv_latest(conn, ticker_syms) if ticker_syms else {}

        # Build asset info
        assets = []
        performance = _compute_performance(df)
        regime = _compute_regime_simple(df)
        for sym in symbols:
            is_crypto = classification.get(sym) == "crypto"
            if is_crypto:
                cmeta = crypto_meta.get(sym, {})
                name = cmeta.get("name") or sym
                display_symbol = cmeta.get("display_symbol")
                logo_url = cmeta.get("logo_url")
            else:
                name = ALL_TICKERS.get(sym, sym)
                display_symbol = None
                logo_url = None

            perf = performance.get(sym, {})
            reg = regime.get(sym, {})
            obv = obv_data.get(sym, {})
            assets.append({
                "symbol": sym,
                "name": name,
                "asset_type": "crypto" if is_crypto else "ticker",
                "display_symbol": display_symbol,
                "logo_url": logo_url,
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

        # RRG positions (RS-Ratio & RS-Momentum vs benchmark)
        rrg_positions = _compute_rrg_positions(conn, symbols)

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
            "rrg_positions": rrg_positions,
        }

        _cache_set(cache_key, result)
        return result
    except Exception:
        logger.exception("Failed to build comparison for symbols=%s lookback=%d", symbols, lookback)
        return {"symbols": symbols, "error": "Comparison service temporarily unavailable"}

"""
Crypto universe data loader.

Provides DataFrames shaped like the ticker path (`daily_prices`) so the
existing RRG / OBV / regime compute helpers can be reused without
duplicating math.

Conventions:
  - "symbol" in API payloads is the CoinGecko asset id (e.g. "bitcoin"),
    matching crypto_assets.id. Display ticker (BTC, ETH) and name live
    alongside in the universe metadata dict.
  - OHLC fields fall back to `price` (close) because crypto_mcap_snapshots
    only stores daily close + volume + market_cap.
"""

from __future__ import annotations

import logging

import pandas as pd

logger = logging.getLogger(__name__)


BENCHMARK_ASSET_ID = "bitcoin"
VALID_CRYPTO_TIMEFRAMES = ("daily", "weekly")


# ── Universe ─────────────────────────────────────────────────────────

def get_crypto_universe(conn, limit: int = 20) -> dict[str, dict]:
    """
    Return the latest Top-N crypto universe as a dict keyed by asset_id:
        { "bitcoin": {"symbol": "BTC", "name": "Bitcoin",
                      "style_bucket": "safety", "logo_url": "…",
                      "market_cap": 1234, "rank": 1}, … }

    Only assets with style_bucket (growth/safety/tactical) classification
    are included — keeps parity with `get_crypto_top20` semantics.
    """
    # Latest snapshot_date with mcap populated — yfinance history-backfill
    # rows have market_cap NULL, so a plain MAX would skip the real ranking.
    query = """
        WITH latest AS (
            SELECT MAX(snapshot_date) AS d
            FROM crypto_mcap_snapshots
            WHERE market_cap IS NOT NULL
        )
        SELECT
            a.id, a.symbol, a.name, a.style_bucket, a.logo_url,
            s.market_cap, s.rank
        FROM crypto_mcap_snapshots s
        JOIN crypto_assets a ON a.id = s.asset_id
        WHERE s.snapshot_date = (SELECT d FROM latest)
          AND a.style_bucket IS NOT NULL
          AND s.market_cap IS NOT NULL
        ORDER BY s.market_cap DESC
        LIMIT %s
    """
    try:
        with conn.cursor() as cur:
            cur.execute(query, (limit,))
            rows = cur.fetchall()
    except Exception:
        logger.exception("Failed to load crypto universe")
        return {}

    out: dict[str, dict] = {}
    for i, (asset_id, symbol, name, bucket, logo, mcap, _db_rank) in enumerate(rows, 1):
        out[asset_id] = {
            "symbol": symbol,
            "name": name,
            "style_bucket": bucket,
            "logo_url": logo,
            "market_cap": int(mcap) if mcap is not None else None,
            "rank": i,
        }
    return out


def fetch_crypto_asset_meta(conn, asset_ids: list[str]) -> dict[str, dict]:
    """Return static metadata for a subset of asset_ids (used by detail endpoints)."""
    if not asset_ids:
        return {}
    placeholders = ",".join(["%s"] * len(asset_ids))
    query = f"""
        SELECT id, symbol, name, style_bucket, logo_url
        FROM crypto_assets
        WHERE id IN ({placeholders})
    """
    try:
        with conn.cursor() as cur:
            cur.execute(query, asset_ids)
            rows = cur.fetchall()
    except Exception:
        logger.exception("Failed to fetch crypto asset meta for %s", asset_ids)
        return {}
    return {
        aid: {"symbol": sym, "name": name, "style_bucket": bucket, "logo_url": logo}
        for aid, sym, name, bucket, logo in rows
    }


# ── OHLCV fetchers (shape-compatible with ticker fetchers) ───────────

def _fetch_close_volume_daily(
    conn, asset_ids: list[str]
) -> dict[str, pd.DataFrame]:
    """
    Fetch (snapshot_date, price, volume_24h, market_cap) per asset_id.

    Returns {asset_id: DataFrame(date index, columns=[adj_close, close,
    high, low, volume, market_cap])}. High/low fall back to close —
    crypto snapshots don't store intraday ranges.
    """
    if not asset_ids:
        return {}
    placeholders = ",".join(["%s"] * len(asset_ids))
    query = f"""
        SELECT asset_id, snapshot_date, price, volume_24h, market_cap
        FROM crypto_mcap_snapshots
        WHERE asset_id IN ({placeholders})
        ORDER BY snapshot_date
    """
    try:
        with conn.cursor() as cur:
            cur.execute(query, asset_ids)
            rows = cur.fetchall()
    except Exception:
        logger.exception("Failed to fetch crypto OHLCV for %s", asset_ids)
        return {}

    if not rows:
        return {}

    df = pd.DataFrame(
        rows, columns=["asset_id", "date", "price", "volume", "market_cap"]
    )
    df["date"] = pd.to_datetime(df["date"])

    result: dict[str, pd.DataFrame] = {}
    for aid, grp in df.groupby("asset_id"):
        grp = grp.set_index("date").sort_index()
        grp = grp.dropna(subset=["price"])
        if grp.empty:
            continue
        price = grp["price"].astype(float)
        volume = grp["volume"].fillna(0).astype(float)
        mcap = grp["market_cap"].astype(float)
        frame = pd.DataFrame({
            "adj_close": price,
            "close": price,
            "high": price,
            "low": price,
            "volume": volume,
            "market_cap": mcap,
        })
        result[aid] = frame
    return result


def _resample_weekly(
    data_map: dict[str, pd.DataFrame]
) -> dict[str, pd.DataFrame]:
    """Resample daily crypto data to weekly bars (Friday close)."""
    out: dict[str, pd.DataFrame] = {}
    for aid, df in data_map.items():
        weekly = df.resample("W-FRI").agg({
            "adj_close": "last",
            "close": "last",
            "high": "max",
            "low": "min",
            "volume": "sum",
            "market_cap": "last",
        }).dropna(subset=["adj_close"])
        if not weekly.empty:
            out[aid] = weekly
    return out


def fetch_crypto_for_timeframe(
    conn, asset_ids: list[str], timeframe: str = "daily"
) -> dict[str, pd.DataFrame]:
    """Return a per-asset OHLCV-shaped dict for the requested timeframe."""
    if timeframe not in VALID_CRYPTO_TIMEFRAMES:
        timeframe = "daily"
    data_map = _fetch_close_volume_daily(conn, asset_ids)
    if timeframe == "weekly":
        return _resample_weekly(data_map)
    return data_map


def fetch_crypto_close_pivot(
    conn, asset_ids: list[str], timeframe: str = "daily"
) -> pd.DataFrame:
    """Return a pivoted close-price DataFrame (rows=date, cols=asset_id)."""
    data_map = fetch_crypto_for_timeframe(conn, asset_ids, timeframe)
    if not data_map:
        return pd.DataFrame()
    pieces = {aid: df["adj_close"] for aid, df in data_map.items()}
    pivot = pd.DataFrame(pieces).sort_index()
    return pivot.ffill()

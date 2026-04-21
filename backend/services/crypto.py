"""Crypto market-cap ranking service (global CoinGecko universe)."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def get_crypto_top20(conn, limit: int = 20) -> list[dict]:
    """
    Return the latest crypto mcap snapshot (one row per asset) joined with
    static metadata. Only assets with a non-NULL `style_bucket` are kept —
    unclassified new entrants are silently filtered out so the card stays
    meaningful without manual gatekeeping.
    """
    query = """
        WITH latest AS (
            SELECT MAX(snapshot_date) AS d FROM crypto_mcap_snapshots
        )
        SELECT
            a.id,
            a.symbol,
            a.name,
            a.style_bucket,
            a.logo_url,
            s.snapshot_date,
            s.rank,
            s.market_cap,
            s.price,
            s.change_24h,
            s.change_7d,
            s.volume_24h
        FROM crypto_mcap_snapshots s
        JOIN crypto_assets a ON a.id = s.asset_id
        WHERE s.snapshot_date = (SELECT d FROM latest)
          AND a.style_bucket IS NOT NULL
        ORDER BY s.market_cap DESC
        LIMIT %s
    """
    try:
        with conn.cursor() as cur:
            cur.execute(query, (limit,))
            rows = cur.fetchall()
    except Exception:
        logger.exception("Failed to fetch crypto top-N")
        return []

    results = []
    for i, row in enumerate(rows, start=1):
        (asset_id, symbol, name, bucket, logo, snap_date, _db_rank,
         mcap, price, ch24, ch7, vol) = row
        results.append({
            "id": asset_id,
            "symbol": symbol,
            "name": name,
            "style_bucket": bucket,
            "logo_url": logo,
            "snapshot_date": snap_date.isoformat() if snap_date else None,
            "rank": i,
            "market_cap": int(mcap) if mcap is not None else None,
            "price": float(price) if price is not None else None,
            "change_24h": float(ch24) if ch24 is not None else None,
            "change_7d": float(ch7) if ch7 is not None else None,
            "volume_24h": int(vol) if vol is not None else None,
        })
    return results


def get_crypto_history(conn, asset_id: str, lookback_days: int = 365) -> list[dict]:
    """Return (snapshot_date, market_cap, price) history for one asset."""
    query = """
        SELECT snapshot_date, market_cap, price
        FROM crypto_mcap_snapshots
        WHERE asset_id = %s
          AND snapshot_date >= CURRENT_DATE - INTERVAL '%s days'
        ORDER BY snapshot_date
    """
    try:
        with conn.cursor() as cur:
            cur.execute(query, (asset_id, int(lookback_days)))
            rows = cur.fetchall()
    except Exception:
        logger.exception("Failed to fetch crypto history for %s", asset_id)
        return []

    return [
        {
            "date": d.isoformat() if d else None,
            "market_cap": int(mcap) if mcap is not None else None,
            "price": float(p) if p is not None else None,
        }
        for d, mcap, p in rows
    ]

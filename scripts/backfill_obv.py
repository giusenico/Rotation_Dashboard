#!/usr/bin/env python3
"""
Backfill historical OBV daily metrics for all tickers that have gaps.

Computes OBV metrics for every date where sufficient history exists
and upserts into obv_daily_metrics. Safe to re-run (uses ON CONFLICT DO UPDATE).

Usage:
    python scripts/backfill_obv.py
"""

import os
import sys

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from scipy.stats import rankdata

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import CROSS_ASSET_ETFS, SECTOR_ETFS, SUPABASE_DB_URL

# Constants (must match backend/services/flow.py and scripts/update_flow.py)
OBV_SMA_LEN = 50
RANK_LOOKBACK = 252
ROC_LEN = 20
MIN_BARS = OBV_SMA_LEN + RANK_LOOKBACK


def compute_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    sign = np.sign(close.diff()).fillna(0.0)
    return (sign * volume.fillna(0.0)).cumsum()


def main() -> None:
    conn = psycopg2.connect(SUPABASE_DB_URL)
    symbols = list({**CROSS_ASSET_ETFS, **SECTOR_ETFS}.keys())
    placeholders = ",".join(["%s"] * len(symbols))

    # Fetch all daily prices
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT symbol, date, adj_close, volume
                FROM daily_prices
                WHERE symbol IN ({placeholders})
                ORDER BY symbol, date""",
            symbols,
        )
        rows = cur.fetchall()

    df = pd.DataFrame(rows, columns=["symbol", "date", "adj_close", "volume"])
    df["date"] = pd.to_datetime(df["date"])

    # Check existing counts per symbol
    with conn.cursor() as cur:
        cur.execute(
            f"""SELECT symbol, COUNT(*) FROM obv_daily_metrics
                WHERE symbol IN ({placeholders})
                GROUP BY symbol""",
            symbols,
        )
        existing = dict(cur.fetchall())

    total_upserted = 0

    for sym in symbols:
        df_sym = df[df["symbol"] == sym].set_index("date").sort_index()
        df_sym = df_sym.dropna(subset=["adj_close"])

        if len(df_sym) < MIN_BARS:
            print(f"  {sym}: only {len(df_sym)} bars, need {MIN_BARS} — skipped")
            continue

        existing_count = existing.get(sym, 0)
        possible_dates = len(df_sym) - MIN_BARS + 1

        # Skip if already fully backfilled (within 2 days tolerance)
        if existing_count >= possible_dates - 2:
            print(f"  {sym}: already has {existing_count} rows (expected ~{possible_dates}) — OK")
            continue

        print(f"  {sym}: has {existing_count} rows, expected ~{possible_dates} — backfilling...")

        close = df_sym["adj_close"]
        volume = df_sym["volume"]

        obv = compute_obv(close, volume)
        sma = obv.rolling(OBV_SMA_LEN).mean()
        spread = obv - sma
        roc = spread.diff(ROC_LEN)
        spread_vol = spread.rolling(RANK_LOOKBACK).std()

        # Vectorized rolling percentile rank using pandas .rolling().apply()
        def _rank_last(w):
            last = w[-1]
            if np.isnan(last):
                return np.nan
            r = rankdata(w)[-1] / len(w)
            return (r - 0.5) * 2

        spread_pctl = spread.rolling(RANK_LOOKBACK, min_periods=RANK_LOOKBACK).apply(
            _rank_last, raw=True
        )

        # z-momentum
        z_momo = pd.Series(np.nan, index=spread.index)
        valid = (spread_vol != 0) & spread_vol.notna() & roc.notna()
        z_momo[valid] = np.tanh(roc[valid] / (spread_vol[valid] + 1e-9))

        # Composite score
        score = ((spread_pctl + z_momo) / 2).clip(-1, 1)

        # Regime
        regime = spread.apply(lambda x: "buy" if x >= 0 else "sell")

        # Build rows starting from MIN_BARS onward
        start_idx = MIN_BARS - 1
        batch = []
        for i in range(start_idx, len(df_sym)):
            dt = df_sym.index[i]
            date_str = dt.strftime("%Y-%m-%d")
            s_last = spread.iloc[i]
            s_pctl = spread_pctl.iloc[i]
            m_z = z_momo.iloc[i]
            sc = score.iloc[i]
            reg = regime.iloc[i]

            batch.append((
                date_str,
                sym,
                reg,
                round(float(s_last), 4) if not np.isnan(s_last) else None,
                round(float(s_pctl), 4) if not np.isnan(s_pctl) else None,
                round(float(m_z), 4) if not np.isnan(m_z) else None,
                round(float(sc), 4) if not np.isnan(sc) else None,
            ))

        # Batch upsert using execute_values for speed
        with conn.cursor() as cur:
            execute_values(
                cur,
                """INSERT INTO obv_daily_metrics
                       (date, symbol, obv_regime, spread_last, spread_pct, momentum_z, rotation_score)
                   VALUES %s
                   ON CONFLICT (date, symbol) DO UPDATE SET
                       obv_regime     = EXCLUDED.obv_regime,
                       spread_last    = EXCLUDED.spread_last,
                       spread_pct     = EXCLUDED.spread_pct,
                       momentum_z     = EXCLUDED.momentum_z,
                       rotation_score = EXCLUDED.rotation_score""",
                batch,
                page_size=500,
            )
        conn.commit()
        print(f"    → upserted {len(batch)} rows for {sym}")
        total_upserted += len(batch)

    conn.close()
    print(f"\nDone. Total rows upserted: {total_upserted}")


if __name__ == "__main__":
    main()

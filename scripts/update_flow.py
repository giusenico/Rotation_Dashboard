#!/usr/bin/env python3
"""
Compute today's OBV daily metrics for all CROSS_ASSET_ETFS and upsert them
into the obv_daily_metrics table.

Intended to run right after fetch_data.py in the daily GitHub Actions workflow.

Usage:
    python scripts/update_flow.py
"""

import os
import sys
from datetime import date

import numpy as np
import pandas as pd
import psycopg2
from scipy.stats import rankdata

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import CROSS_ASSET_ETFS, SUPABASE_DB_URL

# Constants (must match backend/services/flow.py)
OBV_SMA_LEN = 50
RANK_LOOKBACK = 252
ROC_LEN = 20
MIN_BARS = OBV_SMA_LEN + RANK_LOOKBACK


def compute_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    sign = np.sign(close.diff()).fillna(0.0)
    return (sign * volume.fillna(0.0)).cumsum()


def pct_rank_last(series: pd.Series, window: int) -> float:
    s = series.dropna()
    if len(s) < window:
        return np.nan
    w = s.iloc[-window:].values
    r = rankdata(w)[-1] / window
    return (r - 0.5) * 2


def main() -> None:
    try:
        conn = psycopg2.connect(SUPABASE_DB_URL)
    except Exception as exc:
        print(f"[FATAL] Could not connect to database: {exc}")
        sys.exit(1)

    today_str = date.today().isoformat()

    symbols = list(CROSS_ASSET_ETFS.keys())
    placeholders = ",".join(["%s"] * len(symbols))

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

    upserted = 0
    errors = 0
    for sym in symbols:
        try:
            df_sym = df[df["symbol"] == sym].set_index("date").sort_index()
            df_sym = df_sym.dropna(subset=["adj_close"])

            if len(df_sym) < MIN_BARS:
                print(f"  {sym}: only {len(df_sym)} bars, need {MIN_BARS} — skipped")
                continue

            close = df_sym["adj_close"]
            volume = df_sym["volume"]

            obv = compute_obv(close, volume)
            sma = obv.rolling(OBV_SMA_LEN).mean()
            spread = obv - sma

            spread_pctl = pct_rank_last(spread, RANK_LOOKBACK)
            roc = spread.diff(ROC_LEN)
            spread_vol = spread.rolling(RANK_LOOKBACK).std()

            z_momo = np.nan
            last_vol = spread_vol.iloc[-1]
            if len(spread) > ROC_LEN and last_vol != 0 and not pd.isna(last_vol):
                z_momo = float(np.tanh(roc.iloc[-1] / (last_vol + 1e-9)))

            mean_val = np.nanmean([spread_pctl, z_momo])
            score = float(np.clip(mean_val, -1, 1)) if not np.isnan(mean_val) else None
            regime = "buy" if spread.iloc[-1] >= 0 else "sell"

            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO obv_daily_metrics
                           (date, symbol, obv_regime, spread_last, spread_pct, momentum_z, rotation_score)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (date, symbol) DO UPDATE SET
                           obv_regime     = EXCLUDED.obv_regime,
                           spread_last    = EXCLUDED.spread_last,
                           spread_pct     = EXCLUDED.spread_pct,
                           momentum_z     = EXCLUDED.momentum_z,
                           rotation_score = EXCLUDED.rotation_score""",
                    (
                        today_str,
                        sym,
                        regime,
                        round(float(spread.iloc[-1]), 4),
                        round(float(spread_pctl), 4) if not np.isnan(spread_pctl) else None,
                        round(float(z_momo), 4) if not np.isnan(z_momo) else None,
                        round(score, 4) if score is not None else None,
                    ),
                )
            conn.commit()
            upserted += 1
            print(f"  {sym}: OK")
        except Exception as exc:
            errors += 1
            print(f"  {sym}: [ERROR] {exc}")
            conn.rollback()

    conn.close()
    print(f"\nDone. OBV metrics upserted for {upserted}/{len(symbols)} symbols ({today_str}), {errors} errors.")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()

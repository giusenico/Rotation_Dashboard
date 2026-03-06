#!/usr/bin/env python3
"""
Fetch intraday 1h data from Yahoo Finance, resample to 4h candles,
and store in Supabase PostgreSQL.

Supports two modes:
  - Full fetch   : downloads max available 1h history (~730 days) and resamples.
  - Incremental  : fetches only data newer than the latest stored datetime.

Usage:
    python scripts/fetch_intraday.py              # incremental (or full if DB is empty)
    python scripts/fetch_intraday.py --full        # force full historical fetch
"""

import argparse
import os
import sys
from datetime import datetime, timedelta

import pandas as pd
import psycopg2
import yfinance as yf

# Ensure the project root is on the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import ALL_TICKERS, SUPABASE_DB_URL


def get_last_datetime(conn, symbol: str) -> datetime | None:
    """Return the most recent datetime stored for *symbol*, or None."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MAX(datetime) FROM intraday_prices_4h WHERE symbol = %s",
            (symbol,),
        )
        row = cur.fetchone()
    return row[0] if row and row[0] else None


def resample_to_4h(df: pd.DataFrame) -> pd.DataFrame:
    """Resample 1h OHLCV data to 4h candles."""
    df.columns = [c.lower().replace(" ", "_") for c in df.columns]

    needed = ["open", "high", "low", "close", "volume"]
    for col in needed:
        if col not in df.columns:
            df[col] = None

    df_4h = (
        df[needed]
        .resample("4h")
        .agg(
            {
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                "volume": "sum",
            }
        )
        .dropna(subset=["open", "close"])
    )

    return df_4h


def fetch_and_store(
    conn, symbol: str, *, period: str | None = None, start: datetime | None = None
) -> int:
    """
    Download 1h data for *symbol*, resample to 4h, and insert into the database.
    Provide either *period* (e.g. "730d") or *start* datetime.
    Returns the number of rows upserted.
    """
    try:
        ticker = yf.Ticker(symbol)
        if period:
            df = ticker.history(interval="1h", period=period, auto_adjust=False)
            # Some tickers fail with period="730d"; fall back to explicit start date
            if df.empty:
                from datetime import timezone

                fallback_start = datetime.now(timezone.utc) - timedelta(days=729)
                df = ticker.history(
                    interval="1h", start=fallback_start, auto_adjust=False
                )
        else:
            df = ticker.history(interval="1h", start=start, auto_adjust=False)
    except Exception as exc:
        print(f"  [ERROR] Failed to download {symbol}: {exc}")
        return 0

    if df.empty:
        return 0

    df_4h = resample_to_4h(df)
    if df_4h.empty:
        return 0

    rows_inserted = 0
    with conn.cursor() as cur:
        for dt_idx, row in df_4h.iterrows():
            cur.execute(
                """INSERT INTO intraday_prices_4h
                   (symbol, datetime, open, high, low, close, volume)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (symbol, datetime) DO UPDATE SET
                     open = EXCLUDED.open,
                     high = EXCLUDED.high,
                     low = EXCLUDED.low,
                     close = EXCLUDED.close,
                     volume = EXCLUDED.volume""",
                (
                    symbol,
                    dt_idx.isoformat(),
                    float(row["open"]) if pd.notna(row["open"]) else None,
                    float(row["high"]) if pd.notna(row["high"]) else None,
                    float(row["low"]) if pd.notna(row["low"]) else None,
                    float(row["close"]) if pd.notna(row["close"]) else None,
                    int(row["volume"]) if pd.notna(row["volume"]) else None,
                ),
            )
            rows_inserted += 1

    conn.commit()
    return rows_inserted


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch intraday 4h market data and store in Supabase PostgreSQL."
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Force a full historical fetch (max ~730 days of 1h data).",
    )
    args = parser.parse_args()

    print("Connecting to Supabase PostgreSQL ...")
    try:
        conn = psycopg2.connect(SUPABASE_DB_URL)
    except Exception as exc:
        print(f"[FATAL] Could not connect to database: {exc}")
        sys.exit(1)

    symbols = list(ALL_TICKERS.keys())
    total_inserted = 0
    errors = 0

    print(f"Fetching intraday 4h data for {len(symbols)} tickers ...")
    print(f"Mode: {'FULL' if args.full else 'INCREMENTAL'}\n")

    for i, symbol in enumerate(symbols, 1):
        try:
            if args.full:
                inserted = fetch_and_store(conn, symbol, period="730d")
            else:
                last_dt = get_last_datetime(conn, symbol)
                if last_dt:
                    # Start from 4h before last stored to ensure overlap for upsert
                    start = last_dt - timedelta(hours=4)
                    inserted = fetch_and_store(conn, symbol, start=start)
                else:
                    inserted = fetch_and_store(conn, symbol, period="730d")

            total_inserted += inserted
            print(f"  [{i}/{len(symbols)}] {symbol} — {inserted} rows upserted")
        except Exception as exc:
            errors += 1
            print(f"  [{i}/{len(symbols)}] {symbol} — [ERROR] {exc}")
            conn.rollback()

    conn.close()
    print(f"\nDone. {total_inserted} total rows upserted, {errors} errors.")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()

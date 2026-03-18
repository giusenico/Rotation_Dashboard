#!/usr/bin/env python3
"""
Fetch daily OHLCV data from Yahoo Finance and store it in Supabase PostgreSQL.

Supports two modes:
  - Full fetch   : downloads the last N years of history (configured in config.py).
  - Incremental  : fetches only data newer than the latest stored date per ticker.

Usage:
    python scripts/fetch_data.py              # incremental (or full if DB is empty)
    python scripts/fetch_data.py --full       # force a full historical fetch
"""

import argparse
import os
import sys
from datetime import datetime, timedelta

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
import yfinance as yf

# Ensure the project root is on the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import ALL_TICKERS, HISTORY_YEARS, SUPABASE_DB_URL


def connect():
    """Create a new database connection."""
    return psycopg2.connect(SUPABASE_DB_URL)


def get_last_date(conn, symbol: str) -> str | None:
    """Return the most recent date stored for *symbol*, or None."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT MAX(date) FROM daily_prices WHERE symbol = %s", (symbol,)
        )
        row = cur.fetchone()
    return row[0] if row and row[0] else None


def fetch_and_store(conn, symbol: str, start: str, end: str) -> int:
    """
    Download daily data for *symbol* between *start* and *end* (ISO dates)
    and insert rows into the database using batch upsert.

    Returns the number of rows inserted.
    """
    try:
        ticker = yf.Ticker(symbol)
        df: pd.DataFrame = ticker.history(start=start, end=end, auto_adjust=False)
    except Exception as exc:
        print(f"  [ERROR] Failed to download {symbol}: {exc}")
        return 0

    if df.empty:
        return 0

    # Normalize column names (yfinance may capitalize them)
    df.columns = [c.lower().replace(" ", "_") for c in df.columns]

    # Ensure all needed columns exist
    needed = ["open", "high", "low", "close", "adj_close", "volume"]
    for col in needed:
        if col not in df.columns:
            df[col] = None

    # Build list of tuples for batch upsert
    values = []
    for date_idx, row in df.iterrows():
        values.append((
            symbol,
            date_idx.strftime("%Y-%m-%d"),
            float(row["open"]) if pd.notna(row["open"]) else None,
            float(row["high"]) if pd.notna(row["high"]) else None,
            float(row["low"]) if pd.notna(row["low"]) else None,
            float(row["close"]) if pd.notna(row["close"]) else None,
            float(row["adj_close"]) if pd.notna(row["adj_close"]) else None,
            int(row["volume"]) if pd.notna(row["volume"]) else None,
        ))

    if not values:
        return 0

    with conn.cursor() as cur:
        execute_values(
            cur,
            """INSERT INTO daily_prices
               (symbol, date, open, high, low, close, adj_close, volume)
               VALUES %s
               ON CONFLICT (symbol, date) DO UPDATE SET
                 open = EXCLUDED.open,
                 high = EXCLUDED.high,
                 low = EXCLUDED.low,
                 close = EXCLUDED.close,
                 adj_close = EXCLUDED.adj_close,
                 volume = EXCLUDED.volume""",
            values,
            page_size=500,
        )

    conn.commit()
    return len(values)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch daily market data and store it in Supabase PostgreSQL."
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Force a full historical fetch (ignores existing data).",
    )
    args = parser.parse_args()

    # yfinance treats `end` as exclusive, so we use tomorrow to include today's data
    end_date = (datetime.today() + timedelta(days=1)).strftime("%Y-%m-%d")
    full_start = (datetime.today() - timedelta(days=HISTORY_YEARS * 365)).strftime(
        "%Y-%m-%d"
    )

    total_inserted = 0
    errors = 0
    symbols = list(ALL_TICKERS.keys())

    print(f"Fetching data for {len(symbols)} tickers ...")
    print(f"Mode: {'FULL' if args.full else 'INCREMENTAL'}")
    print(f"Date range: {full_start} -> {end_date}\n")

    for i, symbol in enumerate(symbols, 1):
        # Fresh connection per ticker to avoid timeout on long runs
        try:
            conn = connect()
        except Exception as exc:
            errors += 1
            print(f"  [{i}/{len(symbols)}] {symbol} — [ERROR] connect: {exc}")
            continue

        try:
            if args.full:
                start_date = full_start
            else:
                last = get_last_date(conn, symbol)
                if last:
                    # Start from the day after the last stored date
                    start_date = (
                        datetime.strptime(last, "%Y-%m-%d") + timedelta(days=1)
                    ).strftime("%Y-%m-%d")
                    if start_date >= end_date:
                        print(f"  [{i}/{len(symbols)}] {symbol} — already up to date")
                        conn.close()
                        continue
                else:
                    start_date = full_start

            inserted = fetch_and_store(conn, symbol, start_date, end_date)
            total_inserted += inserted
            print(f"  [{i}/{len(symbols)}] {symbol} — {inserted} rows inserted")
        except Exception as exc:
            errors += 1
            print(f"  [{i}/{len(symbols)}] {symbol} — [ERROR] {exc}")
        finally:
            try:
                conn.close()
            except Exception:
                pass

    print(f"\nDone. {total_inserted} total rows inserted, {errors} errors.")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()

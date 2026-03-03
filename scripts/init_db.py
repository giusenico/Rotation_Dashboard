#!/usr/bin/env python3
"""
Initialize the Supabase PostgreSQL database.

Steps performed:
  1. Execute the DDL from db/schema.sql to create tables.
  2. Seed the asset_categories table.
  3. Seed the tickers table with metadata fetched from Yahoo Finance.

Usage:
    python scripts/init_db.py
"""

import os
import sys

import psycopg2
import yfinance as yf

# Ensure the project root is on the Python path so we can import config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    ALL_TICKERS,
    CATEGORIES,
    SCHEMA_PATH,
    SUPABASE_DB_URL,
    TICKER_CATEGORY_MAP,
)


def create_schema(conn) -> None:
    """Read and execute the SQL schema file."""
    with open(SCHEMA_PATH, "r") as f:
        schema_sql = f.read()
    with conn.cursor() as cur:
        cur.execute(schema_sql)
    conn.commit()
    print("[OK] Schema created.")


def seed_categories(conn) -> None:
    """Insert the predefined asset categories."""
    with conn.cursor() as cur:
        for name, cat_id in CATEGORIES.items():
            cur.execute(
                """INSERT INTO asset_categories (id, name)
                   OVERRIDING SYSTEM VALUE
                   VALUES (%s, %s)
                   ON CONFLICT (id) DO NOTHING""",
                (cat_id, name),
            )
    conn.commit()
    print(f"[OK] Seeded {len(CATEGORIES)} asset categories.")


def seed_tickers(conn) -> None:
    """Fetch metadata from Yahoo Finance and insert each ticker."""
    inserted = 0
    failed = []

    with conn.cursor() as cur:
        for symbol, display_name in ALL_TICKERS.items():
            # Check if already present
            cur.execute("SELECT 1 FROM tickers WHERE symbol = %s", (symbol,))
            if cur.fetchone():
                print(f"  [SKIP] {symbol} already exists.")
                continue

            category_name = TICKER_CATEGORY_MAP[symbol]
            category_id = CATEGORIES[category_name]

            # Attempt to fetch metadata from Yahoo Finance
            try:
                info = yf.Ticker(symbol).info
                full_name = info.get("longName") or info.get("shortName") or display_name
                currency = info.get("currency", "USD")
                exchange = info.get("exchange", "")
            except Exception as exc:
                print(f"  [WARN] Could not fetch info for {symbol}: {exc}")
                full_name = display_name
                currency = "USD"
                exchange = ""
                failed.append(symbol)

            cur.execute(
                """INSERT INTO tickers (symbol, name, category_id, currency, exchange)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (symbol) DO NOTHING""",
                (symbol, full_name, category_id, currency, exchange),
            )
            inserted += 1
            print(f"  [OK] {symbol} — {full_name}")

    conn.commit()
    print(f"[OK] Inserted {inserted} tickers.")
    if failed:
        print(f"[WARN] Metadata fetch failed for: {', '.join(failed)} (defaults used).")


def main() -> None:
    print(f"Connecting to Supabase PostgreSQL ...")
    conn = psycopg2.connect(SUPABASE_DB_URL)

    try:
        create_schema(conn)
        seed_categories(conn)
        seed_tickers(conn)
    finally:
        conn.close()

    print("\nDatabase initialization complete.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Pre-compute macro risk-on/off data and store in macro_daily_cache.

Runs daily after fetch_data.py + update_flow.py in the GitHub Actions workflow.
Computes hero snapshots for all period variants and history time-series,
then upserts the full JSON payloads into Supabase.

Usage:
    python scripts/update_macro.py
"""

import json
import os
import sys
from datetime import date

import psycopg2

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import SUPABASE_DB_URL

# Import the existing computation functions (no logic duplication)
from backend.services.macro import _compute_macro_hero, _compute_macro_history

# All period variants used by the frontend
HERO_PERIODS = [7, 14, 21, 63]
HISTORY_LOOKBACKS = [300]


def _upsert(conn, date_str, key, value):
    """Upsert a pre-computed result into macro_daily_cache."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO macro_daily_cache (date, key, value)
            VALUES (%s, %s, %s::jsonb)
            ON CONFLICT (date, key) DO UPDATE SET
                value = EXCLUDED.value
            """,
            (date_str, key, json.dumps(value)),
        )
    conn.commit()


def main():
    conn = psycopg2.connect(SUPABASE_DB_URL)
    today_str = date.today().isoformat()

    print(f"[update_macro] Computing macro data for {today_str}")

    # Hero snapshots for each period variant
    for period in HERO_PERIODS:
        result = _compute_macro_hero(conn, period=period)
        if isinstance(result, dict) and "error" not in result:
            _upsert(conn, today_str, f"hero_{period}", result)
            print(f"  hero_{period}: OK")
        else:
            print(f"  hero_{period}: SKIPPED ({result})")

    # History time-series
    for lookback in HISTORY_LOOKBACKS:
        result = _compute_macro_history(conn, lookback=lookback)
        if isinstance(result, dict) and "error" not in result:
            _upsert(conn, today_str, f"history_{lookback}", result)
            print(f"  history_{lookback}: OK")
        else:
            print(f"  history_{lookback}: SKIPPED ({result})")

    conn.close()
    print("[update_macro] Done.")


if __name__ == "__main__":
    main()

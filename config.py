"""
Central configuration for the Rotation Dashboard data pipeline.

All ticker definitions, category mappings, database connection,
and fetch parameters are defined here.
"""

import os
import sys

from dotenv import load_dotenv

# Load .env file (ignored in CI where env vars are set via secrets)
load_dotenv()

# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
if not SUPABASE_DB_URL:
    print("[ERROR] SUPABASE_DB_URL environment variable is not set.")
    print("        Copy .env.example to .env and fill in your Supabase connection string.")
    sys.exit(1)

# Path to the SQL schema file (relative to project root)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(BASE_DIR, "db", "schema.sql")

# ---------------------------------------------------------------------------
# History settings
# ---------------------------------------------------------------------------
HISTORY_YEARS = 10  # how many years of daily data to fetch

# ---------------------------------------------------------------------------
# Asset categories (must match the seed data in init_db.py)
# ---------------------------------------------------------------------------
CATEGORIES = {
    "Sector ETF": 1,
    "Bond ETF": 2,
    "Equity ETF": 3,
    "Commodity ETF": 4,
    "Crypto ETF": 5,
    "Benchmark": 6,
}

# ---------------------------------------------------------------------------
# Sector ETFs — track S&P 500 sector performance
# ---------------------------------------------------------------------------
SECTOR_ETFS = {
    "XLF": "Financials",
    "XLV": "Health Care",
    "XLY": "Consumer Discretionary",
    "XLC": "Communication Services",
    "XLE": "Energy",
    "XLI": "Industrials",
    "XLK": "Technology",
    "XLU": "Utilities",
    "XLB": "Materials",
    "XLRE": "Real Estate",
    "XLP": "Consumer Staples",
}

# ---------------------------------------------------------------------------
# Cross-asset ETFs — broad asset-class exposure
# ---------------------------------------------------------------------------
CROSS_ASSET_ETFS = {
    "BND": "US Aggregate Bond Market",
    "SHY": "1-3 Year US Treasury Bonds",
    "SHV": "Short Treasury Bonds (0-1 Year)",
    "IEF": "7-10 Year US Treasury Bonds",
    "TLT": "20+ Year US Treasury Bonds",
    "SPYV": "S&P 500 Value",
    "SPEU": "Europe Equities",
    "EEMA": "Asia Emerging Markets Equities",
    "ILF": "Latin America 40 Equities",
    "QQQ": "Nasdaq 100",
    "EWJ": "Japan Equities",
    "IWM": "US Small Caps (Russell 2000)",
    "GLD": "Gold",
    "SLV": "Silver",
    "USO": "US Crude Oil (WTI)",
    "BNO": "Brent Crude Oil",
    "SPYG": "S&P 500 Growth",
    "IBIT": "iShares Bitcoin Trust",
}

# ---------------------------------------------------------------------------
# Benchmark
# ---------------------------------------------------------------------------
BENCHMARK = {"^GSPC": "S&P 500"}

# ---------------------------------------------------------------------------
# Mapping: symbol -> category name (used by init_db to seed tickers)
# ---------------------------------------------------------------------------
TICKER_CATEGORY_MAP: dict[str, str] = {}

for sym in SECTOR_ETFS:
    TICKER_CATEGORY_MAP[sym] = "Sector ETF"

for sym, label in CROSS_ASSET_ETFS.items():
    if sym in ("BND", "SHY", "SHV", "IEF", "TLT"):
        TICKER_CATEGORY_MAP[sym] = "Bond ETF"
    elif sym in ("GLD", "SLV", "USO", "BNO"):
        TICKER_CATEGORY_MAP[sym] = "Commodity ETF"
    elif sym == "IBIT":
        TICKER_CATEGORY_MAP[sym] = "Crypto ETF"
    else:
        TICKER_CATEGORY_MAP[sym] = "Equity ETF"

for sym in BENCHMARK:
    TICKER_CATEGORY_MAP[sym] = "Benchmark"

# ---------------------------------------------------------------------------
# Convenience: all tickers in a single dict  symbol -> human-readable name
# ---------------------------------------------------------------------------
ALL_TICKERS: dict[str, str] = {**SECTOR_ETFS, **CROSS_ASSET_ETFS, **BENCHMARK}

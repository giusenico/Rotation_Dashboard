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
HISTORY_YEARS = 16  # fetch daily data back to 2010

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
    "Volatility Index": 7,
    "Macro Only": 8,
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
    "SPY": "S&P 500",
    "BTC-USD": "Bitcoin",
    "BND": "US Aggregate Bond Market",
    "SHY": "1-3 Year US Treasury Bonds",
    "SHV": "Short Treasury Bonds (0-1 Year)",
    "IEF": "7-10 Year US Treasury Bonds",
    "TLT": "20+ Year US Treasury Bonds",
    "IGOV": "International Treasury Bonds",
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
# Volatility indices — VIX term structure (no volume data)
# ---------------------------------------------------------------------------
VOLATILITY_INDICES = {
    "^VIX": "CBOE Volatility Index (VIX)",
    "^VIX3M": "CBOE 3-Month Volatility Index",
}

# ---------------------------------------------------------------------------
# Macro-only tickers — used exclusively by the macro risk-on/off engine
# ---------------------------------------------------------------------------
MACRO_ONLY = {
    "SPY": "SPDR S&P 500 ETF",
    "BTC-USD": "Bitcoin USD",
}

# ---------------------------------------------------------------------------
# Mapping: symbol -> category name (used by init_db to seed tickers)
# ---------------------------------------------------------------------------
TICKER_CATEGORY_MAP: dict[str, str] = {}

for sym in SECTOR_ETFS:
    TICKER_CATEGORY_MAP[sym] = "Sector ETF"

for sym in CROSS_ASSET_ETFS:
    if sym in ("BND", "SHY", "SHV", "IEF", "TLT", "IGOV"):
        TICKER_CATEGORY_MAP[sym] = "Bond ETF"
    elif sym in ("GLD", "SLV", "USO", "BNO"):
        TICKER_CATEGORY_MAP[sym] = "Commodity ETF"
    elif sym == "IBIT":
        TICKER_CATEGORY_MAP[sym] = "Crypto ETF"
    else:
        TICKER_CATEGORY_MAP[sym] = "Equity ETF"

for sym in BENCHMARK:
    TICKER_CATEGORY_MAP[sym] = "Benchmark"

for sym in VOLATILITY_INDICES:
    TICKER_CATEGORY_MAP[sym] = "Volatility Index"

for sym in MACRO_ONLY:
    TICKER_CATEGORY_MAP[sym] = "Macro Only"

# ---------------------------------------------------------------------------
# Convenience: all tickers in a single dict  symbol -> human-readable name
# ---------------------------------------------------------------------------
ALL_TICKERS: dict[str, str] = {**SECTOR_ETFS, **CROSS_ASSET_ETFS, **BENCHMARK, **VOLATILITY_INDICES, **MACRO_ONLY}
# ===========================================================================
# PSM Framework configuration
# ===========================================================================

# Data paths (relative to project root)
FSI_CSV_PATH = os.path.join(BASE_DIR, "fsi.csv")
BTC_TREND_CSV_PATH = os.path.join(BASE_DIR, "btc_trend.csv")

# FSI column mapping
FSI_PREFERRED_COLUMN = "composite_index"

# Profile → trend signal mapping
PROFILE_MAP = {
    "Conservative": "signal_alpha",
    "Moderate": "signal_beta",
    "Aggressive": "signal_gamma",
}

PROFILE_BIAS = {
    "Conservative": -0.10,
    "Moderate": 0.00,
    "Aggressive": 0.10,
}

# Risk-on / risk-off baskets
RISK_ON = ["SPY", "QQQ", "IWM", "BTC-USD"]
RISK_OFF = ["TLT", "GLD", "IGOV"]

# Bridge universe (OBV confirmation) — all assets with price + volume data
OBV_UNIVERSE = {
    # Equities
    "S&P 500": "SPY",
    "Nasdaq 100": "QQQ",
    "Small Caps": "IWM",
    "S&P Growth": "SPYG",
    "S&P Value": "SPYV",
    # Crypto
    "Bitcoin": "BTC-USD",
    "Bitcoin ETF": "IBIT",
    # Bonds
    "20Y+ Treasuries": "TLT",
    "7-10Y Treasuries": "IEF",
    "US Agg Bond": "BND",
    "Int'l Bonds": "IGOV",
    "Short Treasury": "SHY",
    "Cash Equiv": "SHV",
    # Commodities
    "Gold": "GLD",
    "Silver": "SLV",
    "WTI Crude": "USO",
    "Brent Crude": "BNO",
    # International
    "Japan": "EWJ",
    "Europe": "SPEU",
    "EM Asia": "EEMA",
    "Latin America": "ILF",
    # Sectors
    "Financials": "XLF",
    "Health Care": "XLV",
    "Cons Discret": "XLY",
    "Comm Services": "XLC",
    "Energy": "XLE",
    "Industrials": "XLI",
    "Technology": "XLK",
    "Utilities": "XLU",
    "Materials": "XLB",
    "Real Estate": "XLRE",
    "Staples": "XLP",
}

# RRG settings
RRG_BENCHMARK = "SPY"
RRG_CROSS_ASSETS = ["QQQ", "SPYG", "IWM", "IBIT", "GLD", "SLV", "IEF", "TLT", "BND", "ILF", "EWJ", "EEMA"]

# Rolling windows
FAST_MA = 20
SLOW_MA = 50
FSI_Z_WIN = 126
CRYPTO_Z_WIN = 126
ROT_LOOKBACK = 20
BETA_WINDOW = 60
OBV_SMA_LEN = 20
ROC_LEN = 5
RRG_RATIO_SPAN = 20
RRG_MOM_SPAN = 10

# Freshness controls
STRUCTURAL_FFILL_LIMIT = 45   # business-cycle cadence is monthly → allow ~45d reach-forward
FSI_FFILL_LIMIT = 10
TREND_FFILL_LIMIT = 5
BRIDGE_FFILL_LIMIT = 10

# State machine
STATE_ORDER = ["Defensive", "Fragile", "Recovery", "Expansion"]
STATE_SCORE_MAP = {"Defensive": -0.75, "Fragile": -0.25, "Recovery": 0.25, "Expansion": 0.75}
CONF_ORDER = ["Low", "Medium", "High"]
CONF_SCORE_MAP = {"Low": -0.35, "Medium": 0.0, "High": 0.35}
BRIDGE_CONF_MAP = CONF_SCORE_MAP   # backwards-compatible alias

UPGRADE_CONFIRM_DAYS = 3
DOWNGRADE_CONFIRM_DAYS = 1

# Structural smoothing is applied on the native (monthly) business-cycle cadence
STRUCTURAL_UPGRADE_PERIODS = 2
STRUCTURAL_DOWNGRADE_PERIODS = 1

# Beta z-score window for bridge layer
BETA_Z_WIN = 126

# Structural governor — caps/floors the candidate final state given the structural regime.
# Key: structural_confidence → structural_state → max allowed final state (cap) or min (floor)
STRUCTURAL_CAPS = {
    "High":   {"Defensive": "Fragile",   "Fragile": "Recovery",  "Recovery": "Expansion", "Expansion": "Expansion"},
    "Medium": {"Defensive": "Recovery",  "Fragile": "Expansion", "Recovery": "Expansion", "Expansion": "Expansion"},
    "Low":    {"Defensive": "Expansion", "Fragile": "Expansion", "Recovery": "Expansion", "Expansion": "Expansion"},
}
STRUCTURAL_FLOORS = {
    "High":   {"Defensive": "Defensive", "Fragile": "Defensive", "Recovery": "Fragile",   "Expansion": "Fragile"},
    "Medium": {"Defensive": "Defensive", "Fragile": "Defensive", "Recovery": "Defensive", "Expansion": "Defensive"},
    "Low":    {"Defensive": "Defensive", "Fragile": "Defensive", "Recovery": "Defensive", "Expansion": "Defensive"},
}

# Horizon weights — v2 has four layers: structural / market / crypto / bridge
HORIZON_WEIGHTS = {
    "Short term": {"structural": 0.20, "market": 0.25, "crypto": 0.40, "bridge": 0.15},
    "Mid term":   {"structural": 0.30, "market": 0.25, "crypto": 0.30, "bridge": 0.15},
    "Long term":  {"structural": 0.40, "market": 0.20, "crypto": 0.30, "bridge": 0.10},
}

# Sleeve allocation base weights
BASE_SLEEVES = {
    "Defensive": {"Safety": 0.55, "Growth": 0.20, "Tactical": 0.05, "Cash_or_Ballast": 0.20},
    "Fragile":   {"Safety": 0.45, "Growth": 0.30, "Tactical": 0.10, "Cash_or_Ballast": 0.15},
    "Recovery":  {"Safety": 0.35, "Growth": 0.45, "Tactical": 0.10, "Cash_or_Ballast": 0.10},
    "Expansion": {"Safety": 0.25, "Growth": 0.55, "Tactical": 0.15, "Cash_or_Ballast": 0.05},
}

PROFILE_SLEEVE_ADJ = {
    "Conservative": {"Safety": +0.10, "Growth": -0.10, "Tactical": 0.00, "Cash_or_Ballast": 0.00},
    "Moderate":     {"Safety":  0.00, "Growth":  0.00, "Tactical": 0.00, "Cash_or_Ballast": 0.00},
    "Aggressive":   {"Safety": -0.10, "Growth": +0.10, "Tactical": 0.00, "Cash_or_Ballast": 0.00},
}

HORIZON_SLEEVE_ADJ = {
    "Short term": {"Safety": 0.00, "Growth": -0.05, "Tactical": +0.05, "Cash_or_Ballast": 0.00},
    "Mid term":   {"Safety": 0.00, "Growth":  0.00, "Tactical":  0.00, "Cash_or_Ballast": 0.00},
    "Long term":  {"Safety": 0.00, "Growth": +0.05, "Tactical": -0.05, "Cash_or_Ballast": 0.00},
}

# RRG growth vs defensive classification
RRG_GROWTH_LIKE = {"QQQ", "SPYG", "IWM", "IBIT", "XLK", "XLC", "XLI"}
RRG_DEFENSIVE_LIKE = {"GLD", "SLV", "TLT", "IEF", "BND", "XLU", "XLP"}

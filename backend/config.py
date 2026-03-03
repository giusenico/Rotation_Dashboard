"""
Backend configuration — imports from the root config module and adds
backend-specific settings (CORS, caching).
"""

import os
import sys

# Allow importing from the project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import (  # noqa: E402
    SUPABASE_DB_URL,
    SECTOR_ETFS,
    CROSS_ASSET_ETFS,
    BENCHMARK,
    ALL_TICKERS,
    CATEGORIES,
    TICKER_CATEGORY_MAP,
)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

# In-memory cache TTL (seconds)
CACHE_TTL = int(os.getenv("CACHE_TTL", "3600"))

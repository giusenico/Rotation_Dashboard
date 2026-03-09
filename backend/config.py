"""
Backend configuration — imports from the root config module and adds
backend-specific settings (CORS, caching).
"""

import os
import sys
import json

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


def _parse_cors_origins(raw: str) -> list[str]:
    value = raw.strip()
    if not value:
        return []

    if value.startswith("["):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        if isinstance(parsed, list):
            return [item.strip() for item in parsed if isinstance(item, str) and item.strip()]
        return []

    return [o.strip() for o in value.split(",") if o.strip()]


CORS_ORIGINS = _parse_cors_origins(os.getenv("CORS_ORIGINS", "http://localhost:5173"))

# In-memory cache TTL (seconds)
CACHE_TTL = int(os.getenv("CACHE_TTL", "3600"))

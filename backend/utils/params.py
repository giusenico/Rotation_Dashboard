"""Helpers for request parameter parsing."""

from __future__ import annotations


def normalize_symbol(symbol: str | None, *, uppercase: bool = True) -> str:
    """Normalize a single symbol from query/path parameters."""
    if symbol is None:
        return ""
    normalized = symbol.strip()
    return normalized.upper() if uppercase else normalized


def parse_symbol_list(
    value: str | None,
    *,
    uppercase: bool = True,
    dedupe: bool = True,
) -> list[str]:
    """Parse comma-separated symbol lists from requests.

    Behaviour:
    - ignores empty items and whitespace
    - optionally normalizes case
    - optionally removes duplicates, preserving first-seen order
    """
    if value is None:
        return []

    symbols = [s.strip() for s in value.split(",") if s.strip()]
    if uppercase:
        symbols = [s.upper() for s in symbols]

    if not dedupe:
        return symbols

    unique: list[str] = []
    seen: set[str] = set()
    for sym in symbols:
        if sym not in seen:
            unique.append(sym)
            seen.add(sym)
    return unique

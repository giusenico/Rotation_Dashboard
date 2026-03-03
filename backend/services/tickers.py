"""Ticker and category metadata queries."""

from __future__ import annotations


def get_all_tickers(conn, category: str | None = None) -> list[dict]:
    """Return all tickers joined with their category name."""
    query = """
        SELECT t.symbol, t.name, ac.name AS category, t.currency, t.exchange
        FROM tickers t
        JOIN asset_categories ac ON t.category_id = ac.id
    """
    params: list = []
    if category:
        query += " WHERE ac.name = %s"
        params.append(category)
    query += " ORDER BY ac.id, t.symbol"

    with conn.cursor() as cur:
        cur.execute(query, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_ticker_detail(conn, symbol: str) -> dict | None:
    """Return a single ticker with category name."""
    query = """
        SELECT t.symbol, t.name, ac.name AS category, t.currency, t.exchange
        FROM tickers t
        JOIN asset_categories ac ON t.category_id = ac.id
        WHERE t.symbol = %s
    """
    with conn.cursor() as cur:
        cur.execute(query, [symbol])
        row = cur.fetchone()
        if row is None:
            return None
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, row))


def get_categories(conn) -> list[dict]:
    """Return all asset categories."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, name FROM asset_categories ORDER BY id")
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

"""Price data queries, performance computation, drawdown, and correlation."""

from __future__ import annotations

from datetime import date, timedelta
import logging

import pandas as pd
import numpy as np

from backend.config import ALL_TICKERS, TICKER_CATEGORY_MAP

logger = logging.getLogger(__name__)


def _empty_performance_entry(sym: str) -> dict:
    return {
        "ticker": sym,
        "name": ALL_TICKERS.get(sym, sym),
        "category": TICKER_CATEGORY_MAP.get(sym, ""),
        "return_1w": None,
        "return_1m": None,
        "return_3m": None,
        "return_6m": None,
        "return_ytd": None,
        "return_1y": None,
    }


def get_price_series(
    conn,
    symbol: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    """Fetch daily OHLCV for a single ticker with optional date filtering."""
    if not symbol:
        return []
    query = "SELECT date, open, high, low, close, adj_close, volume FROM daily_prices WHERE symbol = %s"
    params: list = [symbol]

    if start_date:
        query += " AND date >= %s"
        params.append(start_date)
    if end_date:
        query += " AND date <= %s"
        params.append(end_date)

    query += " ORDER BY date"
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception:
        logger.exception("Failed to fetch price series for symbol=%s", symbol)
        return []


def get_multi_price_series(
    conn,
    symbols: list[str],
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, list[dict]]:
    """Fetch daily prices for multiple tickers."""
    if not symbols:
        return {}
    result = {}
    for sym in symbols:
        result[sym] = get_price_series(conn, sym, start_date, end_date)
    return result


def get_latest_date(conn) -> str:
    """Return the most recent date in the database."""
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT MAX(date) FROM daily_prices")
            row = cur.fetchone()
            return row[0] if row and row[0] else ""
    except Exception:
        logger.exception("Failed to fetch latest trading date")
        return ""


def compute_performance(conn, symbols: list[str]) -> list[dict]:
    """Compute percentage returns over standard periods."""
    if not symbols:
        return []

    today = date.today()
    periods = {
        "return_1w": 7,
        "return_1m": 30,
        "return_3m": 91,
        "return_6m": 182,
        "return_1y": 365,
    }

    # Determine YTD start
    ytd_start = date(today.year, 1, 1).isoformat()

    results = []
    for sym in symbols:
        try:
            # Fetch all prices for this ticker (last 1 year + buffer)
            start = (today - timedelta(days=400)).isoformat()
            prices = get_price_series(conn, sym, start_date=start)
            if not prices:
                results.append(_empty_performance_entry(sym))
                continue

            df = pd.DataFrame(prices)
            df["date"] = pd.to_datetime(df["date"])
            df = df.set_index("date").sort_index()

            latest_price = df["adj_close"].iloc[-1]
            entry: dict = _empty_performance_entry(sym)

            for key, days in periods.items():
                target_date = today - timedelta(days=days)
                mask = df.index >= pd.Timestamp(target_date)
                subset = df.loc[mask]
                if len(subset) > 0 and subset["adj_close"].iloc[0] != 0:
                    entry[key] = round(
                        float((latest_price / subset["adj_close"].iloc[0] - 1) * 100), 2
                    )
                else:
                    entry[key] = None

            # YTD
            mask_ytd = df.index >= pd.Timestamp(ytd_start)
            subset_ytd = df.loc[mask_ytd]
            if len(subset_ytd) > 0 and subset_ytd["adj_close"].iloc[0] != 0:
                entry["return_ytd"] = round(
                    float((latest_price / subset_ytd["adj_close"].iloc[0] - 1) * 100), 2
                )
            else:
                entry["return_ytd"] = None

            results.append(entry)
        except Exception:
            logger.exception("Failed to compute performance for symbol=%s", sym)
            results.append(_empty_performance_entry(sym))

    return results


def compute_drawdown(
    conn,
    symbol: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    """Compute drawdown-from-peak series."""
    if not symbol:
        return []
    prices = get_price_series(conn, symbol, start_date, end_date)
    if not prices:
        return []

    df = pd.DataFrame(prices)
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()

    cummax = df["adj_close"].cummax()
    drawdown = (df["adj_close"] / cummax - 1) * 100

    return [
        {"date": idx.strftime("%Y-%m-%d"), "drawdown": round(float(v), 4)}
        for idx, v in drawdown.items()
    ]


def compute_correlation(
    conn,
    symbols: list[str],
    lookback_days: int = 252,
) -> dict:
    """Compute pairwise correlation matrix of daily returns."""
    if not symbols:
        return {"symbols": [], "matrix": []}
    today = date.today()
    start = (today - timedelta(days=int(lookback_days * 1.5))).isoformat()

    # Fetch adj_close for all symbols
    all_data = {}
    for sym in symbols:
        try:
            prices = get_price_series(conn, sym, start_date=start)
            if prices:
                df = pd.DataFrame(prices)[["date", "adj_close"]]
                df["date"] = pd.to_datetime(df["date"])
                df = df.set_index("date")
                all_data[sym] = df["adj_close"]
        except Exception:
            logger.exception("Failed to fetch correlation data for symbol=%s", sym)

    if len(all_data) < 2:
        return {"symbols": symbols, "matrix": []}

    try:
        combined = pd.DataFrame(all_data).sort_index().tail(lookback_days)
        returns = combined.pct_change().dropna()

        corr = returns.corr()
        # Ensure consistent ordering
        ordered_symbols = [s for s in symbols if s in corr.columns]
        corr = corr.reindex(index=ordered_symbols, columns=ordered_symbols)
        matrix = corr.fillna(0).values.tolist()
        matrix = [[round(v, 4) for v in row] for row in matrix]

        return {"symbols": ordered_symbols, "matrix": matrix}
    except Exception:
        logger.exception("Failed to compute correlation matrix")
        return {"symbols": symbols, "matrix": []}

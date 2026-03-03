"""Pydantic response models for the Rotation Dashboard API."""

from pydantic import BaseModel


# ── Tickers ──────────────────────────────────────────────────────────

class TickerInfo(BaseModel):
    symbol: str
    name: str
    category: str
    currency: str | None = None
    exchange: str | None = None


class CategoryInfo(BaseModel):
    id: int
    name: str


# ── RRG ──────────────────────────────────────────────────────────────

class RRGPoint(BaseModel):
    ticker: str
    name: str
    date: str
    ratio: float
    momentum: float


class RRGResponse(BaseModel):
    benchmark: str
    benchmark_name: str
    as_of_date: str
    trail_length: int
    tickers: list[str]
    data: list[RRGPoint]


class RankingEntry(BaseModel):
    rank: int
    ticker: str
    name: str
    category: str
    ratio: float
    momentum: float
    score: float
    quadrant: str


# ── Prices ───────────────────────────────────────────────────────────

class PricePoint(BaseModel):
    date: str
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    adj_close: float | None = None
    volume: int | None = None


class PriceResponse(BaseModel):
    symbol: str
    name: str
    data: list[PricePoint]


class PerformanceEntry(BaseModel):
    ticker: str
    name: str
    category: str
    return_1w: float | None = None
    return_1m: float | None = None
    return_3m: float | None = None
    return_6m: float | None = None
    return_ytd: float | None = None
    return_1y: float | None = None


class CorrelationResponse(BaseModel):
    symbols: list[str]
    matrix: list[list[float]]


class DrawdownPoint(BaseModel):
    date: str
    drawdown: float


class DrawdownResponse(BaseModel):
    symbol: str
    name: str
    data: list[DrawdownPoint]


# ── Dashboard ────────────────────────────────────────────────────────

class DashboardSummary(BaseModel):
    total_tickers: int
    latest_date: str
    sector_leader: RankingEntry | None = None
    cross_asset_leader: RankingEntry | None = None
    sp500_return_ytd: float | None = None

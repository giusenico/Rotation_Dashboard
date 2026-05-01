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
    # Optional crypto-universe extras (populated only for /rankings/crypto):
    display_symbol: str | None = None   # "BTC" — for crypto rows; tickers use `ticker`
    logo_url: str | None = None
    style_bucket: str | None = None
    market_cap: int | None = None
    asset_type: str = "ticker"           # "ticker" | "crypto" — frontend discriminator


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


# ── OBV Structure ───────────────────────────────────────────────────

class OBVSpreadPoint(BaseModel):
    date: str
    value: float


class OBVScorePoint(BaseModel):
    date: str
    rotation_score: float | None = None
    obv_regime: str


class OBVScoreHistoryEntry(BaseModel):
    symbol: str
    asset: str
    data: list[OBVScorePoint]


class OBVStructureEntry(BaseModel):
    asset: str
    symbol: str
    obv_regime: str
    rotation_score: float | None = None
    spread_percentile: float | None = None
    spread_momentum_z: float | None = None
    return_1m: float | None = None
    return_3m: float | None = None
    return_6m: float | None = None
    return_ytd: float | None = None
    # Trigger levels derived from recent swing high / low of the close
    # series (≈1m window, padded ±0.5% when the latest bar prints the
    # extreme so the level stays actionable).
    last_price: float | None = None
    confirmation_price: float | None = None
    invalidation_price: float | None = None
    market_cap: int | None = None
    style_bucket: str | None = None
    spread_series: list[OBVSpreadPoint]
    # Bars (≈days at daily timeframe) the asset has stayed in its current
    # OBV regime — drives the "freshness" sort for the framework table.
    days_in_regime: int | None = None
    # Optional crypto-universe extras:
    display_symbol: str | None = None   # "BTC" for crypto rows; None for tickers
    logo_url: str | None = None
    asset_type: str = "ticker"           # "ticker" | "crypto"
    # Optional inline score history (crypto path only — tickers use the
    # separate /flow/score-history endpoint backed by obv_daily_metrics).
    score_history: list[OBVScorePoint] | None = None


class OBVDetailScorePoint(BaseModel):
    date: str
    rotation_score: float | None = None
    obv_regime: str
    spread_last: float | None = None


class OBVDetailResponse(BaseModel):
    symbol: str
    asset: str
    obv_regime: str
    last_price: float | None = None
    rotation_score: float | None = None
    spread_percentile: float | None = None
    spread_momentum_z: float | None = None
    return_1m: float | None = None
    return_3m: float | None = None
    return_6m: float | None = None
    return_ytd: float | None = None
    obv_series: list[OBVSpreadPoint]
    spread_series: list[OBVSpreadPoint]
    score_history: list[OBVDetailScorePoint]
    # Optional crypto-universe extras:
    display_symbol: str | None = None
    logo_url: str | None = None
    asset_type: str = "ticker"


# ── Crypto Top 20 (global mcap, CoinGecko) ──────────────────────────

class CryptoTop20Entry(BaseModel):
    id: str
    symbol: str
    name: str
    style_bucket: str | None = None
    logo_url: str | None = None
    snapshot_date: str | None = None
    rank: int
    market_cap: int | None = None
    price: float | None = None
    change_24h: float | None = None
    change_7d: float | None = None
    volume_24h: int | None = None


class CryptoHistoryPoint(BaseModel):
    date: str | None = None
    market_cap: int | None = None
    price: float | None = None


# ── Dashboard ────────────────────────────────────────────────────────

class DashboardSummary(BaseModel):
    total_tickers: int
    latest_date: str
    sector_leader: RankingEntry | None = None
    cross_asset_leader: RankingEntry | None = None
    sp500_return_ytd: float | None = None
    sp500_sparkline: list[float] = []


# ── Market Regime ───────────────────────────────────────────────────

class RegimeSummaryEntry(BaseModel):
    symbol: str
    asset: str
    category: str
    last_price: float | None = None
    regime: int
    regime_label: str
    overextension: float | None = None
    overext_label: str
    capital_flow_z: float | None = None
    flow_label: str
    sma_value: float | None = None
    # Optional crypto-universe extras:
    display_symbol: str | None = None
    logo_url: str | None = None
    asset_type: str = "ticker"
    style_bucket: str | None = None     # PSM sleeve (crypto only)


class RegimeTimePoint(BaseModel):
    date: str
    value: float | None = None


class RegimePricePoint(BaseModel):
    date: str
    close: float | None = None
    sma: float | None = None


class RegimeDetailResponse(BaseModel):
    symbol: str
    asset: str
    last_price: float | None = None
    regime_current: int
    overext_current: float | None = None
    overext_threshold: float
    flow_z_current: float | None = None
    flow_threshold: float
    price_series: list[RegimePricePoint]
    regime_series: list[RegimeTimePoint]
    overext_series: list[RegimeTimePoint]
    flow_series: list[RegimeTimePoint]
    # Optional crypto-universe extras:
    display_symbol: str | None = None
    logo_url: str | None = None
    asset_type: str = "ticker"


# ── Volatility ──────────────────────────────────────────────────────

class VolatilitySummary(BaseModel):
    vix_last: float | None = None
    vix3m_last: float | None = None
    sp500_last: float | None = None
    vix_ratio: float | None = None
    ratio_ma50: float | None = None
    vix_oscillator: float | None = None
    ratio_oscillator: float | None = None
    signal: str  # "buy" | "sell" | "caution" | "neutral"
    position: str  # "invested" | "cash"
    as_of_date: str


class VolatilityPricePoint(BaseModel):
    date: str
    vix: float | None = None
    vix3m: float | None = None


class VolatilityOscPoint(BaseModel):
    date: str
    vix_osc: float | None = None
    ratio_osc: float | None = None


class VolatilityRatioPoint(BaseModel):
    date: str
    ratio: float | None = None
    ratio_ma50: float | None = None


class BacktestPoint(BaseModel):
    date: str
    strategy: float | None = None
    benchmark: float | None = None
    position: int = 0


class VolatilityDetailResponse(BaseModel):
    summary: VolatilitySummary
    vix_series: list[VolatilityPricePoint]
    oscillator_series: list[VolatilityOscPoint]
    ratio_series: list[VolatilityRatioPoint]
    backtest_series: list[BacktestPoint]



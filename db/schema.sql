-- ============================================================
-- Rotation Dashboard — Database Schema (PostgreSQL / Supabase)
-- ============================================================
-- Tables:
--   1. asset_categories    – logical grouping of instruments
--   2. tickers             – instrument metadata
--   3. daily_prices        – OHLCV + adjusted close time-series
--   4. obv_daily_metrics   – OBV structure scores (daily)
-- ============================================================

-- Categories for classifying tracked instruments
CREATE TABLE IF NOT EXISTS asset_categories (
    id      INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name    TEXT    NOT NULL UNIQUE
);

-- Metadata for each tracked ticker
CREATE TABLE IF NOT EXISTS tickers (
    symbol      TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    category_id INTEGER NOT NULL REFERENCES asset_categories (id),
    currency    TEXT,
    exchange    TEXT
);

-- Daily OHLCV price data
CREATE TABLE IF NOT EXISTS daily_prices (
    id        INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    symbol    TEXT    NOT NULL REFERENCES tickers (symbol),
    date      TEXT    NOT NULL,   -- ISO-8601 format (YYYY-MM-DD)
    open      DOUBLE PRECISION,
    high      DOUBLE PRECISION,
    low       DOUBLE PRECISION,
    close     DOUBLE PRECISION,
    adj_close DOUBLE PRECISION,
    volume    BIGINT,
    UNIQUE (symbol, date)
);

-- Index for fast lookups by symbol and date range (DESC for time-series queries)
CREATE INDEX IF NOT EXISTS idx_daily_prices_symbol_date
    ON daily_prices (symbol, date DESC);

-- OBV structure metrics (computed daily for cross-asset ETFs)
CREATE TABLE IF NOT EXISTS obv_daily_metrics (
    date            DATE    NOT NULL,
    symbol          TEXT    NOT NULL,
    obv_regime      TEXT    NOT NULL,   -- 'buy' | 'sell'
    spread_last     REAL,               -- raw spread value (OBV - SMA)
    spread_pct      REAL,               -- percentile rank [-1, +1]
    momentum_z      REAL,               -- tanh z-score momentum
    rotation_score  REAL,               -- composite score [-1, +1]
    PRIMARY KEY (date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_obv_metrics_symbol_date
    ON obv_daily_metrics (symbol, date DESC);

-- ============================================================
-- Rotation Dashboard — Database Schema (PostgreSQL / Supabase)
-- ============================================================
-- Tables:
--   1. asset_categories    – logical grouping of instruments
--   2. tickers             – instrument metadata
--   3. daily_prices        – OHLCV + adjusted close time-series
--   4. obv_daily_metrics   – OBV structure scores (daily)
--   5. intraday_prices_4h  – 4-hour OHLCV candles
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
    symbol    TEXT    NOT NULL REFERENCES tickers (symbol),
    date      TEXT    NOT NULL,   -- ISO-8601 format (YYYY-MM-DD)
    open      DOUBLE PRECISION,
    high      DOUBLE PRECISION,
    low       DOUBLE PRECISION,
    close     DOUBLE PRECISION,
    adj_close DOUBLE PRECISION,
    volume    BIGINT,
    PRIMARY KEY (symbol, date)
);

-- Intraday 4-hour OHLCV data (resampled from 1h Yahoo Finance data)
CREATE TABLE IF NOT EXISTS intraday_prices_4h (
    symbol    TEXT    NOT NULL REFERENCES tickers (symbol),
    datetime  TIMESTAMPTZ NOT NULL,
    open      DOUBLE PRECISION,
    high      DOUBLE PRECISION,
    low       DOUBLE PRECISION,
    close     DOUBLE PRECISION,
    volume    BIGINT,
    PRIMARY KEY (symbol, datetime)
);

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

-- Macro Risk-On/Off pre-computed results (JSONB blobs)
CREATE TABLE IF NOT EXISTS macro_daily_cache (
    date    TEXT    NOT NULL,   -- ISO-8601 (YYYY-MM-DD)
    key     TEXT    NOT NULL,   -- e.g. 'hero_7', 'hero_14', 'history_300'
    value   JSONB   NOT NULL,  -- full API response payload
    PRIMARY KEY (date, key)
);

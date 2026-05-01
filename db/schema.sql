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
    symbol       TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL,
    category_id  INTEGER NOT NULL REFERENCES asset_categories (id),
    currency     TEXT,
    exchange     TEXT,
    market_cap   BIGINT,                        -- AUM for ETFs, mcap for crypto; updated daily by fetch_data.py
    style_bucket TEXT CHECK (style_bucket IS NULL OR style_bucket IN ('growth', 'safety', 'tactical'))
);
CREATE INDEX IF NOT EXISTS idx_tickers_style_bucket ON tickers (style_bucket) WHERE style_bucket IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickers_market_cap   ON tickers (market_cap DESC NULLS LAST) WHERE market_cap IS NOT NULL;

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

-- ============================================================
-- PSM Framework tables
-- ============================================================

-- Financial Stress Index daily values (from CSV import)
CREATE TABLE IF NOT EXISTS fsi_daily (
    date              DATE    NOT NULL PRIMARY KEY,
    signal_a          DOUBLE PRECISION,   -- sub-signal component A
    signal_b          DOUBLE PRECISION,   -- sub-signal component B
    signal_c          DOUBLE PRECISION,   -- sub-signal component C
    composite_index   DOUBLE PRECISION    -- weighted composite
);

-- BTC trend signals daily (from CSV or future API)
CREATE TABLE IF NOT EXISTS btc_trend_daily (
    date              DATE    NOT NULL PRIMARY KEY,
    signal_alpha      DOUBLE PRECISION,   -- conservative trend
    signal_beta       DOUBLE PRECISION,   -- moderate trend
    signal_gamma      DOUBLE PRECISION    -- aggressive trend
);

-- Business cycle state table (upstream: v11 framework notebook, FRED-sourced CLI data)
-- Monthly cadence, loaded via scripts/load_business_cycle.py
CREATE TABLE IF NOT EXISTS business_cycle_daily (
    date                      DATE    NOT NULL PRIMARY KEY,
    leading_cli               DOUBLE PRECISION,
    leading_mom3              DOUBLE PRECISION,
    leading_ann6              DOUBLE PRECISION,
    leading_diff6             DOUBLE PRECISION,
    leading_coverage_pct      DOUBLE PRECISION,
    coincident_cli            DOUBLE PRECISION,
    coincident_mom3           DOUBLE PRECISION,
    coincident_ann6           DOUBLE PRECISION,
    coincident_diff6          DOUBLE PRECISION,
    coincident_coverage_pct   DOUBLE PRECISION,
    lagging_cli               DOUBLE PRECISION,
    lagging_mom3              DOUBLE PRECISION,
    lagging_ann6              DOUBLE PRECISION,
    lagging_diff6             DOUBLE PRECISION,
    lagging_coverage_pct      DOUBLE PRECISION,
    phase                     TEXT,
    activity_state            TEXT,
    phase_strength_score      DOUBLE PRECISION,
    recession_risk_score      DOUBLE PRECISION,
    recession_overlay         TEXT,
    p_recovery                DOUBLE PRECISION,
    p_expansion               DOUBLE PRECISION,
    p_downturn                DOUBLE PRECISION,
    p_slowdown                DOUBLE PRECISION,
    phase_probability         DOUBLE PRECISION,
    phase_confidence_score    DOUBLE PRECISION,
    cycle_sync_score          DOUBLE PRECISION,
    transition_risk_score     DOUBLE PRECISION,
    lead_coincident_ann6_gap  DOUBLE PRECISION,
    headline_state            TEXT,
    growth_regime             TEXT,
    macro_stance              TEXT,
    readable_headline         TEXT
);

-- PSM daily computed states (one row per date × profile × horizon)
-- v2: structural_state replaces macro_state; market_state is a new explicit layer
CREATE TABLE IF NOT EXISTS psm_daily (
    date                   DATE    NOT NULL,
    profile                TEXT    NOT NULL,   -- 'Conservative' | 'Moderate' | 'Aggressive'
    horizon                TEXT    NOT NULL,   -- 'Short term' | 'Mid term' | 'Long term'
    structural_state       TEXT,               -- 'Defensive' | 'Fragile' | 'Recovery' | 'Expansion'
    structural_confidence  TEXT,               -- 'Low' | 'Medium' | 'High'
    market_state           TEXT,               -- 'Risk-Off' | 'Neutral' | 'Risk-On'
    crypto_state           TEXT,
    bridge_confidence      TEXT,               -- 'Low' | 'Medium' | 'High'
    overall_confidence     TEXT,
    structural_component   DOUBLE PRECISION,
    market_component       DOUBLE PRECISION,
    crypto_component       DOUBLE PRECISION,
    bridge_component       DOUBLE PRECISION,
    bias_component         DOUBLE PRECISION,
    penalty_component      DOUBLE PRECISION,
    boost_component        DOUBLE PRECISION,
    prelim_score           DOUBLE PRECISION,
    prelim_state           TEXT,
    candidate_state        TEXT,
    setup_class            TEXT,
    final_state            TEXT,
    final_score            DOUBLE PRECISION,
    action_bucket          TEXT,
    deployment_level       DOUBLE PRECISION,
    deployment_label       TEXT,
    sleeve_safety          DOUBLE PRECISION,
    sleeve_growth          DOUBLE PRECISION,
    sleeve_tactical        DOUBLE PRECISION,
    sleeve_cash            DOUBLE PRECISION,
    bullish_prob           DOUBLE PRECISION,
    neutral_prob           DOUBLE PRECISION,
    bearish_prob           DOUBLE PRECISION,
    recommendation         TEXT,
    mismatch_note          TEXT,
    bridge_note            TEXT,
    upgrade_trigger        TEXT,
    downgrade_trigger      TEXT,
    PRIMARY KEY (date, profile, horizon)
);

-- PSM intermediate layer data (one row per date — all four v2 layers denormalized)
CREATE TABLE IF NOT EXISTS psm_layers_daily (
    date                     DATE    NOT NULL PRIMARY KEY,
    -- Layer 0: Structural (business cycle)
    structural_state_raw     TEXT,
    structural_state         TEXT,
    structural_confidence    TEXT,
    structural_score_raw     DOUBLE PRECISION,
    structural_score         DOUBLE PRECISION,
    structural_quality_score DOUBLE PRECISION,
    phase                    TEXT,
    growth_regime            TEXT,
    macro_stance             TEXT,
    recession_overlay        TEXT,
    phase_confidence_score   DOUBLE PRECISION,
    cycle_sync_score         DOUBLE PRECISION,
    transition_risk_score    DOUBLE PRECISION,
    recession_risk_score     DOUBLE PRECISION,
    -- Layer 1: Market expression
    fsi_raw                  DOUBLE PRECISION,
    fsi_oriented             DOUBLE PRECISION,
    fsi_z                    DOUBLE PRECISION,
    fsi_slope_20             DOUBLE PRECISION,
    fsi_score                DOUBLE PRECISION,
    unified_log              DOUBLE PRECISION,
    unified_score            DOUBLE PRECISION,
    delta_to_risk_on         DOUBLE PRECISION,
    rotation_score           DOUBLE PRECISION,
    market_regime            TEXT,
    market_score_raw         DOUBLE PRECISION,
    market_state_raw         TEXT,
    market_state             TEXT,
    market_score             DOUBLE PRECISION,
    -- Layer 2: Crypto (per-profile)
    signal_alpha             DOUBLE PRECISION,   -- Conservative BTC trend
    signal_beta              DOUBLE PRECISION,   -- Moderate BTC trend
    signal_gamma             DOUBLE PRECISION,   -- Aggressive BTC trend
    conservative_crypto_score_raw  DOUBLE PRECISION,
    conservative_crypto_state_raw  TEXT,
    conservative_crypto_state      TEXT,
    conservative_crypto_score      DOUBLE PRECISION,
    moderate_crypto_score_raw      DOUBLE PRECISION,
    moderate_crypto_state_raw      TEXT,
    moderate_crypto_state          TEXT,
    moderate_crypto_score          DOUBLE PRECISION,
    aggressive_crypto_score_raw    DOUBLE PRECISION,
    aggressive_crypto_state_raw    TEXT,
    aggressive_crypto_state        TEXT,
    aggressive_crypto_score        DOUBLE PRECISION,
    -- Layer 3: Bridge
    obv_score                DOUBLE PRECISION,
    obv_risk_confirmation    DOUBLE PRECISION,
    beta_btc_to_nasdaq       DOUBLE PRECISION,
    beta_btc_to_dxy          DOUBLE PRECISION,
    beta_context_score       DOUBLE PRECISION,
    rrg_sector_score         DOUBLE PRECISION,
    rrg_cross_score          DOUBLE PRECISION,
    rrg_score                DOUBLE PRECISION,
    bridge_score_raw         DOUBLE PRECISION,
    bridge_score             DOUBLE PRECISION,
    bridge_confidence        TEXT
);

-- PSM policy matrix (pre-computed lookup for all state combinations)
CREATE TABLE IF NOT EXISTS psm_policy_matrix (
    profile                TEXT    NOT NULL,
    horizon                TEXT    NOT NULL,
    structural_state       TEXT    NOT NULL,
    crypto_state           TEXT    NOT NULL,
    bridge_confidence      TEXT    NOT NULL,
    setup_class            TEXT,
    final_state            TEXT,
    final_score            DOUBLE PRECISION,
    overall_confidence     TEXT,
    action_bucket          TEXT,
    deployment_level       DOUBLE PRECISION,
    deployment_label       TEXT,
    sleeve_safety          DOUBLE PRECISION,
    sleeve_growth          DOUBLE PRECISION,
    sleeve_tactical        DOUBLE PRECISION,
    sleeve_cash            DOUBLE PRECISION,
    bullish_prob           DOUBLE PRECISION,
    neutral_prob           DOUBLE PRECISION,
    bearish_prob           DOUBLE PRECISION,
    recommendation         TEXT,
    mismatch_note          TEXT,
    bridge_note            TEXT,
    upgrade_trigger        TEXT,
    downgrade_trigger      TEXT,
    PRIMARY KEY (profile, horizon, structural_state, crypto_state, bridge_confidence)
);

-- ============================================================
-- Crypto Top 20 by Market Cap (global crypto universe, separate from
-- `tickers` — CoinGecko-sourced, daily snapshots for historical trend)
-- ============================================================

-- Static metadata for each crypto asset that has ever appeared in top-N.
-- Style bucket is assigned manually (NULL = new entrant awaiting review;
-- the card filters NULL out).
CREATE TABLE IF NOT EXISTS crypto_assets (
    id           TEXT    PRIMARY KEY,      -- CoinGecko id (e.g. 'bitcoin')
    symbol       TEXT    NOT NULL,         -- ticker (e.g. 'BTC')
    name         TEXT    NOT NULL,
    style_bucket TEXT    CHECK (style_bucket IS NULL OR style_bucket IN ('growth', 'safety', 'tactical')),
    logo_url     TEXT,
    created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crypto_assets_style_bucket ON crypto_assets (style_bucket) WHERE style_bucket IS NOT NULL;

-- Daily snapshots (one row per asset per day). Stablecoins and wrapped /
-- staked derivatives are excluded at fetch time to preserve signal quality
-- — they live in crypto_assets never here.
CREATE TABLE IF NOT EXISTS crypto_mcap_snapshots (
    snapshot_date   DATE    NOT NULL,
    asset_id        TEXT    NOT NULL REFERENCES crypto_assets (id),
    rank            INT     NOT NULL,                 -- position in the filtered top-N on that day
    market_cap      BIGINT,                            -- NULL on yfinance-backfilled history rows (pre-CoinGecko coverage)
    price           DOUBLE PRECISION,
    change_24h      DOUBLE PRECISION,                 -- % change over trailing 24h
    change_7d       DOUBLE PRECISION,                 -- % change over trailing 7d
    volume_24h      BIGINT,
    PRIMARY KEY (snapshot_date, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_crypto_snapshots_date_rank ON crypto_mcap_snapshots (snapshot_date, rank);

-- OBV structure metrics for the crypto universe — mirrors obv_daily_metrics
-- on the ticker side. Pre-computed by scripts/update_crypto_flow.py so the
-- /api/obv/crypto/structure endpoint becomes a pure SELECT (no cold-start
-- compute). Trailing returns live alongside the OBV scalars to keep one
-- row per (date, asset) self-contained.
CREATE TABLE IF NOT EXISTS crypto_obv_metrics (
    date            DATE    NOT NULL,
    asset_id        TEXT    NOT NULL REFERENCES crypto_assets (id),
    obv_regime      TEXT    NOT NULL,            -- 'buy' | 'sell'
    spread_last     REAL,                         -- raw spread (OBV - SMA)
    spread_pct      REAL,                         -- percentile rank [-1, +1]
    momentum_z      REAL,                         -- tanh z-score momentum
    rotation_score  REAL,                         -- composite [-1, +1]
    return_1m       REAL,
    return_3m       REAL,
    return_6m       REAL,
    return_ytd      REAL,
    PRIMARY KEY (date, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_crypto_obv_metrics_asset_date
    ON crypto_obv_metrics (asset_id, date DESC);

-- Seed initial classification. Idempotent via ON CONFLICT.
-- Buckets:
--   safety   — store-of-value, digital gold narrative
--   growth   — smart-contract L1/L2 platforms, infrastructure
--   tactical — exchange tokens, alt payments, DeFi, memes
INSERT INTO crypto_assets (id, symbol, name, style_bucket) VALUES
    ('bitcoin',        'BTC',   'Bitcoin',     'safety'),
    ('ethereum',       'ETH',   'Ethereum',    'growth'),
    ('solana',         'SOL',   'Solana',      'growth'),
    ('cardano',        'ADA',   'Cardano',     'growth'),
    ('avalanche-2',    'AVAX',  'Avalanche',   'growth'),
    ('polkadot',       'DOT',   'Polkadot',    'growth'),
    ('near',           'NEAR',  'NEAR Protocol', 'growth'),
    ('cosmos',         'ATOM',  'Cosmos Hub',  'growth'),
    ('sui',            'SUI',   'Sui',         'growth'),
    ('aptos',          'APT',   'Aptos',       'growth'),
    ('internet-computer', 'ICP', 'Internet Computer', 'growth'),
    ('hedera-hashgraph', 'HBAR', 'Hedera',     'growth'),
    ('arbitrum',       'ARB',   'Arbitrum',    'growth'),
    ('optimism',       'OP',    'Optimism',    'growth'),
    ('celestia',       'TIA',   'Celestia',    'growth'),
    ('sei-network',    'SEI',   'Sei',         'growth'),
    ('ripple',         'XRP',   'XRP',         'tactical'),
    ('binancecoin',    'BNB',   'BNB',         'tactical'),
    ('tron',           'TRX',   'TRON',        'tactical'),
    ('litecoin',       'LTC',   'Litecoin',    'tactical'),
    ('bitcoin-cash',   'BCH',   'Bitcoin Cash', 'tactical'),
    ('chainlink',      'LINK',  'Chainlink',   'tactical'),
    ('uniswap',        'UNI',   'Uniswap',     'tactical'),
    ('aave',           'AAVE',  'Aave',        'tactical'),
    ('dogecoin',       'DOGE',  'Dogecoin',    'tactical'),
    ('shiba-inu',      'SHIB',  'Shiba Inu',   'tactical'),
    ('pepe',           'PEPE',  'Pepe',        'tactical'),
    ('dogwifcoin',     'WIF',   'dogwifhat',   'tactical'),
    ('bonk',           'BONK',  'Bonk',        'tactical'),
    ('fetch-ai',       'FET',   'Fetch.ai',    'tactical'),
    ('monero',         'XMR',   'Monero',      'tactical'),
    ('zcash',          'ZEC',   'Zcash',       'tactical'),
    ('stellar',        'XLM',   'Stellar',     'tactical'),
    ('leo-token',      'LEO',   'LEO Token',   'tactical'),
    ('whitebit',       'WBT',   'WhiteBIT Coin', 'tactical'),
    ('hyperliquid',    'HYPE',  'Hyperliquid', 'tactical'),
    ('memecore',       'M',     'MemeCore',    'tactical'),
    ('canton-network', 'CC',    'Canton',      'growth')
ON CONFLICT (id) DO UPDATE SET
    symbol       = EXCLUDED.symbol,
    name         = EXCLUDED.name,
    style_bucket = EXCLUDED.style_bucket;

-- ============================================================
-- Migration v2: align existing deployments to the v2 PSM schema
-- Idempotent: safe to re-run. For clusters already on v1 only.
-- ============================================================
DO $$ BEGIN
    -- psm_daily v2 additive columns
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS structural_state TEXT;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS structural_confidence TEXT;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS market_state TEXT;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS structural_component DOUBLE PRECISION;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS market_component DOUBLE PRECISION;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS crypto_component DOUBLE PRECISION;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS bridge_component DOUBLE PRECISION;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS bias_component DOUBLE PRECISION;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS penalty_component DOUBLE PRECISION;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS boost_component DOUBLE PRECISION;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS prelim_score DOUBLE PRECISION;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS prelim_state TEXT;
    ALTER TABLE psm_daily ADD COLUMN IF NOT EXISTS candidate_state TEXT;

    -- psm_daily: drop dead v1 columns
    ALTER TABLE psm_daily DROP COLUMN IF EXISTS macro_state;
    ALTER TABLE psm_daily DROP COLUMN IF EXISTS stance;
    -- deployment_level is kept (v2 exposes it as a numeric for UI progress bars)

    -- psm_layers_daily: full rebuild (schema shape fundamentally changed)
    DROP TABLE IF EXISTS psm_layers_daily CASCADE;
    CREATE TABLE psm_layers_daily (
        date                     DATE    NOT NULL PRIMARY KEY,
        structural_state_raw     TEXT,
        structural_state         TEXT,
        structural_confidence    TEXT,
        structural_score_raw     DOUBLE PRECISION,
        structural_score         DOUBLE PRECISION,
        structural_quality_score DOUBLE PRECISION,
        phase                    TEXT,
        growth_regime            TEXT,
        macro_stance             TEXT,
        recession_overlay        TEXT,
        phase_confidence_score   DOUBLE PRECISION,
        cycle_sync_score         DOUBLE PRECISION,
        transition_risk_score    DOUBLE PRECISION,
        recession_risk_score     DOUBLE PRECISION,
        fsi_raw                  DOUBLE PRECISION,
        fsi_oriented             DOUBLE PRECISION,
        fsi_z                    DOUBLE PRECISION,
        fsi_slope_20             DOUBLE PRECISION,
        fsi_score                DOUBLE PRECISION,
        unified_log              DOUBLE PRECISION,
        unified_score            DOUBLE PRECISION,
        delta_to_risk_on         DOUBLE PRECISION,
        rotation_score           DOUBLE PRECISION,
        market_regime            TEXT,
        market_score_raw         DOUBLE PRECISION,
        market_state_raw         TEXT,
        market_state             TEXT,
        market_score             DOUBLE PRECISION,
        signal_alpha             DOUBLE PRECISION,
        signal_beta              DOUBLE PRECISION,
        signal_gamma             DOUBLE PRECISION,
        conservative_crypto_score_raw  DOUBLE PRECISION,
        conservative_crypto_state_raw  TEXT,
        conservative_crypto_state      TEXT,
        conservative_crypto_score      DOUBLE PRECISION,
        moderate_crypto_score_raw      DOUBLE PRECISION,
        moderate_crypto_state_raw      TEXT,
        moderate_crypto_state          TEXT,
        moderate_crypto_score          DOUBLE PRECISION,
        aggressive_crypto_score_raw    DOUBLE PRECISION,
        aggressive_crypto_state_raw    TEXT,
        aggressive_crypto_state        TEXT,
        aggressive_crypto_score        DOUBLE PRECISION,
        obv_score                DOUBLE PRECISION,
        obv_risk_confirmation    DOUBLE PRECISION,
        beta_btc_to_nasdaq       DOUBLE PRECISION,
        beta_btc_to_dxy          DOUBLE PRECISION,
        beta_context_score       DOUBLE PRECISION,
        rrg_sector_score         DOUBLE PRECISION,
        rrg_cross_score          DOUBLE PRECISION,
        rrg_score                DOUBLE PRECISION,
        bridge_score_raw         DOUBLE PRECISION,
        bridge_score             DOUBLE PRECISION,
        bridge_confidence        TEXT
    );

    -- psm_policy_matrix: rebuild with structural_state PK
    DROP TABLE IF EXISTS psm_policy_matrix CASCADE;
    CREATE TABLE psm_policy_matrix (
        profile                TEXT    NOT NULL,
        horizon                TEXT    NOT NULL,
        structural_state       TEXT    NOT NULL,
        crypto_state           TEXT    NOT NULL,
        bridge_confidence      TEXT    NOT NULL,
        setup_class            TEXT,
        final_state            TEXT,
        final_score            DOUBLE PRECISION,
        overall_confidence     TEXT,
        action_bucket          TEXT,
        deployment_level       DOUBLE PRECISION,
        deployment_label       TEXT,
        sleeve_safety          DOUBLE PRECISION,
        sleeve_growth          DOUBLE PRECISION,
        sleeve_tactical        DOUBLE PRECISION,
        sleeve_cash            DOUBLE PRECISION,
        bullish_prob           DOUBLE PRECISION,
        neutral_prob           DOUBLE PRECISION,
        bearish_prob           DOUBLE PRECISION,
        recommendation         TEXT,
        mismatch_note          TEXT,
        bridge_note            TEXT,
        upgrade_trigger        TEXT,
        downgrade_trigger      TEXT,
        PRIMARY KEY (profile, horizon, structural_state, crypto_state, bridge_confidence)
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

# Architecture — Rotation Dashboard

## Overview

Full-stack application for sector rotation and cross-asset relative strength analysis. Three layers: automated data pipeline, FastAPI backend with computation engines, and React frontend.

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA PIPELINE                              │
│  GitHub Actions (cron) → fetch / compute scripts → Supabase PG  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                           │
│  Pool → Services (RRG, OBV, Regime, Vol, Macro, Compare) → API  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Plotly)                     │
│  Dashboard │ RRG │ Capital Flow │ Regime │ Volatility │ Compare │
│  Price Explorer                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Data Pipeline

**Purpose:** Collect, store, and pre-compute metrics for 35 instruments.

| Component | File | Role |
|-----------|------|------|
| Config | `config.py` | Single source of truth: tickers, categories, DB URL |
| Daily fetcher | `scripts/fetch_data.py` | Downloads daily OHLCV from Yahoo Finance, upserts into PostgreSQL |
| Intraday fetcher | `scripts/fetch_intraday.py` | Fetches 1h data, resamples to 4h bars, upserts |
| OBV updater | `scripts/update_flow.py` | Computes daily OBV structure metrics for all cross-asset ETFs |
| Macro updater | `scripts/update_macro.py` | Pre-computes macro risk-on/off hero + history, stores as JSONB |
| Initialiser | `scripts/init_db.py` | Creates schema and seeds metadata (categories + tickers) |
| OBV backfill | `scripts/backfill_obv.py` | One-time historical OBV computation |
| Daily cron | `.github/workflows/daily_fetch.yml` | Mon–Fri 22:00 UTC: fetch → OBV → macro |
| Intraday cron | `.github/workflows/intraday_fetch.yml` | 3×/day (14:00, 18:00, 22:00 UTC) |
| Schema | `db/schema.sql` | PostgreSQL DDL — 6 tables |

### Data flow

```
Yahoo Finance API
       │  yfinance library
       ▼
  fetch_data.py / fetch_intraday.py
       │  psycopg2 INSERT ... ON CONFLICT DO UPDATE
       ▼
  Supabase PostgreSQL
       ├── asset_categories (8 rows)
       ├── tickers (35 rows)
       ├── daily_prices (~80K+ rows, PK: symbol + date)
       ├── intraday_prices_4h (PK: symbol + datetime)
       ├── obv_daily_metrics (PK: date + symbol)
       └── macro_daily_cache (PK: date + key, JSONB payloads)
```

### Key design decisions

- **Incremental fetches** — only downloads data since the last stored date per ticker
- **Idempotent writes** — composite PKs + `ON CONFLICT DO UPDATE` ensure upsert semantics
- **16 years of history** — configurable via `HISTORY_YEARS` in `config.py`
- **Macro pre-computation** — hero snapshots for periods [7, 14, 21, 63] and history lookback [300] stored as JSONB to avoid expensive on-the-fly computation

---

## 2. Backend (FastAPI)

**Purpose:** Compute analytical metrics and serve pre-processed data via REST API.

### Directory structure

```
backend/
├── main.py              ← FastAPI app, CORS, DB pool lifecycle, exception handler
├── config.py            ← Imports from root config + CORS/cache settings
├── database.py          ← psycopg2 ThreadedConnectionPool + get_db dependency
├── models/
│   └── schemas.py       ← Pydantic response models
├── utils/
│   └── params.py        ← Shared parameter parsing (symbol lists)
├── services/
│   ├── rrg.py           ← RRG engine (JdK RS-Ratio/Momentum)
│   ├── flow.py          ← OBV structure engine (compute + persist + cache)
│   ├── prices.py        ← Price queries, returns, drawdown, correlation
│   ├── regime.py        ← Market regime engine (regime + overextension + flows)
│   ├── volatility.py    ← VIX oscillator + per-ticker price oscillator engine
│   ├── macro.py         ← Macro risk-on/off engine
│   ├── compare.py       ← Asset comparison engine
│   └── tickers.py       ← Ticker/category metadata queries
└── routers/
    ├── rrg.py           ← /api/rrg/*
    ├── flow.py          ← /api/obv/*
    ├── prices.py        ← /api/prices/*
    ├── regime.py        ← /api/regime/*
    ├── volatility.py    ← /api/volatility/*
    ├── macro.py         ← /api/macro/*
    ├── compare.py       ← /api/compare/*
    └── tickers.py       ← /api/tickers/*
```

### API endpoints

#### RRG (`/api/rrg`)

| Endpoint | Description |
|----------|-------------|
| `GET /sectors` | RRG data for 11 Sector ETFs vs S&P 500. Params: `trail_length`, `rs_span`, `momentum_span`, `timeframe` |
| `GET /cross-asset` | RRG data for 19 Cross-Asset ETFs vs S&P 500. Same params |
| `GET /rankings/sectors` | Sector tickers ranked by composite score |
| `GET /rankings/cross-asset` | Cross-asset tickers ranked by composite score |

#### OBV (`/api/obv`)

| Endpoint | Description |
|----------|-------------|
| `GET /structure` | OBV structure ranking for all cross-asset ETFs. Params: `timeframe` |
| `GET /score-history` | OBV rotation score time-series. Params: `symbols`, `lookback_days` |
| `GET /detail/{symbol}` | Full OBV detail for a single asset. Params: `lookback_days`, `timeframe` |

#### Prices (`/api/prices`)

| Endpoint | Description |
|----------|-------------|
| `GET /{symbol}` | OHLCV time series. Params: `start_date`, `end_date` |
| `GET /multi` | Batch price data. Param: `symbols` |
| `GET /performance` | Multi-period returns (1W–1Y). Param: `symbols` |
| `GET /{symbol}/drawdown` | Drawdown-from-peak series |
| `GET /correlation` | Pairwise correlation matrix. Params: `symbols`, `lookback_days` |
| `GET /dashboard/summary` | Dashboard overview (leaders, S&P YTD, latest date) |

#### Regime (`/api/regime`)

| Endpoint | Description |
|----------|-------------|
| `GET /summary` | Regime + overextension + flows for all tickers. Params: `timeframe`, `overext_mode` |
| `GET /detail/{symbol}` | Regime time-series for single ticker |

#### Volatility (`/api/volatility`)

| Endpoint | Description |
|----------|-------------|
| `GET /summary` | VIX oscillator latest values. Params: `window` |
| `GET /detail` | VIX oscillator time-series + backtest. Params: `lookback`, `window` |
| `GET /structure` | Per-ticker price oscillator for all 30 tickers. Params: `window`, `timeframe` |
| `GET /ticker/{symbol}` | Single ticker oscillator time-series. Params: `lookback`, `window`, `timeframe` |

#### Macro (`/api/macro`)

| Endpoint | Description |
|----------|-------------|
| `GET /hero` | Macro risk-on/off snapshot. Param: `period` (7/14/21/63) |
| `GET /history` | Macro indicator time-series. Param: `lookback` |

#### Compare (`/api/compare`)

| Endpoint | Description |
|----------|-------------|
| `GET /` | Side-by-side comparison for 2–5 tickers. Params: `symbols`, `lookback` |

#### Health

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Returns `{"status": "ok", "last_data_date": "..."}` |

### Caching

RRG, OBV, and regime results are cached in-memory with configurable TTL (default 1h, `CACHE_TTL` env var). Macro data is pre-computed and stored in `macro_daily_cache` table.

### Database connection

`psycopg2.pool.ThreadedConnectionPool` (2–10 connections). Pool created on startup, closed on shutdown via FastAPI lifespan context manager.

---

## 3. Frontend (React + Vite + TypeScript)

### Directory structure

```
frontend/src/
├── main.tsx                    ← Entry point (QueryClient, ThemeProvider)
├── App.tsx                     ← Router (7 pages, 10 routes)
├── index.css                   ← Global styles (CSS custom properties)
├── api/                        ← Fetch wrappers (client, rrg, prices, flow,
│                                  regime, volatility, macro, compare, tickers)
├── components/
│   ├── layout/
│   │   ├── Layout.tsx          ← App shell (Sidebar + Header + Outlet)
│   │   ├── Sidebar.tsx         ← Grouped navigation
│   │   ├── Header.tsx          ← Page title + theme toggle
│   │   ├── ThemeToggle.tsx     ← Dark/light switch
│   │   └── VideoBackground.tsx ← Ambient video background
│   ├── charts/                 ← RRGChart, PriceLineChart, DrawdownChart,
│   │                              CorrelationHeatmap, PerformanceBarChart,
│   │                              Sparkline, MacroHeroCard, glossaries, modals
│   └── common/
│       ├── LoadingSpinner.tsx
│       ├── ErrorBoundary.tsx
│       └── CompareBar.tsx      ← Floating compare action bar
├── pages/
│   ├── DashboardPage.tsx       ← Overview: summary cards, mini RRGs, macro hero
│   ├── RRGPage.tsx             ← Unified RRG (sectors + cross-asset tabs)
│   ├── PriceExplorerPage.tsx   ← Prices, drawdown, correlation, performance
│   ├── FlowStructurePage.tsx   ← OBV breadth, heatmap, spreads, ranking
│   ├── MarketRegimePage.tsx    ← Regime, overextension, capital flows
│   ├── VolatilityPage.tsx      ← VIX oscillators, per-ticker oscillators
│   └── ComparePage.tsx         ← Side-by-side asset comparison
├── hooks/                      ← React Query hooks per domain
├── context/ThemeContext.tsx     ← Dark/light provider
├── theme/                      ← dark.ts, light.ts
├── types/                      ← TypeScript interfaces per domain
└── utils/                      ← colors, formatters, cssVar, rrg helpers
```

### Pages and routing

| Route | Page | Content |
|-------|------|---------|
| `/` | Dashboard | Summary cards, mini RRG charts, macro risk-on/off hero card |
| `/rrg` | RRG | Unified page with sector/cross-asset tabs |
| `/rrg/sectors` | RRG | Auto-selects sectors tab |
| `/rrg/cross-asset` | RRG | Auto-selects cross-asset tab |
| `/prices` | Price Explorer | OHLCV charts, drawdown, correlation, performance |
| `/capital-flow` | Capital Flow | OBV breadth, heatmap, spreads, ranking |
| `/regime` | Market Regime | Regime classification, overextension, capital flows |
| `/volatility` | Volatility | VIX structure, per-ticker oscillators, ranking |
| `/compare` | Compare | Side-by-side comparison (2–5 tickers) |

### Theme system

CSS custom properties on `:root`, toggled by `data-theme` attribute. Dark (default, Bloomberg-style) and light themes. Persisted in `localStorage`.

### Data fetching

TanStack React Query v5: `staleTime: 5 min`, `gcTime: 30 min`, automatic loading/error states.

---

## 4. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Data Pipeline | Python 3.13, yfinance, pandas, psycopg2 | Fetch and store market data |
| Scheduler | GitHub Actions | Daily + intraday cron |
| Database | Supabase PostgreSQL | Cloud-hosted persistent storage |
| Backend | FastAPI, pandas, numpy, scipy, psycopg2 | REST API + computation engines |
| Frontend | React 18, TypeScript, Vite | UI framework and build |
| Charts | Plotly.js (react-plotly.js) | Interactive financial charts |
| Data fetching | TanStack React Query v5 | Client-side caching |
| Routing | React Router v7 | Client-side navigation |
| Icons | Lucide React | SVG icons |
| Styling | CSS custom properties | Theme without runtime overhead |
| Analytics | Vercel Analytics | Usage tracking |

---

## 5. Development

### Running locally

**Backend** (terminal 1):
```bash
source venv/bin/activate
uvicorn backend.main:app --reload
```
API at `http://localhost:8000`. Verify: `GET /api/health`.

**Frontend** (terminal 2):
```bash
cd frontend && npm run dev
```
App at `http://localhost:5173`. Vite proxies `/api/*` to backend on port 8000.

### Building for production
```bash
cd frontend && npm run build
```
Output in `frontend/dist/`. Set `VITE_API_BASE_URL` before building.

---

## 6. Data Model

```
┌──────────────────┐       ┌──────────────────┐
│ asset_categories │       │     tickers       │
├──────────────────┤       ├──────────────────┤
│ id   (PK, auto)  │◄──────│ category_id (FK) │
│ name (UNIQUE)    │       │ symbol (PK)      │
└──────────────────┘       │ name             │
                           │ currency         │
                           │ exchange         │
                           └────────┬─────────┘
                                    │
                         ┌──────────┼──────────┐
                         │ 1:N      │ 1:N      │ 1:N
                         ▼          ▼          ▼
              ┌────────────┐ ┌──────────────┐ ┌─────────────────┐
              │daily_prices│ │intraday_4h   │ │obv_daily_metrics│
              ├────────────┤ ├──────────────┤ ├─────────────────┤
              │ symbol (PK)│ │ symbol  (PK) │ │ date     (PK)  │
              │ date   (PK)│ │ datetime(PK) │ │ symbol   (PK)  │
              │ OHLCV +    │ │ OHLCV        │ │ obv_regime     │
              │ adj_close  │ │              │ │ spread/momentum│
              └────────────┘ └──────────────┘ │ rotation_score │
                                              └─────────────────┘

              ┌───────────────────┐
              │ macro_daily_cache │
              ├───────────────────┤
              │ date (PK, TEXT)   │
              │ key  (PK, TEXT)   │
              │ value (JSONB)     │
              └───────────────────┘
```

- **asset_categories**: 8 rows (Sector ETF, Bond ETF, Equity ETF, Commodity ETF, Crypto ETF, Benchmark, Volatility Index, Macro Only)
- **tickers**: 35 rows (11 sector + 19 cross-asset + 1 benchmark + 2 VIX + 2 macro-only)
- **daily_prices**: ~80K+ rows. Composite PK `(symbol, date)`. Date stored as TEXT (ISO-8601)
- **intraday_prices_4h**: 4h bars resampled from 1h Yahoo data. Composite PK `(symbol, datetime)`
- **obv_daily_metrics**: OBV structure scores. Composite PK `(date, symbol)`
- **macro_daily_cache**: Pre-computed macro JSON payloads. Composite PK `(date, key)`

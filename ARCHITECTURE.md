# Architecture — Rotation Dashboard

## Overview

The Rotation Dashboard is a full-stack application for analysing sector rotation and cross-asset relative strength. It fetches daily and intraday market data, computes Relative Rotation Graph (RRG) metrics and OBV structure scores, and presents them through an interactive web interface.

The system is composed of three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA PIPELINE                              │
│  GitHub Actions (cron) → fetch / update scripts → Supabase PG   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                           │
│  Pool → Services (RRG, OBV, Prices, Tickers) → REST API        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Plotly)                     │
│  Dashboard │ RRG │ Price Explorer │ Rankings │ OBV Structure    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Data Pipeline

**Purpose:** Collect and store OHLCV data for 30 financial instruments (11 sector ETFs, 18 cross-asset ETFs, 1 benchmark).

| Component | File | Role |
|-----------|------|------|
| Config | `config.py` | Single source of truth for all ticker symbols, categories, and DB connection |
| Daily fetcher | `scripts/fetch_data.py` | Downloads daily OHLCV from Yahoo Finance, upserts into PostgreSQL |
| Intraday fetcher | `scripts/fetch_intraday.py` | Fetches 1h data, resamples to 4h bars, upserts into PostgreSQL |
| OBV updater | `scripts/update_flow.py` | Computes daily OBV structure metrics for all cross-asset ETFs |
| Initialiser | `scripts/init_db.py` | Creates the database schema and seeds metadata (categories + ticker info) |
| Daily scheduler | `.github/workflows/daily_fetch.yml` | GitHub Actions cron, Mon–Fri 22:00 UTC: fetch_data.py → update_flow.py |
| Intraday scheduler | `.github/workflows/intraday_fetch.yml` | GitHub Actions cron, 3×/day: fetch_intraday.py |
| Schema | `db/schema.sql` | PostgreSQL DDL — 5 tables |

### Data flow

```
Yahoo Finance API
       │  yfinance library
       ▼
  fetch_data.py / fetch_intraday.py
       │  psycopg2 INSERT ... ON CONFLICT DO UPDATE
       ▼
  Supabase PostgreSQL
       │
       ├── asset_categories (6 rows)
       ├── tickers (30 rows)
       ├── daily_prices (~73K rows, PK: symbol + date)
       ├── intraday_prices_4h (PK: symbol + datetime)
       └── obv_daily_metrics (~29K rows, PK: date + symbol)
```

### Key design decisions

- **Incremental fetches** — only downloads data since the last stored date per ticker.
- **Idempotent writes** — composite primary keys and `ON CONFLICT DO UPDATE` ensure upsert semantics.
- **10 years of history** — configurable via `HISTORY_YEARS` in `config.py`.

---

## 2. Backend (FastAPI)

**Purpose:** Compute RRG and OBV metrics and serve pre-processed data via a REST API.

### Directory structure

```
backend/
├── main.py              ← FastAPI app, CORS middleware, DB pool lifecycle
├── config.py            ← Imports from root config.py, adds CORS/cache settings
├── database.py          ← psycopg2 ThreadedConnectionPool + get_db dependency
├── models/
│   └── schemas.py       ← Pydantic response models
├── services/
│   ├── rrg.py           ← RRG computation engine (pandas)
│   ├── flow.py          ← OBV structure engine (compute + persist + cache)
│   ├── prices.py        ← Price queries, returns, drawdown, correlation
│   └── tickers.py       ← Ticker/category metadata queries
└── routers/
    ├── rrg.py           ← /api/rrg/* endpoints
    ├── flow.py          ← /api/obv/* endpoints
    ├── prices.py        ← /api/prices/* endpoints
    └── tickers.py       ← /api/tickers/* endpoints
```

### API endpoints

#### RRG (`/api/rrg`)

| Endpoint | Description |
|----------|-------------|
| `GET /sectors` | RRG data for 11 Sector ETFs vs S&P 500. Params: `trail_length`, `rs_span`, `momentum_span`, `timeframe` |
| `GET /cross-asset` | RRG data for 18 Cross-Asset ETFs vs S&P 500. Same params |
| `GET /rankings/sectors` | Sector tickers ranked by composite score (ratio + momentum) |
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
| `GET /{symbol}` | OHLCV time series for a single ticker. Params: `start_date`, `end_date` |
| `GET /multi` | Batch price data. Param: `symbols` (comma-separated) |
| `GET /performance` | Multi-period returns (1W, 1M, 3M, 6M, YTD, 1Y). Param: `symbols` |
| `GET /{symbol}/drawdown` | Drawdown-from-peak series |
| `GET /correlation` | Pairwise correlation matrix. Params: `symbols`, `lookback_days` |
| `GET /dashboard/summary` | Dashboard overview (leader tickers, S&P 500 YTD, latest date) |

#### Tickers (`/api/tickers`)

| Endpoint | Description |
|----------|-------------|
| `GET /` | All tickers with category metadata. Optional filter: `category` |
| `GET /categories` | All asset categories |
| `GET /{symbol}` | Single ticker detail |

#### Health

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Returns `{"status": "ok"}` |

### RRG computation algorithm

The core algorithm in `backend/services/rrg.py` computes JdK RS-Ratio and RS-Momentum:

```
1. Fetch adj_close prices for all tickers + benchmark
2. RS = (ticker_price / (benchmark_price / 100)).ewm(span=20).mean()
3. Ratio = 100 + (RS - RS.mean()) / RS.std()
4. Momentum_pct = Ratio.pct_change().ewm(span=10).mean()
5. Momentum = 100 + Momentum_pct / Momentum_pct.std()
```

Values oscillate around 100. Tickers are classified into four quadrants:

| Quadrant | Condition | Meaning |
|----------|-----------|---------|
| **Leading** | Ratio > 100, Momentum > 100 | Outperforming and gaining strength |
| **Weakening** | Ratio > 100, Momentum < 100 | Outperforming but losing strength |
| **Lagging** | Ratio < 100, Momentum < 100 | Underperforming and losing strength |
| **Improving** | Ratio < 100, Momentum > 100 | Underperforming but gaining strength |

### Caching

RRG and OBV results are cached in-memory with a configurable TTL (default 1 hour, set via `CACHE_TTL` env var). Cache keys include the full parameter set.

### Database connection

Uses `psycopg2.pool.ThreadedConnectionPool` (2–10 connections). The pool is created on app startup and closed on shutdown via FastAPI's lifespan context manager.

---

## 3. Frontend (React + Vite + TypeScript)

**Purpose:** Interactive, professional dashboard for investors and analysts.

### Directory structure

```
frontend/src/
├── main.tsx                    ← Entry point (QueryClient, ThemeProvider)
├── App.tsx                     ← Router configuration (5 pages, 6 routes)
├── index.css                   ← Global styles (CSS custom properties)
├── api/
│   ├── client.ts               ← Fetch wrapper with base URL handling
│   ├── rrg.ts                  ← RRG API calls
│   ├── flow.ts                 ← Capital flow API calls
│   ├── prices.ts               ← Price/performance/drawdown API calls
│   └── tickers.ts              ← Ticker metadata API calls
├── components/
│   ├── layout/
│   │   ├── Layout.tsx          ← App shell (Sidebar + Header + Outlet)
│   │   ├── Sidebar.tsx         ← Navigation with icons
│   │   ├── Header.tsx          ← Page title + theme toggle
│   │   ├── ThemeToggle.tsx     ← Dark/light switch button
│   │   └── VideoBackground.tsx ← Ambient video background
│   ├── charts/
│   │   ├── RRGChart.tsx        ← Plotly scatter with trails and quadrants
│   │   ├── RRGGlossary.tsx     ← RRG glossary/explainer panel
│   │   ├── FlowGlossary.tsx     ← Capital flow glossary/explainer panel
│   │   ├── PriceLineChart.tsx  ← Multi-line price chart with range selector
│   │   ├── DrawdownChart.tsx   ← Filled area drawdown chart
│   │   ├── CorrelationHeatmap.tsx ← Heatmap of pairwise correlations
│   │   └── PerformanceBarChart.tsx ← Bar chart of period returns
│   ├── tables/
│   │   └── (removed)
│   └── common/
│       ├── LoadingSpinner.tsx  ← CSS spinner
│       └── ErrorBoundary.tsx   ← React error boundary
├── pages/
│   ├── DashboardPage.tsx       ← Overview: summary cards, mini RRGs, performance
│   ├── RRGPage.tsx             ← Unified RRG page (sectors + cross-asset tabs)
│   ├── PriceExplorerPage.tsx   ← Tabbed view: prices, drawdown, correlation, performance
│   ├── MarketRegimePage.tsx     ← Market regime: regime, overextension, capital flows
│   └── FlowStructurePage.tsx   ← Capital flow: breadth, heatmap, spreads, ranking table
├── hooks/
│   ├── useRRGData.ts           ← React Query hooks for RRG endpoints
│   ├── useFlowData.ts           ← React Query hooks for OBV endpoints
│   ├── usePriceData.ts         ← React Query hooks for price endpoints
│   └── useTheme.ts             ← Theme context consumer
├── context/
│   └── ThemeContext.tsx         ← Dark/light provider with CSS variable switching
├── theme/
│   ├── dark.ts                 ← Dark palette (Bloomberg-style)
│   └── light.ts                ← Light palette (clean, minimal)
├── types/
│   ├── rrg.ts                  ← RRGPoint, RRGResponse, RankingEntry
│   ├── flow.ts                 ← OBVStructureEntry, OBVScoreHistory, OBVDetail
│   └── prices.ts               ← PricePoint, PerformanceEntry, CorrelationResponse, etc.
└── utils/
    ├── colors.ts               ← Consistent color map per ticker
    ├── cssVar.ts               ← CSS variable reader for Plotly configs
    └── formatters.ts           ← Number/date/percentage formatting
```

### Pages and routing

| Route | Page | Content |
|-------|------|---------|
| `/` | Dashboard | Summary cards, mini RRG charts, 1-month performance bar chart |
| `/rrg` | RRG | Unified RRG page with sector/cross-asset tabs, parameter sliders, rankings |
| `/rrg/sectors` | RRG | Same page, auto-selects sectors tab |
| `/rrg/cross-asset` | RRG | Same page, auto-selects cross-asset tab |
| `/prices` | Price Explorer | Tabbed view with price charts, drawdown, correlation heatmap, performance bars |
| `/regime` | Market Regime | Regime classification, overextension signals, capital flow analysis |
| `/obv` | OBV Structure | OBV breadth, rotation score heatmap, spread charts, ranking table |

### Theme system

Theming is implemented via CSS custom properties on `:root`, toggled by a `data-theme` attribute:

- **Dark theme** (default) — dark backgrounds with coloured accents, financial terminal aesthetic.
- **Light theme** — clean white backgrounds with subtle borders.
- Theme preference is persisted in `localStorage`.
- Switching themes updates CSS variables instantly — no React re-render needed.

### Data fetching

Uses **TanStack React Query v5** with:
- `staleTime: 5 min` — data refreshes in the background every 5 minutes.
- `gcTime: 30 min` — cached data is kept for 30 minutes.
- Automatic loading/error state management.

---

## 4. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Data Pipeline | Python 3.13, yfinance, pandas, psycopg2 | Fetch and store market data |
| Scheduler | GitHub Actions | Daily + intraday automated data collection |
| Database | Supabase PostgreSQL | Cloud-hosted persistent storage |
| Backend | FastAPI, pandas, numpy, scipy, psycopg2, Pydantic | REST API + RRG/OBV computation |
| Frontend | React 18, TypeScript, Vite | UI framework and build tool |
| Charts | Plotly.js (react-plotly.js) | Interactive financial charts |
| Data fetching | TanStack React Query v5 | Client-side caching and state |
| Routing | React Router v7 | Client-side navigation |
| Icons | Lucide React | Lightweight SVG icons |
| Styling | CSS custom properties | Theming without runtime overhead |

---

## 5. Development

### Prerequisites

- Python 3.13+ with a virtual environment
- Node.js 18+
- A configured `.env` file with `SUPABASE_DB_URL`

### Running locally

**Backend** (terminal 1):

```bash
source venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

The API is available at `http://localhost:8000`. Verify with `GET /api/health`.

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm run dev
```

The app is available at `http://localhost:5173`. The Vite dev server proxies all `/api/*` requests to the backend on port 8000.

### Building for production

```bash
cd frontend
npm run build
```

The output is in `frontend/dist/` — a static bundle that can be served by any web server or CDN. Set `VITE_API_BASE_URL` to the production backend URL before building.

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
              │ adj_close  │ │              │ │ spread_last    │
              └────────────┘ └──────────────┘ │ spread_pct     │
                                              │ momentum_z     │
                                              │ rotation_score │
                                              └─────────────────┘
```

- **asset_categories**: 6 rows (Sector ETF, Bond ETF, Equity ETF, Commodity ETF, Crypto ETF, Benchmark)
- **tickers**: 30 rows (11 sector + 18 cross-asset + 1 benchmark)
- **daily_prices**: ~73K rows (30 tickers × ~10 years × ~250 trading days). Composite PK `(symbol, date)`
- **intraday_prices_4h**: 4-hour bars resampled from 1h Yahoo data. Composite PK `(symbol, datetime)`
- **obv_daily_metrics**: ~29K rows of OBV structure scores. Composite PK `(date, symbol)`

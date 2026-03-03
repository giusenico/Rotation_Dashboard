# Architecture — Rotation Dashboard

## Overview

The Rotation Dashboard is a full-stack application for analysing sector rotation and cross-asset relative strength. It fetches daily market data, computes Relative Rotation Graph (RRG) metrics, and presents them through an interactive web interface.

The system is composed of three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA PIPELINE                              │
│  GitHub Actions (cron) → fetch_data.py → Supabase PostgreSQL    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                           │
│  Connection pool → Services (RRG, Prices, Tickers) → REST API   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Plotly)                     │
│  Dashboard │ Sector RRG │ Cross-Asset RRG │ Prices │ Rankings   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Data Pipeline

**Purpose:** Collect and store daily OHLCV data for 26 financial instruments.

| Component | File | Role |
|-----------|------|------|
| Config | `config.py` | Single source of truth for all ticker symbols, categories, and DB connection |
| Fetcher | `scripts/fetch_data.py` | Downloads OHLCV data from Yahoo Finance via `yfinance`, inserts into PostgreSQL with UPSERT logic |
| Initialiser | `scripts/init_db.py` | Creates the database schema and seeds metadata (categories + ticker info) |
| Scheduler | `.github/workflows/daily_fetch.yml` | GitHub Actions cron job, runs Mon–Fri at 21:30 UTC (after US market close) |
| Schema | `db/schema.sql` | PostgreSQL DDL — three tables: `asset_categories`, `tickers`, `daily_prices` |

### Data flow

```
Yahoo Finance API
       │  yfinance library
       ▼
  fetch_data.py
       │  psycopg2 INSERT ... ON CONFLICT DO NOTHING
       ▼
  Supabase PostgreSQL
       │
       ├── asset_categories (6 rows)
       ├── tickers (26 rows)
       └── daily_prices (~62,000 rows, indexed on symbol + date)
```

### Key design decisions

- **Incremental fetches** — only downloads data since the last stored date per ticker.
- **Idempotent writes** — the `UNIQUE(symbol, date)` constraint and `ON CONFLICT DO NOTHING` prevent duplicates.
- **10 years of history** — configurable via `HISTORY_YEARS` in `config.py`.

---

## 2. Backend (FastAPI)

**Purpose:** Compute RRG metrics and serve pre-processed data via a REST API.

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
│   ├── prices.py        ← Price queries, returns, drawdown, correlation
│   └── tickers.py       ← Ticker/category metadata queries
└── routers/
    ├── rrg.py           ← /api/rrg/* endpoints
    ├── prices.py        ← /api/prices/* endpoints
    └── tickers.py       ← /api/tickers/* endpoints
```

### API endpoints

#### RRG (`/api/rrg`)

| Endpoint | Description |
|----------|-------------|
| `GET /sectors` | RRG data for 11 Sector ETFs vs S&P 500. Params: `trail_length`, `rs_span`, `momentum_span` |
| `GET /cross-asset` | RRG data for 14 Cross-Asset ETFs vs S&P 500. Same params |
| `GET /rankings/sectors` | Sector tickers ranked by composite score (ratio + momentum) |
| `GET /rankings/cross-asset` | Cross-asset tickers ranked by composite score |

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

RRG results are cached in-memory with a 1-hour TTL to avoid recomputing on every request. The cache key includes the parameter set (`trail_length`, `rs_span`, `momentum_span`).

### Database connection

Uses `psycopg2.pool.ThreadedConnectionPool` (2–10 connections). The pool is created on app startup and closed on shutdown via FastAPI's lifespan context manager.

---

## 3. Frontend (React + Vite + TypeScript)

**Purpose:** Interactive, professional dashboard for investors and analysts.

### Directory structure

```
frontend/src/
├── main.tsx                    ← Entry point (QueryClient, ThemeProvider)
├── App.tsx                     ← Router configuration
├── index.css                   ← Global styles (CSS custom properties)
├── api/
│   ├── client.ts               ← Fetch wrapper with base URL handling
│   ├── rrg.ts                  ← RRG API calls
│   ├── prices.ts               ← Price/performance/drawdown API calls
│   └── tickers.ts              ← Ticker metadata API calls
├── components/
│   ├── layout/
│   │   ├── Layout.tsx          ← App shell (Sidebar + Header + Outlet)
│   │   ├── Sidebar.tsx         ← Navigation with icons
│   │   ├── Header.tsx          ← Page title + theme toggle
│   │   └── ThemeToggle.tsx     ← Dark/light switch button
│   ├── charts/
│   │   ├── RRGChart.tsx        ← Plotly scatter with trails and quadrants
│   │   ├── PriceLineChart.tsx  ← Multi-line price chart with range selector
│   │   ├── DrawdownChart.tsx   ← Filled area drawdown chart
│   │   ├── CorrelationHeatmap.tsx ← Heatmap of pairwise correlations
│   │   └── PerformanceBarChart.tsx ← Bar chart of period returns
│   ├── tables/
│   │   └── RankingsTable.tsx   ← Sortable table with quadrant badges
│   └── common/
│       └── LoadingSpinner.tsx  ← CSS spinner
├── pages/
│   ├── DashboardPage.tsx       ← Overview: summary cards, mini RRGs, performance
│   ├── SectorRRGPage.tsx       ← Full sector RRG with parameter sliders + rankings
│   ├── CrossAssetRRGPage.tsx   ← Full cross-asset RRG with sliders + rankings
│   ├── PriceExplorerPage.tsx   ← Tabbed view: prices, drawdown, correlation, performance
│   └── RankingsPage.tsx        ← Tabbed rankings with performance returns
├── hooks/
│   ├── useRRGData.ts           ← React Query hooks for RRG endpoints
│   ├── usePriceData.ts         ← React Query hooks for price endpoints
│   └── useTheme.ts             ← Theme context consumer
├── context/
│   └── ThemeContext.tsx         ← Dark/light provider with CSS variable switching
├── theme/
│   ├── dark.ts                 ← Dark palette (Bloomberg-style)
│   └── light.ts                ← Light palette (clean, minimal)
├── types/
│   ├── rrg.ts                  ← RRGPoint, RRGResponse, RankingEntry
│   └── prices.ts               ← PricePoint, PerformanceEntry, CorrelationResponse, etc.
└── utils/
    ├── colors.ts               ← Consistent color map per ticker
    └── formatters.ts           ← Number/date/percentage formatting
```

### Pages and routing

| Route | Page | Content |
|-------|------|---------|
| `/` | Dashboard | Summary cards, mini RRG charts, 1-month performance bar chart |
| `/rrg/sectors` | Sector RRG | Interactive RRG scatter plot for 11 sector ETFs, parameter sliders, rankings table |
| `/rrg/cross-asset` | Cross-Asset RRG | Same layout for 14 cross-asset ETFs |
| `/prices` | Price Explorer | Tabbed view with price charts, drawdown, correlation heatmap, performance bars |
| `/rankings` | Rankings | Sector and cross-asset rankings tables with multi-period return columns |

### Theme system

Theming is implemented via CSS custom properties on `:root`, toggled by a `data-theme` attribute:

- **Dark theme** (default) — dark backgrounds with coloured accents, financial terminal aesthetic.
- **Light theme** — clean white backgrounds with subtle borders.
- Theme preference is persisted in `localStorage`.
- Switching themes updates CSS variables instantly — no React re-render needed.

### RRG chart (Plotly)

The `RRGChart` component renders:

1. **Trail lines** — the last N data points per ticker connected with a coloured line.
2. **Head markers** — the most recent point highlighted with a red circle and bold label.
3. **Crosshairs** — dashed lines at x=100 and y=100.
4. **Quadrant labels** — "LEADING", "WEAKENING", "LAGGING", "IMPROVING" in the four corners.
5. **Interactive features** — zoom, pan, hover tooltips, legend toggle.

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
| Scheduler | GitHub Actions | Daily automated data collection |
| Database | Supabase PostgreSQL | Cloud-hosted persistent storage |
| Backend | FastAPI, pandas, psycopg2, Pydantic | REST API + RRG computation |
| Frontend | React 19, TypeScript, Vite 6 | UI framework and build tool |
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
pip install -r backend/requirements.txt
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
                                    │ 1:N
                                    ▼
                           ┌──────────────────┐
                           │  daily_prices     │
                           ├──────────────────┤
                           │ id (PK, auto)    │
                           │ symbol (FK)      │
                           │ date (TEXT)      │
                           │ open             │
                           │ high             │
                           │ low              │
                           │ close            │
                           │ adj_close        │
                           │ volume           │
                           │ UNIQUE(symbol,   │
                           │        date)     │
                           └──────────────────┘
```

- **asset_categories**: 6 rows (Sector ETF, Bond ETF, Equity ETF, Commodity ETF, Crypto ETF, Benchmark)
- **tickers**: 26 rows (11 sector + 14 cross-asset + 1 benchmark)
- **daily_prices**: ~62,000 rows (26 tickers × ~10 years × ~250 trading days)
- Indexed on `(symbol, date)` for fast range queries

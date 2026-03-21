# Rotation Dashboard

Full-stack financial dashboard for sector rotation and cross-asset relative strength analysis. Built with React + FastAPI + Supabase PostgreSQL.

**Live:** Frontend on Vercel · Backend on Render · Data pipeline via GitHub Actions

---

## What It Does

Tracks **35 instruments** across 8 categories and provides five analytical views:

| Page | Description |
|------|-------------|
| **Dashboard** | Market overview: S&P 500 performance, sector/cross-asset leaders, macro risk-on/off hero card |
| **RRG** | Relative Rotation Graphs (JdK RS-Ratio/Momentum) with sector and cross-asset tabs |
| **Capital Flow** | OBV structure analysis: breadth gauge, rotation heatmap, spread charts, ranking table |
| **Market Regime** | Pine Script-style regime classification, overextension signals, capital flow momentum |
| **Volatility** | VIX/VIX3M term structure oscillators, per-ticker price oscillators, ranking table |
| **Compare** | Side-by-side asset comparison (2–5 tickers): performance, drawdown, correlation |
| **Price Explorer** | Interactive OHLCV charts, multi-period returns, drawdown, correlation heatmap |

### Tracked Instruments

| Category | Count | Tickers |
|----------|-------|---------|
| Sector ETFs | 11 | XLF, XLV, XLY, XLC, XLE, XLI, XLK, XLU, XLB, XLRE, XLP |
| Cross-Asset ETFs | 19 | BND, SHY, SHV, IEF, TLT, IGOV, SPYV, SPYG, QQQ, IWM, SPEU, EWJ, EEMA, ILF, GLD, SLV, USO, BNO, IBIT |
| Benchmark | 1 | ^GSPC (S&P 500) |
| Volatility Indices | 2 | ^VIX, ^VIX3M |
| Macro Only | 2 | SPY, BTC-USD |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA PIPELINE                              │
│  GitHub Actions (cron) → fetch / compute scripts → Supabase PG  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                           │
│  Pool → Services (RRG, OBV, Regime, Volatility, Macro, etc.)   │
│       → REST API (/api/*)                                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Plotly)                     │
│  7 pages · dark/light theme · Vercel Analytics                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Pipeline

| Script | Schedule | Purpose |
|--------|----------|---------|
| `scripts/fetch_data.py` | Daily 22:00 UTC (Mon–Fri) | Incremental OHLCV fetch from Yahoo Finance |
| `scripts/update_flow.py` | Daily (after fetch) | Compute OBV structure metrics |
| `scripts/update_macro.py` | Daily (after OBV) | Pre-compute macro risk-on/off data |
| `scripts/fetch_intraday.py` | 3×/day | Fetch 1h data, resample to 4h bars |

### Database (Supabase PostgreSQL)

| Table | Purpose |
|-------|---------|
| `asset_categories` | 8 category definitions |
| `tickers` | 35 instrument metadata |
| `daily_prices` | OHLCV + adj_close (PK: symbol + date) |
| `intraday_prices_4h` | 4h candles (PK: symbol + datetime) |
| `obv_daily_metrics` | OBV structure scores (PK: date + symbol) |
| `macro_daily_cache` | Pre-computed macro JSON blobs (PK: date + key) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.13, FastAPI, psycopg2, pandas, numpy, scipy |
| Frontend | React 18, TypeScript, Vite, React Router v7, Plotly.js |
| Database | Supabase PostgreSQL |
| Hosting | Render (backend), Vercel (frontend) |
| CI/CD | GitHub Actions (daily + intraday cron) |
| Charts | Plotly.js via react-plotly.js |
| Data fetching | TanStack React Query v5 |
| Styling | CSS custom properties (dark/light theme) |

---

## Setup

### Prerequisites
- Python 3.13+
- Node.js 18+
- A [Supabase](https://supabase.com) project

### 1. Install dependencies
```bash
git clone https://github.com/giusenico/Rotation_Dashboard.git
cd Rotation_Dashboard
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd frontend && npm install && cd ..
```

### 2. Configure environment
```bash
cp .env.example .env
```
Set `SUPABASE_DB_URL` to your Supabase Session Pooler connection string.

### 3. Initialize database
```bash
python scripts/init_db.py
python scripts/fetch_data.py --full
python scripts/update_flow.py
python scripts/update_macro.py
```

### 4. Run locally
```bash
# Terminal 1 — backend (http://localhost:8000)
source venv/bin/activate
uvicorn backend.main:app --reload

# Terminal 2 — frontend (http://localhost:5173)
cd frontend && npm run dev
```

### 5. Enable automation
Add `SUPABASE_DB_URL` as a GitHub Actions secret. Workflows run automatically on schedule.

---

## Project Structure

```
Rotation_Dashboard/
├── config.py                  # Central config: tickers, categories, DB URL
├── db/schema.sql              # PostgreSQL DDL (6 tables)
├── scripts/
│   ├── init_db.py             # One-time: create schema + seed
│   ├── fetch_data.py          # Daily OHLCV fetch
│   ├── fetch_intraday.py      # Intraday 1h→4h fetch
│   ├── update_flow.py         # Daily OBV computation
│   ├── update_macro.py        # Daily macro risk-on/off pre-compute
│   └── backfill_obv.py        # One-time OBV backfill
├── backend/
│   ├── main.py                # FastAPI app entry point
│   ├── config.py              # CORS, cache settings
│   ├── database.py            # psycopg2 connection pool
│   ├── routers/               # 8 routers: rrg, prices, tickers, flow,
│   │                          #   regime, volatility, macro, compare
│   ├── services/              # Business logic (matching routers)
│   ├── models/schemas.py      # Pydantic response models
│   └── utils/params.py        # Shared parameter parsing
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # React Router (7 pages, 10 routes)
│   │   ├── pages/             # 7 page components
│   │   ├── components/        # charts/, layout/, common/
│   │   ├── hooks/             # React Query data hooks
│   │   ├── api/               # Fetch wrappers
│   │   ├── types/             # TypeScript interfaces
│   │   ├── context/           # ThemeContext
│   │   ├── theme/             # dark.ts, light.ts
│   │   └── utils/             # colors, formatters, helpers
│   └── vercel.json            # Vercel deploy config
├── .github/workflows/
│   ├── daily_fetch.yml        # Mon–Fri 22:00 UTC
│   └── intraday_fetch.yml     # 3×/day
├── Procfile                   # Render deployment
└── requirements.txt           # Python dependencies
```

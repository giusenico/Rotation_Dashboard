# Rotation Dashboard — Data Pipeline

Automated pipeline that fetches daily market data from Yahoo Finance and stores it in a cloud-hosted PostgreSQL database (Supabase). Designed as the data backbone for a sector rotation and cross-asset analysis dashboard.

## Tracked Instruments (26 total)

### Sector ETFs (11)
| Ticker | Sector |
|--------|--------|
| XLF | Financials |
| XLV | Health Care |
| XLY | Consumer Discretionary |
| XLC | Communication Services |
| XLE | Energy |
| XLI | Industrials |
| XLK | Technology |
| XLU | Utilities |
| XLB | Materials |
| XLRE | Real Estate |
| XLP | Consumer Staples |

### Cross-Asset ETFs (14)
| Ticker | Asset Class | Description |
|--------|-------------|-------------|
| BND | Bond | US Aggregate Bond Market |
| IEF | Bond | 7-10 Year US Treasury Bonds |
| TLT | Bond | 20+ Year US Treasury Bonds |
| SPYV | Equity | S&P 500 Value |
| SPYG | Equity | S&P 500 Growth |
| QQQ | Equity | Nasdaq 100 |
| IWM | Equity | US Small Caps (Russell 2000) |
| SPEU | Equity | Europe Equities |
| EWJ | Equity | Japan Equities |
| EEMA | Equity | Asia Emerging Markets |
| ILF | Equity | Latin America 40 |
| GLD | Commodity | Gold |
| SLV | Commodity | Silver |
| IBIT | Crypto | iShares Bitcoin Trust |

### Benchmark (1)
| Ticker | Description |
|--------|-------------|
| ^GSPC | S&P 500 Index |

## Architecture

```
Yahoo Finance API
       │
       ▼
┌─────────────────┐         ┌──────────────────────┐
│  fetch_data.py  │────────▶│  Supabase PostgreSQL  │
│  (Python script)│         │  (cloud database)     │
└─────────────────┘         └──────────────────────┘
       ▲                              │
       │                              ▼
 GitHub Actions              Frontend / Analysis
 (daily cron job)            (REST API / SDK access)
```

- **Data source:** Yahoo Finance via the `yfinance` Python library
- **Database:** Supabase (hosted PostgreSQL), always online, with built-in REST API
- **Automation:** GitHub Actions runs the fetch script every weekday at 22:30 CET (after US market close)
- **Data stored:** daily OHLCV + adjusted close for each ticker, plus instrument metadata

## Database Schema

### `asset_categories`
Logical grouping of instruments: Sector ETF, Bond ETF, Equity ETF, Commodity ETF, Crypto ETF, Benchmark.

### `tickers`
Metadata for each tracked instrument (symbol, full name, category, currency, exchange).

### `daily_prices`
One row per ticker per trading day. Columns: `open`, `high`, `low`, `close`, `adj_close`, `volume`. Indexed on `(symbol, date)` for fast lookups.

## Project Structure

```
Rotation_Dashboard/
├── .github/workflows/
│   └── daily_fetch.yml    # GitHub Actions cron job (Mon-Fri 22:30 CET)
├── db/
│   └── schema.sql         # PostgreSQL DDL for all tables
├── scripts/
│   ├── init_db.py         # Creates tables and seeds metadata
│   └── fetch_data.py      # Fetches OHLCV data from Yahoo Finance
├── config.py              # Ticker definitions, categories, DB connection
├── requirements.txt       # Python dependencies
├── .env.example           # Template for environment variables
└── .gitignore
```

## Setup

### Prerequisites
- Python 3.13+
- A [Supabase](https://supabase.com) project (free tier works)
- A GitHub repository (for automated scheduling)

### 1. Clone and install dependencies
```bash
git clone https://github.com/giusenico/Rotation_Dashboard.git
cd Rotation_Dashboard
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure the database connection
```bash
cp .env.example .env
```
Edit `.env` and set `SUPABASE_DB_URL` to your Supabase Session Pooler connection string. You can find it in: **Supabase Dashboard → Project Settings → Database → Connection string → Session Pooler → URI**.

### 3. Initialize the database
```bash
python scripts/init_db.py
```
This creates the tables and seeds them with asset categories and ticker metadata (fetched from Yahoo Finance).

### 4. Backfill historical data
```bash
python scripts/fetch_data.py --full
```
Downloads 10 years of daily data for all 26 tickers (~62,000 rows).

### 5. Enable automated daily updates
Add `SUPABASE_DB_URL` as a secret in your GitHub repository (**Settings → Secrets and variables → Actions → New repository secret**). The workflow runs automatically every weekday at 22:30 CET.

You can also trigger it manually from the **Actions** tab.

## Usage

### Incremental update (fetch only new data)
```bash
python scripts/fetch_data.py
```

### Full historical re-fetch
```bash
python scripts/fetch_data.py --full
```

### Re-initialize database (reset schema and metadata)
```bash
python scripts/init_db.py
```

## Accessing the Data

The Supabase database is accessible through:
- **Direct SQL** — connect with any PostgreSQL client using the connection string
- **Supabase REST API** — auto-generated endpoints for each table
- **Supabase JS/Python SDK** — for frontend or backend integration
- **Supabase Dashboard** — Table Editor for visual browsing

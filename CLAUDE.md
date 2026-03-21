# Rotation Dashboard — Claude Code Instructions

## Project Overview
Full-stack financial dashboard: React frontend + FastAPI backend + Supabase PostgreSQL.
Tracks 35 instruments (11 sector ETFs, 19 cross-asset ETFs, S&P 500, 2 VIX indices, 2 macro-only) with RRG analysis, OBV structure ranking, market regime, volatility oscillators, and macro risk-on/off.

## Commands

### Run backend locally
```bash
source venv/bin/activate
uvicorn backend.main:app --reload
```

### Run frontend locally
```bash
cd frontend && npm run dev
```

### Fetch latest prices (incremental)
```bash
source venv/bin/activate && python scripts/fetch_data.py
```

### Update OBV metrics for today
```bash
source venv/bin/activate && python scripts/update_flow.py
```

### Pre-compute macro data
```bash
source venv/bin/activate && python scripts/update_macro.py
```

### Full historical price refetch
```bash
source venv/bin/activate && python scripts/fetch_data.py --full
```

## Code Conventions
- Python: no type stubs, use `from __future__ import annotations` where needed
- Central config in root `config.py` — all tickers, categories, DB URL defined there
- Backend imports config via `backend/config.py` which re-exports from root
- All DB schema in `db/schema.sql` — single source of truth (6 tables)
- Frontend: functional components, custom hooks for data fetching, Plotly for charts
- Use `ON CONFLICT ... DO UPDATE` for all upserts (never DO NOTHING for price data)

## Architecture Rules
- Never add new tickers without updating `config.py` (ALL_TICKERS, TICKER_CATEGORY_MAP)
- OBV computation constants must stay in sync across: `backend/services/flow.py`, `scripts/update_flow.py`
- Daily automation runs via `.github/workflows/daily_fetch.yml` (fetch → OBV → macro)
- Keep `requirements.txt` at project root (single file for both pipeline and backend)
- Database connection via `SUPABASE_DB_URL` env var (never hardcode)

## Testing Changes
- After modifying `scripts/fetch_data.py` or `scripts/update_flow.py`: run them locally with venv
- After modifying backend services: hit the API endpoint locally (e.g. `curl localhost:8000/api/obv/structure`)
- After modifying frontend: check the browser at `localhost:5173`

## Important File Locations
- `config.py` — ticker universe, categories, DB URL
- `db/schema.sql` — all table definitions (6 tables)
- `backend/services/flow.py` — OBV computation engine
- `backend/services/rrg.py` — RRG computation engine
- `backend/services/regime.py` — Market Regime engine
- `backend/services/volatility.py` — VIX/price oscillator engine
- `backend/services/macro.py` — Macro risk-on/off engine
- `backend/services/compare.py` — Asset comparison engine
- `.github/workflows/daily_fetch.yml` — daily automation (fetch → OBV → macro)
- `.github/workflows/intraday_fetch.yml` — intraday automation (3×/day)
- `frontend/src/pages/` — 7 page components (RRGPage serves both sector and cross-asset routes)

## Memory
Claude Code auto-memory is stored at `~/.claude/projects/.../memory/`. Update MEMORY.md when making structural changes (new tables, new endpoints, new pages).

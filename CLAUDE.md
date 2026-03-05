# Rotation Dashboard — Claude Code Instructions

## Project Overview
Full-stack financial dashboard: React frontend + FastAPI backend + Supabase PostgreSQL.
Tracks 26 instruments (sector ETFs, cross-asset ETFs, S&P 500) with RRG analysis and OBV structure ranking.

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
source venv/bin/activate && python scripts/update_obv.py
```

### Full historical price refetch
```bash
source venv/bin/activate && python scripts/fetch_data.py --full
```

### Backfill OBV history (one-time, generates CSV then upload)
```bash
source venv/bin/activate && python backfill_obv.py
python backfill_obv.py --upload
```

## Code Conventions
- Python: no type stubs, use `from __future__ import annotations` where needed
- Central config in root `config.py` — all tickers, categories, DB URL defined there
- Backend imports config via `backend/config.py` which re-exports from root
- All DB schema in `db/schema.sql` — single source of truth
- Frontend: functional components, custom hooks for data fetching, Plotly for charts
- Use `ON CONFLICT ... DO UPDATE` for all upserts (never DO NOTHING for price data)

## Architecture Rules
- Never add new tickers without updating `config.py` (ALL_TICKERS, TICKER_CATEGORY_MAP)
- OBV computation constants must stay in sync across: `backfill_obv.py`, `backend/services/obv.py`, `scripts/update_obv.py`
- Daily automation runs via `.github/workflows/daily_fetch.yml` — always test changes locally first
- Keep `requirements.txt` at project root (single file for both pipeline and backend)
- Database connection via `SUPABASE_DB_URL` env var (never hardcode)

## Testing Changes
- After modifying `scripts/fetch_data.py` or `scripts/update_obv.py`: run them locally with venv
- After modifying backend services: hit the API endpoint locally (e.g. `curl localhost:8000/api/obv/structure`)
- After modifying frontend: check the browser at `localhost:5173`

## Important File Locations
- `config.py` — ticker universe, categories, DB URL
- `db/schema.sql` — all table definitions
- `backend/services/obv.py` — OBV computation engine
- `backend/services/rrg.py` — RRG computation engine
- `.github/workflows/daily_fetch.yml` — daily automation
- `frontend/src/pages/` — all 6 page components

## Memory
Claude Code auto-memory is stored at `~/.claude/projects/.../memory/`. Update MEMORY.md when making structural changes (new tables, new endpoints, new pages).

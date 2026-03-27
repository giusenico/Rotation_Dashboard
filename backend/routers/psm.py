"""PSM (Portfolio State Machine) API endpoints."""

from fastapi import APIRouter, Depends, Query, HTTPException

from backend.database import get_db

router = APIRouter()


@router.get("/latest")
def psm_latest(conn=Depends(get_db)):
    """Get the latest PSM snapshot (all profiles × horizons)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT * FROM psm_daily
            WHERE date = (SELECT MAX(date) FROM psm_daily)
            ORDER BY profile, horizon
        """)
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No PSM data available")
    return [dict(zip(cols, row)) for row in rows]


@router.get("/history")
def psm_history(
    profile: str = Query("Moderate", description="Profile: Conservative, Moderate, Aggressive"),
    horizon: str = Query("Mid term", description="Horizon: Short term, Mid term, Long term"),
    lookback: int = Query(252, ge=10, le=2520, description="Number of days"),
    conn=Depends(get_db),
):
    """Get PSM timeseries for a specific profile × horizon."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT * FROM psm_daily
            WHERE profile = %s AND horizon = %s
            ORDER BY date DESC
            LIMIT %s
        """, (profile, horizon, lookback))
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
    return [dict(zip(cols, row)) for row in reversed(rows)]


@router.get("/profile/{profile}")
def psm_profile_card(
    profile: str,
    conn=Depends(get_db),
):
    """Get the latest PSM data for a specific profile (all horizons)."""
    if profile not in ("Conservative", "Moderate", "Aggressive"):
        raise HTTPException(status_code=400, detail=f"Invalid profile: {profile}")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT * FROM psm_daily
            WHERE profile = %s AND date = (SELECT MAX(date) FROM psm_daily)
            ORDER BY horizon
        """, (profile,))
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No PSM data for profile {profile}")
    return [dict(zip(cols, row)) for row in rows]


@router.get("/policy-matrix")
def psm_policy_matrix(
    profile: str = Query(None, description="Filter by profile"),
    horizon: str = Query(None, description="Filter by horizon"),
    macro_state: str = Query(None, description="Filter by macro state"),
    crypto_state: str = Query(None, description="Filter by crypto state"),
    bridge_confidence: str = Query(None, description="Filter by bridge confidence"),
    conn=Depends(get_db),
):
    """Query the pre-computed policy matrix with optional filters."""
    query = "SELECT * FROM psm_policy_matrix WHERE 1=1"
    params = []
    if profile:
        query += " AND profile = %s"; params.append(profile)
    if horizon:
        query += " AND horizon = %s"; params.append(horizon)
    if macro_state:
        query += " AND macro_state = %s"; params.append(macro_state)
    if crypto_state:
        query += " AND crypto_state = %s"; params.append(crypto_state)
    if bridge_confidence:
        query += " AND bridge_confidence = %s"; params.append(bridge_confidence)
    query += " ORDER BY profile, horizon, macro_state, crypto_state, bridge_confidence"

    with conn.cursor() as cur:
        cur.execute(query, params)
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
    return [dict(zip(cols, row)) for row in rows]


@router.get("/layers")
def psm_layers(
    lookback: int = Query(252, ge=10, le=2520, description="Number of days"),
    conn=Depends(get_db),
):
    """Get intermediate layer timeseries (macro, crypto, bridge components)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT * FROM psm_layers_daily
            ORDER BY date DESC
            LIMIT %s
        """, (lookback,))
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
    return [dict(zip(cols, row)) for row in reversed(rows)]


@router.get("/transitions")
def psm_transitions(
    lookback: int = Query(252, ge=10, le=2520, description="Number of days"),
    conn=Depends(get_db),
):
    """Get state transition counts for each profile × horizon."""
    with conn.cursor() as cur:
        cur.execute("""
            WITH ordered AS (
                SELECT date, profile, horizon, final_state,
                       LAG(final_state) OVER (PARTITION BY profile, horizon ORDER BY date) AS prev_state
                FROM psm_daily
                WHERE date >= (SELECT MAX(date) FROM psm_daily) - %s
            )
            SELECT profile, horizon, prev_state, final_state AS current_state, COUNT(*) AS cnt
            FROM ordered
            WHERE prev_state IS NOT NULL
            GROUP BY profile, horizon, prev_state, final_state
            ORDER BY profile, horizon, cnt DESC
        """, (lookback,))
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
    return [dict(zip(cols, row)) for row in rows]


@router.get("/summary")
def psm_summary(conn=Depends(get_db)):
    """Get a compact summary: latest date, mode states, dashboard table."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT date, profile, horizon, final_state, macro_state,
                   bridge_confidence, setup_class, overall_confidence,
                   deployment_label, action_bucket
            FROM psm_daily
            WHERE date = (SELECT MAX(date) FROM psm_daily)
            ORDER BY profile, horizon
        """)
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()

    if not rows:
        return {"latest_date": None, "dashboard_table": {}, "rows": []}

    data = [dict(zip(cols, row)) for row in rows]
    latest_date = str(data[0]["date"]) if data else None

    # Build pivot: profile → horizon → final_state
    dashboard_table = {}
    for r in data:
        dashboard_table.setdefault(r["profile"], {})[r["horizon"]] = r["final_state"]

    return {
        "latest_date": latest_date,
        "dashboard_table": dashboard_table,
        "rows": data,
    }

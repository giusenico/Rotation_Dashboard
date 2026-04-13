"""PSM (Portfolio State Machine) v2 API endpoints."""

from fastapi import APIRouter, Depends, Query, HTTPException

from backend.database import get_db

router = APIRouter()


@router.get("/latest")
def psm_latest(conn=Depends(get_db)):
    """Latest PSM snapshot (all profiles × horizons)."""
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
    """PSM timeseries for a specific profile × horizon."""
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
def psm_profile_card(profile: str, conn=Depends(get_db)):
    """Latest PSM data for a specific profile (all horizons)."""
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


@router.get("/profile-cards")
def psm_profile_cards(conn=Depends(get_db)):
    """Latest profile cards — one row per (profile, horizon). Mirrors the
    `08_latest_profile_cards.csv` export of the v2 notebook."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT profile, horizon,
                   structural_state, structural_confidence, market_state,
                   crypto_state, bridge_confidence, overall_confidence,
                   setup_class, final_state,
                   action_bucket, deployment_label,
                   sleeve_safety, sleeve_growth, sleeve_tactical, sleeve_cash,
                   bullish_prob, neutral_prob, bearish_prob,
                   recommendation, mismatch_note, bridge_note,
                   upgrade_trigger, downgrade_trigger
            FROM psm_daily
            WHERE date = (SELECT MAX(date) FROM psm_daily)
            ORDER BY profile, horizon
        """)
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No PSM data available")
    return [dict(zip(cols, row)) for row in rows]


@router.get("/layers")
def psm_layers(
    lookback: int = Query(252, ge=10, le=2520, description="Number of days"),
    conn=Depends(get_db),
):
    """Intermediate layer timeseries (structural + market + crypto + bridge)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT * FROM psm_layers_daily
            ORDER BY date DESC
            LIMIT %s
        """, (lookback,))
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
    return [dict(zip(cols, row)) for row in reversed(rows)]


@router.get("/summary")
def psm_summary(conn=Depends(get_db)):
    """Compact summary: latest date, dashboard pivot table, summary rows."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT date, profile, horizon, final_state,
                   structural_state, structural_confidence, market_state,
                   crypto_state, bridge_confidence, setup_class, overall_confidence,
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

    dashboard_table: dict[str, dict[str, str]] = {}
    for r in data:
        dashboard_table.setdefault(r["profile"], {})[r["horizon"]] = r["final_state"]

    return {
        "latest_date": latest_date,
        "dashboard_table": dashboard_table,
        "rows": data,
    }

"""
PSM (Portfolio State Machine) compute engine — v2.

Four-layer architecture (mirrors the `psm_with_structural_layer0_final_v2` notebook):

  - Layer 0 — Structural:        business-cycle state from FRED-sourced CLI data
                                  (leading/coincident/lagging + phase + recession overlay)
                                  → structural_state, structural_confidence, structural_score
  - Layer 1 — Market expression: FSI + unified ratio + rotation bias
                                  → market_state, market_score
  - Layer 2 — Crypto:            BTC trend signals by profile
                                  → {profile}_crypto_state, {profile}_crypto_score
  - Layer 3 — Bridge:            OBV sponsorship + BTC/NASDAQ/DXY beta + RRG rotation
                                  → bridge_confidence, bridge_score
  - Final:                       governed state machine combining all four layers →
                                  final_state, setup_class, sleeves, deployment_label,
                                  recommendation bundle.

All pure functions — no DB access here. The compute_psm.py script
and the API router handle data loading and persistence.
"""

from __future__ import annotations

import math
import logging

import numpy as np
import pandas as pd

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from config import (
    STATE_ORDER, STATE_SCORE_MAP, CONF_SCORE_MAP, BRIDGE_CONF_MAP,
    PROFILE_MAP, PROFILE_BIAS,
    HORIZON_WEIGHTS,
    UPGRADE_CONFIRM_DAYS, DOWNGRADE_CONFIRM_DAYS,
    STRUCTURAL_UPGRADE_PERIODS, STRUCTURAL_DOWNGRADE_PERIODS,
    STRUCTURAL_CAPS, STRUCTURAL_FLOORS,
    BASE_SLEEVES, PROFILE_SLEEVE_ADJ, HORIZON_SLEEVE_ADJ,
    RISK_ON, RISK_OFF,
    FSI_Z_WIN, CRYPTO_Z_WIN, ROT_LOOKBACK,
    FAST_MA, SLOW_MA,
    OBV_SMA_LEN, ROC_LEN, BETA_WINDOW, BETA_Z_WIN,
    RRG_RATIO_SPAN, RRG_MOM_SPAN,
    RRG_GROWTH_LIKE, RRG_DEFENSIVE_LIKE,
    STRUCTURAL_FFILL_LIMIT, FSI_FFILL_LIMIT, TREND_FFILL_LIMIT, BRIDGE_FFILL_LIMIT,
    OBV_UNIVERSE, SECTOR_ETFS, RRG_CROSS_ASSETS, RRG_BENCHMARK,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
# Utility functions
# ═══════════════════════════════════════════════════════════════════════

def normalize_datetime_index(obj, normalize: bool = True, drop_tz: bool = True):
    out = obj.copy()
    idx = pd.to_datetime(out.index, errors="coerce")
    if getattr(idx, "tz", None) is not None and drop_tz:
        idx = idx.tz_localize(None)
    if normalize:
        idx = idx.normalize()
    out.index = idx
    out = out[~pd.isna(out.index)]
    out = out[~out.index.duplicated(keep="last")]
    return out.sort_index()


def rolling_zscore(s: pd.Series, win: int) -> pd.Series:
    mu = s.rolling(win).mean()
    sd = s.rolling(win).std()
    return (s - mu) / sd


def clip_score(x, lo: float = -2.0, hi: float = 2.0):
    return np.clip(x, lo, hi) / hi


def safe_log_returns(s: pd.Series) -> pd.Series:
    return np.log(s).diff()


def rolling_beta(y: pd.Series, x: pd.Series, win: int = 60) -> pd.Series:
    cov = y.rolling(win).cov(x)
    var = x.rolling(win).var()
    return cov / var


def basket_index_equal(prices: pd.DataFrame, base: float = 100.0) -> pd.Series:
    r = prices.pct_change()
    w = pd.Series(1.0 / len(prices.columns), index=prices.columns)
    basket_ret = (r @ w).fillna(0.0)
    return (1 + basket_ret).cumprod() * base


def normalize_weights(d: dict) -> dict:
    s = pd.Series(d, dtype=float).clip(lower=0.0)
    tot = s.sum()
    if tot <= 0:
        return s.to_dict()
    return (s / tot).to_dict()


# ═══════════════════════════════════════════════════════════════════════
# State machine primitives
# ═══════════════════════════════════════════════════════════════════════

def state_to_num(state: str) -> int:
    return STATE_ORDER.index(state)


def num_to_state(num: int) -> str:
    return STATE_ORDER[int(num)]


def score_to_state(score):
    if pd.isna(score):
        return np.nan
    if score <= -0.50:
        return "Defensive"
    if score <= 0.00:
        return "Fragile"
    if score <= 0.50:
        return "Recovery"
    return "Expansion"


def smooth_state_series(raw: pd.Series, upgrade_days: int = 3, downgrade_days: int = 1) -> pd.Series:
    """Confirm-based smoothing: upgrade only after `upgrade_days` of consistent
    higher state, downgrade after `downgrade_days`. NaN inputs inherit the
    current state."""
    vals = raw.tolist()
    smoothed = []
    current = None
    pending = None
    pending_count = 0
    for st in vals:
        if pd.isna(st):
            smoothed.append(current if current is not None else np.nan)
            continue
        if current is None:
            current = st
            pending = None
            pending_count = 0
            smoothed.append(current)
            continue
        if st == current:
            pending = None
            pending_count = 0
            smoothed.append(current)
            continue
        is_upgrade = state_to_num(st) > state_to_num(current)
        needed = upgrade_days if is_upgrade else downgrade_days
        if pending == st:
            pending_count += 1
        else:
            pending = st
            pending_count = 1
        if pending_count >= needed:
            current = st
            pending = None
            pending_count = 0
        smoothed.append(current)
    return pd.Series(smoothed, index=raw.index)


# ═══════════════════════════════════════════════════════════════════════
# Layer 0 — Structural (business cycle)
# ═══════════════════════════════════════════════════════════════════════

def map_quality_band(x):
    if pd.isna(x):
        return 0.0
    s = str(x).strip().lower()
    if "high" in s:
        return 0.30
    if "moderate" in s or "medium" in s:
        return 0.10
    if "low" in s:
        return -0.15
    return 0.0


def map_business_cycle_to_state(row: pd.Series):
    """Rule-based mapping from a business-cycle row (phase/growth_regime/macro_stance
    /recession_overlay/recession_risk_score) to the structural state."""
    phase_raw = row.get("phase", np.nan)
    growth_raw = row.get("growth_regime", np.nan)
    stance_raw = row.get("macro_stance", np.nan)
    overlay_raw = row.get("recession_overlay", np.nan)
    rr = pd.to_numeric(row.get("recession_risk_score", np.nan), errors="coerce")

    if pd.isna(phase_raw) and pd.isna(growth_raw) and pd.isna(stance_raw) and pd.isna(overlay_raw):
        return np.nan

    phase = "" if pd.isna(phase_raw) else str(phase_raw).strip().lower()
    growth = "" if pd.isna(growth_raw) else str(growth_raw).strip().lower()
    stance = "" if pd.isna(stance_raw) else str(stance_raw).strip().lower()
    overlay = "" if pd.isna(overlay_raw) else str(overlay_raw).strip().lower()

    # Defensive
    if "on" in overlay or ("recession" in overlay and "off" not in overlay):
        return "Defensive"
    if "contraction" in growth:
        return "Defensive"
    if phase in ["slowdown", "downturn"] and pd.notna(rr) and rr >= 55:
        return "Defensive"

    # Expansion
    if phase == "expansion" and "reacceleration" in growth:
        return "Expansion"
    if "broadening expansion" in stance or "reacceleration" in growth:
        return "Expansion"

    # Recovery
    if phase == "recovery":
        return "Recovery"
    if "repair" in stance or "recovery" in stance:
        return "Recovery"

    # Fragile
    if "cooling" in growth or "soft patch" in growth:
        return "Fragile"
    if phase in ["slowdown", "downturn"]:
        return "Fragile"
    if "below-par" in stance or "cooling" in stance or "soft patch" in stance:
        return "Fragile"

    # Fallback when at least some information is present
    if phase or growth or stance or overlay or pd.notna(rr):
        return "Recovery"

    return np.nan


def structural_quality_components(df: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    out["phase_conf_component"] = clip_score((pd.to_numeric(df.get("phase_confidence_score"), errors="coerce") - 50.0) / 25.0)
    out["sync_component"] = clip_score((pd.to_numeric(df.get("cycle_sync_score"), errors="coerce") - 50.0) / 25.0)
    out["transition_component"] = clip_score((50.0 - pd.to_numeric(df.get("transition_risk_score"), errors="coerce")) / 25.0)
    out["recession_component"] = clip_score((50.0 - pd.to_numeric(df.get("recession_risk_score"), errors="coerce")) / 25.0)

    quality_candidates = [c for c in df.columns if "quality" in str(c).lower() and df[c].dtype == object]
    if quality_candidates:
        quality_bonus = pd.Series(0.0, index=df.index)
        for c in quality_candidates[:2]:
            quality_bonus = quality_bonus.add(df[c].map(map_quality_band).fillna(0), fill_value=0)
        out["text_quality_component"] = quality_bonus
    else:
        out["text_quality_component"] = 0.0

    return out


def structural_confidence_label(score):
    if pd.isna(score):
        return np.nan
    if score >= 0.20:
        return "High"
    if score >= -0.15:
        return "Medium"
    return "Low"


def compute_structural_layer(
    bc_df: pd.DataFrame,
    market_calendar: pd.DatetimeIndex,
) -> pd.DataFrame:
    """Layer 0 — structural state from business-cycle data.

    Smoothing happens on the native (monthly) business-cycle cadence *before*
    alignment to the daily market calendar, so the structural layer stays
    slow and avoids whipsaw from daily ffill.

    `bc_df` must be indexed by date and contain the columns exported by the
    v11 business-cycle framework (phase, growth_regime, macro_stance,
    recession_overlay, phase_confidence_score, cycle_sync_score, etc.).
    """
    structural_native = normalize_datetime_index(bc_df.copy())
    structural_native["structural_state_raw"] = structural_native.apply(map_business_cycle_to_state, axis=1)

    sq = structural_quality_components(structural_native)
    structural_native = pd.concat([structural_native, sq], axis=1)
    structural_native["structural_quality_score"] = (
        0.35 * structural_native["phase_conf_component"].fillna(0)
        + 0.20 * structural_native["sync_component"].fillna(0)
        + 0.20 * structural_native["transition_component"].fillna(0)
        + 0.20 * structural_native["recession_component"].fillna(0)
        + 0.05 * structural_native["text_quality_component"].fillna(0)
    )
    structural_native["structural_confidence"] = structural_native["structural_quality_score"].apply(structural_confidence_label)

    # Native-cadence smoothing (the structural layer should be slow)
    structural_native["structural_state"] = smooth_state_series(
        structural_native["structural_state_raw"],
        upgrade_days=STRUCTURAL_UPGRADE_PERIODS,
        downgrade_days=STRUCTURAL_DOWNGRADE_PERIODS,
    )
    structural_native["structural_score_raw"] = structural_native["structural_state"].map(STATE_SCORE_MAP)
    structural_native["structural_score"] = np.clip(
        structural_native["structural_score_raw"] + 0.15 * structural_native["structural_quality_score"].fillna(0),
        -1.0, 1.0,
    )

    structural_df = structural_native.reindex(market_calendar).ffill(limit=STRUCTURAL_FFILL_LIMIT)
    return structural_df


# ═══════════════════════════════════════════════════════════════════════
# Layer 1 — Market expression
# ═══════════════════════════════════════════════════════════════════════

def unified_ratio(prices: pd.DataFrame) -> pd.DataFrame:
    risk_on = [t for t in RISK_ON if t in prices.columns]
    risk_off = [t for t in RISK_OFF if t in prices.columns]
    px_on = prices[risk_on].dropna(how="any")
    px_off = prices[risk_off].dropna(how="any")
    common_idx = px_on.index.intersection(px_off.index)
    idx_on = basket_index_equal(px_on.loc[common_idx])
    idx_off = basket_index_equal(px_off.loc[common_idx])
    out = pd.DataFrame(index=common_idx)
    out["Unified"] = idx_on / idx_off
    out["Unified_log"] = np.log(out["Unified"])
    out[f"MA{FAST_MA}"] = out["Unified"].rolling(FAST_MA).mean()
    out[f"MA{SLOW_MA}"] = out["Unified"].rolling(SLOW_MA).mean()
    out["market_regime"] = np.where(out[f"MA{FAST_MA}"] > out[f"MA{SLOW_MA}"], "Risk-On", "Risk-Off")
    return out


def relative_return_matrix(prices: pd.DataFrame, lookback: int) -> pd.DataFrame:
    px = prices.dropna(how="any")
    if len(px) <= lookback:
        return pd.DataFrame(index=px.columns, columns=px.columns, dtype=float)
    logp_now = np.log(px.iloc[-1])
    logp_then = np.log(px.shift(lookback).iloc[-1])
    rL = logp_now - logp_then
    M = pd.DataFrame(0.0, index=px.columns, columns=px.columns)
    for i in px.columns:
        for j in px.columns:
            if i != j:
                M.loc[i, j] = rL[i] - rL[j]
    return M


def risk_dominance_score(M: pd.DataFrame) -> float:
    vals = []
    for i in RISK_ON:
        for j in RISK_OFF:
            if i in M.index and j in M.columns:
                vals.append(M.loc[i, j])
    if not vals:
        return np.nan
    return float(np.mean(vals))


def compute_market_expression_layer(
    fsi_series: pd.Series,
    prices_core: pd.DataFrame,
    market_calendar: pd.DatetimeIndex,
) -> pd.DataFrame:
    """Layer 1 — Market expression. Combines FSI, unified risk-on/off ratio
    and 20-day rotation bias into a single market state."""
    fsi_aligned = fsi_series.reindex(market_calendar).ffill(limit=FSI_FFILL_LIMIT)
    uni = normalize_datetime_index(unified_ratio(prices_core)).reindex(market_calendar)

    macro_panel = pd.concat([
        fsi_aligned.rename("FSI_raw"),
        uni["Unified_log"].rename("Unified_log"),
    ], axis=1).dropna()

    orientation_corr = macro_panel["FSI_raw"].corr(macro_panel["Unified_log"]) if len(macro_panel) else np.nan
    orientation = 1.0 if pd.notna(orientation_corr) and orientation_corr >= 0 else -1.0

    market_df = pd.DataFrame(index=market_calendar)
    market_df["FSI_raw"] = fsi_aligned
    market_df["FSI_oriented"] = orientation * market_df["FSI_raw"]
    market_df["FSI_z"] = rolling_zscore(market_df["FSI_oriented"], FSI_Z_WIN)
    market_df["FSI_slope_20"] = market_df["FSI_oriented"].diff(20)
    fsi_std = market_df["FSI_oriented"].rolling(60).std()
    market_df["FSI_score"] = (
        0.65 * clip_score(market_df["FSI_z"])
        + 0.35 * clip_score(market_df["FSI_slope_20"] / fsi_std)
    )

    # Rotation bias
    rot_vals = []
    for t in range(2 * ROT_LOOKBACK, len(market_calendar)):
        dt = market_calendar[t]
        px = prices_core.loc[:dt].dropna(how="any")
        M = relative_return_matrix(px, ROT_LOOKBACK)
        edge = risk_dominance_score(M)
        rot_vals.append({"date": dt, "delta_to_risk_on": edge})
    rot_df = pd.DataFrame(rot_vals).set_index("date") if rot_vals else pd.DataFrame(columns=["delta_to_risk_on"])
    rot_df = rot_df.reindex(market_calendar)

    market_df = pd.concat([
        market_df,
        uni[["Unified", "Unified_log", "market_regime"]],
        rot_df[["delta_to_risk_on"]],
    ], axis=1)

    market_df["unified_score"] = clip_score(rolling_zscore(market_df["Unified_log"], FSI_Z_WIN))
    market_df["rotation_score"] = clip_score(rolling_zscore(market_df["delta_to_risk_on"], FSI_Z_WIN))
    market_df["market_score_raw"] = (
        0.50 * market_df["FSI_score"].fillna(0)
        + 0.35 * market_df["unified_score"].fillna(0)
        + 0.15 * market_df["rotation_score"].fillna(0)
    )
    market_df["market_state_raw"] = market_df["market_score_raw"].apply(score_to_state)
    market_df["market_state"] = smooth_state_series(
        market_df["market_state_raw"], UPGRADE_CONFIRM_DAYS, DOWNGRADE_CONFIRM_DAYS
    )
    market_df["market_score"] = market_df["market_state"].map(STATE_SCORE_MAP)

    return market_df


# ═══════════════════════════════════════════════════════════════════════
# Layer 2 — Crypto
# ═══════════════════════════════════════════════════════════════════════

def compute_crypto_layer(
    btc_trend: pd.DataFrame,
    market_calendar: pd.DatetimeIndex,
) -> pd.DataFrame:
    """Layer 2 — per-profile crypto state. Smoothing is applied on the native
    trend cadence before alignment to the market calendar (to avoid scoring
    ffilled stale values).

    Returns the profile-crypto table with columns:
      {profile}_crypto_score_raw, {profile}_crypto_state_raw,
      {profile}_crypto_state,     {profile}_crypto_score
    """
    crypto_native = btc_trend.copy()

    for col in PROFILE_MAP.values():
        if col in crypto_native.columns:
            crypto_native[col] = pd.to_numeric(crypto_native[col], errors="coerce")

    for col in PROFILE_MAP.values():
        if col not in crypto_native.columns:
            continue
        crypto_native[f"{col}_z"] = rolling_zscore(crypto_native[col], CRYPTO_Z_WIN)
        crypto_native[f"{col}_slope_20"] = crypto_native[col].diff(20)
        denom = crypto_native[col].rolling(60).std()
        crypto_native[f"{col}_score_raw"] = (
            0.70 * clip_score(crypto_native[f"{col}_z"])
            + 0.30 * clip_score(crypto_native[f"{col}_slope_20"] / denom)
        )
        crypto_native[f"{col}_state_raw"] = crypto_native[f"{col}_score_raw"].apply(score_to_state)
        crypto_native[f"{col}_state"] = smooth_state_series(
            crypto_native[f"{col}_state_raw"], UPGRADE_CONFIRM_DAYS, DOWNGRADE_CONFIRM_DAYS
        )
        crypto_native[f"{col}_score"] = crypto_native[f"{col}_state"].map(STATE_SCORE_MAP)

    # Align to market calendar with limited forward-fill
    crypto_df = crypto_native.reindex(market_calendar).ffill(limit=TREND_FFILL_LIMIT)

    profile_table = pd.DataFrame(index=market_calendar)
    for profile, col in PROFILE_MAP.items():
        if col not in crypto_df.columns:
            continue
        profile_table[f"{profile}_crypto_score_raw"] = crypto_df[f"{col}_score_raw"]
        profile_table[f"{profile}_crypto_state_raw"] = crypto_df[f"{col}_state_raw"]
        profile_table[f"{profile}_crypto_state"] = crypto_df[f"{col}_state"]
        profile_table[f"{profile}_crypto_score"] = crypto_df[f"{col}_score"]

    return profile_table


# ═══════════════════════════════════════════════════════════════════════
# Layer 3 — Bridge / confirmation
# ═══════════════════════════════════════════════════════════════════════

def compute_obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    sign = np.sign(close.diff()).fillna(0.0)
    return (sign * volume.fillna(0.0)).cumsum()


def compute_spread(obv: pd.Series, length: int = 20):
    sma = obv.rolling(length).mean()
    return obv - sma, sma


def compute_rrg(price_df: pd.DataFrame, benchmark: pd.Series, ratio_span: int = 20, mom_span: int = 10) -> pd.DataFrame:
    benchmark = benchmark.reindex(price_df.index).ffill()
    rs = (price_df.div(benchmark / 100.0, axis=0)).ewm(span=ratio_span, adjust=False).mean()
    rel_ratio = 100 + ((rs - rs.mean()) / rs.std())
    rs_momentum = rel_ratio.pct_change().ewm(span=mom_span, adjust=False).mean()
    momentum = 100 + (rs_momentum / rs_momentum.std())
    out = []
    for col in rel_ratio.columns:
        tmp = pd.DataFrame({
            "Date": rel_ratio.index,
            "Ticker": col,
            "Ratio": rel_ratio[col].values,
            "Momentum": momentum[col].values,
        })
        tmp["Composite"] = tmp["Ratio"] + tmp["Momentum"]
        out.append(tmp)
    return pd.concat(out, ignore_index=True)


def rrg_time_series_score(rrg_df: pd.DataFrame, growth_like: set, defensive_like: set) -> pd.DataFrame:
    rows = []
    for dt, grp in rrg_df.groupby("Date"):
        g = grp.sort_values("Composite", ascending=False).copy()
        g["Rank"] = range(1, len(g) + 1)
        n = max(len(g) - 1, 1)
        score = 0.0
        total_wt = 0.0
        for _, row in g.iterrows():
            rank_score = (len(g) - row["Rank"]) / n
            if row["Ticker"] in growth_like:
                score += rank_score
                total_wt += 1.0
            elif row["Ticker"] in defensive_like:
                score -= rank_score
                total_wt += 1.0
        rows.append({"Date": dt, "rrg_score_component": score / total_wt if total_wt else 0.0})
    return pd.DataFrame(rows).set_index("Date").sort_index()


def compute_bridge_layer(
    close_all: pd.DataFrame,
    volume_all: pd.DataFrame,
    btc_px: pd.Series,
    nasdaq_px: pd.Series,
    dxy_px: pd.Series,
    market_calendar: pd.DatetimeIndex,
) -> pd.DataFrame:
    """Layer 3 — bridge confirmation (OBV + beta context + RRG).

    v2 patch: beta_context_score is computed on the native beta history
    *first* and only then aligned to the market calendar with a bounded
    forward-fill. This avoids the v1 bug where the beta z-score was being
    computed on a calendar that contained NaNs before the first valid beta.
    """
    # OBV bridge
    obv_rows = []
    for label, ticker in OBV_UNIVERSE.items():
        if ticker not in close_all.columns:
            continue
        px = close_all[ticker].reindex(market_calendar).dropna()
        vol = volume_all[ticker].reindex(px.index).fillna(0.0) if ticker in volume_all.columns else pd.Series(0.0, index=px.index)
        if len(px) < max(OBV_SMA_LEN + 5, 80):
            continue
        obv = compute_obv(px, vol)
        spread, _ = compute_spread(obv, OBV_SMA_LEN)
        spread_mom = spread.diff(ROC_LEN)
        tmp = pd.DataFrame(index=spread.index)
        tmp[label] = 0.6 * clip_score(rolling_zscore(spread, 126)) + 0.4 * clip_score(rolling_zscore(spread_mom, 126))
        obv_rows.append(tmp)

    obv_panel = pd.concat(obv_rows, axis=1).sort_index() if obv_rows else pd.DataFrame(index=market_calendar)
    obv_panel = obv_panel.reindex(market_calendar)
    obv_summary = pd.DataFrame(index=market_calendar)
    obv_summary["obv_score"] = obv_panel.mean(axis=1) if len(obv_panel.columns) else np.nan
    risk_cols = [c for c in ["Bitcoin", "S&P 500", "Nasdaq 100", "Small Caps"] if c in obv_panel.columns]
    obv_summary["obv_risk_confirmation"] = obv_panel[risk_cols].mean(axis=1) if risk_cols else obv_summary["obv_score"]

    # Beta context — compute on native beta history, then align
    rets = pd.concat([
        safe_log_returns(btc_px).rename("BTC"),
        safe_log_returns(nasdaq_px).rename("NASDAQ"),
        safe_log_returns(dxy_px).rename("DXY"),
    ], axis=1).dropna()

    beta_native = pd.DataFrame(index=rets.index)
    if len(rets) > BETA_WINDOW:
        beta_native["beta_BTC_to_NASDAQ"] = rolling_beta(rets["BTC"], rets["NASDAQ"], BETA_WINDOW)
        beta_native["beta_BTC_to_DXY"] = rolling_beta(rets["BTC"], rets["DXY"], BETA_WINDOW)
        beta_native["beta_context_score"] = (
            -0.6 * clip_score(rolling_zscore(beta_native["beta_BTC_to_NASDAQ"], BETA_Z_WIN))
            + -0.4 * clip_score(rolling_zscore(beta_native["beta_BTC_to_DXY"].abs(), BETA_Z_WIN))
        )
    else:
        beta_native["beta_BTC_to_NASDAQ"] = np.nan
        beta_native["beta_BTC_to_DXY"] = np.nan
        beta_native["beta_context_score"] = np.nan

    beta_context = beta_native.reindex(market_calendar).ffill(limit=BRIDGE_FFILL_LIMIT)

    # Dynamic RRG
    sector_tickers = [t for t in SECTOR_ETFS if t in close_all.columns]
    cross_tickers = [t for t in RRG_CROSS_ASSETS if t in close_all.columns]
    benchmark_series = close_all[RRG_BENCHMARK].reindex(market_calendar) if RRG_BENCHMARK in close_all.columns else None

    rrg_sector_score = pd.DataFrame(index=market_calendar, columns=["rrg_score_component"])
    rrg_cross_score = pd.DataFrame(index=market_calendar, columns=["rrg_score_component"])

    if benchmark_series is not None and len(sector_tickers) > 2:
        sector_px = close_all[sector_tickers].reindex(market_calendar)
        rrg_s = compute_rrg(sector_px, benchmark_series, RRG_RATIO_SPAN, RRG_MOM_SPAN)
        rrg_sector_score = rrg_time_series_score(rrg_s, RRG_GROWTH_LIKE, RRG_DEFENSIVE_LIKE)

    if benchmark_series is not None and len(cross_tickers) > 2:
        cross_px = close_all[cross_tickers].reindex(market_calendar)
        rrg_c = compute_rrg(cross_px, benchmark_series, RRG_RATIO_SPAN, RRG_MOM_SPAN)
        rrg_cross_score = rrg_time_series_score(rrg_c, RRG_GROWTH_LIKE, RRG_DEFENSIVE_LIKE)

    # Combine bridge
    bridge_df = pd.DataFrame(index=market_calendar)
    bridge_df["obv_score"] = obv_summary["obv_score"]
    bridge_df["obv_risk_confirmation"] = obv_summary["obv_risk_confirmation"]
    bridge_df["beta_BTC_to_NASDAQ"] = beta_context["beta_BTC_to_NASDAQ"]
    bridge_df["beta_BTC_to_DXY"] = beta_context["beta_BTC_to_DXY"]
    bridge_df["beta_context_score"] = beta_context["beta_context_score"]
    bridge_df["rrg_sector_score"] = rrg_sector_score["rrg_score_component"].reindex(market_calendar)
    bridge_df["rrg_cross_score"] = rrg_cross_score["rrg_score_component"].reindex(market_calendar)
    bridge_df["rrg_score"] = (
        0.50 * bridge_df["rrg_sector_score"].fillna(0)
        + 0.50 * bridge_df["rrg_cross_score"].fillna(0)
    )

    bridge_df["bridge_score_raw"] = (
        0.35 * bridge_df["obv_risk_confirmation"].fillna(0)
        + 0.15 * bridge_df["obv_score"].fillna(0)
        + 0.20 * bridge_df["beta_context_score"].fillna(0)
        + 0.15 * clip_score(bridge_df["rrg_sector_score"]).fillna(0)
        + 0.15 * clip_score(bridge_df["rrg_cross_score"]).fillna(0)
    )
    bridge_df["bridge_confidence"] = pd.cut(
        bridge_df["bridge_score_raw"],
        bins=[-np.inf, -0.20, 0.20, np.inf],
        labels=["Low", "Medium", "High"],
    ).astype(object)
    bridge_df["bridge_score"] = bridge_df["bridge_score_raw"]

    return bridge_df


# ═══════════════════════════════════════════════════════════════════════
# PSM state composition
# ═══════════════════════════════════════════════════════════════════════

def setup_class(structural_state, market_state, crypto_state, bridge_conf, final_state) -> str:
    if any(pd.isna(x) for x in [structural_state, market_state, crypto_state, bridge_conf, final_state]):
        return "Insufficient data"
    s = state_to_num(structural_state)
    m = state_to_num(market_state)
    c = state_to_num(crypto_state)

    if structural_state == "Defensive" and market_state == "Defensive":
        return "Defensive breakdown"
    if s >= 2 and m >= 2 and c >= 2 and bridge_conf == "High":
        return "Broad expansion"
    if s in [0, 1] and m >= 2 and c == 3:
        return "Crypto-led tactical"
    if s >= 2 and c <= 1 and m >= 2:
        return "Macro support but crypto lagging"
    if structural_state in ["Recovery", "Expansion"] and market_state == "Recovery" and c >= 2 and bridge_conf in ["Medium", "High"]:
        return "Emerging recovery"
    if structural_state == "Expansion" and final_state == "Expansion" and bridge_conf != "High":
        return "Constructive but selective"
    if structural_state == "Fragile" or market_state == "Fragile":
        return "Mixed transition"
    return "Balanced recovery"


def alignment_penalty(structural_state, market_state, crypto_state, bridge_conf) -> float:
    if any(pd.isna(x) for x in [structural_state, market_state, crypto_state]):
        return 0.0
    s = state_to_num(structural_state)
    m = state_to_num(market_state)
    c = state_to_num(crypto_state)
    score = 0.0
    if abs(m - s) >= 2:
        score -= 0.08 if bridge_conf == "Medium" else 0.12 if bridge_conf == "Low" else 0.04
    if abs(c - s) >= 2:
        score -= 0.08 if bridge_conf == "Medium" else 0.12 if bridge_conf == "Low" else 0.04
    return score


def bridge_boost(bridge_conf, setup, final_state) -> float:
    if bridge_conf == "High" and setup in ["Broad expansion", "Emerging recovery"] and final_state in ["Recovery", "Expansion"]:
        return 0.06
    if bridge_conf == "Low" and setup in ["Mixed transition", "Crypto-led tactical", "Defensive breakdown"]:
        return -0.06
    return 0.0


def overall_confidence_label(structural_conf, bridge_conf, structural_state, market_state, crypto_state) -> str:
    if any(pd.isna(x) for x in [structural_state, market_state, crypto_state, structural_conf, bridge_conf]):
        return "Low"
    spread = max(state_to_num(structural_state), state_to_num(market_state), state_to_num(crypto_state)) - min(
        state_to_num(structural_state), state_to_num(market_state), state_to_num(crypto_state)
    )
    score = {"Low": -1, "Medium": 0, "High": 1}[structural_conf] + {"Low": -1, "Medium": 0, "High": 1}[bridge_conf]
    if spread <= 1 and score >= 1:
        return "High"
    if spread >= 2 and score <= -1:
        return "Low"
    return "Medium"


def governor_state(structural_state, structural_conf, candidate_state, profile, horizon, setup) -> str:
    """Structural governor — caps/floors the candidate final state based on the
    structural regime and its confidence. The Aggressive/Short-term/Crypto-led
    case is the only exception that can lift the cap by one notch."""
    if pd.isna(structural_state) or pd.isna(candidate_state) or pd.isna(structural_conf):
        return candidate_state
    cap = STRUCTURAL_CAPS[structural_conf][structural_state]
    floor = STRUCTURAL_FLOORS[structural_conf][structural_state]

    cap_num = state_to_num(cap)
    floor_num = state_to_num(floor)
    cand_num = state_to_num(candidate_state)

    if profile == "Aggressive" and horizon == "Short term" and setup == "Crypto-led tactical":
        boost_cap = state_to_num("Recovery") if structural_state in ["Defensive", "Fragile"] else 3
        cap_num = min(cap_num + 1, boost_cap)

    governed_num = max(floor_num, min(cand_num, cap_num))
    return num_to_state(governed_num)


def deployment_level(profile, horizon, setup, final_state, structural_state, overall_conf) -> float:
    base = {"Defensive": 0.20, "Fragile": 0.40, "Recovery": 0.65, "Expansion": 0.85}[final_state]
    profile_adj = {"Conservative": -0.10, "Moderate": 0.00, "Aggressive": 0.10}[profile]
    horizon_adj = {"Short term": -0.05, "Mid term": 0.00, "Long term": 0.05}[horizon]
    conf_adj = {"Low": -0.10, "Medium": 0.00, "High": 0.08}[overall_conf]
    setup_adj = {
        "Broad expansion": 0.08,
        "Emerging recovery": 0.03,
        "Balanced recovery": 0.02,
        "Constructive but selective": 0.00,
        "Mixed transition": -0.05,
        "Crypto-led tactical": -0.07,
        "Macro support but crypto lagging": -0.08,
        "Defensive breakdown": -0.10,
        "Insufficient data": -0.20,
    }[setup]
    structural_adj = {
        "Defensive": -0.08,
        "Fragile": -0.03,
        "Recovery": 0.03,
        "Expansion": 0.06,
    }[structural_state]
    return float(np.clip(base + profile_adj + horizon_adj + conf_adj + setup_adj + structural_adj, 0.05, 0.95))


def build_sleeve_weights(profile, horizon, final_state, setup, structural_state, bridge_conf) -> dict:
    base = pd.Series(BASE_SLEEVES[final_state], dtype=float)
    base = base.add(pd.Series(PROFILE_SLEEVE_ADJ[profile]), fill_value=0.0)
    base = base.add(pd.Series(HORIZON_SLEEVE_ADJ[horizon]), fill_value=0.0)

    if setup == "Crypto-led tactical":
        base["Tactical"] += 0.08
        base["Growth"] -= 0.04
        base["Safety"] += 0.02
        base["Cash_or_Ballast"] -= 0.06
    elif setup == "Macro support but crypto lagging":
        base["Safety"] += 0.05
        base["Growth"] -= 0.05
    elif setup == "Broad expansion":
        base["Growth"] += 0.05
        base["Cash_or_Ballast"] -= 0.03
        base["Safety"] -= 0.02
    elif setup == "Mixed transition":
        base["Cash_or_Ballast"] += 0.05
        base["Growth"] -= 0.03
        base["Tactical"] -= 0.02
    elif setup == "Defensive breakdown":
        base["Safety"] += 0.05
        base["Cash_or_Ballast"] += 0.05
        base["Growth"] -= 0.07
        base["Tactical"] -= 0.03

    if structural_state == "Defensive":
        base["Safety"] += 0.03
        base["Cash_or_Ballast"] += 0.02
        base["Growth"] -= 0.05
    elif structural_state == "Expansion":
        base["Growth"] += 0.03
        base["Cash_or_Ballast"] -= 0.02
        base["Safety"] -= 0.01

    if bridge_conf == "High":
        base["Growth"] += 0.03
        base["Cash_or_Ballast"] -= 0.03
    elif bridge_conf == "Low":
        base["Safety"] += 0.03
        base["Cash_or_Ballast"] += 0.02
        base["Growth"] -= 0.05

    return normalize_weights(base.to_dict())


def state_probabilities(final_score: float, overall_conf: str) -> dict:
    conf_boost = {"Low": 0.85, "Medium": 1.00, "High": 1.15}.get(overall_conf, 1.0)
    bullish = 1 / (1 + math.exp(-3.0 * final_score * conf_boost))
    bearish = 1 / (1 + math.exp(3.0 * final_score * conf_boost))
    neutral = max(0.0, 1.0 - abs(final_score) * 0.9)
    s = bullish + bearish + neutral
    return {"Bearish": bearish / s, "Neutral": neutral / s, "Bullish": bullish / s}


def recommendation_bundle(profile, horizon, structural_state, structural_conf,
                          market_state, crypto_state, bridge_conf, final_state, setup) -> dict:
    if any(pd.isna(x) for x in [structural_state, market_state, crypto_state, bridge_conf, final_state]):
        return {
            "action_bucket": "Insufficient data",
            "stance": "Unknown",
            "recommendation": "Some required inputs are missing, so the framework cannot produce a reliable recommendation.",
            "mismatch_note": "Missing state inputs.",
            "bridge_note": "Bridge confidence unavailable.",
            "upgrade_trigger": "Wait for valid structural, market, crypto, and bridge inputs.",
            "downgrade_trigger": "N/A",
        }

    _action_map = {
        "Defensive breakdown": {
            "Conservative": "Preserve capital / core only",
            "Moderate": "Reduce risk / stay defensive",
            "Aggressive": "Tactical only / cut size",
        },
        "Crypto-led tactical": {
            "Conservative": "Observe / do not chase",
            "Moderate": "Selective tactical exposure",
            "Aggressive": "Tactical participation only",
        },
        "Macro support but crypto lagging": {
            "Conservative": "Wait for crypto confirmation",
            "Moderate": "Add only to quality leaders",
            "Aggressive": "Selective build / avoid full deployment",
        },
        "Broad expansion": {
            "Conservative": "Broaden exposure gradually",
            "Moderate": "Expand exposure",
            "Aggressive": "Lean offensive",
        },
        "Emerging recovery": {
            "Conservative": "Start small / quality first",
            "Moderate": "Scale selectively",
            "Aggressive": "Add risk gradually",
        },
        "Mixed transition": {
            "Conservative": "Stay selective / wait",
            "Moderate": "Selective exposure",
            "Aggressive": "Trade tactically / controlled size",
        },
    }
    if setup in _action_map:
        action_bucket = _action_map[setup][profile]
    else:
        action_bucket = {
            "Defensive": "Cut risk / preserve capital",
            "Fragile": "Stay selective / wait for confirmation",
            "Recovery": "Add risk gradually",
            "Expansion": "Expand exposure",
        }[final_state]

    stance = {
        "Defensive": "Defensive",
        "Fragile": "Cautious",
        "Recovery": "Re-risking",
        "Expansion": "Offensive",
    }[final_state]

    s_num = state_to_num(structural_state)
    m_num = state_to_num(market_state)
    c_num = state_to_num(crypto_state)

    if c_num - s_num >= 2:
        mismatch_note = "Crypto is materially stronger than the structural macro backdrop, so strength should be treated as more tactical unless confirmation improves."
    elif s_num - c_num >= 2:
        mismatch_note = "Structural macro is stronger than crypto structure, so avoid assuming macro improvement alone is enough."
    elif abs(m_num - s_num) >= 2:
        mismatch_note = "Market expression is materially different from the structural regime, so treat the move with extra skepticism."
    else:
        mismatch_note = "Structural macro, market expression, and crypto are broadly aligned."

    bridge_notes = {
        "High": "Confirmation is strong and supports acting on the signal.",
        "Medium": "Confirmation is mixed, so sizing should stay measured.",
        "Low": "Confirmation is weak, so conviction should stay low and entries should be selective.",
    }
    bridge_note = bridge_notes.get(bridge_conf, "")

    intro = {
        "Conservative": "For a conservative profile, capital preservation stays central.",
        "Moderate": "For a moderate profile, the goal is balanced participation.",
        "Aggressive": "For an aggressive profile, the framework allows more offense but still requires discipline.",
    }[profile]

    horizon_text = {
        "Short term": "Over the next few weeks",
        "Mid term": "Over the next 1–3 months",
        "Long term": "Over the next 3–12 months",
    }[horizon]

    _rec_map = {
        "Defensive breakdown": f"{intro} {horizon_text}, the structural regime and market expression are both defensive, so keep exposure low and prioritize protection until the model exits Defensive.",
        "Crypto-led tactical": f"{intro} {horizon_text}, crypto is stronger than the structural macro backdrop, so any participation should be treated as tactical rather than structural.",
        "Macro support but crypto lagging": f"{intro} {horizon_text}, the structural regime is better than crypto structure, so wait for crypto confirmation before broad deployment.",
        "Broad expansion": f"{intro} {horizon_text}, structural macro, market expression, and crypto are aligned with strong confirmation, so broader participation is justified.",
        "Emerging recovery": f"{intro} {horizon_text}, the structure supports staged re-risking, adding to leadership gradually rather than all at once.",
        "Mixed transition": f"{intro} {horizon_text}, the regime is mixed, so keep exposure selective and demand confirmation before scaling.",
        "Constructive but selective": f"{intro} {horizon_text}, the backdrop is constructive but not fully broad, so focus on leadership rather than blanket beta.",
    }
    recommendation = _rec_map.get(setup, f"{intro} {horizon_text}, maintain a balanced stance that matches the current state and confirmation level.")

    if final_state in ("Defensive", "Fragile"):
        upgrade_trigger = "Upgrade if structural conditions remain stable or improve, market expression strengthens, crypto holds at least Recovery, and bridge confidence rises."
    else:
        upgrade_trigger = "Stay constructive while structural macro remains supportive, market expression does not roll over, and bridge confirmation stays intact."

    if final_state in ("Recovery", "Expansion"):
        downgrade_trigger = "Downgrade if structural macro weakens, market expression slips by one state, crypto weakens materially, or bridge confidence falls."
    else:
        downgrade_trigger = "Further de-risk if structural macro deteriorates, market expression weakens further, crypto loses one full state, or bridge remains weak."

    return {
        "action_bucket": action_bucket,
        "stance": stance,
        "recommendation": recommendation,
        "mismatch_note": mismatch_note,
        "bridge_note": bridge_note,
        "upgrade_trigger": upgrade_trigger,
        "downgrade_trigger": downgrade_trigger,
    }


# ═══════════════════════════════════════════════════════════════════════
# PSM assembly — combines all four layers
# ═══════════════════════════════════════════════════════════════════════

def _deployment_label(v: float) -> str:
    return (
        "Minimal" if v < 0.25 else
        "Measured" if v < 0.50 else
        "Active" if v < 0.75 else
        "Aggressive"
    )


def _enforce_profile_monotone_deployment(df: pd.DataFrame) -> pd.DataFrame:
    """Enforce Conservative ≤ Moderate ≤ Aggressive on `deployment_level`
    within each (date, horizon) group. Moderate is the anchor."""
    if df.empty or "deployment_level" not in df.columns:
        return df
    if not {"date", "horizon", "profile"}.issubset(df.columns):
        return df

    df = df.copy()
    for (_date, _horizon), grp in df.groupby(["date", "horizon"], sort=False):
        idx_by_profile = {row["profile"]: idx for idx, row in grp.iterrows()}
        if not {"Conservative", "Moderate", "Aggressive"}.issubset(idx_by_profile):
            continue

        c_idx = idx_by_profile["Conservative"]
        m_idx = idx_by_profile["Moderate"]
        a_idx = idx_by_profile["Aggressive"]

        c_val = float(df.at[c_idx, "deployment_level"])
        m_val = float(df.at[m_idx, "deployment_level"])
        a_val = float(df.at[a_idx, "deployment_level"])

        c_new = min(c_val, m_val)
        a_new = max(a_val, m_val)

        if c_new != c_val:
            df.at[c_idx, "deployment_level"] = c_new
            df.at[c_idx, "deployment_label"] = _deployment_label(c_new)
        if a_new != a_val:
            df.at[a_idx, "deployment_level"] = a_new
            df.at[a_idx, "deployment_label"] = _deployment_label(a_new)

    return df


def build_psm(
    structural_df: pd.DataFrame,
    market_df: pd.DataFrame,
    profile_crypto_table: pd.DataFrame,
    bridge_df: pd.DataFrame,
) -> pd.DataFrame:
    """Build the full PSM timeseries from the four v2 layers.

    Matches the output schema of `06_psm_full_timeseries.csv` from the v2 notebook.
    """
    psm_base = pd.concat([
        structural_df[[
            c for c in [
                "phase", "growth_regime", "macro_stance", "recession_overlay",
                "phase_confidence_score", "cycle_sync_score", "transition_risk_score", "recession_risk_score",
                "structural_state_raw", "structural_state", "structural_confidence", "structural_score",
            ] if c in structural_df.columns
        ]],
        market_df[[
            c for c in [
                "FSI_raw", "FSI_z", "FSI_score",
                "Unified_log", "delta_to_risk_on",
                "market_score_raw", "market_state_raw", "market_state", "market_score",
            ] if c in market_df.columns
        ]],
        profile_crypto_table,
        bridge_df[[
            c for c in [
                "obv_score", "obv_risk_confirmation",
                "beta_BTC_to_NASDAQ", "beta_BTC_to_DXY", "beta_context_score",
                "rrg_sector_score", "rrg_cross_score", "rrg_score",
                "bridge_score_raw", "bridge_confidence", "bridge_score",
            ] if c in bridge_df.columns
        ]],
    ], axis=1).sort_index()

    valid = (
        psm_base["structural_score"].notna()
        & psm_base["market_score"].notna()
        & psm_base["Conservative_crypto_score"].notna()
        & psm_base["Moderate_crypto_score"].notna()
        & psm_base["Aggressive_crypto_score"].notna()
        & psm_base["bridge_score"].notna()
    )
    psm_base_valid = psm_base[valid].copy()

    if psm_base_valid.empty:
        logger.warning("No valid PSM rows — all layers must have data on the same dates")
        return pd.DataFrame()

    records = []
    for dt, row in psm_base_valid.iterrows():
        for profile in PROFILE_MAP:
            crypto_score = row[f"{profile}_crypto_score"]
            crypto_state = row[f"{profile}_crypto_state"]

            for horizon, w in HORIZON_WEIGHTS.items():
                structural_component = w["structural"] * row["structural_score"]
                market_component = w["market"] * row["market_score"]
                crypto_component = w["crypto"] * crypto_score
                bridge_component = w["bridge"] * row["bridge_score"]
                bias_component = PROFILE_BIAS[profile]
                penalty_component = alignment_penalty(
                    row["structural_state"], row["market_state"], crypto_state, row["bridge_confidence"]
                )

                prelim_score = (
                    structural_component + market_component + crypto_component + bridge_component
                    + bias_component + penalty_component
                )
                prelim_state = score_to_state(prelim_score)
                prelim_setup = setup_class(
                    row["structural_state"], row["market_state"], crypto_state, row["bridge_confidence"], prelim_state
                )
                boost_component = bridge_boost(row["bridge_confidence"], prelim_setup, prelim_state)

                candidate_score = prelim_score + boost_component
                candidate_state = score_to_state(candidate_score)
                final_state = governor_state(
                    structural_state=row["structural_state"],
                    structural_conf=row["structural_confidence"],
                    candidate_state=candidate_state,
                    profile=profile,
                    horizon=horizon,
                    setup=prelim_setup,
                )
                final_score = STATE_SCORE_MAP[final_state] if pd.notna(final_state) else np.nan
                final_setup = setup_class(
                    row["structural_state"], row["market_state"], crypto_state, row["bridge_confidence"], final_state
                )
                overall_conf = overall_confidence_label(
                    structural_conf=row["structural_confidence"],
                    bridge_conf=row["bridge_confidence"],
                    structural_state=row["structural_state"],
                    market_state=row["market_state"],
                    crypto_state=crypto_state,
                )

                records.append({
                    "date": dt,
                    "profile": profile,
                    "horizon": horizon,
                    "structural_state": row["structural_state"],
                    "structural_confidence": row["structural_confidence"],
                    "market_state": row["market_state"],
                    "crypto_state": crypto_state,
                    "bridge_confidence": row["bridge_confidence"],
                    "structural_component": structural_component,
                    "market_component": market_component,
                    "crypto_component": crypto_component,
                    "bridge_component": bridge_component,
                    "bias_component": bias_component,
                    "penalty_component": penalty_component,
                    "boost_component": boost_component,
                    "prelim_score": prelim_score,
                    "prelim_state": prelim_state,
                    "candidate_state": candidate_state,
                    "final_state": final_state,
                    "final_score": final_score,
                    "setup_class": final_setup,
                    "overall_confidence": overall_conf,
                })

    psm = pd.DataFrame(records).sort_values(["date", "profile", "horizon"]).reset_index(drop=True)
    return enrich_psm(psm)


def enrich_psm(df: pd.DataFrame) -> pd.DataFrame:
    """Attach recommendation bundle, sleeves, probabilities, deployment to
    each PSM row."""
    rows = []
    for _, r in df.iterrows():
        bundle = recommendation_bundle(
            profile=r["profile"],
            horizon=r["horizon"],
            structural_state=r["structural_state"],
            structural_conf=r["structural_confidence"],
            market_state=r["market_state"],
            crypto_state=r["crypto_state"],
            bridge_conf=r["bridge_confidence"],
            final_state=r["final_state"],
            setup=r["setup_class"],
        )
        weights = build_sleeve_weights(
            profile=r["profile"],
            horizon=r["horizon"],
            final_state=r["final_state"],
            setup=r["setup_class"],
            structural_state=r["structural_state"],
            bridge_conf=r["bridge_confidence"],
        )
        probs = state_probabilities(r["final_score"], r["overall_confidence"])
        deploy = deployment_level(
            profile=r["profile"],
            horizon=r["horizon"],
            setup=r["setup_class"],
            final_state=r["final_state"],
            structural_state=r["structural_state"],
            overall_conf=r["overall_confidence"],
        )
        row = r.to_dict()
        row.update(bundle)
        # Drop the now-unused `stance` field coming from the bundle (v1 artefact)
        row.pop("stance", None)
        row.update({
            "deployment_level": deploy,
            "deployment_label": _deployment_label(deploy),
            "bullish_prob": probs["Bullish"],
            "neutral_prob": probs["Neutral"],
            "bearish_prob": probs["Bearish"],
        })
        row.update({f"sleeve_{k}": v for k, v in weights.items()})
        rows.append(row)

    return _enforce_profile_monotone_deployment(pd.DataFrame(rows))


def build_policy_matrix() -> pd.DataFrame:
    """Pre-compute the policy matrix for all state combinations.

    The v2 key is (profile, horizon, structural_state, crypto_state, bridge_confidence).
    Market state is not part of the key (it is a daily-varying input and the
    policy matrix is meant to be a static lookup on the slower-moving layers).

    We approximate market_state = structural_state for the policy lookup —
    this keeps the lookup consistent with the dominant governor behavior where
    the structural state drives the cap/floor.
    """
    rows = []
    for profile in PROFILE_MAP:
        for horizon, w in HORIZON_WEIGHTS.items():
            for structural_state in STATE_ORDER:
                for crypto_state in STATE_ORDER:
                    for bridge_conf in ["Low", "Medium", "High"]:
                        market_state = structural_state  # lookup approximation
                        structural_conf = "Medium"  # neutral assumption for the policy matrix

                        structural_component = w["structural"] * STATE_SCORE_MAP[structural_state]
                        market_component = w["market"] * STATE_SCORE_MAP[market_state]
                        crypto_component = w["crypto"] * STATE_SCORE_MAP[crypto_state]
                        bridge_component = w["bridge"] * BRIDGE_CONF_MAP[bridge_conf]
                        bias = PROFILE_BIAS[profile]
                        penalty = alignment_penalty(structural_state, market_state, crypto_state, bridge_conf)

                        prelim_score = structural_component + market_component + crypto_component + bridge_component + bias + penalty
                        prelim_state = score_to_state(prelim_score)
                        prelim_setup = setup_class(structural_state, market_state, crypto_state, bridge_conf, prelim_state)
                        boost = bridge_boost(bridge_conf, prelim_setup, prelim_state)
                        candidate_score = prelim_score + boost
                        candidate_state = score_to_state(candidate_score)
                        final_state = governor_state(
                            structural_state, structural_conf, candidate_state, profile, horizon, prelim_setup,
                        )
                        final_score = STATE_SCORE_MAP[final_state]
                        final_setup = setup_class(structural_state, market_state, crypto_state, bridge_conf, final_state)
                        overall_conf = overall_confidence_label(
                            structural_conf, bridge_conf, structural_state, market_state, crypto_state,
                        )
                        bundle = recommendation_bundle(
                            profile, horizon, structural_state, structural_conf,
                            market_state, crypto_state, bridge_conf, final_state, final_setup,
                        )
                        bundle.pop("stance", None)
                        weights = build_sleeve_weights(profile, horizon, final_state, final_setup, structural_state, bridge_conf)
                        probs = state_probabilities(final_score, overall_conf)
                        deploy = deployment_level(profile, horizon, final_setup, final_state, structural_state, overall_conf)

                        row = {
                            "profile": profile,
                            "horizon": horizon,
                            "structural_state": structural_state,
                            "crypto_state": crypto_state,
                            "bridge_confidence": bridge_conf,
                            "setup_class": final_setup,
                            "final_state": final_state,
                            "final_score": final_score,
                            "overall_confidence": overall_conf,
                            "deployment_level": deploy,
                            "deployment_label": _deployment_label(deploy),
                            "bullish_prob": probs["Bullish"],
                            "neutral_prob": probs["Neutral"],
                            "bearish_prob": probs["Bearish"],
                        }
                        row.update(bundle)
                        row.update({f"sleeve_{k}": v for k, v in weights.items()})
                        rows.append(row)
    return pd.DataFrame(rows)


# ═══════════════════════════════════════════════════════════════════════
# API read functions — query pre-computed data from DB
# ═══════════════════════════════════════════════════════════════════════

PSM_DAILY_COLUMNS = [
    "date", "profile", "horizon",
    "structural_state", "structural_confidence", "market_state",
    "crypto_state", "bridge_confidence", "overall_confidence",
    "structural_component", "market_component", "crypto_component", "bridge_component",
    "bias_component", "penalty_component", "boost_component",
    "prelim_score", "prelim_state", "candidate_state",
    "setup_class", "final_state", "final_score",
    "action_bucket", "deployment_level", "deployment_label",
    "sleeve_safety", "sleeve_growth", "sleeve_tactical", "sleeve_cash",
    "bullish_prob", "neutral_prob", "bearish_prob",
    "recommendation", "mismatch_note", "bridge_note",
    "upgrade_trigger", "downgrade_trigger",
]

POLICY_DB_COLUMNS = [
    "profile", "horizon", "structural_state", "crypto_state", "bridge_confidence",
    "setup_class", "final_state", "final_score", "overall_confidence",
    "action_bucket", "deployment_level", "deployment_label",
    "sleeve_safety", "sleeve_growth", "sleeve_tactical", "sleeve_cash",
    "bullish_prob", "neutral_prob", "bearish_prob",
    "recommendation", "mismatch_note", "bridge_note",
    "upgrade_trigger", "downgrade_trigger",
]

PSM_LAYERS_COLUMNS = [
    "date",
    "structural_state_raw", "structural_state", "structural_confidence",
    "structural_score_raw", "structural_score", "structural_quality_score",
    "phase", "growth_regime", "macro_stance", "recession_overlay",
    "phase_confidence_score", "cycle_sync_score", "transition_risk_score", "recession_risk_score",
    "fsi_raw", "fsi_oriented", "fsi_z", "fsi_slope_20", "fsi_score",
    "unified_log", "unified_score", "delta_to_risk_on", "rotation_score",
    "market_regime", "market_score_raw", "market_state_raw", "market_state", "market_score",
    "signal_alpha", "signal_beta", "signal_gamma",
    "conservative_crypto_score_raw", "conservative_crypto_state_raw",
    "conservative_crypto_state", "conservative_crypto_score",
    "moderate_crypto_score_raw", "moderate_crypto_state_raw",
    "moderate_crypto_state", "moderate_crypto_score",
    "aggressive_crypto_score_raw", "aggressive_crypto_state_raw",
    "aggressive_crypto_state", "aggressive_crypto_score",
    "obv_score", "obv_risk_confirmation",
    "beta_btc_to_nasdaq", "beta_btc_to_dxy", "beta_context_score",
    "rrg_sector_score", "rrg_cross_score", "rrg_score",
    "bridge_score_raw", "bridge_score", "bridge_confidence",
]


def _row_to_dict(row, columns):
    d = dict(zip(columns, row))
    if "date" in d and hasattr(d["date"], "isoformat"):
        d["date"] = d["date"].isoformat()
    return d


def get_psm_latest(conn) -> list[dict]:
    """Latest PSM snapshot (9 rows: 3 profiles × 3 horizons)."""
    cols = ", ".join(PSM_DAILY_COLUMNS)
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT {cols} FROM psm_daily
            WHERE date = (SELECT MAX(date) FROM psm_daily)
            ORDER BY profile, horizon
        """)
        rows = cur.fetchall()
    return [_row_to_dict(r, PSM_DAILY_COLUMNS) for r in rows]


def get_psm_summary(conn) -> dict:
    """Summary with dashboard table and latest date."""
    latest = get_psm_latest(conn)
    if not latest:
        return {"latest_date": None, "dashboard_table": {}, "rows": []}

    latest_date = latest[0]["date"]
    dashboard_table: dict[str, dict[str, str]] = {}
    for row in latest:
        dashboard_table.setdefault(row["profile"], {})[row["horizon"]] = row["final_state"]

    summary_fields = [
        "date", "profile", "horizon", "final_state",
        "structural_state", "structural_confidence", "market_state",
        "crypto_state", "bridge_confidence", "setup_class", "overall_confidence",
        "deployment_label", "action_bucket",
    ]
    return {
        "latest_date": latest_date,
        "dashboard_table": dashboard_table,
        "rows": [{k: r.get(k) for k in summary_fields} for r in latest],
    }


def get_psm_history(conn, profile: str = "Moderate", horizon: str = "Mid term", lookback: int = 252) -> list[dict]:
    """PSM time series for a specific profile × horizon."""
    cols = ", ".join(PSM_DAILY_COLUMNS)
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT {cols} FROM psm_daily
            WHERE profile = %s AND horizon = %s
            ORDER BY date DESC LIMIT %s
        """, (profile, horizon, lookback))
        rows = cur.fetchall()
    result = [_row_to_dict(r, PSM_DAILY_COLUMNS) for r in rows]
    result.reverse()
    return result


def get_psm_profile(conn, profile: str) -> list[dict]:
    """Latest PSM for all horizons of a specific profile."""
    cols = ", ".join(PSM_DAILY_COLUMNS)
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT {cols} FROM psm_daily
            WHERE profile = %s
              AND date = (SELECT MAX(date) FROM psm_daily WHERE profile = %s)
            ORDER BY horizon
        """, (profile, profile))
        rows = cur.fetchall()
    return [_row_to_dict(r, PSM_DAILY_COLUMNS) for r in rows]


def get_psm_layers(conn, lookback: int = 252) -> list[dict]:
    """PSM intermediate layers time series for all four v2 layers."""
    cols = ", ".join(PSM_LAYERS_COLUMNS)
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT {cols} FROM psm_layers_daily
            ORDER BY date DESC LIMIT %s
        """, (lookback,))
        rows = cur.fetchall()
    result = [_row_to_dict(r, PSM_LAYERS_COLUMNS) for r in rows]
    result.reverse()
    return result


def get_psm_profile_cards(conn) -> list[dict]:
    """Latest PSM profile cards — one row per (profile, horizon) with the
    fields needed to render the dashboard profile cards."""
    card_fields = [
        "profile", "horizon",
        "structural_state", "structural_confidence", "market_state",
        "crypto_state", "bridge_confidence", "overall_confidence",
        "setup_class", "final_state",
        "action_bucket", "deployment_label",
        "sleeve_safety", "sleeve_growth", "sleeve_tactical", "sleeve_cash",
        "bullish_prob", "neutral_prob", "bearish_prob",
        "recommendation", "mismatch_note", "bridge_note",
        "upgrade_trigger", "downgrade_trigger",
    ]
    cols = ", ".join(card_fields)
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT {cols} FROM psm_daily
            WHERE date = (SELECT MAX(date) FROM psm_daily)
            ORDER BY profile, horizon
        """)
        rows = cur.fetchall()
    return [_row_to_dict(r, card_fields) for r in rows]

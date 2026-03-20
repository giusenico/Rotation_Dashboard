"""
Macro Risk-On / Risk-Off engine.

Faithful translation of the macro_risk_on_off.ipynb notebook.
Computes:
  1. Relative return matrix (pairwise log-return differences)
  2. Ranking by majority wins
  3. Risk dominance score (risk-on vs risk-off tilt)
  4. Unified basket ratio (equal-weight risk-on / risk-off)
  5. Inflection points (MA cross + Z-score turning points)
  6. Rotation metrics (Kendall-τ, pairwise velocity, EMD, directional bias)

All computed on-the-fly from existing daily_prices data. No new DB tables.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from itertools import combinations
from math import comb

import numpy as np
import pandas as pd

from backend.config import CACHE_TTL

logger = logging.getLogger(__name__)

# ── Ticker mapping (notebook -> our DB) ──────────────────────────────

# Exact same tickers as the notebook
MACRO_TICKERS = ["SPY", "QQQ", "IWM", "BTC-USD", "TLT", "GLD", "IGOV"]
RISK_ON = ["SPY", "QQQ", "IWM", "BTC-USD"]
RISK_OFF = ["TLT", "GLD", "IGOV"]

# Display names for the frontend
TICKER_DISPLAY = {
    "SPY": "S&P 500",
    "QQQ": "Nasdaq 100",
    "IWM": "Small Caps",
    "BTC-USD": "Bitcoin",
    "TLT": "Long Treasuries",
    "GLD": "Gold",
    "IGOV": "Intl Treasuries",
}

# ── Notebook constants ───────────────────────────────────────────────

FAST_MA = 20
SLOW_MA = 50
Z_WIN = 126
MOM_WIN = 5
Z_THR = 1.5
DEFAULT_LOOKBACK = 7  # default period for relative return matrix

# Rotation metrics
ROTATION_L = 21
S_MATRIX_LOOKBACKS = [21, 63, 126]
S_MATRIX_WEIGHTS = [0.2, 0.3, 0.5]
EMD_TEMPERATURE = 0.7

# Regime thresholds (from docs proposal)
REGIME_THRESHOLDS = {
    "Defensive": (-1.0, -0.5),
    "Fragile": (-0.5, 0.0),
    "Recovery": (0.0, 0.5),
    "Expansion": (0.5, 1.0),
}


# ── In-memory cache ─────────────────────────────────────────────────

MAX_CACHE_ENTRIES = 20


@dataclass
class _CacheEntry:
    data: object
    ts: float = field(default_factory=time.time)


_cache: dict[str, _CacheEntry] = {}


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry is None:
        return None
    if time.time() - entry.ts > CACHE_TTL:
        del _cache[key]
        return None
    return entry.data


def _cache_set(key: str, data) -> None:
    if len(_cache) >= MAX_CACHE_ENTRIES:
        oldest_key = min(_cache, key=lambda k: _cache[k].ts)
        del _cache[oldest_key]
    _cache[key] = _CacheEntry(data=data)


# ── Data fetching ────────────────────────────────────────────────────

def _fetch_adj_close(conn, symbols: list[str]) -> pd.DataFrame:
    """Fetch daily adj_close for symbols, return DataFrame (dates × symbols)."""
    placeholders = ",".join(["%s"] * len(symbols))
    query = f"""
        SELECT symbol, date, adj_close
        FROM daily_prices
        WHERE symbol IN ({placeholders})
        ORDER BY date
    """
    with conn.cursor() as cur:
        cur.execute(query, symbols)
        rows = cur.fetchall()

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=["symbol", "date", "adj_close"])
    df["date"] = pd.to_datetime(df["date"])
    pivot = df.pivot(index="date", columns="symbol", values="adj_close").sort_index()
    # Align on common dates (like notebook: prices.dropna(how="any"))
    pivot = pivot.dropna(how="any")
    return pivot


# ── Cell 2: Relative return matrix ──────────────────────────────────

def _relative_return_matrix(prices: pd.DataFrame, L: int) -> pd.DataFrame:
    """Pairwise relative log-return: r_i - r_j over L days."""
    logp_now = np.log(prices.iloc[-1])
    logp_then = np.log(prices.shift(L).iloc[-1])
    r = logp_now - logp_then
    R = r.values
    vals = R[:, None] - R[None, :]
    np.fill_diagonal(vals, 0.0)
    M = pd.DataFrame(vals, index=r.index, columns=r.index)
    return M


# ── Cell 3: Ranking by wins ─────────────────────────────────────────

def _ranking_from_matrix(M: pd.DataFrame) -> list[dict]:
    """Rank by count of positive pairwise edges, tie-break by net edge sum."""
    wins = M.gt(0).sum(axis=1).astype(int)
    net_edge = M.sum(axis=1)
    out = pd.DataFrame({
        "wins": wins,
        "net_edge": net_edge,
    })
    out = out.sort_values(["wins", "net_edge"], ascending=[False, False])
    result = []
    for rank_num, (symbol, row) in enumerate(out.iterrows(), 1):
        result.append({
            "rank": rank_num,
            "symbol": symbol,
            "name": TICKER_DISPLAY.get(symbol, symbol),
            "wins": int(row["wins"]),
            "net_edge": round(float(row["net_edge"]), 6),
            "side": "risk_on" if symbol in RISK_ON else "risk_off",
        })
    return result


# ── Cell 4: Risk dominance score ────────────────────────────────────

def _risk_dominance(M: pd.DataFrame) -> dict:
    """Average edge of risk-on vs risk-off pairs."""
    pairs = [
        (r, s) for r in RISK_ON for s in RISK_OFF
        if r in M.index and s in M.columns
    ]
    vals = [M.loc[r, s] for (r, s) in pairs]
    score = float(np.mean(vals)) if vals else 0.0
    frac = float(np.mean([v > 0 for v in vals])) if vals else 0.0
    return {
        "dominance_score": round(score, 6),
        "risk_on_win_fraction": round(frac, 4),
        "pairs_count": len(pairs),
        "dominant_side": "Risk-ON" if score > 0 else "Risk-OFF",
    }


# ── Cell 5: Unified basket ratio ────────────────────────────────────

def _basket_index_equal(prices: pd.DataFrame, base: float = 100.0) -> pd.Series:
    """Equal-weight compounding index."""
    r = prices.pct_change()
    w = 1.0 / len(prices.columns)
    basket_ret = (r * w).sum(axis=1).fillna(0.0)
    return ((1 + basket_ret).cumprod() * base).rename("Index")


def _unified_ratio(prices: pd.DataFrame) -> pd.DataFrame:
    """Unified risk-on / risk-off ratio with MAs."""
    cols_on = [c for c in RISK_ON if c in prices.columns]
    cols_off = [c for c in RISK_OFF if c in prices.columns]
    idx_on = _basket_index_equal(prices[cols_on])
    idx_off = _basket_index_equal(prices[cols_off])
    df = pd.concat([idx_on, idx_off], axis=1).dropna()
    df.columns = ["risk_on_idx", "risk_off_idx"]
    df["unified"] = df["risk_on_idx"] / df["risk_off_idx"]
    df["unified_log"] = np.log(df["unified"])
    df["ma_fast"] = df["unified"].rolling(FAST_MA).mean()
    df["ma_slow"] = df["unified"].rolling(SLOW_MA).mean()
    return df


# ── Cell 6: Inflection points ───────────────────────────────────────

def _find_inflections(uni_df: pd.DataFrame) -> pd.DataFrame:
    """MA cross + Z-score turning points on unified ratio."""
    u = uni_df["unified"].copy()
    ma_fast = uni_df["ma_fast"]
    ma_slow = uni_df["ma_slow"]

    # MA cross events
    cross_up = (ma_fast > ma_slow) & (ma_fast.shift(1) <= ma_slow.shift(1))
    cross_dn = (ma_fast < ma_slow) & (ma_fast.shift(1) >= ma_slow.shift(1))

    # Z-score of log ratio
    logu = np.log(u)
    z = (logu - logu.rolling(Z_WIN).mean()) / logu.rolling(Z_WIN).std()

    # Momentum sign change after extreme z
    mom = logu.diff(MOM_WIN)
    turn_up = (mom > 0) & (mom.shift(1) <= 0) & (z.shift(1) <= -Z_THR)
    turn_dn = (mom < 0) & (mom.shift(1) >= 0) & (z.shift(1) >= Z_THR)

    out = pd.DataFrame({
        "unified": u,
        "ma_fast": ma_fast,
        "ma_slow": ma_slow,
        "cross_up": cross_up,
        "cross_dn": cross_dn,
        "z": z,
        "turn_up": turn_up,
        "turn_dn": turn_dn,
    }).dropna()
    return out


# ── Cell 7: Rotation metrics ────────────────────────────────────────

def _xsec_rank(prices: pd.DataFrame, L: int) -> pd.Series:
    """Cross-sectional rank by L-day return (1 = best)."""
    rL = prices.iloc[-1] / prices.shift(L).iloc[-1] - 1
    return (-rL).rank(method="min")


def _kendall_tau_distance(r1: pd.Series, r2: pd.Series) -> float:
    """Fraction of discordant pairs between two rankings."""
    idx = r1.index.intersection(r2.index)
    r1, r2 = r1.loc[idx], r2.loc[idx]
    n = len(idx)
    if n < 2:
        return float("nan")
    discordant = 0
    items = list(idx)
    for i, j in combinations(range(n), 2):
        a, b = items[i], items[j]
        discordant += int((r1[a] - r1[b]) * (r2[a] - r2[b]) < 0)
    return discordant / comb(n, 2)


def _rank_rotation_score(prices: pd.DataFrame, L: int = 21) -> float:
    """Kendall-τ distance between current and L-ago rankings."""
    return _kendall_tau_distance(
        _xsec_rank(prices, L),
        _xsec_rank(prices.shift(L), L),
    )


def _s_matrix(prices: pd.DataFrame, lookbacks=None, weights=None, eps=1e-9):
    """Pairwise strength matrix (antisymmetric, tanh-compressed)."""
    if lookbacks is None:
        lookbacks = S_MATRIX_LOOKBACKS
    if weights is None:
        weights = S_MATRIX_WEIGHTS
    tickers = list(prices.columns)
    rets = prices.pct_change()
    S = pd.DataFrame(0.0, index=tickers, columns=tickers)
    for L, w in zip(lookbacks, weights):
        rL = prices.iloc[-1] / prices.shift(L).iloc[-1] - 1
        vol = rets.rolling(L).std().iloc[-1] * np.sqrt(252)
        for i in tickers:
            for j in tickers:
                if i == j:
                    continue
                S.loc[i, j] += w * ((rL[i] - rL[j]) / (((vol[i] + vol[j]) / 2) + eps))
    S = np.tanh(S)
    S = (S - S.T) / 2
    s_vals = S.to_numpy(copy=True)
    np.fill_diagonal(s_vals, 0.0)
    S = pd.DataFrame(s_vals, index=S.index, columns=S.columns)
    return S


def _pairwise_rotation_velocity(prices: pd.DataFrame, L: int = 21) -> float:
    """Mean absolute change in pairwise S-matrix over L days."""
    S_now = _s_matrix(prices)
    S_then = _s_matrix(prices.shift(L))
    now_arr = S_now.to_numpy()
    then_arr = S_then.to_numpy()
    iu = np.triu_indices_from(now_arr, k=1)
    return float(np.abs(now_arr[iu] - then_arr[iu]).mean())


def _softmax_strength(ranks: pd.Series, temperature: float = 1.0) -> pd.Series:
    x = (-ranks / temperature).astype(float)
    ex = np.exp(x - x.max())
    return ex / ex.sum()


def _emd_rotation(prices: pd.DataFrame, L: int = 21, temperature: float = 0.7) -> float:
    """EMD-style rotation: total variation distance of softmax rank weights."""
    rank_now = _xsec_rank(prices, L)
    rank_then = _xsec_rank(prices.shift(1), L)
    w_now = _softmax_strength(rank_now, temperature)
    w_then = _softmax_strength(rank_then, temperature)
    return float(0.5 * np.abs(w_now - w_then).sum())


def _directional_rotation_bias(prices: pd.DataFrame, L: int = 21) -> dict:
    """Delta of risk-on vs risk-off pairwise edge over L days."""
    S_now = _s_matrix(prices)
    S_then = _s_matrix(prices.shift(L))
    pairs = [
        (r, s) for r in RISK_ON for s in RISK_OFF
        if r in S_now.index and s in S_now.columns
    ]
    mu_now = float(np.mean([S_now.loc[r, s] for r, s in pairs])) if pairs else float("nan")
    mu_then = float(np.mean([S_then.loc[r, s] for r, s in pairs])) if pairs else float("nan")
    delta = (mu_now - mu_then) if not (np.isnan(mu_now) or np.isnan(mu_then)) else float("nan")
    return {
        "edge_now": round(mu_now, 6),
        "edge_then": round(mu_then, 6),
        "delta_to_risk_on": round(delta, 6),
    }


# ── Top-K churn (Cell 10 / dashboard cell) ──────────────────────────

def _topk_churn(prices: pd.DataFrame, L: int, k: int = 3) -> dict:
    """Top-K by L-day simple return: entered/exited vs prior period."""
    r_now = prices.iloc[-1] / prices.shift(L).iloc[-1] - 1
    r_then = prices.shift(L).iloc[-1] / prices.shift(2 * L).iloc[-1] - 1
    now = set(r_now.sort_values(ascending=False).index[:k])
    then = set(r_then.sort_values(ascending=False).index[:k])
    jaccard = 1 - len(now & then) / len(now | then) if (now | then) else float("nan")
    return {
        "jaccard": round(float(jaccard), 4),
        "entered": sorted(now - then),
        "exited": sorted(then - now),
    }


# ── Regime classification ───────────────────────────────────────────

def _classify_regime(composite_score: float) -> str:
    """Map composite score [-1, +1] to regime label."""
    if composite_score <= -0.5:
        return "Defensive"
    elif composite_score <= 0.0:
        return "Fragile"
    elif composite_score <= 0.5:
        return "Recovery"
    else:
        return "Expansion"


def _compute_composite_score(
    dom_norm: float,
    ma_state: str,
    z_score: float,
) -> float:
    """
    Combine 3 sub-signals into a single [-1, +1] composite score.

    Components (each in [-1, +1]):
      1. Dominance (rolling z-score normalised, already in [-1, +1])
      2. MA state (+1 risk-on, -1 risk-off)
      3. Z-score of unified ratio (clamped to [-2, +2], then /2)
    """
    dom_comp = float(np.clip(dom_norm, -1, 1))
    ma_comp = 1.0 if ma_state == "RISK-ON" else -1.0
    z_comp = float(np.clip(z_score / 2.0, -1, 1))

    composite = (dom_comp + ma_comp + z_comp) / 3.0
    return round(float(np.clip(composite, -1, 1)), 4)


def _dominance_series_normalised(prices: pd.DataFrame, period: int, norm_window: int = 252) -> pd.Series:
    """
    Compute per-date dominance (risk-on mean log-ret − risk-off mean log-ret)
    then normalise with a rolling z-score → clipped to [-1, +1].

    Math: mean_i(r_i) − mean_j(r_j)  for i∈RISK_ON, j∈RISK_OFF
    equals the mean of all pairwise differences (linearity of expectation).
    """
    log_prices = np.log(prices)
    log_rets = log_prices - log_prices.shift(period)

    on_cols = [c for c in RISK_ON if c in log_rets.columns]
    off_cols = [c for c in RISK_OFF if c in log_rets.columns]
    raw = log_rets[on_cols].mean(axis=1) - log_rets[off_cols].mean(axis=1)

    roll_mean = raw.rolling(norm_window, min_periods=20).mean()
    roll_std = raw.rolling(norm_window, min_periods=20).std()
    z = (raw - roll_mean) / (roll_std + 1e-10)
    return (z.clip(-2, 2) / 2.0)  # → [-1, +1]


def _compute_regime_history(
    prices: pd.DataFrame,
    inf: pd.DataFrame,
    dom_norm_series: pd.Series,
    lookback: int = 300,
) -> list[dict]:
    """
    Compute regime classification over time using the same 3-component
    composite as the current snapshot (dominance + MA + z).
    """
    if len(inf) < 1:
        return []

    n = min(lookback, len(inf))
    inf_slice = inf.iloc[-n:]

    history = []
    for date, row in inf_slice.iterrows():
        ma_state = "RISK-ON" if row["ma_fast"] > row["ma_slow"] else "RISK-OFF"
        z_val = row["z"] if not np.isnan(row["z"]) else 0.0

        dom_val = dom_norm_series.get(date, np.nan)
        if np.isnan(dom_val):
            dom_val = 0.0

        score = _compute_composite_score(float(dom_val), ma_state, z_val)
        regime = _classify_regime(score)
        history.append({
            "date": date.strftime("%Y-%m-%d"),
            "regime": regime,
            "composite_score": score,
        })
    return history


REGIME_ORDER = ["Defensive", "Fragile", "Recovery", "Expansion"]


def _derive_scenario_probabilities(
    current_regime: str,
    regime_history: list[dict],
    transition_pcts: dict[str, dict[str, float]],
    streak: int,
    avg_duration: float,
) -> dict:
    """
    Derive bear / base / bull probabilities from historical transition rates.

    - base  = probability of staying in the current regime
    - bear  = probability of transitioning to a worse regime
    - bull  = probability of transitioning to a better regime

    If the regime has lasted longer than average, we decay the base probability
    and redistribute proportionally to bear/bull.
    """
    idx = REGIME_ORDER.index(current_regime) if current_regime in REGIME_ORDER else 1

    # Transition-based probabilities (what happens when we leave this regime)
    trans = transition_pcts.get(current_regime, {})

    if trans:
        # We have observed transitions from this regime
        bear_raw = sum(v for k, v in trans.items() if k in REGIME_ORDER and REGIME_ORDER.index(k) < idx)
        bull_raw = sum(v for k, v in trans.items() if k in REGIME_ORDER and REGIME_ORDER.index(k) > idx)
        # Normalise in case of rounding
        t_total = bear_raw + bull_raw
        if t_total > 0:
            bear_trans = bear_raw / t_total
            bull_trans = bull_raw / t_total
        else:
            bear_trans = 0.5
            bull_trans = 0.5
    else:
        # No observed transitions — use position in the regime spectrum
        bear_trans = max(0.2, idx / (len(REGIME_ORDER) - 1)) if len(REGIME_ORDER) > 1 else 0.5
        bull_trans = 1.0 - bear_trans

    # Base probability: decays as streak exceeds average duration
    duration_ratio = streak / max(avg_duration, 1)
    # Exponential decay: base shrinks as we overstay
    base_pct = max(15, int(round(55 * np.exp(-0.5 * max(0, duration_ratio - 0.5)))))

    # Remaining probability split by transition rates
    remaining = 100 - base_pct
    bear_pct = int(round(remaining * bear_trans))
    bull_pct = remaining - bear_pct  # ensure sum = 100

    # Sample size for confidence
    n_transitions = sum(sum(tos.values()) for tos in transition_pcts.values()) if transition_pcts else 0

    return {
        "bear": bear_pct,
        "base": base_pct,
        "bull": bull_pct,
        "confidence": "high" if n_transitions >= 15 else ("medium" if n_transitions >= 5 else "low"),
        "n_transitions": int(n_transitions),
    }


def _regime_duration_stats(regime_history: list[dict]) -> dict:
    """Compute current streak and historical average durations per regime."""
    if not regime_history:
        return {"days_in_regime": 0, "avg_duration": 0, "transitions": {}}

    # Current streak
    current_regime = regime_history[-1]["regime"]
    streak = 0
    for entry in reversed(regime_history):
        if entry["regime"] == current_regime:
            streak += 1
        else:
            break

    # Historical durations per regime
    durations: dict[str, list[int]] = {}
    prev_regime = regime_history[0]["regime"]
    run = 1
    for entry in regime_history[1:]:
        if entry["regime"] == prev_regime:
            run += 1
        else:
            durations.setdefault(prev_regime, []).append(run)
            prev_regime = entry["regime"]
            run = 1
    durations.setdefault(prev_regime, []).append(run)

    avg_durations = {
        k: round(float(np.mean(v)), 1)
        for k, v in durations.items()
    }

    # Transition matrix
    transitions: dict[str, dict[str, int]] = {}
    for i in range(len(regime_history) - 1):
        fr = regime_history[i]["regime"]
        to = regime_history[i + 1]["regime"]
        if fr != to:
            transitions.setdefault(fr, {})
            transitions[fr][to] = transitions[fr].get(to, 0) + 1

    # Normalise transitions to percentages
    transition_pcts: dict[str, dict[str, float]] = {}
    for fr, tos in transitions.items():
        total = sum(tos.values())
        if total > 0:
            transition_pcts[fr] = {
                to: round(cnt / total, 2) for to, cnt in tos.items()
            }

    # Scenario probabilities derived from historical transitions + persistence
    scenarios = _derive_scenario_probabilities(
        current_regime, regime_history, transition_pcts, streak,
        avg_durations.get(current_regime, 30),
    )

    return {
        "days_in_regime": streak,
        "avg_duration": avg_durations.get(current_regime, 0),
        "avg_durations_all": avg_durations,
        "transitions": transition_pcts,
        "scenarios": scenarios,
    }


# ── DB read helper ─────────────────────────────────────────────────────

def _read_from_db(conn, key: str):
    """Read latest pre-computed result from macro_daily_cache."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT value FROM macro_daily_cache
                   WHERE key = %s
                   ORDER BY date DESC LIMIT 1""",
                (key,),
            )
            row = cur.fetchone()
        if row is not None:
            return row[0]  # psycopg2 returns JSONB as Python dict
    except Exception as exc:
        logger.warning("macro_daily_cache read failed for key=%s: %s", key, exc)
    return None


# ── Public API ───────────────────────────────────────────────────────

def get_macro_hero(conn, period: int = DEFAULT_LOOKBACK) -> dict:
    """Read pre-computed hero from DB, fall back to on-the-fly computation."""
    try:
        cache_key = f"macro_hero_{period}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        # Try DB first
        result = _read_from_db(conn, f"hero_{period}")
        if result is not None:
            _cache_set(cache_key, result)
            return result

        # Fallback: compute on-the-fly
        result = _compute_macro_hero(conn, period)
        _cache_set(cache_key, result)
        return result
    except Exception:
        logger.exception("Failed to build macro hero for period=%d", period)
        return {"error": "Macro hero temporarily unavailable"}


def get_macro_history(conn, lookback: int = 300) -> dict:
    """Read pre-computed history from DB, fall back to on-the-fly computation."""
    try:
        cache_key = f"macro_history_{lookback}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        # Try DB first
        result = _read_from_db(conn, f"history_{lookback}")
        if result is not None:
            _cache_set(cache_key, result)
            return result

        # Fallback: compute on-the-fly
        result = _compute_macro_history(conn, lookback)
        _cache_set(cache_key, result)
        return result
    except Exception:
        logger.exception("Failed to build macro history for lookback=%d", lookback)
        return {"error": "Macro history temporarily unavailable"}


# ── Computation (used by scripts/update_macro.py and as fallback) ────

def _compute_macro_hero(conn, period: int = DEFAULT_LOOKBACK) -> dict:
    """Compute all notebook metrics. Returns a single dict with the full snapshot."""
    prices = _fetch_adj_close(conn, MACRO_TICKERS)
    if prices.empty or len(prices) < SLOW_MA + Z_WIN:
        return {"error": "Insufficient data"}

    # 1. Relative return matrix + ranking
    M = _relative_return_matrix(prices, period)
    ranking = _ranking_from_matrix(M)

    # 2. Risk dominance
    dominance = _risk_dominance(M)

    # 3. Unified ratio
    uni_df = _unified_ratio(prices)
    last = uni_df.iloc[-1]
    ma_state = "RISK-ON" if last["ma_fast"] > last["ma_slow"] else "RISK-OFF"
    unified_roc = float(uni_df["unified"].iloc[-1] / uni_df["unified"].shift(period).iloc[-1] - 1)

    # 4. Inflection points (latest state)
    inf = _find_inflections(uni_df)
    z_score = float(inf["z"].iloc[-1]) if len(inf) > 0 and not np.isnan(inf["z"].iloc[-1]) else 0.0
    latest_signals = []
    if len(inf) > 0:
        last_row = inf.iloc[-1]
        if last_row["cross_up"]:
            latest_signals.append("MA Cross Up")
        if last_row["cross_dn"]:
            latest_signals.append("MA Cross Down")
        if last_row["turn_up"]:
            latest_signals.append("Z-Turn Up")
        if last_row["turn_dn"]:
            latest_signals.append("Z-Turn Down")

    # 5. Rotation metrics
    rotation = {
        "rank_rotation": round(_rank_rotation_score(prices, ROTATION_L), 4),
        "pairwise_velocity": round(_pairwise_rotation_velocity(prices, ROTATION_L), 4),
        "emd_rotation": round(_emd_rotation(prices, ROTATION_L, EMD_TEMPERATURE), 4),
    }
    dir_bias = _directional_rotation_bias(prices, ROTATION_L)
    rotation.update(dir_bias)

    # 6. Top-K churn
    topk = _topk_churn(prices, period, k=3)

    # 7. Composite score + regime (rolling-normalised dominance)
    # Always use DEFAULT_LOOKBACK for regime classification so it stays
    # stable regardless of the tactical period the user selects.
    dom_norm_series = _dominance_series_normalised(prices, DEFAULT_LOOKBACK)
    dom_norm_current = float(dom_norm_series.iloc[-1]) if not np.isnan(dom_norm_series.iloc[-1]) else 0.0
    composite = _compute_composite_score(dom_norm_current, ma_state, z_score)
    regime = _classify_regime(composite)

    # 8. Regime duration stats (uses same 3-component composite + same dom_norm)
    regime_history = _compute_regime_history(prices, inf, dom_norm_series, lookback=500)
    duration_stats = _regime_duration_stats(regime_history)

    # 9. Relative return matrix as list of lists (for heatmap)
    matrix_data = {
        "symbols": list(M.columns),
        "display_names": [TICKER_DISPLAY.get(s, s) for s in M.columns],
        "values": M.values.round(6).tolist(),
    }

    result = {
        "regime": regime,
        "composite_score": composite,
        "period": period,
        "as_of_date": prices.index[-1].strftime("%Y-%m-%d"),

        # Risk tilt
        "dominance": dominance,

        # Unified ratio
        "unified": {
            "value": round(float(last["unified"]), 4),
            "ma_fast": round(float(last["ma_fast"]), 4),
            "ma_slow": round(float(last["ma_slow"]), 4),
            "ma_state": ma_state,
            "roc": round(unified_roc, 6),
        },

        # Z-score
        "z_score": round(z_score, 4),
        "signals": latest_signals,

        # Rotation
        "rotation": rotation,

        # Ranking
        "ranking": ranking,

        # Top-K churn
        "topk_churn": topk,

        # Regime duration
        "duration": duration_stats,

        # Heatmap data
        "matrix": matrix_data,
    }

    return result


def _compute_macro_history(conn, lookback: int = 300) -> dict:
    """Compute time-series data for detailed charts."""
    prices = _fetch_adj_close(conn, MACRO_TICKERS)
    if prices.empty or len(prices) < SLOW_MA + Z_WIN:
        return {"error": "Insufficient data"}

    # Unified ratio series
    uni_df = _unified_ratio(prices)
    inf = _find_inflections(uni_df)

    if len(inf) < lookback:
        lookback = len(inf)

    inf_slice = inf.iloc[-lookback:]

    # Unified series for chart
    unified_series = []
    for date, row in inf_slice.iterrows():
        entry = {
            "date": date.strftime("%Y-%m-%d"),
            "unified": round(float(row["unified"]), 4),
            "ma_fast": round(float(row["ma_fast"]), 4) if not np.isnan(row["ma_fast"]) else None,
            "ma_slow": round(float(row["ma_slow"]), 4) if not np.isnan(row["ma_slow"]) else None,
            "z": round(float(row["z"]), 4) if not np.isnan(row["z"]) else None,
        }
        # Signals
        signals = []
        if row["cross_up"]:
            signals.append("cross_up")
        if row["cross_dn"]:
            signals.append("cross_dn")
        if row["turn_up"]:
            signals.append("turn_up")
        if row["turn_dn"]:
            signals.append("turn_dn")
        if signals:
            entry["signals"] = signals
        unified_series.append(entry)

    # Rotation metrics over time (rolled daily)
    # This is expensive, so we sample every N days for longer lookbacks
    step = max(1, lookback // 200)
    dates = prices.index
    start_idx = max(2 * ROTATION_L, len(dates) - lookback)
    rotation_series = []

    for t in range(start_idx, len(dates), step):
        px = prices.iloc[:t + 1]
        if len(px) < 2 * ROTATION_L + 1:
            continue
        try:
            rank_rot = _rank_rotation_score(px, ROTATION_L)
            bias = _directional_rotation_bias(px, ROTATION_L)
            rotation_series.append({
                "date": dates[t].strftime("%Y-%m-%d"),
                "rank_rotation": round(rank_rot, 4),
                "delta_to_risk_on": round(bias["delta_to_risk_on"], 4),
            })
        except Exception:
            continue

    # Regime history (consistent 3-component composite)
    dom_norm_series = _dominance_series_normalised(prices, DEFAULT_LOOKBACK)
    regime_history = _compute_regime_history(prices, inf, dom_norm_series, lookback=lookback)

    result = {
        "unified_series": unified_series,
        "rotation_series": rotation_series,
        "regime_history": regime_history,
        "as_of_date": prices.index[-1].strftime("%Y-%m-%d"),
    }

    return result

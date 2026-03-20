import { useState } from "react";
import { useMacroHero, useMacroHistory } from "../../hooks/useMacroData";
import { formatDate } from "../../utils/formatters";
import { cssVar } from "../../utils/cssVar";
import type {
  MacroHeroResponse,
  MacroRegime,
  MacroHistoryResponse,
} from "../../types/macro";
import Plot from "react-plotly.js";

// ── Colors — all via CSS variables for theme consistency ─────────

const V = {
  pos: "var(--dash-positive)",
  neg: "var(--dash-negative)",
  negMuted: "var(--dash-negative-muted)",
  neutral: "var(--dash-neutral)",
  ink: "var(--dash-ink)",
  posBg: "var(--dash-positive-bg)",
  negBg: "var(--dash-negative-bg)",
};

const REGIME_CONFIG: Record<
  MacroRegime,
  { color: string; label: string; description: string }
> = {
  Defensive: {
    color: V.neg,
    label: "DEFENSIVE",
    description: "Safe-haven assets are leading. Markets favor caution.",
  },
  Fragile: {
    color: V.negMuted,
    label: "FRAGILE",
    description: "Mixed signals. The market is uncertain and leaning cautious.",
  },
  Recovery: {
    color: V.neutral,
    label: "RECOVERY",
    description: "Conditions are improving. Risk appetite is slowly returning.",
  },
  Expansion: {
    color: V.pos,
    label: "EXPANSION",
    description: "Growth assets are leading. Markets favor risk-taking.",
  },
};

const GAUGE_ORDER: MacroRegime[] = ["Defensive", "Fragile", "Recovery", "Expansion"];

const PERIOD_OPTIONS = [
  { value: 7, label: "1W" },
  { value: 14, label: "2W" },
  { value: 21, label: "1M" },
  { value: 63, label: "3M" },
];

// Human-readable period text
function periodText(period: number): string {
  if (period <= 7) return "this week";
  if (period <= 14) return "past 2 weeks";
  if (period <= 21) return "this month";
  return "past 3 months";
}

// Translate backend signal names to plain language
const SIGNAL_LABELS: Record<string, string> = {
  "MA Cross Up": "Trend turning positive",
  "MA Cross Down": "Trend turning negative",
  "Z-Turn Up": "Bounce from oversold levels",
  "Z-Turn Down": "Pullback from overbought levels",
};

function hasMacroHistory(value: unknown): value is MacroHistoryResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.unified_series) &&
    Array.isArray(candidate.rotation_series) &&
    Array.isArray(candidate.regime_history)
  );
}

// ── Gradient gauge ───────────────────────────────────────────────

function SegmentGauge({ score, regime }: { score: number; regime: MacroRegime }) {
  const pct = ((score + 1) / 2) * 100;

  return (
    <div className="ms-gauge">
      <div
        className="ms-gauge-track-gradient"
        style={{ background: "var(--ms-gauge-gradient)" }}
      >
        <div className="ms-gauge-marker" style={{ left: `${pct}%` }} />
      </div>
      <div className="ms-gauge-labels">
        {GAUGE_ORDER.map((r) => {
          const cfg = REGIME_CONFIG[r];
          return (
            <span
              key={r}
              style={{
                color: r === regime ? cfg.color : "var(--text-muted)",
                fontWeight: r === regime ? 700 : 400,
              }}
            >
              {r}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Mini horizontal gauge ────────────────────────────────────────

function MiniGauge({
  label,
  value,
  valueLabel,
  positive,
  leftLabel,
  rightLabel,
  changePct,
}: {
  label: string;
  value: number;
  valueLabel: string;
  positive: boolean;
  leftLabel: string;
  rightLabel: string;
  changePct: string;
}) {
  const color = positive ? V.pos : V.neg;
  const pct = Math.max(2, Math.min(98, value * 100));

  return (
    <div className="ms-mini-gauge">
      <div className="ms-mini-header">
        <span className="ms-mini-title" style={{ color: V.ink }}>{label}</span>
        <div className="ms-mini-val-row">
          <span className="ms-mini-value" style={{ color: V.ink }}>{valueLabel}</span>
          <span className="ms-mini-change" style={{ color }}>{changePct}</span>
        </div>
      </div>
      <div className="ms-mini-track">
        <div className="ms-mini-fill" style={{ width: `${pct}%`, background: color }} />
        <div className="ms-mini-dot" style={{ left: `${pct}%`, borderColor: color }} />
      </div>
      <div className="ms-mini-labels">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

// ── Scenarios ────────────────────────────────────────────────────

interface Scenario {
  label: string;
  color: string;
  bgColor: string;
  probability: number;
  condition: string;
  action: string;
}

function deriveScenarios(hero: MacroHeroResponse): Scenario[] {
  const { composite_score, z_score, regime, dominance: _dominance, rotation, unified, duration } = hero;
  const isRiskOn = regime === "Recovery" || regime === "Expansion";
  const { scenarios } = duration;

  // Probabilities from backend (historical transition rates + duration decay)
  const bearProb = scenarios.bear;
  const baseProb = scenarios.base;
  const bullProb = scenarios.bull;

  // ── Bear scenario — qualitative text from current state ──
  const bearCondition = (() => {
    if (z_score < -1) return "Market is stretched to the downside — selling pressure could continue";
    if (unified.ma_state === "RISK-OFF") return "Trend is negative and safe-haven assets are leading";
    return "Momentum fades and money rotates into defensive assets";
  })();

  const bearAction = (() => {
    if (composite_score < -0.3) return "Consider reducing stocks. Bonds and gold may offer protection.";
    if (composite_score < 0) return "Consider hedging. Defensive assets (bonds, gold) look safer.";
    return "Tighten stop-losses on growth positions. Keep hedges ready.";
  })();

  // ── Base scenario ──
  const isTrendPositive = unified.ma_state === "RISK-ON";
  const baseCondition = (() => {
    const trend = isTrendPositive ? "positive" : "negative";
    return `Current conditions persist — trend is ${trend}, rotation is moderate`;
  })();

  const baseAction = (() => {
    if (isTrendPositive && isRiskOn) return "Stay the course. Growth assets are still outperforming.";
    if (isTrendPositive) return "Trend is supportive but leadership is mixed. Hold positions, stay selective.";
    if (isRiskOn) return "Short-term momentum is positive but trend hasn't confirmed. Stay light, watch for follow-through.";
    return "Stay cautious. Wait for clear signs of improvement before adding risk.";
  })();

  // ── Bull scenario ──
  const bullCondition = (() => {
    if (z_score < -1.5) return "Market is deeply oversold — a rebound becomes increasingly likely";
    if (rotation.delta_to_risk_on > 0) return "Money is rotating toward growth and risk assets";
    return "Trend turns positive and more assets start participating";
  })();

  const bullAction = (() => {
    if (composite_score < -0.3) return "Wait for confirmation before acting. Start small if trend improves.";
    if (composite_score < 0.3) return "Gradually increase exposure to stocks (large-cap, tech, small-cap).";
    return "Fully positioned for growth. Ride the trend with trailing stops.";
  })();

  return [
    { label: "Bearish", color: V.neg, bgColor: V.negBg, probability: bearProb, condition: bearCondition, action: bearAction },
    { label: "Neutral", color: V.neutral, bgColor: "var(--bg-tertiary)", probability: baseProb, condition: baseCondition, action: baseAction },
    { label: "Bullish", color: V.pos, bgColor: V.posBg, probability: bullProb, condition: bullCondition, action: bullAction },
  ];
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "Based on many past transitions",
  medium: "Based on limited past transitions",
  low: "Very few past transitions — treat as rough estimate",
};

function ScenariosSection({ hero }: { hero: MacroHeroResponse }) {
  const scenarios = deriveScenarios(hero);
  const { confidence } = hero.duration.scenarios;

  return (
    <div className="ms-scenarios">
      <div className="ms-section-title">
        What could happen next
        <span className="ms-confidence-note" title={CONFIDENCE_LABEL[confidence]}>
          {confidence === "low" ? " *" : ""}
        </span>
      </div>
      {scenarios.map((s) => (
        <div key={s.label} className="ms-scenario">
          <div className="ms-scenario-header">
            <span className="ms-scenario-badge" style={{ color: s.color, background: s.bgColor }}>
              {s.label}
            </span>
            <div className="ms-scenario-bar-wrap">
              <div className="ms-scenario-bar" style={{ width: `${s.probability}%`, background: s.color }} />
            </div>
            <span className="ms-scenario-pct" style={{ color: s.color }}>{s.probability}%</span>
          </div>
          <div className="ms-scenario-details">
            <div className="ms-scenario-row">
              <span className="ms-scenario-key">If</span>
              <span className="ms-scenario-val">{s.condition}</span>
            </div>
            <div className="ms-scenario-row">
              <span className="ms-scenario-key">Then</span>
              <span className="ms-scenario-val">{s.action}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Compact Unified Ratio sparkline (always visible) ─────────────

function UnifiedSparkline({ history }: { history: MacroHistoryResponse }) {
  const last120 = history.unified_series.slice(-120);
  const dates = last120.map((p) => p.date);
  const unified = last120.map((p) => p.unified);
  const maFast = last120.map((p) => p.ma_fast);
  const maSlow = last120.map((p) => p.ma_slow);

  const textCol = () => cssVar("--chart-text");
  const gridCol = () => cssVar("--chart-grid");

  return (
    <div className="ms-sparkline-wrap">
      <div className="ms-section-title">Growth vs Safety ratio (6 months)</div>
      <Plot
        data={[
          { x: dates, y: unified, type: "scatter", mode: "lines", name: "Ratio", line: { color: "#9899B3", width: 1.2 } },
          { x: dates, y: maFast, type: "scatter", mode: "lines", name: "Short MA", line: { color: "#5A8FF7", width: 1, dash: "dot" } },
          { x: dates, y: maSlow, type: "scatter", mode: "lines", name: "Long MA", line: { color: "#F09A92", width: 1, dash: "dot" } },
        ]}
        layout={{
          autosize: true,
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          margin: { t: 4, r: 8, b: 24, l: 36 },
          xaxis: {
            color: textCol(),
            gridcolor: gridCol(),
            tickformat: "%b",
            tickfont: { size: 9, color: textCol() },
            nticks: 6,
          },
          yaxis: {
            color: textCol(),
            gridcolor: gridCol(),
            type: "log" as const,
            tickfont: { size: 9, color: textCol() },
          },
          showlegend: true,
          legend: {
            x: 1,
            y: 1,
            xanchor: "right" as const,
            yanchor: "top" as const,
            font: { size: 9, color: textCol() },
            bgcolor: "rgba(0,0,0,0)",
            orientation: "h" as const,
            traceorder: "normal" as const,
          },
        }}
        config={{ displayModeBar: false, responsive: true }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

// ── Main Hero Card ───────────────────────────────────────────────

export function MacroHeroCard() {
  const [period, setPeriod] = useState(7);
  const { data, isLoading } = useMacroHero(period);
  const { data: history } = useMacroHistory(300);
  const showHistory = hasMacroHistory(history);

  if (isLoading || !data) {
    return (
      <div className="ms-card ms-card--loading">
        <div className="ms-loading-pulse" />
      </div>
    );
  }

  if ("error" in data) return null;

  const hero = data as MacroHeroResponse;
  const cfg = REGIME_CONFIG[hero.regime];
  const isRiskOn = hero.regime === "Recovery" || hero.regime === "Expansion";

  // Momentum gauge
  const momRaw = hero.dominance.dominance_score * 50;
  const momPct = Math.max(0, Math.min(1, (momRaw + 1) / 2));
  const momLabel = momPct > 0.6 ? "Strong" : momPct > 0.4 ? "Neutral" : "Weak";
  const momChange = `${hero.dominance.dominance_score >= 0 ? "\u25B2" : "\u25BC"} ${hero.dominance.dominance_score.toFixed(2)}`;

  // Risk gauge
  const riskPct = Math.max(0, Math.min(1, (hero.composite_score + 1) / 2));
  const riskLabel = riskPct > 0.6 ? "Low" : riskPct > 0.4 ? "Moderate" : "High";
  const riskChange = `${hero.composite_score >= 0 ? "\u25B2" : "\u25BC"} ${hero.composite_score.toFixed(2)}`;

  // RoC text
  const rocAbs = (Math.abs(hero.unified.roc) * 100).toFixed(1);
  const rocDirection = hero.unified.roc >= 0 ? "Risk appetite grew" : "Risk appetite fell";

  return (
    <div className="ms-card ms-card--full" style={{ borderLeftColor: cfg.color }}>
      {/* Header */}
      <div className="ms-header">
        <span className="ms-header-title" style={{ color: V.ink }}>Market State</span>
        <div className="ms-period-selector">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`ms-period-btn ${period === opt.value ? "active" : ""}`}
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Big risk on/off label */}
      <div className="ms-risk-label">
        <span className="ms-risk-dot" style={{ background: cfg.color }} />
        <span className="ms-risk-text" style={{ color: V.ink }}>
          Risk <strong style={{ color: cfg.color }}>
            {isRiskOn ? "ON" : "OFF"}
          </strong>
        </span>
      </div>

      {/* Change indicator — plain language */}
      <div className="ms-change-row">
        <span className="ms-change-badge" style={{ color: cfg.color }}>
          {hero.unified.roc >= 0 ? "\u25B2" : "\u25BC"} {rocAbs}%
        </span>
        <span className="ms-change-text">
          {rocDirection} {periodText(period)}
        </span>
      </div>

      {/* Duration + regime description */}
      <div className="ms-duration-text" style={{ color: V.ink }}>
        In <strong style={{ color: cfg.color }}>{cfg.label}</strong> for{" "}
        <strong>{hero.duration.days_in_regime}</strong> days
        {hero.duration.avg_duration > 0 && (
          <span className="ms-duration-avg"> (avg ~{Math.round(hero.duration.avg_duration)}d)</span>
        )}
      </div>
      <div className="ms-regime-desc">{cfg.description}</div>

      {/* Segment gauge */}
      <SegmentGauge score={hero.composite_score} regime={hero.regime} />

      {/* Mini gauges */}
      <div className="ms-gauges-row">
        <MiniGauge
          label="Market Momentum"
          value={momPct}
          valueLabel={momLabel}
          positive={momPct > 0.5}
          leftLabel="Weak"
          rightLabel="Strong"
          changePct={momChange}
        />
        <MiniGauge
          label="Risk Level"
          value={riskPct}
          valueLabel={riskLabel}
          positive={riskPct > 0.5}
          leftLabel="High"
          rightLabel="Low"
          changePct={riskChange}
        />
      </div>

      {/* Scenarios */}
      <ScenariosSection hero={hero} />

      {/* Signals — translated to plain language */}
      {hero.signals.length > 0 && (
        <div className="ms-signals">
          {hero.signals.map((s) => (
            <span key={s} className="ms-signal-chip">
              {SIGNAL_LABELS[s] || s}
            </span>
          ))}
        </div>
      )}

      {/* Sparkline chart */}
      {showHistory && <UnifiedSparkline history={history} />}

      {/* Footer */}
      <div className="ms-footer">
        <span className="ms-date">as of {formatDate(hero.as_of_date)}</span>
      </div>
    </div>
  );
}

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Plot from "react-plotly.js";
import { useVolatilityDetail } from "../hooks/useVolatilityData";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { cssVar } from "../utils/cssVar";
import { VolatilityGlossary } from "../components/charts/VolatilityGlossary";
import type { VolSection } from "../components/charts/VolatilityGlossary";
import { Gauge, ShieldAlert, Activity, Zap } from "lucide-react";

// ── Constants ───────────────────────────────────────────────────────

const LOOKBACK_OPTIONS = [
  { label: "2Y", value: 500 },
  { label: "3Y", value: 756 },
  { label: "5Y", value: 1260 },
  { label: "All", value: 2520 },
];

const WINDOW_OPTIONS = [
  { label: "6M", value: 126 },
  { label: "1Y", value: 252 },
  { label: "18M", value: 378 },
];

// ── Signal badge ───────────────────────────────────────────────────

const SIGNAL_MAP: Record<string, { label: string; cls: string; desc: string }> = {
  buy: {
    label: "BUY",
    cls: "positive",
    desc: "Low volatility — favourable for equity exposure",
  },
  sell: {
    label: "SELL",
    cls: "negative",
    desc: "High volatility — consider reducing exposure",
  },
  caution: {
    label: "CAUTION",
    cls: "negative",
    desc: "Term structure stressed — monitor closely",
  },
  neutral: {
    label: "NEUTRAL",
    cls: "neutral",
    desc: "No strong signal — stay the course",
  },
};

function SignalCard({ signal, position }: { signal: string; position: string }) {
  const info = SIGNAL_MAP[signal] ?? SIGNAL_MAP.neutral;
  const posLabel = position === "invested" ? "Invested" : "Cash";
  const posCls = position === "invested" ? "positive" : "negative";
  const Icon = signal === "buy" ? Zap : signal === "sell" || signal === "caution" ? ShieldAlert : Activity;

  return (
    <div className="card" style={{ justifyContent: "center" }}>
      <div className="card-icon" style={{ color: info.cls === "positive" ? "var(--success)" : info.cls === "negative" ? "var(--danger)" : "var(--text-muted)" }}>
        <Icon size={20} />
      </div>
      <div className="card-content" style={{ alignItems: "center", textAlign: "center" }}>
        <span className="card-label">Signal</span>
        <span className={`quadrant-badge quadrant-badge--lg ${info.cls}`} style={{ fontSize: 14, padding: "4px 14px", marginTop: 2 }}>
          {info.label}
        </span>
        <span className={`quadrant-badge ${posCls}`} style={{ fontSize: 10, marginTop: 2 }}>
          Strategy: {posLabel}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.3 }}>
          {info.desc}
        </span>
      </div>
    </div>
  );
}

// ── Oscillator gauge bar ───────────────────────────────────────────

function riskLabel(v: number | null): { text: string; cls: string } {
  if (v == null) return { text: "—", cls: "" };
  if (v < 0.3) return { text: "Low Risk", cls: "positive" };
  if (v > 0.7) return { text: "High Risk", cls: "negative" };
  return { text: "Moderate", cls: "neutral" };
}

function OscGauge({ value, label }: { value: number | null; label: string }) {
  const pct = value != null ? Math.round(value * 100) : null;
  const risk = riskLabel(value);
  const fillColor = value == null
    ? "var(--text-muted)"
    : value < 0.3
      ? "var(--success)"
      : value > 0.7
        ? "var(--danger)"
        : "var(--warning, #f5a623)";

  return (
    <div style={{ width: "100%", marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>
        <span>{label}</span>
        <span className={risk.cls} style={{ fontWeight: 600 }}>
          {pct != null ? `${pct}%` : "—"} · {risk.text}
        </span>
      </div>
      <div style={{
        width: "100%", height: 6, borderRadius: 3,
        background: "var(--bg-tertiary)", overflow: "hidden",
      }}>
        <div style={{
          width: pct != null ? `${pct}%` : "0%",
          height: "100%", borderRadius: 3,
          background: fillColor,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

// ── Shared Plotly helpers ──────────────────────────────────────────

function useChartColors() {
  return {
    bg: "rgba(0,0,0,0)",
    grid: cssVar("--chart-grid"),
    text: cssVar("--chart-text"),
    green: cssVar("--success"),
    red: cssVar("--danger"),
    muted: cssVar("--text-muted"),
    blue: "#6395ed",
    orange: "#f5a623",
    cyan: "#45c8dc",
  };
}

const PLOT_CONFIG: Partial<Plotly.Config> = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
};

function baseLayout(c: ReturnType<typeof useChartColors>, height: number): Partial<Plotly.Layout> {
  return {
    paper_bgcolor: c.bg,
    plot_bgcolor: c.bg,
    height,
    margin: { l: 55, r: 20, t: 8, b: 36 },
    xaxis: {
      gridcolor: c.grid,
      color: c.text,
      tickfont: { color: c.text, size: 10 },
      type: "date",
      rangeslider: { visible: false },
    },
    yaxis: {
      gridcolor: c.grid,
      color: c.text,
      tickfont: { color: c.text, size: 10 },
    },
    legend: {
      font: { color: c.text, size: 11 },
      bgcolor: "rgba(0,0,0,0)",
      orientation: "h",
      x: 0,
      y: 1.12,
    },
    hovermode: "x unified",
  };
}

// ── Chart wrapper ──────────────────────────────────────────────────

function ChartSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rankings-table-wrapper" style={{ marginBottom: 20, marginTop: 0 }}>
      <div style={{ padding: "14px 16px 0" }}>
        <h3 style={{
          fontSize: 14, fontWeight: 800, color: "var(--text-primary)",
          letterSpacing: -0.2, margin: 0,
        }}>
          {title}
        </h3>
        {subtitle && (
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.4 }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ padding: "8px 8px 4px" }}>
        {children}
      </div>
    </div>
  );
}

// ── Oscillator value colour ────────────────────────────────────────

function oscColor(v: number | null) {
  if (v == null) return undefined;
  if (v < 0.3) return "var(--success)";
  if (v > 0.7) return "var(--danger)";
  return "var(--text-primary)";
}

// ── Backtest stats ─────────────────────────────────────────────────

function BacktestStats({
  backtest,
}: {
  backtest: { strategy: number | null; benchmark: number | null }[];
}) {
  const last = backtest[backtest.length - 1];
  if (!last || last.strategy == null || last.benchmark == null) return null;

  const stratRet = ((last.strategy - 1) * 100).toFixed(1);
  const benchRet = ((last.benchmark - 1) * 100).toFixed(1);
  const alpha = ((last.strategy - last.benchmark) * 100).toFixed(1);
  const alphaNum = last.strategy - last.benchmark;

  return (
    <div style={{
      display: "flex", gap: 24, padding: "0 16px 12px",
      fontSize: 12, color: "var(--text-muted)",
    }}>
      <span>Strategy: <strong style={{ color: "var(--text-primary)" }}>{stratRet}%</strong></span>
      <span>Buy &amp; Hold: <strong style={{ color: "var(--text-primary)" }}>{benchRet}%</strong></span>
      <span>
        Alpha:{" "}
        <strong style={{ color: alphaNum >= 0 ? "var(--success)" : "var(--danger)" }}>
          {alphaNum >= 0 ? "+" : ""}{alpha}%
        </strong>
      </span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────

// ── Scroll-based glossary section map ──────────────────────────

const GLOSSARY_SCROLL_SECTIONS: { id: string; section: VolSection }[] = [
  { id: "vol-section-cards", section: "overview" },
  { id: "vol-section-oscillators", section: "oscillators" },
  { id: "vol-section-ratio", section: "ratio" },
  { id: "vol-section-backtest", section: "backtest" },
];

// ── Glossary section → page section mapping ───────────────────────

const GLOSSARY_SCROLL_MAP: Record<VolSection, string> = {
  overview: "vol-section-cards",
  oscillators: "vol-section-oscillators",
  ratio: "vol-section-ratio",
  backtest: "vol-section-backtest",
  signals: "vol-section-cards",
};

export function VolatilityPage() {
  const [lookback, setLookback] = useState(1260);
  const [window, setWindow] = useState(252);
  const { data, isLoading, error } = useVolatilityDetail(lookback, window);
  const c = useChartColors();

  // Glossary state
  const [glossarySection, setGlossarySection] = useState<VolSection>("overview");
  const overrideRef = useRef<VolSection | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const forceGlossary = useCallback((s: VolSection) => {
    overrideRef.current = s;
    setGlossarySection(s);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { overrideRef.current = null; }, 1500);
    const elId = GLOSSARY_SCROLL_MAP[s];
    const el = document.getElementById(elId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Auto-update glossary section on scroll (matches other pages)
  useEffect(() => {
    const scrollRoot = document.querySelector(".app-content");
    if (!scrollRoot) return;

    function update() {
      if (overrideRef.current) return;
      const rootTop = scrollRoot!.getBoundingClientRect().top;
      let best: VolSection = "overview";
      let bestDist = Infinity;

      for (const { id, section } of GLOSSARY_SCROLL_SECTIONS) {
        const el = document.getElementById(id);
        if (!el) continue;
        const dist = el.getBoundingClientRect().top - rootTop;
        if (dist < 120 && Math.abs(dist - 120) < bestDist) {
          bestDist = Math.abs(dist - 120);
          best = section;
        }
      }
      setGlossarySection(best);
    }

    update();
    scrollRoot.addEventListener("scroll", update, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", update);
  }, []);

  // Build buy/sell shaded regions for the backtest chart
  const backtestShapes = useMemo(() => {
    if (!data?.backtest_series?.length) return [];
    const shapes: Plotly.Shape[] = [];
    const bt = data.backtest_series;
    let i = 0;
    while (i < bt.length) {
      const pos = bt[i].position;
      const start = bt[i].date;
      let j = i + 1;
      while (j < bt.length && bt[j].position === pos) j++;
      const end = bt[j - 1].date;
      if (pos === 1) {
        shapes.push({
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: start,
          x1: end,
          y0: 0,
          y1: 1,
          fillcolor: "rgba(0,200,100,0.04)",
          line: { width: 0 },
          layer: "below",
        } as Plotly.Shape);
      }
      i = j;
    }
    return shapes;
  }, [data?.backtest_series]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div className="error-msg">Failed to load volatility data.</div>;
  if (!data) return <div className="error-msg">No volatility data available.</div>;

  const { summary: s, oscillator_series, ratio_series, backtest_series, vix_series } = data;

  return (
    <div className="obv-page">
      {/* Top bar */}
      <div className="obv-page-topbar">
        <div className="group-toggle">
          {LOOKBACK_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`toggle-btn ${lookback === o.value ? "toggle-btn--active" : ""}`}
              onClick={() => setLookback(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="group-toggle">
          {WINDOW_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`toggle-btn ${window === o.value ? "toggle-btn--active" : ""}`}
              onClick={() => setWindow(o.value)}
            >
              Window {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="obv-layout">
      <div className="obv-layout-main">

      {/* Summary cards */}
      <section id="vol-section-cards">
      {s.as_of_date && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textAlign: "right" }}>
          Data as of {s.as_of_date}
        </div>
      )}
      <div className="summary-cards" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-icon" style={{ color: oscColor(s.vix_oscillator) ?? "var(--text-muted)" }}>
            <Gauge size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">VIX — Short-Term Fear</span>
            <span className="card-value" style={{ color: oscColor(s.vix_oscillator) }}>
              {s.vix_last != null ? s.vix_last.toFixed(2) : "—"}
            </span>
            <OscGauge value={s.vix_oscillator} label="Where is VIX in its 1Y range?" />
          </div>
        </div>
        <div className="card">
          <div className="card-icon" style={{ color: "var(--text-muted)" }}>
            <Activity size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">VIX3M — Medium-Term Fear</span>
            <span className="card-value">{s.vix3m_last != null ? s.vix3m_last.toFixed(2) : "—"}</span>
            <OscGauge value={s.ratio_oscillator} label="Term-structure stress" />
          </div>
        </div>
        <div className="card">
          <div className="card-icon" style={{ color: s.vix_ratio != null && s.vix_ratio > 1 ? "var(--danger)" : "var(--success)" }}>
            <ShieldAlert size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">Term Structure</span>
            <span className="card-value" style={{
              color: s.vix_ratio != null && s.vix_ratio > 1 ? "var(--danger)" : "var(--success)",
            }}>
              {s.vix_ratio != null ? s.vix_ratio.toFixed(4) : "—"}
            </span>
            <span className="card-secondary">
              {s.vix_ratio != null
                ? s.vix_ratio > 1
                  ? "⚠ Backwardation — near-term fear elevated"
                  : "✓ Contango — normal conditions"
                : ""}
            </span>
            {s.ratio_ma50 != null && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                50-day avg: {s.ratio_ma50.toFixed(4)}
              </span>
            )}
          </div>
        </div>
        <SignalCard signal={s.signal} position={s.position} />
      </div>

      </section>

      {/* Chart 1: VIX Uncertainty Oscillators */}
      <section id="vol-section-oscillators">
      <ChartSection
        title="VIX Uncertainty Oscillators"
        subtitle="Below 30% = low volatility (buy zone) — Above 70% = high volatility (sell zone)"
      >
        <Plot
          data={[
            {
              x: oscillator_series.map((p) => p.date),
              y: oscillator_series.map((p) => p.vix_osc != null ? +(p.vix_osc * 100).toFixed(1) : null),
              type: "scatter",
              mode: "lines",
              line: { color: c.blue, width: 2 },
              name: "VIX Oscillator",
              hovertemplate: "%{y:.1f}%<extra>VIX Osc</extra>",
            },
            {
              x: oscillator_series.map((p) => p.date),
              y: oscillator_series.map((p) => p.ratio_osc != null ? +(p.ratio_osc * 100).toFixed(1) : null),
              type: "scatter",
              mode: "lines",
              line: { color: c.orange, width: 2 },
              name: "VIX Ratio Oscillator",
              hovertemplate: "%{y:.1f}%<extra>Ratio Osc</extra>",
            },
          ]}
          layout={{
            ...baseLayout(c, 320),
            yaxis: {
              ...baseLayout(c, 320).yaxis,
              range: [0, 100],
              dtick: 10,
              title: { text: "Oscillator %", font: { color: c.text, size: 11 } },
            },
            shapes: [
              { type: "line", x0: 0, x1: 1, xref: "paper", y0: 50, y1: 50, line: { color: c.muted, width: 1, dash: "dot" } },
              { type: "line", x0: 0, x1: 1, xref: "paper", y0: 30, y1: 30, line: { color: c.green, width: 1.2, dash: "dash" } },
              { type: "line", x0: 0, x1: 1, xref: "paper", y0: 70, y1: 70, line: { color: c.red, width: 1.2, dash: "dash" } },
              { type: "rect", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 30, fillcolor: "rgba(0,200,100,0.06)", line: { width: 0 } },
              { type: "rect", x0: 0, x1: 1, xref: "paper", y0: 70, y1: 100, fillcolor: "rgba(255,80,80,0.06)", line: { width: 0 } },
            ] as Plotly.Shape[],
            annotations: [
              { x: 0.005, xref: "paper", y: 15, yref: "y", text: "BUY ZONE", showarrow: false, font: { size: 10, color: c.green }, opacity: 0.5 },
              { x: 0.005, xref: "paper", y: 85, yref: "y", text: "SELL ZONE", showarrow: false, font: { size: 10, color: c.red }, opacity: 0.5 },
            ] as Plotly.Annotations[],
          }}
          config={PLOT_CONFIG}
          useResizeHandler
          style={{ width: "100%", height: 320 }}
        />
      </ChartSection>

      </section>

      {/* Charts row: Ratio + VIX Levels side by side */}
      <section id="vol-section-ratio">
      <div className="vol-charts-row">
        {/* Chart 2: VIX Term Structure Ratio */}
        <ChartSection
          title="VIX Term Structure Ratio"
          subtitle="Ratio > 1 = backwardation (fear) — Ratio < 1 = contango (normal)"
        >
          <Plot
            data={[
              {
                x: ratio_series.map((p) => p.date),
                y: ratio_series.map((p) => p.ratio),
                type: "scatter",
                mode: "lines",
                line: { color: c.cyan, width: 1.5 },
                name: "VIX / VIX3M",
                hovertemplate: "%{y:.4f}<extra>Ratio</extra>",
              },
              {
                x: ratio_series.map((p) => p.date),
                y: ratio_series.map((p) => p.ratio_ma50),
                type: "scatter",
                mode: "lines",
                line: { color: c.red, width: 1.5, dash: "dot" },
                name: "MA 50",
                hovertemplate: "%{y:.4f}<extra>MA50</extra>",
              },
            ]}
            layout={{
              ...baseLayout(c, 260),
              yaxis: {
                ...baseLayout(c, 260).yaxis,
                title: { text: "Ratio", font: { color: c.text, size: 11 } },
              },
              shapes: [
                { type: "line", x0: 0, x1: 1, xref: "paper", y0: 1, y1: 1, line: { color: c.muted, width: 1, dash: "dash" } },
              ] as Plotly.Shape[],
            }}
            config={PLOT_CONFIG}
            useResizeHandler
            style={{ width: "100%", height: 260 }}
          />
        </ChartSection>

        {/* Chart 3: VIX & VIX3M Levels */}
        <ChartSection title="VIX Levels">
          <Plot
            data={[
              {
                x: vix_series.map((p) => p.date),
                y: vix_series.map((p) => p.vix),
                type: "scatter",
                mode: "lines",
                line: { color: c.blue, width: 1.5 },
                name: "VIX (1M)",
                hovertemplate: "%{y:.2f}<extra>VIX</extra>",
              },
              {
                x: vix_series.map((p) => p.date),
                y: vix_series.map((p) => p.vix3m),
                type: "scatter",
                mode: "lines",
                line: { color: c.orange, width: 1.5 },
                name: "VIX3M (3M)",
                hovertemplate: "%{y:.2f}<extra>VIX3M</extra>",
              },
            ]}
            layout={{
              ...baseLayout(c, 260),
              yaxis: {
                ...baseLayout(c, 260).yaxis,
                title: { text: "Level", font: { color: c.text, size: 11 } },
              },
            }}
            config={PLOT_CONFIG}
            useResizeHandler
            style={{ width: "100%", height: 260 }}
          />
        </ChartSection>
      </div>

      </section>

      {/* Chart 4: Backtest */}
      <section id="vol-section-backtest">
      <ChartSection
        title="Backtest: VIX Oscillator Strategy vs Buy & Hold"
        subtitle="Buy S&P 500 when VIX Oscillator < 30%, go to cash otherwise — includes 0.1% trading fees per trade. Green-shaded areas = invested."
      >
        <Plot
          data={[
            {
              x: backtest_series.map((p) => p.date),
              y: backtest_series.map((p) => p.strategy),
              type: "scatter",
              mode: "lines",
              line: { color: c.blue, width: 2.2 },
              name: "Strategy",
              hovertemplate: "%{y:.3f}x<extra>Strategy</extra>",
            },
            {
              x: backtest_series.map((p) => p.date),
              y: backtest_series.map((p) => p.benchmark),
              type: "scatter",
              mode: "lines",
              line: { color: c.muted, width: 1.5, dash: "dash" },
              name: "S&P 500 (Buy & Hold)",
              hovertemplate: "%{y:.3f}x<extra>S&P 500</extra>",
            },
          ]}
          layout={{
            ...baseLayout(c, 320),
            yaxis: {
              ...baseLayout(c, 320).yaxis,
              title: { text: "Cumulative", font: { color: c.text, size: 11 } },
            },
            shapes: backtestShapes,
          }}
          config={PLOT_CONFIG}
          useResizeHandler
          style={{ width: "100%", height: 320 }}
        />
        <BacktestStats backtest={backtest_series} />
      </ChartSection>
      </section>

      </div>

      {/* Glossary sidebar */}
      <aside className="obv-layout-glossary">
        <VolatilityGlossary activeSection={glossarySection} onNavigate={forceGlossary} />
      </aside>
      </div>
    </div>
  );
}

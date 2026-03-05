import { useState } from "react";
import Plot from "react-plotly.js";
import { useOBVDetail, useOBVScoreHistory, useOBVStructure } from "../hooks/useOBVData";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useTheme } from "../hooks/useTheme";
import { formatPct, formatNum } from "../utils/formatters";
import type { OBVStructureEntry } from "../types/obv";
import { TrendingUp, TrendingDown, Activity, Award, X } from "lucide-react";
import { getTickerColor } from "../utils/colors";

// ── Shared helpers ────────────────────────────────────────────────────

function RegimeBadge({ regime }: { regime: "buy" | "sell" }) {
  return (
    <span className={`quadrant-badge ${regime === "buy" ? "positive" : "negative"}`}>
      {regime.toUpperCase()}
    </span>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  if (value == null) return <span>—</span>;
  const pct = ((value + 1) / 2) * 100;
  const color = value >= 0 ? "var(--success)" : "var(--danger)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 60, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <span className="num-cell" style={{ color, minWidth: 48 }}>{value.toFixed(3)}</span>
    </div>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────

function OBVSummaryCards({ data }: { data: OBVStructureEntry[] }) {
  const buyCount = data.filter((e) => e.obv_regime === "buy").length;
  const sellCount = data.filter((e) => e.obv_regime === "sell").length;
  const sorted = [...data].sort((a, b) => (b.rotation_score ?? -1) - (a.rotation_score ?? -1));
  const topAccum = sorted[0];
  const topDistrib = sorted[sorted.length - 1];
  const avgScore = data.reduce((s, e) => s + (e.rotation_score ?? 0), 0) / data.length;

  return (
    <div className="summary-cards" style={{ marginBottom: 20 }}>
      <div className="card">
        <div className="card-icon" style={{ background: "rgba(63,185,80,0.1)", color: "var(--success)" }}>
          <TrendingUp size={20} />
        </div>
        <div className="card-content">
          <span className="card-label">Accumulation Signals</span>
          <span className="card-value positive">{buyCount}</span>
        </div>
      </div>
      <div className="card">
        <div className="card-icon" style={{ background: "rgba(248,81,73,0.1)", color: "var(--danger)" }}>
          <TrendingDown size={20} />
        </div>
        <div className="card-content">
          <span className="card-label">Distribution Signals</span>
          <span className="card-value negative">{sellCount}</span>
        </div>
      </div>
      <div className="card">
        <div className="card-icon"><Award size={20} /></div>
        <div className="card-content">
          <span className="card-label">Top Accumulator</span>
          <span className="card-value positive" style={{ fontSize: 16 }}>{topAccum?.symbol ?? "—"}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{topAccum?.asset}</span>
        </div>
      </div>
      <div className="card">
        <div className="card-icon" style={{ color: "var(--danger)" }}><Award size={20} /></div>
        <div className="card-content">
          <span className="card-label">Top Distributor</span>
          <span className="card-value negative" style={{ fontSize: 16 }}>{topDistrib?.symbol ?? "—"}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{topDistrib?.asset}</span>
        </div>
      </div>
      <div className="card">
        <div className="card-icon"><Activity size={20} /></div>
        <div className="card-content">
          <span className="card-label">Avg Rotation Score</span>
          <span className={`card-value ${avgScore >= 0 ? "positive" : "negative"}`} style={{ fontSize: 18 }}>
            {avgScore.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Score History heatmap ─────────────────────────────────────────────

type HistoryLookback = 63 | 126 | 252 | 504;

function ScoreHistoryChart() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [lookback, setLookback] = useState<HistoryLookback>(252);

  const { data, isLoading } = useOBVScoreHistory(undefined, lookback);

  const bgColor = isDark ? "#0d1117" : "#ffffff";
  const textColor = isDark ? "#8b949e" : "#656d76";

  const LOOKBACK_OPTIONS: { label: string; value: HistoryLookback }[] = [
    { label: "3M", value: 63 },
    { label: "6M", value: 126 },
    { label: "1Y", value: 252 },
    { label: "2Y", value: 504 },
  ];

  // Build heatmap data: sort tickers by latest score (best on top)
  const heatmapData = (() => {
    if (!data || data.length === 0) return null;

    // Sort by latest rotation score descending (strongest accumulation on top)
    const sorted = [...data].sort((a, b) => {
      const aLast = (a.data.length > 0 ? a.data[a.data.length - 1].rotation_score : 0) ?? 0;
      const bLast = (b.data.length > 0 ? b.data[b.data.length - 1].rotation_score : 0) ?? 0;
      return aLast - bLast; // bottom-to-top in heatmap, so ascending
    });

    // Use dates from the longest series
    const dates = sorted.reduce((best, s) =>
      s.data.length > best.length ? s.data.map((p) => p.date) : best, [] as string[]);

    const symbols = sorted.map((s) => s.symbol);
    const z = sorted.map((s) => {
      const scoreMap = new Map(s.data.map((p) => [p.date, p.rotation_score]));
      return dates.map((d) => scoreMap.get(d) ?? null);
    });

    return { dates, symbols, z };
  })();

  return (
    <div className="dashboard-chart-section" style={{ marginTop: 24 }}>
      <div className="section-header">
        <h2>OBV Rotation Score — History</h2>
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
      </div>
      <p className="section-subtitle">
        Heatmap of daily rotation scores (−1 to +1). <span style={{ color: "var(--success)" }}>Green</span> = accumulation,
        <span style={{ color: "var(--danger)" }}> Red</span> = distribution. Sorted by latest score (strongest on top).
      </p>
      <div className="chart-container">
        {isLoading || !data ? (
          <LoadingSpinner />
        ) : !heatmapData ? (
          <div className="loading-spinner" style={{ color: "var(--text-muted)", fontSize: 13 }}>
            No score history yet — it will populate after the first daily API call.
          </div>
        ) : (
          <Plot
            data={[
              {
                x: heatmapData.dates,
                y: heatmapData.symbols,
                z: heatmapData.z,
                type: "heatmap" as const,
                colorscale: [
                  [0, isDark ? "#b62324" : "#cf222e"],
                  [0.25, isDark ? "#8b3a3a" : "#e0969a"],
                  [0.5, isDark ? "#1a1e24" : "#f0f0f0"],
                  [0.75, isDark ? "#2a5a30" : "#90d498"],
                  [1, isDark ? "#2ea043" : "#2da44e"],
                ],
                zmin: -1,
                zmax: 1,
                colorbar: {
                  title: { text: "Score", font: { color: textColor, size: 11 } },
                  tickfont: { color: textColor, size: 10 },
                  tickvals: [-1, -0.5, 0, 0.5, 1],
                  len: 0.9,
                  thickness: 12,
                  outlinewidth: 0,
                },
                hovertemplate: "<b>%{y}</b><br>%{x}<br>Score: %{z:.3f}<extra></extra>",
                xgap: 1,
                ygap: 2,
              },
            ]}
            layout={{
              paper_bgcolor: bgColor,
              plot_bgcolor: bgColor,
              height: Math.max(400, heatmapData.symbols.length * 22 + 80),
              margin: { l: 60, r: 80, t: 10, b: 40 },
              xaxis: {
                color: textColor,
                tickfont: { color: textColor, size: 10 },
                side: "bottom",
              },
              yaxis: {
                color: textColor,
                tickfont: { color: textColor, size: 11 },
                automargin: true,
                dtick: 1,
              },
            }}
            config={{ responsive: true, displayModeBar: false, displaylogo: false }}
            useResizeHandler
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
    </div>
  );
}

// ── Spread panels (mini bar charts, grouped) ──────────────────────────

type SpreadLookback = 63 | 126 | 252;

function SpreadPanels({ data }: { data: OBVStructureEntry[] }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [lookback, setLookback] = useState<SpreadLookback>(252);

  const bgColor = isDark ? "#0d1117" : "#ffffff";
  const textColor = isDark ? "#8b949e" : "#656d76";
  const greenColor = isDark ? "#3fb950" : "#2da44e";
  const redColor = isDark ? "#f85149" : "#cf222e";

  const LOOKBACK_OPTIONS: { label: string; value: SpreadLookback }[] = [
    { label: "3M", value: 63 },
    { label: "6M", value: 126 },
    { label: "1Y", value: 252 },
  ];

  const cols = 3;
  const subplots = data.map((entry, i) => {
    const allDates = entry.spread_series.map((p) => p.date);
    const allValues = entry.spread_series.map((p) => p.value);
    const slicedDates = lookback < allDates.length ? allDates.slice(-lookback) : allDates;
    const slicedValues = lookback < allValues.length ? allValues.slice(-lookback) : allValues;
    return {
      dates: slicedDates,
      posValues: slicedValues.map((v) => (v >= 0 ? v : 0)),
      negValues: slicedValues.map((v) => (v < 0 ? v : 0)),
      name: entry.asset,
      symbol: entry.symbol,
      row: Math.floor(i / cols) + 1,
      col: (i % cols) + 1,
      regime: entry.obv_regime,
      score: entry.rotation_score,
    };
  });

  const rows = Math.ceil(data.length / cols);
  const traces: Plotly.Data[] = [];
  const annotations: Partial<Plotly.Annotations>[] = [];

  subplots.forEach((sp, i) => {
    const xaxis = i === 0 ? "x" : `x${i + 1}`;
    const yaxis = i === 0 ? "y" : `y${i + 1}`;

    traces.push({
      x: sp.dates, y: sp.posValues, type: "bar",
      marker: { color: greenColor }, xaxis, yaxis, showlegend: false,
      hovertemplate: `<b>${sp.name}</b><br>%{x}<br>Spread: %{y:,.0f}<extra></extra>`,
    });
    traces.push({
      x: sp.dates, y: sp.negValues, type: "bar",
      marker: { color: redColor }, xaxis, yaxis, showlegend: false,
      hovertemplate: `<b>${sp.name}</b><br>%{x}<br>Spread: %{y:,.0f}<extra></extra>`,
    });

    const titleColor = sp.regime === "buy" ? greenColor : redColor;
    const scoreLabel = sp.score != null ? ` · ${sp.score >= 0 ? "+" : ""}${sp.score.toFixed(2)}` : "";

    annotations.push({
      text: `<b>${sp.symbol}</b> [${sp.regime.toUpperCase()}]${scoreLabel}`,
      xref: `${xaxis} domain` as Plotly.XAxisName,
      yref: `${yaxis} domain` as Plotly.YAxisName,
      x: 0.5, y: 1.18, showarrow: false,
      font: { size: 11, color: titleColor }, xanchor: "center",
    });
    annotations.push({
      text: sp.name,
      xref: `${xaxis} domain` as Plotly.XAxisName,
      yref: `${yaxis} domain` as Plotly.YAxisName,
      x: 0.5, y: 1.04, showarrow: false,
      font: { size: 9, color: textColor }, xanchor: "center",
    });
  });

  const layoutAxes: Record<string, unknown> = {};
  subplots.forEach((sp, i) => {
    const xKey = i === 0 ? "xaxis" : `xaxis${i + 1}`;
    const yKey = i === 0 ? "yaxis" : `yaxis${i + 1}`;
    const colFrac = 1 / cols;
    const rowFrac = 1 / rows;
    const gap = 0.06;
    const x0 = (sp.col - 1) * colFrac + (sp.col > 1 ? gap / 2 : 0);
    const x1 = sp.col * colFrac - (sp.col < cols ? gap / 2 : 0);
    const y0 = 1 - sp.row * rowFrac + (sp.row < rows ? gap / 2 : 0);
    const y1 = 1 - (sp.row - 1) * rowFrac - (sp.row > 1 ? gap / 2 : 0);
    layoutAxes[xKey] = { domain: [x0, x1], anchor: i === 0 ? "y" : `y${i + 1}`, showticklabels: false, showgrid: false };
    layoutAxes[yKey] = { domain: [y0, y1], anchor: i === 0 ? "x" : `x${i + 1}`, showticklabels: false, showgrid: false, zeroline: true, zerolinecolor: isDark ? "#30363d" : "#d0d7de", zerolinewidth: 1 };
  });

  return (
    <div className="dashboard-chart-section" style={{ marginTop: 24 }}>
      <div className="section-header">
        <h2>OBV Spread History</h2>
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
      </div>
      <p className="section-subtitle">
        OBV spread (OBV − 50-bar SMA) per asset. Green = accumulation, red = distribution. Click any row in the table to open the full detail view.
      </p>
      <div className="chart-container">
        <Plot
          data={traces}
          layout={{
            paper_bgcolor: bgColor, plot_bgcolor: bgColor,
            height: rows * 190 + 40,
            margin: { l: 16, r: 16, t: 40, b: 16 },
            barmode: "overlay", bargap: 0,
            annotations, ...layoutAxes,
          }}
          config={{ responsive: true, displayModeBar: false, displaylogo: false }}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────

type DetailLookback = 63 | 126 | 252;

function DetailModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [lookback, setLookback] = useState<DetailLookback>(252);

  const { data, isLoading } = useOBVDetail(symbol, lookback);

  const bgColor = isDark ? "#0d1117" : "#ffffff";
  const gridColor = isDark ? "#21262d" : "#eaeef2";
  const textColor = isDark ? "#8b949e" : "#656d76";
  const greenColor = isDark ? "#3fb950" : "#2da44e";
  const redColor = isDark ? "#f85149" : "#cf222e";
  const tickerColor = getTickerColor(symbol);

  const LOOKBACK_OPTIONS: { label: string; value: DetailLookback }[] = [
    { label: "3M", value: 63 },
    { label: "6M", value: 126 },
    { label: "1Y", value: 252 },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="ticker-cell" style={{ fontSize: 20, color: tickerColor }}>{symbol}</span>
            {data && (
              <>
                <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>{data.asset}</span>
                <RegimeBadge regime={data.obv_regime} />
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
            <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {isLoading || !data ? (
          <LoadingSpinner />
        ) : (
          <div className="modal-body">
            {/* Metric pills */}
            <div className="modal-metric-row">
              {[
                { label: "Rotation Score", val: data.rotation_score?.toFixed(3), colorize: data.rotation_score },
                { label: "Spread %ile", val: formatNum(data.spread_percentile, 3), colorize: null },
                { label: "Momentum (z)", val: formatNum(data.spread_momentum_z, 3), colorize: null },
                { label: "1M Return", val: formatPct(data.return_1m), colorize: data.return_1m },
                { label: "3M Return", val: formatPct(data.return_3m), colorize: data.return_3m },
                { label: "6M Return", val: formatPct(data.return_6m), colorize: data.return_6m },
                { label: "YTD Return", val: formatPct(data.return_ytd), colorize: data.return_ytd },
              ].map(({ label, val, colorize }) => (
                <div key={label} className="modal-metric">
                  <span className="card-label">{label}</span>
                  <span className={`modal-metric-val ${colorize != null ? (colorize >= 0 ? "positive" : "negative") : ""}`}>
                    {val ?? "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Spread bar chart */}
            <div style={{ marginBottom: 20 }}>
              <p className="section-subtitle" style={{ marginBottom: 8 }}>OBV Spread (OBV − 50-bar SMA)</p>
              <Plot
                data={[
                  {
                    x: data.spread_series.map((p) => p.date),
                    y: data.spread_series.map((p) => (p.value >= 0 ? p.value : 0)),
                    type: "bar", marker: { color: greenColor }, showlegend: false,
                    hovertemplate: `%{x}<br>Spread: %{y:,.0f}<extra></extra>`,
                  },
                  {
                    x: data.spread_series.map((p) => p.date),
                    y: data.spread_series.map((p) => (p.value < 0 ? p.value : 0)),
                    type: "bar", marker: { color: redColor }, showlegend: false,
                    hovertemplate: `%{x}<br>Spread: %{y:,.0f}<extra></extra>`,
                  },
                ]}
                layout={{
                  paper_bgcolor: bgColor, plot_bgcolor: bgColor, height: 220,
                  margin: { l: 55, r: 16, t: 10, b: 40 },
                  barmode: "overlay", bargap: 0,
                  xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                  yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, zeroline: true, zerolinecolor: isDark ? "#484f58" : "#b1bac4", title: { text: "Spread", font: { color: textColor, size: 10 } } },
                }}
                config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                useResizeHandler style={{ width: "100%", height: "100%" }}
              />
            </div>

            {/* Score history from DB */}
            {data.score_history.length > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <p className="section-subtitle" style={{ marginBottom: 8 }}>Rotation Score History (daily snapshots)</p>
                <Plot
                  data={[
                    {
                      x: data.score_history.map((p) => p.date),
                      y: data.score_history.map((p) => p.rotation_score),
                      type: "scatter", mode: "lines",
                      line: { color: tickerColor, width: 2 },
                      fill: "tozeroy",
                      fillcolor: (data.rotation_score ?? 0) >= 0
                        ? isDark ? "rgba(63,185,80,0.12)" : "rgba(26,127,55,0.08)"
                        : isDark ? "rgba(248,81,73,0.12)" : "rgba(207,34,46,0.08)",
                      showlegend: false,
                      hovertemplate: `%{x}<br>Score: %{y:.3f}<extra></extra>`,
                    },
                  ]}
                  layout={{
                    paper_bgcolor: bgColor, plot_bgcolor: bgColor, height: 200,
                    margin: { l: 55, r: 16, t: 10, b: 40 },
                    xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                    yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, zeroline: true, zerolinecolor: isDark ? "#484f58" : "#b1bac4", range: [-1.05, 1.05], title: { text: "Score", font: { color: textColor, size: 10 } } },
                    shapes: [
                      { type: "rect", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 1.05, fillcolor: isDark ? "rgba(63,185,80,0.04)" : "rgba(26,127,55,0.03)", line: { width: 0 }, layer: "below" },
                      { type: "rect", x0: 0, x1: 1, xref: "paper", y0: -1.05, y1: 0, fillcolor: isDark ? "rgba(248,81,73,0.04)" : "rgba(207,34,46,0.03)", line: { width: 0 }, layer: "below" },
                    ],
                  }}
                  config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                  useResizeHandler style={{ width: "100%", height: "100%" }}
                />
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "12px 0 20px" }}>
                Score history not yet available — it will appear after the first daily API call.
              </div>
            )}

            {/* OBV absolute series */}
            <div>
              <p className="section-subtitle" style={{ marginBottom: 8 }}>OBV — Absolute Value</p>
              <Plot
                data={[
                  {
                    x: data.obv_series.map((p) => p.date),
                    y: data.obv_series.map((p) => p.value),
                    type: "scatter", mode: "lines",
                    line: { color: tickerColor, width: 1.5 },
                    showlegend: false,
                    hovertemplate: `%{x}<br>OBV: %{y:,.0f}<extra></extra>`,
                  },
                ]}
                layout={{
                  paper_bgcolor: bgColor, plot_bgcolor: bgColor, height: 180,
                  margin: { l: 55, r: 16, t: 10, b: 40 },
                  xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                  yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, title: { text: "OBV", font: { color: textColor, size: 10 } } },
                }}
                config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                useResizeHandler style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export function OBVStructurePage() {
  const { data, isLoading, error } = useOBVStructure();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div className="error-msg">Failed to load OBV data.</div>;
  if (!data || data.length === 0) return <div className="error-msg">No OBV data available.</div>;

  return (
    <div className="rankings-page">
      {selectedSymbol && (
        <DetailModal symbol={selectedSymbol} onClose={() => setSelectedSymbol(null)} />
      )}

      <p className="tab-description">
        <strong>OBV Structure Ranking</strong> uses On-Balance Volume to detect accumulation/distribution.
        The <strong>Spread</strong> (OBV minus its 50-bar SMA) is ranked by percentile and z-scored momentum,
        producing a composite <strong>Rotation Score</strong> from −1 (max distribution) to +1 (max accumulation).
        Click any row to open the <strong>detail view</strong> with full charts and score history.
      </p>

      <OBVSummaryCards data={data} />

      <div className="rankings-table-wrapper">
        <h3 className="table-title">OBV Structure Ranking — click a row to inspect</h3>
        <table className="rankings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Asset</th>
              <th>Symbol</th>
              <th>Regime</th>
              <th>Score</th>
              <th>Spread %ile</th>
              <th>Momentum (z)</th>
              <th>1M</th>
              <th>3M</th>
              <th>6M</th>
              <th>YTD</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry, i) => (
              <tr
                key={entry.symbol}
                className="obv-table-row"
                onClick={() => setSelectedSymbol(entry.symbol)}
                title="Click to open detail view"
              >
                <td className="rank-cell">{i + 1}</td>
                <td>{entry.asset}</td>
                <td className="ticker-cell">{entry.symbol}</td>
                <td><RegimeBadge regime={entry.obv_regime} /></td>
                <td><ScoreBar value={entry.rotation_score} /></td>
                <td className="num-cell">{formatNum(entry.spread_percentile, 3)}</td>
                <td className="num-cell">{formatNum(entry.spread_momentum_z, 3)}</td>
                <td className={`num-cell ${(entry.return_1m ?? 0) >= 0 ? "positive" : "negative"}`}>{formatPct(entry.return_1m)}</td>
                <td className={`num-cell ${(entry.return_3m ?? 0) >= 0 ? "positive" : "negative"}`}>{formatPct(entry.return_3m)}</td>
                <td className={`num-cell ${(entry.return_6m ?? 0) >= 0 ? "positive" : "negative"}`}>{formatPct(entry.return_6m)}</td>
                <td className={`num-cell ${(entry.return_ytd ?? 0) >= 0 ? "positive" : "negative"}`}>{formatPct(entry.return_ytd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ScoreHistoryChart />
      <SpreadPanels data={data} />
    </div>
  );
}

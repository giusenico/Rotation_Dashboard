import { useState } from "react";
import Plot from "react-plotly.js";
import { X } from "lucide-react";
import { useOBVDetail } from "../../hooks/useFlowData";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { getTickerColor } from "../../utils/colors";
import { cssVar } from "../../utils/cssVar";
import { formatPct, formatNum } from "../../utils/formatters";
import type { OBVTimeframe } from "../../api/flow";
import type { OBVDetailResponse } from "../../types/flow";

const LOOKBACK_BY_TF: Record<OBVTimeframe, { label: string; value: number }[]> = {
  daily: [
    { label: "3M", value: 63 },
    { label: "6M", value: 126 },
    { label: "1Y", value: 252 },
    { label: "2Y", value: 504 },
    { label: "5Y", value: 1260 },
    { label: "All", value: 9999 },
  ],
  "4h": [
    { label: "3M", value: 126 },
    { label: "6M", value: 252 },
    { label: "1Y", value: 504 },
    { label: "2Y", value: 1008 },
    { label: "5Y", value: 2520 },
    { label: "All", value: 9999 },
  ],
  weekly: [
    { label: "3M", value: 13 },
    { label: "6M", value: 26 },
    { label: "1Y", value: 52 },
    { label: "2Y", value: 104 },
    { label: "5Y", value: 260 },
    { label: "All", value: 9999 },
  ],
};

function useMultiOBVDetail(symbols: string[], lookback: number, timeframe: OBVTimeframe) {
  const d0 = useOBVDetail(symbols[0] ?? null, lookback, timeframe);
  const d1 = useOBVDetail(symbols[1] ?? null, lookback, timeframe);
  const d2 = useOBVDetail(symbols[2] ?? null, lookback, timeframe);
  const d3 = useOBVDetail(symbols[3] ?? null, lookback, timeframe);
  const d4 = useOBVDetail(symbols[4] ?? null, lookback, timeframe);

  const all = [d0, d1, d2, d3, d4].slice(0, symbols.length);
  const isLoading = all.some((q) => q.isLoading);
  const results = all.map((q) => q.data).filter((d): d is OBVDetailResponse => d != null);

  return { results, isLoading };
}

// ── Normalize helper: rebase series to 0..1 or -1..1 range ──────
function normalizeValues(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0);
  return values.map((v) => (v - min) / range);
}

interface Props {
  symbols: string[];
  timeframe: OBVTimeframe;
  onClose: () => void;
}

export function FlowCompareModal({ symbols, timeframe, onClose }: Props) {
  const currentOptions = LOOKBACK_BY_TF[timeframe];
  const defaultLookback = (currentOptions.find(o => o.label === "5Y") ?? currentOptions[currentOptions.length - 1]).value;
  const [lookback, setLookback] = useState(defaultLookback);
  const { results, isLoading } = useMultiOBVDetail(symbols, lookback, timeframe);

  const bgColor = "rgba(0,0,0,0)";
  const gridColor = cssVar("--chart-grid");
  const textColor = cssVar("--chart-text");
  const zeroLine = cssVar("--zeroline");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel compare-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="modal-header-ticker">Compare</span>
            <div style={{ display: "flex", gap: 8 }}>
              {symbols.map((s) => (
                <span key={s} className="compare-legend-chip" style={{ borderColor: getTickerColor(s) }}>
                  <span className="ticker-dot" style={{ background: getTickerColor(s) }} />
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="group-toggle">
              {currentOptions.map((o) => (
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

        {isLoading || results.length < 2 ? (
          <LoadingSpinner />
        ) : (
          <div className="modal-body">
            {/* ── Metrics comparison table ── */}
            <div className="compare-metrics-table-wrap">
              <table className="compare-metrics-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    {results.map((d) => (
                      <th key={d.symbol} style={{ color: getTickerColor(d.symbol) }}>{d.symbol}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Regime</td>
                    {results.map((d) => (
                      <td key={d.symbol}>
                        <span className={`quadrant-badge ${d.obv_regime === "buy" ? "positive" : "negative"}`}>
                          {d.obv_regime === "buy" ? "Buying" : "Selling"}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Flow Score</td>
                    {results.map((d) => (
                      <td key={d.symbol} className={`num-cell ${(d.rotation_score ?? 0) >= 0 ? "positive" : "negative"}`}>
                        {formatNum(d.rotation_score, 3)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Flow Intensity</td>
                    {results.map((d) => (
                      <td key={d.symbol} className="num-cell">{formatNum(d.spread_percentile, 3)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Trend Speed</td>
                    {results.map((d) => (
                      <td key={d.symbol} className="num-cell">{formatNum(d.spread_momentum_z, 3)}</td>
                    ))}
                  </tr>
                  {([
                    ["1M", "return_1m"],
                    ["3M", "return_3m"],
                    ["6M", "return_6m"],
                    ["YTD", "return_ytd"],
                  ] as const).map(([label, key]) => (
                    <tr key={key}>
                      <td>{label} Return</td>
                      {results.map((d) => {
                        const val = d[key];
                        return (
                          <td key={d.symbol} className={`num-cell ${(val ?? 0) >= 0 ? "positive" : "negative"}`}>
                            {formatPct(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Flow Score History overlay ── */}
            {results.some((d) => d.score_history.length > 0) && (
              <div style={{ marginBottom: 20 }}>
                <p className="section-subtitle" style={{ marginBottom: 8 }}>Flow Score History</p>
                <Plot
                  data={results.map((d) => ({
                    x: d.score_history.map((p) => p.date),
                    y: d.score_history.map((p) => p.rotation_score),
                    type: "scatter" as const,
                    mode: "lines" as const,
                    name: d.symbol,
                    line: { color: getTickerColor(d.symbol), width: 2 },
                    hovertemplate: `${d.symbol}<br>%{x}<br>Score: %{y:.3f}<extra></extra>`,
                  }))}
                  layout={{
                    paper_bgcolor: bgColor,
                    plot_bgcolor: bgColor,
                    height: 240,
                    margin: { l: 55, r: 16, t: 10, b: 40 },
                    xaxis: { type: "date", tickformat: "%b '%y", gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                    yaxis: {
                      gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 },
                      zeroline: true, zerolinecolor: zeroLine, range: [-1.05, 1.05],
                      title: { text: "Score", font: { color: textColor, size: 10 } },
                    },
                    shapes: [
                      { type: "rect", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 1.05, fillcolor: cssVar("--positive-fill"), line: { width: 0 }, layer: "below" },
                      { type: "rect", x0: 0, x1: 1, xref: "paper", y0: -1.05, y1: 0, fillcolor: cssVar("--negative-fill"), line: { width: 0 }, layer: "below" },
                    ],
                    legend: { orientation: "h", y: 1.12, x: 0.5, xanchor: "center", font: { color: textColor, size: 11 } },
                    showlegend: true,
                  }}
                  config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                  useResizeHandler
                  style={{ width: "100%", height: 240 }}
                />
              </div>
            )}

            {/* ── Net Capital Flow (spread) overlay ── */}
            <div style={{ marginBottom: 20 }}>
              <p className="section-subtitle" style={{ marginBottom: 8 }}>Net Capital Flow vs. MA (Normalized)</p>
              <Plot
                data={results.map((d) => {
                  const normalized = normalizeValues(d.spread_series.map((p) => p.value));
                  return {
                    x: d.spread_series.map((p) => p.date),
                    y: normalized,
                    type: "scatter" as const,
                    mode: "lines" as const,
                    name: d.symbol,
                    line: { color: getTickerColor(d.symbol), width: 1.5 },
                    hovertemplate: `${d.symbol}<br>%{x}<br>Spread: %{y:.3f}<extra></extra>`,
                  };
                })}
                layout={{
                  paper_bgcolor: bgColor,
                  plot_bgcolor: bgColor,
                  height: 220,
                  margin: { l: 55, r: 16, t: 10, b: 40 },
                  xaxis: { type: "date", tickformat: "%b '%y", gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                  yaxis: {
                    gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 },
                    title: { text: "Normalized", font: { color: textColor, size: 10 } },
                  },
                  legend: { orientation: "h", y: 1.12, x: 0.5, xanchor: "center", font: { color: textColor, size: 11 } },
                  showlegend: true,
                }}
                config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                useResizeHandler
                style={{ width: "100%", height: 220 }}
              />
            </div>

            {/* ── Cumulative Capital Flow overlay ── */}
            <div>
              <p className="section-subtitle" style={{ marginBottom: 8 }}>Cumulative Capital Flow (Normalized)</p>
              <Plot
                data={results.map((d) => {
                  const normalized = normalizeValues(d.obv_series.map((p) => p.value));
                  return {
                    x: d.obv_series.map((p) => p.date),
                    y: normalized,
                    type: "scatter" as const,
                    mode: "lines" as const,
                    name: d.symbol,
                    line: { color: getTickerColor(d.symbol), width: 1.5 },
                    hovertemplate: `${d.symbol}<br>%{x}<br>Flow: %{y:.3f}<extra></extra>`,
                  };
                })}
                layout={{
                  paper_bgcolor: bgColor,
                  plot_bgcolor: bgColor,
                  height: 200,
                  margin: { l: 55, r: 16, t: 10, b: 40 },
                  xaxis: { type: "date", tickformat: "%b '%y", gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                  yaxis: {
                    gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 },
                    title: { text: "Normalized", font: { color: textColor, size: 10 } },
                  },
                  legend: { orientation: "h", y: 1.12, x: 0.5, xanchor: "center", font: { color: textColor, size: 11 } },
                  showlegend: true,
                }}
                config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                useResizeHandler
                style={{ width: "100%", height: 200 }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

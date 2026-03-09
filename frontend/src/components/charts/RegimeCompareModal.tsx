import { useState, useMemo } from "react";
import Plot from "react-plotly.js";
import { X } from "lucide-react";
import { useRegimeDetail } from "../../hooks/useRegimeData";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { getTickerColor } from "../../utils/colors";
import { cssVar } from "../../utils/cssVar";
import type { RegimeTimeframe, OverextMode } from "../../api/regime";
import type { RegimeDetailResponse } from "../../types/regime";

const LOOKBACK_BY_TF: Record<RegimeTimeframe, { label: string; value: number }[]> = {
  daily: [
    { label: "3M", value: 63 },
    { label: "6M", value: 126 },
    { label: "1Y", value: 252 },
  ],
  "4h": [
    { label: "3M", value: 126 },
    { label: "6M", value: 252 },
    { label: "1Y", value: 504 },
  ],
  weekly: [
    { label: "6M", value: 26 },
    { label: "1Y", value: 52 },
    { label: "2Y", value: 104 },
  ],
};

function useMultiRegimeDetail(
  symbols: string[],
  lookback: number,
  timeframe: RegimeTimeframe,
  overextMode: OverextMode,
) {
  const d0 = useRegimeDetail(symbols[0] ?? null, lookback, timeframe, overextMode);
  const d1 = useRegimeDetail(symbols[1] ?? null, lookback, timeframe, overextMode);
  const d2 = useRegimeDetail(symbols[2] ?? null, lookback, timeframe, overextMode);
  const d3 = useRegimeDetail(symbols[3] ?? null, lookback, timeframe, overextMode);
  const d4 = useRegimeDetail(symbols[4] ?? null, lookback, timeframe, overextMode);

  const all = [d0, d1, d2, d3, d4].slice(0, symbols.length);
  const isLoading = all.some((q) => q.isLoading);
  const results = all.map((q) => q.data).filter((d): d is RegimeDetailResponse => d != null);

  return { results, isLoading };
}

function normalizeValues(values: (number | null)[]): number[] {
  const nums = values.map((v) => v ?? 0);
  if (nums.length === 0) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min;
  if (range === 0) return nums.map(() => 0);
  return nums.map((v) => (v - min) / range);
}

function regimeLabel(val: number): string {
  return val === 1 ? "BULL" : val === -1 ? "BEAR" : "FLAT";
}

interface Props {
  symbols: string[];
  timeframe: RegimeTimeframe;
  overextMode: OverextMode;
  onClose: () => void;
}

export function RegimeCompareModal({ symbols, timeframe, overextMode, onClose }: Props) {
  const currentOptions = LOOKBACK_BY_TF[timeframe];
  const [lookback, setLookback] = useState(currentOptions[currentOptions.length - 1].value);
  const { results, isLoading } = useMultiRegimeDetail(symbols, lookback, timeframe, overextMode);

  const bgColor = "rgba(0,0,0,0)";
  const gridColor = cssVar("--chart-grid");
  const textColor = cssVar("--chart-text");
  const greenColor = cssVar("--success");
  const redColor = cssVar("--danger");

  // Build regime shapes per ticker (for legend context)
  const regimeShapeSets = useMemo(() => {
    return results.map((d) => {
      const shapes: Partial<Plotly.Shape>[] = [];
      const series = d.regime_series;
      if (series.length === 0) return shapes;
      let segStart = series[0].date;
      let segVal = series[0].value;
      for (let i = 1; i <= series.length; i++) {
        const cur = i < series.length ? series[i] : null;
        if (!cur || cur.value !== segVal) {
          const color = segVal === 1 ? "rgba(0,200,83,0.06)" : segVal === -1 ? "rgba(255,82,82,0.06)" : "rgba(128,128,128,0.03)";
          shapes.push({
            type: "rect", xref: "x", yref: "paper",
            x0: segStart,
            x1: i < series.length ? series[i - 1].date : series[series.length - 1].date,
            y0: 0, y1: 1,
            fillcolor: color, line: { width: 0 }, layer: "below",
          });
          if (cur) { segStart = cur.date; segVal = cur.value ?? 0; }
        }
      }
      return shapes;
    });
  }, [results]);

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
            {/* Metrics comparison table */}
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
                    {results.map((d) => {
                      const cls = d.regime_current === 1 ? "positive" : d.regime_current === -1 ? "negative" : "";
                      return (
                        <td key={d.symbol}>
                          <span className={`quadrant-badge ${cls}`}>{regimeLabel(d.regime_current)}</span>
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>Overextension</td>
                    {results.map((d) => (
                      <td key={d.symbol} className="num-cell">{d.overext_current?.toFixed(2) ?? "N/A"}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Capital Flow Z</td>
                    {results.map((d) => (
                      <td key={d.symbol} className={`num-cell ${(d.flow_z_current ?? 0) >= 0 ? "positive" : "negative"}`}>
                        {d.flow_z_current?.toFixed(2) ?? "N/A"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Price</td>
                    {results.map((d) => (
                      <td key={d.symbol} className="num-cell">{d.last_price != null ? `$${d.last_price.toFixed(2)}` : "—"}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Price overlay (normalized) */}
            <div style={{ marginBottom: 16 }}>
              <p className="section-subtitle" style={{ marginBottom: 4 }}>Price (Normalized)</p>
              <Plot
                data={results.map((d) => {
                  const normalized = normalizeValues(d.price_series.map((p) => p.close));
                  return {
                    x: d.price_series.map((p) => p.date),
                    y: normalized,
                    type: "scatter" as const,
                    mode: "lines" as const,
                    name: d.symbol,
                    line: { color: getTickerColor(d.symbol), width: 1.5 },
                    hovertemplate: `${d.symbol}<br>%{x}<extra></extra>`,
                  };
                })}
                layout={{
                  paper_bgcolor: bgColor, plot_bgcolor: bgColor, height: 220,
                  margin: { l: 55, r: 16, t: 10, b: 30 },
                  xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, showticklabels: false },
                  yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, title: { text: "Normalized", font: { color: textColor, size: 10 } } },
                  shapes: regimeShapeSets[0] as Plotly.Shape[],
                  legend: { orientation: "h", y: 1.12, x: 0.5, xanchor: "center", font: { color: textColor, size: 11 } },
                  showlegend: true,
                }}
                config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                useResizeHandler style={{ width: "100%", height: 220 }}
              />
            </div>

            {/* Overextension overlay */}
            {results.some((d) => d.overext_series.length > 0) && (
              <div style={{ marginBottom: 16 }}>
                <p className="section-subtitle" style={{ marginBottom: 4 }}>Overextension</p>
                <Plot
                  data={results.map((d) => ({
                    x: d.overext_series.map((p) => p.date),
                    y: d.overext_series.map((p) => p.value),
                    type: "scatter" as const,
                    mode: "lines" as const,
                    name: d.symbol,
                    line: { color: getTickerColor(d.symbol), width: 1.5 },
                    hovertemplate: `${d.symbol}<br>%{x}<br>%{y:.2f}<extra></extra>`,
                  }))}
                  layout={{
                    paper_bgcolor: bgColor, plot_bgcolor: bgColor, height: 200,
                    margin: { l: 55, r: 16, t: 10, b: 30 },
                    xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, showticklabels: false },
                    yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, zeroline: true, zerolinecolor: gridColor, title: { text: overextMode, font: { color: textColor, size: 10 } } },
                    shapes: [
                      { type: "line", x0: 0, x1: 1, xref: "paper", y0: results[0].overext_threshold, y1: results[0].overext_threshold, line: { color: greenColor, width: 1, dash: "dash" } },
                      { type: "line", x0: 0, x1: 1, xref: "paper", y0: -results[0].overext_threshold, y1: -results[0].overext_threshold, line: { color: redColor, width: 1, dash: "dash" } },
                    ],
                    legend: { orientation: "h", y: 1.12, x: 0.5, xanchor: "center", font: { color: textColor, size: 11 } },
                    showlegend: true,
                  }}
                  config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                  useResizeHandler style={{ width: "100%", height: 200 }}
                />
              </div>
            )}

            {/* Capital Flows overlay */}
            {results.some((d) => d.flow_series.length > 0) && (
              <div>
                <p className="section-subtitle" style={{ marginBottom: 4 }}>Capital Flows (Z-Score)</p>
                <Plot
                  data={results.map((d) => ({
                    x: d.flow_series.map((p) => p.date),
                    y: d.flow_series.map((p) => p.value),
                    type: "scatter" as const,
                    mode: "lines" as const,
                    name: d.symbol,
                    line: { color: getTickerColor(d.symbol), width: 1.5 },
                    hovertemplate: `${d.symbol}<br>%{x}<br>Z: %{y:.2f}<extra></extra>`,
                  }))}
                  layout={{
                    paper_bgcolor: bgColor, plot_bgcolor: bgColor, height: 200,
                    margin: { l: 55, r: 16, t: 10, b: 40 },
                    xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                    yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, zeroline: true, zerolinecolor: gridColor, title: { text: "Z-Score", font: { color: textColor, size: 10 } } },
                    shapes: [
                      { type: "line", x0: 0, x1: 1, xref: "paper", y0: results[0].flow_threshold, y1: results[0].flow_threshold, line: { color: greenColor, width: 1, dash: "dash" } },
                      { type: "line", x0: 0, x1: 1, xref: "paper", y0: -results[0].flow_threshold, y1: -results[0].flow_threshold, line: { color: redColor, width: 1, dash: "dash" } },
                    ],
                    legend: { orientation: "h", y: 1.12, x: 0.5, xanchor: "center", font: { color: textColor, size: 11 } },
                    showlegend: true,
                  }}
                  config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                  useResizeHandler style={{ width: "100%", height: 200 }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

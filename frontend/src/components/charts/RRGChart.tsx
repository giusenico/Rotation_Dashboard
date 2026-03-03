import Plot from "react-plotly.js";
import type { RRGPoint } from "../../types/rrg";
import { getTickerColor } from "../../utils/colors";
import { useTheme } from "../../hooks/useTheme";

interface RRGChartProps {
  data: RRGPoint[];
  tickers: string[];
  title?: string;
  height?: number;
  /** Compact mode for dashboard thumbnails */
  compact?: boolean;
}

export function RRGChart({ data, tickers, title, height = 600, compact = false }: RRGChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const bgColor = isDark ? "#0d1117" : "#ffffff";
  const gridColor = isDark ? "#21262d" : "#eaeef2";
  const textColor = isDark ? "#8b949e" : "#656d76";
  const crosshairColor = isDark ? "#484f58" : "#b1bac4";

  // Quadrant background colors (subtle)
  const qLeading = isDark ? "rgba(63,185,80,0.06)" : "rgba(26,127,55,0.05)";
  const qWeakening = isDark ? "rgba(210,153,34,0.06)" : "rgba(154,103,0,0.05)";
  const qLagging = isDark ? "rgba(248,81,73,0.06)" : "rgba(207,34,46,0.05)";
  const qImproving = isDark ? "rgba(88,166,255,0.06)" : "rgba(9,105,218,0.05)";

  const traces: Plotly.Data[] = [];

  // Compute axis range from data with padding
  const allRatios = data.map((d) => d.ratio);
  const allMomenta = data.map((d) => d.momentum);
  const xMin = Math.min(...allRatios, 96);
  const xMax = Math.max(...allRatios, 104);
  const yMin = Math.min(...allMomenta, 96);
  const yMax = Math.max(...allMomenta, 104);
  const xPad = (xMax - xMin) * 0.08;
  const yPad = (yMax - yMin) * 0.08;

  for (const ticker of tickers) {
    const points = data
      .filter((d) => d.ticker === ticker)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (points.length === 0) continue;

    const color = getTickerColor(ticker);
    const latest = points[points.length - 1];

    // Trail line (all points connected)
    traces.push({
      x: points.map((p) => p.ratio),
      y: points.map((p) => p.momentum),
      mode: "lines+markers",
      line: { color, width: compact ? 1.5 : 2 },
      marker: { color, size: compact ? 3 : 5 },
      opacity: 0.7,
      showlegend: false,
      hoverinfo: "skip",
      legendgroup: ticker,
    } as Plotly.Data);

    // Latest point — large marker with label
    traces.push({
      x: [latest.ratio],
      y: [latest.momentum],
      mode: "markers+text",
      marker: {
        color,
        size: compact ? 9 : 12,
        line: { color: isDark ? "#ffffff" : "#000000", width: 1.5 },
        symbol: "circle",
      },
      text: [`<b>${ticker}</b>`],
      textposition: "top right",
      textfont: { color: textColor, size: compact ? 10 : 12 },
      name: `${ticker} — ${latest.name}`,
      showlegend: !compact,
      legendgroup: ticker,
      hovertemplate:
        `<b>${ticker}</b> (${latest.name})<br>` +
        `Ratio: %{x:.2f}<br>Momentum: %{y:.2f}<br>` +
        `Date: ${latest.date}<extra></extra>`,
    } as Plotly.Data);
  }

  const labelSize = compact ? 11 : 14;

  const layout: Partial<Plotly.Layout> = {
    title: title ? { text: title, font: { size: 16, color: textColor } } : undefined,
    paper_bgcolor: bgColor,
    plot_bgcolor: bgColor,
    height,
    margin: compact
      ? { l: 45, r: 15, t: 15, b: 40 }
      : { l: 60, r: 30, t: title ? 50 : 20, b: 50 },
    xaxis: {
      title: { text: "JdK RS-Ratio", font: { color: textColor, size: compact ? 11 : 13 } },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      color: textColor,
      tickfont: { color: textColor, size: compact ? 9 : 11 },
      range: [xMin - xPad, xMax + xPad],
    },
    yaxis: {
      title: { text: "JdK RS-Momentum", font: { color: textColor, size: compact ? 11 : 13 } },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      color: textColor,
      tickfont: { color: textColor, size: compact ? 9 : 11 },
      range: [yMin - yPad, yMax + yPad],
    },
    shapes: [
      // Quadrant backgrounds — Leading (top-right, green)
      {
        type: "rect",
        x0: 100, x1: xMax + xPad * 2,
        y0: 100, y1: yMax + yPad * 2,
        fillcolor: qLeading,
        line: { width: 0 },
        layer: "below",
      },
      // Weakening (bottom-right, yellow)
      {
        type: "rect",
        x0: 100, x1: xMax + xPad * 2,
        y0: yMin - yPad * 2, y1: 100,
        fillcolor: qWeakening,
        line: { width: 0 },
        layer: "below",
      },
      // Lagging (bottom-left, red)
      {
        type: "rect",
        x0: xMin - xPad * 2, x1: 100,
        y0: yMin - yPad * 2, y1: 100,
        fillcolor: qLagging,
        line: { width: 0 },
        layer: "below",
      },
      // Improving (top-left, blue)
      {
        type: "rect",
        x0: xMin - xPad * 2, x1: 100,
        y0: 100, y1: yMax + yPad * 2,
        fillcolor: qImproving,
        line: { width: 0 },
        layer: "below",
      },
      // Vertical crosshair at x=100
      {
        type: "line",
        x0: 100, x1: 100,
        y0: 0, y1: 1,
        yref: "paper",
        line: { color: crosshairColor, width: 1.5, dash: "dash" },
      },
      // Horizontal crosshair at y=100
      {
        type: "line",
        y0: 100, y1: 100,
        x0: 0, x1: 1,
        xref: "paper",
        line: { color: crosshairColor, width: 1.5, dash: "dash" },
      },
    ],
    annotations: [
      {
        text: "LEADING",
        x: 0.98, y: 0.98,
        xref: "paper", yref: "paper",
        showarrow: false,
        font: { size: labelSize, color: isDark ? "#3fb950" : "#1a7f37", family: "Arial Black, sans-serif" },
        opacity: 0.7,
      },
      {
        text: "WEAKENING",
        x: 0.98, y: 0.02,
        xref: "paper", yref: "paper",
        showarrow: false,
        font: { size: labelSize, color: isDark ? "#d29922" : "#9a6700", family: "Arial Black, sans-serif" },
        opacity: 0.7,
      },
      {
        text: "LAGGING",
        x: 0.02, y: 0.02,
        xref: "paper", yref: "paper",
        showarrow: false,
        font: { size: labelSize, color: isDark ? "#f85149" : "#cf222e", family: "Arial Black, sans-serif" },
        opacity: 0.7,
      },
      {
        text: "IMPROVING",
        x: 0.02, y: 0.98,
        xref: "paper", yref: "paper",
        showarrow: false,
        font: { size: labelSize, color: isDark ? "#58a6ff" : "#0969da", family: "Arial Black, sans-serif" },
        opacity: 0.7,
      },
    ],
    showlegend: !compact,
    legend: {
      font: { color: textColor, size: 11 },
      bgcolor: "transparent",
    },
    hovermode: "closest",
    dragmode: "zoom",
  };

  return (
    <div className="chart-container">
      <Plot
        data={traces}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: !compact,
          displaylogo: false,
          modeBarButtonsToRemove: ["lasso2d", "select2d"],
        }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

import Plot from "react-plotly.js";
import type { RRGPoint } from "../../types/rrg";
import { getTickerColor } from "../../utils/colors";
import { cssVar } from "../../utils/cssVar";
import { assignQuadrant } from "../../utils/rrg";

interface RRGChartProps {
  data: RRGPoint[];
  tickers: string[];
  title?: string;
  height?: number;
  compact?: boolean;
  highlightTickers?: string[];
  onTickerClick?: (ticker: string) => void;
  benchmarkName?: string;
}

/** Pick white or dark text for readability on a given hex background. */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#1a1a2e" : "#ffffff";
}

export function RRGChart({
  data,
  tickers,
  title,
  height = 600,
  compact = false,
  highlightTickers,
  onTickerClick,
  benchmarkName,
}: RRGChartProps) {
  const bgColor = "rgba(0,0,0,0)";
  const gridColor = cssVar("--chart-grid");
  const textColor = cssVar("--chart-text");
  const crosshairColor = cssVar("--border");

  const qLeading = cssVar("--quadrant-leading");
  const qWeakening = cssVar("--quadrant-weakening");
  const qLagging = cssVar("--quadrant-lagging");
  const qImproving = cssVar("--quadrant-improving");

  const qLeadingText = cssVar("--quadrant-leading-text");
  const qWeakeningText = cssVar("--quadrant-weakening-text");
  const qLaggingText = cssVar("--quadrant-lagging-text");
  const qImprovingText = cssVar("--quadrant-improving-text");

  const quadrantTextColors: Record<string, string> = {
    Leading: qLeadingText,
    Weakening: qWeakeningText,
    Lagging: qLaggingText,
    Improving: qImprovingText,
  };

  const traces: Plotly.Data[] = [];

  const allRatios = data.map((d) => d.ratio);
  const allMomenta = data.map((d) => d.momentum);
  const xMin = allRatios.length > 0 ? Math.min(...allRatios, 96) : 96;
  const xMax = allRatios.length > 0 ? Math.max(...allRatios, 104) : 104;
  const yMin = allMomenta.length > 0 ? Math.min(...allMomenta, 96) : 96;
  const yMax = allMomenta.length > 0 ? Math.max(...allMomenta, 104) : 104;
  const xPad = (xMax - xMin) * 0.08;
  const yPad = (yMax - yMin) * 0.08;

  const hasHighlight = highlightTickers && highlightTickers.length > 0;

  const extraAnnotations: Partial<Plotly.Annotations>[] = [];

  for (const ticker of tickers) {
    const points = data
      .filter((d) => d.ticker === ticker)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (points.length === 0) continue;

    const color = getTickerColor(ticker);
    const latest = points[points.length - 1];
    const isDimmed = hasHighlight && !highlightTickers!.includes(ticker);
    const baseOpacity = isDimmed ? 0.12 : 1;
    const n = points.length;

    // ── Trail segments ──
    if (n >= 2) {
      for (let i = 0; i < n - 1; i++) {
        const segOpacity = isDimmed
          ? 0.08
          : 0.25 + 0.75 * ((i + 1) / (n - 1));
        traces.push({
          x: [points[i].ratio, points[i + 1].ratio],
          y: [points[i].momentum, points[i + 1].momentum],
          mode: "lines",
          line: { color, width: compact ? 1.5 : 2.5 },
          opacity: segOpacity,
          showlegend: false,
          hoverinfo: "skip",
          legendgroup: ticker,
        } as Plotly.Data);
      }
    }

    // ── Trail markers (except latest) ──
    if (n > 1) {
      const trailPts = points.slice(0, -1);
      traces.push({
        x: trailPts.map((p) => p.ratio),
        y: trailPts.map((p) => p.momentum),
        mode: "markers",
        marker: {
          color,
          size: trailPts.map((_, i) => {
            const base = compact ? 3 : 4;
            const growth = compact ? 3 : 5;
            return base + growth * (i / Math.max(n - 2, 1));
          }),
          opacity: trailPts.map((_, i) =>
            isDimmed ? 0.1 : 0.3 + 0.7 * (i / Math.max(n - 2, 1))
          ),
        },
        showlegend: false,
        hoverinfo: "skip",
        legendgroup: ticker,
      } as Plotly.Data);
    }

    // ── Glow behind latest point (non-compact, non-dimmed) ──
    if (!compact && !isDimmed) {
      traces.push({
        x: [latest.ratio],
        y: [latest.momentum],
        mode: "markers",
        marker: { color, size: 24, opacity: 0.15, line: { width: 0 } },
        showlegend: false,
        hoverinfo: "skip",
        legendgroup: ticker,
      } as Plotly.Data);
    }

    // ── Latest point marker ──
    const quadrant = assignQuadrant(latest.ratio, latest.momentum);
    const score = (latest.ratio + latest.momentum).toFixed(2);
    traces.push({
      x: [latest.ratio],
      y: [latest.momentum],
      mode: "markers",
      marker: {
        color,
        size: compact ? 10 : 14,
        line: { color: "rgba(0,0,0,0.25)", width: isDimmed ? 0 : 1.5 },
        symbol: "circle",
        opacity: baseOpacity,
      },
      name: `${ticker} — ${latest.name}`,
      showlegend: !compact,
      legendgroup: ticker,
      hovertemplate: isDimmed
        ? undefined
        : (() => {
            let deltaInfo = "";
            if (n >= 2) {
              const prev = points[n - 2];
              const dR = latest.ratio - prev.ratio;
              const dM = latest.momentum - prev.momentum;
              deltaInfo = `\u0394 Ratio: ${dR >= 0 ? "+" : ""}${dR.toFixed(2)} · \u0394 Mom: ${dM >= 0 ? "+" : ""}${dM.toFixed(2)}<br>`;
            }
            return (
              `<b>${ticker}</b> — ${latest.name}<br>` +
              `Ratio: %{x:.2f} · Momentum: %{y:.2f}<br>` +
              `Score: ${score} · <b>${quadrant}</b><br>` +
              deltaInfo +
              `${latest.date}<extra></extra>`
            );
          })(),
      hoverinfo: isDimmed ? ("skip" as const) : undefined,
    } as Plotly.Data);

    // ── Pill label annotation ──
    if (!isDimmed) {
      if (!compact) {
        extraAnnotations.push({
          x: latest.ratio,
          y: latest.momentum,
          text: `<b>${ticker}</b>`,
          showarrow: false,
          xanchor: "left",
          yanchor: "bottom",
          xshift: 10,
          yshift: 4,
          font: { size: 11, color: contrastText(color), family: "Inter, sans-serif" },
          bgcolor: color,
          borderpad: 3,
          opacity: 0.92,
        });
      } else {
        extraAnnotations.push({
          x: latest.ratio,
          y: latest.momentum,
          text: `<b>${ticker}</b>`,
          showarrow: false,
          xanchor: "left",
          yanchor: "bottom",
          xshift: 7,
          yshift: 3,
          font: { size: 9, color: textColor },
          opacity: 0.85,
        });
      }
    }

    // ── Arrow annotation (direction of movement) ──
    if (!compact && !isDimmed && n >= 2) {
      const prev = points[n - 2];

      extraAnnotations.push({
        x: latest.ratio,
        y: latest.momentum,
        ax: prev.ratio,
        ay: prev.momentum,
        xref: "x",
        yref: "y",
        axref: "x",
        ayref: "y",
        showarrow: true,
        arrowhead: 2,
        arrowsize: 1.5,
        arrowwidth: 2.5,
        arrowcolor: color,
        opacity: 0.85,
      });

      // ── Quadrant transition badge ──
      const prevQ = assignQuadrant(prev.ratio, prev.momentum);
      if (prevQ !== quadrant) {
        extraAnnotations.push({
          x: latest.ratio,
          y: latest.momentum,
          text: `<b>\u2192 ${quadrant}</b>`,
          showarrow: false,
          xanchor: "left",
          yanchor: "top",
          xshift: 10,
          yshift: -4,
          font: { size: 8, color: "#fff", family: "Inter, sans-serif" },
          bgcolor: quadrantTextColors[quadrant] ?? "#888",
          borderpad: 2,
          opacity: 0.95,
        });
      }
    }
  }

  const labelSize = compact ? 11 : 14;

  const layout: Partial<Plotly.Layout> = {
    title: title
      ? { text: title, font: { size: 16, color: textColor } }
      : undefined,
    paper_bgcolor: bgColor,
    plot_bgcolor: bgColor,
    height,
    margin: compact
      ? { l: 45, r: 15, t: 15, b: 40 }
      : { l: 60, r: 30, t: title ? 50 : 25, b: 65 },
    xaxis: {
      title: {
        text: "JdK RS-Ratio",
        font: { color: textColor, size: compact ? 11 : 13 },
      },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      color: textColor,
      tickfont: { color: textColor, size: compact ? 9 : 11 },
      range: [xMin - xPad, xMax + xPad],
    },
    yaxis: {
      title: {
        text: "JdK RS-Momentum",
        font: { color: textColor, size: compact ? 11 : 13 },
      },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      color: textColor,
      tickfont: { color: textColor, size: compact ? 9 : 11 },
      range: [yMin - yPad, yMax + yPad],
    },
    shapes: [
      // Quadrant backgrounds
      { type: "rect", x0: 100, x1: xMax + xPad * 2, y0: 100, y1: yMax + yPad * 2, fillcolor: qLeading, line: { width: 0 }, layer: "below" },
      { type: "rect", x0: 100, x1: xMax + xPad * 2, y0: yMin - yPad * 2, y1: 100, fillcolor: qWeakening, line: { width: 0 }, layer: "below" },
      { type: "rect", x0: xMin - xPad * 2, x1: 100, y0: yMin - yPad * 2, y1: 100, fillcolor: qLagging, line: { width: 0 }, layer: "below" },
      { type: "rect", x0: xMin - xPad * 2, x1: 100, y0: 100, y1: yMax + yPad * 2, fillcolor: qImproving, line: { width: 0 }, layer: "below" },
      // Crosshair at 100,100 — subtle dotted lines
      { type: "line", x0: 100, x1: 100, y0: 0, y1: 1, yref: "paper", line: { color: crosshairColor, width: 0.8, dash: "dot" } },
      { type: "line", y0: 100, y1: 100, x0: 0, x1: 1, xref: "paper", line: { color: crosshairColor, width: 0.8, dash: "dot" } },
    ],
    annotations: [
      // Quadrant corner labels
      { text: "LEADING", x: 0.98, y: 0.98, xref: "paper", yref: "paper", showarrow: false, font: { size: labelSize, color: qLeadingText, family: "Arial Black, sans-serif" }, opacity: 0.5 },
      { text: "WEAKENING", x: 0.98, y: 0.02, xref: "paper", yref: "paper", showarrow: false, font: { size: labelSize, color: qWeakeningText, family: "Arial Black, sans-serif" }, opacity: 0.5 },
      { text: "LAGGING", x: 0.02, y: 0.02, xref: "paper", yref: "paper", showarrow: false, font: { size: labelSize, color: qLaggingText, family: "Arial Black, sans-serif" }, opacity: 0.5 },
      { text: "IMPROVING", x: 0.02, y: 0.98, xref: "paper", yref: "paper", showarrow: false, font: { size: labelSize, color: qImprovingText, family: "Arial Black, sans-serif" }, opacity: 0.5 },
      // Benchmark label (top center)
      ...(benchmarkName && !compact
        ? [{
            text: `vs ${benchmarkName}`,
            x: 0.5,
            y: 1.0,
            xref: "paper" as const,
            yref: "paper" as const,
            showarrow: false,
            font: { size: 11, color: textColor },
            opacity: 0.35,
            yanchor: "top" as const,
            yshift: -6,
          }]
        : []),
      // Ticker pills, arrows, transition badges
      ...extraAnnotations,
    ],
    showlegend: false,
    hovermode: "closest",
    dragmode: "zoom",
  };

  const handleClick = (event: Plotly.PlotMouseEvent) => {
    if (!onTickerClick || !event.points[0]) return;
    const pt = event.points[0];
    const traceData = traces[pt.curveNumber] as Plotly.Data & { legendgroup?: string };
    if (traceData && typeof traceData.legendgroup === "string") {
      onTickerClick(traceData.legendgroup);
    }
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
        onClick={onTickerClick ? handleClick : undefined}
      />
    </div>
  );
}

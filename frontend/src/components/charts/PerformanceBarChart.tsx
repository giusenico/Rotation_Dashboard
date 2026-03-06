import Plot from "react-plotly.js";
import type { PerformanceEntry } from "../../types/prices";
import { cssVar } from "../../utils/cssVar";

interface PerformanceBarChartProps {
  data: PerformanceEntry[];
  period: "return_1w" | "return_1m" | "return_3m" | "return_6m" | "return_ytd" | "return_1y";
  height?: number;
}

const periodLabels: Record<string, string> = {
  return_1w: "1 Week",
  return_1m: "1 Month",
  return_3m: "3 Months",
  return_6m: "6 Months",
  return_ytd: "YTD",
  return_1y: "1 Year",
};

export function PerformanceBarChart({ data, period, height = 400 }: PerformanceBarChartProps) {
  const bgColor = "rgba(0,0,0,0)";
  const gridColor = cssVar("--chart-grid");
  const textColor = cssVar("--chart-text");
  const successColor = cssVar("--success");
  const dangerColor = cssVar("--danger");

  const sorted = [...data]
    .filter((d) => d[period] != null)
    .sort((a, b) => (b[period] ?? 0) - (a[period] ?? 0));

  const colors = sorted.map((d) =>
    (d[period] ?? 0) >= 0 ? successColor : dangerColor
  );

  return (
    <div className="chart-container" style={{ height: `${height}px` }}>
      <Plot
        data={[
          {
            x: sorted.map((d) => d.ticker),
            y: sorted.map((d) => d[period]),
            type: "bar",
            marker: { color: colors },
            hovertemplate: "<b>%{x}</b><br>%{y:.2f}%<extra></extra>",
          },
        ]}
        layout={{
          paper_bgcolor: bgColor,
          plot_bgcolor: bgColor,
          height,
          margin: { l: 50, r: 20, t: 30, b: 60 },
          title: {
            text: `Performance — ${periodLabels[period]}`,
            font: { color: textColor, size: 14 },
          },
          xaxis: { color: textColor, tickfont: { color: textColor }, tickangle: -45 },
          yaxis: {
            title: { text: "Return (%)", font: { color: textColor } },
            gridcolor: gridColor,
            color: textColor,
            tickfont: { color: textColor },
            zeroline: true,
            zerolinecolor: gridColor,
          },
        }}
        config={{ responsive: true, displayModeBar: false, displaylogo: false }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

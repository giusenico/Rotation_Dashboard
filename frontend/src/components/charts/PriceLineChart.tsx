import Plot from "react-plotly.js";
import type { PriceResponse } from "../../types/prices";
import { getTickerColor } from "../../utils/colors";
import { useTheme } from "../../hooks/useTheme";

interface PriceLineChartProps {
  series: PriceResponse[];
  normalized?: boolean;
  height?: number;
}

export function PriceLineChart({ series, normalized = false, height = 500 }: PriceLineChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bgColor = isDark ? "#0d1117" : "#ffffff";
  const gridColor = isDark ? "#21262d" : "#eaeef2";
  const textColor = isDark ? "#8b949e" : "#656d76";

  const traces: Plotly.Data[] = series.map((s) => {
    const dates = s.data.map((p) => p.date);
    let values = s.data.map((p) => p.adj_close ?? p.close ?? 0);

    if (normalized && values.length > 0 && values[0] !== 0) {
      const base = values[0];
      values = values.map((v) => (v / base) * 100);
    }

    return {
      x: dates,
      y: values,
      type: "scatter",
      mode: "lines",
      name: `${s.symbol} — ${s.name}`,
      line: { color: getTickerColor(s.symbol), width: 1.5 },
      hovertemplate: `<b>${s.symbol}</b><br>%{x}<br>%{y:.2f}<extra></extra>`,
    } as Plotly.Data;
  });

  return (
    <div className="chart-container">
      <Plot
        data={traces}
        layout={{
          paper_bgcolor: bgColor,
          plot_bgcolor: bgColor,
          height,
          margin: { l: 60, r: 20, t: 10, b: 40 },
          xaxis: {
            gridcolor: gridColor,
            color: textColor,
            tickfont: { color: textColor },
            rangeslider: { visible: true },
            rangeselector: {
              buttons: [
                { count: 1, label: "1M", step: "month", stepmode: "backward" },
                { count: 3, label: "3M", step: "month", stepmode: "backward" },
                { count: 6, label: "6M", step: "month", stepmode: "backward" },
                { count: 1, label: "YTD", step: "year", stepmode: "todate" },
                { count: 1, label: "1Y", step: "year", stepmode: "backward" },
                { step: "all", label: "ALL" },
              ],
              font: { color: textColor },
              bgcolor: isDark ? "#161b22" : "#f6f8fa",
              activecolor: isDark ? "#30363d" : "#d0d7de",
            },
          },
          yaxis: {
            title: { text: normalized ? "Rebased (100)" : "Price", font: { color: textColor } },
            gridcolor: gridColor,
            color: textColor,
            tickfont: { color: textColor },
          },
          showlegend: true,
          legend: { font: { color: textColor }, bgcolor: "transparent" },
          hovermode: "x unified",
        }}
        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

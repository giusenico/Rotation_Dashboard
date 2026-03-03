import Plot from "react-plotly.js";
import type { DrawdownResponse } from "../../types/prices";
import { useTheme } from "../../hooks/useTheme";

interface DrawdownChartProps {
  data: DrawdownResponse;
  height?: number;
}

export function DrawdownChart({ data, height = 350 }: DrawdownChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bgColor = isDark ? "#0d1117" : "#ffffff";
  const gridColor = isDark ? "#21262d" : "#eaeef2";
  const textColor = isDark ? "#8b949e" : "#656d76";
  const fillColor = isDark ? "rgba(248, 81, 73, 0.3)" : "rgba(207, 34, 46, 0.2)";
  const lineColor = isDark ? "#f85149" : "#cf222e";

  return (
    <div className="chart-container">
      <Plot
        data={[
          {
            x: data.data.map((p) => p.date),
            y: data.data.map((p) => p.drawdown),
            type: "scatter",
            mode: "lines",
            fill: "tozeroy",
            fillcolor: fillColor,
            line: { color: lineColor, width: 1 },
            name: data.symbol,
            hovertemplate: `<b>${data.symbol}</b><br>%{x}<br>Drawdown: %{y:.2f}%<extra></extra>`,
          },
        ]}
        layout={{
          paper_bgcolor: bgColor,
          plot_bgcolor: bgColor,
          height,
          margin: { l: 60, r: 20, t: 10, b: 40 },
          xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor } },
          yaxis: {
            title: { text: "Drawdown (%)", font: { color: textColor } },
            gridcolor: gridColor,
            color: textColor,
            tickfont: { color: textColor },
          },
          hovermode: "x unified",
        }}
        config={{ responsive: true, displayModeBar: false, displaylogo: false }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

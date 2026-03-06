import Plot from "react-plotly.js";
import type { DrawdownResponse } from "../../types/prices";
import { cssVar } from "../../utils/cssVar";

interface DrawdownChartProps {
  data: DrawdownResponse;
  height?: number;
}

export function DrawdownChart({ data, height = 350 }: DrawdownChartProps) {
  const bgColor = "rgba(0,0,0,0)";
  const gridColor = cssVar("--chart-grid");
  const textColor = cssVar("--chart-text");
  const fillColor = cssVar("--negative-fill-strong");
  const lineColor = cssVar("--danger");

  return (
    <div className="chart-container" style={{ height: `${height}px` }}>
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

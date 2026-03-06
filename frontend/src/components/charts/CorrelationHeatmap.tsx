import Plot from "react-plotly.js";
import type { CorrelationResponse } from "../../types/prices";
import { cssVar } from "../../utils/cssVar";

interface CorrelationHeatmapProps {
  data: CorrelationResponse;
  height?: number;
}

export function CorrelationHeatmap({ data, height = 500 }: CorrelationHeatmapProps) {
  const bgColor = "rgba(0,0,0,0)";
  const textColor = cssVar("--chart-text");
  const dangerColor = cssVar("--danger");
  const accentColor = cssVar("--accent");
  const midColor = cssVar("--bg-secondary");

  return (
    <div className="chart-container" style={{ height: `${height}px` }}>
      <Plot
        data={[
          {
            z: data.matrix,
            x: data.symbols,
            y: data.symbols,
            type: "heatmap",
            colorscale: [
              [0, dangerColor],
              [0.5, midColor],
              [1, accentColor],
            ],
            zmin: -1,
            zmax: 1,
            hovertemplate: "%{y} vs %{x}<br>Correlation: %{z:.3f}<extra></extra>",
            colorbar: {
              tickfont: { color: textColor },
              title: { text: "Corr", font: { color: textColor } },
            },
          },
        ]}
        layout={{
          paper_bgcolor: bgColor,
          plot_bgcolor: bgColor,
          height,
          margin: { l: 60, r: 20, t: 10, b: 60 },
          xaxis: { color: textColor, tickfont: { color: textColor, size: 10 }, tickangle: -45 },
          yaxis: { color: textColor, tickfont: { color: textColor, size: 10 }, autorange: "reversed" },
        }}
        config={{ responsive: true, displayModeBar: false, displaylogo: false }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

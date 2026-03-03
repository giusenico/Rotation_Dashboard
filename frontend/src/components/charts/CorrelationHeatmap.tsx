import Plot from "react-plotly.js";
import type { CorrelationResponse } from "../../types/prices";
import { useTheme } from "../../hooks/useTheme";

interface CorrelationHeatmapProps {
  data: CorrelationResponse;
  height?: number;
}

export function CorrelationHeatmap({ data, height = 500 }: CorrelationHeatmapProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const bgColor = isDark ? "#0d1117" : "#ffffff";
  const textColor = isDark ? "#8b949e" : "#656d76";

  return (
    <div className="chart-container">
      <Plot
        data={[
          {
            z: data.matrix,
            x: data.symbols,
            y: data.symbols,
            type: "heatmap",
            colorscale: [
              [0, isDark ? "#f85149" : "#cf222e"],
              [0.5, isDark ? "#21262d" : "#f6f8fa"],
              [1, isDark ? "#58a6ff" : "#0969da"],
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

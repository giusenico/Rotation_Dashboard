import { useState, useCallback } from "react";
import Plot from "react-plotly.js";
import type { PriceResponse } from "../../types/prices";
import { getTickerColor } from "../../utils/colors";
import { cssVar } from "../../utils/cssVar";

interface PriceLineChartProps {
  series: PriceResponse[];
  normalized?: boolean;
  height?: number;
}

export function PriceLineChart({ series, normalized = false, height = 500 }: PriceLineChartProps) {
  const bgColor = "rgba(0,0,0,0)";
  const gridColor = cssVar("--chart-grid");
  const textColor = cssVar("--chart-text");
  const rangeBg = cssVar("--range-bg");
  const rangeActive = cssVar("--range-active");

  const [xRange, setXRange] = useState<[string, string] | null>(null);

  const handleRelayout = useCallback((e: Record<string, unknown>) => {
    if (e["xaxis.autorange"] === true) {
      setXRange(null);
    } else if (e["xaxis.range[0]"] !== undefined && e["xaxis.range[1]"] !== undefined) {
      setXRange([String(e["xaxis.range[0]"]).slice(0, 10), String(e["xaxis.range[1]"]).slice(0, 10)]);
    }
  }, []);

  const traces: Plotly.Data[] = series.map((s) => {
    const dates = s.data.map((p) => p.date);
    let values = s.data.map((p) => p.adj_close ?? p.close ?? 0);

    if (normalized && values.length > 0) {
      let baseIdx = 0;
      if (xRange) {
        const idx = dates.findIndex((d) => d >= xRange[0]);
        if (idx >= 0) baseIdx = idx;
      }
      const base = values[baseIdx];
      if (base !== 0) values = values.map((v) => (v / base) * 100);
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
    <div className="chart-container" style={{ height: `${height}px` }}>
      <Plot
        data={traces}
        layout={{
          paper_bgcolor: bgColor,
          plot_bgcolor: bgColor,
          height,
          margin: { l: 60, r: 20, t: 20, b: 50 },
          xaxis: {
            ...(normalized && xRange ? { range: xRange } : {}),
            gridcolor: gridColor,
            color: textColor,
            tickfont: { color: textColor },
            rangeslider: { visible: true, bgcolor: rangeBg },
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
              bgcolor: rangeBg,
              activecolor: rangeActive,
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
        onRelayout={normalized ? handleRelayout : undefined}
        style={{ width: "100%" }}
      />
    </div>
  );
}

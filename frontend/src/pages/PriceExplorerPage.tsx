import { useState } from "react";
import { useMultiPrices, useDrawdown, useCorrelation, usePerformance, useTickers } from "../hooks/usePriceData";
import { PriceLineChart } from "../components/charts/PriceLineChart";
import { DrawdownChart } from "../components/charts/DrawdownChart";
import { CorrelationHeatmap } from "../components/charts/CorrelationHeatmap";
import { PerformanceBarChart } from "../components/charts/PerformanceBarChart";
import { LoadingSpinner } from "../components/common/LoadingSpinner";

type Tab = "prices" | "drawdown" | "correlation" | "performance";
type Period = "return_1w" | "return_1m" | "return_3m" | "return_6m" | "return_ytd" | "return_1y";

const TAB_DESCRIPTIONS: Record<Tab, string> = {
  prices: "Adjusted closing prices for the selected group. Enable \"Normalize\" to rebase all series to 100 at the start date, making relative performance easy to compare regardless of absolute price levels.",
  drawdown: "Drawdown measures the peak-to-trough decline for a single ticker. A drawdown of -20% means the price has fallen 20% from its all-time high. Useful for understanding historical risk and recovery patterns.",
  correlation: "Pairwise return correlations over the last 252 trading days (~1 year). Values near +1 indicate assets that move together; values near -1 indicate inverse movement. Low correlation is key for diversification.",
  performance: "Total return over the selected period, sorted from best to worst. Green bars indicate positive returns, red bars indicate losses. Switch between time horizons to spot trend changes.",
};

export function PriceExplorerPage() {
  const [tab, setTab] = useState<Tab>("prices");
  const [group, setGroup] = useState<"sectors" | "cross-asset">("sectors");
  const [normalized, setNormalized] = useState(true);
  const [drawdownTicker, setDrawdownTicker] = useState("XLK");
  const [perfPeriod, setPerfPeriod] = useState<Period>("return_1m");

  const { data: tickerGroups } = useTickers();
  const sectorTickers = tickerGroups?.sectors ?? [];
  const crossAssetTickers = tickerGroups?.crossAsset ?? [];
  const selectedTickers = group === "sectors" ? sectorTickers : crossAssetTickers;

  const { data: priceData, isLoading: pricesLoading } = useMultiPrices(
    tab === "prices" ? selectedTickers : [],
  );
  const { data: drawdownData, isLoading: drawdownLoading } = useDrawdown(
    tab === "drawdown" ? drawdownTicker : "",
  );
  const { data: corrData, isLoading: corrLoading } = useCorrelation(
    tab === "correlation" ? selectedTickers : [],
  );
  const { data: perfData, isLoading: perfLoading } = usePerformance(
    tab === "performance" ? group : "",
  );

  return (
    <div className="explorer-page">
      {/* Tab navigation */}
      <div className="tab-bar">
        {(["prices", "drawdown", "correlation", "performance"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? "tab-btn--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "prices" ? "Price Chart" : t === "drawdown" ? "Drawdown" : t === "correlation" ? "Correlation" : "Performance"}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p className="tab-description">{TAB_DESCRIPTIONS[tab]}</p>

      {/* Controls */}
      <div className="explorer-controls">
        <div className="group-toggle">
          <button
            className={`toggle-btn ${group === "sectors" ? "toggle-btn--active" : ""}`}
            onClick={() => setGroup("sectors")}
          >
            Sectors
          </button>
          <button
            className={`toggle-btn ${group === "cross-asset" ? "toggle-btn--active" : ""}`}
            onClick={() => setGroup("cross-asset")}
          >
            Cross-Asset
          </button>
        </div>

        {tab === "prices" && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={normalized}
              onChange={(e) => setNormalized(e.target.checked)}
            />
            Normalize (Rebase to 100)
          </label>
        )}

        {tab === "drawdown" && (
          <select
            value={drawdownTicker}
            onChange={(e) => setDrawdownTicker(e.target.value)}
            className="select-input"
          >
            {[...sectorTickers, ...crossAssetTickers].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        {tab === "performance" && (
          <select
            value={perfPeriod}
            onChange={(e) => setPerfPeriod(e.target.value as Period)}
            className="select-input"
          >
            <option value="return_1w">1 Week</option>
            <option value="return_1m">1 Month</option>
            <option value="return_3m">3 Months</option>
            <option value="return_6m">6 Months</option>
            <option value="return_ytd">YTD</option>
            <option value="return_1y">1 Year</option>
          </select>
        )}
      </div>

      {/* Chart area */}
      {tab === "prices" && (
        pricesLoading ? <LoadingSpinner /> : priceData && <PriceLineChart series={priceData} normalized={normalized} />
      )}
      {tab === "drawdown" && (
        drawdownLoading ? <LoadingSpinner /> : drawdownData && <DrawdownChart data={drawdownData} height={420} />
      )}
      {tab === "correlation" && (
        corrLoading ? <LoadingSpinner /> : corrData && <CorrelationHeatmap data={corrData} height={550} />
      )}
      {tab === "performance" && (
        perfLoading ? <LoadingSpinner /> : perfData && <PerformanceBarChart data={perfData} period={perfPeriod} height={420} />
      )}
    </div>
  );
}

import { useState } from "react";
import { useSectorRankings, useCrossAssetRankings } from "../hooks/useRRGData";
import { usePerformance } from "../hooks/usePriceData";
import { RankingsTable } from "../components/tables/RankingsTable";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { formatPct } from "../utils/formatters";
import type { PerformanceEntry } from "../types/prices";
import type { RankingEntry } from "../types/rrg";

type Tab = "sectors" | "cross-asset";

function mergedView(rankings: RankingEntry[], perf: PerformanceEntry[]) {
  const perfMap = new Map(perf.map((p) => [p.ticker, p]));
  return rankings.map((r) => ({ ...r, perf: perfMap.get(r.ticker) }));
}

export function RankingsPage() {
  const [tab, setTab] = useState<Tab>("sectors");

  const { data: sectorRanks, isLoading: sl } = useSectorRankings();
  const { data: crossRanks, isLoading: cl } = useCrossAssetRankings();
  const { data: sectorPerf } = usePerformance("sectors");
  const { data: crossPerf } = usePerformance("cross-asset");

  const isLoading = tab === "sectors" ? sl : cl;
  const rankings = tab === "sectors" ? sectorRanks : crossRanks;
  const perf = tab === "sectors" ? sectorPerf : crossPerf;

  const merged = rankings && perf ? mergedView(rankings, perf) : [];

  return (
    <div className="rankings-page">
      <div className="tab-bar">
        <button
          className={`tab-btn ${tab === "sectors" ? "tab-btn--active" : ""}`}
          onClick={() => setTab("sectors")}
        >
          Sector Rankings
        </button>
        <button
          className={`tab-btn ${tab === "cross-asset" ? "tab-btn--active" : ""}`}
          onClick={() => setTab("cross-asset")}
        >
          Cross-Asset Rankings
        </button>
      </div>

      <p className="tab-description">
        Instruments ranked by their <strong>composite RRG score</strong> (Ratio + Momentum).
        The <strong>Ratio</strong> measures current relative strength vs the benchmark;
        the <strong>Momentum</strong> measures how quickly that relative strength is changing.
        The <strong>Quadrant</strong> indicates the current rotation phase.
        Below, the <strong>Performance Returns</strong> table shows actual price returns over multiple time horizons.
      </p>

      {isLoading ? (
        <LoadingSpinner />
      ) : rankings ? (
        <>
          <RankingsTable data={rankings} />

          {merged.length > 0 && (
            <div className="perf-table-wrapper">
              <h3 className="table-title">Performance Returns</h3>
              <table className="rankings-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ticker</th>
                    <th>1W</th>
                    <th>1M</th>
                    <th>3M</th>
                    <th>6M</th>
                    <th>YTD</th>
                    <th>1Y</th>
                  </tr>
                </thead>
                <tbody>
                  {merged.map((m) => (
                    <tr key={m.ticker}>
                      <td className="rank-cell">{m.rank}</td>
                      <td className="ticker-cell">{m.ticker}</td>
                      <td className={`num-cell ${(m.perf?.return_1w ?? 0) >= 0 ? "positive" : "negative"}`}>
                        {formatPct(m.perf?.return_1w)}
                      </td>
                      <td className={`num-cell ${(m.perf?.return_1m ?? 0) >= 0 ? "positive" : "negative"}`}>
                        {formatPct(m.perf?.return_1m)}
                      </td>
                      <td className={`num-cell ${(m.perf?.return_3m ?? 0) >= 0 ? "positive" : "negative"}`}>
                        {formatPct(m.perf?.return_3m)}
                      </td>
                      <td className={`num-cell ${(m.perf?.return_6m ?? 0) >= 0 ? "positive" : "negative"}`}>
                        {formatPct(m.perf?.return_6m)}
                      </td>
                      <td className={`num-cell ${(m.perf?.return_ytd ?? 0) >= 0 ? "positive" : "negative"}`}>
                        {formatPct(m.perf?.return_ytd)}
                      </td>
                      <td className={`num-cell ${(m.perf?.return_1y ?? 0) >= 0 ? "positive" : "negative"}`}>
                        {formatPct(m.perf?.return_1y)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

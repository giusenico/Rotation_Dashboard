import { useState } from "react";
import { useCrossAssetRRG, useCrossAssetRankings } from "../hooks/useRRGData";
import { RRGChart } from "../components/charts/RRGChart";
import { RankingsTable } from "../components/tables/RankingsTable";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Info, ChevronDown, ChevronUp } from "lucide-react";

export function CrossAssetRRGPage() {
  const [trailLength, setTrailLength] = useState(5);
  const [rsSpan, setRsSpan] = useState(20);
  const [momentumSpan, setMomentumSpan] = useState(10);
  const [showMethodology, setShowMethodology] = useState(false);

  const { data: rrg, isLoading, error } = useCrossAssetRRG({
    trail_length: trailLength,
    rs_span: rsSpan,
    momentum_span: momentumSpan,
  });
  const { data: rankings } = useCrossAssetRankings();

  if (isLoading) return <LoadingSpinner message="Computing cross-asset rotation..." />;
  if (error) return <div className="error-msg">Error loading RRG data: {(error as Error).message}</div>;
  if (!rrg) return null;

  return (
    <div className="rrg-page">
      {/* Methodology explanation */}
      <div className="info-box info-box--collapsible">
        <div className="info-box-header" onClick={() => setShowMethodology(!showMethodology)}>
          <div className="info-box-title"><Info size={16} /> How to read this chart</div>
          {showMethodology ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
        {showMethodology && (
          <div className="info-box-body">
            <p>
              This <strong>Cross-Asset RRG</strong> compares 14 diverse ETFs — spanning bonds, international equities,
              commodities, and crypto — against the S&P 500. It helps identify which asset classes
              are gaining or losing relative momentum in the current market regime.
            </p>
            <div className="quadrant-legend">
              <div className="quadrant-item quadrant-item--leading">
                <strong>Leading</strong> (top-right) — Outperforming the benchmark and gaining strength.
              </div>
              <div className="quadrant-item quadrant-item--weakening">
                <strong>Weakening</strong> (bottom-right) — Still outperforming, but losing momentum.
              </div>
              <div className="quadrant-item quadrant-item--lagging">
                <strong>Lagging</strong> (bottom-left) — Underperforming and losing strength.
              </div>
              <div className="quadrant-item quadrant-item--improving">
                <strong>Improving</strong> (top-left) — Underperforming, but starting to gain momentum.
              </div>
            </div>
            <p>
              Assets typically rotate clockwise. A move from Lagging to Improving often signals a potential trend reversal.
              Use the sliders to adjust how sensitive the calculations are.
            </p>
          </div>
        )}
      </div>

      <div className="rrg-controls">
        <label>
          Trail Length: <strong>{trailLength}</strong>
          <input
            type="range" min={1} max={20} value={trailLength}
            onChange={(e) => setTrailLength(Number(e.target.value))}
          />
        </label>
        <label>
          RS Span: <strong>{rsSpan}</strong>
          <input
            type="range" min={5} max={50} value={rsSpan}
            onChange={(e) => setRsSpan(Number(e.target.value))}
          />
        </label>
        <label>
          Momentum Span: <strong>{momentumSpan}</strong>
          <input
            type="range" min={5} max={30} value={momentumSpan}
            onChange={(e) => setMomentumSpan(Number(e.target.value))}
          />
        </label>
        <span className="rrg-date">As of: {rrg.as_of_date}</span>
      </div>

      <RRGChart data={rrg.data} tickers={rrg.tickers} height={600} />

      {rankings && rankings.length > 0 && (
        <RankingsTable data={rankings} title="Cross-Asset Rankings" />
      )}
    </div>
  );
}

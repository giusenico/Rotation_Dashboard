import { useState } from "react";
import { useSectorRRG, useSectorRankings } from "../hooks/useRRGData";
import { RRGChart } from "../components/charts/RRGChart";
import { RankingsTable } from "../components/tables/RankingsTable";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { Info, ChevronDown, ChevronUp } from "lucide-react";

export function SectorRRGPage() {
  const [trailLength, setTrailLength] = useState(5);
  const [rsSpan, setRsSpan] = useState(20);
  const [momentumSpan, setMomentumSpan] = useState(10);
  const [showMethodology, setShowMethodology] = useState(false);

  const { data: rrg, isLoading, error } = useSectorRRG({
    trail_length: trailLength,
    rs_span: rsSpan,
    momentum_span: momentumSpan,
  });
  const { data: rankings } = useSectorRankings();

  if (isLoading) return <LoadingSpinner message="Computing sector rotation..." />;
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
              The <strong>Relative Rotation Graph (RRG)</strong> plots each sector ETF based on its
              relative strength versus the S&P 500 benchmark. The chart has four quadrants:
            </p>
            <div className="quadrant-legend">
              <div className="quadrant-item quadrant-item--leading">
                <strong>Leading</strong> (top-right) — Outperforming the benchmark and gaining strength.
              </div>
              <div className="quadrant-item quadrant-item--weakening">
                <strong>Weakening</strong> (bottom-right) — Still outperforming, but starting to lose momentum.
              </div>
              <div className="quadrant-item quadrant-item--lagging">
                <strong>Lagging</strong> (bottom-left) — Underperforming and continuing to lose strength.
              </div>
              <div className="quadrant-item quadrant-item--improving">
                <strong>Improving</strong> (top-left) — Still underperforming, but starting to gain momentum.
              </div>
            </div>
            <p>
              Tickers typically rotate clockwise through the quadrants. The <strong>trail</strong> shows
              recent movement direction. Use the sliders below to adjust calculation parameters.
            </p>
            <div className="param-legend">
              <p><strong>Trail Length</strong> — Number of historical data points shown as a trail behind each ticker.</p>
              <p><strong>RS Span</strong> — Lookback period (in days) for the exponential moving average used to smooth relative strength. Higher values produce smoother, slower signals.</p>
              <p><strong>Momentum Span</strong> — Lookback period for computing the rate of change of relative strength. Lower values make momentum more responsive.</p>
            </div>
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
        <RankingsTable data={rankings} title="Sector Rankings" />
      )}
    </div>
  );
}

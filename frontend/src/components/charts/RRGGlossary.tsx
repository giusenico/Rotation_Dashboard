import { BookOpen } from "lucide-react";
import { spanToHuman } from "../../utils/rrg";

export type RRGSection = "quadrants" | "axes" | "controls" | "rankings";

const SECTION_LABELS: Record<RRGSection, string> = {
  quadrants: "Quadrants",
  axes: "Axes",
  controls: "Controls",
  rankings: "Rankings",
};

const SECTIONS: RRGSection[] = ["controls", "quadrants", "axes", "rankings"];

interface Props {
  activeSection: RRGSection;
  variant: "sector" | "cross-asset";
  timeframe: string;
  rsSpan: number;
  momentumSpan: number;
  onNavigate?: (id: RRGSection) => void;
}

function SectionContent({ section, variant, timeframe, rsSpan, momentumSpan }: {
  section: RRGSection;
  variant: "sector" | "cross-asset";
  timeframe: string;
  rsSpan: number;
  momentumSpan: number;
}) {
  switch (section) {
    case "quadrants":
      return (
        <>
          <div className="glossary-section-title">Quadrants</div>
          <div className="glossary-body">
            <p>
              The chart is split into 4 zones. Each asset lands in a zone based on how it's doing
              vs the benchmark{variant === "sector" ? " (S&P 500)" : ""}. Think of it as a traffic light for relative strength.
            </p>
            <dl className="glossary-term glossary-term--leading">
              <dt style={{ color: "var(--dash-positive)" }}>Leading (top-right)</dt>
              <dd>Beating the market and still gaining strength. These are the strongest assets right now.</dd>
            </dl>
            <dl className="glossary-term glossary-term--weakening">
              <dt style={{ color: "var(--dash-negative)" }}>Weakening (bottom-right)</dt>
              <dd>Still above average, but losing momentum. Could be the start of a decline — watch closely.</dd>
            </dl>
            <dl className="glossary-term glossary-term--lagging">
              <dt style={{ color: "var(--dash-negative)" }}>Lagging (bottom-left)</dt>
              <dd>Below average and getting worse. The weakest assets — consider exiting or avoiding.</dd>
            </dl>
            <dl className="glossary-term glossary-term--improving">
              <dt style={{ color: "var(--dash-positive)" }}>Improving (top-left)</dt>
              <dd>Still below average, but picking up speed. Potential early entry candidates.</dd>
            </dl>
            <div className="glossary-tip">
              Assets rotate clockwise: Leading → Weakening → Lagging → Improving → back to Leading.
            </div>
          </div>
        </>
      );
    case "axes":
      return (
        <>
          <div className="glossary-section-title">How to Read the Chart</div>
          <div className="glossary-body">
            <dl className="glossary-term">
              <dt>Horizontal axis — Relative Strength (RS Ratio)</dt>
              <dd>
                Measures whether an asset is doing better or worse than the benchmark.
                Right of 100 = beating the market. Left of 100 = underperforming.
                Calculated over a {spanToHuman(rsSpan, timeframe)} window.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Vertical axis — Momentum</dt>
              <dd>
                Measures how fast things are changing. Above 100 = relative strength is increasing (improving trend).
                Below 100 = it's decreasing (deteriorating trend).
                Calculated over a {spanToHuman(momentumSpan, timeframe)} window.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Trail</dt>
              <dd>
                The line behind each dot shows the asset's recent path. Follow the trail to see which direction it's heading and predict the next quadrant.
              </dd>
            </dl>
          </div>
        </>
      );
    case "controls":
      return (
        <>
          <div className="glossary-section-title">Settings</div>
          <div className="glossary-body">
            <div className="glossary-active-settings">
              <span className="glossary-chip">TF: {timeframe === "4h" ? "4H" : timeframe === "daily" ? "1D" : "1W"}</span>
              <span className="glossary-chip">RS: {rsSpan}</span>
              <span className="glossary-chip">Mom: {momentumSpan}</span>
            </div>
            <dl className="glossary-term">
              <dt>Timeframe</dt>
              <dd>How often data is sampled. 4H = every 4 hours (intraday), 1D = daily, 1W = weekly (smoother, less noise).</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Preset (Short / Medium / Long)</dt>
              <dd>Controls the "memory" of the analysis. Short catches quick moves but is noisier; Long filters out noise and shows only established trends.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Trail Length</dt>
              <dd>How many past positions to show behind each asset. A longer trail makes it easier to see the direction of movement.</dd>
            </dl>
            <div className="glossary-tip">
              Use "Advanced" to manually fine-tune the RS and Momentum lookback windows.
            </div>
          </div>
        </>
      );
    case "rankings":
      return (
        <>
          <div className="glossary-section-title">Rankings</div>
          <div className="glossary-body">
            <p>
              All {variant === "sector" ? "sectors" : "assets"} ranked from strongest to weakest
              based on their position in the rotation chart.
            </p>
            <dl className="glossary-term">
              <dt>Rel. Strength</dt>
              <dd>How the asset is performing relative to the benchmark. Above 100 = beating the market.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Score</dt>
              <dd>Combined ranking score. The higher it is, the better the asset is performing vs the benchmark.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Quadrant</dt>
              <dd>Current phase in the rotation cycle (Leading, Weakening, Lagging, or Improving).</dd>
            </dl>
            <div className="glossary-tip">
              Click a column header to re-sort. Click a row to highlight that asset on the chart above.
            </div>
          </div>
        </>
      );
  }
}

export function RRGGlossary({ activeSection, variant, timeframe, rsSpan, momentumSpan, onNavigate }: Props) {
  return (
    <div className="glossary-panel">
      <div className="glossary-panel-header">
        <BookOpen size={12} />
        Glossary
      </div>
      <div className="glossary-tabs">
        {SECTIONS.map((id) => (
          <button
            key={id}
            className={`glossary-tab ${activeSection === id ? "glossary-tab--active" : ""}`}
            onClick={() => onNavigate?.(id)}
          >
            {SECTION_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="glossary-panel-content" key={activeSection}>
        <SectionContent
          section={activeSection}
          variant={variant}
          timeframe={timeframe}
          rsSpan={rsSpan}
          momentumSpan={momentumSpan}
        />
      </div>
    </div>
  );
}

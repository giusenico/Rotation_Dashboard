import { BookOpen } from "lucide-react";

export type OBVSection = "breadth" | "summary" | "table";

const SECTION_LABELS: Record<OBVSection, string> = {
  breadth: "Breadth",
  summary: "Summary",
  table: "Ranking",
};

const SECTIONS: OBVSection[] = ["breadth", "summary", "table"];

interface Props {
  activeSection: OBVSection;
  onNavigate: (id: OBVSection) => void;
}

function SectionContent({ section }: { section: OBVSection }) {
  switch (section) {
    case "breadth":
      return (
        <>
          <div className="glossary-section-title">Market Breadth</div>
          <div className="glossary-body">
            <p>
              This bar shows how many assets are being <strong>bought</strong> vs <strong>sold</strong>,
              based on volume flow analysis. Think of it as a health thermometer for the overall market.
            </p>
            <dl className="glossary-term">
              <dt>Buying (green)</dt>
              <dd>Money is flowing in — investors are accumulating positions.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Selling (red)</dt>
              <dd>Money is flowing out — selling pressure is dominant.</dd>
            </dl>
            <div className="glossary-tip">
              Above 70% green = healthy market with broad buying. Below 30% = widespread selling, a caution signal.
            </div>
          </div>
        </>
      );
    case "summary":
      return (
        <>
          <div className="glossary-section-title">Summary</div>
          <div className="glossary-body">
            <dl className="glossary-term">
              <dt>Top Accumulator</dt>
              <dd>The asset with the strongest buy signal — volume confirms money is consistently flowing in.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Top Distributor</dt>
              <dd>The asset under the heaviest selling pressure — volume confirms significant money flowing out.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Average Score</dt>
              <dd>The overall market sentiment. Positive = more buying than selling across all assets; negative = selling dominates.</dd>
            </dl>
          </div>
        </>
      );
    case "table":
      return (
        <>
          <div className="glossary-section-title">Ranking Table</div>
          <div className="glossary-body">
            <dl className="glossary-term">
              <dt>Flow Score</dt>
              <dd>
                A score from −1 to +1 summarizing capital flow. Positive = buying dominates, negative = selling dominates. Combines both the direction and speed of the trend.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Flow Intensity</dt>
              <dd>How extreme the current signal is compared to its own history. 1.0 = the strongest reading ever, 0.0 = the weakest. Helps you tell if a signal is exceptional or normal.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Trend Speed</dt>
              <dd>How fast the signal is changing. Positive = buying is accelerating; negative = selling is increasing.</dd>
            </dl>
            <div className="glossary-tip">
              Click any row to open a detailed breakdown with charts for that asset.
            </div>
          </div>
        </>
      );
  }
}

export function FlowGlossary({ activeSection, onNavigate }: Props) {
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
            onClick={() => onNavigate(id)}
          >
            {SECTION_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="glossary-panel-content" key={activeSection}>
        <SectionContent section={activeSection} />
      </div>
    </div>
  );
}

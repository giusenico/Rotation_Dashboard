import { BookOpen } from "lucide-react";

export type RegimeSection = "overview" | "regime" | "overextension" | "modes" | "flows" | "table";

const SECTION_LABELS: Record<RegimeSection, string> = {
  overview: "Overview",
  regime: "Regime",
  overextension: "Overextension",
  modes: "Measurement Mode",
  flows: "Capital Flows",
  table: "Table",
};

const SECTIONS: RegimeSection[] = ["overview", "regime", "overextension", "modes", "flows", "table"];

interface Props {
  activeSection: RegimeSection;
  onNavigate: (id: RegimeSection) => void;
}

function SectionContent({ section }: { section: RegimeSection }) {
  switch (section) {
    case "overview":
      return (
        <>
          <div className="glossary-section-title">Overview</div>
          <div className="glossary-body">
            <p>
              This page gives you a quick health check on every asset. Three independent readings
              answer three simple questions:
            </p>
            <dl className="glossary-term">
              <dt>Regime</dt>
              <dd>Is the trend up, down, or flat?</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Overextension</dt>
              <dd>Has the price moved too far, too fast? Is a pullback likely?</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Capital Flows</dt>
              <dd>Is money flowing in (buying pressure) or out (selling pressure)?</dd>
            </dl>
            <div className="glossary-tip">
              The strongest signals occur when all three agree &mdash; e.g. uptrend + oversold + strong buying pressure.
            </div>
          </div>
        </>
      );
    case "regime":
      return (
        <>
          <div className="glossary-section-title">Regime</div>
          <div className="glossary-body">
            <p>
              Compares the current price to its recent average. If price is clearly above the average,
              the asset is in an uptrend. Below it, a downtrend.
            </p>
            <dl className="glossary-term glossary-term--leading">
              <dt>Bullish (green)</dt>
              <dd>Price is above average &mdash; the trend is up. Momentum is on the buyer&rsquo;s side.</dd>
            </dl>
            <dl className="glossary-term glossary-term--lagging">
              <dt>Bearish (red)</dt>
              <dd>Price is below average &mdash; the trend is down. Sellers are in control.</dd>
            </dl>
            <dl className="glossary-term glossary-term--neutral">
              <dt>Flat (gray)</dt>
              <dd>Price is near the average &mdash; no clear direction. Often a wait-and-see zone.</dd>
            </dl>
            <div className="glossary-tip">
              Use the regime as a compass: it tells you which direction the wind is blowing before you look at the other readings.
            </div>
          </div>
        </>
      );
    case "overextension":
      return (
        <>
          <div className="glossary-section-title">Overextension</div>
          <div className="glossary-body">
            <p>
              Think of it like a rubber band. The further the price stretches away from its average,
              the more likely it is to snap back.
            </p>
            <dl className="glossary-term glossary-term--leading">
              <dt>Overbought (green)</dt>
              <dd>Price has run up a lot relative to normal. A pause or pullback may follow.</dd>
            </dl>
            <dl className="glossary-term glossary-term--lagging">
              <dt>Oversold (red)</dt>
              <dd>Price has dropped a lot relative to normal. A bounce may follow.</dd>
            </dl>
            <dl className="glossary-term glossary-term--neutral">
              <dt>Normal (no highlight)</dt>
              <dd>Price movement is within the typical range &mdash; nothing extreme.</dd>
            </dl>
            <div className="glossary-tip">
              Overbought in an uptrend often means strong momentum, not necessarily a reversal.
              Oversold in a downtrend can mean more pain ahead.
            </div>
          </div>
        </>
      );
    case "modes":
      return (
        <>
          <div className="glossary-section-title">Measurement Mode</div>
          <div className="glossary-body">
            <p>
              The three buttons at the top right change how the overextension is measured.
              All three answer the same question &mdash; <em>how far is the price from its average?</em> &mdash;
              just from a different angle.
            </p>
            <dl className="glossary-term">
              <dt>Standard</dt>
              <dd>
                Compares the current stretch to how much the price normally moves. A reading of 2
                means the price is twice as far from its average as usual. It automatically adapts
                to each asset&rsquo;s typical volatility, making it easy to compare across different markets.
                <br /><strong>Good default choice.</strong>
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Percent</dt>
              <dd>
                Shows the gap as a simple percentage. If the price is 3% above its average,
                you see 3%. Straightforward and easy to interpret at a glance, though it can
                be misleading for assets with very different price levels.
                <br /><strong>Best for a quick, intuitive read.</strong>
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Volatility</dt>
              <dd>
                Measures the stretch in terms of the asset&rsquo;s own recent daily swings (ATR &mdash;
                Average True Range). If an asset normally moves $1 a day and is $3 above average,
                you see 3. Calm assets signal overextension sooner; jumpy assets require a bigger move.
                <br /><strong>Best for comparing assets with very different volatility.</strong>
              </dd>
            </dl>
            <div className="glossary-tip">
              When in doubt, leave it on <strong>Standard</strong>. Switch to Percent for a plain-English
              view, or Volatility when comparing bond ETFs alongside commodities.
            </div>
          </div>
        </>
      );
    case "flows":
      return (
        <>
          <div className="glossary-section-title">Capital Flows</div>
          <div className="glossary-body">
            <p>
              Tracks whether buying or selling volume is unusually heavy.
              When big money moves, volume spikes &mdash; this indicator captures that.
            </p>
            <dl className="glossary-term glossary-term--leading">
              <dt>Strong Inflow (green)</dt>
              <dd>Buying volume is unusually high &mdash; large players may be accumulating.</dd>
            </dl>
            <dl className="glossary-term glossary-term--lagging">
              <dt>Strong Outflow (red)</dt>
              <dd>Selling volume is unusually high &mdash; large players may be exiting.</dd>
            </dl>
            <dl className="glossary-term glossary-term--neutral">
              <dt>Normal (no highlight)</dt>
              <dd>Volume activity is within the typical range &mdash; no exceptional signal.</dd>
            </dl>
            <div className="glossary-tip">
              Not available for index tickers (like S&amp;P 500) since they have no real volume data.
            </div>
          </div>
        </>
      );
    case "table":
      return (
        <>
          <div className="glossary-section-title">Reading the Table</div>
          <div className="glossary-body">
            <dl className="glossary-term">
              <dt>Regime</dt>
              <dd>Green badge = uptrend, red = downtrend, gray = flat. Rows are tinted accordingly.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Overextension</dt>
              <dd>A number showing how stretched the price is. Green if overbought, red if oversold.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Capital Flow</dt>
              <dd>Buying/selling pressure score. Green = strong buying, red = strong selling.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Moving Avg</dt>
              <dd>The average price over the recent period &mdash; the baseline for all three indicators.</dd>
            </dl>
            <div className="glossary-tip">
              Click any row to open a detailed chart showing how these readings evolved over time.
            </div>
          </div>
        </>
      );
  }
}

export function RegimeGlossary({ activeSection, onNavigate }: Props) {
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

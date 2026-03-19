import { BookOpen } from "lucide-react";

export type VolSection = "overview" | "oscillators" | "ratio" | "backtest" | "signals";

const SECTION_LABELS: Record<VolSection, string> = {
  overview: "Overview",
  oscillators: "Oscillators",
  ratio: "Term Structure",
  backtest: "Backtest",
  signals: "Signals",
};

const SECTIONS: VolSection[] = ["overview", "oscillators", "ratio", "backtest", "signals"];

interface Props {
  activeSection: VolSection;
  onNavigate: (id: VolSection) => void;
}

function SectionContent({ section }: { section: VolSection }) {
  switch (section) {
    case "overview":
      return (
        <>
          <div className="glossary-section-title">Overview</div>
          <div className="glossary-body">
            <p>
              This page measures market fear through the VIX term structure and translates it
              into a simple invest/cash signal. The four cards at the top summarize everything
              you need at a glance.
            </p>
            <dl className="glossary-term">
              <dt>VIX &mdash; Short-Term Fear</dt>
              <dd>
                The CBOE Volatility Index: expected S&amp;P 500 volatility over 30 days.
                The gauge bar shows where the VIX sits within its 1-year range.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>VIX3M &mdash; Medium-Term Fear</dt>
              <dd>
                3-month expected volatility. Normally higher than VIX.
                Its gauge bar shows term-structure stress level.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Term Structure</dt>
              <dd>
                The VIX/VIX3M ratio. <strong>&checkmark; Contango</strong> (below 1) = normal.
                <strong> &oline; Backwardation</strong> (above 1) = near-term fear is elevated.
                The 50-day average helps spot persistent stress.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Gauge Bars</dt>
              <dd>
                Each card shows a coloured progress bar:
                <strong style={{ color: "var(--dash-positive)" }}> blue</strong> = Low Risk (below 30%),
                <strong style={{ color: "var(--dash-neutral)" }}> grey</strong> = Moderate,
                <strong style={{ color: "var(--dash-negative)" }}> red</strong> = High Risk (above 70%).
              </dd>
            </dl>
            <div className="glossary-tip">
              The strategy is simple: when volatility is low relative to the past year, stay invested.
              When it spikes, step aside.
            </div>
          </div>
        </>
      );
    case "oscillators":
      return (
        <>
          <div className="glossary-section-title">Oscillators</div>
          <div className="glossary-body">
            <p>
              Each oscillator normalises its value to a 0&ndash;100% range using a rolling window
              (min/max of the past N days). This makes readings comparable across different
              market regimes.
            </p>
            <dl className="glossary-term glossary-term--leading">
              <dt>VIX Oscillator (blue line)</dt>
              <dd>
                Where the VIX sits within its rolling range.
                Below 30% (&ldquo;Low Risk&rdquo;) = calm market, historically
                favourable for equities. Above 70% (&ldquo;High Risk&rdquo;) = elevated fear.
              </dd>
            </dl>
            <dl className="glossary-term glossary-term--leading">
              <dt>VIX Ratio Oscillator (orange line)</dt>
              <dd>
                Same idea, but applied to the VIX/VIX3M ratio. Low values confirm the term
                structure is relaxed (contango). High values warn of stress.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Buy &amp; Sell Zones</dt>
              <dd>
                The green-shaded area at the bottom (0&ndash;30%) is the buy zone.
                The red-shaded area at the top (70&ndash;100%) is the sell zone.
                The dashed neutral line sits at 50%.
              </dd>
            </dl>
            <div className="glossary-tip">
              Both oscillators agreeing strengthens the signal. If VIX Osc is low but Ratio Osc
              is high, the market may be calm on the surface but stressed underneath.
            </div>
          </div>
        </>
      );
    case "ratio":
      return (
        <>
          <div className="glossary-section-title">Term Structure &amp; VIX Levels</div>
          <div className="glossary-body">
            <p>
              This section has two charts side by side that show the raw VIX data
              behind the oscillators above.
            </p>
            <dl className="glossary-term glossary-term--leading">
              <dt>Contango (ratio &lt; 1)</dt>
              <dd>
                Normal state &mdash; the market expects higher volatility further out in time.
                Usually seen in calm, trending markets.
              </dd>
            </dl>
            <dl className="glossary-term glossary-term--lagging">
              <dt>Backwardation (ratio &gt; 1)</dt>
              <dd>
                Near-term fear exceeds longer-term fear. This happens during sell-offs,
                crashes, and high-stress events. The dashed line at 1.0 marks the threshold.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>50-day Moving Average (red dotted)</dt>
              <dd>
                Smooths the ratio to show the underlying trend. When the ratio crosses
                above its MA, stress is building. When it falls below, stress is easing.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>VIX Levels chart</dt>
              <dd>
                Shows VIX (blue) and VIX3M (orange) raw levels.
                When the blue line crosses above orange, the market is in backwardation.
              </dd>
            </dl>
            <div className="glossary-tip">
              Sustained backwardation (ratio above 1 for multiple days) is one of the
              strongest indicators of systemic market stress.
            </div>
          </div>
        </>
      );
    case "backtest":
      return (
        <>
          <div className="glossary-section-title">Backtest</div>
          <div className="glossary-body">
            <p>
              Tests the oscillator signal against historical data. How would you have done
              by following the buy/cash rule mechanically?
            </p>
            <dl className="glossary-term">
              <dt>The Rule</dt>
              <dd>
                If yesterday&rsquo;s VIX Oscillator was below 30% (&ldquo;Low Risk&rdquo;), invest in the S&amp;P 500 today.
                Otherwise, hold cash. The one-day lag avoids look-ahead bias.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Trading Fees</dt>
              <dd>
                Each entry/exit incurs a 0.1% fee &mdash; roughly realistic for ETF trading.
                This reduces returns and penalises frequent switching.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Green Shading</dt>
              <dd>
                Green areas on the chart show when the strategy is invested in equities.
                Transparent areas mean the strategy is in cash.
              </dd>
            </dl>
            <dl className="glossary-term">
              <dt>Stats Bar</dt>
              <dd>
                Below the chart: <strong>Strategy</strong> cumulative return,
                <strong> Buy &amp; Hold</strong> return, and <strong>Alpha</strong> (the
                difference). Positive alpha means the strategy outperformed.
              </dd>
            </dl>
            <div className="glossary-tip">
              Past performance doesn&rsquo;t guarantee future results. The strategy tends to
              outperform by avoiding the worst days &mdash; but may miss sharp recoveries.
            </div>
          </div>
        </>
      );
    case "signals":
      return (
        <>
          <div className="glossary-section-title">Signal Card</div>
          <div className="glossary-body">
            <p>
              The signal card (top-right) combines the oscillator readings into one
              actionable message:
            </p>
            <dl className="glossary-term glossary-term--leading">
              <dt>BUY (green)</dt>
              <dd>VIX Oscillator &lt; 30%. Volatility is low &mdash; historically a good time to be in equities.</dd>
            </dl>
            <dl className="glossary-term glossary-term--lagging">
              <dt>SELL (red)</dt>
              <dd>VIX Oscillator &gt; 70%. Volatility is elevated &mdash; consider reducing exposure or hedging.</dd>
            </dl>
            <dl className="glossary-term glossary-term--lagging">
              <dt>CAUTION (red)</dt>
              <dd>VIX Oscillator is neutral but the Ratio Oscillator is above 70% &mdash; the term structure is stressed even if VIX looks OK.</dd>
            </dl>
            <dl className="glossary-term glossary-term--neutral">
              <dt>NEUTRAL (gray)</dt>
              <dd>No strong signal. Stay the course.</dd>
            </dl>
            <dl className="glossary-term">
              <dt>Strategy Position</dt>
              <dd>
                Shows whether the backtest strategy would currently be <strong>Invested</strong> or
                holding <strong>Cash</strong>, based on yesterday&rsquo;s oscillator reading.
              </dd>
            </dl>
            <div className="glossary-tip">
              Use the <strong>Window</strong> toggle to adjust sensitivity: 6M reacts faster
              to recent changes; 18M is smoother and less prone to whipsaws.
              The <strong>Lookback</strong> toggle controls how many days of chart history are shown.
            </div>
          </div>
        </>
      );
  }
}

export function VolatilityGlossary({ activeSection, onNavigate }: Props) {
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

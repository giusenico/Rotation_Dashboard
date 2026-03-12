import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Plot from "react-plotly.js";
import { useRegimeSummary, useRegimeDetail } from "../hooks/useRegimeData";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { CompareBar } from "../components/common/CompareBar";
import { RegimeCompareModal } from "../components/charts/RegimeCompareModal";
import { useCompare } from "../hooks/useCompare";
import { useTickers } from "../hooks/usePriceData";
import type { RegimeSummaryEntry } from "../types/regime";
import type { RegimeTimeframe, OverextMode } from "../api/regime";
import { TrendingUp, TrendingDown, Minus, X } from "lucide-react";
import { getTickerColor } from "../utils/colors";
import { cssVar } from "../utils/cssVar";
import { RegimeGlossary } from "../components/charts/RegimeGlossary";
import type { RegimeSection } from "../components/charts/RegimeGlossary";
import { buildDisplayCategoryBuckets } from "../utils/tickerCategories";

// ── Constants ───────────────────────────────────────────────────────

const TIMEFRAME_OPTIONS: { label: string; value: RegimeTimeframe }[] = [
  { label: "4H", value: "4h" },
  { label: "1D", value: "daily" },
  { label: "1W", value: "weekly" },
];

const REGIME_SECTION_MAP: Record<string, RegimeSection> = {
  "regime-section-modes": "modes",
  "regime-section-regime": "regime",
  "regime-section-table": "table",
};

const OVEREXT_OPTIONS: { label: string; value: OverextMode }[] = [
  { label: "Standard", value: "Z" },
  { label: "Percent", value: "pct" },
  { label: "Volatility", value: "ATR" },
];

const LOOKBACK_BY_TF: Record<RegimeTimeframe, { label: string; value: number }[]> = {
  daily: [
    { label: "3M", value: 63 },
    { label: "6M", value: 126 },
    { label: "1Y", value: 252 },
    { label: "2Y", value: 504 },
    { label: "5Y", value: 1260 },
    { label: "All", value: 9999 },
  ],
  "4h": [
    { label: "3M", value: 126 },
    { label: "6M", value: 252 },
    { label: "1Y", value: 504 },
    { label: "2Y", value: 1008 },
    { label: "5Y", value: 2520 },
    { label: "All", value: 9999 },
  ],
  weekly: [
    { label: "6M", value: 26 },
    { label: "1Y", value: 52 },
    { label: "2Y", value: 104 },
    { label: "5Y", value: 260 },
    { label: "All", value: 9999 },
  ],
};

// ── Badges ──────────────────────────────────────────────────────────

function RegimeBadge({ regime }: { regime: number }) {
  const cls = regime === 1 ? "positive" : regime === -1 ? "negative" : "neutral";
  const label = regime === 1 ? "BULL" : regime === -1 ? "BEAR" : "FLAT";
  return <span className={`quadrant-badge ${cls}`}>{label}</span>;
}

function StatusBadge({ label, variant, size = "sm" }: { label: string; variant: "positive" | "negative" | "neutral"; size?: "sm" | "lg" }) {
  return <span className={`quadrant-badge ${variant}${size === "lg" ? " quadrant-badge--lg" : ""}`}>{label}</span>;
}

function overextVariant(label: string): "positive" | "negative" | "neutral" {
  if (label === "overbought") return "positive";
  if (label === "oversold") return "negative";
  return "neutral";
}

function flowVariant(label: string): "positive" | "negative" | "neutral" {
  if (label === "strong_inflow") return "positive";
  if (label === "strong_outflow") return "negative";
  return "neutral";
}

function flowDisplay(label: string): string {
  if (label === "strong_inflow") return "INFLOW";
  if (label === "strong_outflow") return "OUTFLOW";
  return "NORMAL";
}

function overextDisplay(label: string): string {
  if (label === "overbought") return "OVERBOUGHT";
  if (label === "oversold") return "OVERSOLD";
  return "NORMAL";
}

// ── Summary bar ─────────────────────────────────────────────────────

function RegimeBreadthBar({ data }: { data: RegimeSummaryEntry[] }) {
  const bull = data.filter((e) => e.regime === 1).length;
  const bear = data.filter((e) => e.regime === -1).length;
  const flat = data.filter((e) => e.regime === 0).length;
  const total = data.length || 1;
  const bullPct = Math.round((bull / total) * 100);
  const bearPct = Math.round((bear / total) * 100);

  return (
    <div className="obv-breadth-bar">
      <div className="obv-breadth-label positive">
        <TrendingUp size={14} />
        <span>{bull}</span>
        <span className="obv-breadth-pct positive">{bullPct}%</span>
      </div>
      <div className="obv-breadth-track regime-breadth-track">
        <div className="regime-breadth-bull" style={{ width: `${bullPct}%` }} />
        <div className="regime-breadth-flat" style={{ width: `${100 - bullPct - bearPct}%` }} />
      </div>
      <div className="obv-breadth-label negative">
        <span className="obv-breadth-pct negative">{bearPct}%</span>
        <span>{bear}</span>
        <TrendingDown size={14} />
      </div>
      {flat > 0 && (
        <div className="obv-breadth-label" style={{ color: "var(--text-muted)" }}>
          <Minus size={12} /> {flat} neutral
        </div>
      )}
    </div>
  );
}

// ── Summary cards ───────────────────────────────────────────────────

function RegimeSummaryCards({ data }: { data: RegimeSummaryEntry[] }) {
  const bullCount = data.filter((e) => e.regime === 1).length;
  const bearCount = data.filter((e) => e.regime === -1).length;
  const flatCount = data.filter((e) => e.regime === 0).length;
  const obCount = data.filter((e) => e.overext_label === "overbought").length;
  const osCount = data.filter((e) => e.overext_label === "oversold").length;
  const inflowCount = data.filter((e) => e.flow_label === "strong_inflow").length;
  const outflowCount = data.filter((e) => e.flow_label === "strong_outflow").length;

  return (
    <div className="summary-cards" style={{ marginBottom: 20 }}>
      <div className="card">
        <div className="card-content">
          <span className="card-label">Regime</span>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <span className="card-value card-value--md positive">{bullCount}</span>
            <span className="card-secondary">{flatCount} flat</span>
            <span className="card-value card-value--md negative">{bearCount}</span>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-content">
          <span className="card-label">Stretched?</span>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <span className="card-stat positive">{obCount} Overbought</span>
            <span className="card-stat negative">{osCount} Oversold</span>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-content">
          <span className="card-label">Money Flow</span>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <span className="card-stat positive">{inflowCount} Inflow</span>
            <span className="card-stat negative">{outflowCount} Outflow</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail modal ────────────────────────────────────────────────────

function DetailModal({
  symbol,
  onClose,
  timeframe,
  overextMode,
}: {
  symbol: string;
  onClose: () => void;
  timeframe: RegimeTimeframe;
  overextMode: OverextMode;
}) {
  const currentOptions = LOOKBACK_BY_TF[timeframe];
  const defaultLookback = (currentOptions.find(o => o.label === "5Y") ?? currentOptions[currentOptions.length - 1]).value;
  const [lookback, setLookback] = useState(defaultLookback);

  const { data, isLoading } = useRegimeDetail(symbol, lookback, timeframe, overextMode);

  const bgColor = "rgba(0,0,0,0)";
  const gridColor = cssVar("--chart-grid");
  const textColor = cssVar("--chart-text");
  const greenColor = cssVar("--success");
  const redColor = cssVar("--danger");
  const grayColor = cssVar("--text-muted");
  const tickerColor = getTickerColor(symbol);

  // Build regime background shapes for the price panel
  const regimeShapes = useMemo(() => {
    if (!data) return [];
    const shapes: Partial<Plotly.Shape>[] = [];
    const series = data.regime_series;
    if (series.length === 0) return [];

    let segStart = series[0].date;
    let segVal = series[0].value;

    for (let i = 1; i <= series.length; i++) {
      const cur = i < series.length ? series[i] : null;
      if (!cur || cur.value !== segVal) {
        const color = segVal === 1
          ? "rgba(0,200,83,0.08)"
          : segVal === -1
            ? "rgba(255,82,82,0.08)"
            : "rgba(128,128,128,0.04)";
        shapes.push({
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: segStart,
          x1: (i < series.length ? series[i - 1].date : series[series.length - 1].date),
          y0: 0,
          y1: 1,
          fillcolor: color,
          line: { width: 0 },
          layer: "below",
        });
        if (cur) {
          segStart = cur.date;
          segVal = cur.value ?? 0;
        }
      }
    }
    return shapes;
  }, [data]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="modal-header-ticker" style={{ color: tickerColor }}>{symbol}</span>
            {data && (
              <>
                <span className="modal-header-asset">{data.asset}</span>
                <RegimeBadge regime={data.regime_current} />
                {data.last_price != null && (
                  <span className="modal-header-price">
                    ${data.last_price.toFixed(2)}
                  </span>
                )}
              </>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="group-toggle">
              {currentOptions.map((o) => (
                <button
                  key={o.value}
                  className={`toggle-btn ${lookback === o.value ? "toggle-btn--active" : ""}`}
                  onClick={() => setLookback(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {isLoading || !data ? (
          <LoadingSpinner />
        ) : (
          <div className="modal-body">
            {/* Current metric pills */}
            <div className="modal-metric-row">
              {[
                { label: "Regime", val: data.regime_current === 1 ? "Bullish" : data.regime_current === -1 ? "Bearish" : "Neutral", colorize: data.regime_current },
                { label: "Overextension", val: data.overext_current?.toFixed(2) ?? "N/A", colorize: data.overext_current != null ? (Math.abs(data.overext_current) >= data.overext_threshold ? data.overext_current : 0) : null },
                { label: "Capital Flow", val: data.flow_z_current?.toFixed(2) ?? "N/A", colorize: data.flow_z_current != null ? (Math.abs(data.flow_z_current) >= data.flow_threshold ? data.flow_z_current : 0) : null },
                { label: "Overext. Limit", val: `±${data.overext_threshold.toFixed(1)}`, colorize: null },
                { label: "Flow Limit", val: `±${data.flow_threshold.toFixed(1)}`, colorize: null },
              ].map(({ label, val, colorize }) => (
                <div key={label} className="modal-metric">
                  <span className="card-label">{label}</span>
                  <span className={`modal-metric-val ${colorize != null ? (colorize > 0 ? "positive" : colorize < 0 ? "negative" : "") : ""}`}>
                    {val}
                  </span>
                </div>
              ))}
            </div>

            {/* Panel 1: Price + SMA + regime background */}
            <div style={{ marginBottom: 12 }}>
              <p className="section-subtitle" style={{ marginBottom: 4 }}>Price &amp; Regime</p>
              <Plot
                data={[
                  {
                    x: data.price_series.map((p) => p.date),
                    y: data.price_series.map((p) => p.close),
                    type: "scatter",
                    mode: "lines",
                    line: { color: tickerColor, width: 1.5 },
                    name: symbol,
                    hovertemplate: `%{x}<br>Close: $%{y:.2f}<extra></extra>`,
                  },
                  {
                    x: data.price_series.map((p) => p.date),
                    y: data.price_series.map((p) => p.sma),
                    type: "scatter",
                    mode: "lines",
                    line: { color: grayColor, width: 1, dash: "dot" },
                    name: `SMA(${timeframe === "4h" ? 40 : timeframe === "weekly" ? 4 : 20})`,
                    hovertemplate: `%{x}<br>SMA: $%{y:.2f}<extra></extra>`,
                  },
                ]}
                layout={{
                  paper_bgcolor: bgColor,
                  plot_bgcolor: bgColor,
                  height: 240,
                  margin: { l: 55, r: 16, t: 10, b: 30 },
                  xaxis: { type: "date", tickformat: "%b '%y", gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                  yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, title: { text: "Price", font: { color: textColor, size: 10 } } },
                  shapes: regimeShapes as Plotly.Shape[],
                  showlegend: true,
                  legend: { x: 0.01, y: 0.99, font: { color: textColor, size: 10 }, bgcolor: "rgba(0,0,0,0)" },
                }}
                config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                useResizeHandler
                style={{ width: "100%", height: 240 }}
              />
            </div>

            {/* Panel 2: Overextension */}
            {data.overext_series.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p className="section-subtitle" style={{ marginBottom: 4 }}>Overextension &mdash; how far from average</p>
                <Plot
                  data={[
                    {
                      x: data.overext_series.map((p) => p.date),
                      y: data.overext_series.map((p) => p.value),
                      type: "scatter",
                      mode: "lines",
                      line: { color: cssVar("--text-primary"), width: 1.5 },
                      fill: "tozeroy",
                      fillcolor: cssVar("--glass-highlight"),
                      showlegend: false,
                      hovertemplate: `%{x}<br>Overext: %{y:.2f}<extra></extra>`,
                    },
                  ]}
                  layout={{
                    paper_bgcolor: bgColor,
                    plot_bgcolor: bgColor,
                    height: 180,
                    margin: { l: 55, r: 16, t: 10, b: 30 },
                    xaxis: { type: "date", tickformat: "%b '%y", gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                    yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, zeroline: true, zerolinecolor: gridColor, title: { text: overextMode, font: { color: textColor, size: 10 } } },
                    shapes: [
                      { type: "line", x0: 0, x1: 1, xref: "paper", y0: data.overext_threshold, y1: data.overext_threshold, line: { color: greenColor, width: 1, dash: "dash" } },
                      { type: "line", x0: 0, x1: 1, xref: "paper", y0: -data.overext_threshold, y1: -data.overext_threshold, line: { color: redColor, width: 1, dash: "dash" } },
                    ],
                  }}
                  config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                  useResizeHandler
                  style={{ width: "100%", height: 180 }}
                />
              </div>
            )}

            {/* Panel 3: Capital Flows histogram */}
            {data.flow_series.length > 0 && (
              <div>
                <p className="section-subtitle" style={{ marginBottom: 4 }}>Capital Flows &mdash; volume pressure</p>
                <Plot
                  data={[
                    {
                      x: data.flow_series.map((p) => p.date),
                      y: data.flow_series.map((p) => p.value),
                      type: "bar",
                      marker: {
                        color: data.flow_series.map((p) =>
                          (p.value ?? 0) >= data.flow_threshold ? greenColor
                            : (p.value ?? 0) <= -data.flow_threshold ? redColor
                              : "rgba(128,128,128,0.3)"
                        ),
                      },
                      showlegend: false,
                      hovertemplate: `%{x}<br>Flow Z: %{y:.2f}<extra></extra>`,
                    },
                  ]}
                  layout={{
                    paper_bgcolor: bgColor,
                    plot_bgcolor: bgColor,
                    height: 180,
                    margin: { l: 55, r: 16, t: 10, b: 40 },
                    xaxis: { type: "date", tickformat: "%b '%y", gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                    yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, zeroline: true, zerolinecolor: gridColor, title: { text: "Z-Score", font: { color: textColor, size: 10 } } },
                    shapes: [
                      { type: "line", x0: 0, x1: 1, xref: "paper", y0: data.flow_threshold, y1: data.flow_threshold, line: { color: greenColor, width: 1, dash: "dash" } },
                      { type: "line", x0: 0, x1: 1, xref: "paper", y0: -data.flow_threshold, y1: -data.flow_threshold, line: { color: redColor, width: 1, dash: "dash" } },
                    ],
                    bargap: 0.05,
                  }}
                  config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                  useResizeHandler
                  style={{ width: "100%", height: 180 }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sort helpers ────────────────────────────────────────────────────

type SortKey = "regime" | "overext" | "flow" | "price" | "sma";

function getSortValue(entry: RegimeSummaryEntry, key: SortKey): number {
  switch (key) {
    case "regime": return entry.regime;
    case "overext": return entry.overextension ?? -999;
    case "flow": return entry.capital_flow_z ?? -999;
    case "price": return entry.last_price ?? -999;
    case "sma": return entry.sma_value ?? -999;
  }
}

// ── Main page ───────────────────────────────────────────────────────

export function MarketRegimePage() {
  const [timeframe, setTimeframe] = useState<RegimeTimeframe>("weekly");
  const [overextMode, setOverextMode] = useState<OverextMode>("Z");
  const { data, isLoading, error } = useRegimeSummary(timeframe, overextMode);
  const { data: tickers } = useTickers();
  const categories = useMemo(() => buildDisplayCategoryBuckets(tickers?.byCategory), [tickers?.byCategory]);
  const categoryKeys = useMemo(() => Object.keys(categories), [categories]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const compare = useCompare();
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("regime");
  const [sortAsc, setSortAsc] = useState(false);
  // Glossary scroll tracking (matches RRG/OBV pattern)
  const [glossarySection, setGlossarySection] = useState<RegimeSection>("overview");

  useEffect(() => {
    setActiveCategories((prev) => (prev.size === 0 ? new Set(categoryKeys) : prev));
  }, [categoryKeys]);
  const overrideRef = useRef<RegimeSection | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const forceGlossary = useCallback((s: RegimeSection) => {
    overrideRef.current = s;
    setGlossarySection(s);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { overrideRef.current = null; }, 1500);
    // Scroll to closest page section
    const targetMap: Record<RegimeSection, string> = {
      overview: "regime-section-modes",
      modes: "regime-section-modes",
      regime: "regime-section-regime",
      overextension: "regime-section-table",
      flows: "regime-section-table",
      table: "regime-section-table",
    };
    const el = document.getElementById(targetMap[s]);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const scrollRoot = document.querySelector(".app-content");
    if (!scrollRoot) return;
    const ids = Object.keys(REGIME_SECTION_MAP);

    function update() {
      if (overrideRef.current) return;
      const rootTop = scrollRoot!.getBoundingClientRect().top;
      let bestId = ids[0];
      let bestDist = Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const dist = el.getBoundingClientRect().top - rootTop;
        if (dist < 120 && Math.abs(dist - 120) < bestDist) {
          bestDist = Math.abs(dist - 120);
          bestId = id;
        }
      }
      setGlossarySection(REGIME_SECTION_MAP[bestId]);
    }

    update();
    scrollRoot.addEventListener("scroll", update, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", update);
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const filteredData = useMemo(() => {
    if (!data) return [];
    if (categoryKeys.length === 0) return data;

    const allowedSymbols = new Set(
      Object.entries(categories)
        .filter(([cat]) => activeCategories.has(cat))
        .flatMap(([, syms]) => syms),
    );
    return data.filter((e) => allowedSymbols.has(e.symbol));
  }, [data, activeCategories]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      return (getSortValue(a, sortKey) - getSortValue(b, sortKey)) * mul;
    });
  }, [filteredData, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sortArrow = (key: SortKey) => (
    <span className={`sort-arrow${sortKey === key ? " sort-active" : ""}`}>
      {sortKey === key ? (sortAsc ? "\u25B2" : "\u25BC") : "\u25B2"}
    </span>
  );

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div className="error-msg">Failed to load market regime data.</div>;
  if (!data || data.length === 0) return <div className="error-msg">No regime data available.</div>;

  return (
    <div className="obv-page">
      {selectedSymbol && (
        <DetailModal
          symbol={selectedSymbol}
          onClose={() => setSelectedSymbol(null)}
          timeframe={timeframe}
          overextMode={overextMode}
        />
      )}
      {showCompare && compare.selected.length >= 2 && (
        <RegimeCompareModal
          symbols={compare.selected}
          timeframe={timeframe}
          overextMode={overextMode}
          onClose={() => setShowCompare(false)}
        />
      )}

      {/* Top bar: timeframe + overext mode */}
      <div id="regime-section-modes" className="obv-page-topbar">
        <div className="group-toggle">
          {TIMEFRAME_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`toggle-btn ${timeframe === o.value ? "toggle-btn--active" : ""}`}
              onClick={() => setTimeframe(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="group-toggle">
          {OVEREXT_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`toggle-btn ${overextMode === o.value ? "toggle-btn--active" : ""}`}
              onClick={() => setOverextMode(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="obv-layout">
        <div className="obv-layout-main">
          {/* Breadth bar */}
          <section id="regime-section-regime">
            <RegimeBreadthBar data={filteredData} />
            <RegimeSummaryCards data={filteredData} />
          </section>

          {/* Category filter chips */}
          <div className="category-chips" style={{ marginBottom: 16 }}>
            {Object.entries(categories).map(([cat]) => {
              const count = data.filter((e) => categories[cat]?.includes(e.symbol)).length;
              return (
                <button
                  key={cat}
                  className={`cat-chip ${activeCategories.has(cat) ? "cat-chip--active" : ""}`}
                  onClick={() => toggleCategory(cat)}
                >
                  {cat}
                  <span className="cat-chip-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Ranking table */}
          <div id="regime-section-table" className="rankings-table-wrapper">
            <h3 className="table-title">Market Regime &mdash; click any row for details</h3>
            <table className="rankings-table">
              <thead>
                <tr>
                  <th className="compare-th"></th>
                  <th>#</th>
                  <th>Symbol</th>
                  <th
                    className={`sortable${sortKey === "regime" ? " sort-active" : ""}`}
                    onClick={() => handleSort("regime")}
                  >
                    Regime{sortArrow("regime")}
                  </th>
                  <th
                    className={`sortable${sortKey === "overext" ? " sort-active" : ""}`}
                    onClick={() => handleSort("overext")}
                  >
                    Overextension{sortArrow("overext")}
                  </th>
                  <th
                    className={`sortable${sortKey === "flow" ? " sort-active" : ""}`}
                    onClick={() => handleSort("flow")}
                  >
                    Capital Flow{sortArrow("flow")}
                  </th>
                  <th
                    className={`sortable${sortKey === "price" ? " sort-active" : ""}`}
                    onClick={() => handleSort("price")}
                  >
                    Price{sortArrow("price")}
                  </th>
                  <th
                    className={`sortable${sortKey === "sma" ? " sort-active" : ""}`}
                    onClick={() => handleSort("sma")}
                  >
                    Moving Avg{sortArrow("sma")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((entry, i) => {
                  const isCompared = compare.has(entry.symbol);
                  return (
                  <tr
                    key={entry.symbol}
                    className={`obv-table-row ${entry.regime === 1 ? "row-positive" : entry.regime === -1 ? "row-negative" : ""}${isCompared ? " row-compared" : ""}`}
                    onClick={() => setSelectedSymbol(entry.symbol)}
                  >
                    <td className="compare-td" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="compare-checkbox"
                        checked={isCompared}
                        disabled={!isCompared && compare.isFull}
                        onChange={() => compare.toggle(entry.symbol)}
                      />
                    </td>
                    <td className="rank-cell">{i + 1}</td>
                    <td
                      className="ticker-cell"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ text: entry.asset, x: rect.left, y: rect.top - 4 });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <span className="ticker-dot" style={{ background: getTickerColor(entry.symbol) }} />
                      {entry.symbol}
                    </td>
                    <td><RegimeBadge regime={entry.regime} /></td>
                    <td>
                      {entry.overextension != null ? (
                        overextDisplay(entry.overext_label) !== "NORMAL" ? (
                          <StatusBadge
                            label={`${entry.overextension.toFixed(2)} (${overextDisplay(entry.overext_label)})`}
                            variant={overextVariant(entry.overext_label)}
                            size="lg"
                          />
                        ) : (
                          <span className="num-cell">{entry.overextension.toFixed(2)}</span>
                        )
                      ) : (
                        <span className="num-cell">—</span>
                      )}
                    </td>
                    <td>
                      {entry.capital_flow_z != null ? (
                        flowDisplay(entry.flow_label) !== "NORMAL" ? (
                          <StatusBadge
                            label={`${entry.capital_flow_z.toFixed(2)} (${flowDisplay(entry.flow_label)})`}
                            variant={flowVariant(entry.flow_label)}
                            size="lg"
                          />
                        ) : (
                          <span className="num-cell">{entry.capital_flow_z.toFixed(2)}</span>
                        )
                      ) : (
                        <span className="num-cell">N/A</span>
                      )}
                    </td>
                    <td className="num-cell">{entry.last_price != null ? `$${entry.last_price.toFixed(2)}` : "—"}</td>
                    <td className="num-cell">{entry.sma_value != null ? `$${entry.sma_value.toFixed(2)}` : "—"}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Glossary sidebar */}
        <aside className="obv-layout-glossary">
          <RegimeGlossary activeSection={glossarySection} onNavigate={forceGlossary} />
        </aside>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="ticker-tooltip"
          style={{ display: "block", left: tooltip.x, top: tooltip.y, transform: "translateY(-100%)" }}
        >
          {tooltip.text}
        </div>
      )}

      <CompareBar onCompare={() => setShowCompare(true)} />
    </div>
  );
}

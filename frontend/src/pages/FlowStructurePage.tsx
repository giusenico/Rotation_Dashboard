import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Plot from "react-plotly.js";
import { useOBVDetail, useOBVScoreHistory, useOBVStructure } from "../hooks/useFlowData";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { CompareBar } from "../components/common/CompareBar";
import { FlowCompareModal } from "../components/charts/FlowCompareModal";
import { useCompare } from "../hooks/useCompare";
import { useTickers } from "../hooks/usePriceData";
import { formatPct, formatNum } from "../utils/formatters";
import type { OBVStructureEntry } from "../types/flow";
import type { OBVTimeframe } from "../api/flow";
import { TrendingUp, TrendingDown, Activity, Award, X } from "lucide-react";
import { getTickerColor } from "../utils/colors";
import { cssVar } from "../utils/cssVar";
import { FlowGlossary } from "../components/charts/FlowGlossary";
import type { OBVSection } from "../components/charts/FlowGlossary";
import { buildDisplayCategoryBuckets } from "../utils/tickerCategories";

// ── Timeframe-aware lookback options ────────────────────────────────
const LOOKBACK_BY_TF: Record<OBVTimeframe, { label: string; value: number }[]> = {
  daily: [
    { label: "3M", value: 63 },
    { label: "6M", value: 126 },
    { label: "1Y", value: 252 },
  ],
  "4h": [
    { label: "3M", value: 126 },
    { label: "6M", value: 252 },
    { label: "1Y", value: 504 },
  ],
  weekly: [
    { label: "3M", value: 13 },
    { label: "6M", value: 26 },
    { label: "1Y", value: 52 },
  ],
};


const TIMEFRAME_OPTIONS: { label: string; value: OBVTimeframe }[] = [
  { label: "4H", value: "4h" },
  { label: "1D", value: "daily" },
  { label: "1W", value: "weekly" },
];

// ── Shared helpers ────────────────────────────────────────────────────

function RegimeBadge({ regime }: { regime: "buy" | "sell" }) {
  return (
    <span className={`quadrant-badge ${regime === "buy" ? "positive" : "negative"}`}>
      {regime === "buy" ? "Buying" : "Selling"}
    </span>
  );
}

function ScoreBar({ value }: { value: number | null }) {
  if (value == null) return <span className="num-cell">—</span>;
  const absWidth = Math.abs(value) * 50;
  const isPositive = value >= 0;
  const color = isPositive ? "var(--success)" : "var(--danger)";
  const left = isPositive ? 50 : 50 - absWidth;

  return (
    <div className="obv-bipolar-bar">
      <div className="obv-bipolar-track">
        <div className="obv-bipolar-center" />
        <div
          className="obv-bipolar-fill"
          style={{ left: `${left}%`, width: `${absWidth}%`, background: color }}
        />
      </div>
      <span className="num-cell" style={{ color, minWidth: 40 }}>{value.toFixed(3)}</span>
    </div>
  );
}

// ── Market Breadth Gauge ─────────────────────────────────────────────

function MarketBreadthBar({ data }: { data: OBVStructureEntry[] }) {
  const buyCount = data.filter((e) => e.obv_regime === "buy").length;
  const total = data.length;
  const buyPct = total > 0 ? Math.round((buyCount / total) * 100) : 0;

  return (
    <div className="obv-breadth-bar">
      <div className="obv-breadth-label positive">
        <TrendingUp size={14} />
        <span>{buyCount}</span>
        <span className="obv-breadth-pct positive">{buyPct}%</span>
      </div>
      <div className="obv-breadth-track">
        <div className="obv-breadth-fill" style={{ width: `${buyPct}%` }} />
      </div>
      <div className="obv-breadth-label negative">
        <span className="obv-breadth-pct negative">{100 - buyPct}%</span>
        <span>{total - buyCount}</span>
        <TrendingDown size={14} />
      </div>
    </div>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────

function OBVSummaryCards({ data }: { data: OBVStructureEntry[] }) {
  const sorted = [...data].sort((a, b) => (b.rotation_score ?? -1) - (a.rotation_score ?? -1));
  const topAccum = sorted[0];
  const topDistrib = sorted[sorted.length - 1];
  const avgScore = data.reduce((s, e) => s + (e.rotation_score ?? 0), 0) / data.length;

  return (
    <div className="summary-cards" style={{ marginBottom: 20 }}>
      <div className="card">
        <div className="card-icon" style={{ color: "var(--success)" }}>
          <Award size={20} />
        </div>
        <div className="card-content">
          <span className="card-label">Top Accumulator</span>
          <span className="card-value card-value--sm positive">{topAccum?.symbol ?? "—"}</span>
          <span className="card-secondary">{topAccum?.asset}</span>
        </div>
      </div>
      <div className="card">
        <div className="card-icon" style={{ color: "var(--danger)" }}>
          <Award size={20} />
        </div>
        <div className="card-content">
          <span className="card-label">Top Distributor</span>
          <span className="card-value card-value--sm negative">{topDistrib?.symbol ?? "—"}</span>
          <span className="card-secondary">{topDistrib?.asset}</span>
        </div>
      </div>
      <div className="card">
        <div className="card-icon"><Activity size={20} /></div>
        <div className="card-content">
          <span className="card-label">Average Flow Score</span>
          <span className={`card-value card-value--md ${avgScore >= 0 ? "positive" : "negative"}`}>
            {avgScore.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}


// ── Detail modal ──────────────────────────────────────────────────────

function DetailModal({ symbol, onClose, timeframe }: { symbol: string; onClose: () => void; timeframe: OBVTimeframe }) {
  const currentOptions = LOOKBACK_BY_TF[timeframe];
  const [lookback, setLookback] = useState(currentOptions[currentOptions.length - 1].value);

  const { data, isLoading } = useOBVDetail(symbol, lookback, timeframe);

  const bgColor = "rgba(0,0,0,0)";
  const gridColor = cssVar("--chart-grid");
  const textColor = cssVar("--chart-text");
  const greenColor = cssVar("--success");
  const redColor = cssVar("--danger");
  const zeroLine = cssVar("--zeroline");
  const tickerColor = getTickerColor(symbol);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="modal-header-ticker" style={{ color: tickerColor }}>{symbol}</span>
            {data && (
              <>
                <span className="modal-header-asset">{data.asset}</span>
                <RegimeBadge regime={data.obv_regime} />
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
            {/* Metric pills */}
            <div className="modal-metric-row">
              {[
                { label: "Rotation Score", val: data.rotation_score?.toFixed(3), colorize: data.rotation_score },
                { label: "Flow Intensity", val: formatNum(data.spread_percentile, 3), colorize: null },
                { label: "Trend Speed", val: formatNum(data.spread_momentum_z, 3), colorize: null },
                { label: "1M Return", val: formatPct(data.return_1m), colorize: data.return_1m },
                { label: "3M Return", val: formatPct(data.return_3m), colorize: data.return_3m },
                { label: "6M Return", val: formatPct(data.return_6m), colorize: data.return_6m },
                { label: "YTD Return", val: formatPct(data.return_ytd), colorize: data.return_ytd },
              ].map(({ label, val, colorize }) => (
                <div key={label} className="modal-metric">
                  <span className="card-label">{label}</span>
                  <span className={`modal-metric-val ${colorize != null ? (colorize >= 0 ? "positive" : "negative") : ""}`}>
                    {val ?? "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Spread bar chart */}
            <div style={{ marginBottom: 20 }}>
              <p className="section-subtitle" style={{ marginBottom: 8 }}>Net Capital Flow vs. Moving Average</p>
              <Plot
                data={[
                  {
                    x: data.spread_series.map((p) => p.date),
                    y: data.spread_series.map((p) => p.value),
                    type: "bar",
                    marker: {
                      color: data.spread_series.map((p) =>
                        p.value >= 0 ? greenColor : redColor
                      ),
                    },
                    showlegend: false,
                    hovertemplate: `%{x}<br>Spread: %{y:,.0f}<extra></extra>`,
                  },
                ]}
                layout={{
                  paper_bgcolor: bgColor, plot_bgcolor: bgColor, height: 220,
                  margin: { l: 55, r: 16, t: 10, b: 40 },
                  xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                  yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, zeroline: true, zerolinecolor: zeroLine, title: { text: "Spread", font: { color: textColor, size: 10 } } },
                  bargap: 0.05,
                }}
                config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                useResizeHandler style={{ width: "100%", height: 220 }}
              />
            </div>

            {/* Score history from DB (daily only) */}
            {data.score_history.length > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <p className="section-subtitle" style={{ marginBottom: 8 }}>Flow Score History</p>
                <Plot
                  data={[
                    {
                      x: data.score_history.map((p) => p.date),
                      y: data.score_history.map((p) => p.rotation_score),
                      type: "scatter", mode: "lines",
                      line: { color: tickerColor, width: 2 },
                      fill: "tozeroy",
                      fillcolor: (data.rotation_score ?? 0) >= 0
                        ? cssVar("--positive-fill-strong")
                        : cssVar("--negative-fill-strong"),
                      showlegend: false,
                      hovertemplate: `%{x}<br>Score: %{y:.3f}<extra></extra>`,
                    },
                  ]}
                  layout={{
                    paper_bgcolor: bgColor, plot_bgcolor: bgColor, height: 200,
                    margin: { l: 55, r: 16, t: 10, b: 40 },
                    xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                    yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, zeroline: true, zerolinecolor: zeroLine, range: [-1.05, 1.05], title: { text: "Score", font: { color: textColor, size: 10 } } },
                    shapes: [
                      { type: "rect", x0: 0, x1: 1, xref: "paper", y0: 0, y1: 1.05, fillcolor: cssVar("--positive-fill"), line: { width: 0 }, layer: "below" },
                      { type: "rect", x0: 0, x1: 1, xref: "paper", y0: -1.05, y1: 0, fillcolor: cssVar("--negative-fill"), line: { width: 0 }, layer: "below" },
                    ],
                  }}
                  config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                  useResizeHandler style={{ width: "100%", height: 200 }}
                />
              </div>
            ) : null}

            {/* Cumulative flow series */}
            <div>
              <p className="section-subtitle" style={{ marginBottom: 8 }}>Cumulative Capital Flow</p>
              <Plot
                data={[
                  {
                    x: data.obv_series.map((p) => p.date),
                    y: data.obv_series.map((p) => p.value),
                    type: "scatter", mode: "lines",
                    line: { color: tickerColor, width: 1.5 },
                    showlegend: false,
                    hovertemplate: `%{x}<br>Flow: %{y:,.0f}<extra></extra>`,
                  },
                ]}
                layout={{
                  paper_bgcolor: bgColor, plot_bgcolor: bgColor, height: 180,
                  margin: { l: 55, r: 16, t: 10, b: 40 },
                  xaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 } },
                  yaxis: { gridcolor: gridColor, color: textColor, tickfont: { color: textColor, size: 10 }, title: { text: "Flow", font: { color: textColor, size: 10 } } },
                }}
                config={{ responsive: true, displayModeBar: false, displaylogo: false }}
                useResizeHandler style={{ width: "100%", height: 180 }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sort helpers ──────────────────────────────────────────────────────

type SortKey = "score" | "regime" | "spread_pct" | "momentum" | "return_1m" | "return_3m" | "return_6m" | "return_ytd";

function getSortValue(entry: OBVStructureEntry, key: SortKey): number {
  switch (key) {
    case "score": return entry.rotation_score ?? -999;
    case "regime": return entry.obv_regime === "buy" ? 1 : 0;
    case "spread_pct": return entry.spread_percentile ?? -999;
    case "momentum": return entry.spread_momentum_z ?? -999;
    case "return_1m": return entry.return_1m ?? -999;
    case "return_3m": return entry.return_3m ?? -999;
    case "return_6m": return entry.return_6m ?? -999;
    case "return_ytd": return entry.return_ytd ?? -999;
  }
}

// ── Scroll-based active section detection ─────────────────────────────

function useActiveSection(sectionIds: OBVSection[]): [OBVSection, (s: OBVSection) => void] {
  const [active, setActive] = useState<OBVSection>(sectionIds[0]);
  const overrideRef = useRef<OBVSection | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const forceSection = useCallback((s: OBVSection) => {
    overrideRef.current = s;
    setActive(s);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { overrideRef.current = null; }, 1500);
  }, []);

  useEffect(() => {
    const scrollRoot = document.querySelector(".app-content");
    if (!scrollRoot) return;

    function update() {
      if (overrideRef.current) return;
      const rootTop = scrollRoot!.getBoundingClientRect().top;
      let best: OBVSection = sectionIds[0];
      let bestDist = Infinity;

      for (const id of sectionIds) {
        const el = document.getElementById(`obv-section-${id}`);
        if (!el) continue;
        const dist = el.getBoundingClientRect().top - rootTop;
        if (dist < 120 && Math.abs(dist - 120) < bestDist) {
          bestDist = Math.abs(dist - 120);
          best = id;
        }
      }

      setActive(best);
    }

    update();
    scrollRoot.addEventListener("scroll", update, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", update);
  }, [sectionIds]);

  return [active, forceSection];
}

// ── Section IDs ───────────────────────────────────────────────────────

const SECTION_IDS: OBVSection[] = ["breadth", "summary", "table"];

// ── Main page ─────────────────────────────────────────────────────────

export function FlowStructurePage() {
  const [timeframe, setTimeframe] = useState<OBVTimeframe>("weekly");
  const { data, isLoading, error } = useOBVStructure(timeframe);
  const { data: scoreHistory } = useOBVScoreHistory(undefined, 10);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const compare = useCompare();
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const { data: tickers } = useTickers();
  const categories = useMemo(() => buildDisplayCategoryBuckets(tickers?.byCategory), [tickers?.byCategory]);
  const categoryKeys = useMemo(() => Object.keys(categories), [categories]);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);

  const [activeSection, forceSection] = useActiveSection(SECTION_IDS);

  useEffect(() => {
    setActiveCategories((prev) => (prev.size === 0 ? new Set(categoryKeys) : prev));
  }, [categoryKeys, setActiveCategories]);

  // Compute deltas from recent score history
  const deltas = useMemo(() => {
    if (!scoreHistory) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const entry of scoreHistory) {
      if (entry.data.length >= 2) {
        const prev = entry.data[entry.data.length - 2].rotation_score;
        const last = entry.data[entry.data.length - 1].rotation_score;
        if (prev != null && last != null) {
          map.set(entry.symbol, last - prev);
        }
      }
    }
    return map;
  }, [scoreHistory]);

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

  // Filter by active categories
  const filteredData = useMemo(() => {
    if (!data) return [];
    if (categoryKeys.length === 0) return data;

    const allowedSymbols = new Set(
      Object.entries(categories)
        .filter(([cat]) => activeCategories.has(cat))
        .flatMap(([, syms]) => syms)
    );
    return data.filter((e) => allowedSymbols.has(e.symbol));
  }, [data, activeCategories]);

  // Sort
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
      setSortAsc(key === "regime");
    }
  }

  const sortArrow = (key: SortKey) => (
    <span className={`sort-arrow${sortKey === key ? " sort-active" : ""}`}>
      {sortKey === key ? (sortAsc ? "\u25B2" : "\u25BC") : "\u25B2"}
    </span>
  );

  if (isLoading) return <LoadingSpinner />;
  if (error) return <div className="error-msg">Failed to load capital flow data.</div>;
  if (!data || data.length === 0) return <div className="error-msg">No capital flow data available.</div>;

  return (
    <div className="obv-page">
      {selectedSymbol && (
        <DetailModal symbol={selectedSymbol} onClose={() => setSelectedSymbol(null)} timeframe={timeframe} />
      )}
      {showCompare && compare.selected.length >= 2 && (
        <FlowCompareModal symbols={compare.selected} timeframe={timeframe} onClose={() => setShowCompare(false)} />
      )}

      {/* Timeframe toggle */}
      <div className="obv-page-topbar">
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
      </div>

      {/* Two-column layout: content + glossary */}
      <div className="obv-layout">
        <div className="obv-layout-main">
          {/* Market Breadth */}
          <section id="obv-section-breadth">
            <MarketBreadthBar data={filteredData} />
          </section>

          {/* Summary Cards */}
          <section id="obv-section-summary">
            <OBVSummaryCards data={filteredData} />
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
          <section id="obv-section-table">
            <div className="rankings-table-wrapper">
              <h3 className="table-title">Capital Flow Rankings — click a row for details</h3>
              <table className="rankings-table">
                <thead>
                  <tr>
                    <th className="compare-th"></th>
                    <th>#</th>
                    <th>Symbol</th>
                    <th className={`sortable${sortKey === "regime" ? " sort-active" : ""}`} onClick={() => handleSort("regime")}>
                      Signal{sortArrow("regime")}
                    </th>
                    <th className={`sortable${sortKey === "score" ? " sort-active" : ""}`} onClick={() => handleSort("score")}>
                      Flow Score{sortArrow("score")}
                    </th>
                    <th className={`sortable${sortKey === "spread_pct" ? " sort-active" : ""}`} onClick={() => handleSort("spread_pct")}>
                      Flow Intensity{sortArrow("spread_pct")}
                    </th>
                    <th className={`sortable${sortKey === "momentum" ? " sort-active" : ""}`} onClick={() => handleSort("momentum")}>
                      Trend Speed{sortArrow("momentum")}
                    </th>
                    <th className={`sortable${sortKey === "return_1m" ? " sort-active" : ""}`} onClick={() => handleSort("return_1m")}>
                      1M{sortArrow("return_1m")}
                    </th>
                    <th className={`sortable${sortKey === "return_3m" ? " sort-active" : ""}`} onClick={() => handleSort("return_3m")}>
                      3M{sortArrow("return_3m")}
                    </th>
                    <th className={`sortable${sortKey === "return_6m" ? " sort-active" : ""}`} onClick={() => handleSort("return_6m")}>
                      6M{sortArrow("return_6m")}
                    </th>
                    <th className={`sortable${sortKey === "return_ytd" ? " sort-active" : ""}`} onClick={() => handleSort("return_ytd")}>
                      YTD{sortArrow("return_ytd")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((entry, i) => {
                    const delta = deltas.get(entry.symbol);
                    const isCompared = compare.has(entry.symbol);
                    return (
                      <tr
                        key={entry.symbol}
                        className={`obv-table-row ${entry.obv_regime === "buy" ? "row-positive" : "row-negative"}${isCompared ? " row-compared" : ""}`}
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
                          <span
                            className="ticker-dot"
                            style={{ background: getTickerColor(entry.symbol) }}
                          />
                          {entry.symbol}
                        </td>
                        <td><RegimeBadge regime={entry.obv_regime} /></td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <ScoreBar value={entry.rotation_score} />
                            {delta != null && (
                              <span
                                className="obv-delta"
                                style={{ color: delta >= 0 ? "var(--success)" : "var(--danger)" }}
                              >
                                {delta >= 0 ? "\u25B2" : "\u25BC"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="num-cell">{formatNum(entry.spread_percentile, 3)}</td>
                        <td className="num-cell">{formatNum(entry.spread_momentum_z, 3)}</td>
                        <td className={`num-cell ${(entry.return_1m ?? 0) >= 0 ? "positive" : "negative"}`}>{formatPct(entry.return_1m)}</td>
                        <td className={`num-cell ${(entry.return_3m ?? 0) >= 0 ? "positive" : "negative"}`}>{formatPct(entry.return_3m)}</td>
                        <td className={`num-cell ${(entry.return_6m ?? 0) >= 0 ? "positive" : "negative"}`}>{formatPct(entry.return_6m)}</td>
                        <td className={`num-cell ${(entry.return_ytd ?? 0) >= 0 ? "positive" : "negative"}`}>{formatPct(entry.return_ytd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

        </div>

        {/* Glossary Sidebar */}
        <aside className="obv-layout-glossary">
          <FlowGlossary activeSection={activeSection} onNavigate={(id) => {
            forceSection(id);
            const el = document.getElementById(`obv-section-${id}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }} />
        </aside>
      </div>

      {/* Fixed tooltip for ticker names */}
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

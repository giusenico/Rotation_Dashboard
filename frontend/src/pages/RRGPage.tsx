import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  useSectorRRG,
  useCrossAssetRRG,
  useSectorRankings,
  useCrossAssetRankings,
} from "../hooks/useRRGData";
import { useTickers } from "../hooks/usePriceData";
import { RRGChart } from "../components/charts/RRGChart";
import { RRGGlossary } from "../components/charts/RRGGlossary";
import type { RRGSection } from "../components/charts/RRGGlossary";
import { getTickerColor } from "../utils/colors";
import { formatNum } from "../utils/formatters";
import { assignQuadrant, spanToHuman } from "../utils/rrg";
import type { RRGPoint } from "../types/rrg";
import { buildDisplayCategoryBuckets } from "../utils/tickerCategories";

type Tab = "sectors" | "cross-asset";

interface QuadrantCounts {
  Leading: string[];
  Weakening: string[];
  Lagging: string[];
  Improving: string[];
}

function getQuadrantCounts(data: RRGPoint[], tickers: string[]): QuadrantCounts {
  const counts: QuadrantCounts = { Leading: [], Weakening: [], Lagging: [], Improving: [] };
  for (const ticker of tickers) {
    const pts = data.filter((d) => d.ticker === ticker).sort((a, b) => a.date.localeCompare(b.date));
    if (pts.length === 0) continue;
    const latest = pts[pts.length - 1];
    const q = assignQuadrant(latest.ratio, latest.momentum);
    counts[q as keyof QuadrantCounts].push(ticker);
  }
  return counts;
}

const QUADRANT_META = [
  { key: "Leading", label: "Leading", cssClass: "qcard--leading" },
  { key: "Weakening", label: "Weakening", cssClass: "qcard--weakening" },
  { key: "Lagging", label: "Lagging", cssClass: "qcard--lagging" },
  { key: "Improving", label: "Improving", cssClass: "qcard--improving" },
] as const;

// Presets for RS/Momentum spans
const PRESETS = [
  { label: "Short", rs: 10, mom: 5, desc: "Fast signals, more noise" },
  { label: "Medium", rs: 20, mom: 10, desc: "Balanced (default)" },
  { label: "Long", rs: 40, mom: 20, desc: "Smooth trends, slower signals" },
];

const RRG_SECTION_IDS: RRGSection[] = ["controls", "quadrants", "axes", "rankings"];

function useActiveSection(sectionIds: RRGSection[]): [RRGSection, (s: RRGSection) => void] {
  const [active, setActive] = useState<RRGSection>(sectionIds[0]);
  const overrideRef = useRef<RRGSection | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const forceSection = useCallback((s: RRGSection) => {
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
      let best: RRGSection = sectionIds[0];
      let bestDist = Infinity;

      for (const id of sectionIds) {
        const el = document.getElementById(`rrg-section-${id}`);
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

export function RRGPage() {
  const location = useLocation();
  const tab: Tab = location.pathname.includes("cross-asset") ? "cross-asset" : "sectors";
  const [trailLength, setTrailLength] = useState(5);
  const [rsSpan, setRsSpan] = useState(20);
  const [momentumSpan, setMomentumSpan] = useState(10);
  const [timeframe, setTimeframe] = useState("weekly");
  const [focusTicker, setFocusTicker] = useState<string | null>(null);
  const { data: tickers } = useTickers();
  const crossAssetCategories = useMemo(() => buildDisplayCategoryBuckets(tickers?.byCategory, false), [tickers?.byCategory]);
  const crossAssetCategoryKeys = useMemo(() => Object.keys(crossAssetCategories), [crossAssetCategories]);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeSection, forceSection] = useActiveSection(RRG_SECTION_IDS);

  useEffect(() => {
    setActiveCategories((prev) => (prev.size === 0 ? new Set(crossAssetCategoryKeys) : prev));
  }, [crossAssetCategoryKeys]);

  const params = { trail_length: trailLength, rs_span: rsSpan, momentum_span: momentumSpan, timeframe };

  const { data: sectorRRG, isLoading: slRRG } = useSectorRRG(params);
  const { data: crossRRG, isLoading: clRRG } = useCrossAssetRRG(params);
  const { data: sectorRankings } = useSectorRankings(timeframe);
  const { data: crossRankings } = useCrossAssetRankings(timeframe);

  const rrg = tab === "sectors" ? sectorRRG : crossRRG;
  const rankings = tab === "sectors" ? sectorRankings : crossRankings;
  const isLoading = tab === "sectors" ? slRRG : clRRG;

  // Filter tickers by category (cross-asset only)
  const visibleTickers = useMemo(() => {
    if (!rrg) return [];
    if (tab === "cross-asset") {
      if (crossAssetCategoryKeys.length === 0) return rrg.tickers;
      const allowedByCategory = new Set(
        Object.entries(crossAssetCategories)
          .filter(([cat]) => activeCategories.has(cat))
          .flatMap(([, syms]) => syms)
      );
      return rrg.tickers.filter((t) => allowedByCategory.has(t));
    }
    return rrg.tickers;
  }, [rrg, tab, activeCategories]);

  const visibleData = useMemo(() => {
    if (!rrg) return [];
    const tickerSet = new Set(visibleTickers);
    return rrg.data.filter((d) => tickerSet.has(d.ticker));
  }, [rrg, visibleTickers]);

  const quadrantCounts = useMemo(
    () => getQuadrantCounts(visibleData, visibleTickers),
    [visibleData, visibleTickers]
  );

  const highlightTickers = useMemo(() => {
    if (!focusTicker) return undefined;
    return [focusTicker];
  }, [focusTicker]);


  const handleTickerClick = useCallback((ticker: string) => {
    setFocusTicker((prev) => (prev === ticker ? null : ticker));
  }, []);

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setRsSpan(preset.rs);
    setMomentumSpan(preset.mom);
  };

  // Sort rankings for table
  const [sortKey, setSortKey] = useState<"rank" | "ratio" | "momentum" | "score">("rank");
  const [sortAsc, setSortAsc] = useState(true);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const sortedRankings = useMemo(() => {
    if (!rankings) return [];
    const visibleSet = new Set(visibleTickers);
    const filtered = rankings.filter((r) => visibleSet.has(r.ticker));
    const sorted = [...filtered].sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      return (a[sortKey] - b[sortKey]) * mul;
    });
    return sorted;
  }, [rankings, visibleTickers, sortKey, sortAsc]);

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "rank");
    }
  }
  const arrow = (key: typeof sortKey) =>
    sortKey === key ? (sortAsc ? " \u25B2" : " \u25BC") : "";

  const quadrantColors: Record<string, string> = {
    Leading: "var(--dash-positive)",
    Weakening: "var(--dash-negative)",
    Lagging: "var(--dash-negative)",
    Improving: "var(--dash-positive)",
  };

  if (isLoading) {
    return (
      <div className="rrg-page">
        <div className="skeleton skeleton-controls" />
        <div className="skeleton-cards">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton-card" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
        <div className="skeleton skeleton-chart" />
        <div className="skeleton skeleton-table" />
      </div>
    );
  }

  if (!rrg || !rrg.data.length) {
    return (
      <div className="rrg-page">
        <div className="empty-state">
          <div className="empty-state-icon">&#x1F4CA;</div>
          <p>No rotation data available. Check your connection or try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rrg-page">

      {/* Controls bar */}
      <section id="rrg-section-controls">
        <div className="obv-page-topbar">
          <div className="group-toggle">
            {(["4h", "daily", "weekly"] as const).map((tf) => (
              <button
                key={tf}
                className={`toggle-btn ${timeframe === tf ? "toggle-btn--active" : ""}`}
                onClick={() => setTimeframe(tf)}
              >
                {tf === "4h" ? "4H" : tf === "daily" ? "1D" : "1W"}
              </button>
            ))}
          </div>

          <div className="group-toggle">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={`toggle-btn ${rsSpan === p.rs && momentumSpan === p.mom ? "toggle-btn--active" : ""}`}
                onClick={() => applyPreset(p)}
                title={p.desc}
              >
                {p.label}
              </button>
            ))}
            <button
              className={`toggle-btn ${showAdvanced ? "toggle-btn--active" : ""}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              Advanced
            </button>
          </div>

          <label className="rrg-trail-control">
            Trail: <strong>{trailLength}</strong>
            <input
              type="range" min={1} max={20} value={trailLength}
              onChange={(e) => setTrailLength(Number(e.target.value))}
            />
          </label>

        </div>

        {/* Advanced sliders (collapsed by default) */}
        {showAdvanced && (
          <div className="rrg-advanced-row">
            <label>
              RS Span: <strong>{rsSpan}</strong>
              <span className="slider-hint">{spanToHuman(rsSpan, timeframe)}</span>
              <input
                type="range" min={5} max={50} value={rsSpan}
                onChange={(e) => setRsSpan(Number(e.target.value))}
              />
            </label>
            <label>
              Momentum Span: <strong>{momentumSpan}</strong>
              <span className="slider-hint">{spanToHuman(momentumSpan, timeframe)}</span>
              <input
                type="range" min={5} max={30} value={momentumSpan}
                onChange={(e) => setMomentumSpan(Number(e.target.value))}
              />
            </label>
          </div>
        )}
      </section>

     <div className="obv-layout">
      <div className="obv-layout-main">

      {/* Quadrant summary cards */}
      <section id="rrg-section-quadrants">
      <div className="summary-cards rrg-quadrant-grid">
        {QUADRANT_META.map(({ key, label, cssClass }) => {
          const tickers = quadrantCounts[key as keyof QuadrantCounts];
          return (
            <div key={key} className={`card qcard ${cssClass}`}>
              <div className="card-content">
                <span className="card-label" style={{ color: quadrantColors[key] }}>{label}</span>
                <span className="card-value card-value--md" style={{ color: quadrantColors[key] }}>
                  {tickers.length}
                </span>
                <div className="qcard-tickers">
                  {tickers.map((t) => (
                    <span
                      key={t}
                      className={`qcard-ticker ${focusTicker === t ? "qcard-ticker--active" : ""}`}
                      onClick={() => handleTickerClick(t)}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Category filter chips (cross-asset only) */}
      {tab === "cross-asset" && (
        <div className="category-chips" style={{ marginBottom: 16 }}>
          {crossAssetCategoryKeys.map((cat) => (
            <button
              key={cat}
              className={`cat-chip ${activeCategories.has(cat) ? "cat-chip--active" : ""}`}
              onClick={() => toggleCategory(cat)}
            >
              {cat}
              <span className="cat-chip-count">
                {crossAssetCategories[cat]?.length ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      </section>

      {/* Chart + side panel */}
      <section id="rrg-section-axes">
      <div className="rrg-chart-area">
        <div className="rrg-chart-main">
          <RRGChart
            data={visibleData}
            tickers={visibleTickers}
            height={580}
            highlightTickers={highlightTickers}
            onTickerClick={handleTickerClick}
            benchmarkName={rrg.benchmark_name}
          />
        </div>
        <div className="rrg-side-panel">
          <div className="rrg-side-title">
            {tab === "sectors" ? "Sectors" : "Cross-Asset"}
          </div>
          <div className="rrg-side-list">
            {sortedRankings.map((entry) => (
                <div
                  key={entry.ticker}
                  className={`rrg-side-item ${focusTicker === entry.ticker ? "rrg-side-item--active" : ""}`}
                  onMouseEnter={(e) => {
                    setFocusTicker(entry.ticker);
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({ text: entry.name, x: rect.left, y: rect.top - 4 });
                  }}
                  onMouseLeave={() => { setFocusTicker(null); setTooltip(null); }}
                  onClick={() => handleTickerClick(entry.ticker)}
                >
                  <span
                    className="rrg-side-dot"
                    style={{ background: getTickerColor(entry.ticker) }}
                  />
                  <span className="rrg-side-ticker">{entry.ticker}</span>
                  <span className="rrg-side-score">{formatNum(entry.score)}</span>
                  <span
                    className="rrg-side-quadrant"
                    style={{ color: quadrantColors[entry.quadrant] ?? "inherit" }}
                  >
                    {entry.quadrant}
                  </span>
                </div>
            ))}
          </div>
        </div>
      </div>
      </section>

      {/* Rankings table */}
      <section id="rrg-section-rankings">
      {sortedRankings.length > 0 && (
        <div className="rankings-table-wrapper">
          <h3 className="table-title">
            {tab === "sectors" ? "Sector" : "Cross-Asset"} Rankings
          </h3>
          <table className="rankings-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("rank")} className="sortable">
                  #{arrow("rank")}
                </th>
                <th>Ticker</th>
                {tab === "cross-asset" && <th>Category</th>}
                <th>Quadrant</th>
                <th onClick={() => handleSort("ratio")} className="sortable">
                  Rel. Strength{arrow("ratio")}
                </th>
                <th onClick={() => handleSort("momentum")} className="sortable">
                  Momentum{arrow("momentum")}
                </th>
                <th onClick={() => handleSort("score")} className="sortable">
                  Score{arrow("score")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRankings.map((entry) => (
                <tr
                  key={entry.ticker}
                  className={`rrg-table-row ${focusTicker === entry.ticker ? "rrg-table-row--focused" : ""}`}
                  onMouseEnter={() => setFocusTicker(entry.ticker)}
                  onMouseLeave={() => setFocusTicker(null)}
                  onClick={() => handleTickerClick(entry.ticker)}
                >
                  <td className="rank-cell">{entry.rank}</td>
                  <td
                    className="ticker-cell"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({ text: entry.name, x: rect.left, y: rect.top - 4 });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <span
                      className="ticker-dot"
                      style={{ background: getTickerColor(entry.ticker) }}
                    />
                    {entry.ticker}
                  </td>
                  {tab === "cross-asset" && (
                    <td className="table-muted-cell">{entry.category}</td>
                  )}
                  <td>
                    <span
                      className="quadrant-badge"
                      style={{ color: quadrantColors[entry.quadrant] ?? "inherit" }}
                    >
                      {entry.quadrant}
                    </span>
                  </td>
                  <td className="num-cell">{formatNum(entry.ratio)}</td>
                  <td className="num-cell">{formatNum(entry.momentum)}</td>
                  <td className="num-cell">{formatNum(entry.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </section>

      </div>

      <aside className="obv-layout-glossary">
        <RRGGlossary
          activeSection={activeSection}
          variant={tab === "sectors" ? "sector" : "cross-asset"}
          timeframe={timeframe}
          rsSpan={rsSpan}
          momentumSpan={momentumSpan}
          onNavigate={(id) => {
            forceSection(id);
            const el = document.getElementById(`rrg-section-${id}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
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

    </div>
  );
}

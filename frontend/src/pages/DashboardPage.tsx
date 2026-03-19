import { useMemo } from "react";
import { useDashboardSummary } from "../hooks/usePriceData";
import { useSectorRankings, useCrossAssetRankings } from "../hooks/useRRGData";
import { useOBVStructure } from "../hooks/useFlowData";
import { useRegimeSummary } from "../hooks/useRegimeData";
import { MacroHeroCard } from "../components/charts/MacroHeroCard";
import { formatPct, formatDate } from "../utils/formatters";
import { Link } from "react-router-dom";
import type { RankingEntry } from "../types/rrg";
import type { RegimeSummaryEntry } from "../types/regime";
import type { OBVStructureEntry } from "../types/flow";
import type { LucideProps } from "lucide-react";
import {
  TrendingUp,
  TrendingDown,
  Radar,
  Globe,
  Gauge,
  Activity,
  Zap,
} from "lucide-react";

// ── All colors via CSS variables (shared with hero card) ─────────
const V = {
  pos: "var(--dash-positive)",
  neg: "var(--dash-negative)",
  neutral: "var(--dash-neutral)",
  ink: "var(--dash-ink)",
  posBg: "var(--dash-positive-bg)",
  negBg: "var(--dash-negative-bg)",
};

const QUADRANT_COLOR: Record<string, string> = {
  Leading: V.pos,
  Improving: V.pos,
  Weakening: V.neg,
  Lagging: V.neg,
};

const QUADRANT_BG: Record<string, string> = {
  Leading: V.posBg,
  Improving: V.posBg,
  Weakening: V.negBg,
  Lagging: V.negBg,
};

// ── Compact Rotation Snapshot ─────────────────────────────────────

function RotationSnapshotCompact({
  title,
  icon: Icon,
  rankings,
  linkTo,
}: {
  title: string;
  icon: React.ComponentType<LucideProps>;
  rankings: RankingEntry[] | undefined;
  linkTo: string;
}) {
  if (!rankings || rankings.length === 0) return null;

  const quadrants = { Leading: 0, Weakening: 0, Lagging: 0, Improving: 0 };
  for (const r of rankings) {
    if (r.quadrant in quadrants) quadrants[r.quadrant as keyof typeof quadrants]++;
  }

  const top3 = rankings.slice(0, 3);

  return (
    <div className="dash-compact-panel">
      <div className="dash-compact-header">
        <h3>
          <Icon size={13} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
          {title}
        </h3>
        <Link to={linkTo} className="view-full-link">Details &rarr;</Link>
      </div>

      <div className="dash-quadrant-row dash-quadrant-row--compact">
        {(["Leading", "Weakening", "Improving", "Lagging"] as const).map((q) => (
          <span
            key={q}
            className="dash-q-badge dash-q-badge--sm"
            style={{ background: QUADRANT_BG[q], color: QUADRANT_COLOR[q] }}
          >
            <strong style={{ color: QUADRANT_COLOR[q] }}>{quadrants[q]}</strong> {q}
          </span>
        ))}
      </div>

      <div className="dash-top-list">
        {top3.map((entry, i) => (
          <div key={entry.ticker} className="obv-leaderboard-row obv-leaderboard-row--sm">
            <span className="obv-lb-rank">{i + 1}</span>
            <span className="ticker-cell">{entry.ticker}</span>
            <span className="obv-lb-name">{entry.name}</span>
            <span className="dash-q-pill" style={{ color: QUADRANT_COLOR[entry.quadrant] || V.neutral }}>
              {entry.quadrant}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compact Market Signals ────────────────────────────────────────

function SignalsStrip({ regimeData }: { regimeData: RegimeSummaryEntry[] }) {
  const overbought = regimeData.filter((e) => e.overext_label === "overbought");
  const oversold = regimeData.filter((e) => e.overext_label === "oversold");
  const inflow = regimeData.filter((e) => e.flow_label === "strong_inflow");
  const outflow = regimeData.filter((e) => e.flow_label === "strong_outflow");

  const hasSignals = overbought.length + oversold.length + inflow.length + outflow.length > 0;
  if (!hasSignals) return null;

  const columns: { label: string; color: string; bg: string; items: RegimeSummaryEntry[] }[] = [
    { label: "Overbought", color: V.neg, bg: V.negBg, items: overbought },
    { label: "Oversold", color: V.pos, bg: V.posBg, items: oversold },
    { label: "Inflow", color: V.pos, bg: V.posBg, items: inflow },
    { label: "Outflow", color: V.neg, bg: V.negBg, items: outflow },
  ];

  return (
    <div className="dash-compact-panel">
      <div className="dash-compact-header">
        <h3>
          <Zap size={13} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
          Active Signals
        </h3>
        <Link to="/regime" className="view-full-link">Regime &rarr;</Link>
      </div>

      <div className="dash-signals-cols">
        {columns.map((col) => (
          <div key={col.label} className="dash-signals-col">
            <div className="dash-signals-col-header">
              <span className="dash-signal-label" style={{ color: col.color }}>{col.label}</span>
              <span className="dash-signals-col-count" style={{ color: col.color }}>{col.items.length}</span>
            </div>
            <div className="dash-signals-col-list">
              {col.items.length > 0 ? col.items.map((e) => (
                <span key={e.symbol} className="dash-signal-chip dash-signal-chip--sm" style={{ background: col.bg, color: col.color }}>
                  {e.symbol}
                </span>
              )) : (
                <span className="dash-signals-col-empty">&mdash;</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compact Capital Flow Leaders ──────────────────────────────────

function FlowLeadersCompact({ data }: { data: OBVStructureEntry[] }) {
  const sorted = [...data].sort((a, b) => (b.rotation_score ?? -1) - (a.rotation_score ?? -1));
  const topBuy = sorted.filter((e) => e.obv_regime === "buy").slice(0, 3);
  const topSell = sorted.filter((e) => e.obv_regime === "sell").reverse().slice(0, 3);

  return (
    <div className="dash-compact-panel">
      <div className="dash-compact-header">
        <h3>
          <Activity size={13} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
          Capital Flow Leaders
        </h3>
        <Link to="/capital-flow" className="view-full-link">Details &rarr;</Link>
      </div>
      <div className="obv-preview-cols">
        <div className="obv-preview-col">
          <div className="obv-col-header" style={{ color: V.pos }}>Accumulation</div>
          {topBuy.map((entry, i) => (
            <div key={entry.symbol} className="obv-leaderboard-row obv-leaderboard-row--sm">
              <span className="obv-lb-rank">{i + 1}</span>
              <span className="ticker-cell">{entry.symbol}</span>
              <span className="obv-lb-name">{entry.asset}</span>
              <span className="obv-lb-score" style={{ color: V.pos }}>{entry.rotation_score?.toFixed(3) ?? "—"}</span>
            </div>
          ))}
        </div>
        <div className="obv-preview-col">
          <div className="obv-col-header" style={{ color: V.neg }}>Distribution</div>
          {topSell.map((entry, i) => (
            <div key={entry.symbol} className="obv-leaderboard-row obv-leaderboard-row--sm">
              <span className="obv-lb-rank">{i + 1}</span>
              <span className="ticker-cell">{entry.symbol}</span>
              <span className="obv-lb-name">{entry.asset}</span>
              <span className="obv-lb-score" style={{ color: V.neg }}>{entry.rotation_score?.toFixed(3) ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────

export function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: sectorRankings } = useSectorRankings();
  const { data: crossRankings } = useCrossAssetRankings();
  const { data: obvData } = useOBVStructure("weekly");
  const { data: regimeData } = useRegimeSummary("weekly");

  const regimeBreadth = useMemo(() => {
    if (!regimeData) return null;
    const bull = regimeData.filter((e) => e.regime === 1).length;
    const bear = regimeData.filter((e) => e.regime === -1).length;
    const flat = regimeData.filter((e) => e.regime === 0).length;
    return { bull, bear, flat, total: regimeData.length };
  }, [regimeData]);

  const flowBreadth = useMemo(() => {
    if (!obvData) return null;
    const buy = obvData.filter((e) => e.obv_regime === "buy").length;
    const sell = obvData.filter((e) => e.obv_regime === "sell").length;
    return { buy, sell, total: obvData.length };
  }, [obvData]);

  const spPositive = (summary?.sp500_return_ytd ?? 0) >= 0;

  return (
    <div className="dashboard-page">
      {/* Left: Macro Hero Card */}
      <div className="dashboard-left">
        <MacroHeroCard />
      </div>

      {/* Right: All data panels — render progressively */}
      <div className="dashboard-right">
        {/* Row 1: Stat cards (show skeleton while loading) */}
        <div className="dash-stat-row">
          <div className="card card--compact">
            <div className="card-icon" style={{ color: spPositive ? V.pos : V.neg, opacity: 1 }}>
              {spPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </div>
            <div className="card-content">
              <span className="card-label">S&P 500 YTD</span>
              {summaryLoading ? (
                <span className="card-value card-value--sm dash-skeleton">&nbsp;</span>
              ) : (
                <span
                  className="card-value card-value--sm"
                  style={{ color: spPositive ? V.pos : V.neg }}
                >
                  {formatPct(summary?.sp500_return_ytd)}
                </span>
              )}
              {summary?.latest_date && (
                <span className="card-secondary">as of {formatDate(summary.latest_date)}</span>
              )}
            </div>
          </div>

          <div className="card card--compact">
            <div className="card-icon" style={{
              color: regimeBreadth
                ? (regimeBreadth.bull >= regimeBreadth.bear ? V.pos : V.neg)
                : "var(--accent)",
              opacity: regimeBreadth ? 1 : 0.7,
            }}>
              <Gauge size={18} />
            </div>
            <div className="card-content">
              <span className="card-label">Market Regime</span>
              {regimeBreadth ? (
                <>
                  <div className="dash-breadth-nums">
                    <span style={{ color: V.pos }}>{regimeBreadth.bull} Bull</span>
                    {regimeBreadth.flat > 0 && <span style={{ color: V.neutral }}>{regimeBreadth.flat} Flat</span>}
                    <span style={{ color: V.neg }}>{regimeBreadth.bear} Bear</span>
                  </div>
                  <div className="dash-minibar-track" style={{ background: V.neg }}>
                    <div
                      className="dash-minibar-fill"
                      style={{ width: `${Math.round((regimeBreadth.bull / regimeBreadth.total) * 100)}%`, background: V.pos }}
                    />
                  </div>
                </>
              ) : (
                <div className="dash-skeleton dash-skeleton--bar">&nbsp;</div>
              )}
            </div>
          </div>

          <div className="card card--compact">
            <div className="card-icon" style={{
              color: flowBreadth
                ? (flowBreadth.buy >= flowBreadth.sell ? V.pos : V.neg)
                : "var(--accent)",
              opacity: flowBreadth ? 1 : 0.7,
            }}>
              <Activity size={18} />
            </div>
            <div className="card-content">
              <span className="card-label">Capital Flows</span>
              {flowBreadth ? (
                <>
                  <div className="dash-breadth-nums">
                    <span style={{ color: V.pos }}>{flowBreadth.buy} Accum</span>
                    <span style={{ color: V.neg }}>{flowBreadth.sell} Distrib</span>
                  </div>
                  <div className="dash-minibar-track" style={{ background: V.neg }}>
                    <div
                      className="dash-minibar-fill"
                      style={{ width: `${Math.round((flowBreadth.buy / flowBreadth.total) * 100)}%`, background: V.pos }}
                    />
                  </div>
                </>
              ) : (
                <div className="dash-skeleton dash-skeleton--bar">&nbsp;</div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Rotation Snapshots (render when available) */}
        <div className="dash-rotation-row">
          {sectorRankings ? (
            <RotationSnapshotCompact
              title="Sector Rotation"
              icon={Radar}
              rankings={sectorRankings}
              linkTo="/rrg/sectors"
            />
          ) : (
            <div className="dash-compact-panel dash-skeleton dash-skeleton--panel">&nbsp;</div>
          )}
          {crossRankings ? (
            <RotationSnapshotCompact
              title="Cross-Asset Rotation"
              icon={Globe}
              rankings={crossRankings}
              linkTo="/rrg/cross-asset"
            />
          ) : (
            <div className="dash-compact-panel dash-skeleton dash-skeleton--panel">&nbsp;</div>
          )}
        </div>

        {/* Row 3: Active Signals (render when available) */}
        {regimeData && <SignalsStrip regimeData={regimeData} />}

        {/* Row 4: Capital Flow Leaders (render when available) */}
        {obvData && <FlowLeadersCompact data={obvData} />}
      </div>
    </div>
  );
}

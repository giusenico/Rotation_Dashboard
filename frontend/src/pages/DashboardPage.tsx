import { useMemo } from "react";
import { useDashboardSummary } from "../hooks/usePriceData";
import { useSectorRankings, useCrossAssetRankings } from "../hooks/useRRGData";
import { useOBVStructure } from "../hooks/useFlowData";
import { useRegimeSummary } from "../hooks/useRegimeData";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { formatPct, formatDate } from "../utils/formatters";
import { Link } from "react-router-dom";
import { getTickerColor } from "../utils/colors";
import type { RankingEntry } from "../types/rrg";
import type { RegimeSummaryEntry } from "../types/regime";
import type { OBVStructureEntry } from "../types/flow";
import type { LucideProps } from "lucide-react";
import {
  TrendingUp,
  Radar,
  Globe,
  Gauge,
  Activity,
  Zap,
} from "lucide-react";

const QUADRANT_COLORS: Record<string, string> = {
  Leading: "var(--success)",
  Weakening: "var(--warning)",
  Lagging: "var(--danger)",
  Improving: "var(--accent)",
};

// ── Rotation Snapshot ──────────────────────────────────────────────

function RotationSnapshot({
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

  const top5 = rankings.slice(0, 5);

  return (
    <div className="dashboard-chart-section">
      <div className="section-header">
        <h2>
          <Icon size={16} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          {title}
        </h2>
        <Link to={linkTo} className="view-full-link">Full Analysis &rarr;</Link>
      </div>

      <div className="dash-quadrant-row">
        {(["Leading", "Weakening", "Improving", "Lagging"] as const).map((q) => (
          <span key={q} className="dash-q-badge" style={{ color: QUADRANT_COLORS[q] }}>
            <strong>{quadrants[q]}</strong> {q}
          </span>
        ))}
      </div>

      <div className="dash-top-list">
        {top5.map((entry, i) => (
          <div key={entry.ticker} className="obv-leaderboard-row">
            <span className="obv-lb-rank">{i + 1}</span>
            <span className="ticker-dot" style={{ background: getTickerColor(entry.ticker) }} />
            <span className="ticker-cell">{entry.ticker}</span>
            <span className="obv-lb-name">{entry.name}</span>
            <span className="dash-q-pill" style={{ color: QUADRANT_COLORS[entry.quadrant] }}>
              {entry.quadrant}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Market Signals ─────────────────────────────────────────────────

function MarketSignals({ regimeData }: { regimeData: RegimeSummaryEntry[] }) {
  const overbought = regimeData.filter((e) => e.overext_label === "overbought");
  const oversold = regimeData.filter((e) => e.overext_label === "oversold");
  const inflow = regimeData.filter((e) => e.flow_label === "strong_inflow");
  const outflow = regimeData.filter((e) => e.flow_label === "strong_outflow");

  const hasSignals = overbought.length + oversold.length + inflow.length + outflow.length > 0;
  if (!hasSignals) return null;

  return (
    <div className="dashboard-chart-section">
      <div className="section-header">
        <h2>
          <Zap size={16} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          Active Signals
        </h2>
        <Link to="/regime" className="view-full-link">Regime Details &rarr;</Link>
      </div>

      <div className="dash-signals-grid">
        {overbought.length > 0 && (
          <div className="dash-signal-group">
            <span className="dash-signal-label positive">Overbought</span>
            <div className="dash-signal-tickers">
              {overbought.map((e) => (
                <span key={e.symbol} className="dash-signal-chip positive">
                  <span className="ticker-dot" style={{ background: getTickerColor(e.symbol) }} />
                  {e.symbol}
                  <small>{e.overextension?.toFixed(1)}</small>
                </span>
              ))}
            </div>
          </div>
        )}
        {oversold.length > 0 && (
          <div className="dash-signal-group">
            <span className="dash-signal-label negative">Oversold</span>
            <div className="dash-signal-tickers">
              {oversold.map((e) => (
                <span key={e.symbol} className="dash-signal-chip negative">
                  <span className="ticker-dot" style={{ background: getTickerColor(e.symbol) }} />
                  {e.symbol}
                  <small>{e.overextension?.toFixed(1)}</small>
                </span>
              ))}
            </div>
          </div>
        )}
        {inflow.length > 0 && (
          <div className="dash-signal-group">
            <span className="dash-signal-label positive">Strong Inflow</span>
            <div className="dash-signal-tickers">
              {inflow.map((e) => (
                <span key={e.symbol} className="dash-signal-chip positive">
                  <span className="ticker-dot" style={{ background: getTickerColor(e.symbol) }} />
                  {e.symbol}
                </span>
              ))}
            </div>
          </div>
        )}
        {outflow.length > 0 && (
          <div className="dash-signal-group">
            <span className="dash-signal-label negative">Strong Outflow</span>
            <div className="dash-signal-tickers">
              {outflow.map((e) => (
                <span key={e.symbol} className="dash-signal-chip negative">
                  <span className="ticker-dot" style={{ background: getTickerColor(e.symbol) }} />
                  {e.symbol}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Capital Flow Leaders ───────────────────────────────────────────

function FlowLeaders({ data }: { data: OBVStructureEntry[] }) {
  const sorted = [...data].sort((a, b) => (b.rotation_score ?? -1) - (a.rotation_score ?? -1));
  const topBuy = sorted.filter((e) => e.obv_regime === "buy").slice(0, 5);
  const topSell = sorted.filter((e) => e.obv_regime === "sell").reverse().slice(0, 5);

  return (
    <div className="dashboard-chart-section">
      <div className="section-header">
        <h2>
          <Activity size={16} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          Capital Flow Leaders
        </h2>
        <Link to="/obv" className="view-full-link">View Details &rarr;</Link>
      </div>
      <div className="obv-preview-cols">
        <div className="obv-preview-col">
          <div className="obv-col-header positive">Top Accumulation</div>
          {topBuy.map((entry, i) => (
            <div key={entry.symbol} className="obv-leaderboard-row">
              <span className="obv-lb-rank">{i + 1}</span>
              <span className="ticker-dot" style={{ background: getTickerColor(entry.symbol) }} />
              <span className="ticker-cell">{entry.symbol}</span>
              <span className="obv-lb-name">{entry.asset}</span>
              <span className="obv-lb-score positive">{entry.rotation_score?.toFixed(3) ?? "—"}</span>
            </div>
          ))}
        </div>
        <div className="obv-preview-col">
          <div className="obv-col-header negative">Top Distribution</div>
          {topSell.map((entry, i) => (
            <div key={entry.symbol} className="obv-leaderboard-row">
              <span className="obv-lb-rank">{i + 1}</span>
              <span className="ticker-dot" style={{ background: getTickerColor(entry.symbol) }} />
              <span className="ticker-cell">{entry.symbol}</span>
              <span className="obv-lb-name">{entry.asset}</span>
              <span className="obv-lb-score negative">{entry.rotation_score?.toFixed(3) ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────

export function DashboardPage() {
  const { data: summary, isLoading } = useDashboardSummary();
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

  if (isLoading) return <LoadingSpinner message="Loading dashboard..." />;

  return (
    <div className="dashboard-page">
      {/* Section 1: Market Pulse */}
      <div className="summary-cards">
        <div className="card">
          <div className="card-icon"><TrendingUp size={20} /></div>
          <div className="card-content">
            <span className="card-label">S&P 500 YTD</span>
            <span className="card-value">
              <span className={(summary?.sp500_return_ytd ?? 0) >= 0 ? "positive" : "negative"}>
                {formatPct(summary?.sp500_return_ytd)}
              </span>
            </span>
            {summary?.latest_date && (
              <span className="card-secondary">as of {formatDate(summary.latest_date)}</span>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-icon"><Gauge size={20} /></div>
          <div className="card-content">
            <span className="card-label">Market Regime</span>
            {regimeBreadth ? (
              <>
                <div className="dash-breadth-nums">
                  <span className="positive">{regimeBreadth.bull} Bull</span>
                  {regimeBreadth.flat > 0 && <span className="dash-breadth-flat">{regimeBreadth.flat} Flat</span>}
                  <span className="negative">{regimeBreadth.bear} Bear</span>
                </div>
                <div className="dash-minibar-track">
                  <div
                    className="dash-minibar-fill dash-minibar-fill--pos"
                    style={{ width: `${Math.round((regimeBreadth.bull / regimeBreadth.total) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <span className="card-value">—</span>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-icon"><Activity size={20} /></div>
          <div className="card-content">
            <span className="card-label">Capital Flows</span>
            {flowBreadth ? (
              <>
                <div className="dash-breadth-nums">
                  <span className="positive">{flowBreadth.buy} Accum</span>
                  <span className="negative">{flowBreadth.sell} Distrib</span>
                </div>
                <div className="dash-minibar-track">
                  <div
                    className="dash-minibar-fill dash-minibar-fill--pos"
                    style={{ width: `${Math.round((flowBreadth.buy / flowBreadth.total) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <span className="card-value">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Rotation Snapshot */}
      <div className="dashboard-charts">
        <RotationSnapshot
          title="Sector Rotation"
          icon={Radar}
          rankings={sectorRankings}
          linkTo="/rrg/sectors"
        />
        <RotationSnapshot
          title="Cross-Asset Rotation"
          icon={Globe}
          rankings={crossRankings}
          linkTo="/rrg/cross-asset"
        />
      </div>

      {/* Section 3: Active Signals */}
      {regimeData && <MarketSignals regimeData={regimeData} />}

      {/* Section 4: Capital Flow Leaders */}
      {obvData && <FlowLeaders data={obvData} />}
    </div>
  );
}

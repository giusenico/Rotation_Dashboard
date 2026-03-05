import { useDashboardSummary } from "../hooks/usePriceData";
import { useSectorRRG, useCrossAssetRRG } from "../hooks/useRRGData";
import { usePerformance } from "../hooks/usePriceData";
import { useOBVStructure } from "../hooks/useOBVData";
import { RRGChart } from "../components/charts/RRGChart";
import { PerformanceBarChart } from "../components/charts/PerformanceBarChart";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { formatPct, formatDate } from "../utils/formatters";
import { Link } from "react-router-dom";
import { Radar, Globe, TrendingUp, Calendar, BarChart3, Info, TrendingDown, Activity } from "lucide-react";

function OBVPreview() {
  const { data, isLoading } = useOBVStructure();

  if (isLoading) return <LoadingSpinner />;
  if (!data || data.length === 0) return null;

  const sorted = [...data].sort((a, b) => (b.rotation_score ?? -1) - (a.rotation_score ?? -1));
  const topBuy = sorted.filter((e) => e.obv_regime === "buy").slice(0, 4);
  const topSell = sorted.filter((e) => e.obv_regime === "sell").reverse().slice(0, 4);

  const buyCount = data.filter((e) => e.obv_regime === "buy").length;
  const sellCount = data.filter((e) => e.obv_regime === "sell").length;

  return (
    <div className="obv-preview">
      <div className="obv-preview-meta">
        <span className="obv-regime-count positive">
          <TrendingUp size={13} /> {buyCount} Accumulation
        </span>
        <span className="obv-regime-count negative">
          <TrendingDown size={13} /> {sellCount} Distribution
        </span>
      </div>

      <div className="obv-preview-cols">
        <div className="obv-preview-col">
          <div className="obv-col-header positive">Top Accumulation (BUY)</div>
          {topBuy.map((entry) => (
            <div key={entry.symbol} className="obv-row">
              <span className="obv-row-name">{entry.asset}</span>
              <span className="ticker-cell">{entry.symbol}</span>
              <OBVScoreBar value={entry.rotation_score} />
            </div>
          ))}
        </div>
        <div className="obv-preview-col">
          <div className="obv-col-header negative">Top Distribution (SELL)</div>
          {topSell.map((entry) => (
            <div key={entry.symbol} className="obv-row">
              <span className="obv-row-name">{entry.asset}</span>
              <span className="ticker-cell">{entry.symbol}</span>
              <OBVScoreBar value={entry.rotation_score} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OBVScoreBar({ value }: { value: number | null }) {
  if (value == null) return <span>—</span>;
  const pct = ((value + 1) / 2) * 100;
  const color = value >= 0 ? "var(--success)" : "var(--danger)";
  return (
    <div className="obv-score-bar-wrapper">
      <div className="obv-score-track">
        <div className="obv-score-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ color, fontSize: 11, fontFamily: "monospace", minWidth: 44, textAlign: "right" }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

export function DashboardPage() {
  const { data: summary, isLoading } = useDashboardSummary();
  const { data: sectorRRG } = useSectorRRG({ trail_length: 3 });
  const { data: crossRRG } = useCrossAssetRRG({ trail_length: 3 });
  const { data: perfData } = usePerformance("all");

  if (isLoading) return <LoadingSpinner message="Loading dashboard..." />;

  return (
    <div className="dashboard-page">
      {/* Welcome info */}
      <div className="info-box">
        <Info size={16} />
        <p>
          This dashboard tracks <strong>26 financial instruments</strong> across sectors and asset classes,
          computing <strong>Relative Rotation Graphs (RRG)</strong> to visualise which areas of the market
          are leading, weakening, lagging, or improving relative to the S&P 500 benchmark.
          Data is refreshed daily after US market close.
        </p>
      </div>

      {/* Summary cards */}
      <div className="summary-cards">
        <div className="card">
          <div className="card-icon"><BarChart3 size={20} /></div>
          <div className="card-content">
            <span className="card-label">Tracked Instruments</span>
            <span className="card-value">{summary?.total_tickers ?? "—"}</span>
          </div>
        </div>
        <div className="card">
          <div className="card-icon"><Calendar size={20} /></div>
          <div className="card-content">
            <span className="card-label">Latest Data</span>
            <span className="card-value">{summary?.latest_date ? formatDate(summary.latest_date) : "—"}</span>
          </div>
        </div>
        <div className="card">
          <div className="card-icon"><TrendingUp size={20} /></div>
          <div className="card-content">
            <span className="card-label">S&P 500 YTD</span>
            <span className={`card-value ${(summary?.sp500_return_ytd ?? 0) >= 0 ? "positive" : "negative"}`}>
              {formatPct(summary?.sp500_return_ytd)}
            </span>
          </div>
        </div>
        <div className="card">
          <div className="card-icon"><Radar size={20} /></div>
          <div className="card-content">
            <span className="card-label">Sector Leader</span>
            <span className="card-value">{summary?.sector_leader?.ticker ?? "—"}</span>
          </div>
        </div>
        <div className="card">
          <div className="card-icon"><Globe size={20} /></div>
          <div className="card-content">
            <span className="card-label">Cross-Asset Leader</span>
            <span className="card-value">{summary?.cross_asset_leader?.ticker ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* RRG previews */}
      <div className="dashboard-charts">
        <div className="dashboard-chart-section">
          <div className="section-header">
            <h2>Sector Rotation</h2>
            <Link to="/rrg/sectors" className="view-full-link">View Full &rarr;</Link>
          </div>
          <p className="section-subtitle">
            11 SPDR sector ETFs plotted by relative strength vs S&P 500. Click "View Full" for interactive controls.
          </p>
          {sectorRRG ? (
            <RRGChart data={sectorRRG.data} tickers={sectorRRG.tickers} height={420} compact />
          ) : (
            <LoadingSpinner />
          )}
        </div>

        <div className="dashboard-chart-section">
          <div className="section-header">
            <h2>Cross-Asset Rotation</h2>
            <Link to="/rrg/cross-asset" className="view-full-link">View Full &rarr;</Link>
          </div>
          <p className="section-subtitle">
            14 cross-asset ETFs (bonds, equities, commodities, crypto) vs S&P 500. Click "View Full" for details.
          </p>
          {crossRRG ? (
            <RRGChart data={crossRRG.data} tickers={crossRRG.tickers} height={420} compact />
          ) : (
            <LoadingSpinner />
          )}
        </div>
      </div>

      {/* OBV Structure snapshot */}
      <div className="dashboard-chart-section">
        <div className="section-header">
          <h2><Activity size={16} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />OBV Structure Snapshot</h2>
          <Link to="/obv" className="view-full-link">View Full &rarr;</Link>
        </div>
        <p className="section-subtitle">
          On-Balance Volume regime signals ranked by composite rotation score. BUY = accumulation, SELL = distribution.
        </p>
        <div className="chart-container" style={{ padding: "16px 20px" }}>
          <OBVPreview />
        </div>
      </div>

      {/* Performance snapshot */}
      {perfData && (
        <div className="dashboard-chart-section">
          <div className="section-header">
            <h2>1-Month Performance</h2>
          </div>
          <p className="section-subtitle">
            Total return over the last month for all tracked instruments, sorted from best to worst performer.
          </p>
          <PerformanceBarChart data={perfData} period="return_1m" height={380} />
        </div>
      )}
    </div>
  );
}

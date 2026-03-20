import { useState, useMemo } from "react";
import Plot from "react-plotly.js";
import { useComparison } from "../hooks/useCompareData";
import { useTickersRaw } from "../hooks/usePriceData";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { cssVar } from "../utils/cssVar";
import { formatPct, formatDate } from "../utils/formatters";
import type { CompareAssetInfo, ComparePayload, RRGPosition } from "../types/compare";
import { ArrowLeftRight, TrendingUp, TrendingDown, ChevronDown } from "lucide-react";

// ── Palette ──────────────────────────────────────────────────────────

const V = {
  pos: "var(--dash-positive)",
  neg: "var(--dash-negative)",
  neutral: "var(--dash-neutral)",
  ink: "var(--dash-ink)",
  posBg: "var(--dash-positive-bg)",
  negBg: "var(--dash-negative-bg)",
};

const ASSET_COLORS = ["#5A8FF7", "#F0A040"];

const LOOKBACK_OPTIONS = [
  { label: "3M", value: 63 },
  { label: "6M", value: 126 },
  { label: "1Y", value: 252 },
  { label: "2Y", value: 504 },
  { label: "5Y", value: 1260 },
];

const QUADRANT_COLORS: Record<string, string> = {
  Leading: "var(--dash-positive)",
  Weakening: "#F0A040",
  Lagging: "var(--dash-negative)",
  Improving: "#5A8FF7",
};

const QUADRANT_BG: Record<string, string> = {
  Leading: "var(--dash-positive-bg)",
  Weakening: "rgba(240,160,64,0.12)",
  Lagging: "var(--dash-negative-bg)",
  Improving: "rgba(90,143,247,0.12)",
};

const DEFAULT_PAIR = ["SPY", "QQQ"];

function isComparePayload(value: unknown): value is ComparePayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if ("error" in candidate) return false;
  return (
    Array.isArray(candidate.assets) &&
    Array.isArray(candidate.symbols) &&
    typeof candidate.normalised_prices === "object" &&
    candidate.normalised_prices !== null &&
    typeof candidate.correlation === "object" &&
    candidate.correlation !== null &&
    Array.isArray((candidate.correlation as { matrix?: unknown }).matrix)
  );
}

// ── Asset Selector Dropdown ──────────────────────────────────────────

function AssetDropdown({
  value,
  onChange,
  tickers,
  label,
  color,
}: {
  value: string;
  onChange: (sym: string) => void;
  tickers: { symbol: string; name: string; category: string }[];
  label: string;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = tickers.find((t) => t.symbol === value);
  const filtered = tickers.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.name.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = useMemo(() => {
    const map: Record<string, typeof tickers> = {};
    for (const t of filtered) {
      (map[t.category] ??= []).push(t);
    }
    return map;
  }, [filtered]);

  return (
    <div className="cmp-asset-dropdown">
      <button className="cmp-asset-btn" onClick={() => setOpen(!open)}>
        <span className="cmp-asset-dot" style={{ background: color }} />
        <span className="cmp-asset-symbol">{selected?.symbol ?? label}</span>
        <span className="cmp-asset-name">{selected?.name ?? ""}</span>
        <ChevronDown size={14} style={{ opacity: 0.5 }} />
      </button>
      {open && (
        <div className="cmp-dropdown-panel">
          <input
            className="cmp-dropdown-search"
            placeholder="Search ticker..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="cmp-dropdown-list">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <div className="cmp-dropdown-cat">{cat}</div>
                {items.map((t) => (
                  <button
                    key={t.symbol}
                    className={`cmp-dropdown-item ${t.symbol === value ? "cmp-dropdown-item--active" : ""}`}
                    onClick={() => {
                      onChange(t.symbol);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <span className="cmp-dropdown-sym">{t.symbol}</span>
                    <span className="cmp-dropdown-name">{t.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {open && <div className="cmp-dropdown-backdrop" onClick={() => { setOpen(false); setSearch(""); }} />}
    </div>
  );
}

// ── Asset Info Panel (Swissblock-style side card) ────────────────────

function AssetPanel({ asset, color, otherAsset }: {
  asset: CompareAssetInfo;
  color: string;
  otherAsset?: CompareAssetInfo;
}) {
  const retColor = (v: number | null) => (!v ? V.neutral : v >= 0 ? V.pos : V.neg);
  const retIcon = (v: number | null) => (!v || v === 0 ? null : v > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />);

  return (
    <div className="cmp-panel">
      {/* Header */}
      <div className="cmp-panel-header">
        <span className="cmp-asset-dot" style={{ background: color }} />
        <span className="cmp-panel-symbol">{asset.symbol}</span>
        <span className="cmp-panel-name">{asset.name}</span>
      </div>

      {/* Big price */}
      <div className="cmp-panel-price">
        ${asset.last_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}
      </div>

      {/* 1W return as hero change */}
      {asset.return_1w != null && (
        <div className="cmp-panel-change" style={{ color: retColor(asset.return_1w) }}>
          {retIcon(asset.return_1w)} {formatPct(asset.return_1w)} <small>1W</small>
        </div>
      )}

      {/* Returns grid */}
      <div className="cmp-panel-returns">
        {[
          { label: "1M", val: asset.return_1m },
          { label: "3M", val: asset.return_3m },
          { label: "YTD", val: asset.return_ytd },
          { label: "1Y", val: asset.return_1y },
        ].map((r) => (
          <div key={r.label} className="cmp-panel-ret-cell">
            <span className="cmp-panel-ret-label">{r.label}</span>
            <span className="cmp-panel-ret-val" style={{ color: retColor(r.val) }}>
              {formatPct(r.val)}
            </span>
          </div>
        ))}
      </div>

      {/* Regime + OBV badges */}
      <div className="cmp-panel-badges">
        <span
          className="cmp-badge"
          style={{
            color: asset.regime === "bullish" ? V.pos : asset.regime === "bearish" ? V.neg : V.neutral,
            background: asset.regime === "bullish" ? V.posBg : asset.regime === "bearish" ? V.negBg : "var(--bg-tertiary)",
          }}
        >
          {asset.regime === "bullish" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {asset.regime === "bullish" ? "Bullish" : asset.regime === "bearish" ? "Bearish" : "—"}
          {asset.sma_distance_pct != null && <small>({formatPct(asset.sma_distance_pct)})</small>}
        </span>
        {asset.obv_regime && (
          <span
            className="cmp-badge"
            style={{
              color: asset.obv_regime === "buy" ? V.pos : V.neg,
              background: asset.obv_regime === "buy" ? V.posBg : V.negBg,
            }}
          >
            OBV: {asset.obv_regime === "buy" ? "Accum" : "Distrib"}
          </span>
        )}
      </div>

      {/* Comparative price bar (like Swissblock market cap bar) */}
      {otherAsset && otherAsset.last_price && asset.last_price && (
        <div className="cmp-panel-compare-bar">
          <div className="cmp-compare-label">Price comparison</div>
          <div className="cmp-compare-track">
            <div
              className="cmp-compare-fill"
              style={{
                width: `${Math.min(100, (asset.last_price / Math.max(asset.last_price, otherAsset.last_price)) * 100)}%`,
                background: color,
              }}
            />
          </div>
          <div className="cmp-compare-val">${asset.last_price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      )}
    </div>
  );
}

// ── RSI Gauge ────────────────────────────────────────────────────────

function RSIGauge({ value, symbol, color }: { value: number | null; symbol: string; color: string }) {
  if (value == null) return null;
  const pct = Math.min(100, Math.max(0, value));
  const label = value >= 70 ? "Overbought" : value <= 30 ? "Oversold" : "Neutral";
  const labelColor = value >= 70 ? V.neg : value <= 30 ? V.pos : V.neutral;

  return (
    <div className="cmp-rsi-gauge">
      <div className="cmp-rsi-header">
        <span className="cmp-asset-dot" style={{ background: color }} />
        <span className="cmp-rsi-sym">{symbol}</span>
        <span className="cmp-rsi-val" style={{ color }}>{value.toFixed(1)}</span>
      </div>
      <div className="cmp-rsi-track">
        <div className="cmp-rsi-zone cmp-rsi-zone--oversold" />
        <div className="cmp-rsi-zone cmp-rsi-zone--neutral" />
        <div className="cmp-rsi-zone cmp-rsi-zone--overbought" />
        <div className="cmp-rsi-marker" style={{ left: `${pct}%`, background: color }} />
      </div>
      <div className="cmp-rsi-label" style={{ color: labelColor }}>{label}</div>
    </div>
  );
}

// ── Correlation Gauge (Swissblock-style horizontal bar) ──────────────

function CorrelationGauge({ value }: { value: number; symA: string; symB: string }) {
  const pct = Math.min(100, Math.max(0, ((value + 1) / 2) * 100));
  const col = value >= 0.7 ? V.pos : value <= 0.3 ? V.neg : V.neutral;

  return (
    <div className="cmp-corr-gauge">
      <div className="cmp-corr-gauge-header">
        <span className="cmp-section-title" style={{ marginBottom: 0 }}>Correlation</span>
        <span className="cmp-corr-gauge-val" style={{ color: col }}>{value.toFixed(2)}</span>
      </div>
      <div className="cmp-corr-gauge-track">
        <div className="cmp-corr-gauge-fill" style={{ width: `${pct}%`, background: col }} />
        <div className="cmp-corr-gauge-marker" style={{ left: `${pct}%` }} />
      </div>
      <div className="cmp-corr-gauge-labels">
        <span>-1</span>
        <span>0</span>
        <span>1</span>
      </div>
    </div>
  );
}

// ── RRG Quadrant Mini Chart ──────────────────────────────────────────

function RRGQuadrantMini({
  positions,
  symbols,
}: {
  positions: Record<string, RRGPosition>;
  symbols: string[];
}) {
  // Compute view bounds from all trail points
  const allPoints = symbols.flatMap((sym) => positions[sym]?.trail ?? []);
  if (allPoints.length === 0) return null;

  const ratios = allPoints.map((p) => p.ratio);
  const momentums = allPoints.map((p) => p.momentum);
  const rMin = Math.min(...ratios);
  const rMax = Math.max(...ratios);
  const mMin = Math.min(...momentums);
  const mMax = Math.max(...momentums);

  // Add padding around data range, ensure 100 is always visible
  const pad = 0.3;
  const xLo = Math.min(100, rMin) - (rMax - rMin) * pad - 0.5;
  const xHi = Math.max(100, rMax) + (rMax - rMin) * pad + 0.5;
  const yLo = Math.min(100, mMin) - (mMax - mMin) * pad - 0.5;
  const yHi = Math.max(100, mMax) + (mMax - mMin) * pad + 0.5;

  const W = 220;
  const H = 200;
  const mx = 30; // margin left
  const my = 20; // margin top
  const pw = W - mx - 10; // plot width
  const ph = H - my - 20; // plot height

  const toX = (v: number) => mx + ((v - xLo) / (xHi - xLo)) * pw;
  const toY = (v: number) => my + ((yHi - v) / (yHi - yLo)) * ph;

  const cx = toX(100);
  const cy = toY(100);

  return (
    <div className="cmp-side-card">
      <h4 className="cmp-section-title">Quadrants</h4>
      <svg width={W} height={H} className="cmp-rrg-svg">
        {/* Quadrant backgrounds */}
        <rect x={cx} y={my} width={mx + pw - cx + 10} height={cy - my} rx={3} fill="rgba(76,175,80,0.06)" />
        <rect x={mx} y={my} width={cx - mx} height={cy - my} rx={3} fill="rgba(90,143,247,0.06)" />
        <rect x={mx} y={cy} width={cx - mx} height={my + ph - cy + 20} rx={3} fill="rgba(240,115,103,0.06)" />
        <rect x={cx} y={cy} width={mx + pw - cx + 10} height={my + ph - cy + 20} rx={3} fill="rgba(240,160,64,0.06)" />

        {/* Crosshair */}
        <line x1={cx} y1={my} x2={cx} y2={my + ph} stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3" />
        <line x1={mx} y1={cy} x2={mx + pw} y2={cy} stroke="var(--border)" strokeWidth={1} strokeDasharray="3,3" />

        {/* Quadrant labels */}
        <text x={cx + 4} y={my + 12} fontSize={8} fill="var(--text-muted)" opacity={0.6}>Leading</text>
        <text x={mx + 2} y={my + 12} fontSize={8} fill="var(--text-muted)" opacity={0.6}>Improving</text>
        <text x={mx + 2} y={my + ph - 2} fontSize={8} fill="var(--text-muted)" opacity={0.6}>Lagging</text>
        <text x={cx + 4} y={my + ph - 2} fontSize={8} fill="var(--text-muted)" opacity={0.6}>Weakening</text>

        {/* Trails and dots */}
        {symbols.map((sym, i) => {
          const pos = positions[sym];
          if (!pos?.trail?.length) return null;
          const color = ASSET_COLORS[i];

          // Trail path
          const pathD = pos.trail
            .map((p, j) => `${j === 0 ? "M" : "L"}${toX(p.ratio).toFixed(1)},${toY(p.momentum).toFixed(1)}`)
            .join(" ");

          const last = pos.trail[pos.trail.length - 1];

          return (
            <g key={sym}>
              <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5} />
              {/* Trail dots (fading) */}
              {pos.trail.slice(0, -1).map((p, j) => (
                <circle
                  key={j}
                  cx={toX(p.ratio)}
                  cy={toY(p.momentum)}
                  r={2}
                  fill={color}
                  opacity={0.15 + (j / pos.trail.length) * 0.4}
                />
              ))}
              {/* Current position */}
              <circle cx={toX(last.ratio)} cy={toY(last.momentum)} r={5} fill={color} stroke="var(--bg-card)" strokeWidth={2} />
              <text
                x={toX(last.ratio) + 8}
                y={toY(last.momentum) + 4}
                fontSize={10}
                fontWeight={700}
                fill={color}
              >
                {sym}
              </text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text x={mx + pw / 2} y={H - 2} fontSize={9} fill="var(--text-muted)" textAnchor="middle">RS-Ratio</text>
        <text x={8} y={my + ph / 2} fontSize={9} fill="var(--text-muted)" textAnchor="middle" transform={`rotate(-90,8,${my + ph / 2})`}>Momentum</text>
      </svg>

      {/* Quadrant badges */}
      <div className="cmp-rrg-badges">
        {symbols.map((sym, i) => {
          const pos = positions[sym];
          if (!pos) return null;
          return (
            <div key={sym} className="cmp-rrg-badge-row">
              <span className="cmp-asset-dot" style={{ background: ASSET_COLORS[i] }} />
              <span className="cmp-rrg-badge-sym">{sym}</span>
              <span
                className="cmp-badge"
                style={{
                  color: QUADRANT_COLORS[pos.quadrant] ?? "var(--text-muted)",
                  background: QUADRANT_BG[pos.quadrant] ?? "var(--bg-tertiary)",
                  fontSize: 10,
                }}
              >
                {pos.quadrant}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export function ComparePage() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_PAIR);
  const [lookback, setLookback] = useState(252);

  const { data: rawTickers } = useTickersRaw();
  const { data, isLoading, error: queryError } = useComparison(symbols, lookback);
  const comparison = useMemo(() => (isComparePayload(data) ? data : null), [data]);
  const payloadError = useMemo(() => {
    if (!data || typeof data !== "object") return null;
    if ("error" in data) return data.error;
    return null;
  }, [data]);

  const allTickers = useMemo(() => {
    if (!rawTickers) return [];
    return rawTickers
      .filter((t) => t.category !== "Volatility Index")
      .map((t) => ({ symbol: t.symbol, name: t.name, category: t.category }));
  }, [rawTickers]);

  const updateSymbol = (index: number, newSym: string) => {
    setSymbols((prev) => {
      const next = [...prev];
      next[index] = newSym;
      return next;
    });
  };

  const swapSymbols = () => {
    if (symbols.length >= 2) {
      setSymbols((prev) => [prev[1], prev[0]]);
    }
  };

  const chartBg = "rgba(0,0,0,0)";
  const gridColor = () => cssVar("--chart-grid");
  const textColor = () => cssVar("--chart-text");

  // Correlation value for the gauge (from matrix)
  const corrValue = useMemo(() => {
    if (!comparison?.correlation?.matrix) return null;
    const row = comparison.correlation.matrix[0];
    if (!Array.isArray(row) || row.length < 2) return null;
    return row[1];
  }, [comparison]);

  return (
    <div className="compare-page">
      {/* ── Top bar: Swissblock-style ── */}
      <div className="cmp-topbar">
        <div className="cmp-selectors">
          <AssetDropdown
            value={symbols[0]}
            onChange={(s) => updateSymbol(0, s)}
            tickers={allTickers}
            label="Asset A"
            color={ASSET_COLORS[0]}
          />
          <button className="cmp-swap-btn" onClick={swapSymbols} title="Swap assets">
            <ArrowLeftRight size={16} />
          </button>
          <AssetDropdown
            value={symbols[1]}
            onChange={(s) => updateSymbol(1, s)}
            tickers={allTickers}
            label="Asset B"
            color={ASSET_COLORS[1]}
          />
        </div>
        <div className="cmp-lookback-bar">
          {LOOKBACK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`cmp-lookback-btn ${lookback === opt.value ? "cmp-lookback-btn--active" : ""}`}
              onClick={() => setLookback(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingSpinner message="Loading comparison..." />}

      {queryError && !isLoading && (
        <div style={{ padding: "0 20px", color: "var(--text-muted)" }}>
          Unable to load comparison data. Please try again.
        </div>
      )}

      {!isLoading && !queryError && (!comparison || payloadError) && (
        <div style={{ padding: "0 20px", color: "var(--text-muted)" }}>
          No comparison available for selected assets/timeframe.
        </div>
      )}

      {comparison && !isLoading && !payloadError && (
        <div className="cmp-body-3col">
          {/* ── Left panel: Asset A ── */}
          <div className="cmp-side-panel">
            <AssetPanel
              asset={comparison.assets[0]}
              color={ASSET_COLORS[0]}
              otherAsset={comparison.assets[1]}
            />

            {/* RSI gauges */}
            <div className="cmp-side-card">
              <h4 className="cmp-section-title">RSI (14)</h4>
              {symbols.map((sym, i) => (
                <RSIGauge
                  key={sym}
                  value={comparison.rsi[sym]?.current ?? null}
                  symbol={sym}
                  color={ASSET_COLORS[i]}
                />
              ))}
            </div>

            {/* Correlation gauge */}
            {corrValue != null && (
              <div className="cmp-side-card">
                <CorrelationGauge value={corrValue} symA={symbols[0]} symB={symbols[1]} />
              </div>
            )}
          </div>

          {/* ── Center: Charts ── */}
          <div className="cmp-center">
            {/* Main price overlay chart */}
            <div className="cmp-chart-section cmp-chart-main">
              <div className="cmp-chart-header-row">
                <h3 className="cmp-section-title">Price</h3>
                <div className="cmp-chart-tags">
                  {symbols.map((sym, i) => {
                    const series = comparison.normalised_prices[sym];
                    const lastVal = series?.values?.[series.values.length - 1];
                    return (
                      <span
                        key={sym}
                        className="cmp-chart-tag"
                        style={{
                          color: ASSET_COLORS[i],
                          borderColor: ASSET_COLORS[i],
                        }}
                      >
                        {sym}: {lastVal != null ? `${lastVal > 0 ? "+" : ""}${lastVal.toFixed(1)}%` : "—"}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="chart-container">
                <Plot
                  data={symbols.map((sym, i) => {
                    const series = comparison.normalised_prices[sym];
                    if (!series) return { x: [], y: [], type: "scatter" as const, name: sym };
                    return {
                      x: series.dates,
                      y: series.values,
                      type: "scatter" as const,
                      mode: "lines" as const,
                      name: comparison.assets[i]?.name ?? sym,
                      line: { color: ASSET_COLORS[i], width: 2.2 },
                      hovertemplate: `%{x}<br>${sym}: %{y:.1f}%<extra></extra>`,
                    };
                  })}
                  layout={{
                    paper_bgcolor: chartBg,
                    plot_bgcolor: chartBg,
                    autosize: true,
                    margin: { l: 50, r: 20, t: 10, b: 30 },
                    xaxis: {
                      color: textColor(),
                      tickfont: { color: textColor(), size: 10 },
                      gridcolor: gridColor(),
                      showgrid: false,
                    },
                    yaxis: {
                      color: textColor(),
                      tickfont: { color: textColor(), size: 10 },
                      gridcolor: gridColor(),
                      ticksuffix: "%",
                      zeroline: true,
                      zerolinecolor: cssVar("--zeroline"),
                    },
                    legend: {
                      orientation: "h",
                      yanchor: "bottom",
                      y: 1.02,
                      xanchor: "left",
                      x: 0,
                      font: { color: textColor(), size: 10 },
                    },
                    hovermode: "x unified",
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>

            {/* 2x2 Sub-charts grid */}
            <div className="cmp-charts-grid">
              {/* Relative Strength */}
              <div className="cmp-grid-cell">
                <h4 className="cmp-section-title">Relative Strength</h4>
                {comparison.relative_strength?.dates?.length > 0 && (
                  <div className="chart-container">
                    <Plot
                      data={[
                        {
                          x: comparison.relative_strength.dates,
                          y: comparison.relative_strength.values,
                          type: "scatter",
                          mode: "lines",
                          name: `${symbols[0]} / ${symbols[1]}`,
                          line: { color: cssVar("--accent"), width: 1.5 },
                          fill: "tozeroy",
                          fillcolor: "rgba(123, 140, 222, 0.06)",
                          hovertemplate: "%{x}<br>Ratio: %{y:.4f}<extra></extra>",
                        },
                      ]}
                      layout={{
                        paper_bgcolor: chartBg,
                        plot_bgcolor: chartBg,
                        autosize: true,
                        margin: { l: 45, r: 10, t: 5, b: 25 },
                        xaxis: { color: textColor(), tickfont: { color: textColor(), size: 9 }, showgrid: false },
                        yaxis: { color: textColor(), tickfont: { color: textColor(), size: 9 }, gridcolor: gridColor() },
                        hovermode: "x unified",
                      }}
                      config={{ responsive: true, displayModeBar: false }}
                      useResizeHandler
                      style={{ width: "100%", height: "100%" }}
                    />
                  </div>
                )}
              </div>

              {/* Rolling Correlation */}
              <div className="cmp-grid-cell">
                <h4 className="cmp-section-title">Rolling Correlation (63d)</h4>
                {comparison.rolling_correlation?.dates?.length > 0 && (
                  <div className="chart-container">
                    <Plot
                      data={[
                        {
                          x: comparison.rolling_correlation.dates,
                          y: comparison.rolling_correlation.values,
                          type: "scatter",
                          mode: "lines",
                          name: "63d Corr",
                          line: { color: "#B58AF7", width: 1.5 },
                          fill: "tozeroy",
                          fillcolor: "rgba(181, 138, 247, 0.06)",
                          hovertemplate: "%{x}<br>Corr: %{y:.3f}<extra></extra>",
                        },
                      ]}
                      layout={{
                        paper_bgcolor: chartBg,
                        plot_bgcolor: chartBg,
                        autosize: true,
                        margin: { l: 35, r: 10, t: 5, b: 25 },
                        xaxis: { color: textColor(), tickfont: { color: textColor(), size: 9 }, showgrid: false },
                        yaxis: {
                          color: textColor(), tickfont: { color: textColor(), size: 9 }, gridcolor: gridColor(),
                          range: [-1, 1], zeroline: true, zerolinecolor: cssVar("--zeroline"),
                        },
                        hovermode: "x unified",
                      }}
                      config={{ responsive: true, displayModeBar: false }}
                      useResizeHandler
                      style={{ width: "100%", height: "100%" }}
                    />
                  </div>
                )}
              </div>

              {/* Volume */}
              <div className="cmp-grid-cell">
                <h4 className="cmp-section-title">Volume (60d)</h4>
                <div className="chart-container">
                  <Plot
                    data={symbols.map((sym, i) => {
                      const vol = comparison.volume?.[sym];
                      if (!vol) return { x: [], y: [], type: "bar" as const, name: sym };
                      return {
                        x: vol.dates,
                        y: vol.values,
                        type: "bar" as const,
                        name: sym,
                        marker: { color: ASSET_COLORS[i], opacity: 0.7 },
                        hovertemplate: `%{x}<br>${sym}: %{y:,.0f}<extra></extra>`,
                      };
                    })}
                    layout={{
                      paper_bgcolor: chartBg,
                      plot_bgcolor: chartBg,
                      autosize: true,
                      margin: { l: 50, r: 10, t: 5, b: 25 },
                      barmode: "group",
                      xaxis: { color: textColor(), tickfont: { color: textColor(), size: 9 }, showgrid: false },
                      yaxis: { color: textColor(), tickfont: { color: textColor(), size: 9 }, gridcolor: gridColor() },
                      legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0, font: { color: textColor(), size: 9 } },
                      hovermode: "x unified",
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    useResizeHandler
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              </div>

              {/* RSI */}
              <div className="cmp-grid-cell">
                <h4 className="cmp-section-title">RSI (14)</h4>
                <div className="chart-container">
                  <Plot
                    data={[
                      ...symbols.map((sym, i) => {
                        const rsi = comparison.rsi?.[sym];
                        if (!rsi) return { x: [], y: [], type: "scatter" as const, name: sym };
                        return {
                          x: rsi.dates,
                          y: rsi.values,
                          type: "scatter" as const,
                          mode: "lines" as const,
                          name: sym,
                          line: { color: ASSET_COLORS[i], width: 1.5 },
                          hovertemplate: `%{x}<br>${sym} RSI: %{y:.1f}<extra></extra>`,
                        };
                      }),
                      {
                        x: comparison.rsi?.[symbols[0]]?.dates ?? [],
                        y: Array((comparison.rsi?.[symbols[0]]?.dates?.length ?? 0)).fill(70),
                        type: "scatter" as const,
                        mode: "lines" as const,
                        line: { color: "rgba(240, 115, 103, 0.3)", width: 1, dash: "dash" as const },
                        showlegend: false,
                        hoverinfo: "skip" as const,
                      },
                      {
                        x: comparison.rsi?.[symbols[0]]?.dates ?? [],
                        y: Array((comparison.rsi?.[symbols[0]]?.dates?.length ?? 0)).fill(30),
                        type: "scatter" as const,
                        mode: "lines" as const,
                        line: { color: "rgba(90, 143, 247, 0.3)", width: 1, dash: "dash" as const },
                        showlegend: false,
                        hoverinfo: "skip" as const,
                      },
                    ]}
                    layout={{
                      paper_bgcolor: chartBg,
                      plot_bgcolor: chartBg,
                      autosize: true,
                      margin: { l: 30, r: 10, t: 5, b: 25 },
                      xaxis: { color: textColor(), tickfont: { color: textColor(), size: 9 }, showgrid: false },
                      yaxis: { color: textColor(), tickfont: { color: textColor(), size: 9 }, gridcolor: gridColor(), range: [0, 100] },
                      legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0, font: { color: textColor(), size: 9 } },
                      hovermode: "x unified",
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    useResizeHandler
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Right panel: Asset B ── */}
          <div className="cmp-side-panel">
            <AssetPanel
              asset={comparison.assets[1]}
              color={ASSET_COLORS[1]}
              otherAsset={comparison.assets[0]}
            />

            {/* RRG Quadrant mini chart */}
            {comparison.rrg_positions && Object.keys(comparison.rrg_positions).length > 0 && (
              <RRGQuadrantMini positions={comparison.rrg_positions} symbols={symbols} />
            )}

            {/* Date footer */}
            {comparison.as_of_date && (
              <div className="cmp-date-footer">
                Data as of {formatDate(comparison.as_of_date)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

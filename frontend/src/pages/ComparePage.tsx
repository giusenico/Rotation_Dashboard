import { useState, useMemo } from "react";
import Plot from "react-plotly.js";
import { useComparison } from "../hooks/useCompareData";
import { useTickersRaw } from "../hooks/usePriceData";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { cssVar } from "../utils/cssVar";
import { formatPct, formatDate } from "../utils/formatters";
import type { CompareAssetInfo } from "../types/compare";
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

const SUB_CHART_TABS = [
  { key: "rel-strength", label: "Relative Strength" },
  { key: "correlation", label: "Correlation" },
  { key: "volume", label: "Volume" },
  { key: "rsi", label: "RSI" },
] as const;

type SubChartTab = (typeof SUB_CHART_TABS)[number]["key"];

const DEFAULT_PAIR = ["SPY", "QQQ"];

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

function CorrelationGauge({ value, symA, symB }: { value: number; symA: string; symB: string }) {
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

// ── Main Page ────────────────────────────────────────────────────────

export function ComparePage() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_PAIR);
  const [lookback, setLookback] = useState(252);
  const [subTab, setSubTab] = useState<SubChartTab>("rel-strength");

  const { data: rawTickers } = useTickersRaw();
  const { data, isLoading } = useComparison(symbols, lookback);

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
    if (!data?.correlation?.matrix || data.correlation.matrix.length < 2) return null;
    return data.correlation.matrix[0][1];
  }, [data]);

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

      {data && !isLoading && (
        <div className="cmp-body-3col">
          {/* ── Left panel: Asset A ── */}
          <div className="cmp-side-panel">
            <AssetPanel
              asset={data.assets[0]}
              color={ASSET_COLORS[0]}
              otherAsset={data.assets[1]}
            />

            {/* RSI gauges */}
            <div className="cmp-side-card">
              <h4 className="cmp-section-title">RSI (14)</h4>
              {symbols.map((sym, i) => (
                <RSIGauge
                  key={sym}
                  value={data.rsi[sym]?.current ?? null}
                  symbol={sym}
                  color={ASSET_COLORS[i]}
                />
              ))}
            </div>
          </div>

          {/* ── Center: Charts ── */}
          <div className="cmp-center">
            {/* Main price overlay chart */}
            <div className="cmp-chart-section">
              <div className="cmp-chart-header-row">
                <h3 className="cmp-section-title">Price</h3>
                {/* Latest % values as colored tags */}
                <div className="cmp-chart-tags">
                  {symbols.map((sym, i) => {
                    const series = data.normalised_prices[sym];
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
              <div className="chart-container" style={{ height: 380 }}>
                <Plot
                  data={symbols.map((sym, i) => {
                    const series = data.normalised_prices[sym];
                    if (!series) return { x: [], y: [], type: "scatter" as const, name: sym };
                    return {
                      x: series.dates,
                      y: series.values,
                      type: "scatter" as const,
                      mode: "lines" as const,
                      name: data.assets[i]?.name ?? sym,
                      line: { color: ASSET_COLORS[i], width: 2.2 },
                      hovertemplate: `%{x}<br>${sym}: %{y:.1f}%<extra></extra>`,
                    };
                  })}
                  layout={{
                    paper_bgcolor: chartBg,
                    plot_bgcolor: chartBg,
                    height: 380,
                    margin: { l: 50, r: 20, t: 10, b: 40 },
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
                      font: { color: textColor(), size: 11 },
                    },
                    hovermode: "x unified",
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>

            {/* Sub-chart tabs (Swissblock-style) */}
            <div className="cmp-chart-section">
              <div className="cmp-sub-tabs">
                {SUB_CHART_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={`cmp-sub-tab ${subTab === tab.key ? "cmp-sub-tab--active" : ""}`}
                    onClick={() => setSubTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Relative Strength */}
              {subTab === "rel-strength" && data.relative_strength?.dates?.length > 0 && (
                <div className="chart-container" style={{ height: 220 }}>
                  <Plot
                    data={[
                      {
                        x: data.relative_strength.dates,
                        y: data.relative_strength.values,
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
                      height: 220,
                      margin: { l: 50, r: 20, t: 10, b: 40 },
                      xaxis: {
                        color: textColor(),
                        tickfont: { color: textColor(), size: 10 },
                        showgrid: false,
                      },
                      yaxis: {
                        color: textColor(),
                        tickfont: { color: textColor(), size: 10 },
                        gridcolor: gridColor(),
                      },
                      hovermode: "x unified",
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    useResizeHandler
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              )}

              {/* Rolling Correlation */}
              {subTab === "correlation" && data.rolling_correlation?.dates?.length > 0 && (
                <div className="chart-container" style={{ height: 220 }}>
                  <Plot
                    data={[
                      {
                        x: data.rolling_correlation.dates,
                        y: data.rolling_correlation.values,
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
                      height: 220,
                      margin: { l: 50, r: 20, t: 10, b: 40 },
                      xaxis: {
                        color: textColor(),
                        tickfont: { color: textColor(), size: 10 },
                        showgrid: false,
                      },
                      yaxis: {
                        color: textColor(),
                        tickfont: { color: textColor(), size: 10 },
                        gridcolor: gridColor(),
                        range: [-1, 1],
                        zeroline: true,
                        zerolinecolor: cssVar("--zeroline"),
                      },
                      hovermode: "x unified",
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    useResizeHandler
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              )}

              {/* Volume comparison */}
              {subTab === "volume" && (
                <div className="chart-container" style={{ height: 220 }}>
                  <Plot
                    data={symbols.map((sym, i) => {
                      const vol = data.volume?.[sym];
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
                      height: 220,
                      margin: { l: 60, r: 20, t: 10, b: 40 },
                      barmode: "group",
                      xaxis: {
                        color: textColor(),
                        tickfont: { color: textColor(), size: 10 },
                        showgrid: false,
                      },
                      yaxis: {
                        color: textColor(),
                        tickfont: { color: textColor(), size: 10 },
                        gridcolor: gridColor(),
                      },
                      legend: {
                        orientation: "h",
                        yanchor: "bottom",
                        y: 1.02,
                        xanchor: "left",
                        x: 0,
                        font: { color: textColor(), size: 11 },
                      },
                      hovermode: "x unified",
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    useResizeHandler
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              )}

              {/* RSI time-series */}
              {subTab === "rsi" && (
                <div className="chart-container" style={{ height: 220 }}>
                  <Plot
                    data={[
                      ...symbols.map((sym, i) => {
                        const rsi = data.rsi?.[sym];
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
                      // Overbought/oversold lines
                      {
                        x: data.rsi?.[symbols[0]]?.dates ?? [],
                        y: Array((data.rsi?.[symbols[0]]?.dates?.length ?? 0)).fill(70),
                        type: "scatter" as const,
                        mode: "lines" as const,
                        line: { color: "rgba(240, 115, 103, 0.3)", width: 1, dash: "dash" as const },
                        showlegend: false,
                        hoverinfo: "skip" as const,
                      },
                      {
                        x: data.rsi?.[symbols[0]]?.dates ?? [],
                        y: Array((data.rsi?.[symbols[0]]?.dates?.length ?? 0)).fill(30),
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
                      height: 220,
                      margin: { l: 40, r: 20, t: 10, b: 40 },
                      xaxis: {
                        color: textColor(),
                        tickfont: { color: textColor(), size: 10 },
                        showgrid: false,
                      },
                      yaxis: {
                        color: textColor(),
                        tickfont: { color: textColor(), size: 10 },
                        gridcolor: gridColor(),
                        range: [0, 100],
                      },
                      legend: {
                        orientation: "h",
                        yanchor: "bottom",
                        y: 1.02,
                        xanchor: "left",
                        x: 0,
                        font: { color: textColor(), size: 11 },
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
          </div>

          {/* ── Right panel: Asset B ── */}
          <div className="cmp-side-panel">
            <AssetPanel
              asset={data.assets[1]}
              color={ASSET_COLORS[1]}
              otherAsset={data.assets[0]}
            />

            {/* Correlation gauge */}
            {corrValue != null && (
              <div className="cmp-side-card">
                <CorrelationGauge value={corrValue} symA={symbols[0]} symB={symbols[1]} />
              </div>
            )}

            {/* Date footer */}
            {data.as_of_date && (
              <div className="cmp-date-footer">
                Data as of {formatDate(data.as_of_date)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

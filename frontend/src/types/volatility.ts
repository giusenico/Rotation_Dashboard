// ── VIX context ────────────────────────────────────────────────────

export interface VolatilitySummary {
  vix_last: number | null;
  vix3m_last: number | null;
  sp500_last: number | null;
  vix_ratio: number | null;
  ratio_ma50: number | null;
  vix_oscillator: number | null;
  ratio_oscillator: number | null;
  signal: string; // "buy" | "sell" | "caution" | "neutral"
  position: string; // "invested" | "cash"
  as_of_date: string;
}

export interface VolatilityPricePoint {
  date: string;
  vix: number | null;
  vix3m: number | null;
}

export interface VolatilityOscPoint {
  date: string;
  vix_osc: number | null;
  ratio_osc: number | null;
}

export interface VolatilityRatioPoint {
  date: string;
  ratio: number | null;
  ratio_ma50: number | null;
}

export interface BacktestPoint {
  date: string;
  strategy: number | null;
  benchmark: number | null;
  position: number;
}

export interface VolatilityDetailResponse {
  summary: VolatilitySummary;
  vix_series: VolatilityPricePoint[];
  oscillator_series: VolatilityOscPoint[];
  ratio_series: VolatilityRatioPoint[];
  backtest_series: BacktestPoint[];
}

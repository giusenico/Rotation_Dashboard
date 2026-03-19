export interface CompareTimeSeries {
  dates: string[];
  values: (number | null)[];
}

export interface CompareAssetInfo {
  symbol: string;
  name: string;
  last_price: number | null;
  return_1w: number | null;
  return_1m: number | null;
  return_3m: number | null;
  return_6m: number | null;
  return_1y: number | null;
  return_ytd: number | null;
  regime: string;
  sma_distance_pct: number | null;
  obv_regime: string | null;
  rotation_score: number | null;
}

export interface CompareRSI {
  current: number | null;
  dates: string[];
  values: (number | null)[];
}

export interface CompareCorrelation {
  symbols: string[];
  matrix: number[][];
}

export interface CompareResponse {
  symbols: string[];
  lookback: number;
  as_of_date: string | null;
  assets: CompareAssetInfo[];
  normalised_prices: Record<string, CompareTimeSeries>;
  correlation: CompareCorrelation;
  rolling_correlation: CompareTimeSeries;
  rsi: Record<string, CompareRSI>;
  volume: Record<string, CompareTimeSeries>;
  relative_strength: CompareTimeSeries;
}

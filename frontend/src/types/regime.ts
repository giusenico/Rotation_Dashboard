export interface RegimeSummaryEntry {
  symbol: string;
  asset: string;
  category: string;
  last_price: number | null;
  regime: number; // +1, 0, -1
  regime_label: string;
  overextension: number | null;
  overext_label: string;
  capital_flow_z: number | null;
  flow_label: string;
  sma_value: number | null;
}

export interface RegimeTimePoint {
  date: string;
  value: number | null;
}

export interface RegimePricePoint {
  date: string;
  close: number | null;
  sma: number | null;
}

export interface RegimeDetailResponse {
  symbol: string;
  asset: string;
  last_price: number | null;
  regime_current: number;
  overext_current: number | null;
  overext_threshold: number;
  flow_z_current: number | null;
  flow_threshold: number;
  price_series: RegimePricePoint[];
  regime_series: RegimeTimePoint[];
  overext_series: RegimeTimePoint[];
  flow_series: RegimeTimePoint[];
}

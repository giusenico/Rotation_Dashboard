export interface OBVSpreadPoint {
  date: string;
  value: number;
}

export type StyleBucket = "growth" | "safety" | "tactical";

export interface OBVStructureEntry {
  asset: string;
  symbol: string;
  obv_regime: "buy" | "sell";
  rotation_score: number | null;
  spread_percentile: number | null;
  spread_momentum_z: number | null;
  return_1m: number | null;
  return_3m: number | null;
  return_6m: number | null;
  return_ytd: number | null;
  market_cap: number | null;
  style_bucket: StyleBucket | null;
  spread_series: OBVSpreadPoint[];
}

export interface OBVScorePoint {
  date: string;
  rotation_score: number | null;
  obv_regime: "buy" | "sell";
}

export interface OBVScoreHistoryEntry {
  symbol: string;
  asset: string;
  data: OBVScorePoint[];
}

export interface OBVDetailScorePoint {
  date: string;
  rotation_score: number | null;
  obv_regime: "buy" | "sell";
  spread_last: number | null;
}

export interface OBVDetailResponse {
  symbol: string;
  asset: string;
  obv_regime: "buy" | "sell";
  last_price: number | null;
  rotation_score: number | null;
  spread_percentile: number | null;
  spread_momentum_z: number | null;
  return_1m: number | null;
  return_3m: number | null;
  return_6m: number | null;
  return_ytd: number | null;
  obv_series: OBVSpreadPoint[];
  spread_series: OBVSpreadPoint[];
  score_history: OBVDetailScorePoint[];
}

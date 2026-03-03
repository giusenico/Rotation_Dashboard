export interface PricePoint {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adj_close: number | null;
  volume: number | null;
}

export interface PriceResponse {
  symbol: string;
  name: string;
  data: PricePoint[];
}

export interface PerformanceEntry {
  ticker: string;
  name: string;
  category: string;
  return_1w: number | null;
  return_1m: number | null;
  return_3m: number | null;
  return_6m: number | null;
  return_ytd: number | null;
  return_1y: number | null;
}

export interface CorrelationResponse {
  symbols: string[];
  matrix: number[][];
}

export interface DrawdownPoint {
  date: string;
  drawdown: number;
}

export interface DrawdownResponse {
  symbol: string;
  name: string;
  data: DrawdownPoint[];
}

export interface TickerInfo {
  symbol: string;
  name: string;
  category: string;
  currency: string | null;
  exchange: string | null;
}

export interface DashboardSummary {
  total_tickers: number;
  latest_date: string;
  sector_leader: import("./rrg").RankingEntry | null;
  cross_asset_leader: import("./rrg").RankingEntry | null;
  sp500_return_ytd: number | null;
}

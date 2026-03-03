export interface RRGPoint {
  ticker: string;
  name: string;
  date: string;
  ratio: number;
  momentum: number;
}

export interface RRGResponse {
  benchmark: string;
  benchmark_name: string;
  as_of_date: string;
  trail_length: number;
  tickers: string[];
  data: RRGPoint[];
}

export interface RankingEntry {
  rank: number;
  ticker: string;
  name: string;
  category: string;
  ratio: number;
  momentum: number;
  score: number;
  quadrant: string;
}

/** Consistent color palette for each ticker across all charts. */
export const TICKER_COLORS: Record<string, string> = {
  // Sector ETFs
  XLF: "#FF6B6B",
  XLV: "#4ECDC4",
  XLY: "#FFE66D",
  XLC: "#95E1D3",
  XLE: "#F38181",
  XLI: "#AA96DA",
  XLK: "#58A6FF",
  XLU: "#FCBAD3",
  XLB: "#C4E538",
  XLRE: "#E77F67",
  XLP: "#786FA6",
  // Cross-asset ETFs
  BND: "#A8E6CF",
  IEF: "#88D8B0",
  TLT: "#6FC3DF",
  SPYV: "#FF8C94",
  SPEU: "#91A6FF",
  EEMA: "#FFD93D",
  ILF: "#C9B1FF",
  QQQ: "#6BCB77",
  EWJ: "#FF6B6B",
  IWM: "#4D96FF",
  GLD: "#FFD700",
  SLV: "#C0C0C0",
  SPYG: "#52B788",
  IBIT: "#F7931A",
};

/** Fallback color for unknown tickers. */
export function getTickerColor(ticker: string): string {
  return TICKER_COLORS[ticker] ?? "#8b949e";
}

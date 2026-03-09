export type DisplayCategory = "Sectors" | "Bonds" | "Equities" | "Commodities" | "Crypto";

const BACKEND_TO_DISPLAY_CATEGORY: Record<string, DisplayCategory> = {
  "Sector ETF": "Sectors",
  "Bond ETF": "Bonds",
  "Equity ETF": "Equities",
  "Commodity ETF": "Commodities",
  "Crypto ETF": "Crypto",
};

const DISPLAY_ORDER: DisplayCategory[] = ["Sectors", "Bonds", "Equities", "Commodities", "Crypto"];

export type TickerCategoryBuckets = Record<string, string[]>;

export function buildDisplayCategoryBuckets(
  byCategory: Record<string, string[]> | undefined,
  includeSectors = true,
): TickerCategoryBuckets {
  const buckets: TickerCategoryBuckets = {};

  for (const [backendCategory, symbols] of Object.entries(byCategory ?? {})) {
    const displayCategory = BACKEND_TO_DISPLAY_CATEGORY[backendCategory];
    if (!displayCategory) {
      continue;
    }

    const cleaned = (symbols ?? []).filter((symbol): symbol is string => !!symbol);
    buckets[displayCategory] = [...(buckets[displayCategory] ?? []), ...cleaned];
  }

  if (!includeSectors) {
    delete buckets.Sectors;
  }

  const orderedBuckets: TickerCategoryBuckets = {};
  for (const category of DISPLAY_ORDER) {
    const symbols = Array.from(new Set(buckets[category] ?? []));
    symbols.sort();
    if (symbols.length > 0) {
      orderedBuckets[category] = symbols;
    }
  }

  return orderedBuckets;
}

/** Format a number as a percentage string, e.g. 12.34 -> "+12.34%" */
export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Format a number with fixed decimals. */
export function formatNum(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return value.toFixed(decimals);
}

/** Format an ISO date string to a readable format. */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

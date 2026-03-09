export function assignQuadrant(ratio: number, momentum: number): string {
  if (ratio >= 100 && momentum >= 100) return "Leading";
  if (ratio >= 100 && momentum < 100) return "Weakening";
  if (ratio < 100 && momentum < 100) return "Lagging";
  return "Improving";
}

export function spanToHuman(span: number, tf: string): string {
  if (tf === "4h") {
    const days = (span * 4) / 6.5;
    return days < 1 ? `~${Math.round(span * 4)}h` : `~${Math.round(days)}d`;
  }
  if (tf === "daily") return `${span}d`;
  return `${span}w`;
}

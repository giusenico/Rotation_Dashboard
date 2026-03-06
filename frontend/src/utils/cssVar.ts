/** Read a CSS custom property value from :root (for Plotly configs that can't use var()). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

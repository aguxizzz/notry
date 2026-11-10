// Helper for ChartTooltip, in its own file because a .jsx that exports
// non-components breaks Vite's fast refresh (react-refresh lint rule).

/** Picks ChartTooltip's `align` from where x falls in its chart (0..1), so tooltips at the edges stay readable. */
export function alignFor(fraction) {
  if (fraction < 0.2) return 'start';
  if (fraction > 0.8) return 'end';
  return 'center';
}

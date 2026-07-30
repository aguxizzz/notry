export function getHeatColor(clicks, maxClicks) {
  if (maxClicks === 0) return 'rgb(245, 240, 232)';
  const ratio = clicks / maxClicks;
  const r = Math.round(245 + (197 - 245) * ratio);
  const g = Math.round(240 + (160 - 240) * ratio);
  const b = Math.round(232 + (89 - 232) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

export function getHeatGradient() {
  const stops = [0, 0.2, 0.4, 0.6, 0.8, 1];
  return `linear-gradient(90deg, ${stops.map((ratio) => getHeatColor(ratio, 1)).join(', ')})`;
}

export function getTextColor(clicks, maxClicks) {
  // Resolves to hardcoded values because CSS variables in inline SVG styles don't resolve.
  // --color-text-muted: #4b5563  --text-main: #1a1a2a
  if (maxClicks === 0) return '#4b5563';
  return '#1a1a2a';
}

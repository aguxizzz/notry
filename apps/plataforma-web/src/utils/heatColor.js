export function getHeatColor(clicks, maxClicks) {
  if (maxClicks === 0) return 'rgb(245, 240, 232)';
  const ratio = clicks / maxClicks;
  const r = Math.round(245 + (197 - 245) * ratio);
  const g = Math.round(240 + (160 - 240) * ratio);
  const b = Math.round(232 + (89 - 232) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

export function getTextColor(clicks, maxClicks) {
  if (maxClicks === 0) return 'var(--text-muted)';
  return clicks / maxClicks > 0.55 ? '#1a1a2a' : 'var(--text-main)';
}
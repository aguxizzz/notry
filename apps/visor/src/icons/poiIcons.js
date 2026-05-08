/**
 * SVG path data for POI icon types.
 * Using simple filled-circle markers for reliability.
 * Each icon_type maps to a single SVG circle marker at center.
 */

export const POI_ICON_MARKERS = {
  entrance: 'M10 9V4H5v5h3v6h2V9z',   // door
  gym: 'M6.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm11 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM3 18V6M21 18V6M7 11v3M17 11v3M7 11h10', // dumbbell
  pool: 'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 1 2.5 1M2 17c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 1 2.5 1M2 7c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 1 2.5 1', // waves
  parking: 'M4 4h16v16H4zM4 9h16M9 17V7h4a3 3 0 0 1 0 6H9', // parking
  restaurant: 'M3 2v14h18V2M3 16a3 3 0 1 3 3 3 3 0 0 0 3-3zM15 13a3 3 0 1 3 3 3 3 0 0 0 3-3zM18 2h1v16h-1', // utensils
  shop: 'M16 10a4 4 0 0 1-8 0M3.103 6.034h17.794M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z', // shopping bag
  view: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0', // eye
  park: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10zM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12', // tree
  landmark: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', // landmark
  other: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01', // help circle
};
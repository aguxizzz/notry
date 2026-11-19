// Real location of a POI (latitude/longitude), typed in its inspector. Parses
// what people actually paste: bare coordinates or a Google Maps link. The
// visor's 3D map uses it to place the places outside the loteo.

const inRange = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)
  && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * { lat, lng } from pasted text, or null if there's nothing usable.
 * Google Maps links carry the place's own pin as `!3d<lat>!4d<lng>`, which
 * beats `@lat,lng` (that one is the map's center, not the place), so it's
 * tried first. Short links (maps.app.goo.gl) don't carry coordinates at all.
 */
export function parseLocation(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|query|ll|destination)=${num},\\s*${num}`),
    // Bare "lat, lng" (what Google Maps copies on right click), also with ; or space.
    new RegExp(`^${num}\\s*[,;\\s]\\s*${num}$`),
  ];
  for (const re of patterns) {
    const m = s.replace(/%2C/gi, ',').match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (inRange(lat, lng)) return { lat, lng };
  }
  return null;
}

/** True for share links that need opening first to see the coordinates. */
export const isShortMapsLink = text => /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(String(text ?? ''));

/** "-31.420100, -64.188800": 6 decimals is ~10 cm, more is noise. */
export const formatLocation = (lat, lng) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

/** Straight-line distance in meters (haversine), to sanity-check a pasted spot. */
export function distanceMeters(a, b) {
  const R = 6371000;
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

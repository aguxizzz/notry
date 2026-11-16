// Manzanas and calles drawn in the editor's satellite view (Loteo.geo_surfaces),
// brought from blueprint coordinates to the 3D map. They're stored in the
// blueprint, like the lots, so recalibrating moves them together; here the
// geo calibration pairs give the blueprint → (lng, lat) homography.
// Shared with the editor through @map3d (geoHomography).
import { applyHomography, computeHomography, isHomographyValid } from './homography.js';
import { buildStreetRibbon, unionStreetAreas } from './streetRibbon.js';

export const MIN_GEO_PAIRS = 4;

/**
 * Homography blueprint [0,1]² → (lng, lat) from the geo calibration pairs
 * `{ blueprint: [nx, ny], geo: [lat, lng] }`, or null if there are too few
 * pairs or it comes out invalid.
 */
export function geoHomography(geoPoints) {
  if (!Array.isArray(geoPoints) || geoPoints.length < MIN_GEO_PAIRS) return null;
  // The homography works in (x, y) = (lng, lat); the pairs store [lat, lng].
  const H = computeHomography(geoPoints.map(p => ({ src: p.blueprint, dst: [p.geo[1], p.geo[0]] })));
  return isHomographyValid(H) ? H : null;
}

/**
 * Manzanas and calles as rings in the map's local meters, ready to fill:
 * { manzanas: [ring], calles: [{ outer, holes }] }, rings as [[x, z], ...].
 * Calles are built here in meters (their width is in meters) and merged, so
 * crossing calles read as one street network. Empty if the loteo has no
 * surfaces or no valid calibration.
 *
 * `toLocal(lat, lng)` is the scene's projection ({ x, z } in meters).
 */
export function geoSurfaceRings(geoSurfaces, geoPoints, toLocal) {
  const empty = { manzanas: [], calles: [] };
  const H = geoHomography(geoPoints);
  if (!H || !geoSurfaces) return empty;
  const toMeters = (point) => {
    const [lng, lat] = applyHomography(H, point);
    const { x, z } = toLocal(lat, lng);
    return [x, z];
  };
  const manzanas = (geoSurfaces.manzanas ?? [])
    .filter(m => m.points?.length >= 3)
    .map(m => m.points.map(toMeters));
  const ribbons = (geoSurfaces.calles ?? [])
    .filter(c => c.axis?.length >= 2 && c.width > 0)
    .map(c => buildStreetRibbon(c.axis.map(toMeters), c.width));
  return { manzanas, calles: unionStreetAreas(ribbons) };
}

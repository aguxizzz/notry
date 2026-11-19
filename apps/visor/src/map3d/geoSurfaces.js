// Manzanas, calles, verdes, agua and perímetro drawn in the editor's satellite view
// (Loteo.geo_surfaces), brought from blueprint coordinates to the 3D map. They're stored in the
// blueprint, like the lots, so recalibrating moves them together; here the
// geo calibration pairs give the blueprint → (lng, lat) homography.
// Shared with the editor through @map3d (geoHomography).
import { applyHomography, computeHomography, invertHomography, isHomographyValid } from './homography.js';
import { naturalShape } from './naturalOutline.js';
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
 * Returns lot → its outline as [[lat, lng], ...], or null if it can't go on the map.
 * With a valid calibration the lot is placed from its blueprint outline, like
 * the editor's satellite view and like the manzanas/calles: the saved
 * geo_coordinates are only refreshed by hand in the editor ("Actualizar
 * polígonos satelitales") and fall behind after a recalibration or a vertex
 * edit. They're still the fallback for a lot without a blueprint outline.
 */
export function lotGeoRing(geoPoints) {
  const H = geoHomography(geoPoints);
  return (lot) => {
    if (H && lot.blueprint_coordinates?.length >= 3) {
      return lot.blueprint_coordinates.map((point) => {
        const [lng, lat] = applyHomography(H, point);
        return [lat, lng];
      });
    }
    return lot.geo_coordinates?.length >= 3 ? lot.geo_coordinates : null;
  };
}

/**
 * Both ends of every calle's axis, in the map's local meters ([{ x, z }]).
 * A calle that runs out to the loteo's edge ends there, so these are the
 * candidates for where a route to a place outside leaves the loteo
 * (poiLayer.js). Empty without calles or a valid calibration.
 */
export function streetEnds(geoSurfaces, geoPoints, toLocal) {
  const H = geoHomography(geoPoints);
  if (!H) return [];
  const toMeters = (point) => {
    const [lng, lat] = applyHomography(H, point);
    return toLocal(lat, lng);
  };
  return (geoSurfaces?.calles ?? [])
    .filter(c => c.axis?.length >= 2)
    .flatMap(c => [toMeters(c.axis[0]), toMeters(c.axis[c.axis.length - 1])]);
}

/**
 * The loteo's texts (geo_surfaces.textos, placed on the blueprint) as
 * createTextLayer items: each text with its `point` turned into the map's
 * local meters ({ ...text, x, z }). The angle needs no conversion: the editor
 * already stores it on the map's ground (degrees from east towards south).
 * Empty without texts or a valid calibration.
 */
export function geoTextItems(geoSurfaces, geoPoints, toLocal) {
  const H = geoHomography(geoPoints);
  if (!H) return [];
  return (geoSurfaces?.textos ?? [])
    .filter(t => t.point?.length === 2)
    .map((t) => {
      const [lng, lat] = applyHomography(H, t.point);
      return { ...t, ...toLocal(lat, lng) };
    });
}

/**
 * The loteo's surfaces as rings in the map's local meters, ready to fill:
 * { manzanas, perimetros: [ring], calles, verdes, aguas: [{ outer, holes }] }, rings as
 * [[x, z], ...]. Calles are built here in meters (their width is in meters)
 * and merged, so crossing calles read as one street network. Empty if the
 * loteo has no surfaces or no valid calibration.
 *
 * Verdes and agua get the editor's natural border (naturalShape), worked out
 * in blueprint coordinates like the editor does so they come out the same
 * shape, kept off the calles and `lotRings` (lot outlines in the blueprint).
 *
 * `projection` = the scene's { toLocal(lat, lng) → { x, z }, toGeo(x, z) → { lat, lng } }.
 */
export function geoSurfaceRings(geoSurfaces, geoPoints, projection, lotRings = []) {
  const empty = { manzanas: [], calles: [], verdes: [], aguas: [], perimetros: [] };
  const H = geoHomography(geoPoints);
  if (!H || !geoSurfaces) return empty;
  const { toLocal, toGeo } = projection;
  const toMeters = (point) => {
    const [lng, lat] = applyHomography(H, point);
    const { x, z } = toLocal(lat, lng);
    return [x, z];
  };
  // Plain polygons, taken as drawn (no natural border, no clipping).
  const polygons = list => (list ?? [])
    .filter(m => m.points?.length >= 3)
    .map(m => m.points.map(toMeters));
  const manzanas = polygons(geoSurfaces.manzanas);
  const ribbons = (geoSurfaces.calles ?? [])
    .filter(c => c.axis?.length >= 2 && c.width > 0)
    .map(c => buildStreetRibbon(c.axis.map(toMeters), c.width));

  // Each calle's outline back in the blueprint, as an obstacle for the
  // natural shapes (the editor's calleRing does the same round trip).
  const Hinv = invertHomography(H);
  const toBlueprint = ([x, z]) => {
    const { lat, lng } = toGeo(x, z);
    return applyHomography(Hinv, [lng, lat]);
  };
  const obstacles = [...ribbons.filter(r => r.length >= 3).map(r => r.map(toBlueprint)), ...lotRings];
  const natural = list => (list ?? [])
    .filter(a => a.points?.length >= 3)
    .flatMap(a => naturalShape(a.points, {
      curve: a.curve ?? 0, wobble: a.wobble ?? 0, seed: a.id, obstacles,
    }))
    .map(({ outer, holes }) => ({ outer: outer.map(toMeters), holes: holes.map(h => h.map(toMeters)) }));

  return {
    manzanas,
    calles: unionStreetAreas(ribbons),
    verdes: natural(geoSurfaces.verdes),
    aguas: natural(geoSurfaces.aguas),
    perimetros: polygons(geoSurfaces.perimetros),
  };
}

// Manzanas y calles del modo satélite/render, dibujadas en la calibración geo
// (sobre el plano o sobre el mapa, cualquiera de los dos). Se guardan en
// coordenadas del PLANO, como los lotes: si se recalibra, lotes y calles se
// mueven juntos. La homografía plano → (lng, lat) las lleva al mapa.
//
// Funciones puras sobre `{ manzanas, calles }`; useGeoSurfaces tiene el estado.
// Shapes:
//   manzana: { id, points: [[nx, ny], ...] }          — polígono del plano [0,1]²
//   calle:   { id, axis: [[nx, ny], ...], width }      — eje del plano + ancho en METROS
// Distinto de render_surfaces (modo Render del panorama), que está en pixeles
// del panorama y no sirve para el mapa.
import { makeProjection } from '@map3d/ground.js';
import { applyHomography } from './homography.js';
import {
  buildStreetRibbon, findAxisEndpointSnap, mergeStreetAxis, pointInPolygon, unionStreetAreas,
} from './streetPath.js';

export const EMPTY_GEO_SURFACES = { manzanas: [], calles: [] };
// Calle de loteo típica con veredas; se ajusta por calle desde la barra.
export const DEFAULT_STREET_WIDTH_M = 12;
export const MIN_STREET_WIDTH_M = 3;
export const MAX_STREET_WIDTH_M = 40;

export const minPointsFor = kind => (kind === 'calle' ? 2 : 3);

// Un click de calle a esta distancia (fracción del plano) de un vértice del eje
// de otra calle se pega a ese vértice. Mismo orden que el cierre de manzana.
export const AXIS_SNAP_DISTANCE = 0.012;

/** El punto pegado al vértice de eje más cercano, o el mismo punto si no hay ninguno cerca. */
export function snapToAxis(surfaces, point) {
  return findAxisEndpointSnap(point, surfaces.calles, null, AXIS_SNAP_DISTANCE)?.point ?? point;
}

export function normalizeGeoSurfaces(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY_GEO_SURFACES;
  return { manzanas: raw.manzanas ?? [], calles: raw.calles ?? [] };
}

/** Punto del plano → [lat, lng] con la homografía plano → (lng, lat). */
export function blueprintToGeo(H, point) {
  const [lng, lat] = applyHomography(H, point);
  return [lat, lng];
}

/** [lat, lng] → punto del plano, con la inversa de la homografía. */
export function geoToBlueprint(Hinv, [lat, lng]) {
  return applyHomography(Hinv, [lng, lat]);
}

/**
 * Contorno de una calle en coordenadas del plano. El ancho está en metros, así
 * que el contorno se arma en metros reales (plano local alrededor del primer
 * punto del eje) y se vuelve al plano con la inversa: en el plano el ancho
 * puede variar si el dibujo no está a escala, en el terreno no.
 */
export function calleRing(calle, H, Hinv) {
  if (!calle.axis || calle.axis.length < 2) return [];
  const axisGeo = calle.axis.map(p => blueprintToGeo(H, p));
  const { toLocal, toGeo } = makeProjection(axisGeo[0][0], axisGeo[0][1]);
  const meters = axisGeo.map(([lat, lng]) => {
    const { x, z } = toLocal(lat, lng);
    return [x, z];
  });
  return buildStreetRibbon(meters, calle.width).map(([x, z]) => {
    const { lat, lng } = toGeo(x, z);
    return geoToBlueprint(Hinv, [lat, lng]);
  });
}

/**
 * Contornos listos para dibujar, en el plano: [{ kind, id, ring }]. Las calles
 * van primero, así al buscar qué se clickeó una calle angosta gana sobre la
 * manzana que pueda tener debajo.
 */
export function surfaceRings(surfaces, H, Hinv) {
  if (!H || !Hinv) return [];
  return [
    ...surfaces.calles.map(c => ({ kind: 'calle', id: c.id, ring: calleRing(c, H, Hinv) })),
    ...surfaces.manzanas.map(m => ({ kind: 'manzana', id: m.id, ring: m.points })),
  ].filter(s => s.ring.length >= 3);
}

/**
 * Lo que se pinta: las calles fundidas en un contorno por grupo conectado
 * (con agujeros, ver unionStreetAreas), así dos calles que se cruzan se ven
 * como una sola red y no como dos capas con el borde de una sobre la otra.
 * Las manzanas van tal cual. [{ kind, id, ring, holes }]
 */
export function displayRings(rings) {
  const calles = unionStreetAreas(rings.filter(s => s.kind === 'calle').map(s => s.ring))
    .map(({ outer, holes }, i) => ({ kind: 'calle', id: `calles-${i}`, ring: outer, holes }));
  return [...calles, ...rings.filter(s => s.kind === 'manzana').map(s => ({ ...s, holes: [] }))];
}

/** La shape bajo un punto del plano, como { kind, id }, o null. */
export function findSurfaceAt(rings, point) {
  const hit = rings.find(s => pointInPolygon(point, s.ring));
  return hit ? { kind: hit.kind, id: hit.id } : null;
}

/**
 * Calle: si arranca en la punta del eje de otra calle, se continúa esa misma
 * (un solo eje, el quiebre queda curvado por el fillet, con el ancho de la
 * existente), como en el panorama. Si arranca en un vértice del medio queda
 * como calle aparte; la unión al pintar (displayRings) la funde visualmente.
 */
export function addSurface(surfaces, { kind, points, width, id = crypto.randomUUID() }) {
  if (points.length < minPointsFor(kind)) return surfaces;
  if (kind === 'calle') {
    const snap = findAxisEndpointSnap(points[0], surfaces.calles, null, AXIS_SNAP_DISTANCE);
    if (snap && snap.end !== 'interior') {
      return {
        ...surfaces,
        calles: surfaces.calles.map(c => (
          c.id === snap.shapeId ? { ...c, axis: mergeStreetAxis(c.axis, snap.end, points) } : c
        )),
      };
    }
    return { ...surfaces, calles: [...surfaces.calles, { id, axis: points, width }] };
  }
  return { ...surfaces, manzanas: [...surfaces.manzanas, { id, points }] };
}

const listOf = kind => (kind === 'calle' ? 'calles' : 'manzanas');

export function removeSurface(surfaces, { kind, id }) {
  const key = listOf(kind);
  return { ...surfaces, [key]: surfaces[key].filter(s => s.id !== id) };
}

export function setCalleWidth(surfaces, id, width) {
  return { ...surfaces, calles: surfaces.calles.map(c => (c.id === id ? { ...c, width } : c)) };
}

export const findCalle = (surfaces, id) => surfaces.calles.find(c => c.id === id) ?? null;

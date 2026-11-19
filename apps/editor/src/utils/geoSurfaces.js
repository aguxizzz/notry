// Manzanas y calles del modo satélite/render, dibujadas en la calibración geo
// (sobre el plano o sobre el mapa, cualquiera de los dos). Se guardan en
// coordenadas del PLANO, como los lotes: si se recalibra, lotes y calles se
// mueven juntos. La homografía plano → (lng, lat) las lleva al mapa.
//
// Funciones puras sobre `{ manzanas, calles }`; useGeoSurfaces tiene el estado.
// Shapes:
//   manzana, verde, agua, perímetro: { id, points: [[nx, ny], ...] } — polígono del plano [0,1]²
//   calle: { id, axis: [[nx, ny], ...], width }                     — eje del plano + ancho en METROS
// Distinto de render_surfaces (modo Render del panorama), que está en pixeles
// del panorama y no sirve para el mapa.
import { makeProjection } from '@map3d/ground.js';
import { naturalShape } from '@map3d/naturalOutline.js';
import { applyHomography } from './homography.js';
import {
  buildStreetRibbon, findAxisEndpointSnap, mergeStreetAxis, pointInPolygon, unionStreetAreas,
} from './streetPath.js';

// Las superficies que son polígonos y la lista donde se guarda cada una. Se
// dibujan todas igual (puntos + cerrar en el primero); cambia cómo las pinta
// el visor. El orden es el de prioridad al clickear: el perímetro, que suele
// envolver todo, va último para no tapar lo que tiene adentro.
export const AREA_KINDS = { manzana: 'manzanas', verde: 'verdes', agua: 'aguas', perimetro: 'perimetros' };
export const isAreaKind = kind => kind in AREA_KINDS;

// Verdes y agua llevan además `curve` y `wobble` (0..1): el borde se dibuja
// redondeado e irregular a partir de los clicks (naturalShape, compartido
// con el visor). Lo guardado siguen siendo los clicks, así se puede re-ajustar.
// Nunca pisan calles ni lotes: se recortan al dibujar (las manzanas no
// cuentan, una plaza puede estar dibujada adentro de una).
export const NATURAL_KINDS = new Set(['verde', 'agua']);
export const DEFAULT_NATURAL_SHAPE = { curve: 0.6, wobble: 0 };

/**
 * Las piezas de un polígono tal cual se ve, [{ outer, holes }]: los clicks, o
 * para verde/agua el borde natural recortado contra `obstacles` (contornos de
 * calles y lotes en el plano), que puede partirlo en varias o dejarle agujeros.
 */
export function areaPieces(kind, area, obstacles = []) {
  if (!NATURAL_KINDS.has(kind)) return [{ outer: area.points, holes: [] }];
  return naturalShape(area.points, {
    curve: area.curve ?? 0, wobble: area.wobble ?? 0, seed: area.id, obstacles,
  });
}

export const EMPTY_GEO_SURFACES = { manzanas: [], calles: [], verdes: [], aguas: [], perimetros: [] };
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
  // Loteos guardados antes de verdes/agua/perímetro no traen esas listas.
  return Object.fromEntries(Object.keys(EMPTY_GEO_SURFACES).map(key => [key, raw[key] ?? []]));
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
 * Contornos listos para dibujar, en el plano: [{ kind, id, ring, holes }]. Las
 * calles van primero, así al buscar qué se clickeó una calle angosta gana sobre
 * la manzana que pueda tener debajo; después los polígonos en el orden de
 * AREA_KINDS. Un verde/agua cortado por una calle aparece como varias entradas
 * con el mismo id, la más grande primero (es la que se marca al seleccionar).
 * `lotRings`: contornos de los lotes en el plano, para que verdes y agua no los pisen.
 */
export function surfaceRings(surfaces, H, Hinv, lotRings = []) {
  if (!H || !Hinv) return [];
  const calles = (surfaces.calles ?? [])
    .map(c => ({ kind: 'calle', id: c.id, ring: calleRing(c, H, Hinv), holes: [] }))
    .filter(s => s.ring.length >= 3);
  const obstacles = [...calles.map(c => c.ring), ...lotRings];
  return [
    ...calles,
    ...Object.entries(AREA_KINDS).flatMap(([kind, key]) => (
      (surfaces[key] ?? []).flatMap(a => (
        areaPieces(kind, a, obstacles).map(({ outer, holes }) => ({ kind, id: a.id, ring: outer, holes }))
      ))
    )),
  ].filter(s => s.ring.length >= 3);
}

/**
 * Lo que se pinta: las calles fundidas en un contorno por grupo conectado
 * (con agujeros, ver unionStreetAreas), así dos calles que se cruzan se ven
 * como una sola red y no como dos capas con el borde de una sobre la otra.
 * Los polígonos (manzanas, verdes...) van tal cual, con los agujeros que les
 * haya dejado el recorte. [{ kind, id, ring, holes }]
 */
export function displayRings(rings) {
  const calles = unionStreetAreas(rings.filter(s => s.kind === 'calle').map(s => s.ring))
    .map(({ outer, holes }, i) => ({ kind: 'calle', id: `calles-${i}`, ring: outer, holes }));
  return [...calles, ...rings.filter(s => s.kind !== 'calle').map(s => ({ ...s, holes: s.holes ?? [] }))];
}

// Distancia (fracción del plano) a la que un click agarra el borde del perímetro.
const EDGE_PICK_DISTANCE = 0.012;

function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const nearRingEdge = (ring, point) => ring.some((a, i) => (
  distanceToSegment(point, a, ring[(i + 1) % ring.length]) < EDGE_PICK_DISTANCE
));

// Qué gana cuando un click cae sobre varias shapes superpuestas: lo más chico
// y lo que suele ir dibujado adentro de otra cosa primero (un lote o un
// espejo de agua dentro de un verde, un verde dentro de una manzana). El
// orden en que vienen los contornos es el de pintado, no sirve para esto.
const PICK_PRIORITY = { lote: 0, agua: 1, verde: 2, calle: 3, manzana: 4, perimetro: 5 };

/**
 * La shape bajo un punto del plano, como { kind, id }, o null. `rings` puede
 * traer también los lotes (kind 'lote'). El perímetro se agarra solo por el
 * borde: envuelve todo el loteo, y si cualquier click de adentro lo
 * seleccionara no habría forma de clickear en vacío.
 */
export function findSurfaceAt(rings, point) {
  // sort es estable: dentro de un mismo tipo se respeta el orden original
  // (el pedazo más grande de un verde cortado sigue yendo primero).
  const byPriority = [...rings].sort((a, b) => (PICK_PRIORITY[a.kind] ?? 9) - (PICK_PRIORITY[b.kind] ?? 9));
  const hit = byPriority.find(s => (
    s.kind === 'perimetro'
      ? nearRingEdge(s.ring, point)
      // Un click en el agujero que un lote le dejó a un verde no es el verde.
      : pointInPolygon(point, s.ring) && !(s.holes ?? []).some(h => pointInPolygon(point, h))
  ));
  return hit ? { kind: hit.kind, id: hit.id } : null;
}

/**
 * Calle: si arranca en la punta del eje de otra calle, se continúa esa misma
 * (un solo eje, el quiebre queda curvado por el fillet, con el ancho de la
 * existente), como en el panorama. Si arranca en un vértice del medio queda
 * como calle aparte; la unión al pintar (displayRings) la funde visualmente.
 */
export function addSurface(surfaces, { kind, points, width, natural = DEFAULT_NATURAL_SHAPE, id = crypto.randomUUID() }) {
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
  const key = AREA_KINDS[kind];
  if (!key) return surfaces;
  const area = NATURAL_KINDS.has(kind) ? { id, points, curve: natural.curve, wobble: natural.wobble } : { id, points };
  return { ...surfaces, [key]: [...(surfaces[key] ?? []), area] };
}

const listOf = kind => (kind === 'calle' ? 'calles' : AREA_KINDS[kind]);

export function removeSurface(surfaces, { kind, id }) {
  const key = listOf(kind);
  return { ...surfaces, [key]: (surfaces[key] ?? []).filter(s => s.id !== id) };
}

export function setCalleWidth(surfaces, id, width) {
  return { ...surfaces, calles: surfaces.calles.map(c => (c.id === id ? { ...c, width } : c)) };
}

export const findCalle = (surfaces, id) => surfaces.calles.find(c => c.id === id) ?? null;

/** Cambia `curve` y/o `wobble` de un verde o agua. */
export function setAreaShape(surfaces, { kind, id }, patch) {
  const key = AREA_KINDS[kind];
  return { ...surfaces, [key]: surfaces[key].map(a => (a.id === id ? { ...a, ...patch } : a)) };
}

/** El verde/agua seleccionado, o null si la selección es otra cosa. */
export function findNaturalArea(surfaces, selected) {
  if (!selected || !NATURAL_KINDS.has(selected.kind)) return null;
  return surfaces[AREA_KINDS[selected.kind]]?.find(a => a.id === selected.id) ?? null;
}

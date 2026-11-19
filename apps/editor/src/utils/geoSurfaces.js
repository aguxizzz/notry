// Manzanas y calles del modo satélite/render, dibujadas en la calibración geo
// (sobre el plano o sobre el mapa, cualquiera de los dos). Se guardan en
// coordenadas del PLANO, como los lotes: si se recalibra, lotes y calles se
// mueven juntos. La homografía plano → (lng, lat) las lleva al mapa.
//
// Funciones puras sobre `{ manzanas, calles }`; useGeoSurfaces tiene el estado.
// Shapes:
//   manzana, verde, agua, perímetro: { id, points: [[nx, ny], ...] } — polígono del plano [0,1]²
//   calle: { id, axis: [[nx, ny], ...], width }                     — eje del plano + ancho en METROS
//   texto: { id, point: [nx, ny], text, size, angle, font, color, outline } — tamaño en METROS,
//          ángulo en grados sobre el terreno (null = siempre derecho, gira con la cámara),
//          font de TEXT_FONTS, color hex, outline de TEXT_OUTLINES (ver @map3d/textLayer.js),
//          flipX/flipY espejan el texto
//   amenity: { id, points, form, name, icon, floors?, material?, sport? } — polígono del plano
//          con una de las formas genéricas de @map3d/amenities.js (edificio con pisos, piso
//          con material, cancha con deporte), nombre libre e ícono de AMENITY_ICONS
// Distinto de render_surfaces (modo Render del panorama), que está en pixeles
// del panorama y no sirve para el mapa.
import { makeProjection } from '@map3d/ground.js';
import { naturalShape } from '@map3d/naturalOutline.js';
import {
  DEFAULT_AMENITY_FORM, DEFAULT_AMENITY_MATERIAL, DEFAULT_AMENITY_SPORT, amenityColor,
} from '@map3d/amenities.js';
import { DEFAULT_TEXT_COLOR, DEFAULT_TEXT_FONT, DEFAULT_TEXT_OUTLINE, textBox } from '@map3d/textLayer.js';
import { applyHomography } from './homography.js';
import {
  buildStreetRibbon, findAxisEndpointSnap, mergeStreetAxis, pointInPolygon, unionStreetAreas,
} from './streetPath.js';

// Las superficies que son polígonos y la lista donde se guarda cada una. Se
// dibujan todas igual (puntos + cerrar en el primero); cambia cómo las pinta
// el visor. El orden es el de pintado; qué gana al clickear lo decide PICK_PRIORITY.
export const AREA_KINDS = {
  manzana: 'manzanas', verde: 'verdes', agua: 'aguas', amenity: 'amenities', perimetro: 'perimetros',
};
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

export const EMPTY_GEO_SURFACES = {
  manzanas: [], calles: [], verdes: [], aguas: [], perimetros: [], textos: [], amenities: [],
};
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
        areaPieces(kind, a, obstacles).map(({ outer, holes }) => ({
          kind, id: a.id, ring: outer, holes,
          // Cada amenity tiene su color (techo, material o cancha); el resto va por tipo.
          ...(kind === 'amenity' ? { color: amenityColor(a) } : {}),
        }))
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
// espejo de agua dentro de un verde, una cancha dentro de una plaza, un verde
// dentro de una manzana). El orden en que vienen los contornos es el de
// pintado, no sirve para esto.
const PICK_PRIORITY = { lote: 0, amenity: 1, agua: 2, verde: 3, calle: 4, manzana: 5, perimetro: 6 };

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
  const area = NATURAL_KINDS.has(kind) ? { id, points, curve: natural.curve, wobble: natural.wobble }
    : kind === 'amenity' ? newAmenity(id, points)
      : { id, points };
  return { ...surfaces, [key]: [...(surfaces[key] ?? []), area] };
}

// Amenities caen en AREA_KINDS como los demás polígonos.
const listOf = kind => (kind === 'calle' ? 'calles' : kind === 'texto' ? 'textos' : AREA_KINDS[kind]);

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

// --- Amenities: club house, guardia, canchas, estacionamiento... (ver @map3d/amenities.js).

/**
 * Amenity recién cerrada: edificio de 1 piso sin nombre ni ícono. Lleva los
 * campos de las tres formas, así cambiar de forma en el inspector no pierde
 * lo elegido en otra (pasar a Piso y volver a Edificio mantiene los pisos).
 */
function newAmenity(id, points) {
  return {
    id, points, form: DEFAULT_AMENITY_FORM, name: '', icon: null,
    floors: 1, material: DEFAULT_AMENITY_MATERIAL, sport: DEFAULT_AMENITY_SPORT,
  };
}

export const findAmenity = (surfaces, id) => (surfaces.amenities ?? []).find(a => a.id === id) ?? null;

/** Cambia campos de una amenity (form, name, icon, floors, material, sport). */
export function updateAmenity(surfaces, id, patch) {
  return { ...surfaces, amenities: (surfaces.amenities ?? []).map(a => (a.id === id ? { ...a, ...patch } : a)) };
}

/**
 * Dónde va la etiqueta (ícono + nombre) de un polígono del plano: el
 * centroide de su área. En una forma cóncava (una L) el centroide puede caer
 * afuera; ahí se usa el medio del tramo más ancho del polígono a esa misma
 * altura, que siempre está adentro. Si el área da 0 (puntos alineados), el promedio.
 */
export function polygonLabelPoint(points) {
  const c = areaCentroid(points);
  if (pointInPolygon(c, points)) return c;
  // Cruces de la horizontal y = c[1] con los lados, ordenados: entre cada par
  // (1º-2º, 3º-4º...) la recta va por adentro.
  const xs = [];
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    if ((y0 > c[1]) !== (y1 > c[1])) xs.push(x0 + ((c[1] - y0) * (x1 - x0)) / (y1 - y0));
  });
  xs.sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  }
  return best ? [(best[0] + best[1]) / 2, c[1]] : c;
}

function areaCentroid(points) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  });
  if (Math.abs(a) < 1e-12) {
    return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

// --- Textos: nombres de calles y zonas escritos sobre el mapa.

// Tamaño = alto de la letra en metros (crece y se achica con el zoom, como
// los números de los lotes, que miden 3,2 m). 8 m entra en una calle de 12.
export const DEFAULT_TEXT_SIZE_M = 8;
export const MIN_TEXT_SIZE_M = 2;
export const MAX_TEXT_SIZE_M = 60;
export const MAX_TEXT_LENGTH = 80; // mismo tope que el schema del back

/**
 * Agrega un texto en `point` (plano) y devuelve { surfaces, id }. Si cae
 * sobre una calle (`angle` no null) sale alineado con ella; si no, siempre
 * derecho. Arranca sin contorno y con color automático (claro en satélite,
 * oscuro en render).
 */
export function addText(surfaces, { point, angle = null, text = 'Texto', id = crypto.randomUUID() }) {
  const texto = {
    id, point, text, size: DEFAULT_TEXT_SIZE_M, angle,
    font: DEFAULT_TEXT_FONT, color: DEFAULT_TEXT_COLOR, outline: DEFAULT_TEXT_OUTLINE,
  };
  return { surfaces: { ...surfaces, textos: [...(surfaces.textos ?? []), texto] }, id };
}

/** Cambia campos de un texto (text, size, angle, font, color, outline, point). */
export function updateText(surfaces, id, patch) {
  return { ...surfaces, textos: (surfaces.textos ?? []).map(t => (t.id === id ? { ...t, ...patch } : t)) };
}

/** Las superficies sin los textos vacíos, para guardar. */
export function withoutEmptyTexts(surfaces) {
  return { ...surfaces, textos: (surfaces.textos ?? []).filter(t => t.text?.trim()) };
}

export const findText = (surfaces, id) => (surfaces.textos ?? []).find(t => t.id === id) ?? null;

/**
 * Ángulo de una recta en grados, llevado a (-90, 90]: una calle no tiene
 * sentido, y así el texto que se le alinea arranca leyéndose de izquierda a
 * derecha con el norte arriba. Después se gira libre (wrapTextAngle).
 */
export function normalizeTextAngle(deg) {
  let a = ((deg % 180) + 180) % 180; // [0, 180)
  if (a > 90) a -= 180;
  return Math.round(a * 10) / 10;
}

/** Cualquier ángulo en grados llevado a (-180, 180], para el giro libre del texto. */
export function wrapTextAngle(deg) {
  let a = ((((deg + 180) % 360) + 360) % 360) - 180; // [-180, 180)
  if (a === -180) a = 180;
  return Math.round(a * 10) / 10;
}

// Lo que se corre un texto pegado o duplicado respecto del original, en
// fracciones de su tamaño hacia el sureste: se ve al lado y no encima.
const PASTE_OFFSET = 1.2;

/**
 * Agrega una copia de `texto` (de este u otro loteo, viene del portapapeles
 * interno) corrida un poco, y devuelve { surfaces, id }. El corrimiento se
 * hace en metros, así es el mismo aunque el plano esté estirado.
 */
export function pasteText(surfaces, texto, H, Hinv, id = crypto.randomUUID()) {
  let point = texto.point;
  if (H && Hinv) {
    const [lat, lng] = blueprintToGeo(H, texto.point);
    const d = texto.size * PASTE_OFFSET;
    // toGeo(x, z) con origen en el original: x al este, z al sur.
    const moved = makeProjection(lat, lng).toGeo(d, d);
    point = geoToBlueprint(Hinv, [moved.lat, moved.lng]);
  }
  const copy = { ...texto, id, point };
  return { surfaces: { ...surfaces, textos: [...(surfaces.textos ?? []), copy] }, id };
}

/**
 * Si `point` (plano) cae sobre una calle, el ángulo del tramo del eje más
 * cercano, medido en el terreno (metros, no en el plano, que puede estar
 * deformado), en grados desde el este hacia el sur. null si no hay calle ahí.
 * `calleRings`: [{ id, ring }] en el plano, como los arma surfaceRings.
 */
export function calleAngleAt(surfaces, calleRings, point, H) {
  const hit = calleRings.find(r => pointInPolygon(point, r.ring));
  const calle = hit && findCalle(surfaces, hit.id);
  if (!calle || !H) return null;
  let best = null;
  for (let i = 0; i < calle.axis.length - 1; i += 1) {
    const d = distanceToSegment(point, calle.axis[i], calle.axis[i + 1]);
    if (!best || d < best.d) best = { d, a: calle.axis[i], b: calle.axis[i + 1] };
  }
  const [latA, lngA] = blueprintToGeo(H, best.a);
  const [latB, lngB] = blueprintToGeo(H, best.b);
  const { toLocal } = makeProjection(latA, lngA);
  const end = toLocal(latB, lngB); // el inicio del tramo es el origen (0, 0)
  // x = este, z = sur: atan2(z, x) es el ángulo "desde el este hacia el sur" que usa textLayer.
  return normalizeTextAngle((Math.atan2(end.z, end.x) * 180) / Math.PI);
}

/**
 * El id del texto bajo `point` (plano), o null. Se mide en metros alrededor de
 * cada texto, con la caja de sus letras girada según su ángulo; los que giran
 * con la cámara se toman con un círculo, porque su orientación depende de la vista.
 * Los últimos agregados van arriba, así que se buscan de atrás para adelante.
 * `boxOf(text, size, font)` → { halfW, halfH } (se inyecta en los tests, sin canvas).
 */
export function findTextAt(textos, point, H, boxOf = textBox) {
  if (!H || !textos?.length) return null;
  const [lat, lng] = blueprintToGeo(H, point);
  for (let i = textos.length - 1; i >= 0; i -= 1) {
    const t = textos[i];
    const [tLat, tLng] = blueprintToGeo(H, t.point);
    const { x, z } = makeProjection(tLat, tLng).toLocal(lat, lng);
    const { halfW, halfH } = boxOf(t.text, t.size, t.font);
    if (t.angle == null) {
      if (Math.hypot(x, z) <= Math.max(halfW, halfH)) return t.id;
      continue;
    }
    // Al marco del texto: u a lo largo de la línea, v a lo ancho.
    const a = (t.angle * Math.PI) / 180;
    const u = x * Math.cos(a) + z * Math.sin(a);
    const v = -x * Math.sin(a) + z * Math.cos(a);
    if (Math.abs(u) <= halfW && Math.abs(v) <= halfH) return t.id;
  }
  return null;
}

// Modelo de una anotación del editor (lote, POI, texto) — un solo lugar que
// sabe dónde vive la geometría de cada una.
//
// Fuente de verdad de la geometría: `panorama_coordinates` (pixeles de
// textura del panorama) y `blueprint_coordinates` (plano normalizado [0,1]).
// Una forma puede tener una, la otra o las dos. `polygonPixels` NO se guarda
// en el estado: es la geometría de la vista actual y la calcula
// `toModeAnnotation` al momento de mostrar.
//
// Los POI "callout" (pin con tallo) no tienen polígono sino un ancla por vista
// (`panorama_anchor` / `blueprint_anchor`).

/** Vista de edición → espacio de coordenadas. 'render' dibuja sobre el panorama. */
export const spaceForMode = mode => (mode === 'blueprint' ? 'blueprint' : 'panorama');

export const coordsKey = mode => (
  spaceForMode(mode) === 'blueprint' ? 'blueprint_coordinates' : 'panorama_coordinates'
);

export const anchorKey = mode => (
  spaceForMode(mode) === 'blueprint' ? 'blueprint_anchor' : 'panorama_anchor'
);

/** Lotes y POIs de área: geometría poligonal por vista. */
export const isShape = ann => ann?.type === 'polygon' || ann?.type === 'poi';

/** POI pin-con-tallo (el backend lo llama `marker_variant`, el editor `variant`). */
export const isCallout = ann => ann?.variant === 'callout' || ann?.marker_variant === 'callout';

/**
 * Geometría de una forma en la vista `mode`. Si la anotación no tiene ninguna
 * de las dos claves de coordenadas (borradores viejos de localStorage, que
 * guardaban solo `polygonPixels`), cae a `polygonPixels` para no perderla.
 */
export function getShapeCoords(ann, mode) {
  if (!ann) return [];
  if (ann.panorama_coordinates || ann.blueprint_coordinates) {
    return ann[coordsKey(mode)] ?? [];
  }
  return ann.polygonPixels ?? [];
}

/** Devuelve la anotación con su geometría de la vista `mode` reemplazada. */
export function withShapeCoords(ann, mode, coords) {
  const { polygonPixels: _legacy, ...rest } = ann;
  return { ...rest, [coordsKey(mode)]: coords };
}

export const getAnchor = (ann, mode) => ann?.[anchorKey(mode)] ?? null;

export function withAnchor(ann, mode, point) {
  return { ...ann, [anchorKey(mode)]: point };
}

/** True si la anotación tiene ubicación en la vista `mode`. */
export function hasLocationIn(ann, mode) {
  if (isCallout(ann)) return Boolean(getAnchor(ann, mode));
  return (ann?.[coordsKey(mode)]?.length ?? 0) > 0;
}

/**
 * Lo que el visor/plano necesita para pintar `ann` en la vista `mode`: las
 * formas llevan `polygonPixels` con la geometría de esa vista.
 */
export function toModeAnnotation(ann, mode) {
  if (!isShape(ann) || isCallout(ann)) return ann;
  return { ...ann, polygonPixels: getShapeCoords(ann, mode) };
}

const PENDING_LOT_STYLE = {
  fill: 'rgba(255,165,0,0.15)', stroke: '#ffa500', strokeWidth: '2', strokeDasharray: '8,4',
};

/**
 * Lote recién dibujado (polígono, rectángulo o autodetección) que todavía no
 * existe en el backend: queda `pending` hasta "Crear lote" / "Asignar
 * existente". Su geometría se guarda en la vista donde se dibujó.
 */
export function newPendingLot({ id, mode, coords, ...extra }) {
  return withShapeCoords({
    id,
    type: 'polygon',
    pending: true,
    tooltip: '',
    svgStyle: PENDING_LOT_STYLE,
    ...extra,
  }, mode, coords);
}

/** Anotación tal como llega de `visor_data` → forma del estado del editor. */
export function normalizeApiAnnotation(apiAnnotation, index) {
  const { polygonPixels: _legacy, ...rest } = apiAnnotation;
  return {
    ...rest,
    id: apiAnnotation.id ?? apiAnnotation.uuid ?? `ann-${index}`,
    variant: apiAnnotation.marker_variant ?? apiAnnotation.variant ?? 'area',
  };
}

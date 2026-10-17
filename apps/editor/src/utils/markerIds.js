// Ids de los markers que el editor genera para mostrar (no son anotaciones
// guardadas): handles de edición, puntos de calibración, polígonos fantasma,
// trazos en curso y superficies de Render. Los ids se arman y se leen solo
// desde acá, así renombrar un prefijo no rompe en silencio a otro archivo.
//
// Formato de los ids "indexados": `${prefijo}${dueño}-${índice}`. El dueño
// puede contener guiones (UUIDs), por eso el índice se separa por el ÚLTIMO.

const PSV_DOM_PREFIX = 'psv-marker-';

export const PREFIX = {
  calibPoint: 'calib-pt-',
  calibPending: 'calib-pending-',
  ghost: 'ghost-',
  tempPoint: 'temp-pt-',
  editCorner: 'edit-corner-',
  editMidpoint: 'edit-midpoint-',
  streetAxis: 'streetaxis-',
  streetAxisMid: 'streetaxismid-',
  surfaceCalle: 'surfacetest-calle-',
  surfaceCalleUnion: 'surfacetest-calle-union-',
  surfaceManzana: 'surfacetest-manzana-',
  surfaceDrawingPoint: 'surfacetest-drawing-pt-',
  geoCalibPoint: 'geo-calib-pt-',
};

export const MARKER_ID = {
  tempDrawing: 'temp-drawing',
  calibLink: 'calib-link',
  surfaceDrawing: 'surfacetest-drawing',
  surfaceStreetPreview: 'surfacetest-street-preview',
  geoCalibPending: 'geo-calib-pending',
};

// Todos los markers de calibración (puntos, pendientes, línea) empiezan así.
const CALIBRATION_PREFIX = 'calib-';

const indexedId = prefix => (ownerId, index) => `${prefix}${ownerId}-${index}`;

/** Lee un id indexado: { ownerId, index } o null si no tiene ese prefijo. */
function parseIndexedId(prefix, markerId) {
  if (typeof markerId !== 'string' || !markerId.startsWith(prefix)) return null;
  const rest = markerId.slice(prefix.length);
  const sep = rest.lastIndexOf('-');
  if (sep <= 0) return null;
  const index = Number.parseInt(rest.slice(sep + 1), 10);
  if (!Number.isInteger(index)) return null;
  return { ownerId: rest.slice(0, sep), index };
}

// ─── Calibración ──────────────────────────────────────────────────────────────

export const calibPointId = pairId => `${PREFIX.calibPoint}${pairId}`;
export const calibPendingId = index => `${PREFIX.calibPending}${index}`;
export const isCalibrationMarker = markerId => (
  typeof markerId === 'string' && markerId.startsWith(CALIBRATION_PREFIX)
);
/** `_id` del par de calibración de un marker `calib-pt-*`, o null. */
export const parseCalibPointId = markerId => (
  typeof markerId === 'string' && markerId.startsWith(PREFIX.calibPoint)
    ? markerId.slice(PREFIX.calibPoint.length)
    : null
);

export const geoCalibPointId = pairId => `${PREFIX.geoCalibPoint}${pairId}`;

// ─── Fantasmas (lote del plano proyectado al panorama) ───────────────────────

export const ghostId = annotationId => `${PREFIX.ghost}${annotationId}`;
export const isGhostMarker = markerId => (
  typeof markerId === 'string' && markerId.startsWith(PREFIX.ghost)
);

/**
 * Id de anotación que corresponde seleccionar al clickear un marker: un
 * fantasma selecciona el lote real que representa.
 */
export const selectableAnnotationId = markerId => (
  isGhostMarker(markerId) ? markerId.slice(PREFIX.ghost.length) : markerId
);

// ─── Polígono en curso ────────────────────────────────────────────────────────

export const tempPointId = index => `${PREFIX.tempPoint}${index}`;
/** Clickear el primer punto del trazo cierra el polígono. */
export const FIRST_TEMP_POINT_ID = tempPointId(0);

// ─── Handles de edición de un polígono seleccionado ──────────────────────────

export const editCornerId = indexedId(PREFIX.editCorner);
export const editMidpointId = indexedId(PREFIX.editMidpoint);
export const parseEditCornerId = markerId => parseIndexedId(PREFIX.editCorner, markerId);
export const parseEditMidpointId = markerId => parseIndexedId(PREFIX.editMidpoint, markerId);

// ─── Superficies de Render ────────────────────────────────────────────────────

export const streetAxisId = indexedId(PREFIX.streetAxis);
export const streetAxisMidId = indexedId(PREFIX.streetAxisMid);
export const parseStreetAxisId = markerId => parseIndexedId(PREFIX.streetAxis, markerId);
export const parseStreetAxisMidId = markerId => parseIndexedId(PREFIX.streetAxisMid, markerId);
export const isStreetAxisHandle = markerId => (
  typeof markerId === 'string'
  && (markerId.startsWith(PREFIX.streetAxis) || markerId.startsWith(PREFIX.streetAxisMid))
);

export const surfaceCalleId = shapeId => `${PREFIX.surfaceCalle}${shapeId}`;
export const surfaceCalleUnionId = index => `${PREFIX.surfaceCalleUnion}${index}`;
export const surfaceManzanaId = shapeId => `${PREFIX.surfaceManzana}${shapeId}`;
export const surfaceDrawingPointId = index => `${PREFIX.surfaceDrawingPoint}${index}`;
export const isSurfaceCalleMarker = markerId => (
  typeof markerId === 'string' && markerId.startsWith(PREFIX.surfaceCalle)
);

// ─── DOM de Photo Sphere Viewer ───────────────────────────────────────────────

/** PSV pone `id="psv-marker-<id>"` en cada marker HTML/SVG. */
export const markerIdFromDomId = domId => (
  typeof domId === 'string' && domId.startsWith(PSV_DOM_PREFIX)
    ? domId.slice(PSV_DOM_PREFIX.length)
    : domId
);

/** Selector CSS para encontrar el elemento DOM de los markers con un prefijo. */
export const domSelectorForPrefix = prefix => `[id^="${PSV_DOM_PREFIX}${prefix}"]`;

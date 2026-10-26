import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';

// Movimientos de cámara de PSV que dependen de lo que tapa la interfaz:
// `insets` ({ left, right, top, bottom } en px) es lo que cubren el panel o
// la ficha, y el destino se corre hacia la zona libre.

const FOCUS_DURATION_MS = 1100;
// Cuanto del area libre (la que no tapa la ficha) ocupa el lote al terminar.
const FOCUS_FILL = 0.55;
/**
 * Vuela la camara hasta un marker poligonal (lote) y hace zoom para encuadrarlo.
 * El destino queda descentrado hacia la zona que la ficha no tapa: `insets`
 * ({ left, right, top, bottom } en px) es lo que tapan el panel o la ficha.
 * Nunca aleja el zoom: si el usuario ya estaba mas cerca, solo reencuadra.
 */
export function focusMarker(viewer, marker, insets = {}) {
  const ring = marker?.definition?.[0];
  const center = marker?.state?.position;
  if (!viewer || !center || !Array.isArray(ring) || ring.length < 3) return;

  const { dataHelper } = viewer;
  const toUnit = (yaw, pitch) => dataHelper.sphericalCoordsToVector3({ yaw, pitch }).normalize();
  const centerDir = toUnit(center.yaw, center.pitch);

  // Diametro angular del lote: sirve igual cerca del nadir, donde medir en
  // yaw/pitch se deforma.
  let radius = 0;
  for (const [yaw, pitch] of ring) radius = Math.max(radius, centerDir.angleTo(toUnit(yaw, pitch)));
  const lotSize = Math.min(Math.PI / 2, radius * 2);

  // Fraccion del viewport que queda libre y hacia donde se corre el lote.
  const { width, height } = viewer.state.size;
  const { left = 0, right = 0, top = 0, bottom = 0 } = insets;
  const freeWidth = Math.max(0.1, (width - left - right) / width);
  const freeHeight = Math.max(0.1, (height - top - bottom) / height);
  const shiftX = (right - left) / (2 * width);
  const shiftY = (bottom - top) / (2 * height);

  const toDeg = 180 / Math.PI;
  const vFovNeeded = Math.max(
    (lotSize / (freeHeight * FOCUS_FILL)) * toDeg,
    dataHelper.hFovToVFov(Math.min(170, (lotSize / (freeWidth * FOCUS_FILL)) * toDeg)),
  );
  const zoom = Math.max(
    viewer.getZoomLevel(),
    dataHelper.fovToZoomLevel(Math.min(viewer.config.maxFov, Math.max(viewer.config.minFov, vFovNeeded))),
  );

  // Corrimiento en pantalla (unidades de tangente) que debe tener el lote
  // respecto del centro: negativo en X = a la izquierda, positivo en Y = arriba.
  const vFov = dataHelper.zoomLevelToFov(zoom);
  const offsetX = -shiftX * 2 * Math.tan((dataHelper.vFovToHFov(vFov) / toDeg) / 2);
  const offsetY = shiftY * 2 * Math.tan((vFov / toDeg) / 2);

  // Se busca la direccion de camara que proyecta el centro del lote en ese
  // punto. Los ejes de pantalla dependen de la propia camara, asi que se
  // itera; converge en pocas vueltas.
  let target = { yaw: center.yaw, pitch: center.pitch };
  for (let i = 0; i < 8; i += 1) {
    const right = toUnit(target.yaw + Math.PI / 2, 0);
    const up = toUnit(target.yaw, target.pitch + Math.PI / 2);
    const dir = centerDir.clone()
      .addScaledVector(right, -offsetX)
      .addScaledVector(up, -offsetY)
      .normalize();
    target = dataHelper.vector3ToSphericalCoords(dir);
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    viewer.rotate(target);
    viewer.zoom(zoom);
    return;
  }
  viewer.animate({ yaw: target.yaw, pitch: target.pitch, zoom, speed: FOCUS_DURATION_MS });
}

const POI_ZOOM = 40;

/**
 * Lleva la cámara a un marker puntual (un POI de "Cerca"), corrido hacia la
 * zona que el panel lateral deja libre. No hace nada si no está en el panorama.
 */
export function flyToMarker(viewer, id, insets = {}) {
  try {
    const marker = viewer.getPlugin(MarkersPlugin).getMarker(id);
    const pos = marker?.state?.position;
    if (!pos) return;
    const hFov = viewer.dataHelper.vFovToHFov(viewer.dataHelper.zoomLevelToFov(POI_ZOOM));
    const yaw = pos.yaw - ((insets.left ?? 0) / 2 / viewer.state.size.width) * hFov * (Math.PI / 180);
    viewer.animate({ yaw, pitch: pos.pitch, zoom: POI_ZOOM, speed: 1100 });
  } catch (_) { /* el lugar no está en el panorama */ }
}

/** focusMarker por id; no hace nada si el lote no tiene polígono en el panorama. */
export function focusMarkerById(viewer, id, insets = {}) {
  try {
    focusMarker(viewer, viewer.getPlugin(MarkersPlugin).getMarker(id), insets);
  } catch (_) { /* el lote no tiene polígono en el panorama */ }
}

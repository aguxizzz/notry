import { surfacesForDirtyCheck } from './renderSurfaces.js';
import { normalizeGeoSurfaces } from './geoSurfaces.js';

// Única detección de "cambios sin guardar": la usan el indicador del
// DocumentBar, el auto-guardado del borrador y el "Guardar todo".
//
// `current` y `saved` tienen la misma forma:
//   { annotations, calibrationPoints, geoCalibrationPoints, renderSurfaces, geoSurfaces }

const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
const textOnly = annotations => (annotations ?? []).filter(a => a.type === 'text');
// Sin dibujos guardados (null del back, o un loteo de antes de verdes/agua/
// perímetro) es lo mismo que listas vacías.
const geoShapes = s => normalizeGeoSurfaces(s);

export function detectChanges(current, saved) {
  const surfaces = current.renderSurfaces ?? null;
  const savedSurfaces = saved.renderSurfaces ?? null;
  const renderContent = differs(surfacesForDirtyCheck(surfaces), surfacesForDirtyCheck(savedSurfaces));
  const renderAny = differs(surfaces, savedSurfaces);
  return {
    annotations: differs(current.annotations ?? [], saved.annotations ?? []),
    text: differs(textOnly(current.annotations), textOnly(saved.annotations)),
    calibration: differs(current.calibrationPoints ?? [], saved.calibrationPoints ?? []),
    geoCalibration: differs(current.geoCalibrationPoints ?? [], saved.geoCalibrationPoints ?? []),
    renderSurfaces: renderContent,
    geoSurfaces: differs(geoShapes(current.geoSurfaces), geoShapes(saved.geoSurfaces)),
    // Solo cambió qué capas se ven: no cuenta como cambio sin guardar, pero
    // si se guarda por otra cosa, viaja igual (se recuerda la preferencia).
    renderPreferences: renderAny && !renderContent,
  };
}

export const hasUnsavedChanges = changes => (
  changes.annotations || changes.calibration || changes.geoCalibration || changes.renderSurfaces
  || changes.geoSurfaces
);

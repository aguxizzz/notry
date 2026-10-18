import { describe, expect, test } from 'vitest';
import { detectChanges, hasUnsavedChanges } from './editorChanges.js';
import { DEFAULT_RENDER_SURFACES } from './renderSurfaces.js';

const saved = {
  annotations: [{ id: 'L1', type: 'polygon' }, { id: 'T1', type: 'text', text: 'hola' }],
  calibrationPoints: [{ _id: 'c1' }],
  geoCalibrationPoints: [],
  renderSurfaces: DEFAULT_RENDER_SURFACES,
};

describe('detectChanges', () => {
  test('igual a lo guardado: sin cambios', () => {
    const changes = detectChanges({ ...saved }, saved);
    expect(hasUnsavedChanges(changes)).toBe(false);
    expect(Object.values(changes).some(Boolean)).toBe(false);
  });

  test('loteo sin cargar (todo vacío/null) contra los defaults: sin cambios', () => {
    const changes = detectChanges(
      { annotations: [], calibrationPoints: [], geoCalibrationPoints: [], renderSurfaces: null },
      { annotations: [], calibrationPoints: undefined, geoCalibrationPoints: undefined, renderSurfaces: null },
    );
    expect(hasUnsavedChanges(changes)).toBe(false);
  });

  test('un par de geo-calibración nuevo cuenta como cambio sin guardar', () => {
    const changes = detectChanges({ ...saved, geoCalibrationPoints: [{ _id: 'g1' }] }, saved);
    expect(changes.geoCalibration).toBe(true);
    expect(hasUnsavedChanges(changes)).toBe(true);
  });

  test('cambiar un texto marca annotations y text; cambiar un lote solo annotations', () => {
    const textChange = detectChanges({ ...saved, annotations: [saved.annotations[0], { ...saved.annotations[1], text: 'chau' }] }, saved);
    expect(textChange).toMatchObject({ annotations: true, text: true });
    const lotChange = detectChanges({ ...saved, annotations: [{ id: 'L1', type: 'polygon', x: 1 }, saved.annotations[1]] }, saved);
    expect(lotChange).toMatchObject({ annotations: true, text: false });
  });

  test('solo cambiar qué capas se ven no es cambio sin guardar, pero se marca como preferencia', () => {
    const renderSurfaces = { ...DEFAULT_RENDER_SURFACES, layersVisible: { lotes: true, manzanas: false, calles: true } };
    const changes = detectChanges({ ...saved, renderSurfaces }, saved);
    expect(changes.renderSurfaces).toBe(false);
    expect(changes.renderPreferences).toBe(true);
    expect(hasUnsavedChanges(changes)).toBe(false);
  });

  test('una manzana nueva sí es cambio de Render', () => {
    const renderSurfaces = { ...DEFAULT_RENDER_SURFACES, manzanas: [{ id: 'm1', points: [[0, 0]] }] };
    const changes = detectChanges({ ...saved, renderSurfaces }, saved);
    expect(changes).toMatchObject({ renderSurfaces: true, renderPreferences: false });
    expect(hasUnsavedChanges(changes)).toBe(true);
  });
});

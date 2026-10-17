import { describe, expect, test } from 'vitest';
import {
  FIRST_TEMP_POINT_ID, MARKER_ID, PREFIX, calibPointId, domSelectorForPrefix, editCornerId, editMidpointId,
  ghostId, isCalibrationMarker, isStreetAxisHandle, isSurfaceCalleMarker, isSurfaceMarker, markerIdFromDomId,
  parseCalibPointId, parseEditCornerId, parseEditMidpointId, parseStreetAxisId, parseStreetAxisMidId,
  selectableAnnotationId, streetAxisId, streetAxisMidId, surfaceCalleId, surfaceCalleUnionId, surfaceManzanaId,
} from './markerIds.js';

const UUID = '3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f';

describe('ids indexados (dueño con guiones)', () => {
  test('esquina: ida y vuelta con un UUID como dueño', () => {
    const id = editCornerId(UUID, 7);
    expect(id).toBe(`edit-corner-${UUID}-7`);
    expect(parseEditCornerId(id)).toEqual({ ownerId: UUID, index: 7 });
  });

  test('punto medio y ejes de calle', () => {
    expect(parseEditMidpointId(editMidpointId('polygon-abc', 0))).toEqual({ ownerId: 'polygon-abc', index: 0 });
    expect(parseStreetAxisId(streetAxisId('test-calle-17', 3))).toEqual({ ownerId: 'test-calle-17', index: 3 });
    expect(parseStreetAxisMidId(streetAxisMidId('test-calle-17', 2))).toEqual({ ownerId: 'test-calle-17', index: 2 });
  });

  test('un prefijo no confunde al otro', () => {
    expect(parseEditCornerId(editMidpointId('x', 1))).toBeNull();
    expect(parseStreetAxisId(streetAxisMidId('x', 1))).toBeNull();
  });

  test('ids mal formados devuelven null', () => {
    expect(parseEditCornerId('edit-corner-sinindice')).toBeNull();
    expect(parseEditCornerId('edit-corner-x-abc')).toBeNull();
    expect(parseEditCornerId(undefined)).toBeNull();
  });
});

describe('calibración', () => {
  test('punto de calibración: ida y vuelta', () => {
    expect(parseCalibPointId(calibPointId(UUID))).toBe(UUID);
    expect(parseCalibPointId('calib-pending-0')).toBeNull();
  });

  test('isCalibrationMarker cubre puntos, pendientes y la línea', () => {
    expect(isCalibrationMarker(calibPointId('a'))).toBe(true);
    expect(isCalibrationMarker('calib-pending-0')).toBe(true);
    expect(isCalibrationMarker('calib-link')).toBe(true);
    expect(isCalibrationMarker('L1')).toBe(false);
  });
});

describe('selección', () => {
  test('un fantasma selecciona el lote real', () => {
    expect(selectableAnnotationId(ghostId(UUID))).toBe(UUID);
    expect(selectableAnnotationId(UUID)).toBe(UUID);
  });

  test('el primer punto del trazo', () => {
    expect(FIRST_TEMP_POINT_ID).toBe('temp-pt-0');
  });
});

describe('superficies', () => {
  test('la unión de calles también cuenta como superficie de calle', () => {
    expect(isSurfaceCalleMarker(surfaceCalleId('s1'))).toBe(true);
    expect(isSurfaceCalleMarker(surfaceCalleUnionId(0))).toBe(true);
    expect(isSurfaceCalleMarker('surfacetest-manzana-s1')).toBe(false);
  });

  test('isSurfaceMarker: manzanas y calles (solas o unidas), no los handles ni lotes', () => {
    expect(isSurfaceMarker(surfaceManzanaId('m1'))).toBe(true);
    expect(isSurfaceMarker(surfaceCalleId('s1'))).toBe(true);
    expect(isSurfaceMarker(surfaceCalleUnionId(2))).toBe(true);
    // El contorno de selección es fondo también: el click pasa al panorama.
    expect(isSurfaceMarker(MARKER_ID.surfaceSelection)).toBe(true);
    expect(isSurfaceMarker(streetAxisId('s1', 0))).toBe(false);
    expect(isSurfaceMarker('lot-1')).toBe(false);
    expect(isSurfaceMarker(undefined)).toBe(false);
  });

  test('handles de eje', () => {
    expect(isStreetAxisHandle(streetAxisId('s', 0))).toBe(true);
    expect(isStreetAxisHandle(streetAxisMidId('s', 0))).toBe(true);
    expect(isStreetAxisHandle(surfaceCalleId('s'))).toBe(false);
  });
});

describe('DOM de PSV', () => {
  test('saca el prefijo psv-marker-', () => {
    expect(markerIdFromDomId(`psv-marker-${editCornerId('L1', 2)}`)).toBe('edit-corner-L1-2');
    expect(markerIdFromDomId('otro')).toBe('otro');
  });

  test('selector por prefijo', () => {
    expect(domSelectorForPrefix(PREFIX.editCorner)).toBe('[id^="psv-marker-edit-corner-"]');
  });
});

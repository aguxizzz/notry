import { describe, expect, test } from 'vitest';
import { getLotSvgStyle, LOT_STATUS_STYLES } from './lotStyles.js';
import { annotationsToMarkers } from './annotations.js';

const POLY = [[1, 1], [10, 1], [10, 10]];

describe('getLotSvgStyle', () => {
  test.each(['available', 'unavailable', 'sold', 'reserved'])('el estado %s tiene estilo propio', status => {
    expect(getLotSvgStyle({ status })).toBe(LOT_STATUS_STYLES[status]);
  });

  test('acepta el nombre viejo del campo (estado)', () => {
    expect(getLotSvgStyle({ estado: 'sold' })).toBe(LOT_STATUS_STYLES.sold);
  });

  test('un lote pendiente usa su svgStyle aunque tenga estado', () => {
    const svgStyle = { fill: 'orange' };
    expect(getLotSvgStyle({ status: 'sold', pending: true, svgStyle })).toBe(svgStyle);
  });

  test('sin estado conocido cae al svgStyle, o a un objeto vacío', () => {
    expect(getLotSvgStyle({ status: 'raro', svgStyle: { fill: 'x' } })).toEqual({ fill: 'x' });
    expect(getLotSvgStyle({})).toEqual({});
  });
});

describe('panorama y plano usan los mismos colores', () => {
  test.each(Object.keys(LOT_STATUS_STYLES))('estado %s en el panorama', status => {
    const [marker] = annotationsToMarkers([{ id: 'a', type: 'polygon', polygonPixels: POLY, status }]);
    expect(marker.svgStyle).toBe(LOT_STATUS_STYLES[status]);
  });
});

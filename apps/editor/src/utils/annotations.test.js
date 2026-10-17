import { describe, expect, test } from 'vitest';
import { annotationsToMarkers } from './annotations.js';

const POLY = [[1, 1], [10, 1], [10, 10]];

describe('annotationsToMarkers', () => {
  test('un lote con estado usa el estilo de ese estado', () => {
    const [marker] = annotationsToMarkers([{ id: 'a', type: 'polygon', polygonPixels: POLY, status: 'sold' }]);
    expect(marker.svgStyle.fill).toBe('rgba(239,68,68,0.25)');
  });

  test('un lote pendiente ignora el estado y usa su propio estilo', () => {
    const svgStyle = { fill: 'orange' };
    const [marker] = annotationsToMarkers([{ id: 'a', type: 'polygon', polygonPixels: POLY, status: 'sold', pending: true, svgStyle }]);
    expect(marker.svgStyle).toBe(svgStyle);
  });

  test('descarta polígonos con menos de 3 puntos válidos y entradas inválidas', () => {
    const markers = annotationsToMarkers([
      { id: 'a', type: 'polygon', polygonPixels: [[1, 1], [2, 2], ['x', 3]] },
      null,
      { type: 'polygon', polygonPixels: POLY }, // sin id
    ]);
    expect(markers).toEqual([]);
  });

  test('escapa HTML en tooltips y textos', () => {
    const [text] = annotationsToMarkers([{ id: 't', type: 'text', tooltip: '<img onerror=x>', position: { textureX: 1, textureY: 2 } }]);
    expect(text.tooltip).toBe('&lt;img onerror=x&gt;');
    expect(text.html).not.toContain('<img');
  });

  test('un color de texto inválido cae al default (no se inyecta en el style)', () => {
    const [text] = annotationsToMarkers([{ id: 't', type: 'text', tooltip: 'x', textColor: 'red;background:url(x)', position: { textureX: 1, textureY: 2 } }]);
    expect(text.html).toContain('color:#000000');
  });

  test('un POI callout sin ancla en el panorama no genera marker', () => {
    expect(annotationsToMarkers([{ id: 'p', type: 'poi', variant: 'callout', blueprint_anchor: [0.1, 0.1] }])).toEqual([]);
  });
});

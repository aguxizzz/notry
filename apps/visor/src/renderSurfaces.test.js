import { describe, it, expect } from 'vitest';
import { renderSurfacesToMarkers, SURFACE_COLORS } from './renderSurfaces.js';

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe('renderSurfacesToMarkers', () => {
  it('sin superficies no hay markers', () => {
    expect(renderSurfacesToMarkers(null)).toEqual([]);
  });

  it('manzanas antes que calles (PSV pinta en orden de inserción)', () => {
    const markers = renderSurfacesToMarkers({
      manzanas: [{ id: 1, points: rect(0, 0, 10, 10) }],
      calles: [{ id: 2, points: rect(20, 0, 10, 10) }],
      manzanaOpacity: 0.5,
    });
    expect(markers.map((m) => m.id)).toEqual(['render-manzana-1', 'render-calle-2']);
    expect(markers[0].svgStyle).toMatchObject({ fill: SURFACE_COLORS.light.manzana, fillOpacity: 0.5 });
  });

  it('respeta las capas ocultas y el modo oscuro', () => {
    const markers = renderSurfacesToMarkers({
      manzanas: [{ id: 1, points: rect(0, 0, 10, 10) }],
      calles: [{ id: 2, points: rect(20, 0, 10, 10) }],
      layersVisible: { manzanas: false, calles: true },
      colorMode: 'dark',
    });
    expect(markers.map((m) => m.id)).toEqual(['render-calle-2']);
    expect(markers[0].svgStyle.fill).toBe(SURFACE_COLORS.dark.calle);
  });

  it('las calles "Ruta" que se tocan se unen en un solo contorno', () => {
    const markers = renderSurfacesToMarkers({
      calles: [
        { id: 'a', axis: true, points: rect(0, 0, 100, 10) },
        { id: 'b', axis: true, points: rect(50, 0, 10, 100) },
      ],
    });
    expect(markers.map((m) => m.id)).toEqual(['render-calle-union-0']);
  });
});

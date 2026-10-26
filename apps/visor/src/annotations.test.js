import { describe, it, expect } from 'vitest';
import { annotationsToMarkers, styleLotMarkers, formatPoiDistance, getLoteBadgeSvg, poiFromAnnotation } from './annotations.js';
import { STATUS_FILL_COLORS } from './lotData.js';

const square = (x, y, size = 100) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
const lot = (id, extra = {}) => ({ id, type: 'polygon', panorama_coordinates: square(0, 0), status: 'available', ...extra });
const byId = (markers) => Object.fromEntries(markers.map((m) => [m.id, m]));

describe('annotationsToMarkers — lotes', () => {
  it('un lote da relleno + bordes + badge (si tiene label)', () => {
    const markers = annotationsToMarkers([lot('a')], 5, new Map([['a', 'L1']]));
    expect(markers.map((m) => m.id)).toEqual(['a', 'a__border__0', 'a__badge']);
    const { a, a__border__0: border, a__badge: badge } = byId(markers);
    expect(a.svgStyle).toMatchObject({ fill: 'transparent', stroke: 'none' });
    expect(border.svgStyle.fill).toBe('none');
    expect(badge.position).toEqual({ textureX: 50, textureY: 50 });
  });

  it('sin label no hay badge', () => {
    expect(annotationsToMarkers([lot('a')]).map((m) => m.id)).toEqual(['a', 'a__border__0']);
  });

  it('vendido no muestra badge, salvo con badgeColors', () => {
    const labels = new Map([['a', 'L1']]);
    const sold = [lot('a', { status: 'sold' })];
    expect(annotationsToMarkers(sold, 5, labels).some((m) => m.id === 'a__badge')).toBe(false);
    expect(annotationsToMarkers(sold, 5, labels, 'default', true).some((m) => m.id === 'a__badge')).toBe(true);
  });

  it('status_fill pinta el relleno por estado y no dibuja badge', () => {
    const markers = annotationsToMarkers([lot('a', { status: 'sold' })], 5, new Map([['a', 'L1']]), 'status_fill');
    expect(byId(markers).a.svgStyle.fill).toBe(STATUS_FILL_COLORS.sold);
    expect(markers.some((m) => m.id === 'a__badge')).toBe(false);
  });

  it('el borde compartido entre lotes vecinos se dibuja una sola vez', () => {
    const markers = annotationsToMarkers([lot('a'), lot('b', { panorama_coordinates: square(100, 0) })]);
    const segments = markers
      .filter((m) => m.id.includes('__border__'))
      .reduce((total, m) => total + m.polylinePixels.length - 1, 0);
    expect(segments).toBe(7);
  });

  it('descarta polígonos con menos de 3 puntos', () => {
    expect(annotationsToMarkers([lot('a', { panorama_coordinates: [[0, 0], [1, 1]] })])).toEqual([]);
  });

  it('acepta las coordenadas en cualquiera de los nombres históricos', () => {
    const { panorama_coordinates: points, ...rest } = lot('a');
    expect(byId(annotationsToMarkers([{ ...rest, polygonPixels: points }])).a.polygonPixels).toEqual(points);
    expect(byId(annotationsToMarkers([{ ...rest, polygon: points }])).a.polygonPixels).toEqual(points);
  });

  it('usa uuid antes que id', () => {
    expect(annotationsToMarkers([lot('a', { uuid: 'u-1' })])[0].id).toBe('u-1');
  });
});

describe('annotationsToMarkers — POIs y otros', () => {
  it('POI de área con ícono: polígono + ícono en el centroide', () => {
    const markers = annotationsToMarkers([{ id: 'p', type: 'poi', panorama_coordinates: square(0, 0, 60), icon_type: 'school', color: '#ff0000' }]);
    expect(markers.map((m) => m.id)).toEqual(['p', 'p__icon']);
    expect(markers[0].svgStyle.stroke).toBe('#ff0000');
    expect(markers[1].position).toEqual({ textureX: 30, textureY: 30 });
  });

  it('marker sin posición ni geometría se descarta', () => {
    expect(annotationsToMarkers([{ id: 'c', type: 'circle' }])).toEqual([]);
  });

  it('entrada que no es array da lista vacía', () => {
    expect(annotationsToMarkers(null)).toEqual([]);
  });
});

describe('formatPoiDistance', () => {
  it('redondea a un decimal y elige unidad', () => {
    expect(formatPoiDistance('3.46', 'km')).toBe('3.5 km');
    expect(formatPoiDistance(45, 'min')).toBe('45 min');
    expect(formatPoiDistance('', 'km')).toBe('');
    expect(formatPoiDistance('abc', 'km')).toBe('');
  });
});

describe('getLoteBadgeSvg', () => {
  it('escapa el texto y lo corta a 4 caracteres', () => {
    const { html } = getLoteBadgeSvg('<b>12345');
    expect(html).toContain('&lt;b&gt;1');
    expect(html).not.toContain('<b>');
  });

  it('más de 2 caracteres se estira en píldora', () => {
    expect(getLoteBadgeSvg('12')).toMatchObject({ width: 72, height: 72 });
    expect(getLoteBadgeSvg('123').width).toBeGreaterThan(72);
  });
});

describe('styleLotMarkers', () => {
  const markers = [
    { id: 'a', className: 'psv-marker--lot', svgStyle: { fill: 'x' } },
    { id: 'a__border__0', className: 'psv-marker--lot', svgStyle: { stroke: 'y' } },
    { id: 'a__badge', style: { opacity: 1 } },
    { id: 'b', className: 'psv-marker--lot', svgStyle: { fill: 'x' } },
    { id: 'render-calle-1', svgStyle: { fill: 'z' } },
  ];
  const lotIds = new Set(['a', 'b']);

  it('sin recomendados ni filtro devuelve el mismo array', () => {
    expect(styleLotMarkers(markers, { lotIds, focusMode: true })).toBe(markers);
  });

  it('apaga relleno, borde y código de los lotes filtrados', () => {
    const [fill, border, badge, other, surface] = styleLotMarkers(markers, { lotIds, visibleIds: new Set(['b']) });
    expect(fill.svgStyle.fill).toMatch(/^rgba\(10,10,10/);
    expect(border.svgStyle.stroke).toBe('rgba(255,255,255,0.3)');
    expect(badge.style.opacity).toBe(0.28);
    expect(other).toBe(markers[3]);
    expect(surface).toBe(markers[4]);
  });

  it('modo foco: recomendado en dorado, el resto apagado; sin foco solo el dorado', () => {
    const recommendedIds = new Set(['a']);
    const [a, border, badge, b] = styleLotMarkers(markers, { lotIds, recommendedIds, focusMode: true });
    expect(a.className).toContain('psv-marker--lot-recommended');
    expect(a.svgStyle.fill).toBe('rgba(197,160,89,0.42)');
    expect(border.svgStyle.stroke).toBe('y');
    expect(badge).toBe(markers[2]);
    expect(b.className).toContain('psv-marker--lot-muted');
    expect(styleLotMarkers(markers, { lotIds, recommendedIds })[3]).toBe(markers[3]);
  });

  it('el filtro le gana al dorado del recomendado', () => {
    const [a] = styleLotMarkers(markers, { lotIds, recommendedIds: new Set(['a']), visibleIds: new Set(['b']) });
    expect(a.svgStyle.fill).toMatch(/^rgba\(10,10,10/);
  });
});

describe('poiFromAnnotation', () => {
  it('completa los valores por defecto', () => {
    expect(poiFromAnnotation({ type: 'poi' }, 'p1')).toMatchObject({
      title: 'p1', content: '', color: '#14b8a6', poi_kind: 'place', target_loteo_id: null, target_stage_name: null,
    });
  });

  it('resuelve el nombre de la etapa destino', () => {
    const poi = poiFromAnnotation({ tooltip: 'Club', description: '<p>x</p>', target_loteo_id: 7 }, 'p1', { 7: 'Etapa 2' });
    expect(poi).toMatchObject({ title: 'Club', content: '<p>x</p>', target_loteo_id: 7, target_stage_name: 'Etapa 2' });
  });
});

import { describe, it, expect } from 'vitest';
import { annId, annPoints, lotStatus, lotArea, sizeBuckets, filterLots } from './lotData.js';

describe('lectura de anotaciones', () => {
  it('uuid gana sobre id', () => {
    expect(annId({ uuid: 'u', id: 1 })).toBe('u');
    expect(annId({ id: 1 })).toBe(1);
  });

  it('coordenadas en cualquiera de los tres formatos', () => {
    expect(annPoints({ panorama_coordinates: [[1, 1]], polygon: [[2, 2]] })).toEqual([[1, 1]]);
    expect(annPoints({ polygonPixels: [[3, 3]] })).toEqual([[3, 3]]);
    expect(annPoints({ polygon: [[2, 2]] })).toEqual([[2, 2]]);
    expect(annPoints({})).toEqual([]);
  });

  it('estado: status o estado; lo desconocido es no disponible', () => {
    expect(lotStatus({ status: 'sold' })).toBe('sold');
    expect(lotStatus({ estado: 'reserved' })).toBe('reserved');
    expect(lotStatus({ status: 'otro' })).toBe('unavailable');
    expect(lotStatus({})).toBe('unavailable');
  });

  it('superficie numérica o null', () => {
    expect(lotArea({ area_m2: '312.5' })).toBe(312.5);
    expect(lotArea({ area_m2: null })).toBe(null);
  });
});

const lot = (id, area, extra = {}) => ({ id, type: 'polygon', tooltip: `Lote ${id}`, area_m2: area, status: 'available', ...extra });

describe('sizeBuckets', () => {
  it('con menos de 6 superficies no hay rangos', () => {
    expect(sizeBuckets([lot(1, 300), lot(2, 400)])).toBe(null);
  });

  it('corta por tercios redondeando a 10', () => {
    const lots = [300, 310, 320, 400, 410, 420, 500, 510, 520].map((a, i) => lot(i, a));
    const buckets = sizeBuckets(lots);
    expect(buckets.map((b) => b.label)).toEqual(['Hasta 400 m²', '400–500 m²', 'Más de 500 m²']);
    expect(buckets[0].test(400)).toBe(true);
    expect(buckets[1].test(401)).toBe(true);
  });
});

describe('filterLots', () => {
  const labels = new Map([[1, 'L1'], [12, 'L12'], [2, 'L2']]);
  const lots = [lot(1, 300), lot(12, 600, { status: 'sold', manzana: 'B' }), lot(2, null)];

  it('sin filtros devuelve todo', () => {
    expect(filterLots(lots, { labels })).toHaveLength(3);
  });

  it('solo disponibles', () => {
    expect(filterLots(lots, { labels, onlyAvailable: true }).map(annId)).toEqual([1, 2]);
  });

  it('un rango de superficie deja afuera los lotes sin superficie', () => {
    const bucket = { test: (a) => a < 500 };
    expect(filterLots(lots, { labels, bucket }).map(annId)).toEqual([1]);
  });

  it('búsqueda por número compara el comienzo', () => {
    expect(filterLots(lots, { labels, query: '1' }).map(annId)).toEqual([1, 12]);
    expect(filterLots(lots, { labels, query: '12' }).map(annId)).toEqual([12]);
  });

  it('búsqueda por texto incluye la manzana', () => {
    expect(filterLots(lots, { labels, query: 'manzana b' }).map(annId)).toEqual([12]);
  });
});

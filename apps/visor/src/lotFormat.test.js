import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatPrice, getSubmittedLotsSet, markLotAsSubmitted } from './lotFormat.js';
import { getLoteLabels } from './loteLabels.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('formatPrice', () => {
  it('formatea números sin decimales y deja pasar texto', () => {
    expect(formatPrice('25000')).toBe(`$${(25000).toLocaleString('es-CO')}`);
    expect(formatPrice('Consultar')).toBe('Consultar');
    expect(formatPrice(null)).toBe('');
  });
});

describe('precalificaciones enviadas', () => {
  it('sin localStorage no rompe (modo privado)', () => {
    expect(getSubmittedLotsSet()).toEqual(new Set());
    expect(() => markLotAsSubmitted('x')).not.toThrow();
  });

  it('recuerda los lotes enviados', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    markLotAsSubmitted('loteo:a');
    markLotAsSubmitted('loteo:a');
    markLotAsSubmitted('loteo:b');
    expect(getSubmittedLotsSet()).toEqual(new Set(['loteo:a', 'loteo:b']));
  });
});

describe('getLoteLabels', () => {
  it('numera solo lotes y mantiene el código estable en la sesión', () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    const anns = [{ id: 'a', type: 'polygon' }, { id: 'p', type: 'poi' }, { uuid: 'b', type: 'polygon' }];
    expect([...getLoteLabels(anns)]).toEqual([['a', 'L1'], ['b', 'L2']]);
    expect(getLoteLabels([{ id: 'c', type: 'polygon' }, { id: 'a', type: 'polygon' }]).get('c')).toBe('L3');
    expect(getLoteLabels(anns).get('a')).toBe('L1');
  });
});

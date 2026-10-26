import { describe, it, expect } from 'vitest';
import { isLowTierDevice } from './devicePerf.js';

describe('isLowTierDevice', () => {
  it('poca memoria o pocos núcleos es gama baja', () => {
    expect(isLowTierDevice({ deviceMemory: 4, hardwareConcurrency: 8 })).toBe(true);
    expect(isLowTierDevice({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe(true);
    expect(isLowTierDevice({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false);
  });

  it('sin datos del equipo no asume gama baja, salvo ahorro de datos', () => {
    expect(isLowTierDevice({})).toBe(false);
    expect(isLowTierDevice({ connection: { saveData: true } })).toBe(true);
  });

  it('?lite= le gana a la detección', () => {
    expect(isLowTierDevice({ deviceMemory: 8, hardwareConcurrency: 8 }, '1')).toBe(true);
    expect(isLowTierDevice({ deviceMemory: 2 }, '0')).toBe(false);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { computeSimulation, formatArs, formatUcb, formatUsd } from './simulator.js';

test('formatea las unidades de la respuesta pública', () => {
  assert.match(formatArs(180_000), /180\.000/);
  assert.equal(formatUcb(12.5), '12,5');
  assert.equal(formatUsd(52_000), '$52,000');
});

// Mismo escenario que tests/test_public_simulator.py en notry-back: cemento a
// $12.000/bolsa, dólar a $1.000, lote de USD 12.000 (= 1.000 UCB).
const project = {
  cementRateArs: 12_000,
  usdRateArs: 1_000,
  writingThresholdPercent: 10,
  plans: [
    { id: '120', installments: 100, years: 10 },
    { id: '144', installments: 50, years: 12 },
  ],
  lots: [{ id: 'lote-07', name: 'Lote 07', sector: 'Bosque', area: 652, listPriceUsd: 12_000 }],
};

test('un lote es compatible cuando la cuota entra en la capacidad mensual', () => {
  const result = computeSimulation(project, { monthlyArs: 180_000, downPaymentArs: 0, planId: '120' });
  assert.equal(result.monthlyUcb, 15);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].totalUcb, 1000);
  assert.equal(result.candidates[0].installmentUcb, 10);
  assert.equal(result.candidates[0].writingThresholdUcb, 100);
});

test('un plazo más corto excluye la oferta si supera la capacidad mensual', () => {
  const result = computeSimulation(project, { monthlyArs: 180_000, downPaymentArs: 0, planId: '144' });
  assert.equal(result.candidates.length, 0);
});

test('el anticipo reduce la cuota financiada', () => {
  const result = computeSimulation(project, { monthlyArs: 180_000, downPaymentArs: 2_400_000, planId: '120' });
  assert.equal(result.downPaymentUcb, 200);
  assert.equal(result.candidates[0].installmentUcb, 8);
});

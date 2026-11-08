// Correr con `npm test` (node --test, sin dependencias).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectFunnel, selectEngagement } from './analytics.js';

const steps = (session_start, lote_click = 0, form_open = 0, form_submit = 0, whatsapp_click = 0) => ({
  session_start, lote_click, form_open, form_submit, whatsapp_click,
});

const day = (overrides = {}) => ({
  funnel: {},
  hours: Array(24).fill(0),
  depth: { sessions: 0, stages_sum: 0, duration_sum: 0, duration_count: 0 },
  stages: {},
  pois: {},
  lots: {},
  ...overrides,
});

// 2026-10-16 es viernes.
const analytics = {
  today: '2026-10-16',
  days_available: 120,
  stages: [{ id: 's1', name: 'Etapa 1' }],
  poi_names: { p1: 'Club house' },
  total_lotes: 4,
  days: {
    '2026-10-16': day({
      funnel: { visor_direct: steps(2, 1), visor_google: steps(1, 1, 1, 1) },
      hours: Object.assign(Array(24).fill(0), { 21: 3 }),
      depth: { sessions: 3, stages_sum: 3, duration_sum: 120, duration_count: 2 },
      stages: { s1: { sessions: 3, dwell_sum: 60, dwell_count: 2 } },
      pois: { p1: 2 },
      lots: { l1: [2, 1] },
    }),
    '2026-10-12': day({
      funnel: { visor_direct: steps(4, 2) },
      hours: Object.assign(Array(24).fill(0), { 9: 4 }),
      depth: { sessions: 4, stages_sum: 4, duration_sum: 0, duration_count: 0 },
      stages: { s1: { sessions: 4, dwell_sum: 0, dwell_count: 0 } },
      lots: { l1: [1, 0], l2: [1, 0] },
    }),
    // Fuera de un período de 5 días, pero dentro del anterior.
    '2026-10-08': day({ funnel: { visor_direct: steps(5) } }),
  },
};

test('el período suma solo los días calendario que terminan hoy', () => {
  assert.equal(selectFunnel(analytics, 1).sessions_total, 3);
  assert.equal(selectFunnel(analytics, 5).sessions_total, 7);
  assert.equal(selectFunnel(analytics, 10).sessions_total, 12);
});

test('el período anterior son los N días previos, sin solaparse', () => {
  assert.equal(selectFunnel(analytics, 1).previous.sessions_total, 0);
  // 5 días: 12–16; anteriores: 7–11 (incluye el 8).
  assert.equal(selectFunnel(analytics, 5).previous.sessions_total, 5);
});

test('el filtro de canal filtra los pasos pero la lista de canales es del período completo', () => {
  const google = selectFunnel(analytics, 5, 'visor_google');
  assert.equal(google.sessions_total, 1);
  assert.equal(google.form_submit, 1);
  assert.deepEqual(google.channels, [
    { channel: 'visor_direct', sessions: 6 },
    { channel: 'visor_google', sessions: 1 },
  ]);
});

test('la serie diaria tiene un punto por día del período, con ceros en días sin datos', () => {
  const daily = selectFunnel(analytics, 5).daily_sessions;
  assert.deepEqual(daily.map(d => d.date), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
  assert.deepEqual(daily.map(d => d.sessions), [4, 0, 0, 0, 3]);
});

test('la grilla de horarios ubica cada día en su día de la semana (lunes = 0)', () => {
  const hours = selectEngagement(analytics, 5).sessions_by_hour;
  assert.equal(hours[0][9], 4); // 12/10 es lunes
  assert.equal(hours[4][21], 3); // 16/10 es viernes
});

test('profundidad, etapas, POIs y lotes se suman y promedian sobre el período', () => {
  const e = selectEngagement(analytics, 5);
  assert.deepEqual(e.session_depth, { sessions_total: 7, avg_stages_per_session: 1, avg_duration_seconds: 60 });
  assert.deepEqual(e.stage_visits, [{ stage_id: 's1', stage_name: 'Etapa 1', sessions: 7, avg_dwell_seconds: 30 }]);
  assert.deepEqual(e.poi_clicks, [{ poi_id: 'p1', poi_name: 'Club house', clicks: 2 }]);
  assert.deepEqual(e.lot_activity, [
    { lote_id: 'l1', sessions: 3, contacts: 1 },
    { lote_id: 'l2', sessions: 1, contacts: 0 },
  ]);
  assert.equal(e.lot_interest.lotes_con_click, 2);
  assert.equal(e.lot_interest.tasa_interaccion, 0.5);
});

test('sin analítica devuelve null', () => {
  assert.equal(selectFunnel(null, 30), null);
  assert.equal(selectEngagement(null, 30), null);
});

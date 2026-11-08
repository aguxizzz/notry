/**
 * Deriva las métricas de un período a partir de la respuesta de
 * /loteos/{id}/analytics (agregada por día, ver el docstring del endpoint).
 * Devuelve los mismos shapes que los viejos /funnel y /engagement, así los
 * componentes no se enteran del cambio.
 *
 * Un período de N días son los N días calendario que terminan hoy (hora AR),
 * y su período anterior los N días previos. Cada sesión está en un solo día,
 * así que sumar días nunca la cuenta dos veces.
 */

/** Texto del período para la UI: "hoy" / "los últimos 30 días". */
export const describePeriod = (days) => (days === 1 ? 'hoy' : `los últimos ${days} días`);

const STEPS = ['session_start', 'lote_click', 'form_open', 'form_submit', 'whatsapp_click'];

// Mediodía UTC: sumar/restar días nunca cruza de fecha por husos u horario de verano.
const toDate = (iso) => new Date(`${iso}T12:00:00Z`);
const toIso = (date) => date.toISOString().slice(0, 10);

/** Fechas ISO de `count` días que terminan `offset` días antes de `today`, de la más vieja a la más nueva. */
function windowDays(today, offset, count) {
  const end = toDate(today);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - offset - (count - 1 - i));
    return toIso(d);
  });
}

function sumFunnel(analytics, dates, channel) {
  const total = Object.fromEntries(STEPS.map(s => [s, 0]));
  dates.forEach(date => {
    const funnel = analytics.days[date]?.funnel;
    if (!funnel) return;
    Object.entries(funnel).forEach(([ch, counts]) => {
      if (channel && ch !== channel) return;
      STEPS.forEach(s => { total[s] += counts[s] ?? 0; });
    });
  });
  return total;
}

const toFunnelShape = (t) => ({
  sessions_total: t.session_start,
  lote_click: t.lote_click,
  form_open: t.form_open,
  form_submit: t.form_submit,
  whatsapp_click: t.whatsapp_click,
});

export function selectFunnel(analytics, days, channel = null) {
  if (!analytics) return null;
  const dates = windowDays(analytics.today, 0, days);

  // La lista de canales refleja el período completo, sin el filtro aplicado,
  // para que el selector no pierda opciones al filtrar.
  const byChannel = {};
  dates.forEach(date => {
    Object.entries(analytics.days[date]?.funnel ?? {}).forEach(([ch, counts]) => {
      byChannel[ch] = (byChannel[ch] ?? 0) + (counts.session_start ?? 0);
    });
  });

  return {
    ...toFunnelShape(sumFunnel(analytics, dates, channel)),
    channels: Object.entries(byChannel)
      .filter(([, sessions]) => sessions > 0)
      .map(([ch, sessions]) => ({ channel: ch, sessions }))
      .sort((a, b) => b.sessions - a.sessions),
    previous: toFunnelShape(sumFunnel(analytics, windowDays(analytics.today, days, days), channel)),
    daily_sessions: dates.map(date => ({
      date,
      sessions: sumFunnel(analytics, [date], channel).session_start,
    })),
  };
}

export function selectEngagement(analytics, days) {
  if (!analytics) return null;
  const dates = windowDays(analytics.today, 0, days);

  const depth = { sessions: 0, stages_sum: 0, duration_sum: 0, duration_count: 0 };
  const stages = {};
  const pois = {};
  const lots = {};
  const hours = Array.from({ length: 7 }, () => Array(24).fill(0));

  dates.forEach(date => {
    const day = analytics.days[date];
    if (!day) return;
    Object.keys(depth).forEach(k => { depth[k] += day.depth[k]; });
    Object.entries(day.stages).forEach(([id, s]) => {
      const acc = (stages[id] ??= { sessions: 0, dwell_sum: 0, dwell_count: 0 });
      acc.sessions += s.sessions;
      acc.dwell_sum += s.dwell_sum;
      acc.dwell_count += s.dwell_count;
    });
    Object.entries(day.pois).forEach(([id, clicks]) => { pois[id] = (pois[id] ?? 0) + clicks; });
    Object.entries(day.lots).forEach(([id, [sessions, contacts]]) => {
      const acc = (lots[id] ??= { sessions: 0, contacts: 0 });
      acc.sessions += sessions;
      acc.contacts += contacts;
    });
    // getUTCDay: 0 = domingo; la grilla va de lunes (0) a domingo (6).
    const weekday = (toDate(date).getUTCDay() + 6) % 7;
    day.hours.forEach((n, h) => { hours[weekday][h] += n; });
  });

  const lotActivity = Object.entries(lots)
    .map(([lote_id, a]) => ({ lote_id, ...a }))
    .sort((a, b) => b.sessions - a.sessions || b.contacts - a.contacts);
  const lotesConClick = lotActivity.filter(a => a.sessions > 0).length;
  const totalLotes = analytics.total_lotes;

  return {
    stage_visits: analytics.stages.map(({ id, name }) => {
      const s = stages[id];
      return {
        stage_id: id,
        stage_name: name,
        sessions: s?.sessions ?? 0,
        avg_dwell_seconds: s?.dwell_count ? Math.round((s.dwell_sum / s.dwell_count) * 10) / 10 : null,
      };
    }),
    poi_clicks: Object.entries(pois)
      .map(([poi_id, clicks]) => ({ poi_id, poi_name: analytics.poi_names[poi_id] ?? '', clicks }))
      .sort((a, b) => b.clicks - a.clicks),
    session_depth: {
      sessions_total: depth.sessions,
      avg_stages_per_session: depth.sessions ? Math.round((depth.stages_sum / depth.sessions) * 100) / 100 : 0,
      avg_duration_seconds: depth.duration_count ? Math.round((depth.duration_sum / depth.duration_count) * 10) / 10 : null,
    },
    lot_interest: {
      total_lotes: totalLotes,
      lotes_con_click: lotesConClick,
      lotes_sin_interaccion: Math.max(totalLotes - lotesConClick, 0),
      tasa_interaccion: totalLotes ? Math.round((lotesConClick / totalLotes) * 1000) / 1000 : 0,
    },
    sessions_by_hour: hours,
    lot_activity: lotActivity,
  };
}

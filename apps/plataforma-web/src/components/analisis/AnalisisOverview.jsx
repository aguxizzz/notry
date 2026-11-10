import { useMemo, useState } from 'react';
import { ChartTooltip, alignFor } from '../../ui/components';
import { formatNumber as fmt, formatPercent, formatDuration } from '../../utils/formatters';
import { describePeriod } from './analytics';
import './AnalisisOverview.css';

const MAX_SIGNALS = 3;

const periodLabel = describePeriod;

// Contactos = solicitudes enviadas + clicks a WhatsApp. Son sesiones distintas
// por evento, así que una sesión que hizo ambas cuenta dos veces: es una cota
// superior, igual que "No continuó" en el embudo es una cota inferior.
function contactsOf(stats, hasWhatsapp) {
  if (!stats) return null;
  return stats.form_submit + (hasWhatsapp ? stats.whatsapp_click : 0);
}

/* `previous` solo existe si el backend ya devuelve el período anterior; sin
   él (o sin actividad previa) no hay variación que mostrar. */
function Delta({ current, previous, days, unit = 'pct' }) {
  if (current == null || previous == null) return null;
  if (unit === 'pct' && previous === 0) {
    return <span className="ov-kpi__delta">sin actividad en el período anterior</span>;
  }
  const diff = unit === 'pts' ? current - previous : ((current - previous) / previous) * 100;
  const rounded = unit === 'pts' ? Math.abs(diff).toLocaleString('es-AR', { maximumFractionDigits: 1 }) : Math.round(Math.abs(diff));
  const dir = Math.abs(diff) < 0.05 ? 'flat' : diff > 0 ? 'up' : 'down';
  return (
    <span className={`ov-kpi__delta ov-kpi__delta--${dir}`}>
      <b>{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='} {rounded}{unit === 'pts' ? ' pts' : '%'}</b>
      {' '}{days === 1 ? 'vs ayer' : `vs ${days} días previos`}
    </span>
  );
}

// T12:00 so the ISO date never shifts a day when parsed in the local timezone.
const parseDay = (iso) => new Date(`${iso}T12:00:00`);

function Sparkline({ series }) {
  const W = 400;
  const H = 84;
  const [hoverIdx, setHoverIdx] = useState(null);
  // Plot's screen rect at the last mousemove, to place the (portaled) tooltip.
  const [plotRect, setPlotRect] = useState(null);
  const values = series.map(d => d.sessions);
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - 6 - (v / max) * (H - 14),
  ]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const peakIdx = values.indexOf(Math.max(...values));
  const fmtDay = (iso) => parseDay(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

  // The whole plot area is the hitbox: the mouse's x picks the nearest day,
  // so there's no need to aim at the 2px line itself.
  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setPlotRect(rect);
    setHoverIdx(Math.round(fraction * (values.length - 1)));
  };

  const hovered = hoverIdx != null ? series[hoverIdx] : null;
  const hoverFraction = hoverIdx != null ? hoverIdx / (values.length - 1) : 0;
  // The svg stretches horizontally (preserveAspectRatio="none") but keeps its
  // 84px height, so the point's y in px is the same as in viewBox units.
  const hoverY = hoverIdx != null ? pts[hoverIdx][1] : 0;

  return (
    <>
      <div className="ov-spark__plot" onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}>
        <svg className="ov-spark__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="ov-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent-color)" stopOpacity=".28" />
              <stop offset="1" stopColor="var(--accent-color)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#ov-spark-fill)" />
          <path d={line} fill="none" stroke="var(--accent-color)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {hovered && (
          <>
            {/* Guide and dot are HTML, not svg: the stretched svg would turn the dot into an ellipse. */}
            <span className="ov-spark__guide" style={{ left: `${hoverFraction * 100}%` }} aria-hidden="true" />
            <span className="ov-spark__dot" style={{ left: `${hoverFraction * 100}%`, top: `${hoverY}px` }} aria-hidden="true" />
            <ChartTooltip
              x={plotRect.left + hoverFraction * plotRect.width}
              y={plotRect.top + hoverY}
              align={alignFor(hoverFraction)}
              onDismiss={() => setHoverIdx(null)}
            >
              <span className="chart-tooltip__muted">
                {parseDay(hovered.date).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <span className="chart-tooltip__title">
                {fmt(hovered.sessions)} {hovered.sessions === 1 ? 'visita' : 'visitas'}
              </span>
            </ChartTooltip>
          </>
        )}
      </div>
      <div className="ov-spark__axis">
        <span>{fmtDay(series[0].date)}</span>
        {max > 0 && <span>pico: {fmt(values[peakIdx])} el {fmtDay(series[peakIdx].date)}</span>}
        <span>hoy</span>
      </div>
    </>
  );
}

/* Señales: reglas sobre la actividad por lote del período (sesiones que lo
   abrieron / contactaron, de /engagement) + estado/manzana del visor + el
   embudo del período. Cada regla exige un mínimo de volumen: con pocos datos
   un porcentaje o un "más mirado" no dice nada, y es preferible un hueco
   ("actividad insuficiente") a una señal sin sustento. Se muestran las
   primeras MAX_SIGNALS que apliquen, en orden de prioridad. */
const MIN_FUNNEL_SESSIONS = 20; // sesiones del período para leer el embudo
const MIN_STEP_BASE = 10;       // sesiones que llegaron al paso que se evalúa
const MIN_DROP_RATE = 0.5;      // por debajo, la caída no es "el" problema
const MIN_LOT_SESSIONS = 5;     // sesiones para hablar de interés en un lote
const MIN_LOT_CONTACTS = 2;     // consultas para hablar de tracción
const MIN_COLD_EXPOSURE = 30;   // sesiones en lotes antes de marcar lotes "fríos"

const statusLabel = (status) => (status === 'sold' ? 'vendido' : 'reservado');
const plural = (n, one, many) => (n === 1 ? one : many);

function frictionSignal(funnel, hasWhatsapp) {
  if (!funnel || funnel.sessions_total < MIN_FUNNEL_SESSIONS) return null;
  const asked = funnel.form_open + (hasWhatsapp ? funnel.whatsapp_click : 0);
  const drops = [
    {
      base: funnel.sessions_total,
      lost: funnel.sessions_total - funnel.lote_click,
      title: (p) => `El ${p}% entra al visor y se va sin tocar ningún lote`,
      body: 'Puede faltar una invitación clara a explorar, o los lotes no se distinguen bien en la vista inicial.',
    },
    {
      base: funnel.lote_click,
      lost: funnel.lote_click - asked,
      title: (p) => `El ${p}% mira la ficha de un lote y no pide información`,
      body: 'Revisá que la ficha tenga precio, fotos y medidas: es el paso donde más interesados se pierden.',
    },
    {
      base: funnel.form_open,
      lost: funnel.form_open - funnel.form_submit,
      title: (p) => `El ${p}% abre el formulario y no lo envía`,
      body: hasWhatsapp
        ? 'Un formulario más corto, o destacar WhatsApp como alternativa, puede recuperar parte de esos contactos.'
        : 'Un formulario más corto, o sumar WhatsApp como canal, puede recuperar parte de esos contactos.',
    },
  ]
    .filter(d => d.base >= MIN_STEP_BASE)
    .map(d => ({ ...d, rate: Math.max(d.lost, 0) / d.base }))
    .filter(d => d.rate >= MIN_DROP_RATE);
  const worst = drops.sort((a, b) => b.rate - a.rate)[0];
  if (!worst) return null;
  return { tone: 'attention', tag: 'Fricción', title: worst.title(Math.round(worst.rate * 100)), body: worst.body };
}

function buildSignals({ periodLots, funnel, hasWhatsapp }) {
  const signals = [];
  const friction = frictionSignal(funnel, hasWhatsapp);
  if (friction) signals.push(friction);

  // Sin actividad por lote del período (backend viejo) no hay señales de
  // lotes: los clics acumulados no respetan el período y llevaban a señales
  // que no cambiaban nunca.
  if (periodLots) {
    const available = periodLots.filter(l => l.status === 'available');
    const byInterest = [...periodLots].sort((a, b) => b.sessions - a.sessions);

    const unanswered = available
      .filter(l => l.sessions >= MIN_LOT_SESSIONS && l.contacts === 0)
      .sort((a, b) => b.sessions - a.sessions)[0];
    if (unanswered) {
      signals.push({
        tone: 'opportunity',
        tag: 'Oportunidad',
        title: `${fmt(unanswered.sessions)} visitantes abrieron ${unanswered.name} y nadie consultó`,
        body: 'Interesa pero no convence: revisá precio, fotos y medidas de su ficha, o destacalo con una publicación.',
      });
    }

    const traction = available
      .filter(l => l.contacts >= MIN_LOT_CONTACTS)
      .sort((a, b) => b.contacts - a.contacts || b.sessions - a.sessions)[0];
    if (traction) {
      signals.push({
        tone: 'demand',
        tag: 'Tracción',
        title: `${traction.name} suma ${fmt(traction.contacts)} consultas en el período`,
        body: `Es el disponible con más consultas (${fmt(traction.sessions)} ${plural(traction.sessions, 'visita', 'visitas')} a su ficha). Priorizá el seguimiento de esos contactos.`,
      });
    }

    const taken = byInterest
      .slice(0, 5)
      .find(l => l.sessions >= MIN_LOT_SESSIONS && (l.status === 'sold' || l.status === 'reserved'));
    if (taken) {
      const neighbors = taken.manzana
        ? available.filter(l => l.manzana === taken.manzana).slice(0, 3)
        : [];
      signals.push({
        tone: 'demand',
        tag: 'Demanda',
        title: `${taken.name} sigue entre los más mirados aunque está ${statusLabel(taken.status)}`,
        body: neighbors.length > 0
          ? `Disponibles en la misma manzana para ofrecer: ${neighbors.map(l => l.name).join(', ')}.`
          : 'Ofrecé lotes disponibles de características similares a quienes pregunten por él.',
      });
    }

    // Solo si hubo exposición suficiente y los "fríos" son la minoría: si la
    // mitad del loteo está sin clics, el problema es de tráfico, no de lotes.
    const exposure = periodLots.reduce((sum, l) => sum + l.sessions, 0);
    const cold = available.filter(l => l.sessions === 0);
    if (exposure >= MIN_COLD_EXPOSURE && cold.length > 0 && cold.length <= available.length / 2) {
      signals.push({
        tone: 'attention',
        tag: 'Atención',
        title: `${cold.length} ${plural(cold.length, 'lote disponible no recibió', 'lotes disponibles no recibieron')} visitas en el período`,
        body: `${cold.slice(0, 4).map(l => l.name).join(', ')}${cold.length > 4 ? '…' : ''}. Un punto de interés cerca o una foto propia puede ayudar a que se vean.`,
      });
    }
  }

  return signals.slice(0, MAX_SIGNALS);
}

export default function AnalisisOverview({
  selectedLoteo,
  analisisLastDays: days,
  funnelStats,
  engagementStats,
  clicksData,
  visorData,
  hasWhatsapp,
}) {
  const lots = useMemo(() => {
    const clicksById = Object.fromEntries(clicksData.map(c => [c.lote_uuid, c.clicks]));
    const annotations = visorData?.annotations?.filter(a => a.type === 'polygon') ?? [];
    if (annotations.length === 0) {
      return clicksData.map(c => ({ id: c.lote_uuid, name: c.name, clicks: c.clicks, status: null, manzana: null }));
    }
    return annotations.map(a => ({
      id: a.uuid,
      name: a.tooltip,
      clicks: clicksById[a.uuid] ?? 0,
      status: a.status,
      manzana: a.manzana,
    }));
  }, [clicksData, visorData]);

  const sessions = funnelStats?.sessions_total ?? null;
  const contacts = contactsOf(funnelStats, hasWhatsapp);
  const prev = funnelStats?.previous ?? null;
  const prevContacts = contactsOf(prev, hasWhatsapp);
  const conversion = sessions ? (contacts / sessions) * 100 : null;
  const prevConversion = prev?.sessions_total ? (prevContacts / prev.sessions_total) * 100 : null;
  const avgDuration = engagementStats?.session_depth?.avg_duration_seconds ?? null;

  // Lotes con su actividad del período (sesiones/contactos). null si el
  // backend todavía no manda lot_activity.
  const lotActivity = engagementStats?.lot_activity;
  const periodLots = useMemo(() => {
    if (!Array.isArray(lotActivity)) return null;
    const byId = Object.fromEntries(lotActivity.map(a => [a.lote_id, a]));
    return lots.map(l => ({ ...l, sessions: byId[l.id]?.sessions ?? 0, contacts: byId[l.id]?.contacts ?? 0 }));
  }, [lots, lotActivity]);

  // "Más mirado" del período si está disponible; si no, clics acumulados.
  const interestOf = periodLots ? (l) => l.sessions : (l) => l.clicks;
  const interestLots = periodLots ?? lots;
  const topLot = interestLots.reduce((best, l) => (interestOf(l) > (best ? interestOf(best) : 0) ? l : best), null);
  const topManzana = (() => {
    const sums = {};
    interestLots.forEach(l => { if (l.manzana && interestOf(l) > 0) sums[l.manzana] = (sums[l.manzana] ?? 0) + interestOf(l); });
    const entries = Object.entries(sums);
    return entries.length > 1 ? entries.sort((a, b) => b[1] - a[1])[0][0] : null;
  })();

  const signals = useMemo(
    () => buildSignals({ periodLots, funnel: funnelStats, hasWhatsapp }),
    [periodLots, funnelStats, hasWhatsapp],
  );

  const series = funnelStats?.daily_sessions;
  const showSpark = Array.isArray(series) && series.length > 1;
  const loading = !funnelStats;
  // La animación de entrada va solo con el cambio de loteo: cambiar de período
  // es instantáneo (se calcula en memoria) y reanimar en cada click molesta.
  const fadeKey = selectedLoteo?.id;

  return (
    <>
      <section className={`ov-lead${showSpark ? '' : ' ov-lead--solo'}`}>
        <div>
          <p className="ov-eyebrow">{selectedLoteo?.name ?? 'Sin loteo'} · {periodLabel(days)}</p>
          <p className="ov-sentence" key={fadeKey} aria-live="polite">
            {loading ? (
              <span className="ov-sentence__muted">Preparando la lectura del período…</span>
            ) : sessions === 0 ? (
              <>{days === 1 ? 'Hoy nadie entró al visor todavía.' : `Nadie entró al visor en ${periodLabel(days)}.`}</>
            ) : (
              <>
                <b>{fmt(sessions)}</b> {sessions === 1 ? 'persona entró' : 'personas entraron'} al visor
                {contacts === 0
                  ? ' pero nadie te contactó todavía. '
                  : <> y <b>{fmt(contacts)}</b> {contacts === 1 ? 'te contactó' : 'te contactaron'}. </>}
                {topLot && (
                  <span className="ov-sentence__muted">
                    {topManzana ? <>El interés se concentra en la manzana {topManzana}, y el </> : 'El '}
                    lote <b>{topLot.name}</b> es el más mirado.
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        {showSpark && (
          <div className="ov-spark">
            <div className="ov-spark__head">
              <span>Visitas al visor por día</span>
              <strong>{fmt(sessions)} en total</strong>
            </div>
            <Sparkline series={series} />
          </div>
        )}
      </section>

      <section className="ov-kpis" key={`k-${fadeKey}`} aria-label="Indicadores del período">
        <div className="ov-kpi">
          <span className="ov-kpi__label">Visitas al visor</span>
          <span className="ov-kpi__value">{loading ? '—' : fmt(sessions)}</span>
          <Delta current={sessions} previous={prev?.sessions_total} days={days} />
        </div>
        <div className="ov-kpi">
          <span className="ov-kpi__label">Contactos desde el visor</span>
          <span className="ov-kpi__value">{loading ? '—' : fmt(contacts)}</span>
          <Delta current={contacts} previous={prevContacts} days={days} />
        </div>
        <div className="ov-kpi">
          <span className="ov-kpi__label">Conversión visita → contacto</span>
          <span className="ov-kpi__value">{conversion == null ? '—' : formatPercent(conversion)}</span>
          <Delta current={conversion} previous={prevConversion} days={days} unit="pts" />
        </div>
        <div className="ov-kpi">
          <span className="ov-kpi__label">Tiempo promedio en el visor</span>
          <span className="ov-kpi__value">{formatDuration(avgDuration) ?? '—'}</span>
          <span className="ov-kpi__delta">estimado, cota inferior</span>
        </div>
      </section>

      {signals.length > 0 && (
        <section className="ov-signals-block">
          <div className="ov-section-h">
            <h2>Señales</h2>
            <p>Lo que merece una acción en este loteo</p>
          </div>
          <div className="ov-signals">
            {signals.map(s => (
              <article key={s.tag} className={`ov-signal ov-signal--${s.tone}`}>
                <span className="ov-signal__tag">{s.tag}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
            {/* Siempre 3 columnas: los huecos se completan con un placeholder
                en vez de estirar las señales a todo el ancho. */}
            {Array.from({ length: MAX_SIGNALS - signals.length }, (_, i) => (
              <div key={`empty-${i}`} className="ov-signal ov-signal--empty">
                <p>Todavía no hay actividad suficiente para detectar otra señal en este período.</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

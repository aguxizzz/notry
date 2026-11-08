import { useState } from 'react';
import { Panel, SectionHeader, Loader, Select } from '../../ui/components';
import { CHANNEL_DISPLAY } from '../../constants/display';
import { formatNumber as fmt, formatPercent as fmtPct } from '../../utils/formatters';
import { describePeriod } from './analytics';
import './FunnelCard.css';

const pctOf = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

// Cuatro pasos en columnas: cada columna muestra lo que sigue avanzando, lo
// que salió por WhatsApp y lo que se perdió en ese paso, todo a escala del
// total de sesiones (la primera barra siempre es 100%).
//
// Formulario y WhatsApp NO son exhaustivos: una sesión puede abrir el
// formulario, escribir por WhatsApp, ambas o ninguna. Por eso "se fueron" en
// el paso 3 (click - form - whatsapp) es una aproximación que solo puede
// sub-contar, nunca sobre-contar — es lo mejor disponible sin que el backend
// informe el solapamiento entre ambos.
//
// `hasWhatsapp` saca el canal entero (no lo pone en 0) cuando la org no tiene
// número configurado: nunca se le ofreció al visitante, y una barra en 0 se
// leería como "nadie lo usó".
function buildSteps(stats, hasWhatsapp) {
  const wa = hasWhatsapp ? stats.whatsapp_click : 0;
  const total = stats.sessions_total;
  return [
    {
      label: 'Entraron al visor',
      value: total,
      parts: [{ kind: 'advance', value: total, label: 'Entraron al visor' }],
    },
    {
      label: 'Tocaron un lote',
      value: stats.lote_click,
      parts: [
        { kind: 'advance', value: stats.lote_click, label: 'Tocaron un lote' },
        { kind: 'lost', value: Math.max(total - stats.lote_click, 0), label: 'Se fueron sin tocar un lote' },
      ],
      lost: Math.max(total - stats.lote_click, 0),
      why: 'miraron y se fueron',
    },
    {
      label: 'Pidieron información',
      value: stats.form_open + wa,
      parts: [
        { kind: 'advance', value: stats.form_open, label: 'Abrieron el formulario' },
        ...(hasWhatsapp ? [{ kind: 'whatsapp', value: wa, label: 'Escribieron por WhatsApp' }] : []),
        { kind: 'lost', value: Math.max(stats.lote_click - stats.form_open - wa, 0), label: 'Vieron la ficha y no siguieron' },
      ],
      lost: Math.max(stats.lote_click - stats.form_open - wa, 0),
      why: 'vieron la ficha y no siguieron',
    },
    {
      label: 'Te contactaron',
      value: stats.form_submit + wa,
      parts: [
        { kind: 'advance', value: stats.form_submit, label: 'Enviaron la solicitud' },
        ...(hasWhatsapp ? [{ kind: 'whatsapp', value: wa, label: 'Escribieron por WhatsApp' }] : []),
        { kind: 'lost', value: Math.max(stats.form_open - stats.form_submit, 0), label: 'Abrieron el formulario y no lo enviaron' },
      ],
      lost: Math.max(stats.form_open - stats.form_submit, 0),
      why: 'abandonaron el formulario',
    },
  ];
}

export default function FunnelCard({
  selectedLoteo,
  funnelStats,
  analisisLastDays,
  isLoading = false,
  hasWhatsapp = true,
  selectedChannel = null,
  onChannelChange,
}) {
  // Switching the channel filter (or the loteo/period) means a new fetch —
  // funnelStats goes back to whatever is cached for that combination (often
  // nothing yet). Keeping the last successfully loaded stats around lets the
  // columns stay on screen (dimmed, see funnel-body.is-refreshing) instead of
  // the whole card collapsing to a spinner while it loads, which was
  // shrinking the page and yanking the scroll position upward.
  const [displayStats, setDisplayStats] = useState(funnelStats);
  if (funnelStats && funnelStats !== displayStats) {
    setDisplayStats(funnelStats);
  }

  const hasData = !!displayStats && displayStats.sessions_total > 0;
  const isRefreshing = isLoading && hasData;
  const steps = hasData ? buildSteps(displayStats, hasWhatsapp) : [];
  const total = displayStats?.sessions_total ?? 0;

  return (
    <Panel as="section" className="funnel-card" flush>
      <SectionHeader
        className="funnel-card-header"
        eyebrow="Embudo de conversión"
        title="Del ingreso al visor a la solicitud"
        sub={`Sesiones distintas — ${describePeriod(analisisLastDays)} —${selectedLoteo?.name ?? 'selecciona un loteo'}${selectedChannel ? ` — canal: ${CHANNEL_DISPLAY[selectedChannel] ?? selectedChannel}` : ''}`}
        actions={
          hasData && displayStats.channels?.length > 1 && (
            <Select
              id="funnel-channel-filter"
              ariaLabel="Filtrar el embudo por canal de origen"
              className="funnel-channel-select"
              size="sm"
              value={selectedChannel ?? ''}
              onChange={(ev) => onChannelChange?.(ev.target.value || null)}
              options={[
                { value: '', label: 'Todos los canales' },
                ...displayStats.channels.map((c) => ({
                  value: c.channel,
                  label: `${CHANNEL_DISPLAY[c.channel] ?? c.channel} · ${fmt(c.sessions)}`,
                })),
              ]}
            />
          )
        }
      />

      {!hasData && isLoading ? (
        <div className="funnel-loading"><Loader /></div>
      ) : !hasData ? (
        <p className="funnel-empty">Sin actividad registrada para este loteo en el período.</p>
      ) : (
        <div className={`funnel-body${isRefreshing ? ' is-refreshing' : ''}`}>
          {isRefreshing && (
            <div className="funnel-refresh-overlay" aria-hidden="true"><Loader /></div>
          )}
          <ol className="funnel-steps">
            {steps.map((step, i) => (
              <li key={step.label} className="funnel-step">
                <span className="funnel-step-label">{step.label}</span>
                <span className="funnel-step-value">{fmt(step.value)}</span>
                <span className="funnel-step-pct">{i === 0 ? '100%' : `${fmtPct(pctOf(step.value, total))} del total`}</span>
                <div className="funnel-step-bars" aria-hidden="true">
                  {step.parts.map((part) => (
                    <div
                      key={part.label}
                      className={`funnel-step-bar funnel-step-bar--${part.kind}`}
                      style={{ height: `${Math.max(pctOf(part.value, total), part.value > 0 ? 1.5 : 0.75)}%` }}
                      title={`${part.label}: ${fmt(part.value)}`}
                    />
                  ))}
                </div>
                <span className="funnel-step-drop">
                  {step.lost > 0 && <><b>−{fmt(step.lost)}</b> {step.why}</>}
                </span>
              </li>
            ))}
          </ol>
          <div className="funnel-legend">
            <span className="funnel-legend-item"><span className="funnel-legend-swatch funnel-step-bar--advance" />Siguen avanzando</span>
            {hasWhatsapp && (
              <span className="funnel-legend-item"><span className="funnel-legend-swatch funnel-step-bar--whatsapp" />Escribieron por WhatsApp</span>
            )}
            <span className="funnel-legend-item"><span className="funnel-legend-swatch funnel-step-bar--lost" />Se fueron en este paso</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

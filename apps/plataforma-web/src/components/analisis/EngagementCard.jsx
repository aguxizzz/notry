import { useState } from 'react';
import { Panel, SectionHeader, Loader, ChartTooltip, alignFor } from '../../ui/components';
import { getHeatColor } from '../../utils/heatColor';
import { formatNumber as fmt, formatDuration } from '../../utils/formatters';
import { describePeriod } from './analytics';
import './EngagementCard.css';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const WEEKDAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function BarList({ rows }) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return (
    <ul className="engagement-bar-list">
      {rows.map((r) => (
        <li key={r.key} className="engagement-bar-row">
          <span className="engagement-bar-label">{r.label}</span>
          <span className="engagement-bar-track">
            <span className="engagement-bar-fill" style={{ width: max > 0 ? `${(r.value / max) * 100}%` : '0%' }} />
          </span>
          <span className="engagement-bar-value">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}

// Matriz 7x24 (lunes primero, hora local AR) de inicios de sesión.
function HourGrid({ matrix }) {
  const max = matrix.reduce((m, row) => Math.max(m, ...row), 0);
  // Hovered cell (day, hour) + its screen rect for the tooltip.
  const [hover, setHover] = useState(null);
  return (
    // Leaving clears only on the whole grid, not per cell: crossing the 3px
    // gaps between cells keeps the last tooltip instead of flickering.
    <div
      className="engagement-hours"
      role="img"
      aria-label="Sesiones por día de la semana y hora"
      onMouseLeave={() => setHover(null)}
    >
      {matrix.map((row, d) => (
        <div key={WEEKDAYS[d]} className="engagement-hours-row">
          <span className="engagement-hours-day">{WEEKDAYS[d]}</span>
          {row.map((v, h) => (
            <span
              key={h}
              className={`engagement-hours-cell${hover?.d === d && hover?.h === h ? ' is-hovered' : ''}`}
              style={{ background: getHeatColor(v, max) }}
              onMouseEnter={(e) => setHover({ d, h, v, rect: e.currentTarget.getBoundingClientRect() })}
            />
          ))}
        </div>
      ))}
      {hover && (
        <ChartTooltip
          x={hover.rect.left + hover.rect.width / 2}
          y={hover.rect.top}
          align={alignFor(hover.h / 23)}
          onDismiss={() => setHover(null)}
        >
          <span className="chart-tooltip__muted">{WEEKDAYS_FULL[hover.d]} de {hover.h} a {hover.h + 1} h</span>
          <span className="chart-tooltip__title">
            {fmt(hover.v)} {hover.v === 1 ? 'sesión' : 'sesiones'}
          </span>
        </ChartTooltip>
      )}
      <div className="engagement-hours-row engagement-hours-axis" aria-hidden="true">
        <span className="engagement-hours-day" />
        {Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 6 === 0 ? `${h}h` : ''}</span>)}
      </div>
    </div>
  );
}

export default function EngagementCard({
  selectedLoteo,
  engagementStats,
  analisisLastDays,
  isLoading = false,
}) {
  const hasData = !!engagementStats;
  const sessionDepth = engagementStats?.session_depth ?? null;
  const lotInterest = engagementStats?.lot_interest ?? null;
  const stageVisits = engagementStats?.stage_visits ?? [];
  const poiClicks = engagementStats?.poi_clicks ?? [];
  const hourMatrix = engagementStats?.sessions_by_hour ?? null;
  const isEmpty = !hasData || (sessionDepth?.sessions_total ?? 0) === 0;
  const poiTotal = poiClicks.reduce((s, p) => s + p.clicks, 0);

  return (
    <Panel as="section" className="engagement-card" flush>
      <SectionHeader
        className="engagement-card-header"
        eyebrow="Interacción"
        title="Cómo exploran el visor"
        sub={`Hábitos de los visitantes dentro del visor — ${describePeriod(analisisLastDays)} — ${selectedLoteo?.name ?? 'selecciona un loteo'}`}
      />

      {isLoading && !hasData ? (
        <div className="engagement-loading"><Loader /></div>
      ) : isEmpty ? (
        <p className="engagement-empty">Sin actividad de navegación registrada para este período.</p>
      ) : (
        <div className={`engagement-body${hourMatrix ? '' : ' engagement-body--single'}`}>
          {hourMatrix && (
            <div className="engagement-col">
              <h4 className="engagement-section-title">Cuándo entran</h4>
              <p className="engagement-section-sub">
                Sesiones por día de la semana y hora. Útil para programar publicaciones y respuestas.
              </p>
              <HourGrid matrix={hourMatrix} />
            </div>
          )}

          <div className="engagement-col">
            <h4 className="engagement-section-title">Qué miran</h4>
            <p className="engagement-section-sub">Profundidad de la visita y puntos de interés más abiertos</p>

            <div className="engagement-stats">
              <div className="engagement-stat">
                <span>Etapas por visita</span>
                <strong>{sessionDepth.avg_stages_per_session?.toLocaleString('es-AR') ?? '—'}</strong>
              </div>
              <div className="engagement-stat" title="Porcentaje de lotes que recibieron al menos un click en el período">
                <span>Lotes con interacción</span>
                <strong>{lotInterest ? `${Math.round(lotInterest.tasa_interaccion * 100)}%` : '—'}</strong>
              </div>
              <div className="engagement-stat">
                <span>Puntos de interés abiertos</span>
                <strong>{fmt(poiTotal)}</strong>
              </div>
            </div>

            {stageVisits.length > 1 && (
              <div className="engagement-section">
                <h5 className="engagement-list-title">Navegación entre etapas</h5>
                <BarList
                  rows={stageVisits.map((s) => ({
                    key: s.stage_id,
                    label: s.stage_name,
                    value: s.sessions,
                    // Permanencia: aproximación v1 (gap entre eventos de
                    // navegación), no una medición activa de tiempo.
                    display: `${fmt(s.sessions)} ses.${s.avg_dwell_seconds != null ? ` · ${formatDuration(s.avg_dwell_seconds)}` : ''}`,
                  }))}
                />
              </div>
            )}

            {poiClicks.length > 0 && (
              <div className="engagement-section">
                <h5 className="engagement-list-title">Puntos de interés más abiertos</h5>
                <BarList
                  rows={poiClicks.slice(0, 6).map((p) => ({
                    key: p.poi_id,
                    label: p.poi_name || 'Sin nombre',
                    value: p.clicks,
                    display: fmt(p.clicks),
                  }))}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

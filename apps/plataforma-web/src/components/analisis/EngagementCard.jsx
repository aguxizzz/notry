import { Panel, SectionHeader, Loader } from '../../ui/components';
import './EngagementCard.css';

const fmt = (n) => (n ?? 0).toLocaleString('es-AR');

// `seconds` acá siempre es la aproximación v1 (gap entre eventos de
// navegación, ver plans/visor-interaction-tracking.md) — nunca una medición
// activa de tiempo. El label "estimado" en la UI es lo que lo deja claro,
// no el formato en sí.
function fmtDuration(seconds) {
  if (seconds == null) return '—';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
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
  const isEmpty = !hasData || (sessionDepth?.sessions_total ?? 0) === 0;

  const maxStageSessions = stageVisits.reduce((m, s) => Math.max(m, s.sessions), 0);
  const maxPoiClicks = poiClicks.reduce((m, p) => Math.max(m, p.clicks), 0);

  return (
    <Panel as="section" className="engagement-card" flush>
      <SectionHeader
        className="engagement-card-header"
        eyebrow="Interacción"
        title="Cómo exploran el visor"
        sub={`Navegación, POIs y tiempo en el visor — últimos ${analisisLastDays} días — ${selectedLoteo?.name ?? 'selecciona un loteo'}`}
      />

      {isLoading && !hasData ? (
        <div className="engagement-loading"><Loader /></div>
      ) : isEmpty ? (
        <p className="engagement-empty">Sin actividad de navegación registrada para este período.</p>
      ) : (
        <div className="engagement-body">
          <div className="engagement-stats">
            <div className="engagement-stat">
              <span className="engagement-stat-kicker"><span className="d" />Sesiones</span>
              <span className="engagement-stat-value">{fmt(sessionDepth.sessions_total)}</span>
            </div>
            <div className="engagement-stat">
              <span className="engagement-stat-kicker"><span className="d" />Etapas por sesión<small>promedio</small></span>
              <span className="engagement-stat-value">{sessionDepth.avg_stages_per_session ?? '—'}</span>
            </div>
            <div className="engagement-stat">
              <span className="engagement-stat-kicker"><span className="d" />Tiempo en el visor<small>estimado, cota inferior</small></span>
              <span className="engagement-stat-value">{fmtDuration(sessionDepth.avg_duration_seconds)}</span>
            </div>
            <div className="engagement-stat">
              <span className="engagement-stat-kicker"><span className="d" />Interacción por lote<small>% con al menos un click</small></span>
              <span className="engagement-stat-value">
                {lotInterest ? `${Math.round(lotInterest.tasa_interaccion * 100)}%` : '—'}
              </span>
            </div>
          </div>

          {stageVisits.length > 1 && (
            <div className="engagement-section">
              <h4 className="engagement-section-title">Navegación entre etapas</h4>
              <ul className="engagement-bar-list">
                {stageVisits.map((s) => (
                  <li key={s.stage_id} className="engagement-bar-row">
                    <span className="engagement-bar-label">{s.stage_name}</span>
                    <span className="engagement-bar-track">
                      <span
                        className="engagement-bar-fill"
                        style={{ width: maxStageSessions > 0 ? `${(s.sessions / maxStageSessions) * 100}%` : '0%' }}
                      />
                    </span>
                    <span className="engagement-bar-value">
                      {fmt(s.sessions)} ses.{s.avg_dwell_seconds != null ? ` · ${fmtDuration(s.avg_dwell_seconds)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {poiClicks.length > 0 && (
            <div className="engagement-section">
              <h4 className="engagement-section-title">Puntos de interés más clickeados</h4>
              <ul className="engagement-bar-list">
                {poiClicks.slice(0, 6).map((p) => (
                  <li key={p.poi_id} className="engagement-bar-row">
                    <span className="engagement-bar-label">{p.poi_name || 'Sin nombre'}</span>
                    <span className="engagement-bar-track">
                      <span
                        className="engagement-bar-fill engagement-bar-fill--poi"
                        style={{ width: maxPoiClicks > 0 ? `${(p.clicks / maxPoiClicks) * 100}%` : '0%' }}
                      />
                    </span>
                    <span className="engagement-bar-value">{fmt(p.clicks)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

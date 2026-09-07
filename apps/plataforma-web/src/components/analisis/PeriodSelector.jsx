import { Loader } from '../../ui/components';
import './PeriodSelector.css';

const TIME_OPTIONS = [1, 5, 10, 20, 30, 60];

const ORIGIN_LABELS = {
  visor_whatsapp: 'WhatsApp',
  visor_direct: 'Directo',
  visor_google: 'Google',
  visor_tiktok: 'TikTok',
  visor_facebook: 'Facebook',
  visor_youtube: 'YouTube',
  web_platform: 'Plataforma',
};

function topOrigin(leadsPorOrigen) {
  const entries = Object.entries(leadsPorOrigen ?? {});
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const [origin, count] = entries.reduce((max, entry) => (entry[1] > max[1] ? entry : max));
  return { label: ORIGIN_LABELS[origin] ?? origin, share: total > 0 ? Math.round((count / total) * 100) : 0 };
}

export default function PeriodSelector({
  analisisLastDays,
  onAnalisisLastDaysChange,
  reportStats,
  fadeState = 'visible',
}) {
  return (
    <section className="period-block">
      <div className="period-block-head">
        <div>
          <span className="period-block-eyebrow">Análisis de período</span>
          <h2 className="period-block-title">Rendimiento comercial</h2>
          <p className="period-block-sub">
            Mostrando datos de los últimos <strong>{analisisLastDays}</strong> días
          </p>
        </div>
      </div>

      <div
        className="picker-a picker-a-host"
        role="group"
        aria-label="Seleccionar período de análisis"
      >
        <span className="pa-lbl">Período</span>
        <div className="pa-opts">
          {TIME_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`pa-opt${analisisLastDays === d ? ' on' : ''}`}
              onClick={() => onAnalisisLastDaysChange?.(d)}
              aria-pressed={analisisLastDays === d}
              aria-label={`Últimos ${d} días`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {!reportStats ? (
        <div className="stats-loading">
          <Loader size="sm" />
        </div>
      ) : (() => {
        const conversion = reportStats.clicks > 0
          ? Math.round((reportStats.prospectos / reportStats.clicks) * 100)
          : null;
        const top = topOrigin(reportStats.leadsPorOrigen);
        return (
          <div className={`period-metrics period-metrics--${fadeState}`} aria-live="polite">
            <div className="period-metric period-metric--clicks">
              <span className="period-metric-kicker"><span className="d" />Clics en el visor</span>
              <span className="period-metric-value">{reportStats.clicks.toLocaleString('es-AR')}</span>
              <span className="period-metric-context">interés generado en el período</span>
            </div>

            <div className="period-metric period-metric--conversion">
              <span className="period-metric-kicker"><span className="d" />Tasa de conversión</span>
              <span className="period-metric-value">{conversion !== null ? `${conversion}%` : '—'}</span>
              <span className="period-metric-context">clics que derivan en contacto</span>
            </div>

            <div className="period-metric period-metric--channel">
              <span className="period-metric-kicker"><span className="d" />Canal principal</span>
              <span className="period-metric-value">{top ? top.label : '—'}</span>
              <span className="period-metric-context">{top ? `${top.share}% de los contactos` : 'sin contactos con origen'}</span>
            </div>
          </div>
        );
      })()}
    </section>
  );
}

import { Loader, SegmentedControl } from '../../ui/components';
import { CHANNEL_DISPLAY } from '../../constants/display';
import './PeriodSelector.css';

const TIME_OPTIONS = [1, 5, 10, 20, 30, 60];

function topOrigin(leadsPorOrigen) {
  const entries = Object.entries(leadsPorOrigen ?? {});
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const [origin, count] = entries.reduce((max, entry) => (entry[1] > max[1] ? entry : max));
  return { label: CHANNEL_DISPLAY[origin] ?? origin, share: total > 0 ? Math.round((count / total) * 100) : 0 };
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

      <SegmentedControl
        variant="underline"
        label="Período"
        ariaLabel="Seleccionar período de análisis"
        value={analisisLastDays}
        onChange={(d) => onAnalisisLastDaysChange?.(d)}
        options={TIME_OPTIONS.map(d => ({ value: d, label: `${d}d`, ariaLabel: `Últimos ${d} días` }))}
      />

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

import { Loader } from '../../ui/components';
import './PeriodSelector.css';

const TIME_OPTIONS = [1, 5, 10, 20, 30, 60];

const formatCurrency = (value) => `$${value.toLocaleString('es-AR')}`;

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
      ) : (
        <div className={`period-metrics period-metrics--${fadeState}`} aria-live="polite">
          <div className="period-metric period-metric--prospects">
            <span className="period-metric-kicker"><span className="d" />Prospectos creados</span>
            <span className="period-metric-value">{reportStats.prospectos.toLocaleString('es-AR')}</span>
            <span className="period-metric-context">en el período</span>
          </div>

          <div className="period-metric period-metric--revenue">
            <span className="period-metric-kicker"><span className="d" />Ventas</span>
            <span className="period-metric-value">{formatCurrency(reportStats.ventas)}</span>
            <span className="period-metric-context">valor acumulado</span>
          </div>

          <div className="period-metric period-metric--lots">
            <span className="period-metric-kicker"><span className="d" />Lotes vendidos</span>
            <span className="period-metric-value">{reportStats.lotesVendidos.toLocaleString('es-AR')}</span>
            <span className="period-metric-context">cierres confirmados</span>
          </div>
        </div>
      )}
    </section>
  );
}

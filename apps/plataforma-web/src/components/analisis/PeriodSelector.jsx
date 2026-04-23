import { Button, Loader } from '../../ui/components';
import StatCard from '../StatCard';

const TIME_OPTIONS = [1, 5, 10, 20, 30, 60];

export default function PeriodSelector({
  analisisLastDays,
  onAnalisisLastDaysChange,
  reportStats,
  fadeState,
}) {
  return (
    <div className="report-block">
      <span className="report-block-label">Análisis de período</span>

      <div
        className="report-time-selector"
        role="group"
        aria-label="Seleccionar período de análisis"
      >
        {TIME_OPTIONS.map(d => (
          <Button
            key={d}
            variant="outline"
            size="sm"
            className={analisisLastDays === d ? 'active' : ''}
            onClick={() => onAnalisisLastDaysChange?.(d)}
            aria-pressed={analisisLastDays === d}
            aria-label={`Últimos ${d} días`}
          >
            {d}d
          </Button>
        ))}
      </div>

      <p className="report-block-sub">
        Mostrando datos de los últimos <span className="text-emphasis">{analisisLastDays}</span> días
      </p>

      {!reportStats ? (
        <div className="stats-loading">
          <Loader size="sm" />
        </div>
      ) : (
        <div className={`report-stats-row analisis-fade-${fadeState}`}>
          <StatCard
            label="Prospectos en el período"
            value={reportStats.prospectos}
            color="var(--color-stat-info)"
          />
          <StatCard
            label="Ventas en el período"
            value={`$${reportStats.ventas.toLocaleString('es-AR')}`}
            color="var(--color-stat-success)"
          />
          <StatCard
            label="Lotes vendidos"
            value={reportStats.lotesVendidos}
            color="var(--color-danger)"
          />
        </div>
      )}
    </div>
  );
}
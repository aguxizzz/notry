import { useEffect, useState } from 'react';
import { Button, Loader } from '../../ui/components';
import './PeriodSelector.css';

const TIME_OPTIONS = [1, 5, 10, 20, 30, 60];
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const REEL_DIGITS = [...DIGITS, '0'];

const formatCurrency = value => `$${value.toLocaleString('es-AR')}`;

function RollingDigit({ digit, index }) {
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 580);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span
      className="period-metric-digit"
      style={{ '--digit': digit, '--char-index': index }}
      aria-hidden="true"
    >
      <span className={`period-metric-digit-reel${isEntering ? ' is-entering' : ''}`}>
        {REEL_DIGITS.map((reelDigit, reelIndex) => (
          <span key={`${reelDigit}-${reelIndex}`} className="period-metric-digit-item">
            {reelDigit}
          </span>
        ))}
      </span>
    </span>
  );
}

function RollingMetricValue({ value }) {
  const text = String(value);
  const chars = Array.from(text);
  let digitsToRight = chars.filter(char => Number.isInteger(Number(char))).length;

  return (
    <span className="period-metric-value" aria-label={text}>
      {chars.map((char, index) => {
        const digit = Number(char);
        const isDigit = Number.isInteger(digit);

        if (!isDigit) {
          return (
            <span key={`static-${char}-${index}`} className="period-metric-value-static" aria-hidden="true">
              {char}
            </span>
          );
        }

        digitsToRight -= 1;

        return <RollingDigit key={`digit-${digitsToRight}`} digit={digit} index={index} />;
      })}
    </span>
  );
}

export default function PeriodSelector({
  analisisLastDays,
  onAnalisisLastDaysChange,
  reportStats,
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
        <div className="period-metrics" aria-live="polite">
          <div className="period-metric period-metric--prospects">
            <span className="period-metric-kicker">Prospectos Creados</span>
            <RollingMetricValue value={reportStats.prospectos} />
            <span className="period-metric-context">en el periodo</span>
          </div>

          <div className="period-metric period-metric--revenue">
            <span className="period-metric-kicker">Ventas</span>
            <RollingMetricValue value={formatCurrency(reportStats.ventas)} />
            <span className="period-metric-context">valor acumulado</span>
          </div>

          <div className="period-metric period-metric--lots">
            <span className="period-metric-kicker">Lotes vendidos</span>
            <RollingMetricValue value={reportStats.lotesVendidos} />
            <span className="period-metric-context">cierres confirmados</span>
          </div>
        </div>
      )}
    </div>
  );
}

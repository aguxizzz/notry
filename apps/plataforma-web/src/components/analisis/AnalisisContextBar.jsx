import { useEffect, useRef } from 'react';
import './AnalisisContextBar.css';

// Días calendario que terminan hoy. El máximo (60) depende de ANALYTICS_DAYS
// del backend (120 = 60 + 60 para comparar con el período anterior).
const TIME_OPTIONS = [1, 5, 10, 20, 30, 60];

// Cuánto tiene que quedarse el mouse sobre una opción para contar como
// intención (y precargar). Sin esto, cruzar la barra de punta a punta
// dispararía los pedidos de todas las opciones que toca al pasar.
const INTENT_DELAY_MS = 120;

function PillGroup({ ariaLabel, options, value, onChange, onIntent, emptyMessage }) {
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const startIntent = (optionValue) => {
    if (!onIntent) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onIntent(optionValue), INTENT_DELAY_MS);
  };
  const cancelIntent = () => clearTimeout(timerRef.current);

  return (
    <div className="analisis-pills" role="group" aria-label={ariaLabel}>
      {options.length === 0 && emptyMessage ? (
        <span className="analisis-pills__empty">{emptyMessage}</span>
      ) : options.map(option => (
        <button
          type="button"
          key={option.value}
          className={option.value === value ? 'is-active' : ''}
          aria-pressed={option.value === value}
          aria-label={option.ariaLabel}
          onClick={() => onChange(option.value)}
          onPointerEnter={() => startIntent(option.value)}
          onPointerLeave={cancelIntent}
          onFocus={() => onIntent?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Barra superior sticky de Análisis: título + loteo + período. Reemplaza al
 * PageHeader para que los dos filtros que gobiernan toda la página queden
 * siempre a mano mientras se scrollea.
 */
export default function AnalisisContextBar({
  loteos,
  selectedLoteo,
  onSelectLoteo,
  analisisLastDays,
  onAnalisisLastDaysChange,
  onLoteoIntent,
}) {
  return (
    <header className="analisis-ctx">
      <h1 className="analisis-ctx__title">Análisis</h1>
      <PillGroup
        ariaLabel="Seleccionar loteo"
        value={selectedLoteo?.id}
        onChange={(id) => onSelectLoteo(loteos.find(loteo => loteo.id === id))}
        onIntent={onLoteoIntent}
        options={loteos.map(loteo => ({ value: loteo.id, label: loteo.name }))}
        emptyMessage="Sin loteos registrados"
      />
      <PillGroup
        ariaLabel="Seleccionar período de análisis"
        value={analisisLastDays}
        onChange={(d) => onAnalisisLastDaysChange?.(d)}
        options={TIME_OPTIONS.map(d => ({
          value: d,
          label: d === 1 ? 'Hoy' : `${d} días`,
          ariaLabel: d === 1 ? 'Hoy' : `Últimos ${d} días`,
        }))}
      />
    </header>
  );
}

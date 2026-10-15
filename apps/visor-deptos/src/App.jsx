import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Facade from './components/Facade.jsx';
import FloorPlan, { PlanBase } from './components/FloorPlan.jsx';
import FloorRail from './components/FloorRail.jsx';
import UnitPanel from './components/UnitPanel.jsx';
import { FLOOR_BY_ID, PROJECT_NAME, STATUS, availableCount, unitsOfFloor } from './data.js';

const NARROW_QUERY = '(max-width: 720px)';

function useIsNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW_QUERY);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(NARROW_QUERY).matches
  );
}

// Punto en pantalla del frente de un piso de la fachada (para el tooltip).
// Se mide el DOM: con la perspectiva el frente no cae exacto donde diría el
// encuadre 2D.
function floorScreenPoint(id) {
  const box = document.querySelector(`[data-front="${id}"]`).getBoundingClientRect();
  return { left: box.left, centerY: box.top + box.height / 2 };
}

function floorSummary(floor) {
  if (floor.kind !== 'units') return floor.summary;
  const total = unitsOfFloor(floor.id).length;
  const free = availableCount(floor.id);
  return free === 0 ? 'Sin unidades disponibles' : `${free} de ${total} disponibles`;
}

export default function App() {
  const isNarrow = useIsNarrow();
  const [view, setView] = useState('facade');
  const [floorId, setFloorId] = useState('4');
  // Plantas montadas: la activa más las que todavía están saliendo. `from` es
  // de dónde entró ('up' | 'down'), o null si se llegó desde la fachada.
  const [plans, setPlans] = useState([{ id: '4', from: null }]);
  // Cada entrada desde la fachada remonta la planta (re-anima los pines).
  const [entry, setEntry] = useState(0);
  // 'enter' (desde la fachada) o 'switch' (cambio de piso ya adentro).
  const [mode, setMode] = useState('enter');
  // La primera entrada a un piso es lenta; después todo va más rápido.
  const [quick, setQuick] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [hover, setHover] = useState(null);

  const floor = FLOOR_BY_ID[floorId];

  const handleHover = useCallback((id) => {
    setHover(id ? { id, ...floorScreenPoint(id) } : null);
  }, []);

  const goToFloor = useCallback(
    (id) => {
      setSelectedUnit(null);
      setHover(null);
      if (view === 'facade') {
        setPlans([{ id, from: null }]);
        setEntry((n) => n + 1);
        setMode('enter');
        setFloorId(id);
        setView('floor');
        return;
      }
      if (id === floorId) return;
      setMode('switch');
      const from = FLOOR_BY_ID[id].index > FLOOR_BY_ID[floorId].index ? 'up' : 'down';
      // Si el piso todavía está saliendo se reutiliza: vuelve desde donde esté.
      setPlans((list) => (list.some((p) => p.id === id) ? list : [...list, { id, from }]));
      setFloorId(id);
    },
    [view, floorId]
  );

  const dropPlan = useCallback((id) => {
    setPlans((list) => list.filter((p) => p.id !== id));
  }, []);

  const backToFacade = useCallback(() => {
    setSelectedUnit(null);
    setQuick(true);
    setView('facade');
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedUnit) setSelectedUnit(null);
      else if (view === 'floor') backToFacade();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedUnit, view, backToFacade]);

  const inFloor = view === 'floor';
  const hoverFloor = hover && FLOOR_BY_ID[hover.id];

  return (
    <div
      className="stage"
      data-view={view}
      data-mode={mode}
      data-quick={quick || undefined}
    >
      {/* Una sola definición del rayado de balcones para todas las plantas. */}
      <svg className="svg-defs" aria-hidden="true">
        <defs>
          <pattern id="plan-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(60,60,60,0.22)" strokeWidth="2" />
          </pattern>
        </defs>
      </svg>

      <PlanBase selectedUnit={inFloor ? selectedUnit : null} isNarrow={isNarrow} />

      <div className="layer layer--facade" inert={inFloor}>
        <Facade view={view} floorId={floorId} hoverId={hover?.id} onHover={handleHover} onEnter={goToFloor} />
      </div>

      <div className="layer layer--floor" inert={!inFloor}>
        {plans.map(({ id, from }) => {
          const item = FLOOR_BY_ID[id];
          const active = id === floorId;
          return (
            <FloorPlan
              key={`${id}-${entry}`}
              floor={item}
              pos={active ? 'in' : item.index > floor.index ? 'up' : 'down'}
              from={from}
              selectedUnit={active ? selectedUnit : null}
              isNarrow={isNarrow}
              onSelect={setSelectedUnit}
              onGone={() => dropPlan(id)}
            />
          );
        })}
      </div>

      {!inFloor && hoverFloor && (
        <div className="floor-tip glass" style={{ left: hover.left, top: hover.centerY }}>
          <strong>{hoverFloor.name}</strong>
          <span>{floorSummary(hoverFloor)}</span>
        </div>
      )}

      <header className="topbar">
        <button
          type="button"
          className={`icon-btn glass back-btn${inFloor ? ' is-visible' : ''}`}
          aria-label="Volver a la fachada"
          tabIndex={inFloor ? 0 : -1}
          onClick={backToFacade}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="brand glass">
          <span className="brand__mark" />
          <span>{PROJECT_NAME}</span>
        </div>
      </header>

      <div className={`floor-title glass${inFloor ? ' is-visible' : ''}`} aria-live="polite">
        <strong key={floorId}>{floor.name}</strong>
        <span>{floorSummary(floor)}</span>
      </div>

      <FloorRail
        activeId={inFloor ? floorId : null}
        hoverId={hover?.id}
        onHover={inFloor ? () => {} : handleHover}
        onPick={goToFloor}
      />

      <UnitPanel unit={selectedUnit} onClose={() => setSelectedUnit(null)} />

      <div className={`hint glass${inFloor ? '' : ' is-visible'}`}>Elegí un piso para ver sus unidades</div>

      <ul className={`legend glass${inFloor && floor.kind === 'units' ? ' is-visible' : ''}`}>
        {Object.entries(STATUS).map(([key, status]) => (
          <li key={key}>
            <i style={{ background: status.color }} />
            {status.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

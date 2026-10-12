import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Facade from './components/Facade.jsx';
import FloorPlan from './components/FloorPlan.jsx';
import FloorRail from './components/FloorRail.jsx';
import UnitPanel from './components/UnitPanel.jsx';
import { FACADE, FLOOR_BY_ID, PROJECT_NAME, STATUS, availableCount, unitsOfFloor } from './data.js';

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

// Punto en pantalla de un piso de la fachada. Replica el encuadre del SVG
// (xMidYMax slice) para no depender de medir el DOM mientras está escalado.
function floorScreenPoint(floor) {
  const scale = Math.max(window.innerWidth / FACADE.width, window.innerHeight / FACADE.height);
  const toX = (vx) => window.innerWidth / 2 + (vx - FACADE.width / 2) * scale;
  const toY = (vy) => window.innerHeight - (FACADE.height - vy) * scale;
  return {
    left: toX(FACADE.x),
    centerX: toX(FACADE.x + FACADE.w / 2),
    centerY: toY(floor.y + floor.h / 2),
  };
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
  const [slide, setSlide] = useState(null); // 'up' | 'down' al cambiar de piso
  const [leaving, setLeaving] = useState(null); // piso saliente durante el slide
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [hover, setHover] = useState(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  const floor = FLOOR_BY_ID[floorId];

  const handleHover = useCallback((id) => {
    setHover(id ? { id, ...floorScreenPoint(FLOOR_BY_ID[id]) } : null);
  }, []);

  const goToFloor = useCallback(
    (id) => {
      setSelectedUnit(null);
      setHover(null);
      if (view === 'facade') {
        const point = floorScreenPoint(FLOOR_BY_ID[id]);
        setOrigin({ x: point.centerX, y: point.centerY });
        setSlide(null);
        setLeaving(null);
        setFloorId(id);
        setView('floor');
        return;
      }
      if (id === floorId) return;
      const dir = FLOOR_BY_ID[id].index > FLOOR_BY_ID[floorId].index ? 'up' : 'down';
      setLeaving({ id: floorId, dir });
      setSlide(dir);
      setFloorId(id);
    },
    [view, floorId]
  );

  const backToFacade = useCallback(() => {
    const point = floorScreenPoint(FLOOR_BY_ID[floorId]);
    setOrigin({ x: point.centerX, y: point.centerY });
    setSelectedUnit(null);
    setLeaving(null);
    setView('facade');
  }, [floorId]);

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
      style={{ '--ox': `${origin.x}px`, '--oy': `${origin.y}px` }}
    >
      <div className="layer layer--facade" inert={inFloor}>
        <Facade hoverId={hover?.id} onHover={handleHover} onEnter={goToFloor} />
      </div>

      <div className="layer layer--floor" inert={!inFloor}>
        {leaving && (
          <FloorPlan
            key={`leaving-${leaving.id}`}
            floor={FLOOR_BY_ID[leaving.id]}
            motion={`exit-${leaving.dir}`}
            isNarrow={isNarrow}
            onMotionEnd={() => setLeaving(null)}
          />
        )}
        <FloorPlan
          key={floorId}
          floor={floor}
          motion={slide ? `enter-${slide}` : null}
          selectedUnit={selectedUnit}
          isNarrow={isNarrow}
          onSelect={setSelectedUnit}
        />
      </div>

      {!inFloor && hoverFloor && (
        <div className="floor-tip glass" style={{ left: hover.left, top: hover.centerY }} key={hover.id}>
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

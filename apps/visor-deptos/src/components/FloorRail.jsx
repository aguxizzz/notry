import { FLOORS, availableCount } from '../data.js';

const TOP_DOWN = [...FLOORS].reverse();

export default function FloorRail({ activeId, hoverId, onHover, onPick }) {
  return (
    <nav className="rail glass" aria-label="Pisos">
      <span className="rail__title">Pisos</span>
      {TOP_DOWN.map((floor) => {
        const free = floor.kind === 'units' ? availableCount(floor.id) : 0;
        return (
          <button
            key={floor.id}
            type="button"
            className={`rail__item${activeId === floor.id ? ' is-active' : ''}${hoverId === floor.id ? ' is-hover' : ''}`}
            aria-current={activeId === floor.id || undefined}
            onMouseEnter={() => onHover(floor.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(floor.id)}
            onBlur={() => onHover(null)}
            onClick={() => onPick(floor.id)}
          >
            <span>{floor.label}</span>
            {free > 0 && <span className="rail__dot" title={`${free} disponibles`} />}
          </button>
        );
      })}
    </nav>
  );
}

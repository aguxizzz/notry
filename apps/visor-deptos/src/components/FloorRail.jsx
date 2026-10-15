import { FLOORS, availableCount } from '../data.js';

const TOP_DOWN = [...FLOORS].reverse();

export default function FloorRail({ activeId, hoverId, onHover, onPick }) {
  const activeIndex = TOP_DOWN.findIndex((floor) => floor.id === activeId);

  return (
    <nav
      className="rail glass"
      aria-label="Pisos"
      onMouseLeave={() => onHover(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onHover(null);
      }}
    >
      <span className="rail__title">Pisos</span>
      <div className="rail__list">
        {activeIndex >= 0 && <span className="rail__indicator" style={{ '--i': activeIndex }} />}
        {TOP_DOWN.map((floor) => {
          const free = floor.kind === 'units' ? availableCount(floor.id) : 0;
          return (
            <button
              key={floor.id}
              type="button"
              className={`rail__item${activeId === floor.id ? ' is-active' : ''}${hoverId === floor.id ? ' is-hover' : ''}`}
              aria-current={activeId === floor.id || undefined}
              onMouseEnter={() => onHover(floor.id)}
              onFocus={() => onHover(floor.id)}
              onClick={() => onPick(floor.id)}
            >
              <span>{floor.label}</span>
              {free > 0 && <span className="rail__dot" title={`${free} disponibles`} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

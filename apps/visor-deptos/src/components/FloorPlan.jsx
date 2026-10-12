import { PLAN, STATUS, UNIT_SHAPES, ZONES, unitsOfFloor } from '../data.js';

// Encuadra la unidad en el área de pantalla que queda libre de UI: la ficha
// tapa la izquierda (desktop) o la mitad de abajo (mobile) y el selector de
// pisos la derecha.
function cameraFor(unit, isNarrow) {
  if (!unit) return 'translate(0px, 0px) scale(1)';
  const points = UNIT_SHAPES[unit.letter].points;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const unitW = Math.max(...xs) - Math.min(...xs);
  const unitH = Math.max(...ys) - Math.min(...ys);
  const cx = Math.min(...xs) + unitW / 2;
  const cy = Math.min(...ys) + unitH / 2;

  const W = window.innerWidth;
  const H = window.innerHeight;
  const free = isNarrow
    ? { left: 8, right: W - 92, top: 64, bottom: H * 0.44 - 8 }
    : { left: 404, right: W - 136, top: 72, bottom: H - 72 };
  const freeW = Math.max(free.right - free.left, 120);
  const freeH = Math.max(free.bottom - free.top, 120);

  // px de pantalla por unidad del viewBox (preserveAspectRatio "meet").
  const k = Math.min(W / PLAN.width, H / PLAN.height);
  const scale = Math.min(Math.max(Math.min((freeW * 0.82) / (unitW * k), (freeH * 0.82) / (unitH * k)), 1), 4);
  const targetX = PLAN.width / 2 + (free.left + freeW / 2 - W / 2) / k;
  const targetY = PLAN.height / 2 + (free.top + freeH / 2 - H / 2) / k;
  return `translate(${targetX - cx * scale}px, ${targetY - cy * scale}px) scale(${scale})`;
}

function Core() {
  const steps = Array.from({ length: 9 }, (_, i) => 648 + i * 18);
  return (
    <g className="plan-core">
      <rect className="plan-void" x="600" y="440" width="260" height="120" />
      <rect className="plan-core__box" x="640" y="230" width="160" height="100" />
      {steps.map((x) => (
        <line key={x} x1={x} y1="230" x2={x} y2="330" />
      ))}
      <rect className="plan-core__box" x="880" y="250" width="72" height="80" />
      <line x1="880" y1="250" x2="952" y2="330" />
      <line x1="952" y1="250" x2="880" y2="330" />
      <text className="plan-label" x="800" y="395">PALIER</text>
    </g>
  );
}

function Unit({ unit, index, selected, dimmed, onSelect }) {
  const shape = UNIT_SHAPES[unit.letter];
  const [px, py] = shape.pin;
  const { balcony } = shape;

  return (
    <g
      className={`plan-unit plan-unit--${unit.status}${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
      style={{ '--status': STATUS[unit.status].color, '--i': index }}
      role="button"
      tabIndex={0}
      aria-label={`Unidad ${unit.id}, ${STATUS[unit.status].label}`}
      onClick={() => onSelect(unit)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(unit);
        }
      }}
    >
      <polygon className="plan-unit__fill" points={shape.points.map((p) => p.join(',')).join(' ')} />
      <rect className="plan-unit__balcony" x={balcony.x} y={balcony.y} width={balcony.w} height={balcony.h} />
      {shape.walls.map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}-${x2}-${y2}`} className="plan-unit__wall" x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      <polygon className="plan-unit__outline" points={shape.points.map((p) => p.join(',')).join(' ')} />
      <g className="plan-pin" transform={`translate(${px} ${py})`}>
        <g className="plan-pin__pop">
          <circle className="plan-pin__halo" r="22" />
          <circle className="plan-pin__dot" r="13" />
          <rect className="plan-pin__tag" x="-22" y="22" width="44" height="24" rx="6" />
          <text className="plan-pin__text" y="39">{unit.id}</text>
        </g>
      </g>
    </g>
  );
}

function Zones({ floorId }) {
  return ZONES[floorId].map((zone) => (
    <g key={zone.label} className={`plan-zone${zone.water ? ' plan-zone--water' : ''}`}>
      <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} />
      <text className="plan-label" x={zone.x + zone.w / 2} y={zone.labelY ?? zone.y + zone.h / 2 + 6}>
        {zone.label.toUpperCase()}
      </text>
    </g>
  ));
}

// `motion` controla la animación de montaje/desmontaje al cambiar de piso:
// 'enter-up' | 'enter-down' | 'exit-up' | 'exit-down' | null.
export default function FloorPlan({ floor, motion, selectedUnit, isNarrow, onSelect, onMotionEnd }) {
  const units = floor.kind === 'units' ? unitsOfFloor(floor.id) : [];
  const exiting = motion?.startsWith('exit');

  return (
    <svg
      className={`plan${motion ? ` plan--${motion}` : ''}`}
      viewBox={`0 0 ${PLAN.width} ${PLAN.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden={exiting || undefined}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onMotionEnd?.();
      }}
    >
      <defs>
        <pattern id="plan-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(60,60,60,0.22)" strokeWidth="2" />
        </pattern>
      </defs>

      <g className="plan-camera" style={{ transform: cameraFor(exiting ? null : selectedUnit, isNarrow) }}>
        <rect className="plan-context" x="330" y="-40" width="330" height="170" />
        <rect className="plan-context" x="1090" y="-40" width="220" height="240" />
        <rect className="plan-context" x="380" y="560" width="170" height="260" />
        <rect className="plan-context" x="1110" y="560" width="300" height="260" />

        <rect className="plan-shadow" x={PLAN.x + 10} y={PLAN.y + 16} width={PLAN.w} height={PLAN.h} />
        <rect className="plan-slab" x={PLAN.x} y={PLAN.y} width={PLAN.w} height={PLAN.h} />

        {floor.kind === 'units' ? (
          <>
            <Core />
            {units.map((unit, i) => (
              <Unit
                key={unit.id}
                unit={unit}
                index={i}
                selected={selectedUnit?.id === unit.id}
                dimmed={!!selectedUnit && selectedUnit.id !== unit.id}
                onSelect={onSelect}
              />
            ))}
          </>
        ) : (
          <>
            <Zones floorId={floor.id} />
            {floor.kind !== 'roof' && <Core />}
          </>
        )}
      </g>
    </svg>
  );
}

import { useLayoutEffect, useRef } from 'react';
import { PLAN, STATUS, UNIT_SHAPES, ZONES, unitsOfFloor } from '../data.js';

// Encuadra la unidad en el área de pantalla que queda libre de UI: la ficha
// tapa la izquierda (desktop) o la mitad de abajo (mobile) y el selector de
// pisos la derecha.
export function cameraFor(unit, isNarrow) {
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

// Sin `onSelect` la unidad es solo dibujo (la tapa de la maqueta 3D).
function Unit({ unit, index, selected, dimmed, onSelect }) {
  const shape = UNIT_SHAPES[unit.letter];
  const [px, py] = shape.pin;
  const { balcony } = shape;
  const interactive = onSelect
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Unidad ${unit.id}, ${STATUS[unit.status].label}`,
        onClick: () => onSelect(unit),
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(unit);
          }
        },
      }
    : {};

  return (
    <g
      className={`plan-unit plan-unit--${unit.status}${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
      style={{ '--status': STATUS[unit.status].color, '--i': index }}
      {...interactive}
    >
      <polygon className="plan-unit__fill" points={shape.points.map((p) => p.join(',')).join(' ')} />
      <rect className="plan-unit__balcony" x={balcony.x} y={balcony.y} width={balcony.w} height={balcony.h} />
      {shape.walls.map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}-${x2}-${y2}`} className="plan-unit__wall" x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      <polygon className="plan-unit__outline" points={shape.points.map((p) => p.join(',')).join(' ')} />
      {onSelect && (
        <g className="plan-pin" transform={`translate(${px} ${py})`}>
          <g className="plan-pin__pop">
            <circle className="plan-pin__halo" r="22" />
            <circle className="plan-pin__dot" r="13" />
            <rect className="plan-pin__tag" x="-22" y="22" width="44" height="24" rx="6" />
            <text className="plan-pin__text" y="39">{unit.id}</text>
          </g>
        </g>
      )}
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

// Losa + contenido de un piso. La usan la planta interactiva y la tapa de
// cada piso en la maqueta 3D de la fachada (sin `onSelect`).
export function PlanArt({ floor, selectedUnit = null, onSelect }) {
  const units = floor.kind === 'units' ? unitsOfFloor(floor.id) : [];
  return (
    <>
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
    </>
  );
}

// Manzana alrededor de la planta. Va en una capa aparte, debajo de las
// plantas: es igual en todos los pisos, así que no se mueve al cambiar de
// piso, pero sigue a la cámara cuando se elige una unidad.
export function PlanBase({ selectedUnit, isNarrow }) {
  return (
    <svg
      className="plan-base"
      viewBox={`0 0 ${PLAN.width} ${PLAN.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <g className="plan-camera" style={{ transform: cameraFor(selectedUnit, isNarrow) }}>
        <rect className="plan-context" x="330" y="-40" width="330" height="170" />
        <rect className="plan-context" x="1090" y="-40" width="220" height="240" />
        <rect className="plan-context" x="380" y="560" width="170" height="260" />
        <rect className="plan-context" x="1110" y="560" width="300" height="260" />
        {/* Sombra de la losa mientras la maqueta 3D todavía está a la vista. */}
        <rect className="plan-shadow plan-base__shadow" x={PLAN.x + 10} y={PLAN.y + 16} width={PLAN.w} height={PLAN.h} />
      </g>
    </svg>
  );
}

// `pos` es dónde está la planta respecto del piso activo: 'in' (es el activo),
// 'up' o 'down' (fuera de cuadro). Al ser una transición y no un keyframe, se
// puede cambiar de piso a mitad de camino. `from` es desde dónde entra al
// montarse ('up' | 'down'), o null si se llegó desde la fachada.
export default function FloorPlan({ floor, pos, from, selectedUnit, isNarrow, onSelect, onGone }) {
  const exiting = pos !== 'in';

  // Entrada al montarse: se pinta un instante en la posición de origen y se
  // suelta a la real para que corra la transición. Se hace a mano (y no con
  // @starting-style) para cubrir navegadores viejos.
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!from || !el) return;
    const target = el.dataset.pos;
    el.dataset.pos = from;
    el.getBoundingClientRect(); // fuerza el cálculo de estilos en el origen
    el.dataset.pos = target;
    // Solo al montar: `from` no cambia durante la vida de la planta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <svg
      ref={ref}
      className="plan"
      data-pos={pos}
      data-from={from || undefined}
      style={{ zIndex: floor.index + 1 }}
      viewBox={`0 0 ${PLAN.width} ${PLAN.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden={exiting || undefined}
      onTransitionEnd={(e) => {
        if (exiting && e.target === e.currentTarget && e.propertyName === 'opacity') onGone?.();
      }}
    >
      <g className="plan-camera" style={{ transform: cameraFor(exiting ? null : selectedUnit, isNarrow) }}>
        <rect className="plan-shadow" x={PLAN.x + 10} y={PLAN.y + 16} width={PLAN.w} height={PLAN.h} />
        <PlanArt floor={floor} selectedUnit={selectedUnit} onSelect={onSelect} />
      </g>
    </svg>
  );
}

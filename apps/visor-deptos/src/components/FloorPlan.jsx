import { useId, useLayoutEffect, useRef } from 'react';
import { STATUS, useBuilding } from '../building.js';

// Encuadra la unidad en el área de pantalla que queda libre de UI: la ficha
// tapa la izquierda (desktop) o la mitad de abajo (mobile) y el selector de
// pisos la derecha.
export function cameraFor(unit, isNarrow, PLAN) {
  if (!unit) return 'translate(0px, 0px) scale(1)';
  const { points } = unit.shape;
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
// `overImage`: va sobre la imagen real del piso, así que no se rellena.
function Unit({ unit, index, selected, dimmed, overImage, pinScale, onSelect }) {
  const { shape } = unit;
  const [px, py] = shape.pin;
  const { balcony, walls = [] } = shape;
  const tagW = Math.max(44, 16 + unit.code.length * 10);
  const interactive = onSelect
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Unidad ${unit.code}, ${STATUS[unit.status].label}`,
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
      className={`plan-unit plan-unit--${unit.status}${overImage ? ' plan-unit--image' : ''}${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
      style={{ '--status': STATUS[unit.status].color, '--i': index }}
      {...interactive}
    >
      <polygon className="plan-unit__fill" points={shape.points.map((p) => p.join(',')).join(' ')} />
      {balcony && <rect className="plan-unit__balcony" x={balcony.x} y={balcony.y} width={balcony.w} height={balcony.h} />}
      {walls.map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}-${x2}-${y2}`} className="plan-unit__wall" x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      <polygon className="plan-unit__outline" points={shape.points.map((p) => p.join(',')).join(' ')} />
      {onSelect && (
        <g className="plan-pin" transform={`translate(${px} ${py}) scale(${pinScale})`}>
          <g className="plan-pin__pop">
            <circle className="plan-pin__halo" r="22" />
            <circle className="plan-pin__dot" r="13" />
            <rect className="plan-pin__tag" x={-tagW / 2} y="22" width={tagW} height="24" rx="6" />
            <text className="plan-pin__text" y="39">{unit.code}</text>
          </g>
        </g>
      )}
    </g>
  );
}

function Zones({ zones }) {
  return zones.map((zone) => (
    <g key={zone.label} className={`plan-zone${zone.water ? ' plan-zone--water' : ''}`}>
      <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} />
      <text className="plan-label" x={zone.x + zone.w / 2} y={zone.labelY ?? zone.y + zone.h / 2 + 6}>
        {zone.label.toUpperCase()}
      </text>
    </g>
  ));
}

// Forma de la losa de un piso: su contorno si lo tiene, si no la caja de su
// huella (o la de todo el edificio). `dx`/`dy` la corren, para la sombra.
function SlabShape({ floor, plan, className, dx = 0, dy = 0 }) {
  if (floor?.shape) {
    return <polygon className={className} points={floor.shape.map(([x, y]) => `${x + dx},${y + dy}`).join(' ')} />;
  }
  const box = floor?.footprint || plan;
  return <rect className={className} x={box.x + dx} y={box.y + dy} width={box.w} height={box.h} />;
}

// Losa + contenido de un piso. La usan la planta interactiva y la tapa de
// cada piso en la maqueta 3D de la fachada (sin `onSelect`).
// Un edificio real trae la imagen de cada piso; la demo dibuja la planta a mano
// (núcleo, zonas, balcones).
export function PlanArt({ floor, selectedUnit = null, onSelect }) {
  const { plan: PLAN, demo, pinScale, unitsOfFloor } = useBuilding();
  const units = unitsOfFloor(floor.id);
  const { image, shape } = floor;
  const slab = floor.footprint || PLAN;
  // La misma planta se dibuja a la vez en la tapa 3D y en la vista de piso: cada
  // una necesita su propio id de recorte. Sin los «:» de useId, que algunos
  // navegadores no aceptan dentro de url(#…).
  const clipId = `slab-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const picture = image && (
    <image
      href={image.href}
      width={image.width}
      height={image.height}
      transform={image.transform}
      preserveAspectRatio="none"
    />
  );
  return (
    <>
      <SlabShape floor={floor} plan={PLAN} className="plan-slab" />
      {picture &&
        (shape ? (
          // Recorte con el contorno: patios y márgenes del render quedan afuera.
          <>
            <clipPath id={clipId}>
              <SlabShape floor={floor} plan={PLAN} />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>{picture}</g>
          </>
        ) : (
          // El <svg> anidado recorta la imagen a la caja de la huella del piso.
          <svg x={slab.x} y={slab.y} width={slab.w} height={slab.h} viewBox={`${slab.x} ${slab.y} ${slab.w} ${slab.h}`}>
            {picture}
          </svg>
        ))}
      {floor.zones && <Zones zones={floor.zones} />}
      {demo && floor.kind !== 'roof' && <Core />}
      {units.map((unit, i) => (
        <Unit
          key={unit.id}
          unit={unit}
          index={i}
          selected={selectedUnit?.id === unit.id}
          dimmed={!!selectedUnit && selectedUnit.id !== unit.id}
          overImage={!!image}
          pinScale={pinScale}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

// Manzana alrededor de la planta. Va en una capa aparte, debajo de las
// plantas: es igual en todos los pisos, así que no se mueve al cambiar de
// piso, pero sigue a la cámara cuando se elige una unidad.
// `floor` (el piso activo) le da a la sombra la forma de su losa.
export function PlanBase({ floor, selectedUnit, isNarrow }) {
  const { plan: PLAN, demo } = useBuilding();
  return (
    <svg
      className="plan-base"
      viewBox={`0 0 ${PLAN.width} ${PLAN.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <g className="plan-camera" style={{ transform: cameraFor(selectedUnit, isNarrow, PLAN) }}>
        {demo && (
          <>
            <rect className="plan-context" x="330" y="-40" width="330" height="170" />
            <rect className="plan-context" x="1090" y="-40" width="220" height="240" />
            <rect className="plan-context" x="380" y="560" width="170" height="260" />
            <rect className="plan-context" x="1110" y="560" width="300" height="260" />
          </>
        )}
        {/* Sombra de la losa mientras la maqueta 3D todavía está a la vista. */}
        <SlabShape floor={floor?.shape ? floor : null} plan={PLAN} className="plan-shadow plan-base__shadow" dx={10} dy={16} />
      </g>
    </svg>
  );
}

// `pos` es dónde está la planta respecto del piso activo: 'in' (es el activo),
// 'up' o 'down' (fuera de cuadro). Al ser una transición y no un keyframe, se
// puede cambiar de piso a mitad de camino. `from` es desde dónde entra al
// montarse ('up' | 'down'), o null si se llegó desde la fachada.
export default function FloorPlan({ floor, pos, from, selectedUnit, isNarrow, onSelect, onGone }) {
  const { plan: PLAN } = useBuilding();
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
      <g className="plan-camera" style={{ transform: cameraFor(exiting ? null : selectedUnit, isNarrow, PLAN) }}>
        {/* Con contorno la sombra lo sigue (cae dentro de los patios); sin él, la
            caja de todo el edificio, como siempre. */}
        <SlabShape floor={floor.shape ? floor : null} plan={PLAN} className="plan-shadow" dx={10} dy={16} />
        <PlanArt floor={floor} selectedUnit={selectedUnit} onSelect={onSelect} />
      </g>
    </svg>
  );
}

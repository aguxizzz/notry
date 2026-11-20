import { useLayoutEffect, useRef, useState } from 'react';
import { useBuilding } from '../building.js';
import { PlanArt } from './FloorPlan.jsx';

// La fachada es una maqueta 3D en CSS (sin WebGL): cada piso es una caja con
// un frente (su franja de fachada) y una tapa (su planta). Entrar a un piso es
// mover la cámara: los pisos de arriba se levantan y la cámara, pivotando sobre
// la losa del piso elegido, se asoma y baja la mirada 90° hasta su tapa. Al
// llegar, la tapa queda exactamente donde se dibuja la planta interactiva, que
// la reemplaza sin que se note.

// Distancia de la cámara, relativa al lado mayor de la pantalla.
const PERSPECTIVE = 2;

// En coordenadas del viewBox de fachada por defecto (1600×900, suelo en 860).
const NEIGHBOURS = [
  { x: 0, y: 700, w: 250, h: 160 },
  { x: 250, y: 740, w: 190, h: 120 },
  { x: 440, y: 690, w: 220, h: 170 },
  { x: 940, y: 730, w: 210, h: 130 },
  { x: 1150, y: 760, w: 170, h: 100 },
  { x: 1320, y: 700, w: 280, h: 160 },
];

function useViewport() {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  useLayoutEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

// La cámara va en dos elementos con transiciones propias: `outer` encuadra y
// hace zoom, `inner` gira. El pivote es la losa del piso elegido (no el suelo),
// así ese piso se queda en su lugar mientras la cámara se inclina sobre él.
//   fachada: de frente, encuadre "slice" con el suelo abajo.
//   planta:  girada 90° sobre la tapa del piso, centrada y escalada para que la
//            huella coincida con la planta 2D (viewBox "meet").
function cameraFor({ facade: FACADE, plan: PLAN, floorById }, view, floorId, vw, vh) {
  const top = floorById[floorId].y - FACADE.ground;
  if (view === 'floor') {
    const planScale = Math.min(vw / PLAN.width, vh / PLAN.height);
    const scale = (PLAN.w * planScale) / FACADE.w;
    // The 2D plan centers the whole canvas, not the footprint: in real buildings
    // the footprint is off-center, so the top lands shifted by that offset. Without
    // it the camera ends a few px off and the plan "snaps" into place on the swap.
    const dx = (PLAN.x + PLAN.w / 2 - PLAN.width / 2) * planScale;
    const dy = (PLAN.y + PLAN.h / 2 - PLAN.height / 2) * planScale;
    return {
      outer: `translate3d(${vw / 2 + dx}px, ${vh / 2 + dy}px, 0) scale(${scale})`,
      inner: `rotateX(-90deg) translateY(${-top}px)`,
    };
  }
  const facadeScale = Math.max(vw / FACADE.width, vh / FACADE.height);
  const groundY = vh - (FACADE.height - FACADE.ground) * facadeScale;
  return {
    outer: `translate3d(${vw / 2}px, ${groundY + facadeScale * top}px, 0) scale(${facadeScale})`,
    inner: `rotateX(0deg) translateY(${-top}px)`,
  };
}

function FrontArt({ floor, w, facade }) {
  const { h, kind } = floor;

  // With a facade photo, each front is just its band of the image: the whole
  // image is shifted so the floor's rectangle lands on this floor's viewBox.
  // The nested <svg> clips it to that band, since the outer one has overflow
  // visible (for the hover outline) and would otherwise paint the full photo.
  // It bleeds 1 unit down over the floor below (same pixels, so invisible) to
  // hide the hairline seams that subpixel rounding leaves between bands.
  if (facade.image) {
    return (
      <svg width={w} height={h + 1}>
        <image
          href={facade.image}
          x={-facade.x}
          y={-floor.y}
          width={facade.width}
          height={facade.height}
          preserveAspectRatio="none"
        />
      </svg>
    );
  }

  if (kind === 'roof') {
    return (
      <>
        <rect className="facade-floor__body" x={14} y={0} width={w - 28} height={h} />
        <rect className="facade-floor__slab" x={14} y={0} width={w - 28} height={5} />
      </>
    );
  }

  const half = (w - 36) / 2;
  return (
    <>
      <rect className="facade-floor__body" x={0} y={0} width={w} height={h} />
      {kind === 'ground' ? (
        <>
          <rect className="facade-floor__glass" x={14} y={16} width={150} height={h - 16} />
          <rect className="facade-floor__glass" x={190} y={26} width={64} height={h - 26} />
        </>
      ) : (
        <>
          <rect className="facade-floor__glass" x={12} y={14} width={half} height={h - 22} />
          <rect className="facade-floor__glass" x={24 + half} y={14} width={half} height={h - 22} />
          <rect className="facade-floor__rail" x={6} y={h - 22} width={w - 12} height={14} />
        </>
      )}
      <rect className="facade-floor__slab" x={-6} y={h - 8} width={w + 12} height={8} />
    </>
  );
}

// clip-path for the backdrop photo: the whole image minus the tower's rectangle
// (evenodd turns the inner ring into a hole). The hole is 1 unit smaller per
// side so no seam shows between the fronts and the backdrop.
function photoHole(facade, floors) {
  const top = Math.min(...floors.map((f) => f.y)) + 1;
  const x1 = facade.x + 1;
  const x2 = facade.x + facade.w - 1;
  const y2 = facade.ground - 1;
  const { width: W, height: H } = facade;
  return `polygon(evenodd, 0 0, ${W}px 0, ${W}px ${H}px, 0 ${H}px, 0 0, ${x1}px ${top}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${top}px, ${x1}px ${top}px)`;
}

export default function Facade({ view, floorId, hoverId, onHover, onEnter }) {
  const building = useBuilding();
  const { facade: FACADE, plan: PLAN, floors } = building;
  const { w: vw, h: vh } = useViewport();
  const selected = building.floorById[floorId];
  const facadeScale = Math.max(vw / FACADE.width, vh / FACADE.height);
  // Fondo del edificio: el que hace que la tapa tenga la proporción de la planta.
  const depth = (FACADE.w * PLAN.h) / PLAN.w;
  const centerX = FACADE.x + FACADE.w / 2;

  // Al cambiar el tamaño de la pantalla la cámara salta a la pose nueva, sin
  // animar.
  const ref = useRef(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const el = ref.current;
    el.classList.add('no-anim');
    const raf = requestAnimationFrame(() => el.classList.remove('no-anim'));
    return () => cancelAnimationFrame(raf);
  }, [vw, vh]);

  // Entrar desde la fachada a otro piso cambia el pivote: la cámara primero
  // salta (sin animar) a la pose de fachada pivotada en el piso nuevo, que se
  // ve igual, y recién desde ahí viaja a la planta.
  const rigRef = useRef(null);
  const tiltRef = useRef(null);
  const prev = useRef({ view, floorId });
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = { view, floorId };
    if (view !== 'floor' || was.view !== 'facade' || was.floorId === floorId) return;
    const from = cameraFor(building, 'facade', floorId, vw, vh);
    const rig = rigRef.current;
    const tilt = tiltRef.current;
    const to = [rig.style.transform, tilt.style.transform];
    rig.style.transition = tilt.style.transition = 'none';
    rig.style.transform = from.outer;
    tilt.style.transform = from.inner;
    rig.getBoundingClientRect();
    rig.style.transition = tilt.style.transition = '';
    rig.style.transform = to[0];
    tilt.style.transform = to[1];
  }, [building, view, floorId, vw, vh]);

  const cam = cameraFor(building, view, floorId, vw, vh);

  return (
    <div
      ref={ref}
      className="bld"
      style={{
        perspective: `${Math.round(Math.max(vw, vh) * PERSPECTIVE)}px`,
        '--w': `${FACADE.w}px`,
        '--depth': `${depth}px`,
        '--plan-w': `${PLAN.w}px`,
        '--plan-h': `${PLAN.h}px`,
        '--top-scale': FACADE.w / PLAN.w,
        '--sky-w': `${Math.ceil((vw / facadeScale) * 1.5)}px`,
        '--sky-h': `${Math.ceil((vh / facadeScale) * 1.5)}px`,
      }}
    >
      <div
        ref={rigRef}
        className="bld-rig"
        style={{ transform: cam.outer }}
        role="group"
        aria-label="Fachada del edificio"
      >
        <div ref={tiltRef} className="bld-tilt" style={{ transform: cam.inner }}>
          <div className="bld-sky" />
          {FACADE.backdrop ? (
            // The (blurred) photo already has the street and neighbours, so it
            // replaces the drawn ones. It sits right behind the fronts with the
            // tower cut out, so lifting floors shows the plan, not a ghost tower.
            <div
              className="bld-photo"
              style={{
                left: -centerX,
                top: -FACADE.ground,
                width: FACADE.width,
                height: FACADE.height,
                backgroundImage: `url(${FACADE.backdrop})`,
                clipPath: photoHole(FACADE, floors),
              }}
            />
          ) : (
            <>
              <div className="bld-hood">
                {NEIGHBOURS.map((n) => (
                  <i
                    key={n.x}
                    style={{
                      left: n.x - centerX,
                      top: n.y - FACADE.ground,
                      width: n.w,
                      height: n.h,
                    }}
                  />
                ))}
              </div>
              <div className="bld-ground bld-ground--back" />
              <div className="bld-ground" />
            </>
          )}

          {floors.map((floor) => {
            const delta = floor.index - selected.index;
            return (
              <div
                key={floor.id}
                className={`bld-floor${hoverId === floor.id ? ' is-hover' : ''}`}
                data-rel={delta > 0 ? 'above' : delta === 0 ? 'sel' : 'below'}
                style={{
                  '--y': `${floor.y - FACADE.ground}px`,
                  '--h': `${floor.h}px`,
                  // Los de arriba se abren en abanico: cuanto más lejos, más suben.
                  '--lift': `${36 + (delta - 1) * 6}px`,
                  '--i': floor.index,
                }}
              >
                <div className="bld-floor__top">
                  {/* Solo la tapa del piso elegido (o el que está bajo el mouse,
                      que es el que se va a elegir) lleva la planta: las demás
                      asomaban alrededor durante el giro y bajaban imágenes de
                      pisos a los que nadie entra. El hover sirve de precarga.
                      It carries the unit pins too, so they pop in during the
                      camera move instead of after the swap (CSS times them). */}
                  {(delta === 0 || hoverId === floor.id) && (
                    <svg viewBox={`${PLAN.x} ${PLAN.y} ${PLAN.w} ${PLAN.h}`}>
                      <PlanArt floor={floor} pins />
                    </svg>
                  )}
                </div>
                <button
                  type="button"
                  className="bld-floor__front"
                  data-front={floor.id}
                  aria-label={floor.name}
                  onMouseEnter={() => onHover(floor.id)}
                  onFocus={() => onHover(floor.id)}
                  // Salir de un piso y entrar al de al lado cae en el mismo
                  // render: el tooltip no se desmonta entre pisos.
                  onMouseLeave={() => onHover(null)}
                  onBlur={() => onHover(null)}
                  onClick={() => onEnter(floor.id)}
                >
                  <svg viewBox={`0 0 ${FACADE.w} ${floor.h}`} width={FACADE.w} height={floor.h}>
                    <FrontArt floor={floor} w={FACADE.w} facade={FACADE} />
                    <rect className="facade-floor__hit" x={-6} y={0} width={FACADE.w + 12} height={floor.h} />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

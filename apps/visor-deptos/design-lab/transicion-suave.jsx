import { StrictMode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FACADE, FLOORS, FLOOR_BY_ID, PLAN } from '../src/data.js';
import { PlanArt } from '../src/components/FloorPlan.jsx';
import '../src/index.css';
import './transicion-suave.css';

// Lab: transición fachada ↔ planta con MENOS movimiento que la actual.
// La actual hace un viaje de cámara completo (giro de 90° + zoom ×5). Las
// alternativas mueven la cámara apenas y dejan que un fundido cruzado haga el
// cambio de vista; el 3D queda en un gesto chico (inclinación / separación).
// Teclas: 1–4 variante, S cámara lenta, Esc volver. ?v=N&i=0.6 por URL.

const DEPTH = (FACADE.w * PLAN.h) / PLAN.w;

const VARIANTS = [
  {
    id: 1,
    name: 'Actual',
    desc: 'Viaje de cámara completo: giro de 90° + zoom hasta la planta.',
    persp: 1.35,
  },
  {
    id: 2,
    name: 'Asomarse',
    desc: 'La cámara se acerca un poco y se inclina apenas, como asomándose al piso; la planta aparece en fundido y termina de acostarse.',
    persp: 2,
  },
  {
    id: 3,
    name: 'Separar',
    desc: 'Sin giro: los pisos se separan en profundidad (arriba y abajo se alejan, el elegido se adelanta) y la planta aparece en fundido.',
    persp: 2,
  },
  {
    id: 4,
    name: 'Asomarse 3D',
    desc: 'Como la actual (3D continuo hasta la planta, sin fundido), pero pivotando sobre el piso elegido: primero se asoma y después baja la mirada, con curvas suaves.',
    persp: 2,
  },
];

const NEIGHBOURS = [
  { x: 0, y: 700, w: 250, h: 160 },
  { x: 250, y: 740, w: 190, h: 120 },
  { x: 440, y: 690, w: 220, h: 170 },
  { x: 940, y: 730, w: 210, h: 130 },
  { x: 1150, y: 760, w: 170, h: 100 },
  { x: 1320, y: 700, w: 280, h: 160 },
];
const CENTER_X = FACADE.x + FACADE.w / 2;

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useLayoutEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

// Cámara partida en dos elementos (encuadre/zoom y giro).
// Variante 1: idéntica a la app. Variantes 2 y 3: el pivote es el piso elegido
// (también en la fachada), así el acercamiento va directo hacia él.
function camera(v, view, floor, vw, vh, I) {
  const fs = Math.max(vw / FACADE.width, vh / FACADE.height);
  const groundY = vh - (FACADE.height - FACADE.ground) * fs;
  const planScale = Math.min(vw / PLAN.width, vh / PLAN.height);
  const top = floor.y - FACADE.ground;

  // 4: mismo destino que la actual, pero el pivote es la losa del piso elegido
  // (no el suelo): el piso se queda en su lugar mientras la cámara se inclina
  // sobre él y se acerca, en vez de barrer el edificio.
  if (v === 4) {
    if (view === 'facade') {
      return {
        outer: `translate3d(${vw / 2}px, ${groundY + fs * top}px, 0) scale(${fs})`,
        inner: `rotateX(0deg) translateY(${-top}px)`,
      };
    }
    return {
      outer: `translate3d(${vw / 2}px, ${vh / 2}px, 0) scale(${(PLAN.w * planScale) / FACADE.w})`,
      inner: `rotateX(-90deg) translateY(${-top}px)`,
    };
  }

  if (v === 1) {
    if (view === 'facade') {
      return {
        outer: `translate3d(${vw / 2}px, ${groundY}px, 0) scale(${fs})`,
        inner: 'rotateX(0deg) translateY(0px)',
      };
    }
    return {
      outer: `translate3d(${vw / 2}px, ${vh / 2}px, 0) scale(${(PLAN.w * planScale) / FACADE.w})`,
      inner: `rotateX(-90deg) translateY(${-top}px)`,
    };
  }

  // Centro del piso elegido, en el mundo y en pantalla (de frente).
  const pivot = top + floor.h / 2;
  const sy = groundY + fs * pivot;
  if (view === 'facade') {
    return {
      outer: `translate3d(${vw / 2}px, ${sy}px, 0) scale(${fs})`,
      inner: `rotateX(0deg) translateY(${-pivot}px)`,
    };
  }
  const zoom = v === 2 ? 1 + 0.35 * I : 1 + 0.1 * I;
  const toward = v === 2 ? 0.35 * I : 0.2 * I; // cuánto se acerca el piso al centro
  const tilt = v === 2 ? 24 * I : 0;
  const y = sy + (vh / 2 - sy) * Math.min(toward, 1);
  return {
    outer: `translate3d(${vw / 2}px, ${y}px, 0) scale(${fs * zoom})`,
    inner: `rotateX(${-tilt}deg) translateY(${-pivot}px)`,
  };
}

// Pose desde la que entra la planta 2D (y a la que vuelve al salir).
function planFrom(v, P, I) {
  if (v === 2) return `perspective(${P}px) rotateX(${16 * I}deg) scale(${1 - 0.06 * I})`;
  if (v === 3) return `perspective(${P}px) translate3d(0px, ${14 * I}px, ${-60 * I}px)`;
  return 'none';
}

function FrontArt({ floor }) {
  const { w } = FACADE;
  const { h, kind } = floor;
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
      {kind === 'pb' ? (
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

// Desplazamiento de cada piso al entrar: [dy, dz] en unidades de la fachada.
function shiftFor(v, delta, I) {
  if (v === 1) return delta > 0 ? [-(60 + (delta - 1) * 18), 0] : [0, 0];
  if (v === 2) return delta > 0 ? [-26 * I, 0] : [0, 0];
  if (v === 4) return delta > 0 ? [-(36 + (delta - 1) * 6), 0] : [0, 0];
  // 3: los de arriba suben y se alejan, los de abajo bajan y se alejan, el
  // elegido se adelanta. Cuanto más lejos del elegido, más se separa.
  if (delta === 0) return [0, 40 * I];
  const n = Math.min(Math.abs(delta), 4);
  return [Math.sign(delta) * -(16 + n * 6) * I, -(30 + n * 12) * I];
}

const restingTop = `rotateX(90deg) scale(${FACADE.w / PLAN.w})`;

function readParams() {
  const q = new URLSearchParams(window.location.search);
  const v = Number(q.get('v'));
  const i = Number(q.get('i'));
  return {
    v: VARIANTS.some((x) => x.id === v) ? v : 2,
    i: q.has('i') && i >= 0 && i <= 1.5 ? i : 1,
  };
}

function Lab() {
  const { w: vw, h: vh } = useViewport();
  const [v, setV] = useState(() => readParams().v);
  const [I, setI] = useState(() => readParams().i);
  const [view, setView] = useState('facade');
  const [floorId, setFloorId] = useState('4');
  const [entry, setEntry] = useState(0);
  const [slow, setSlow] = useState(false);
  const rootRef = useRef(null);

  const variant = VARIANTS.find((x) => x.id === v);
  const floor = FLOOR_BY_ID[floorId];
  const P = Math.round(Math.max(vw, vh) * variant.persp);
  const cam = camera(v, view, floor, vw, vh, I);
  const fs = Math.max(vw / FACADE.width, vh / FACADE.height);

  // Cambios que no deben animarse (variante, intensidad, tamaño de pantalla).
  const skipAnim = () => {
    const el = rootRef.current;
    if (!el) return;
    el.classList.add('no-anim');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('no-anim')));
  };
  useLayoutEffect(skipAnim, [vw, vh]);

  const syncUrl = (next) => {
    const url = new URL(window.location.href);
    Object.entries(next).forEach(([k, val]) => url.searchParams.set(k, val));
    window.history.replaceState(null, '', url);
  };

  const pickVariant = (id) => {
    skipAnim();
    setView('facade');
    setV(id);
    syncUrl({ v: id });
  };

  const pickIntensity = (val) => {
    skipAnim();
    setView('facade');
    setI(val);
    syncUrl({ i: val });
  };

  // En 2 y 3 la cámara pivota sobre el piso elegido: primero se re-centra el
  // pivote en el piso nuevo sin animar (la imagen no cambia) y recién después
  // arranca la transición.
  const enter = (id) => {
    const el = rootRef.current;
    el.classList.add('no-anim');
    setFloorId(id);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.classList.remove('no-anim');
        el.getBoundingClientRect();
        setEntry((n) => n + 1);
        setView('floor');
      })
    );
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setView('facade');
      else if (e.key === 's' || e.key === 'S') setSlow((s) => !s);
      else if (['1', '2', '3', '4'].includes(e.key)) pickVariant(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const inFloor = view === 'floor';

  return (
    <div
      ref={rootRef}
      className="lab"
      data-v={v}
      data-view={view}
      style={{
        '--k': slow ? 3 : 1,
        '--w': `${FACADE.w}px`,
        '--depth': `${DEPTH}px`,
        '--plan-w': `${PLAN.w}px`,
        '--plan-h': `${PLAN.h}px`,
        '--plan-from': planFrom(v, P, I),
      }}
    >
      <svg className="svg-defs" aria-hidden="true">
        <defs>
          <pattern id="plan-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(60,60,60,0.22)" strokeWidth="2" />
          </pattern>
        </defs>
      </svg>

      <svg className="lb-base" viewBox={`0 0 ${PLAN.width} ${PLAN.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect className="plan-context" x="330" y="-40" width="330" height="170" />
        <rect className="plan-context" x="1090" y="-40" width="220" height="240" />
        <rect className="plan-context" x="380" y="560" width="170" height="260" />
        <rect className="plan-context" x="1110" y="560" width="300" height="260" />
      </svg>

      <div className="lb-bld" style={{ perspective: `${P}px` }}>
        <div className="lb-rig" style={{ transform: cam.outer }}>
          <div className="lb-tilt" style={{ transform: cam.inner }}>
            <div
              className="lb-sky"
              style={{ '--sky-w': `${Math.ceil((vw / fs) * 1.5)}px`, '--sky-h': `${Math.ceil((vh / fs) * 1.5)}px` }}
            />
            <div className="lb-hood">
              {NEIGHBOURS.map((n) => (
                <i key={n.x} style={{ left: n.x - CENTER_X, top: n.y - FACADE.ground, width: n.w, height: n.h }} />
              ))}
            </div>
            <div className="lb-ground lb-ground--back" />
            <div className="lb-ground" />

            {FLOORS.map((f) => {
              const delta = f.index - floor.index;
              const [dy, dz] = shiftFor(v, delta, I);
              return (
                <div
                  key={f.id}
                  className="lb-floor"
                  data-rel={delta > 0 ? 'above' : delta === 0 ? 'sel' : 'below'}
                  style={{ '--y': `${f.y - FACADE.ground}px`, '--h': `${f.h}px`, '--dy': `${dy}px`, '--dz': `${dz}px` }}
                >
                  <div className="lb-floor__top" style={{ transform: restingTop }}>
                    <svg viewBox={`${PLAN.x} ${PLAN.y} ${PLAN.w} ${PLAN.h}`}>
                      <PlanArt floor={f} />
                    </svg>
                  </div>
                  <button
                    type="button"
                    className="lb-floor__front"
                    aria-label={f.name}
                    tabIndex={inFloor ? -1 : 0}
                    onClick={() => enter(f.id)}
                  >
                    <svg viewBox={`0 0 ${FACADE.w} ${f.h}`} width={FACADE.w} height={f.h}>
                      <FrontArt floor={f} />
                      <rect className="facade-floor__hit" x={-6} y={0} width={FACADE.w + 12} height={f.h} />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* El contenedor lleva las transiciones; la planta se remonta en cada
          entrada (re-anima los pines) sin perderlas. */}
      <div className="lb-plan" aria-hidden={!inFloor}>
        <svg key={entry} viewBox={`0 0 ${PLAN.width} ${PLAN.height}`} preserveAspectRatio="xMidYMid meet">
          <rect className="plan-shadow" x={PLAN.x + 10} y={PLAN.y + 16} width={PLAN.w} height={PLAN.h} />
          <PlanArt floor={floor} onSelect={() => {}} />
        </svg>
      </div>

      <header className="lb-top">
        <button
          type="button"
          className={`icon-btn glass lb-back${inFloor ? ' is-visible' : ''}`}
          aria-label="Volver a la fachada"
          onClick={() => setView('facade')}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="glass lb-title">
          <strong>{inFloor ? floor.name : 'Elegí un piso'}</strong>
          <span>Lab · transición fachada ↔ planta</span>
        </div>
      </header>

      <nav className="glass lb-panel" aria-label="Variantes">
        <div className="lb-variants">
          {VARIANTS.map((x) => (
            <button
              key={x.id}
              type="button"
              className={`lb-variant${x.id === v ? ' is-active' : ''}`}
              onClick={() => pickVariant(x.id)}
            >
              <kbd>{x.id}</kbd>
              <span>{x.name}</span>
            </button>
          ))}
        </div>
        <p className="lb-desc">{variant.desc}</p>
        {(v === 2 || v === 3) && (
          <label className="lb-range">
            <span>Cantidad de 3D</span>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={I}
              onChange={(e) => pickIntensity(Number(e.target.value))}
            />
            <output>{Math.round(I * 100)}%</output>
          </label>
        )}
        <div className="lb-row">
          <label className="lb-slow">
            <input type="checkbox" checked={slow} onChange={(e) => setSlow(e.target.checked)} />
            Cámara lenta ×3 <kbd>S</kbd>
          </label>
          <span className="lb-hint">Click en un piso · <kbd>Esc</kbd> vuelve</span>
        </div>
      </nav>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Lab />
  </StrictMode>
);

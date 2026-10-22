import { useEffect, useRef, useState } from 'react';
import { alignmentOf, alignmentTransform, centroid, pointsAttr, round } from '../geometry.js';
import { isTypingOrModal } from '../keyboard.js';
import { STATUSES } from '../model.js';
import { useLatest } from '../useLatest.js';
import Icon from './icons.jsx';

const HANDLE_PX = 6;
const CLOSE_PX = 12;

// Posición del puntero en el sistema de coordenadas de `el` (el <svg> = mundo, el <g>
// alineado = píxeles de la imagen del piso).
function pointerIn(el, e) {
  return new DOMPoint(e.clientX, e.clientY).matrixTransform(el.getScreenCTM().inverse());
}

// Encuadre que muestra todo el piso con un margen alrededor.
function fitView(W, H) {
  const margin = Math.max(W, H) * 0.08;
  return { x: -margin, y: -margin, w: W + margin * 2, h: H + margin * 2 };
}

// Lienzo del piso. Mundo = marco del plano original; el grupo con la imagen del piso y
// sus polígonos se mueve con `alignment`. Los polígonos se guardan en píxeles de la
// imagen del piso (coordenadas locales del grupo), nunca en coordenadas de mundo.
export default function FloorCanvas({
  floor,
  selectedUnitId,
  tool,
  onSelectUnit,
  onUnitPolygon,
  onAlignment,
  onToolChange,
}) {
  const svgRef = useRef(null);
  const groupRef = useRef(null);
  const dragRef = useRef(null);
  const spaceRef = useRef(false);
  const W = floor.plan_width || 1000;
  const H = floor.plan_height || 700;
  const align = alignmentOf(floor);
  const units = floor.units || [];
  const hasImage = Boolean(floor.plan_image_url);

  const [size, setSize] = useState({ w: 1, h: 1 });
  const [view, setView] = useState(() => fitView(W, H));
  const [draft, setDraft] = useState(null); // { unitId, points } mientras se arrastra
  const [drawing, setDrawing] = useState([]); // puntos del polígono en construcción
  const [cursor, setCursor] = useState(null);

  // Al cambiar de piso se re-encuadra y se descarta el dibujo a medias. localKey: el id
  // provisorio de un piso recién creado, para no re-encuadrar cuando llega el real.
  const floorKey = floor.localKey ?? floor.id;
  const [shownFloor, setShownFloor] = useState(floorKey);
  if (floorKey !== shownFloor) {
    setShownFloor(floorKey);
    setView(fitView(W, H));
    setDrawing([]);
  }

  const px = Math.max(view.w / size.w, view.h / size.h); // unidades de mundo por píxel de pantalla
  const lpx = px / (align.scale || 1); // ídem en coordenadas locales del grupo

  useEffect(() => {
    const el = svgRef.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWorld = (e) => pointerIn(svgRef.current, e);

  const toLocal = (e) => {
    const p = pointerIn(groupRef.current, e);
    return [round(p.x), round(p.y)];
  };

  // Zoom con la rueda, anclado al cursor (listener no pasivo para poder frenar el scroll).
  useEffect(() => {
    const svg = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const w = pointerIn(svg, e);
      const f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      setView((v) => ({ x: w.x - (w.x - v.x) * f, y: w.y - (w.y - v.y) * f, w: v.w * f, h: v.h * f }));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const closeDrawing = (points) => {
    if (points.length >= 3 && selectedUnitId) {
      onUnitPolygon(selectedUnitId, points);
      onToolChange('select');
    }
    setDrawing([]);
  };

  const onKeyDown = useLatest((e) => {
    if (isTypingOrModal()) return;
    if (e.code === 'Space') spaceRef.current = true;
    // Ajuste fino del encuadre: flechas = 1px de mundo, Shift = 10px.
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (tool === 'align' && nudge) {
      e.preventDefault();
      const k = e.shiftKey ? 10 : 1;
      onAlignment({ ...align, x: round(align.x + nudge[0] * k), y: round(align.y + nudge[1] * k) });
      return;
    }
    if (tool !== 'draw') return;
    if (e.key === 'Escape') setDrawing([]);
    else if (e.key === 'Backspace') setDrawing((d) => d.slice(0, -1));
    else if (e.key === 'Enter') closeDrawing(drawing);
  });

  useEffect(() => {
    const down = (e) => onKeyDown.current(e);
    const up = (e) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onKeyDown]);

  const startPan = (e) => {
    dragRef.current = { type: 'pan', startClient: { x: e.clientX, y: e.clientY }, view };
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const onPointerDown = (e) => {
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'align') {
      dragRef.current = { type: 'align', start: toWorld(e), align };
      svgRef.current.setPointerCapture(e.pointerId);
    } else if (tool === 'select') {
      onSelectUnit(null);
      startPan(e);
    }
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (tool === 'draw') setCursor(toLocal(e));
    if (!drag) return;
    if (drag.type === 'pan') {
      // `view` capturado al empezar: el mundo bajo el cursor no se mueve mientras se arrastra.
      const k = Math.max(drag.view.w / size.w, drag.view.h / size.h);
      setView({
        ...drag.view,
        x: drag.view.x - (e.clientX - drag.startClient.x) * k,
        y: drag.view.y - (e.clientY - drag.startClient.y) * k,
      });
    } else if (drag.type === 'align') {
      const w = toWorld(e);
      onAlignment({ ...drag.align, x: round(drag.align.x + w.x - drag.start.x), y: round(drag.align.y + w.y - drag.start.y) });
    } else if (drag.type === 'vertex' || drag.type === 'move') {
      const p = toLocal(e);
      const dx = p[0] - drag.start[0];
      const dy = p[1] - drag.start[1];
      const points =
        drag.type === 'vertex'
          ? drag.points.map((q, i) => (i === drag.index ? p : q))
          : drag.points.map(([x, y]) => [round(x + dx), round(y + dy)]);
      // También en el ref: el pointerup puede llegar antes de que se renderice este draft.
      drag.draft = { unitId: drag.unitId, points };
      setDraft(drag.draft);
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.draft) onUnitPolygon(drag.draft.unitId, drag.draft.points);
    setDraft(null);
  };

  const onCanvasClick = (e) => {
    if (tool !== 'draw' || e.button !== 0 || spaceRef.current) return;
    const p = toLocal(e);
    if (drawing.length >= 3) {
      const [fx, fy] = drawing[0];
      if (Math.hypot(p[0] - fx, p[1] - fy) <= CLOSE_PX * lpx) {
        closeDrawing(drawing);
        return;
      }
    }
    setDrawing((d) => [...d, p]);
  };

  const pointsOf = (unit) => (draft?.unitId === unit.id ? draft.points : unit.polygon);
  const selected = units.find((u) => u.id === selectedUnitId);
  const selectedPoints = selected ? pointsOf(selected) : null;

  const startVertexDrag = (e, index) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (e.altKey && selectedPoints.length > 3) {
      onUnitPolygon(selected.id, selectedPoints.filter((_, i) => i !== index));
      return;
    }
    dragRef.current = { type: 'vertex', unitId: selected.id, index, start: toLocal(e), points: selectedPoints };
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const onUnitDown = (e, unit) => {
    if (tool !== 'select' || e.button !== 0 || spaceRef.current) return;
    e.stopPropagation();
    onSelectUnit(unit.id);
    dragRef.current = { type: 'move', unitId: unit.id, start: toLocal(e), points: unit.polygon };
    svgRef.current.setPointerCapture(e.pointerId);
  };

  const insertVertex = (e, edgeIndex) => {
    e.stopPropagation();
    const p = toLocal(e);
    const next = [...selectedPoints];
    next.splice(edgeIndex + 1, 0, p);
    onUnitPolygon(selected.id, next);
  };

  const labels = units
    .filter((u) => u.polygon?.length >= 3)
    .map((u) => ({ id: u.id, code: u.code, at: centroid(pointsOf(u)) }));

  const cursorStyle = tool === 'draw' ? 'crosshair' : tool === 'align' ? 'move' : 'default';

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        className="canvas"
        style={{ cursor: cursorStyle }}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onCanvasClick}
        onDoubleClick={(e) => tool === 'draw' && e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <rect x="0" y="0" width={W} height={H} className="canvas-frame" />
        {/* Capas: imagen del piso → plano original → polígonos. Imagen y polígonos comparten
            la transformación de alineación; el plano queda en medio para que con opacidad
            alta se pueda dibujar sobre él sin tapar lo que se dibuja. */}
        <g transform={alignmentTransform(align, W, H)}>
          {hasImage ? (
            <image href={floor.plan_image_url} x="0" y="0" width={W} height={H} preserveAspectRatio="none" />
          ) : (
            <text x={W / 2} y={H / 2} className="canvas-hint" textAnchor="middle" fontSize={Math.max(W, H) / 30}>
              Subí la imagen de este piso
            </text>
          )}
        </g>

        {floor.source_plan_url && (
          <image
            href={floor.source_plan_url}
            x="0"
            y="0"
            width={W}
            height={H}
            preserveAspectRatio="xMidYMid meet"
            opacity={align.opacity}
            pointerEvents="none"
            className="source-overlay"
          />
        )}

        <g ref={groupRef} transform={alignmentTransform(align, W, H)}>
          {units.map((u) => {
            const pts = pointsOf(u);
            if (!pts || pts.length < 3) return null;
            const isSel = u.id === selectedUnitId;
            const color = (STATUSES[u.status] || STATUSES.available).color;
            return (
              <polygon
                key={u.id}
                points={pointsAttr(pts)}
                fill={color}
                fillOpacity={isSel ? 0.45 : 0.28}
                stroke={isSel ? '#fff' : color}
                strokeWidth={(isSel ? 2.5 : 1.5) * lpx}
                strokeLinejoin="round"
                style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
                onPointerDown={(e) => onUnitDown(e, u)}
              />
            );
          })}
          {labels.map((l) => (
            <text key={l.id} x={l.at[0]} y={l.at[1]} className="unit-label" fontSize={14 * lpx} textAnchor="middle" dominantBaseline="central">
              {l.code}
            </text>
          ))}

          {tool === 'select' && selectedPoints && (
            <g>
              {selectedPoints.map((p, i) => {
                const q = selectedPoints[(i + 1) % selectedPoints.length];
                return (
                  <line
                    key={`e${i}`}
                    x1={p[0]}
                    y1={p[1]}
                    x2={q[0]}
                    y2={q[1]}
                    stroke="transparent"
                    strokeWidth={10 * lpx}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => insertVertex(e, i)}
                  />
                );
              })}
              {selectedPoints.map((p, i) => (
                <circle
                  key={`v${i}`}
                  cx={p[0]}
                  cy={p[1]}
                  r={HANDLE_PX * lpx}
                  className="handle"
                  strokeWidth={1.5 * lpx}
                  onPointerDown={(e) => startVertexDrag(e, i)}
                />
              ))}
            </g>
          )}

          {tool === 'draw' && drawing.length > 0 && (
            <g pointerEvents="none">
              <polyline
                points={pointsAttr(cursor ? [...drawing, cursor] : drawing)}
                fill="none"
                stroke="#facc15"
                strokeWidth={2 * lpx}
                strokeDasharray={`${6 * lpx} ${4 * lpx}`}
              />
              {drawing.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={(i === 0 ? HANDLE_PX + 2 : HANDLE_PX - 2) * lpx} fill={i === 0 ? '#facc15' : '#fff'} />
              ))}
            </g>
          )}
        </g>
      </svg>
      <div className="canvas-tools">
        <button className="icon-btn" title="Encuadrar el piso" aria-label="Encuadrar el piso" onClick={() => setView(fitView(W, H))}>
          <Icon name="fit" />
        </button>
      </div>
      <ul className="canvas-help">
        {[...HELP[tool], ...HELP.view].map(([keys, what]) => (
          <li key={what}>
            {keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
            {what}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Atajos visibles al pie del lienzo, según la herramienta.
const HELP = {
  select: [
    [['Arrastrar'], 'mover polígono o punto'],
    [['Doble clic'], 'agregar punto en un borde'],
    [['Alt', 'clic'], 'borrar punto'],
    [['Ctrl C', 'Ctrl V'], 'copiar/pegar unidad'],
    [['Supr'], 'borrar unidad'],
  ],
  draw: [
    [['Clic'], 'agregar punto'],
    [['Enter'], 'cerrar (o clic en el primero)'],
    [['⌫'], 'deshacer punto'],
    [['Esc'], 'cancelar'],
  ],
  align: [
    [['Arrastrar'], 'mover imagen sobre el plano'],
    [['Flechas'], '1px (Shift: 10px)'],
  ],
  view: [
    [['Rueda'], 'zoom'],
    [['Espacio'], 'arrastrar vista'],
  ],
};

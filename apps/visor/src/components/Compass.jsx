import { useLayoutEffect, useRef } from 'react';
import { headingDegrees, shortestDelta } from '../headingStore.js';
import './Compass.css';

// Degree ticks around the bezel, like a real compass card. Cardinals (0/90/180/270)
// are skipped — the needle and N/S/E/O labels already mark them.
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15).filter((deg) => deg % 90 !== 0);

function tickLine(deg) {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const rInner = deg % 45 === 0 ? 39 : 41;
  return {
    x1: 50 + 45 * sin,
    y1: 50 - 45 * cos,
    x2: 50 + rInner * sin,
    y2: 50 - rInner * cos,
  };
}

// Letras de los puntos cardinales: giran al revés que la rosa para quedar
// derechas. [letra, x, y, clase extra]
const LABELS = [
  ['N', 50, 20, ' compass-label--north'],
  ['S', 50, 80, ''],
  ['O', 20, 53, ''],
  ['E', 80, 53, ''],
];

/**
 * Circular compass widget — top-left corner.
 * The rose rotates so that N always points toward true north;
 * the top of the compass always represents the current heading.
 *
 * El rumbo llega por `heading` (ver headingStore.js) y la rotación se escribe
 * directo en el DOM: girar la vista no re-renderiza nada.
 *
 * @param {{ heading: ReturnType<import('../headingStore.js').createHeadingStore>, northOffset?: number|null, visible: boolean, logoUrl?: string|null }} props
 */
export function Compass({ heading, northOffset = null, visible, logoUrl }) {
  const roseRef = useRef(null);
  const labelRefs = useRef([]);
  const shown = visible && northOffset !== null;

  // Layout effect: la rosa queda girada antes del primer pintado (si no,
  // arrancaría en 0 y la transición la haría girar al entrar).
  useLayoutEffect(() => {
    if (!shown) return undefined;
    // La rotación se acumula (no se normaliza) para que la transición CSS
    // gire por el lado corto al cruzar el norte.
    let prev = null;
    let rotation = 0;
    return heading.subscribe((yaw) => {
      const deg = headingDegrees(yaw, northOffset);
      rotation = prev === null ? -deg : rotation - shortestDelta(prev, deg);
      prev = deg;
      if (roseRef.current) roseRef.current.style.transform = `rotate(${rotation}deg)`;
      labelRefs.current.forEach((g, i) => {
        const [, x, y] = LABELS[i];
        g?.setAttribute('transform', `rotate(${-rotation} ${x} ${y})`);
      });
    });
  }, [heading, northOffset, shown]);

  if (!shown) return null;

  return (
    <>
      <div className="compass-wrap">
        <div className="compass-circle" role="img" aria-label="Brújula de orientación">
          <svg
            className="compass-rose"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <path
              d="M 39.72 6.19 L 50 -2.8 L 60.28 6.19 A 45 45 0 1 1 39.72 6.19 Z"
              className="compass-frame"
            />
            <g ref={roseRef} className="compass-rose-rotating">
              {TICKS.map((deg) => {
                const { x1, y1, x2, y2 } = tickLine(deg);
                return (
                  <line
                    key={deg}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    className={deg % 45 === 0 ? 'compass-tick compass-tick--major' : 'compass-tick'}
                  />
                );
              })}
              <polygon points="50,25 53,50 47,50" className="compass-needle--north" />
              <polygon points="50,75 53,50 47,50" className="compass-needle--south" />
              {LABELS.map(([letter, x, y, extra], i) => (
                <g key={letter} ref={(el) => { labelRefs.current[i] = el; }}>
                  <text x={x} y={y} className={`compass-label${extra}`}>{letter}</text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>

      {logoUrl && (
        <img src={logoUrl} alt="" className="compass-logo" aria-hidden="true" />
      )}
    </>
  );
}

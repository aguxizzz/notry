import { useRef } from 'react';
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

/**
 * Circular compass widget — top-left corner.
 * The rose rotates so that N always points toward true north;
 * the top of the compass always represents the current heading.
 *
 * @param {{ yaw: number, northOffset?: number|null, visible: boolean, logoUrl?: string|null }} props
 */
export function Compass({ yaw, northOffset = null, visible, logoUrl }) {
  const prevHeadingRef = useRef(null);
  const accRotRef = useRef(0);

  if (!visible || northOffset === null) return null;

  const headingDeg = (((yaw - northOffset) * 180) / Math.PI + 360000) % 360;

  if (prevHeadingRef.current === null) {
    accRotRef.current = -headingDeg;
  } else {
    // Shortest arc delta in [-180, 180], handles 359→0 and 0→359 correctly
    let delta = headingDeg - prevHeadingRef.current;
    delta = ((delta % 360) + 540) % 360 - 180;
    accRotRef.current -= delta;
  }
  prevHeadingRef.current = headingDeg;

  const rotation = accRotRef.current;

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
            <g
              className="compass-rose-rotating"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
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
              <g transform={`rotate(${-rotation} 50 20)`}>
                <text x="50" y="20" className="compass-label compass-label--north">N</text>
              </g>
              <g transform={`rotate(${-rotation} 50 80)`}>
                <text x="50" y="80" className="compass-label">S</text>
              </g>
              <g transform={`rotate(${-rotation} 20 53)`}>
                <text x="20" y="53" className="compass-label">O</text>
              </g>
              <g transform={`rotate(${-rotation} 80 53)`}>
                <text x="80" y="53" className="compass-label">E</text>
              </g>
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

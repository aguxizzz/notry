import { FACADE, FLOORS } from '../data.js';

const NEIGHBOURS = [
  { x: 0, y: 700, w: 250, h: 160 },
  { x: 250, y: 740, w: 190, h: 120 },
  { x: 440, y: 690, w: 220, h: 170 },
  { x: 940, y: 730, w: 210, h: 130 },
  { x: 1150, y: 760, w: 170, h: 100 },
  { x: 1320, y: 700, w: 280, h: 160 },
];

function FloorArt({ floor }) {
  const { x, w } = FACADE;
  const { y, h, kind } = floor;

  if (kind === 'roof') {
    return (
      <>
        <rect className="facade-floor__body" x={x + 14} y={y} width={w - 28} height={h} />
        <rect className="facade-floor__slab" x={x + 14} y={y} width={w - 28} height={5} />
      </>
    );
  }

  const half = (w - 36) / 2;
  return (
    <>
      <rect className="facade-floor__body" x={x} y={y} width={w} height={h} />
      {kind === 'pb' ? (
        <>
          <rect className="facade-floor__glass" x={x + 14} y={y + 16} width={150} height={h - 16} />
          <rect className="facade-floor__glass" x={x + 190} y={y + 26} width={64} height={h - 26} />
        </>
      ) : (
        <>
          <rect className="facade-floor__glass" x={x + 12} y={y + 14} width={half} height={h - 22} />
          <rect className="facade-floor__glass" x={x + 24 + half} y={y + 14} width={half} height={h - 22} />
          <rect className="facade-floor__rail" x={x + 6} y={y + h - 22} width={w - 12} height={14} />
        </>
      )}
      <rect className="facade-floor__slab" x={x - 6} y={y + h - 8} width={w + 12} height={8} />
    </>
  );
}

export default function Facade({ hoverId, onHover, onEnter }) {
  const { width, height, ground } = FACADE;

  return (
    <svg
      className="facade"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMax slice"
      role="group"
      aria-label="Fachada del edificio"
    >
      <defs>
        <linearGradient id="facade-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9c9c6" />
          <stop offset="0.7" stopColor="#e4e3df" />
          <stop offset="1" stopColor="#efe9dc" />
        </linearGradient>
        <radialGradient id="facade-glow" cx="0.62" cy="0.86" r="0.5">
          <stop offset="0" stopColor="#c5a059" stopOpacity="0.38" />
          <stop offset="1" stopColor="#c5a059" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={width} height={height} fill="url(#facade-sky)" />
      <rect width={width} height={height} fill="url(#facade-glow)" />

      {NEIGHBOURS.map((n) => (
        <rect key={n.x} className="facade-neighbour" x={n.x} y={n.y} width={n.w} height={n.h} />
      ))}
      <rect className="facade-ground" x="0" y={ground} width={width} height={height - ground} />

      {FLOORS.map((floor) => (
        <g
          key={floor.id}
          className={`facade-floor${hoverId === floor.id ? ' is-hover' : ''}`}
          style={{ '--i': floor.index }}
          role="button"
          tabIndex={0}
          aria-label={floor.name}
          onMouseEnter={() => onHover(floor.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(floor.id)}
          onBlur={() => onHover(null)}
          onClick={() => onEnter(floor.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onEnter(floor.id);
            }
          }}
        >
          <FloorArt floor={floor} />
          <rect
            className="facade-floor__hit"
            x={FACADE.x - 6}
            y={floor.y}
            width={FACADE.w + 12}
            height={floor.h}
          />
        </g>
      ))}
    </svg>
  );
}

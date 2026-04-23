import { useState } from 'react';
import { getHeatColor } from '../../utils/heatColor';

export default function BlueprintPolygonLayer({
  annotations,
  clicksMap,
  maxClicks,
  imgDisplayW,
  imgDisplayH,
  onHoverChange,
}) {
  return (
    <svg
      className="blueprint-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'auto',
      }}
    >
      {annotations.map((ann) => {
        const clicks = clicksMap[ann.uuid] || 0;
        const color = getHeatColor(clicks, maxClicks);
        const pointsString = ann.blueprint_coordinates
          .map(([x, y]) => `${x * imgDisplayW},${y * imgDisplayH}`)
          .join(' ');
        const loteLabel = ann.tooltip || 'Lote';

        return (
          <PolygonAnnotation
            key={ann.uuid}
            ann={ann}
            pointsString={pointsString}
            color={color}
            loteLabel={loteLabel}
            clicks={clicks}
            onHoverChange={onHoverChange}
          />
        );
      })}
    </svg>
  );
}

function PolygonAnnotation({ ann, pointsString, color, loteLabel, clicks, onHoverChange }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <g
      onMouseEnter={() => { setIsHovered(true); onHoverChange(ann.uuid); }}
      onMouseLeave={() => { setIsHovered(false); onHoverChange(null); }}
    >
      <polygon
        points={pointsString}
        fill={color}
        fillOpacity={isHovered ? 0.8 : 0.6}
        stroke="var(--color-accent)"
        strokeWidth={isHovered ? 2.5 : 1.5}
        role="button"
        tabIndex={0}
        aria-label={`${loteLabel}, ${clicks} clics. Presiona Enter o Espacio para ${isHovered ? 'deseleccionar' : 'seleccionar'}`}
        aria-pressed={isHovered}
        onFocus={() => { setIsHovered(true); onHoverChange(ann.uuid); }}
        onBlur={() => { setIsHovered(false); onHoverChange(null); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const next = isHovered ? null : ann.uuid;
            setIsHovered(!isHovered);
            onHoverChange(next);
          }
        }}
        style={{ cursor: 'pointer', outline: 'none', transition: 'fill-opacity 0.15s ease, stroke-width 0.15s ease, fill 0.15s ease' }}
      />
    </g>
  );
}
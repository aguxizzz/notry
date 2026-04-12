import { useState, useRef, useEffect } from 'react';
import { getHeatColor } from '../utils/heatColor';

export default function BlueprintHeatmap({
  blueprintUrl,
  annotations,
  clicksData,
  missingCoordinatesCount
}) {
  const [hoveredLoteId, setHoveredLoteId] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDims, setImageDims] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef(null);
  const imgRef = useRef(null);

  // Build a map of lote_uuid -> clicks for quick lookup
  const clicksMap = Object.fromEntries(
    clicksData.map(item => [item.lote_uuid, item.clicks])
  );

  const maxClicks = clicksData.reduce((m, d) => Math.max(m, d.clicks), 0);

  // Filter annotations that have blueprint coordinates
  const renderableAnnotations = annotations.filter(
    ann => ann.blueprint_coordinates && ann.blueprint_coordinates.length > 0
  );

  const handleImageLoad = (e) => {
    const img = e.target;
    const dims = { w: img.naturalWidth, h: img.naturalHeight };
    console.log('Image loaded:', dims);
    setImageDims(dims);
    setImageLoaded(true);
  };

  const handleMouseMove = (e) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 40,
    });
  };

  // Only render SVG after image has loaded
  if (!imageLoaded || !imageDims) {
    return (
      <div className="blueprint-heatmap-container">
        {missingCoordinatesCount > 0 && (
          <div className="blueprint-warning">
            <span>⚠️ {missingCoordinatesCount} lote{missingCoordinatesCount > 1 ? 's' : ''} no se muestran (sin coordenadas en blueprint)</span>
          </div>
        )}
        <div className="blueprint-heatmap-wrapper" ref={wrapperRef} onMouseMove={handleMouseMove}>
          <img
            ref={imgRef}
            src={blueprintUrl}
            alt="Blueprint"
            className="blueprint-image"
            onLoad={handleImageLoad}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="blueprint-heatmap-container">
      {missingCoordinatesCount > 0 && (
        <div className="blueprint-warning">
          <span>⚠️ {missingCoordinatesCount} lote{missingCoordinatesCount > 1 ? 's' : ''} no se muestran (sin coordenadas en blueprint)</span>
        </div>
      )}

      <div className="blueprint-heatmap-wrapper" ref={wrapperRef} onMouseMove={handleMouseMove}>
        <img
          ref={imgRef}
          src={blueprintUrl}
          alt="Blueprint"
          className="blueprint-image"
          onLoad={handleImageLoad}
        />

        <svg
          className="blueprint-overlay"
          viewBox={`0 0 ${imageDims.w} ${imageDims.h}`}
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        >
          {renderableAnnotations.map((ann) => {
            const clicks = clicksMap[ann.uuid] || 0;
            const color = getHeatColor(clicks, maxClicks);
            const isHovered = hoveredLoteId === ann.uuid;
            const pointsString = ann.blueprint_coordinates.map(([x, y]) => `${x},${y}`).join(' ');

            return (
              <g
                key={ann.uuid}
                onMouseEnter={() => setHoveredLoteId(ann.uuid)}
                onMouseLeave={() => setHoveredLoteId(null)}
                style={{ cursor: 'pointer' }}
              >
                <polygon
                  points={pointsString}
                  fill={color}
                  fillOpacity={isHovered ? 0.8 : 0.6}
                  stroke="#c5a059"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  style={{ transition: 'all 0.15s ease' }}
                />
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredLoteId && clicksMap[hoveredLoteId] !== undefined && (
          <div
            className="blueprint-tooltip"
            style={{
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              transform: 'translateX(-50%)',
            }}
          >
            {renderableAnnotations.find(a => a.uuid === hoveredLoteId)?.tooltip || 'Lote'}
            <br />
            <strong>{clicksMap[hoveredLoteId]} clicks</strong>
          </div>
        )}
      </div>
    </div>
  );
}

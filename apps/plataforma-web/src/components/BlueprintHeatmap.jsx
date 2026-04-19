import { useState, useRef, useEffect, useCallback } from 'react';
import { getHeatColor } from '../utils/heatColor';

const ZOOM_IN_LABEL = 'Acercar';
const ZOOM_OUT_LABEL = 'Alejar';
const RESET_VIEW_LABEL = 'Centrar vista';
const FULLSCREEN_LABEL = 'Pantalla completa';

export default function BlueprintHeatmap({
  blueprintUrl,
  annotations,
  clicksData,
  missingCoordinatesCount
}) {
  const [hoveredLoteId, setHoveredLoteId] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageDims, setImageDims] = useState(null);
  const [wrapperDims, setWrapperDims] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const rafRef = useRef(null);
  const pendingZoomRef = useRef(null); // accumulated wheel delta

  // RAF loop: reads refs and commits a single state update per frame.
  const scheduleUpdate = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      if (pendingZoomRef.current !== null) {
        setZoom(pendingZoomRef.current);
        pendingZoomRef.current = null;
      }
      setPanX(panXRef.current);
      setPanY(panYRef.current);
      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    panXRef.current = panX;
    panYRef.current = panY;
  }, [panX, panY]);

  const safeClicksData = clicksData ?? [];
  const missingCount = missingCoordinatesCount ?? 0;

  const clicksMap = Object.fromEntries(
    safeClicksData.map(item => [item.lote_uuid, item.clicks])
  );

  const maxClicks = safeClicksData.reduce((m, d) => Math.max(m, d.clicks ?? 0), 0);

  const renderableAnnotations = annotations.filter(
    ann => ann.blueprint_coordinates && ann.blueprint_coordinates.length > 0
  );

  // Track wrapper dimensions so we can compute image display size
  useEffect(() => {
    if (!wrapperRef.current) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWrapperDims({
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        });
      }
    });

    ro.observe(wrapperRef.current);
    // Initial measurement
    setWrapperDims({
      w: wrapperRef.current.clientWidth,
      h: wrapperRef.current.clientHeight,
    });

    return () => ro.disconnect();
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    if (pendingZoomRef.current === null) {
      pendingZoomRef.current = zoom;
    }
    pendingZoomRef.current = Math.max(0.2, Math.min(10, pendingZoomRef.current * delta));
    scheduleUpdate();
  }, [zoom, scheduleUpdate]);

  const handlePanStart = (e) => {
    // Both left and middle mouse button triggers pan
    if (e.button !== 0 && e.button !== 1) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - panXRef.current, y: e.clientY - panYRef.current };
  };

  const handlePanMove = (e) => {
    if (!isPanningRef.current) return;
    panXRef.current = e.clientX - panStartRef.current.x;
    panYRef.current = e.clientY - panStartRef.current.y;
    scheduleUpdate();
  };

  const handlePanEnd = () => {
    isPanningRef.current = false;
  };

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper) {
      wrapper.addEventListener('wheel', handleWheel, { passive: false });
    }
    window.addEventListener('mouseup', handlePanEnd);
    window.addEventListener('mousemove', handlePanMove);

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('wheel', handleWheel);
      }
      window.removeEventListener('mouseup', handlePanEnd);
      window.removeEventListener('mousemove', handlePanMove);
    };
  }, [handleWheel]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      wrapperRef.current?.requestFullscreen?.().catch(console.error);
    } else {
      document.exitFullscreen?.();
    }
  };

  const handleImageLoad = (e) => {
    const img = e.target;
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      setImageError(true);
      return;
    }
    setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  const handleWrapperMouseMove = (e) => {
    if (isPanningRef.current) return; // Disregard tooltips while actively panning
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 40,
    });
  };

  if (imageError) {
    return (
      <div className="blueprint-heatmap-container">
        {missingCount > 0 && (
          <div className="blueprint-warning">
            <span>⚠️ {missingCount} lote{missingCount > 1 ? 's' : ''} no se muestran (sin coordenadas en blueprint)</span>
          </div>
        )}
        <div className="blueprint-heatmap-wrapper" ref={wrapperRef} onMouseMove={handleWrapperMouseMove}>
          <div className="blueprint-error">Error al cargar la imagen del blueprint</div>
          <img
            src={blueprintUrl}
            alt="Blueprint"
            className="blueprint-image"
            loading="lazy"
            onError={handleImageError}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    );
  }

  if (!imageLoaded || !imageDims) {
    return (
      <div className="blueprint-heatmap-container">
        {missingCount > 0 && (
          <div className="blueprint-warning">
            <span>⚠️ {missingCount} lote{missingCount > 1 ? 's' : ''} no se muestran (sin coordenadas en blueprint)</span>
          </div>
        )}
        <div className="blueprint-heatmap-wrapper" ref={wrapperRef} onMouseMove={handleWrapperMouseMove}>
          <img
            src={blueprintUrl}
            alt="Blueprint"
            className="blueprint-image"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      </div>
    );
  }

  // Compute image's rendered size within the wrapper (object-fit: contain math)
  let imgDisplayW = imageDims.w;
  let imgDisplayH = imageDims.h;
  if (wrapperDims && wrapperDims.w > 0 && wrapperDims.h > 0) {
    const imageAspect = imageDims.w / imageDims.h;
    const wrapperAspect = wrapperDims.w / wrapperDims.h;
    if (imageAspect > wrapperAspect) {
      // Image wider — width-limited
      imgDisplayW = wrapperDims.w;
      imgDisplayH = wrapperDims.w / imageAspect;
    } else {
      // Image taller — height-limited
      imgDisplayH = wrapperDims.h;
      imgDisplayW = wrapperDims.h * imageAspect;
    }
  }

  // Scale factor from natural image coords to display coords
  const scaleX = imgDisplayW / imageDims.w;
  const scaleY = imgDisplayH / imageDims.h;

  return (
    <div className="blueprint-heatmap-container">
      {missingCount > 0 && (
        <div className="blueprint-warning">
          <span>⚠️ {missingCount} lote{missingCount > 1 ? 's' : ''} no se muestran (sin coordenadas en blueprint)</span>
        </div>
      )}

      <div
        className="blueprint-heatmap-wrapper"
        ref={wrapperRef}
        onMouseDown={handlePanStart}
        onMouseMove={handleWrapperMouseMove}
        style={{ cursor: 'grab', position: 'relative' }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: `${imgDisplayW}px`,
            height: `${imgDisplayH}px`,
            transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom})`,
            transformOrigin: '50% 50%',
            pointerEvents: 'none',
          }}
        >
          <img
            src={blueprintUrl}
            alt="Blueprint"
            className="blueprint-image"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, pointerEvents: 'none', userSelect: 'none' }}
          />

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
          {renderableAnnotations.map((ann) => {
            const clicks = clicksMap[ann.uuid] || 0;
            const color = getHeatColor(clicks, maxClicks);
            const isHovered = hoveredLoteId === ann.uuid;
            // Scale normalized coords (0-1) → display pixel coords
            const pointsString = ann.blueprint_coordinates
              .map(([x, y]) => `${x * imgDisplayW},${y * imgDisplayH}`)
              .join(' ');

            const loteLabel = renderableAnnotations.find(a => a.uuid === ann.uuid)?.tooltip || 'Lote';
            return (
              <g
                key={ann.uuid}
                onMouseEnter={() => setHoveredLoteId(ann.uuid)}
                onMouseLeave={() => setHoveredLoteId(null)}
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
                  onFocus={() => setHoveredLoteId(ann.uuid)}
                  onBlur={() => setHoveredLoteId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setHoveredLoteId(isHovered ? null : ann.uuid);
                    }
                  }}
                  style={{ cursor: 'pointer', outline: 'none', transition: 'fill-opacity 0.15s ease, stroke-width 0.15s ease, fill 0.15s ease' }}
                />
              </g>
            );
          })}
        </svg>

        </div>

        {hoveredLoteId && clicksMap[hoveredLoteId] !== undefined && (
          <div
            className="blueprint-tooltip"
            style={{
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              transform: 'translateX(-50%)',
              zIndex: 10,
            }}
          >
            {renderableAnnotations.find(a => a.uuid === hoveredLoteId)?.tooltip || 'Lote'}
            <br />
            <strong>{clicksMap[hoveredLoteId]} clicks</strong>
          </div>
        )}

        <div className="blueprint-controls">
          <button
            className="blueprint-btn"
            onClick={() => setZoom(z => Math.max(0.2, z / 1.2))}
            aria-label={ZOOM_IN_LABEL}
          >
            -
          </button>
          <button
            className="blueprint-btn"
            onClick={() => setZoom(z => Math.min(10, z * 1.2))}
            aria-label={ZOOM_OUT_LABEL}
          >
            +
          </button>
          <button
            className="blueprint-btn blueprint-btn--wide"
            onClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
            aria-label={RESET_VIEW_LABEL}
          >
            RESET
          </button>
          <button
            className="blueprint-btn blueprint-btn--wide"
            onClick={toggleFullscreen}
            aria-label={FULLSCREEN_LABEL}
          >
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
}

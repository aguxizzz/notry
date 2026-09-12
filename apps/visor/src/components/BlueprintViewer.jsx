import { useEffect, useRef, useState, useCallback } from 'react';

const POLY_VAR = {
  available: { fill: 'rgba(34,197,94,0.24)',  stroke: 'rgba(34,197,94,0.9)'  },
  unavailable: { fill: 'rgba(107,114,128,0.30)', stroke: 'rgba(75,85,99,0.95)' },
  sold:      { fill: 'rgba(239,68,68,0.24)',  stroke: 'rgba(239,68,68,0.9)'  },
  reserved:  { fill: 'rgba(59,130,246,0.24)', stroke: 'rgba(59,130,246,0.9)' },
  default:   { fill: 'rgba(0,100,255,0.28)',  stroke: 'rgba(0,100,255,0.9)'  },
  recommended: { fill: 'rgba(197,160,89,0.42)', stroke: 'rgba(197,160,89,0.95)' },
  muted: { fill: 'rgba(160,160,160,0.20)', stroke: 'rgba(255,255,255,0.6)' },
};

function getPolyVar(status) {
  return POLY_VAR[status] || POLY_VAR.default;
}

function getPoiVar(color) {
  const c = color ?? '#14b8a6';
  return {
    fill: `${c}22`,
    stroke: c,
    strokeDasharray: '8 4',
    strokeLinecap: 'round',
  };
}

export default function BlueprintViewer({
  blueprintUrl,
  annotations,
  selectedId,
  onMarkerSelect,
  onMarkerHover,
  hasStageSwitcher,
  recommendedIds,
  focusMode,
}) {
  const containerRef = useRef(null);
  const transformRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imgDims, setImgDims] = useState({ w: 1, h: 1 });
  const [displayDims, setDisplayDims] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [hoveredId, setHoveredId] = useState(null);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const displayDimsRef = useRef(displayDims);

  useEffect(() => {
    zoomRef.current = zoom;
    displayDimsRef.current = displayDims;
  }, [zoom, displayDims]);

  // Sync transform to DOM after initial image load
  useEffect(() => {
    if (!imageLoaded) return;
    if (transformRef.current) {
      transformRef.current.style.transform = `translate(${panXRef.current}px, ${panYRef.current}px) scale(${zoomRef.current})`;
    }
  }, [imageLoaded]);

  // Load image
  useEffect(() => {
    if (!blueprintUrl) return;
    setImageLoaded(false);
    setImageError(false);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        setImageError(true);
        return;
      }
      setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
      setImageLoaded(true);
    };
    img.onerror = () => {
      setImageError(true);
    };
    img.src = blueprintUrl;
  }, [blueprintUrl]);

  // Calculate display size at zoom=1
  useEffect(() => {
    if (!imageLoaded || !containerRef.current) return;

    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    const imageAspect = imgDims.w / imgDims.h;
    const containerAspect = containerW / containerH;

    let displayW, displayH;
    if (imageAspect > containerAspect) {
      displayW = containerW;
      displayH = containerW / imageAspect;
    } else {
      displayH = containerH;
      displayW = containerH * imageAspect;
    }

    setDisplayDims({ w: displayW, h: displayH });
  }, [imageLoaded, imgDims]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.5, Math.min(5, prev * delta)));
  }, []);

  const handlePanStart = (e) => {
    if (e.button !== 1) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - panXRef.current, y: e.clientY - panYRef.current };
  };

  const handlePanMove = (e) => {
    if (!isPanningRef.current) return;
    panXRef.current = e.clientX - panStartRef.current.x;
    panYRef.current = e.clientY - panStartRef.current.y;
    if (transformRef.current) {
      transformRef.current.style.transform = `translate(${panXRef.current}px, ${panYRef.current}px) scale(${zoomRef.current})`;
    }
  };

  const handlePanEnd = () => {
    isPanningRef.current = false;
  };

  useEffect(() => {
    const handleMove = handlePanMove;
    const handleUp = handlePanEnd;

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    window.addEventListener('mouseup', handleUp);

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
      window.removeEventListener('mouseup', handleUp);
    };
  }, [handleWheel]);

  const normToSvg = (nx, ny) => ({
    x: nx * displayDims.w,
    y: ny * displayDims.h,
  });

  const handlePolygonClick = (e, ann) => {
    e.stopPropagation();
    onMarkerSelect && onMarkerSelect(ann);
  };

  const handlePolygonKeyDown = (e, ann) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onMarkerSelect && onMarkerSelect(ann);
    }
  };

  const handlePolygonHover = (e, ann) => {
    const id = ann ? ann.uuid || ann.id : null;
    setHoveredId(id);
    onMarkerHover && onMarkerHover(ann);
  };

  // Empty state: no annotations with valid blueprint_coordinates
  const hasAnnotations = annotations.some(a =>
    a.type === 'polygon' && a.blueprint_coordinates?.length >= 3 ||
    a.type === 'poi' && ((a.variant === 'callout' || a.marker_variant === 'callout') ? (a.blueprint_anchor ?? a.blueprint_coordinates?.[0]) : a.blueprint_coordinates?.length >= 3)
  );

  if (!blueprintUrl) {
    return (
      <div
        ref={containerRef}
        className="viewer-state viewer-state--empty"
      >
        Sin blueprint disponible
      </div>
    );
  }

  if (imageError) {
    return (
      <div
        ref={containerRef}
        className="viewer-state viewer-state--error"
      >
        <span>Error al cargar la imagen del blueprint</span>
        <span className="viewer-state__sub">Verifica que la URL sea accesible</span>
      </div>
    );
  }

  if (!imageLoaded) {
    return (
      <div
        ref={containerRef}
        className="viewer-state viewer-state--loading"
      >
        Cargando blueprint...
      </div>
    );
  }

  const dw = displayDims.w;
  const dh = displayDims.h;

  // No annotations to render on top of blueprint
  if (!hasAnnotations) {
    return (
      <div
        ref={containerRef}
        className="viewer-canvas"
      >
        <img
          src={blueprintUrl}
          alt="Plano del terreno"
          className="viewer-canvas__img"
          loading="lazy"
          draggable={false}
        />
        <div
          className="viewer-badge viewer-badge--center"
          style={hasStageSwitcher ? { bottom: 82 } : undefined}
        >
          Sin lotes definidos en blueprint
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="viewer-canvas viewer-canvas--interactive"
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
    >
      <div
        ref={transformRef}
        className="viewer-transform"
        style={{ transform: `translate(${panXRef.current}px, ${panYRef.current}px) scale(${zoom})` }}
      >
        <img
          src={blueprintUrl}
          alt="Plano de lotes con áreas interactivas"
          className="viewer-bp-img"
          style={{ width: dw, height: dh }}
          loading="lazy"
          decoding="async"
          draggable={false}
        />

        <svg
          focusable="false"
          className="viewer-svg"
          style={{ width: dw, height: dh }}
        >
          {annotations.map((ann) => {
            const isPolygon = ann.type === 'polygon';
            const isPoi = ann.type === 'poi';
            const isCallout = isPoi && (ann.variant === 'callout' || ann.marker_variant === 'callout');
            if (isCallout) {
              const anchor = ann.blueprint_anchor ?? ann.blueprint_coordinates?.[0];
              if (!anchor) return null;
              const point = normToSvg(anchor[0], anchor[1]);
              const id = ann.uuid || ann.id;
              const isFocused = hoveredId === id || selectedId === id;
              const stem = Math.max(40, Math.min(260, Number(ann.callout_stem_height) || 96));
              const isPhotoPin = Boolean(ann.image_url);
              return (
                <g key={id} role="button" tabIndex={0} aria-label={ann.tooltip ?? id}
                  className={`bp-poly bp-callout${isFocused ? ' bp-poly--focused' : ''}`}
                  onClick={(e) => handlePolygonClick(e, ann)} onKeyDown={(e) => handlePolygonKeyDown(e, ann)}
                  onMouseEnter={() => handlePolygonHover(null, ann)} onMouseLeave={() => handlePolygonHover(null, null)}>
                  {isPhotoPin ? (
                    <>
                      <path d={`M ${point.x} ${point.y} C ${point.x - 10} ${point.y - 13}, ${point.x - 12} ${point.y - 20}, ${point.x - 12} ${point.y - 25} A 12 12 0 1 1 ${point.x + 12} ${point.y - 25} C ${point.x + 12} ${point.y - 20}, ${point.x + 10} ${point.y - 13}, ${point.x} ${point.y}`} fill={ann.color || '#c5a059'} stroke="#fffdf8" strokeWidth="2" strokeLinejoin="round" />
                      <circle cx={point.x} cy={point.y - 25} r="4" fill="#fffdf8" />
                    </>
                  ) : (
                    <>
                      <line x1={point.x} y1={point.y} x2={point.x} y2={Math.max(18, point.y - stem)} stroke="#fff" strokeWidth="1.5" />
                      <text x={point.x + 8} y={Math.max(14, point.y - stem)} textAnchor="start" fill="#fff" fontSize="15" fontWeight="600" dominantBaseline="hanging" paintOrder="stroke" stroke="#171713" strokeWidth="4" strokeLinejoin="round">{ann.tooltip}</text>
                    </>
                  )}
                </g>
              );
            }
            if ((!isPolygon && !isPoi) || !ann.blueprint_coordinates || ann.blueprint_coordinates.length < 3) {
              return null;
            }

            const isRecommended = !isPoi && Boolean(recommendedIds?.has(ann.uuid || ann.id));
            const isMuted = !isPoi && !isRecommended && Boolean(focusMode) && (recommendedIds?.size ?? 0) > 0;
            const polyVar = isPoi
              ? getPoiVar(ann.color)
              : getPolyVar(isRecommended ? 'recommended' : isMuted ? 'muted' : (ann.status || ann.estado));
            const statusKey = isRecommended ? 'recommended' : isMuted ? 'muted' : (ann.status || ann.estado || 'default');
            const isHovered = hoveredId === (ann.uuid || ann.id);
            const isSelected = selectedId === (ann.uuid || ann.id);
            const isFocused  = isHovered || isSelected;

            const pts = ann.blueprint_coordinates.map(([nx, ny]) => normToSvg(nx, ny));
            if (pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
            const ptsStr = pts.map((p) => `${p.x},${p.y}`).join(' ');

            return (
              <g
                key={ann.uuid || ann.id}
                role="button"
                tabIndex={0}
                aria-label={ann.tooltip ?? (ann.uuid || ann.id)}
                className={`bp-poly bp-poly--${isPoi ? 'poi' : statusKey}${isFocused ? ' bp-poly--focused' : ''}`}
                onClick={(e) => handlePolygonClick(e, ann)}
                onKeyDown={(e) => handlePolygonKeyDown(e, ann)}
                onMouseEnter={(e) => handlePolygonHover(e, ann)}
                onMouseLeave={(e) => handlePolygonHover(e, null)}
              >
                <polygon
                  points={ptsStr}
                  fill={polyVar.fill}
                  stroke={polyVar.stroke}
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Zoom indicator */}
      <div className="viewer-badge viewer-badge--zoom">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}

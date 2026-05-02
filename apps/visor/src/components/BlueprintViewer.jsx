import { useEffect, useRef, useState, useCallback } from 'react';

const POLY_VAR = {
  available: { fill: 'rgba(34,197,94,0.08)',  stroke: 'rgba(255,255,255,0.9)', strokeDasharray: '12 6', strokeLinecap: 'round' },
  sold:      { fill: 'rgba(239,68,68,0.08)',  stroke: 'rgba(255,255,255,0.9)', strokeDasharray: '12 6', strokeLinecap: 'round' },
  reserved:  { fill: 'rgba(59,130,246,0.08)', stroke: 'rgba(255,255,255,0.9)', strokeDasharray: '12 6', strokeLinecap: 'round' },
  default:   { fill: 'rgba(0,100,255,0.08)',  stroke: 'rgba(255,255,255,0.9)', strokeDasharray: '12 6', strokeLinecap: 'round' },
};

function getPolyVar(status) {
  return POLY_VAR[status] || POLY_VAR.default;
}

export default function BlueprintViewer({
  blueprintUrl,
  annotations,
  selectedId,
  onMarkerSelect,
  onMarkerHover,
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
    x: nx * displayDimsRef.current.w,
    y: ny * displayDimsRef.current.h,
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
  const hasAnnotations = annotations.some(
    a => a.type === 'polygon' && a.blueprint_coordinates?.length >= 3
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
        <div className="viewer-badge viewer-badge--center">
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
            if (ann.type !== 'polygon' || !ann.blueprint_coordinates || ann.blueprint_coordinates.length < 3) {
              return null;
            }

            const polyVar = getPolyVar(ann.status || ann.estado);
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
                className={isFocused ? 'bp-poly bp-poly--focused' : 'bp-poly'}
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

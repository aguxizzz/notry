import { useEffect, useRef, useState, useCallback } from 'react';

const STATUS_COLORS = {
  available: { fill: 'rgba(34,197,94,0.3)', stroke: 'rgba(22,163,74,0.7)' },
  sold: { fill: 'rgba(239,68,68,0.35)', stroke: 'rgba(220,38,38,0.8)' },
  reserved: { fill: 'rgba(59,130,246,0.32)', stroke: 'rgba(37,99,235,0.75)' },
  default: { fill: 'rgba(0,100,255,0.2)', stroke: 'rgba(0,102,204,0.7)' },
};

function getStatusColors(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.default;
}

export default function BlueprintViewer({
  blueprintUrl,
  annotations,
  selectedId,
  onMarkerSelect,
  onMarkerHover,
}) {
  const containerRef = useRef(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imgDims, setImgDims] = useState({ w: 1, h: 1 });
  const [displayDims, setDisplayDims] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const displayDimsRef = useRef(displayDims);

  useEffect(() => {
    zoomRef.current = zoom;
    panXRef.current = panX;
    panYRef.current = panY;
    displayDimsRef.current = displayDims;
  }, [zoom, panX, panY, displayDims]);

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
    setPanX(e.clientX - panStartRef.current.x);
    setPanY(e.clientY - panStartRef.current.y);
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
        style={{
          width: '100%',
          height: '100%',
          background: '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontFamily: 'sans-serif',
          fontSize: '0.9rem',
        }}
      >
        Sin blueprint disponible
      </div>
    );
  }

  if (imageError) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: '#1a1a1a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e88',
          fontFamily: 'sans-serif',
          fontSize: '0.9rem',
          gap: 8,
        }}
      >
        <span>Error al cargar la imagen del blueprint</span>
        <span style={{ color: '#666', fontSize: '0.8rem' }}>Verifica que la URL sea accesible</span>
      </div>
    );
  }

  if (!imageLoaded) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontFamily: 'sans-serif',
          fontSize: '0.9rem',
        }}
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
        style={{
          width: '100%',
          height: '100%',
          background: '#1a1a1a',
          position: 'relative',
        }}
      >
        <img
          src={blueprintUrl}
          alt="Blueprint"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
          draggable={false}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)',
            color: '#aaa',
            fontSize: '0.8rem',
            padding: '6px 14px',
            borderRadius: 20,
            fontFamily: 'sans-serif',
          }}
        >
          Sin lotes definidos en blueprint
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#1a1a1a',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'default',
      }}
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transformOrigin: '0 0',
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          pointerEvents: 'none',
        }}
      >
        <img
          src={blueprintUrl}
          alt="Blueprint"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: dw,
            height: dh,
            display: 'block',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
          draggable={false}
        />

        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: dw,
            height: dh,
            overflow: 'visible',
            pointerEvents: 'auto',
          }}
        >
          {annotations.map((ann) => {
            if (ann.type !== 'polygon' || !ann.blueprint_coordinates || ann.blueprint_coordinates.length < 3) {
              return null;
            }

            const colors = getStatusColors(ann.status || ann.estado);
            const isHovered = hoveredId === (ann.uuid || ann.id);
            const isSelected = selectedId === (ann.uuid || ann.id);

            const pts = ann.blueprint_coordinates.map(([nx, ny]) => normToSvg(nx, ny));
            if (pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
            const ptsStr = pts.map((p) => `${p.x},${p.y}`).join(' ');

            return (
              <g key={ann.uuid || ann.id}>
                <polygon
                  points={ptsStr}
                  fill={isHovered || isSelected ? colors.fill.replace(/[\d.]+\)$/, m => `${Math.min(1, parseFloat(m) + 0.3)})`) : colors.fill}
                  stroke={isHovered || isSelected ? colors.stroke : colors.stroke}
                  strokeWidth={isHovered || isSelected ? 2.5 / zoom : 1.5 / zoom}
                  style={{
                    cursor: 'pointer',
                    transition: 'fill 0.15s ease',
                  }}
                  onClick={(e) => handlePolygonClick(e, ann)}
                  onMouseEnter={(e) => handlePolygonHover(e, ann)}
                  onMouseLeave={(e) => handlePolygonHover(e, null)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Zoom indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          fontSize: '0.75rem',
          padding: '4px 8px',
          borderRadius: 4,
          pointerEvents: 'none',
          fontFamily: 'sans-serif',
        }}
      >
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}

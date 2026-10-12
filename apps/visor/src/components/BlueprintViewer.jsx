import { useEffect, useRef, useState, useCallback, Fragment } from 'react';
import { getLoteBadgeSvg, STATUS_FILL_COLORS, STATUS_FILL_FALLBACK } from '../annotations.js';

// Por defecto el lote no lleva relleno de color (pedido del cliente, ver
// annotations.js): el polígono queda transparente y solo se ve su borde. Con el
// estilo `status_fill` se pinta con el relleno suave de estado (ver
// STATUS_FILL_COLORS). `recommended`/`muted` no son colores de estado, se mantienen.
const POLY_VAR = {
  default:   { fill: 'transparent',  stroke: 'rgba(255,255,255,0.9)'  },
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
  loteLabels,
  badgeStyle = 'default',
  badgeColors = false,
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
  // Offset que centra la imagen "fiteada" dentro del contenedor: cuando el
  // aspect ratio del blueprint no matchea el del viewport (típico en mobile
  // portrait, donde el plano queda angosto/alto) el fit-to-width/height deja
  // franjas vacías — sin este offset la imagen quedaba pegada arriba a la
  // izquierda en vez de centrada.
  const baseOffsetRef = useRef({ x: 0, y: 0 });
  const touchStateRef = useRef({ mode: null });

  useEffect(() => {
    zoomRef.current = zoom;
    displayDimsRef.current = displayDims;
  }, [zoom, displayDims]);

  const applyTransform = useCallback(() => {
    if (transformRef.current) {
      transformRef.current.style.transform = `translate(${baseOffsetRef.current.x + panXRef.current}px, ${baseOffsetRef.current.y + panYRef.current}px) scale(${zoomRef.current})`;
    }
  }, []);

  // Sync transform to DOM after initial image load
  useEffect(() => {
    if (!imageLoaded) return;
    applyTransform();
  }, [imageLoaded, applyTransform]);

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

  // Calculate display size at zoom=1 (fit-to-container) and re-center.
  // Recalcula también en resize/orientationchange: en mobile el viewport
  // cambia (rotación, barra de direcciones) y el fit inicial quedaría
  // desactualizado si solo dependiera de la carga de imagen.
  useEffect(() => {
    if (!imageLoaded || !containerRef.current) return;

    const recompute = () => {
      const container = containerRef.current;
      if (!container) return;
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
      baseOffsetRef.current = {
        x: (containerW - displayW) / 2,
        y: (containerH - displayH) / 2,
      };
      applyTransform();
    };

    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('orientationchange', recompute);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('orientationchange', recompute);
    };
  }, [imageLoaded, imgDims, applyTransform]);

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
    applyTransform();
  };

  const handlePanEnd = () => {
    isPanningRef.current = false;
  };

  // Touch: un dedo hace pan, dos dedos hacen pinch-to-zoom. El wheel/drag de
  // mouse de arriba no tiene equivalente táctil, así que en mobile el modo
  // blueprint quedaba totalmente estático (ni pan ni zoom funcionaban).
  const touchDist = (t0, t1) => Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStateRef.current = { mode: 'pan', lastX: t.clientX, lastY: t.clientY };
    } else if (e.touches.length === 2) {
      const [t0, t1] = e.touches;
      touchStateRef.current = {
        mode: 'pinch',
        startDist: touchDist(t0, t1),
        startZoom: zoomRef.current,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    const state = touchStateRef.current;
    if (state.mode === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      panXRef.current += t.clientX - state.lastX;
      panYRef.current += t.clientY - state.lastY;
      state.lastX = t.clientX;
      state.lastY = t.clientY;
      applyTransform();
    } else if (state.mode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const [t0, t1] = e.touches;
      const dist = touchDist(t0, t1);
      if (state.startDist > 0) {
        const nextZoom = Math.max(0.5, Math.min(5, state.startZoom * (dist / state.startDist)));
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        applyTransform();
      }
    }
  }, [applyTransform]);

  const handleTouchEnd = useCallback((e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStateRef.current = { mode: 'pan', lastX: t.clientX, lastY: t.clientY };
    } else if (e.touches.length === 0) {
      touchStateRef.current = { mode: null };
    }
  }, []);

  useEffect(() => {
    const handleMove = handlePanMove;
    const handleUp = handlePanEnd;

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
      container.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    }
    window.addEventListener('mouseup', handleUp);

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
        container.removeEventListener('touchcancel', handleTouchEnd);
      }
      window.removeEventListener('mouseup', handleUp);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]);

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
      style={{ touchAction: 'none' }}
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
    >
      <div
        ref={transformRef}
        className="viewer-transform"
        style={{ transform: `translate(${baseOffsetRef.current.x + panXRef.current}px, ${baseOffsetRef.current.y + panYRef.current}px) scale(${zoom})` }}
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
              // "place" (default): el pin muestra la foto real recortada en
              // círculo. "perspective": pin genérico color sólido, el click
              // abre la foto grande (ver InfoPanel).
              const isPlaceThumb = isPhotoPin && (ann.poi_kind ?? 'place') !== 'perspective';
              return (
                <g key={id} role="button" tabIndex={0} aria-label={ann.tooltip ?? id}
                  className={`bp-poly bp-callout${isFocused ? ' bp-poly--focused' : ''}`}
                  onClick={(e) => handlePolygonClick(e, ann)} onKeyDown={(e) => handlePolygonKeyDown(e, ann)}
                  onMouseEnter={() => handlePolygonHover(null, ann)} onMouseLeave={() => handlePolygonHover(null, null)}>
                  {isPlaceThumb ? (
                    <>
                      <clipPath id={`bp-poi-thumb-clip-${id}`}>
                        <circle cx={point.x} cy={point.y - 25} r="13" />
                      </clipPath>
                      <circle cx={point.x} cy={point.y - 25} r="15" fill="#fffdf8" />
                      <image href={ann.image_url} x={point.x - 13} y={point.y - 38} width="26" height="26" preserveAspectRatio="xMidYMid slice" clipPath={`url(#bp-poi-thumb-clip-${id})`} />
                      <circle cx={point.x} cy={point.y - 25} r="13" fill="none" stroke="#fffdf8" strokeWidth="2" />
                      <line x1={point.x} y1={point.y - 12} x2={point.x} y2={point.y} stroke="#fffdf8" strokeWidth="1.5" />
                    </>
                  ) : isPhotoPin ? (
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

            const annId = ann.uuid || ann.id;
            const isRecommended = !isPoi && Boolean(recommendedIds?.has(annId));
            const isMuted = !isPoi && !isRecommended && Boolean(focusMode) && (recommendedIds?.size ?? 0) > 0;
            const rawStatusKey = ann.status || ann.estado;
            const polyVar = isPoi
              ? getPoiVar(ann.color)
              : getPolyVar(isRecommended ? 'recommended' : isMuted ? 'muted' : rawStatusKey);
            const statusKey = isRecommended ? 'recommended' : isMuted ? 'muted' : (rawStatusKey || 'default');
            // status_fill: relleno suave por estado (inline para ganarle al
            // fill blanco del hover en index.css; el brillo del hover sigue).
            const isStatusFill = !isPoi && badgeStyle === 'status_fill' && !isRecommended && !isMuted;
            const statusFillColor = isStatusFill ? (STATUS_FILL_COLORS[rawStatusKey] ?? STATUS_FILL_FALLBACK) : null;
            const isHovered = hoveredId === annId;
            const isSelected = selectedId === annId;
            const isFocused  = isHovered || isSelected;

            const pts = ann.blueprint_coordinates.map(([nx, ny]) => normToSvg(nx, ny));
            if (pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
            const ptsStr = pts.map((p) => `${p.x},${p.y}`).join(' ');

            // Badge (código/número corto) en el centroide del lote, igual que
            // en modo panorama (annotations.js). Sin badgeColors: vendido/
            // reservado/no disponible no muestran badge (pedido del cliente).
            // Con badgeColors: se muestra siempre, coloreado según estado.
            const label = !isPoi ? (loteLabels?.get?.(annId) ?? loteLabels?.[annId]) : null;
            const isUnavailableStatus = rawStatusKey === 'sold' || rawStatusKey === 'reserved' || rawStatusKey === 'unavailable';
            const showBadge = Boolean(label) && badgeStyle !== 'status_fill' && (badgeColors || !isUnavailableStatus);
            let badgeNode = null;
            if (showBadge) {
              const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
              const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
              const badge = getLoteBadgeSvg(label, badgeStyle, rawStatusKey, badgeColors);
              // El badge es de tamaño fijo en px de pantalla; en mobile el
              // blueprint suele quedar fiteado bastante angosto (portrait vs
              // plano panorámico), así que sin este escalado el badge se ve
              // desproporcionado frente a lotes muy chicos en pantalla.
              const badgeHeightPx = Math.max(14, Math.min(30, dw * 0.038));
              const badgeWidthPx = Math.round(badgeHeightPx * (badge.width / badge.height));
              const sizedHtml = badge.html.replace('<svg ', '<svg width="100%" height="100%" ');
              badgeNode = (
                <foreignObject
                  x={cx - badgeWidthPx / 2}
                  y={cy - badgeHeightPx / 2}
                  width={badgeWidthPx}
                  height={badgeHeightPx}
                  style={{ pointerEvents: 'none', overflow: 'visible' }}
                >
                  <div
                    xmlns="http://www.w3.org/1999/xhtml"
                    style={{ width: '100%', height: '100%' }}
                    dangerouslySetInnerHTML={{ __html: sizedHtml }}
                  />
                </foreignObject>
              );
            }

            return (
              <Fragment key={annId}>
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={ann.tooltip ?? annId}
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
                    style={statusFillColor ? { fill: statusFillColor } : undefined}
                  />
                </g>
                {badgeNode}
              </Fragment>
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

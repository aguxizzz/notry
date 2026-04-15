import { useEffect, useRef, useState, useCallback } from 'react';

export default function BlueprintEditor({
  blueprintUrl,
  annotations,
  activeTool,
  selectedId,
  onClick,
  onMarkerSelect,
  onPolygonUpdate,
  onMarkerDragEnd
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const svgRef = useRef(null);
  const [imgDims, setImgDims] = useState({ w: 1, h: 1 });
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [cursorNorm, setCursorNorm] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  // The image's display size at zoom=1, pan=0 (in the SVG's untransformed coordinate space)
  const [displayDims, setDisplayDims] = useState({ w: 1, h: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Refs for callbacks and state used in event handlers
  const onClickRef = useRef(onClick);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  const onPolygonUpdateRef = useRef(onPolygonUpdate);
  const onMarkerDragEndRef = useRef(onMarkerDragEnd);
  const activeToolRef = useRef(activeTool);
  const annotationsRef = useRef(annotations);

  const draggingCornerRef = useRef(null);
  const draggingMarkerRef = useRef(null);
  const isSnappedRef = useRef(false);

  // Keep refs for values used in event handlers
  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const displayDimsRef = useRef(displayDims);

  // Sync all callback/prop refs in one effect
  useEffect(() => {
    onClickRef.current = onClick;
    onMarkerSelectRef.current = onMarkerSelect;
    onPolygonUpdateRef.current = onPolygonUpdate;
    onMarkerDragEndRef.current = onMarkerDragEnd;
    activeToolRef.current = activeTool;
    annotationsRef.current = annotations;
  }, [onClick, onMarkerSelect, onPolygonUpdate, onMarkerDragEnd, activeTool, annotations]);

  // Sync transform state refs in one effect
  useEffect(() => {
    zoomRef.current = zoom;
    panXRef.current = panX;
    panYRef.current = panY;
    displayDimsRef.current = displayDims;
  }, [zoom, panX, panY, displayDims]);

  // Load image
  useEffect(() => {
    if (!blueprintUrl) return;
    const img = new Image();
    img.onload = () => {
      setImgDims({ w: img.width, h: img.height });
      setIsImageLoaded(true);
    };
    img.onerror = () => {
      console.error('Error loading blueprint');
      setIsImageLoaded(false);
    };
    img.src = blueprintUrl;
  }, [blueprintUrl]);

  // Calculate the image's natural display size (at zoom=1, pan=0)
  useEffect(() => {
    if (!isImageLoaded || !containerRef.current) return;

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
  }, [isImageLoaded, imgDims]);

  // Convert screen coordinates to normalized 0-1, accounting for zoom/pan
  const screenToNormalized = (screenX, screenY) => {
    const container = containerRef.current;
    if (!container) return null;

    const containerRect = container.getBoundingClientRect();
    const { w, h } = displayDimsRef.current;
    const z = zoomRef.current;
    const px = panXRef.current;
    const py = panYRef.current;

    // Invert the CSS transform: translate(panX, panY) scale(zoom) from origin (0,0)
    // Forward: viewport = svgCoord * zoom + pan
    // Inverse: svgCoord = (viewport - pan) / zoom
    const svgX = (screenX - containerRect.left - px) / z;
    const svgY = (screenY - containerRect.top - py) / z;

    return { nx: svgX / w, ny: svgY / h };
  };

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(prev => {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      return Math.max(0.5, Math.min(5, prev * delta));
    });
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

  // Event handlers
  const handlePointerDown = (e) => {
    if (e.button !== 0) return;

    // Check if snapped to first point (closes polygon)
    if (isSnappedRef.current && activeToolRef.current === 'polygon') {
      e.stopPropagation();
      isSnappedRef.current = false;
      onMarkerSelectRef.current && onMarkerSelectRef.current('temp-pt-0');
      return;
    }

    // Check for corner element (takes priority over polygon selection)
    const cornerEl = e.target.closest('[data-type="corner"]');
    if (cornerEl) {
      e.stopPropagation();
      const markerId = cornerEl.getAttribute('data-marker-id');
      const index = parseInt(cornerEl.getAttribute('data-index'), 10);
      draggingCornerRef.current = { markerId, index, lastNorm: null };
      return;
    }

    // Check for midpoint element (takes priority over polygon selection)
    const midpointEl = e.target.closest('[data-type="midpoint"]');
    if (midpointEl) {
      e.stopPropagation();
      const markerId = midpointEl.getAttribute('data-marker-id');
      const index = parseInt(midpointEl.getAttribute('data-index'), 10);
      const marker = annotationsRef.current.find(a => a.id === markerId);

      if (marker && marker.polygonPixels) {
        const norm = screenToNormalized(e.clientX, e.clientY);
        if (norm) {
          const pts = [...marker.polygonPixels];
          pts.splice(index + 1, 0, [norm.nx, norm.ny]);
          onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, pts);
          draggingCornerRef.current = { markerId, index: index + 1, lastNorm: norm };
        }
      }
      return;
    }

    // Check for polygon element
    const polygonEl = e.target.closest('[data-type="polygon"]');
    if (polygonEl && activeToolRef.current === 'select') {
      e.stopPropagation();
      const markerId = polygonEl.getAttribute('data-marker-id');
      onMarkerSelectRef.current && onMarkerSelectRef.current(markerId);
      return;
    }

    // Click on canvas for drawing
    const norm = screenToNormalized(e.clientX, e.clientY);
    if (norm && norm.nx >= 0 && norm.nx <= 1 && norm.ny >= 0 && norm.ny <= 1) {
      onClickRef.current && onClickRef.current(norm.nx, norm.ny);
    }
  };

  const handlePointerMove = (e) => {
    const norm = screenToNormalized(e.clientX, e.clientY);
    if (!norm) return;

    // Update snap state here, not during render
    const polyline = annotationsRef.current.find(
      a => a.type === 'polyline' && a.polylinePixels && a.polylinePixels.length >= 3
    );
    if (polyline) {
      const firstPt = polyline.polylinePixels[0];
      const dx = norm.nx - firstPt[0];
      const dy = norm.ny - firstPt[1];
      isSnappedRef.current = Math.sqrt(dx * dx + dy * dy) < (0.05 / zoomRef.current);
    } else {
      isSnappedRef.current = false;
    }

    setCursorNorm(norm);

    if (draggingCornerRef.current) {
      const { markerId, index } = draggingCornerRef.current;
      const marker = annotationsRef.current.find(a => a.id === markerId);

      if (marker && marker.polygonPixels) {
        const newPixels = [...marker.polygonPixels];
        newPixels[index] = [norm.nx, norm.ny];
        onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, newPixels);
        draggingCornerRef.current.lastNorm = norm;
      }
    } else if (draggingMarkerRef.current) {
      draggingMarkerRef.current.isDrag = true;
      draggingMarkerRef.current.lastNorm = norm;
    }
  };

  const handlePointerUp = () => {
    if (draggingCornerRef.current) {
      if (draggingCornerRef.current.lastNorm) {
        const { markerId } = draggingCornerRef.current;
        const marker = annotationsRef.current.find(a => a.id === markerId);
        if (marker && marker.polygonPixels) {
          onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, marker.polygonPixels);
        }
      }
      draggingCornerRef.current = null;
    } else if (draggingMarkerRef.current) {
      if (draggingMarkerRef.current.isDrag && draggingMarkerRef.current.lastNorm) {
        onMarkerDragEndRef.current && onMarkerDragEndRef.current(
          draggingMarkerRef.current.markerId,
          draggingMarkerRef.current.lastNorm.nx,
          draggingMarkerRef.current.lastNorm.ny
        );
      }
      draggingMarkerRef.current = null;
    }
  };

  // Attach window listeners for move/up (window-level handles drags that leave the container)
  useEffect(() => {
    const handleMove = (e) => {
      handlePointerMove(e);
      handlePanMove(e);
    };

    const handleUp = (e) => {
      handlePointerUp(e);
      handlePanEnd();
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('mouseup', handlePanEnd);

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('mouseup', handlePanEnd);
    };
  }, [handleWheel]);

  if (!blueprintUrl || !isImageLoaded) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: '#222',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999'
        }}
      >
        {blueprintUrl ? 'Cargando blueprint...' : 'Sin blueprint'}
      </div>
    );
  }

  // In the SVG's untransformed coordinate space, the image occupies (0,0) to (displayDims.w, displayDims.h)
  const dw = displayDims.w;
  const dh = displayDims.h;

  // Convert normalized (0-1) to SVG coordinates
  const normToSvg = (nx, ny) => ({ x: nx * dw, y: ny * dh });

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#222',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Both image and SVG are inside the same transformed container so they move together */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transformOrigin: '0 0',
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          pointerEvents: 'none'
        }}
      >
        <img
          ref={imgRef}
          src={blueprintUrl}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: dw,
            height: dh,
            display: 'block',
            pointerEvents: 'none',
            userSelect: 'none'
          }}
          alt="blueprint"
          onError={() => setIsImageLoaded(false)}
          draggable="false"
        />

        <svg
          ref={svgRef}
          onPointerDown={handlePointerDown}
          onMouseDown={handlePanStart}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: dw,
            height: dh,
            cursor: activeTool === 'polygon' ? 'crosshair' : 'default',
            userSelect: 'none',
            pointerEvents: 'auto',
            overflow: 'visible'
          }}
        >
          {annotations.map(ann => {
            // Finished polygons
            if (ann.type === 'polygon' && ann.polygonPixels && ann.polygonPixels.length >= 3) {
              const pts = ann.polygonPixels.map(([nx, ny]) => normToSvg(nx, ny));
              const polyStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
              const isSelected = ann.id === selectedId;

              const statusKey = ann.status ?? ann.estado;
              const statusStyles = {
                available: { fill: 'rgba(34,197,94,0.15)',  stroke: 'rgba(22,163,74,0.5)',  strokeWidth: '2' },
                sold:      { fill: 'rgba(239,68,68,0.25)',   stroke: 'rgba(220,38,38,0.7)',  strokeWidth: '2' },
                reserved:  { fill: 'rgba(59,130,246,0.22)',  stroke: 'rgba(37,99,235,0.65)', strokeWidth: '2' },
              };
              const style = statusKey && statusStyles[statusKey] ? statusStyles[statusKey] : (ann.svgStyle || {});

              return (
                <g key={ann.id}>
                  <polygon
                    points={polyStr}
                    fill={style.fill || 'rgba(0,100,255,0.2)'}
                    stroke={style.stroke || '#06f'}
                    strokeWidth={style.strokeWidth || 2}
                    data-type="polygon"
                    data-marker-id={ann.id}
                    style={{ cursor: 'pointer' }}
                  />
                  {isSelected && pts.map((p, i) => (
                    <circle
                      key={`${ann.id}-corner-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={Math.max(2, 6 / zoom)}
                      fill="#fff"
                      stroke="#06f"
                      strokeWidth={Math.max(1, 2 / zoom)}
                      data-type="corner"
                      data-marker-id={ann.id}
                      data-index={i}
                      style={{ cursor: 'grab' }}
                    />
                  ))}
                  {isSelected && pts.map((p, i) => {
                    const next = pts[(i + 1) % pts.length];
                    const mid = { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 };
                    return (
                      <circle
                        key={`${ann.id}-mid-${i}`}
                        cx={mid.x}
                        cy={mid.y}
                        r={Math.max(1.5, 5 / zoom)}
                        fill="#fff"
                        stroke="#0f0"
                        strokeWidth={Math.max(1, 2 / zoom)}
                        opacity={0.8}
                        data-type="midpoint"
                        data-marker-id={ann.id}
                        data-index={i}
                        style={{ cursor: 'copy' }}
                      />
                    );
                  })}
                </g>
              );
            }

            // Temporary polyline (while drawing)
            if (ann.type === 'polyline' && ann.polylinePixels && ann.polylinePixels.length >= 2) {
              // Pure snap computation for display — isSnappedRef is updated in handlePointerMove
              let snapTarget = null;
              if (ann.polylinePixels.length >= 3 && cursorNorm) {
                const firstPt = ann.polylinePixels[0];
                const dx = cursorNorm.nx - firstPt[0];
                const dy = cursorNorm.ny - firstPt[1];
                if (Math.sqrt(dx * dx + dy * dy) < (0.05 / zoom)) {
                  snapTarget = firstPt;
                }
              }

              const pts = ann.polylinePixels.map(([nx, ny]) => normToSvg(nx, ny));

              if (cursorNorm) {
                if (snapTarget) {
                  pts.push(normToSvg(snapTarget[0], snapTarget[1]));
                } else {
                  pts.push(normToSvg(cursorNorm.nx, cursorNorm.ny));
                }
              }

              if (pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
              const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ');

              return (
                <polyline
                  key={ann.id}
                  points={ptsStr}
                  fill="none"
                  stroke={ann.svgStyle?.stroke || '#ff0'}
                  strokeWidth={ann.svgStyle?.strokeWidth || 3}
                  strokeDasharray="5,5"
                  pointerEvents="none"
                />
              );
            }

            // Temporary points (while drawing)
            if (ann.type === 'point' && ann.position) {
              const { x, y } = normToSvg(ann.position.textureX, ann.position.textureY);
              const r = ann.radius || 4;
              const isFirstPoint = ann.id === 'temp-pt-0' && isSnappedRef.current;

              return (
                <g key={ann.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={ann.svgStyle?.fill || '#ff0'}
                    stroke={ann.svgStyle?.stroke || 'none'}
                    strokeWidth={ann.svgStyle?.strokeWidth || 2}
                    pointerEvents="none"
                  />
                  {isFirstPoint && (
                    <circle
                      cx={x}
                      cy={y}
                      r={r + 8}
                      fill="none"
                      stroke="#ff0"
                      strokeWidth={2}
                      opacity={0.6}
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            }

            return null;
          })}
        </svg>
      </div>
    </div>
  );
}

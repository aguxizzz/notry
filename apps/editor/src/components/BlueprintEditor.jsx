import { useEffect, useRef, useState, useCallback } from 'react';
import { HIGHLIGHT_SVG_STYLE, getLotSvgStyle } from '../utils/lotStyles';
import { FIRST_TEMP_POINT_ID } from '../utils/markerIds';
import { fetchImage } from '../utils/fetchImage';
import { useLatest } from '../hooks/useLatest';

export default function BlueprintEditor({
  blueprintUrl,
  annotations,
  activeTool,
  selectedId,
  highlightedId,
  rectStart,
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
  const [blueprintSrc, setBlueprintSrc] = useState(null); // blob URL del plano ya descargado
  const [loadError, setLoadError] = useState(null);
  const [cursorNorm, setCursorNorm] = useState(null);
  const [isSnapped, setIsSnapped] = useState(false);
  const [draggingMarkerPreview, setDraggingMarkerPreview] = useState(null);
  // Alignment guides shown while dragging a calib point: [{ axis: 'v'|'h', pos }]
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  // The image's display size at zoom=1, pan=0 (in the SVG's untransformed coordinate space)
  const [displayDims, setDisplayDims] = useState({ w: 1, h: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Últimos valores de props/estado para los handlers de window (que se
  // registran una vez y no ven los re-renders).
  const onClickRef = useLatest(onClick);
  const onMarkerSelectRef = useLatest(onMarkerSelect);
  const onPolygonUpdateRef = useLatest(onPolygonUpdate);
  const onMarkerDragEndRef = useLatest(onMarkerDragEnd);
  const activeToolRef = useLatest(activeTool);
  const annotationsRef = useLatest(annotations);
  const zoomRef = useLatest(zoom);
  const panXRef = useLatest(panX);
  const panYRef = useLatest(panY);
  const displayDimsRef = useLatest(displayDims);

  const draggingCornerRef = useRef(null);
  const draggingMarkerRef = useRef(null);
  const draggingPolygonRef = useRef(null);
  const isSnappedRef = useRef(false);

  // Load image — vía fetchImage + blob URL (igual que el panorama en App.jsx):
  // con un <img crossOrigin> directo, si el navegador tiene el plano cacheado
  // de una carga sin CORS (ej. la miniatura en la plataforma), la respuesta
  // cacheada no trae headers CORS y la imagen falla sin decir por qué.
  useEffect(() => {
    if (!blueprintUrl) return;
    let cancelled = false;
    let objectUrl = null;
    setIsImageLoaded(false);
    setLoadError(null);
    (async () => {
      try {
        const res = await fetchImage(blueprintUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          setImgDims({ w: img.width, h: img.height });
          setBlueprintSrc(objectUrl);
          setIsImageLoaded(true);
        };
        img.onerror = () => {
          if (cancelled) return;
          console.error('Error loading blueprint: la imagen no se pudo decodificar', blueprintUrl);
          setLoadError('El archivo del plano no es una imagen válida.');
        };
        img.src = objectUrl;
      } catch (err) {
        if (cancelled) return;
        console.error(`Error loading blueprint (${err.message})`, blueprintUrl);
        setLoadError(`No se pudo descargar el plano (${err.message}).`);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blueprintUrl]);

  // Calculate the image's natural display size (at zoom=1, pan=0)
  useEffect(() => {
    if (!isImageLoaded || !containerRef.current) return;

    const container = containerRef.current;
    const updateDisplayDims = () => {
      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      if (!containerW || !containerH) return;

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
    };

    updateDisplayDims();
    const observer = new ResizeObserver(updateDisplayDims);
    observer.observe(container);
    return () => observer.disconnect();
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
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const cursorX = e.clientX - containerRect.left;
    const cursorY = e.clientY - containerRect.top;

    const prevZoom = zoomRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(5, prevZoom * delta));
    if (newZoom === prevZoom) return;

    // Keep the point under the cursor fixed on screen: recompute pan so that
    // svgPoint * newZoom + newPan === cursorPos, using svgPoint derived from
    // the current transform (svgPoint = (cursorPos - pan) / zoom).
    const svgX = (cursorX - panXRef.current) / prevZoom;
    const svgY = (cursorY - panYRef.current) / prevZoom;

    setZoom(newZoom);
    setPanX(cursorX - svgX * newZoom);
    setPanY(cursorY - svgY * newZoom);
  }, [zoomRef, panXRef, panYRef]);

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
      onMarkerSelectRef.current && onMarkerSelectRef.current(FIRST_TEMP_POINT_ID);
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

    // Check for calibration point (draggable with Select tool or while calibrating)
    const calibEl = e.target.closest('[data-type="calibration"]');
    if (calibEl && (activeToolRef.current === 'select' || activeToolRef.current === 'calibrate')) {
      e.stopPropagation();
      const markerId = calibEl.getAttribute('data-marker-id');
      draggingMarkerRef.current = { markerId, isDrag: false, lastNorm: null };
      return;
    }

    // Check for polygon element
    const polygonEl = e.target.closest('[data-type="polygon"]');
    if (polygonEl && activeToolRef.current === 'select') {
      e.stopPropagation();
      const markerId = polygonEl.getAttribute('data-marker-id');
      onMarkerSelectRef.current && onMarkerSelectRef.current(markerId);

      const marker = annotationsRef.current.find(a => a.id === markerId);
      if (marker && marker.polygonPixels) {
        const norm = screenToNormalized(e.clientX, e.clientY);
        if (norm) {
          draggingPolygonRef.current = {
            markerId,
            startNorm: norm,
            originalPixels: marker.polygonPixels.map(pt => [...pt]),
            lastPixels: null,
            isDrag: false,
          };
        }
      }
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
      const nextIsSnapped = Math.sqrt(dx * dx + dy * dy) < (0.05 / zoomRef.current);
      isSnappedRef.current = nextIsSnapped;
      setIsSnapped(nextIsSnapped);
    } else {
      isSnappedRef.current = false;
      setIsSnapped(false);
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
    } else if (draggingPolygonRef.current) {
      draggingPolygonRef.current.isDrag = true;
      const { startNorm, originalPixels, markerId } = draggingPolygonRef.current;
      const dx = norm.nx - startNorm.nx;
      const dy = norm.ny - startNorm.ny;
      const newPixels = originalPixels.map(([px, py]) => [px + dx, py + dy]);
      onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, newPixels);
      draggingPolygonRef.current.lastPixels = newPixels;
    } else if (draggingMarkerRef.current) {
      draggingMarkerRef.current.isDrag = true;

      // Alignment snap: magnet the dragged calib point to another point's X/Y axis
      const markerId = draggingMarkerRef.current.markerId;
      const others = annotationsRef.current.filter(
        a => a.type === 'calibration-point' && a.id !== markerId && a.position
      );
      const { w, h } = displayDimsRef.current;
      const z = zoomRef.current;
      const thX = 8 / (w * z);
      const thY = 8 / (h * z);

      let snapX = null, snapY = null, bestDX = thX, bestDY = thY;
      for (const o of others) {
        const dx = Math.abs(norm.nx - o.position.textureX);
        if (dx < bestDX) { bestDX = dx; snapX = o.position.textureX; }
        const dy = Math.abs(norm.ny - o.position.textureY);
        if (dy < bestDY) { bestDY = dy; snapY = o.position.textureY; }
      }

      const snapped = {
        nx: snapX !== null ? snapX : norm.nx,
        ny: snapY !== null ? snapY : norm.ny,
      };
      draggingMarkerRef.current.lastNorm = snapped;
      setDraggingMarkerPreview({ markerId, norm: snapped });

      const guides = [];
      if (snapX !== null) guides.push({ axis: 'v', pos: snapX });
      if (snapY !== null) guides.push({ axis: 'h', pos: snapY });
      setAlignmentGuides(guides);
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
    } else if (draggingPolygonRef.current) {
      if (draggingPolygonRef.current.isDrag && draggingPolygonRef.current.lastPixels) {
        const { markerId, lastPixels } = draggingPolygonRef.current;
        onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, lastPixels);
      }
      draggingPolygonRef.current = null;
    } else if (draggingMarkerRef.current) {
      if (draggingMarkerRef.current.isDrag && draggingMarkerRef.current.lastNorm) {
        onMarkerDragEndRef.current && onMarkerDragEndRef.current(
          draggingMarkerRef.current.markerId,
          draggingMarkerRef.current.lastNorm.nx,
          draggingMarkerRef.current.lastNorm.ny
        );
      }
      draggingMarkerRef.current = null;
      setDraggingMarkerPreview(null);
      setAlignmentGuides([]);
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
  }, [handleWheel]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {!blueprintUrl ? 'Sin plano' : loadError ?? 'Cargando plano…'}
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
      onPointerDown={handlePointerDown}
      onMouseDown={handlePanStart}
      style={{
        width: '100%',
        height: '100%',
        background: '#222',
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none',
        cursor: activeTool === 'polygon' || activeTool === 'poi' || activeTool === 'calibrate' || activeTool === 'rect' || activeTool === 'autodetect' ? 'crosshair' : 'default'
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
          src={blueprintSrc}
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
          alt="Plano del loteo"
          onError={() => setIsImageLoaded(false)}
          draggable="false"
        />

        <svg
          ref={svgRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: dw,
            height: dh,
            userSelect: 'none',
            pointerEvents: 'auto',
            overflow: 'visible'
          }}
        >
          {annotations.map(ann => {
            // Finished polygons (lots)
            if (ann.type === 'polygon' && ann.polygonPixels && ann.polygonPixels.length >= 3) {
              const pts = ann.polygonPixels.map(([nx, ny]) => normToSvg(nx, ny));
              const polyStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
              const isSelected = ann.id === selectedId;

              const style = ann.id === highlightedId ? HIGHLIGHT_SVG_STYLE : getLotSvgStyle(ann);

              return (
                <g key={ann.id}>
                  <polygon
                    points={polyStr}
                    fill={style.fill || 'rgba(0,100,255,0.2)'}
                    stroke={style.stroke || '#06f'}
                    strokeWidth={style.strokeWidth || 2}
                    data-type="polygon"
                    data-marker-id={ann.id}
                    style={{ cursor: activeTool === 'polygon' ? 'crosshair' : (isSelected ? 'move' : 'pointer') }}
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

            // POIs de área (los callout no se muestran en el plano, ver toModeAnnotations)
            if (ann.type === 'poi' && ann.polygonPixels && ann.polygonPixels.length >= 3) {
              const pts = ann.polygonPixels.map(([nx, ny]) => normToSvg(nx, ny));
              const polyStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
              const isSelected = ann.id === selectedId;
              const poiColor = ann.color ?? '#14b8a6';
              const style = ann.id === highlightedId ? HIGHLIGHT_SVG_STYLE : {
                fill: `${poiColor}33`,
                stroke: poiColor,
                strokeWidth: '2',
              };

              return (
                <g key={ann.id}>
                  <polygon
                    points={polyStr}
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    data-type="polygon"
                    data-marker-id={ann.id}
                    style={{ cursor: isSelected ? 'move' : 'pointer' }}
                  />
                  {isSelected && pts.map((p, i) => (
                    <circle
                      key={`${ann.id}-corner-${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={Math.max(2, 6 / zoom)}
                      fill="#fff"
                      stroke={poiColor}
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
                        stroke={poiColor}
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
                  stroke={ann.svgStyle?.stroke || '#ffa500'}
                  strokeWidth={Math.max(1, 2 / zoom)}
                  strokeDasharray={`${5 / zoom},${5 / zoom}`}
                  pointerEvents="none"
                />
              );
            }

            // Temporary points (while drawing)
            if (ann.type === 'point' && ann.position) {
              const { x, y } = normToSvg(ann.position.textureX, ann.position.textureY);
              const r = ann.radius || 4;
              const isFirstPoint = ann.id === FIRST_TEMP_POINT_ID && isSnapped;

              return (
                <g key={ann.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={ann.svgStyle?.fill || '#ffa500'}
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
                      stroke="#ffa500"
                      strokeWidth={2}
                      opacity={0.6}
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            }

            // Calibration connection line (closed, dashed, non-interactive)
            if (ann.type === 'calibration-link' && ann.polylinePixels && ann.polylinePixels.length >= 2) {
              const pts = ann.polylinePixels.map(([nx, ny]) => normToSvg(nx, ny));
              if (pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
              const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
              return (
                <polyline
                  key={ann.id}
                  points={ptsStr}
                  fill="none"
                  stroke="rgba(245,158,11,0.55)"
                  strokeWidth={Math.max(1, 2 / zoom)}
                  strokeDasharray={`${6 / zoom},${4 / zoom}`}
                  pointerEvents="none"
                />
              );
            }

            // Calibration point markers (numbered, draggable with Select or Calibrate tool)
            if (ann.type === 'calibration-point' && ann.position) {
              // Follow the cursor live while this point is being dragged
              const posNorm = draggingMarkerPreview?.markerId === ann.id
                ? [draggingMarkerPreview.norm.nx, draggingMarkerPreview.norm.ny]
                : [ann.position.textureX, ann.position.textureY];
              const { x, y } = normToSvg(posNorm[0], posNorm[1]);
              const color = ann.svgStyle?.fill ?? '#3b82f6';
              const opacity = ann.svgStyle?.opacity ?? 1;
              const r = Math.max(3, 7 / zoom);
              const fontSize = Math.max(6, 9 / zoom);
              const interactive = activeTool === 'select' || activeTool === 'calibrate';
              return (
                <g
                  key={ann.id}
                  opacity={opacity}
                  data-type="calibration"
                  data-marker-id={ann.id}
                  pointerEvents={interactive ? 'auto' : 'none'}
                  style={interactive ? { cursor: 'grab' } : undefined}
                >
                  <circle cx={x} cy={y} r={r} fill={color} stroke="#fff" strokeWidth={Math.max(1, 2 / zoom)} />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                    fill="#fff" fontSize={fontSize} fontWeight="700" pointerEvents="none">
                    {ann.label}
                  </text>
                </g>
              );
            }

            return null;
          })}

          {/* Rectangle-drawing preview: first corner + rubber-band to the cursor */}
          {activeTool === 'rect' && rectStart && (() => {
            const p1 = normToSvg(rectStart[0], rectStart[1]);
            return (
              <>
                {cursorNorm && (() => {
                  const p2 = normToSvg(cursorNorm.nx, cursorNorm.ny);
                  const x = Math.min(p1.x, p2.x);
                  const y = Math.min(p1.y, p2.y);
                  const w = Math.abs(p2.x - p1.x);
                  const h = Math.abs(p2.y - p1.y);
                  return (
                    <rect
                      x={x} y={y} width={w} height={h}
                      fill="rgba(255,165,0,0.15)"
                      stroke="#ffa500"
                      strokeWidth={Math.max(1, 2 / zoom)}
                      strokeDasharray={`${5 / zoom},${5 / zoom}`}
                      pointerEvents="none"
                    />
                  );
                })()}
                <circle cx={p1.x} cy={p1.y} r={Math.max(2, 4 / zoom)} fill="#ffa500" pointerEvents="none" />
              </>
            );
          })()}

          {/* Alignment guides while dragging a calib point */}
          {alignmentGuides.map((g, i) => (
            g.axis === 'v' ? (
              <line
                key={`guide-${i}`}
                x1={g.pos * dw} y1={0} x2={g.pos * dw} y2={dh}
                stroke="#22d3ee" strokeWidth={Math.max(0.75, 1 / zoom)}
                strokeDasharray={`${4 / zoom},${4 / zoom}`} pointerEvents="none"
              />
            ) : (
              <line
                key={`guide-${i}`}
                x1={0} y1={g.pos * dh} x2={dw} y2={g.pos * dh}
                stroke="#22d3ee" strokeWidth={Math.max(0.75, 1 / zoom)}
                strokeDasharray={`${4 / zoom},${4 / zoom}`} pointerEvents="none"
              />
            )
          ))}
        </svg>
      </div>
    </div>
  );
}

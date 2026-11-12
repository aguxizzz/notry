import { useEffect, useRef, useState, useCallback } from 'react';
import { HIGHLIGHT_SVG_STYLE, getLotSvgStyle } from '../utils/lotStyles';
import { FIRST_TEMP_POINT_ID } from '../utils/markerIds';
import { fetchImage } from '../utils/fetchImage';
import { useLatest } from '../hooks/useLatest';
import {
  faceAround, insertVertex, lotDirections, projectOntoSegment, removeVertex, slideFace, snapOnSegment, snapPoint,
} from '../utils/polygonEdit';


// Screen pixels a corner must travel before a press counts as a drag, so
// clicking a corner to select it doesn't nudge it off its line.
const DRAG_THRESHOLD_PX = 3;

// Screen pixels a point can stray from a straight line and still count as
// part of the same face when right-clicking a side (see faceAround).
const FACE_TOLERANCE_PX = 3;

// Screen pixels within which a corner snaps into line with another corner of
// its lot. Holding Ctrl turns the snap off.
const SNAP_PX = 8;

/** Resize cursor closest to the face's normal, so it shows which way the face moves. */
function cursorForNormal(nx, ny) {
  const deg = ((Math.atan2(ny, nx) * 180) / Math.PI + 180) % 180; // 0..180, direction only
  if (deg < 22.5 || deg >= 157.5) return 'ew-resize';
  if (deg < 67.5) return 'nwse-resize';
  if (deg < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

export default function BlueprintEditor({
  blueprintUrl,
  annotations,
  activeTool,
  selectedId,
  highlightedId,
  rectStart,
  detectOverlay, // ImageBitmap from lotDetectionClient: what auto-detect sees, drawn over the plano
  onClick,
  onMarkerSelect,
  onPolygonUpdate, // live shape change during a drag; App commits it to history on pointerup
  onPolygonCommit, // one-shot shape change (vertex delete), committed right away
  onMarkerDragEnd
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const svgRef = useRef(null);
  const overlayCanvasRef = useRef(null);
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
  // Corner picked for deletion: { markerId, index }. Only counts while that lot
  // is still the selected one, so deselecting the lot drops it without an effect.
  const [selectedVertex, setSelectedVertex] = useState(null);
  // Ghost point that follows the cursor along a hovered edge: { markerId, point: [nx, ny] }
  const [edgeHover, setEdgeHover] = useState(null);
  // Face picked with right-click for stretching: { markerId, start, end } (corner
  // indices, see faceAround). Only counts while that lot is still the selected one.
  const [selectedFace, setSelectedFace] = useState(null);
  // Alignment lines the corner snapped to, in display px: [{ q: [x, y], d: { x, y } }]
  const [vertexGuides, setVertexGuides] = useState([]);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Últimos valores de props/estado para los handlers de window (que se
  // registran una vez y no ven los re-renders).
  const onClickRef = useLatest(onClick);
  const onMarkerSelectRef = useLatest(onMarkerSelect);
  const onPolygonUpdateRef = useLatest(onPolygonUpdate);
  const onMarkerDragEndRef = useLatest(onMarkerDragEnd);
  const onPolygonCommitRef = useLatest(onPolygonCommit);
  const selectedIdRef = useLatest(selectedId);
  const selectedVertexRef = useLatest(selectedVertex);
  const selectedFaceRef = useLatest(selectedFace);
  const activeToolRef = useLatest(activeTool);
  const annotationsRef = useLatest(annotations);
  const zoomRef = useLatest(zoom);
  const panXRef = useLatest(panX);
  const panYRef = useLatest(panY);
  const displayDimsRef = useLatest(displayDims);

  const draggingCornerRef = useRef(null);
  const draggingMarkerRef = useRef(null);
  const draggingPolygonRef = useRef(null);
  // Face stretch: { markerId, start, end, startNorm, originalPixels }
  const draggingEdgeRef = useRef(null);
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

    // Invert the pan offset plus the zoomed size (dw * zoom) of the drawing box
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

  /**
   * Cursor projected onto edge `edgeIndex` of a lot, snapped into line with
   * the lot's other corners unless `noSnap`. Returns { point: [nx, ny], guides }.
   * Done in display pixels: in normalized space the plano's aspect ratio
   * would skew the perpendicular.
   */
  const projectOnEdge = (pixels, edgeIndex, clientX, clientY, noSnap) => {
    const norm = screenToNormalized(clientX, clientY);
    if (!norm) return null;
    const { w, h } = displayDimsRef.current;
    const px = pixels.map(([x, y]) => [x * w, y * h]);
    const ia = edgeIndex;
    const ib = (edgeIndex + 1) % px.length;
    const p = projectOntoSegment(
      { x: norm.nx * w, y: norm.ny * h },
      { x: px[ia][0], y: px[ia][1] },
      { x: px[ib][0], y: px[ib][1] },
    );
    let point = [p.x, p.y];
    let guides = [];
    if (!noSnap) {
      // The edge's own ends are left out: snapping to them would just land on the corner.
      const anchors = px.filter((_, i) => i !== ia && i !== ib);
      ({ point, guides } = snapOnSegment(point, px[ia], px[ib], anchors, lotDirections(px), SNAP_PX / zoomRef.current));
    }
    return { point: [point[0] / w, point[1] / h], guides };
  };

  /** Removes a corner (if the lot keeps at least 3) and clears the vertex selection. */
  const deleteVertex = (markerId, index) => {
    const marker = annotationsRef.current.find(a => a.id === markerId);
    const next = marker?.polygonPixels && removeVertex(marker.polygonPixels, index);
    if (!next) return false;
    onPolygonCommitRef.current && onPolygonCommitRef.current(markerId, next);
    setSelectedVertex(null);
    setSelectedFace(null); // its corner indices no longer line up
    return true;
  };

  // Delete/Backspace on a selected corner removes it; Escape just unselects it.
  // Capture phase on window so it runs before App's document listener, which
  // would otherwise delete the whole lot.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && selectedFaceRef.current) {
        e.stopPropagation();
        setSelectedFace(null);
        return;
      }
      const v = selectedVertexRef.current;
      if (!v || v.markerId !== selectedIdRef.current) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        // At 3 corners there's nothing to delete; still swallow the key so the lot survives.
        deleteVertex(v.markerId, v.index);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setSelectedVertex(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Right-click is the secondary action on what's under the cursor (instead of
  // the browser's menu): on a corner it deletes it, on a side it picks that
  // straight face for stretching.
  const handleContextMenu = (e) => {
    const cornerEl = e.target.closest('[data-type="corner"]');
    if (cornerEl) {
      e.preventDefault();
      deleteVertex(cornerEl.getAttribute('data-marker-id'), parseInt(cornerEl.getAttribute('data-index'), 10));
      return;
    }
    // Right-click on the picked face again drops it
    if (e.target.closest('[data-type="face"]')) {
      e.preventDefault();
      setSelectedFace(null);
      return;
    }
    const edgeEl = e.target.closest('[data-type="edge"]');
    if (edgeEl) {
      e.preventDefault();
      const markerId = edgeEl.getAttribute('data-marker-id');
      const marker = annotationsRef.current.find(a => a.id === markerId);
      if (!marker?.polygonPixels) return;
      // In display px so the straightness tolerance is the same on screen at any zoom
      const { w, h } = displayDimsRef.current;
      const px = marker.polygonPixels.map(([x, y]) => [x * w, y * h]);
      const face = faceAround(px, parseInt(edgeEl.getAttribute('data-index'), 10), FACE_TOLERANCE_PX / zoomRef.current);
      setSelectedFace({ markerId, ...face });
      setSelectedVertex(null);
      setEdgeHover(null);
    }
  };

  // Event handlers
  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    // Pressing anywhere but the selected face itself drops it
    const faceEl = e.target.closest('[data-type="face"]');
    if (!faceEl) setSelectedFace(null);

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
      // Alt+click: quick delete without selecting first
      if (e.altKey) {
        deleteVertex(markerId, index);
        return;
      }
      setSelectedVertex({ markerId, index });
      // moved=false until it passes DRAG_THRESHOLD_PX (see handlePointerMove)
      draggingCornerRef.current = {
        markerId, index, lastNorm: null, moved: false, startX: e.clientX, startY: e.clientY,
      };
      return;
    }

    // Selected face (right-click on a side): pressing on it stretches it,
    // parallel to itself, instead of adding a corner there
    if (faceEl) {
      e.stopPropagation();
      const face = selectedFaceRef.current;
      const marker = annotationsRef.current.find(a => a.id === face?.markerId);
      const norm = screenToNormalized(e.clientX, e.clientY);
      if (marker?.polygonPixels && norm) {
        draggingEdgeRef.current = {
          markerId: face.markerId, start: face.start, end: face.end,
          startNorm: norm, originalPixels: marker.polygonPixels,
        };
        setSelectedVertex(null);
      }
      return;
    }

    // Press anywhere on an edge: add a corner right there (where the ghost point
    // was) and keep dragging it. Takes priority over polygon selection.
    const edgeEl = e.target.closest('[data-type="edge"]');
    if (edgeEl) {
      e.stopPropagation();
      const markerId = edgeEl.getAttribute('data-marker-id');
      const index = parseInt(edgeEl.getAttribute('data-index'), 10);
      const marker = annotationsRef.current.find(a => a.id === markerId);
      const pt = marker?.polygonPixels && projectOnEdge(marker.polygonPixels, index, e.clientX, e.clientY, e.ctrlKey)?.point;
      if (pt) {
        onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, insertVertex(marker.polygonPixels, index, pt));
        // Already under the cursor, so it moves from the first pixel (moved=true)
        draggingCornerRef.current = { markerId, index: index + 1, lastNorm: { nx: pt[0], ny: pt[1] }, moved: true };
        setSelectedVertex({ markerId, index: index + 1 });
        setEdgeHover(null);
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
      setSelectedVertex(null);
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
    setSelectedVertex(null);
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

    // Ghost point on the hovered edge of the selected lot (not while dragging anything)
    const isDragging = draggingCornerRef.current || draggingEdgeRef.current
      || draggingPolygonRef.current || draggingMarkerRef.current;
    const edgeEl = !isDragging && e.target?.closest?.('[data-type="edge"]');
    if (edgeEl) {
      const markerId = edgeEl.getAttribute('data-marker-id');
      const index = parseInt(edgeEl.getAttribute('data-index'), 10);
      const marker = annotationsRef.current.find(a => a.id === markerId);
      const hit = marker?.polygonPixels && projectOnEdge(marker.polygonPixels, index, e.clientX, e.clientY, e.ctrlKey);
      setEdgeHover(hit ? { markerId, point: hit.point } : null);
      setVertexGuides(hit ? hit.guides : []);
    } else {
      setEdgeHover(null);
      // While dragging a corner its own snap owns the guides (set below).
      if (!draggingCornerRef.current) setVertexGuides([]);
    }

    if (draggingCornerRef.current) {
      const drag = draggingCornerRef.current;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
      }
      const { markerId, index } = drag;
      const marker = annotationsRef.current.find(a => a.id === markerId);

      if (marker && marker.polygonPixels) {
        // Snap in display px against the lot's other corners, along the lot's
        // directions minus the two edges this corner drags along with it.
        const { w, h } = displayDimsRef.current;
        const px = marker.polygonPixels.map(([x, y]) => [x * w, y * h]);
        const n = px.length;
        let point = [norm.nx * w, norm.ny * h];
        let guides = [];
        if (!e.ctrlKey) {
          const dirs = lotDirections(px, [(index - 1 + n) % n, index]);
          ({ point, guides } = snapPoint(point, px.filter((_, i) => i !== index), dirs, SNAP_PX / zoomRef.current));
        }
        const snapped = { nx: point[0] / w, ny: point[1] / h };
        const newPixels = [...marker.polygonPixels];
        newPixels[index] = [snapped.nx, snapped.ny];
        onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, newPixels);
        draggingCornerRef.current.lastNorm = snapped;
        setVertexGuides(guides);
      }
    } else if (draggingEdgeRef.current) {
      // Slide in display pixels (same reason as projectOnEdge), from the shape at
      // press time so rounding doesn't pile up over a long drag.
      const { markerId, start, end, startNorm, originalPixels } = draggingEdgeRef.current;
      const { w, h } = displayDimsRef.current;
      const moved = slideFace(
        originalPixels.map(([x, y]) => [x * w, y * h]),
        start, end,
        { x: (norm.nx - startNorm.nx) * w, y: (norm.ny - startNorm.ny) * h },
      );
      onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, moved.map(([x, y]) => [x / w, y / h]));
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
      setVertexGuides([]);
    } else if (draggingEdgeRef.current) {
      // Nothing to flush: App commits the drag to history on its own pointerup.
      draggingEdgeRef.current = null;
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

  // Paint the detection overlay at its own resolution; CSS stretches it to the plano's size.
  // Depends on isImageLoaded too: the canvas only exists once the plano is shown.
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !detectOverlay) return;
    canvas.width = detectOverlay.width;
    canvas.height = detectOverlay.height;
    // ImageBitmap from the worker: drawImage is a GPU copy, unlike putImageData of raw pixels.
    canvas.getContext('2d').drawImage(detectOverlay, 0, 0);
  }, [detectOverlay, isImageLoaded]);

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

  /**
   * Edit handles of the selected lot/POI: an invisible wide hit line per edge
   * (press = new corner there), a ghost dot where that corner would go, the
   * face picked with right-click (press = stretch it), and the corners on top. Sizes are N / zoom so they stay the same few pixels on screen at any zoom.
   */
  const renderVertexHandles = (markerId, pts, color) => {
    const activeVertex = selectedVertex?.markerId === markerId ? selectedVertex.index : null;
    const ghost = edgeHover?.markerId === markerId ? normToSvg(edgeHover.point[0], edgeHover.point[1]) : null;
    // Ignore a face whose indices went stale (e.g. an undo changed the corner count)
    const face = selectedFace?.markerId === markerId && selectedFace.start < pts.length && selectedFace.end < pts.length
      ? selectedFace : null;
    return (
      <>
        {pts.map((p, i) => {
          const next = pts[(i + 1) % pts.length];
          return (
            <line
              key={`${markerId}-edge-${i}`}
              x1={p.x} y1={p.y} x2={next.x} y2={next.y}
              stroke="transparent"
              // ~12px of slack on each side: at 10 you had to land right on the line
              strokeWidth={24 / zoom}
              pointerEvents="stroke"
              data-type="edge"
              data-marker-id={markerId}
              data-index={i}
              style={{ cursor: 'copy' }}
            />
          );
        })}
        {ghost && (
          <circle cx={ghost.x} cy={ghost.y} r={3.5 / zoom} fill="#fff" stroke={color}
            strokeWidth={1.5 / zoom} opacity={0.8} pointerEvents="none" />
        )}
        {face && (() => {
          // Face corners in order start→end, wrapping around the ring
          const facePts = [];
          for (let k = face.start; ; k = (k + 1) % pts.length) {
            facePts.push(pts[k]);
            if (k === face.end) break;
          }
          const ptsStr = facePts.map(q => `${q.x},${q.y}`).join(' ');
          const a = facePts[0];
          const b = facePts[facePts.length - 1];
          return (
            <g>
              {/* White under-stroke so the picked face reads over the lot's own border */}
              <polyline points={ptsStr} fill="none" stroke="#fff" strokeWidth={7 / zoom}
                strokeLinecap="round" pointerEvents="none" />
              <polyline points={ptsStr} fill="none" stroke={color} strokeWidth={4 / zoom}
                strokeLinecap="round" pointerEvents="none" />
              {/* Wide invisible hit area on top of the edge ones, so pressing here stretches */}
              <polyline
                points={ptsStr} fill="none" stroke="transparent" strokeWidth={24 / zoom}
                pointerEvents="stroke" data-type="face"
                style={{ cursor: cursorForNormal(-(b.y - a.y), b.x - a.x) }}
              />
            </g>
          );
        })()}
        {pts.map((p, i) => (
          <circle
            key={`${markerId}-corner-${i}`}
            cx={p.x}
            cy={p.y}
            // Selected corner is filled and a bit bigger: that's the one Supr deletes
            r={(i === activeVertex ? 6 : 5) / zoom}
            fill={i === activeVertex ? color : '#fff'}
            stroke={i === activeVertex ? '#fff' : color}
            strokeWidth={1.5 / zoom}
            data-type="corner"
            data-marker-id={markerId}
            data-index={i}
            style={{ cursor: 'grab' }}
          />
        ))}
      </>
    );
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
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
      {/* Both image and SVG are inside the same container so they move together.
          Zoom is applied as the container's real size, not as scale(): with scale()
          Chrome stretches an old bitmap after fast wheel zooms and the thin lot
          strokes stay blurry until the next slow zoom. Same math as before:
          screen = svgCoord * zoom + pan. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: dw * zoom,
          height: dh * zoom,
          transform: `translate(${panX}px, ${panY}px)`,
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
            width: '100%',
            height: '100%',
            display: 'block',
            pointerEvents: 'none',
            userSelect: 'none',
            // Dimmed under the detection overlay so gold/red stand out from the plano's own ink.
            opacity: detectOverlay ? 0.3 : 1
          }}
          alt="Plano del loteo"
          onError={() => setIsImageLoaded(false)}
          draggable="false"
        />

        {detectOverlay && (
          <canvas
            ref={overlayCanvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              // Keep detected pixels crisp when zooming in instead of blurring them.
              imageRendering: 'pixelated'
            }}
          />
        )}

        {/* viewBox keeps drawing coordinates in zoom=1 units (dw x dh) while the
            SVG fills the zoomed box, so every "N / zoom" size below still works. */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${dw} ${dh}`}
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
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
                  {isSelected && renderVertexHandles(ann.id, pts, '#06f')}
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
                  {isSelected && renderVertexHandles(ann.id, pts, poiColor)}
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

          {/* Alignment lines a lot corner snapped to (long enough to cross the whole plano) */}
          {vertexGuides.map((g, i) => {
            const L = (dw + dh) * 2;
            return (
              <line
                key={`vguide-${i}`}
                x1={g.q[0] - g.d.x * L} y1={g.q[1] - g.d.y * L}
                x2={g.q[0] + g.d.x * L} y2={g.q[1] + g.d.y * L}
                stroke="#22d3ee" strokeWidth={1 / zoom}
                strokeDasharray={`${4 / zoom},${4 / zoom}`} pointerEvents="none"
              />
            );
          })}

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

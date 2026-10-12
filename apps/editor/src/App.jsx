import { useState, useRef, useEffect, useMemo } from 'react';
import { API_BASE, fetchWithTimeout, authHeaders } from './api/config';
import { createUploadFn } from './api/upload';
import { useAuth } from './hooks/useAuth';
import { useDraft } from './hooks/useDraft';
import { useHistory } from './hooks/useHistory';
import { useLotOperations } from './hooks/useLotOperations';
import { usePoiOperations } from './hooks/usePoiOperations';
import { useSaveAll } from './hooks/useSaveAll';
import { useDisplayAnnotations } from './hooks/useDisplayAnnotations';
import { computeProjector, isProjectorValid } from './utils/panoramaProjection';
import { computeHomography, applyHomography, isHomographyValid } from './utils/homography';
import { projectPolygon, projectLotAnnotations, unimportLotAnnotations } from './utils/projection';
import { isCalibrationPairTooClose } from './utils/calibration';
import { detectLotPolygon } from './utils/lotDetection';
import { buildStreetRibbon, buildProjectedStreetRibbon, findAxisEndpointSnap, mergeStreetAxis } from './utils/streetPath';
import { useUIFeedback } from './hooks/useUIFeedback';
import { Check, Image as ImageIcon, X } from 'lucide-react';
import EditorViewer from './components/EditorViewer';
import BlueprintEditor from './components/BlueprintEditor';
import LoginScreen from './components/LoginScreen';
import LoteoList from './components/LoteoList';
import DraftBanner from './components/DraftBanner';
import SessionExpiredBanner from './components/SessionExpiredBanner';
import Toolbar from './components/Toolbar';
import InspectorPanel from './components/InspectorPanel';
import DocumentBar from './components/DocumentBar';
import ProjectPanel from './components/ProjectPanel';
import CalibrationOverlay from './components/CalibrationOverlay';
import GeoCalibrationOverlay from './components/GeoCalibrationOverlay';
import AutoDetectInspector from './components/AutoDetectInspector';
import { fetchImage } from './utils/fetchImage';
import './App.css';

function App() {
  const { confirm, notify } = useUIFeedback();
  const [activeTool, setActiveTool] = useState('select');
  const [annotations, setAnnotations] = useState([]);
  // Calibration: correspondence points between blueprint and panorama spaces
  // Each entry: { blueprint: [nx, ny], panorama: [textureX, textureY] }
  // Declared before useHistory so undo/redo can snapshot calibration too.
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const [calibrationNotice, setCalibrationNotice] = useState('');
  // Blueprint points clicked in the current calibration batch, queued up
  // waiting to be matched (in order) against panorama clicks. Batch size is
  // 4 minus however many pairs already exist (so the first pass collects up
  // to 4 points before switching views), or 1 for later ad-hoc additions.
  const [pendingBlueprintPoints, setPendingBlueprintPoints] = useState([]);
  // Geo calibration (blueprint↔lat/lng, module 5): a separate, simpler pair
  // list. One point at a time — click blueprint, then click the map, pair
  // is added. Not wired into useHistory's undo/redo (would require touching
  // the shared composite-snapshot shape used by the blueprint↔panorama flow
  // above); undo/redo for these points is intentionally not supported yet.
  const [geoCalibrationPoints, setGeoCalibrationPoints] = useState([]);
  const [pendingGeoBlueprintPoint, setPendingGeoBlueprintPoint] = useState(null);
  // Modo Render: dibujo de manzanas/calles sobre el panorama. Se persiste como
  // JSONB (`render_surfaces` en loteos, ver useSaveAll) junto al resto del
  // "Guardar todo". Las shapes en sí (crear/editar eje/ancho/vaciar) entran al
  // historial de undo/redo; declaradas antes de useHistory por lo mismo que
  // calibrationPoints arriba.
  const [renderManzanaShapes, setRenderManzanaShapes] = useState([]); // [{ id, points }]
  const [renderCalleShapes, setRenderCalleShapes] = useState([]);
  const { pushHistory, undo, redo, canUndo, canRedo, removeAnnotationFromHistory } = useHistory({
    annotations, setAnnotations, calibrationPoints, setCalibrationPoints,
    renderManzanaShapes, setRenderManzanaShapes, renderCalleShapes, setRenderCalleShapes,
  });
  const isDraggingPolygonRef = useRef(false);
  const preDragAnnotationsRef = useRef(null);
  const isDraggingCalibrationRef = useRef(false);
  const isDraggingStreetWidthRef = useRef(false);
  const keyboardStateRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drawingPolygon, setDrawingPolygon] = useState([]);
  // Rectángulo de 2 clicks: guarda la primera esquina mientras se espera la opuesta
  const [rectStart, setRectStart] = useState(null);
  const [renderTestMode, setRenderTestMode] = useState(null); // null | 'manzana' | 'calle'
  const [renderDrawingPts, setRenderDrawingPts] = useState([]); // [[textureX, textureY], ...]
  const [renderLayersVisible, setRenderLayersVisible] = useState({ lotes: true, manzanas: true, calles: true });
  const [renderColorMode, setRenderColorMode] = useState('light');
  const [renderManzanaOpacity, setRenderManzanaOpacity] = useState(1);
  // Calle: siempre se traza por eje central + ancho constante ("Ruta"), nunca
  // por click-polígono libre — el contorno se genera con buildStreetRibbon.
  const [renderStreetWidth, setRenderStreetWidth] = useState(56);
  // Edición de eje post-creación: reselecciona una calle ya trazada y permite
  // arrastrar/agregar puntos de su eje — reconstruye el contorno
  // (buildStreetRibbon) en cada cambio.
  const [renderStreetEditMode, setRenderStreetEditMode] = useState(false);
  const [renderStreetEditTarget, setRenderStreetEditTarget] = useState(null); // id de calle | null
  const toggleRenderStreetEditMode = () => {
    setRenderStreetEditMode(v => !v);
    setRenderStreetEditTarget(null);
  };
  // Snapshot enviado/recibido de `render_surfaces` (JSONB en loteos) — shape
  // estable (nunca null) para que el diff contra savedRenderSurfacesRef en
  // useSaveAll funcione igual que con calibrationPoints.
  const renderSurfaces = useMemo(() => ({
    manzanas: renderManzanaShapes,
    calles: renderCalleShapes,
    colorMode: renderColorMode,
    manzanaOpacity: renderManzanaOpacity,
    layersVisible: renderLayersVisible,
  }), [renderManzanaShapes, renderCalleShapes, renderColorMode, renderManzanaOpacity, renderLayersVisible]);
  const finishRenderShape = () => {
    if (!renderTestMode) return;
    const isStreetPath = renderTestMode === 'calle';
    const minPts = isStreetPath ? 2 : 3;
    if (renderDrawingPts.length < minPts) return;
    // Si el primer click de esta Ruta cayó cerca del inicio/final del eje de
    // otra Ruta ya trazada, no se crea una shape nueva: se mergea en un solo
    // eje continuo (ver mergeStreetAxis) para que el contorno salga de una
    // sola pieza en la unión, en vez de dos ribbons con costura.
    let drawingPts = renderDrawingPts;
    if (isStreetPath) {
      const snap = findAxisEndpointSnap(renderDrawingPts[0], renderCalleShapes);
      if (snap && snap.end !== 'interior') {
        const target = renderCalleShapes.find(s => s.id === snap.shapeId);
        const mergedAxis = mergeStreetAxis(target.axis, snap.end, renderDrawingPts);
        const mergedPoints = buildProjectedStreetRibbon(mergedAxis, target.width, homography)
          ?? buildStreetRibbon(mergedAxis, target.width);
        if (mergedPoints.length) {
          pushHistory(annotations);
          setRenderCalleShapes(prev => prev.map(s => (
            s.id === target.id
              ? { ...s, axis: mergedAxis, points: mergedPoints, curves: mergedPoints.map(() => null) }
              : s
          )));
          setRenderDrawingPts([]);
          setRenderTestMode(null);
          return;
        }
      }
      // Vértice interior: no se puede mergear en un solo eje (salen 3
      // direcciones de ese punto) — queda como shape independiente, pero
      // arrancando exacto en el vértice para que el ribbon la toque justo
      // ahí (el borde se junta con boolean union al renderizar).
      if (snap && snap.end === 'interior') {
        drawingPts = [snap.point, ...renderDrawingPts.slice(1)];
      }
    }
    // Probar: si hay homografía calibrada, la Ruta pasa por blueprint space
    // (round-trip vía unprojectPoint) para offsetear/filetear ahí donde el
    // terreno es plano, en vez de directo en texture space — ver
    // buildProjectedStreetRibbon en utils/streetPath.js. Cae al método viejo
    // si no hay calibración o el round-trip da puntos inválidos.
    const points = isStreetPath
      ? (buildProjectedStreetRibbon(drawingPts, renderStreetWidth, homography)
          ?? buildStreetRibbon(drawingPts, renderStreetWidth))
      : drawingPts;
    if (!points.length) return;
    const shape = {
      id: `test-${renderTestMode}-${Date.now()}`,
      points,
      ...(isStreetPath ? { axis: drawingPts, width: renderStreetWidth } : {}),
    };
    pushHistory(annotations);
    if (renderTestMode === 'manzana') setRenderManzanaShapes(prev => [...prev, shape]);
    else setRenderCalleShapes(prev => [...prev, shape]);
    setRenderDrawingPts([]);
    setRenderTestMode(null);
  };
  const cancelRenderDrawing = () => {
    setRenderDrawingPts([]);
    setRenderTestMode(null);
  };
  const handleRenderTestModeChange = (next) => {
    setRenderTestMode(next);
    setRenderDrawingPts([]);
    setRenderStreetEditMode(false);
    setRenderStreetEditTarget(null);
  };
  const clearRenderShapes = () => {
    if (renderManzanaShapes.length === 0 && renderCalleShapes.length === 0) return;
    pushHistory(annotations);
    setRenderManzanaShapes([]);
    setRenderCalleShapes([]);
    setRenderDrawingPts([]);
    setRenderStreetEditTarget(null);
  };
  // El eje cambió (arrastre o punto nuevo agregado): recalcula el contorno.
  // Se llama una sola vez por gesto de arrastre (al soltar, ver EditorViewer),
  // así que cada llamada es un commit atómico para el historial.
  const setStreetAxis = (shapeId, newAxis) => {
    pushHistory(annotations);
    setRenderCalleShapes(prev => prev.map(shape => {
      if (shape.id !== shapeId || !shape.axis) return shape;
      const points = buildProjectedStreetRibbon(newAxis, shape.width, homography)
        ?? buildStreetRibbon(newAxis, shape.width);
      return { ...shape, axis: newAxis, points };
    }));
  };
  // El slider de ancho dispara onChange en cada tick del arrastre — solo se
  // pushea un snapshot al primer tick del gesto (isDraggingStreetWidthRef se
  // resetea al soltar, ver el efecto de pointerup más abajo), para que un solo
  // Ctrl+Z revierta todo el arrastre en vez de un tick.
  const setStreetWidth = (shapeId, width) => {
    if (!isDraggingStreetWidthRef.current) {
      isDraggingStreetWidthRef.current = true;
      pushHistory(annotations);
    }
    setRenderCalleShapes(prev => prev.map(shape => {
      if (shape.id !== shapeId || !shape.axis) return shape;
      const points = buildProjectedStreetRibbon(shape.axis, width, homography)
        ?? buildStreetRibbon(shape.axis, width);
      return { ...shape, width, points };
    }));
  };
  // Auto-detect mode: detection parameters and state
  const [autoDetectParams, setAutoDetectParams] = useState({ threshold: 128, maxTextDim: 20, epsilon: 2.0 });
  const [autoDetectLoading, setAutoDetectLoading] = useState(false);
  const [autoDetectError, setAutoDetectError] = useState(null);
  const [autoDetectLotsGenerated, setAutoDetectLotsGenerated] = useState(0);

  const [panoramaUrl, setPanoramaUrl] = useState(null);
  const [panoramaDimensions, setPanoramaDimensions] = useState(null);
  const [blueprintUrl, setBlueprintUrl] = useState(null);
  const [mode, setMode] = useState('panorama'); // 'panorama' | 'blueprint' | 'render'

  // Derived projector — recomputed whenever calibration points or panorama
  // dimensions change. Fits the homography with the ray direction as target
  // (valid over the whole sphere), not a pixel or gnomonic tangent-plane
  // coordinate — see panoramaProjection.js.
  const homography = useMemo(() => {
    if (calibrationPoints.length < 4 || !panoramaDimensions) return null;
    const projector = computeProjector(
      calibrationPoints.map(c => ({ src: c.blueprint, dst: c.panorama })),
      panoramaDimensions
    );
    return isProjectorValid(projector) ? projector : null;
  }, [calibrationPoints, panoramaDimensions]);
  const [snapThreshold, setSnapThreshold] = useState(5);
  const [homePosition, setHomePosition] = useState(null);
  const [northOffset, setNorthOffset] = useState(null);
  const getViewerPositionRef = useRef(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [isLoadingDefault, setIsLoadingDefault] = useState(true);
  const [loteoId, setLoteoId] = useState(null);
  const [siblingStages, setSiblingStages] = useState([]);
  const { token: accessToken, user, handleLogin, handleLogout, activeOrgId, setActiveOrgId } = useAuth();
  const hasDataParam = new URLSearchParams(window.location.search).has('data');
  // super_admin sin org resuelta (ver useAuth: pasa cuando hay ?data= sin un
  // ?orgId= que lo acompañe — link viejo, o esta misma pestaña reusada tras
  // cambiar de cuenta) no puede confiar en el loteo del link: no hay forma de
  // saber a qué org pertenece sin abrirlo. Se lo trata como si no hubiera
  // ?data= — cae al listado en vez de arriesgarse a mostrar un loteo ajeno.
  const untrustedDirectLink = user?.role === 'super_admin' && hasDataParam && !activeOrgId;
  // Gatea los fetches org-scoped (loteos, siblingStages) hasta que se sepa el
  // rol y, si es super_admin, ya eligió (o el link trajo) una org — evita
  // 400s del backend (falta X-Active-Org-Id).
  const hasOrgContext = Boolean(user) && (user.role !== 'super_admin' || Boolean(activeOrgId));

  // Si el link no es confiable, se limpia ?data=/&from= de la URL — así, una
  // vez elegida una org en el listado, no queda un ?data= viejo compitiendo
  // por mostrarse (ver bug reportado 2026-09-04: se abría un loteo de la org
  // anterior al elegir la nueva).
  useEffect(() => {
    if (!untrustedDirectLink) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('data');
    params.delete('from');
    const cleaned = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState({}, '', cleaned);
  }, [untrustedDirectLink]);
  const uploadFn = useMemo(() => createUploadFn(accessToken, handleLogout), [accessToken, handleLogout]);
  const [selectedLoteo, setSelectedLoteo] = useState(null);
  const [loteoAccessDenied, setLoteoAccessDenied] = useState(false);

  // useAuth ya limpia ?data=/&orgId= de la URL al hacer logout, pero el
  // loteo cargado sigue en memoria (la SPA no remonta) — sin este reset, al
  // loguearse con otra cuenta en la misma pestaña se reintentaba abrir el
  // loteo/etapa de la sesión anterior (bug reportado 2026-09-05).
  useEffect(() => {
    if (accessToken) return;
    setLoteoId(null);
    setSelectedLoteo(null);
    setLoteoAccessDenied(false);
  }, [accessToken]);
  // Snapshot of annotations as last saved/loaded — used to diff before saving
  const savedAnnotationsRef = useRef([]);
  const savedCalibrationRef = useRef([]);
  const savedGeoCalibrationRef = useRef([]);
  // Default que matchea el estado inicial de renderManzanaShapes/etc, para que
  // el diff no se dispare espuriamente en loteos que nunca tocaron modo Render.
  const savedRenderSurfacesRef = useRef({
    manzanas: [], calles: [], colorMode: 'light', manzanaOpacity: 1,
    layersVisible: { lotes: true, manzanas: true, calles: true },
  });
  const { pendingDraft, loadDraft, clearDraft } = useDraft({ annotations, loteoId, savedAnnotationsRef, calibrationPoints, savedCalibrationRef, panoramaDimensions });
  const {
    isCreatingLote,
    pendingMode, setPendingMode,
    assignTargetId, setAssignTargetId,
    isAssigning,
    handleCreateLote,
    handleAssignToExistingLot,
    handleRemoveLot,
  } = useLotOperations({
    annotations, setAnnotations,
    selectedId, setSelectedId,
    token: accessToken,
    loteoId, mode,
    onAuthError: handleLogout,
    onAfterCreate: clearDraft,
  });
  const { handleDeletePoi } = usePoiOperations({
    setAnnotations, selectedId, setSelectedId,
    token: accessToken, loteoId, mode,
    onAfterCreate: clearDraft,
    onAuthError: handleLogout,
  });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [projectPanelOpen, setProjectPanelOpen] = useState(true);
  const [projectPanelTab, setProjectPanelTab] = useState('project');
  // Track blob URLs to revoke and prevent memory leak
  const prevPanoramaUrlRef = useRef(null);
  const {
    isSavingAll,
    sessionExpiredDuringSave, clearSessionExpired,
    handleSaveAll,
  } = useSaveAll({
    annotations, setAnnotations, token: accessToken, loteoId, savedAnnotationsRef, onAfterSave: clearDraft,
    calibrationPoints, savedCalibrationRef,
    geoCalibrationPoints, savedGeoCalibrationRef,
    renderSurfaces, savedRenderSurfacesRef,
  });



  // Cuando se carga vía ?data=URL, selectedLoteo queda null — lo cargamos aparte
  useEffect(() => {
    if (!loteoId || selectedLoteo || !accessToken || !hasOrgContext) return;
    fetch(`${API_BASE}/loteos/${loteoId}`, {
      headers: authHeaders(accessToken),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setSelectedLoteo(data))
      .catch(() => setLoteoAccessDenied(true));
  }, [loteoId, selectedLoteo, accessToken, hasOrgContext]);

  // Carga los datos del loteo desde la URL recibida por query string.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataUrl = params.get('data');
    let extractedLoteoId = null;
    // StrictMode monta este efecto dos veces en dev: la corrida descartada no debe
    // aplicar estado ni crear/revocar blob URLs (con la imagen en caché ambas
    // resuelven casi a la vez y se pisan el blob que el visor está cargando).
    let cancelled = false;

    if (dataUrl) {
      const match = dataUrl.match(/\/loteos\/([^/?]+)/);
      if (match) {
        extractedLoteoId = match[1];
        // Initialize route-derived editor state once on mount.
        setLoteoId(extractedLoteoId);
      }
    }

    if (dataUrl) {
      fetch(dataUrl)
        .then(res => {
          if (!res.ok) throw new Error(`Error ${res.status}`);
          return res.json();
        })
        .then(async data => {
          if (cancelled) return;
          if (data.annotations && Array.isArray(data.annotations)) {
            const mappedAnnotations = data.annotations.map((a, i) => {
              const ann = { ...a, id: a.id ?? a.uuid ?? `ann-${i}` };
              // Keep both coordinate systems for mode switching
              // Store panorama_coordinates/blueprint_coordinates as-is for later retrieval
              // For initial display, use panorama mode as default
              ann.variant = ann.marker_variant ?? ann.variant ?? 'area';
              if (ann.type === 'poi' && ann.variant === 'callout') {
                const anchor = ann.panorama_anchor ?? ann.panorama_coordinates?.[0];
                if (anchor) ann.position = { textureX: anchor[0], textureY: anchor[1] };
              } else if ((ann.type === 'polygon' || ann.type === 'poi') && ann.panorama_coordinates) {
                ann.polygonPixels = ann.panorama_coordinates;
              } else if ((ann.type === 'polygon' || ann.type === 'poi') && ann.blueprint_coordinates) {
                ann.polygonPixels = ann.blueprint_coordinates;
              }
              return ann;
            });
            setAnnotations(mappedAnnotations);
            savedAnnotationsRef.current = mappedAnnotations;

            // Check for draft from previous session
            loadDraft(extractedLoteoId, data.panoramaWidth && data.panoramaHeight
              ? { width: data.panoramaWidth, height: data.panoramaHeight }
              : null);
          }

          if (data.panoramaUrl && typeof data.panoramaUrl === 'string') {
            setPanoramaDimensions(data.panoramaWidth && data.panoramaHeight
              ? { width: data.panoramaWidth, height: data.panoramaHeight }
              : null);
            try {
              const imgRes = await fetchImage(data.panoramaUrl);
              if (imgRes.ok) {
                const blob = await imgRes.blob();
                if (cancelled) return;
                // Revoke previous blob URL if exists
                if (prevPanoramaUrlRef.current?.startsWith('blob:')) {
                  URL.revokeObjectURL(prevPanoramaUrlRef.current);
                }
                const newUrl = URL.createObjectURL(blob);
                prevPanoramaUrlRef.current = newUrl;
                setPanoramaUrl(newUrl);
              } else {
                setPanoramaUrl(data.panoramaUrl);
              }
            } catch {
              if (cancelled) return;
              setPanoramaUrl(data.panoramaUrl);
            }
          }
          if (cancelled) return;
          if (data.blueprintUrl && typeof data.blueprintUrl === 'string') {
            setBlueprintUrl(data.blueprintUrl);
          }
          if (Array.isArray(data.calibrationPoints) && data.calibrationPoints.length > 0) {
            const withIds = data.calibrationPoints.map(p =>
              p._id ? p : { ...p, _id: crypto.randomUUID() }
            );
            setCalibrationPoints(withIds);
            savedCalibrationRef.current = withIds;
          }
          if (Array.isArray(data.geoCalibrationPoints) && data.geoCalibrationPoints.length > 0) {
            const withIds = data.geoCalibrationPoints.map(p =>
              p._id ? p : { ...p, _id: crypto.randomUUID() }
            );
            setGeoCalibrationPoints(withIds);
            savedGeoCalibrationRef.current = withIds;
          }
          if (data.renderSurfaces && typeof data.renderSurfaces === 'object') {
            const loaded = {
              manzanas: data.renderSurfaces.manzanas ?? [],
              calles: data.renderSurfaces.calles ?? [],
              colorMode: data.renderSurfaces.colorMode ?? 'light',
              manzanaOpacity: data.renderSurfaces.manzanaOpacity ?? 1,
              layersVisible: data.renderSurfaces.layersVisible ?? { lotes: true, manzanas: true, calles: true },
            };
            setRenderManzanaShapes(loaded.manzanas);
            setRenderCalleShapes(loaded.calles);
            setRenderColorMode(loaded.colorMode);
            setRenderManzanaOpacity(loaded.manzanaOpacity);
            setRenderLayersVisible(loaded.layersVisible);
            savedRenderSurfacesRef.current = loaded;
          }
          if (data.snapThreshold != null) {
            setSnapThreshold(data.snapThreshold);
          }
          if (data.homeYaw != null && data.homePitch != null) {
            setHomePosition({ yaw: data.homeYaw, pitch: data.homePitch });
          }
          if (data.northOffset != null) {
            setNorthOffset(data.northOffset);
          }
        })
        .catch(err => {
          if (cancelled) return;
          notify(`No se pudo cargar el JSON desde la URL: ${err.message}`, { variant: 'error' });
        })
        .finally(() => { if (!cancelled) setIsLoadingDefault(false); });
      return () => { cancelled = true; };
    }

    setIsLoadingDefault(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Etapas hermanas del proyecto (para que un POI pueda navegar a otra etapa).
  useEffect(() => {
    if (!loteoId || !accessToken || !hasOrgContext) return;
    let cancelled = false;
    fetchWithTimeout(`${API_BASE}/loteos?limit=100`, {
      headers: authHeaders(accessToken),
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data?.items) return;
        const me = data.items.find(l => l.id === loteoId);
        if (!me?.project_id) { setSiblingStages([]); return; }
        const siblings = data.items
          .filter(l => l.project_id === me.project_id && l.id !== loteoId)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
          .map(l => ({ id: l.id, name: l.name }));
        setSiblingStages(siblings);
      })
      .catch(() => { if (!cancelled) setSiblingStages([]); });
    return () => { cancelled = true; };
  }, [loteoId, accessToken, hasOrgContext]);

  // Reset pending panel state when selection changes
  useEffect(() => {
    setPendingMode('create');
    setAssignTargetId('');
  }, [selectedId, setAssignTargetId, setPendingMode]);



  const handleViewerClick = async (textureX, textureY) => {
    if (activeTool === 'calibrate-geo') {
      // Blueprint click only — GeoCalibrationOverlay renders BlueprintEditor
      // and GeoCalibrationMap side by side, so this always comes from the
      // blueprint pane. Re-clicking overwrites any still-unmatched point.
      setPendingGeoBlueprintPoint([textureX, textureY]);
      return;
    }

    if (activeTool === 'calibrate') {
      if (mode === 'blueprint') {
        // 4 pairs is the hard cap — the projection is precise enough by then,
        // and beyond that more points added ad-hoc do more harm than good.
        // Delete a pair first (dropping below 4) to replace it.
        if (calibrationPoints.length >= 4) return;
        // Collecting phase: queue this point. Batch size is whatever's left
        // to reach 4 pairs — fixed for the whole collecting phase since
        // calibrationPoints only changes during the matching phase below.
        const batchSize = 4 - calibrationPoints.length;
        const nextPending = [...pendingBlueprintPoints, [textureX, textureY]];
        setPendingBlueprintPoints(nextPending);
        if (nextPending.length >= batchSize) {
          handleModeChange('panorama', { silent: true });
        }
      } else if (pendingBlueprintPoints.length > 0) {
        // Matching phase: match this panorama click against the oldest
        // still-queued blueprint point, in the same order they were placed.
        const pendingBp = pendingBlueprintPoints[0];
        const panoramaPoint = [textureX, textureY];
        const tooClose = calibrationPoints.some(pair =>
          isCalibrationPairTooClose(pair, pendingBp, panoramaPoint)
        );
        if (tooClose && !(await confirm(
          'Este punto está muy cerca de uno existente.\nPuede afectar la estabilidad de la calibración. ¿Agregar de todas formas?',
          { title: 'Punto de calibración cercano', confirmLabel: 'Agregar de todas formas' }
        ))) return;

        const newPair = {
          _id: crypto.randomUUID(),
          blueprint: pendingBp,
          panorama: panoramaPoint,
        };
        setCalibrationPoints(prev => [...prev, newPair]);
        const remainingPending = pendingBlueprintPoints.slice(1);
        setPendingBlueprintPoints(remainingPending);
        const completedPairCount = calibrationPoints.length + 1;
        if (remainingPending.length === 0) {
          // Batch done. Return to the blueprint and Select mode so the user
          // can immediately straighten the reference points without needing
          // another tool change.
          handleModeChange('blueprint', { silent: true });
          if (completedPairCount === 4) {
            setActiveTool('select');
            setCalibrationNotice('Calibración lista. Ajustá los puntos en el plano si hace falta.');
          }
        }
      }
      return;
    }

    if (activeTool === 'rect') {
      if (!rectStart) {
        setRectStart([textureX, textureY]);
      } else {
        const [x1, y1] = rectStart;
        const polygonPixels = [[x1, y1], [textureX, y1], [textureX, textureY], [x1, textureY]];
        const newId = `polygon-${crypto.randomUUID()}`;
        const newAnn = {
          id: newId,
          type: 'polygon',
          pending: true,
          polygonPixels,
          tooltip: '',
          svgStyle: { fill: 'rgba(255,165,0,0.15)', stroke: '#ffa500', strokeWidth: '2', strokeDasharray: '8,4' },
        };
        pushHistory(annotations);
        setAnnotations([...annotations, newAnn]);
        setRectStart(null);
        setSelectedId(newId);
        setActiveTool('select');
        setInspectorOpen(true);
      }
      return;
    }

    if (activeTool === 'select') {
      setSelectedId(null);
      return;
    }

    if (activeTool === 'polygon') {
      setDrawingPolygon([...drawingPolygon, [textureX, textureY]]);
      return;
    }

    if (activeTool === 'autodetect') {
      handleAutoDetectClick(textureX, textureY);
      return;
    }

    const newId = `${activeTool}-${crypto.randomUUID()}`;
    const newAnn = {
      id: newId,
      type: activeTool,
      position: { textureX, textureY },
      tooltip: `Nuevo ${activeTool}`,
      svgStyle: { fill: 'rgba(255,0,0,0.3)', stroke: '#c00', strokeWidth: '2' }
    };

    if (activeTool === 'text') {
      newAnn.tooltip = "Texto";
      newAnn.textColor = "#ffffff";
      newAnn.bgColor = "#ffffff";
      newAnn.bgOpacity = 0;
      newAnn.fontSize = 14;
    }

    if (activeTool === 'poi') {
      newAnn.variant = 'callout';
      newAnn.pending = true;
      newAnn.tooltip = 'Nuevo lugar';
      newAnn.color = '#c5a059';
      newAnn.callout_stem_height = 96;
      if (mode === 'blueprint') newAnn.blueprint_anchor = [textureX, textureY];
      else newAnn.panorama_anchor = [textureX, textureY];
    }

    pushHistory(annotations);
    setAnnotations([...annotations, newAnn]);
    setSelectedId(newId);
    setActiveTool('select');
    setInspectorOpen(activeTool === 'text' || activeTool === 'poi');
  };

  const finishPolygon = () => {
    if (drawingPolygon.length < 3) {
      notify('El polígono necesita al menos 3 puntos', { variant: 'error' });
      return;
    }
    const newId = `${activeTool}-${Date.now()}`;
    const newAnn = {
      id: newId,
      type: activeTool,
      pending: true,
      polygonPixels: drawingPolygon,
      tooltip: '',
      svgStyle: { fill: 'rgba(255,165,0,0.15)', stroke: '#ffa500', strokeWidth: '2', strokeDasharray: '8,4' },
    };
    pushHistory(annotations);
    setAnnotations([...annotations, newAnn]);
    setDrawingPolygon([]);
    setSelectedId(newId);
    setActiveTool('select');
    setInspectorOpen(true);
  };

  const cancelPolygon = () => {
    setDrawingPolygon([]);
    setActiveTool('select');
  };

  const cancelRect = () => {
    setRectStart(null);
    setActiveTool('select');
  };

  const cancelCalibration = () => {
    setPendingBlueprintPoints([]);
    setActiveTool('select');
  };

  const cancelGeoCalibration = () => {
    setPendingGeoBlueprintPoint(null);
    setActiveTool('select');
  };

  const handleGeoMapPointPicked = ({ latitude, longitude }) => {
    if (!pendingGeoBlueprintPoint) return;
    const newPair = { _id: crypto.randomUUID(), blueprint: pendingGeoBlueprintPoint, geo: [latitude, longitude] };
    setGeoCalibrationPoints(prev => [...prev, newPair]);
    setPendingGeoBlueprintPoint(null);
  };

  const handleDeleteGeoCalibrationPoint = (index) => {
    setGeoCalibrationPoints(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearGeoCalibration = async () => {
    if (geoCalibrationPoints.length === 0) return;
    const ok = await confirm('¿Borrar toda la calibración geográfica?', {
      title: 'Borrar calibración geográfica', danger: true, confirmLabel: 'Borrar',
    });
    if (!ok) return;
    setGeoCalibrationPoints([]);
    setActiveTool('select');
  };

  // Baked (non-reactive) computation: re-run manually via the "Actualizar
  // polígonos satelitales" button whenever geoCalibrationPoints or any lot's
  // blueprint_coordinates change — same criterion as the rest of the
  // calibration system (nothing here recomputes automatically).
  const handleUpdateGeoPolygons = () => {
    if (geoCalibrationPoints.length < 4) return;
    const correspondences = geoCalibrationPoints.map(p => ({ src: p.blueprint, dst: [p.geo[1], p.geo[0]] }));
    const H = computeHomography(correspondences);
    if (!isHomographyValid(H)) {
      notify('No se pudo calcular una calibración geográfica válida con estos puntos.', { variant: 'error' });
      return;
    }
    pushHistory(annotations);
    setAnnotations(prev => prev.map(a => {
      if (a.type !== 'polygon' || !a.blueprint_coordinates?.length) return a;
      const geo_coordinates = a.blueprint_coordinates.map(([nx, ny]) => {
        const [lng, lat] = applyHomography(H, [nx, ny]);
        return [lat, lng];
      });
      return { ...a, geo_coordinates };
    }));
    notify('Polígonos satelitales actualizados.', { variant: 'success' });
  };

  const handleAutoDetectClick = async (textureX, textureY) => {
    if (!blueprintUrl) return;
    setAutoDetectLoading(true);
    setAutoDetectError(null);

    // Normalize click to [0, 1] assuming textureX/Y are already in that range
    const result = await detectLotPolygon(blueprintUrl, 1, 1, textureX, textureY, autoDetectParams);

    if (!result.success) {
      setAutoDetectError(result.error);
      setAutoDetectLoading(false);
      return;
    }

    // Convert normalized coords back to image pixel space would happen in detectLotPolygon
    // For now, assume result.coordinates are already in image pixel space and normalize them
    const newId = `lot-${crypto.randomUUID()}`;
    const newAnn = {
      id: newId,
      type: 'polygon',
      pending: true,
      polygonPixels: result.coordinates, // Already normalized [0, 1]
      blueprint_coordinates: result.coordinates,
      tooltip: `Lote Auto ${autoDetectLotsGenerated + 1}`,
      svgStyle: { fill: 'rgba(76,175,80,0.15)', stroke: '#4caf50', strokeWidth: '2', strokeDasharray: '4,2' },
    };

    pushHistory(annotations);
    setAnnotations([...annotations, newAnn]);
    setSelectedId(newId);
    setAutoDetectLotsGenerated(prev => prev + 1);
    setAutoDetectLoading(false);
    setInspectorOpen(true);
  };

  // Escape while in calibrate tool: discard the pending batch and go back to
  // blueprint to pick again (without exiting the tool). Already-completed
  // pairs are untouched — undo separately with Ctrl+Z if needed. If there's
  // no pending batch, exit the tool entirely.
  const handleEscapeCalibration = () => {
    if (pendingBlueprintPoints.length > 0) {
      setPendingBlueprintPoints([]);
      handleModeChange('blueprint', { silent: true });
    } else {
      cancelCalibration();
    }
  };

  const handleEscapeGeoCalibration = () => {
    if (pendingGeoBlueprintPoint) setPendingGeoBlueprintPoint(null);
    else cancelGeoCalibration();
  };

  const handleDeleteCalibrationPoint = (index) => {
    // undo-able: the composite snapshot captures the current calibrationPoints
    pushHistory(annotations);
    setCalibrationPoints(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearCalibration = async () => {
    if (calibrationPoints.length === 0) return;
    const ok = await confirm('¿Borrar toda la calibración? (podés deshacer con Ctrl+Z)', {
      title: 'Borrar calibración', danger: true, confirmLabel: 'Borrar',
    });
    if (!ok) return;
    pushHistory(annotations);
    setCalibrationPoints([]);
    setActiveTool('select');
  };

  const handleCaptureHome = async () => {
    const pos = getViewerPositionRef.current?.();
    if (!pos) throw new Error('El visor no está listo');
    const res = await fetchWithTimeout(`${API_BASE}/loteos/${loteoId}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ home_yaw: pos.yaw, home_pitch: pos.pitch }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const saved = await res.json();
    setHomePosition({ yaw: saved.home_yaw, pitch: saved.home_pitch });
    return saved;
  };

  const handleSetNorth = async () => {
    const pos = getViewerPositionRef.current?.();
    if (!pos) throw new Error('El visor no está listo');
    const res = await fetchWithTimeout(`${API_BASE}/loteos/${loteoId}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ north_offset: pos.yaw }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const saved = await res.json();
    setNorthOffset(saved.north_offset);
    return saved;
  };

  const handleResetHome = async () => {
    const res = await fetchWithTimeout(`${API_BASE}/loteos/${loteoId}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ home_yaw: null, home_pitch: null }),
    });
    if (!res.ok) throw new Error('No se pudo restablecer la vista inicial.');
    const saved = await res.json();
    setHomePosition(null);
    return saved;
  };

  const handleResetNorth = async () => {
    const res = await fetchWithTimeout(`${API_BASE}/loteos/${loteoId}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ north_offset: null }),
    });
    if (!res.ok) throw new Error('No se pudo restablecer el norte.');
    const saved = await res.json();
    setNorthOffset(null);
    return saved;
  };

  const handleSaveProjectSettings = async ({ name, snapThreshold: nextSnapThreshold }) => {
    if (!loteoId) throw new Error('No se encontró el loteo que querés configurar.');
    const res = await fetchWithTimeout(`${API_BASE}/loteos/${loteoId}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...(name ? { name } : {}),
        snap_threshold: nextSnapThreshold,
      }),
    });
    if (!res.ok) throw new Error('No se pudo guardar la configuración del loteo.');
    const saved = await res.json();
    if (saved.snap_threshold != null) setSnapThreshold(saved.snap_threshold);
    setSelectedLoteo(prev => prev
      ? { ...prev, name: saved.name ?? prev.name }
      : { ...saved, name: saved.name ?? name });
    return saved;
  };

  const handleModeChange = async (nextMode, { silent = false } = {}) => {
    if (nextMode === mode) return;
    if (!silent) {
      const spatialAnnotations = annotations.filter(a => (
        !a.pending
        && (a.type === 'polygon' || (nextMode === 'panorama' && a.type === 'poi'))
      ));
      const coordKey = nextMode === 'blueprint' ? 'blueprint_coordinates' : 'panorama_coordinates';
      const anchorKey = nextMode === 'blueprint' ? 'blueprint_anchor' : 'panorama_anchor';
      const missing = spatialAnnotations.filter(a =>
        a.type === 'poi' && a.variant === 'callout'
          ? !a[anchorKey]
          : !a[coordKey] || a[coordKey].length === 0
      );
      if (missing.length > 0) {
        const ok = await confirm(
          `${missing.length} marcador(es) no tienen ubicación en la vista ${nextMode === 'blueprint' ? 'Plano' : 'Panorama'}.\n` +
          `Aparecerán vacíos. ¿Continuar de todas formas?`,
          { title: 'Marcadores sin ubicación', confirmLabel: 'Continuar' }
        );
        if (!ok) return;
      }
    }
    setSelectedId(null);
    setMode(nextMode);
  };

  // Keep tool activation in one place so contextual panels always follow the
  // selected tool, regardless of whether it was chosen from the toolbar or
  // from the project panel.
  const handleToolChange = (tool) => {
    setActiveTool(tool);
    if (tool === 'calibrate') setCalibrationNotice('');
    if (tool !== 'polygon') setDrawingPolygon([]);
    if (tool !== 'rect') setRectStart(null);
    if (tool === 'calibrate') {
      setProjectPanelOpen(true);
      setProjectPanelTab('project');
    }
    if (tool === 'calibrate-geo') {
      setProjectPanelOpen(true);
      setProjectPanelTab('project');
    }
    if (tool === 'autodetect') {
      setMode('blueprint');
      setProjectPanelOpen(true);
      setProjectPanelTab('project');
      setAutoDetectError(null);
      setAutoDetectLotsGenerated(0);
    }
  };

  // Clear in-progress drawing when switching modes — coordinates are not transferable between spaces
  // Exception: calibrate and autodetect drive mode changes intentionally, so don't reset them
  useEffect(() => {
    if (activeTool === 'calibrate' || activeTool === 'autodetect') return;
    // Mode changes invalidate an in-progress polygon because the coordinate spaces differ.
    setDrawingPolygon([]);
    setRectStart(null);
    setActiveTool('select');
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Salir del modo Render limpia la herramienta de dibujo activa y el trazo en curso
  useEffect(() => {
    if (mode !== 'render') {
      setRenderTestMode(null);
      setRenderDrawingPts([]);
    }
  }, [mode]);

  // When calibrate tool is activated, start in blueprint so the user picks the reference there first
  useEffect(() => {
    if (activeTool === 'calibrate' && blueprintUrl) {
      // Entering calibration intentionally resets its pending batch.
      setPendingBlueprintPoints([]);
      setSelectedId(null);
      setMode('blueprint');
      setProjectPanelOpen(true);
      setProjectPanelTab('project');
    }
    // When leaving calibrate tool, clean up any pending batch
    if (activeTool !== 'calibrate') {
      setPendingBlueprintPoints([]);
    }
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Entering/leaving geo calibration: reset its pending (unmatched) point.
  useEffect(() => {
    if (activeTool === 'calibrate-geo') {
      setSelectedId(null);
      setProjectPanelOpen(true);
      setProjectPanelTab('project');
    } else {
      setPendingGeoBlueprintPoint(null);
    }
  }, [activeTool]);

  // If blueprintUrl disappears while in blueprint mode, fall back to panorama
  useEffect(() => {
    // Keep the selected view usable if its source image is removed externally.
    if (!blueprintUrl && mode === 'blueprint') {
      setSelectedId(null);
      setMode('panorama');
    }
  }, [blueprintUrl, mode]);

  // Commit polygon drag to history on pointerup (handlePolygonUpdate fires on every pointermove)
  useEffect(() => {
    const handlePointerUp = () => {
      if (isDraggingPolygonRef.current) {
        pushHistory(preDragAnnotationsRef.current);
        isDraggingPolygonRef.current = false;
        preDragAnnotationsRef.current = null;
      }
      // Solo resetea el flag: el snapshot ya se pusheó en el primer tick del
      // slider (ver setStreetWidth) — acá no hay nada más que hacer.
      isDraggingStreetWidthRef.current = false;
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, [pushHistory]);

  // Keyboard shortcuts — uses ref to always read fresh callbacks without re-registering
  useEffect(() => {
    const onKeyDown = (e) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        keyboardStateRef.current?.saveAll();
        return;
      }

      if (isInput) return;

      if (e.key === 'Escape') {
        if (keyboardStateRef.current?.activeTool === 'calibrate') {
          keyboardStateRef.current?.handleEscapeCalibration();
        } else if (keyboardStateRef.current?.activeTool === 'calibrate-geo') {
          keyboardStateRef.current?.handleEscapeGeoCalibration();
        } else if (keyboardStateRef.current?.activeTool === 'autodetect') {
          keyboardStateRef.current?.setActiveTool('select');
        } else if (keyboardStateRef.current?.activeTool === 'rect') {
          keyboardStateRef.current?.cancelRect();
        } else {
          keyboardStateRef.current?.cancelPolygon();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        keyboardStateRef.current?.removeSelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        keyboardStateRef.current?.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        keyboardStateRef.current?.redo();
        return;
      }
      if (keyboardStateRef.current?.mode === 'render') {
        const key = e.key.toLowerCase();
        if (key === '1') {
          const s = keyboardStateRef.current;
          s.onRenderTestModeChange(s.renderTestMode === 'manzana' ? null : 'manzana');
          return;
        }
        if (key === '2') {
          const s = keyboardStateRef.current;
          s.onRenderTestModeChange(s.renderTestMode === 'calle' ? null : 'calle');
          return;
        }
        if (key === '3') {
          if (keyboardStateRef.current.hasStreetPathShapes) keyboardStateRef.current.onToggleRenderStreetEditMode();
          return;
        }
        if (key === 'l') {
          if (keyboardStateRef.current.hasRenderShapes) keyboardStateRef.current.onClearRenderShapes();
          return;
        }
      }
      if (e.key.toLowerCase() === 'v') { keyboardStateRef.current?.setActiveTool('select'); return; }
      if (e.key === '1') { keyboardStateRef.current?.setActiveTool('polygon'); return; }
      if (e.key === '2') {
        // '2' es "Lugar" en panorama, pero ese tool no existe en plano — ahí lo
        // reutilizamos para "Rectángulo", que tampoco existe en panorama.
        const nextTool = keyboardStateRef.current?.mode === 'blueprint' ? 'rect' : 'poi';
        keyboardStateRef.current?.setActiveTool(nextTool);
        return;
      }
      if (e.key === '3' && keyboardStateRef.current?.mode === 'panorama') {
        keyboardStateRef.current.setActiveTool('text');
        return;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const { displayAnnotations, selectedMarker } = useDisplayAnnotations({
    annotations, selectedId, mode, drawingPolygon,
    calibrationPoints, pendingBlueprintPoints, homography,
  });

  // Blueprint-pane annotations for the geo calibration overlay: existing lot
  // outlines (for spatial reference) plus the calibration points themselves.
  const geoDisplayAnnotations = useMemo(() => {
    const lots = annotations
      .filter(a => a.type === 'polygon' && a.blueprint_coordinates?.length >= 3)
      .map(a => ({ ...a, polygonPixels: a.blueprint_coordinates }));
    const points = geoCalibrationPoints.map((pair, i) => ({
      id: `geo-calib-pt-${pair._id}`,
      type: 'calibration-point',
      position: { textureX: pair.blueprint[0], textureY: pair.blueprint[1] },
      label: String(i + 1),
      svgStyle: { fill: '#22c55e', stroke: '#fff', strokeWidth: '2' },
    }));
    const pending = pendingGeoBlueprintPoint ? [{
      id: 'geo-calib-pending',
      type: 'calibration-point',
      position: { textureX: pendingGeoBlueprintPoint[0], textureY: pendingGeoBlueprintPoint[1] },
      label: String(geoCalibrationPoints.length + 1),
      svgStyle: { fill: '#22c55e', stroke: '#fff', strokeWidth: '2', opacity: 0.5 },
    }] : [];
    return [...lots, ...points, ...pending];
  }, [annotations, geoCalibrationPoints, pendingGeoBlueprintPoint]);

  const geoPolygons = useMemo(
    () => annotations.filter(a => a.type === 'polygon' && a.geo_coordinates?.length >= 3),
    [annotations]
  );


  const handlePolygonUpdate = (markerId, newPolygonPixels) => {
    if (!isDraggingPolygonRef.current) {
      isDraggingPolygonRef.current = true;
      preDragAnnotationsRef.current = annotations;
    }
    setAnnotations(prevAnnotations => prevAnnotations.map(a => {
      if (a.id === markerId) {
        const update = { ...a, polygonPixels: newPolygonPixels };
        if (mode === 'blueprint') update.blueprint_coordinates = newPolygonPixels;
        else update.panorama_coordinates = newPolygonPixels;
        return update;
      }
      return a;
    }));
  };

  // Live calibration drag (panorama): update calibrationPoints on every move so
  // the homography recomputes and ghost polygons reproject in real time.
  const handleCalibrationDragLive = (markerId, x, y) => {
    const ptId = markerId.replace('calib-pt-', '');
    if (!isDraggingCalibrationRef.current) {
      isDraggingCalibrationRef.current = true;
      // Snapshot on first move while calibrationPoints is still pre-drag, so a
      // single Ctrl+Z reverts the whole drag.
      pushHistory(annotations);
    }
    const coordKey = mode === 'blueprint' ? 'blueprint' : 'panorama';
    // Panorama coords are PSV pixel coordinates — do NOT clamp to [0,1].
    // Blueprint coords are normalized [0,1] and need clamping.
    let cx, cy;
    if (coordKey === 'blueprint') {
      cx = Math.max(0, Math.min(1, x));
      cy = Math.max(0, Math.min(1, y));
    } else {
      cx = x;
      cy = y;
    }
    setCalibrationPoints(prev => prev.map(p =>
      p._id === ptId ? { ...p, [coordKey]: [cx, cy] } : p
    ));
  };

  const handleMarkerDragEnd = (markerId, textureX, textureY) => {
    // Calibration point dragged — update only the coord for the current mode
    // (blueprint or panorama), leaving the other untouched. Homography recomputes via useMemo.
    if (markerId.startsWith('calib-pt-')) {
      // Panorama live-drag path already applied the change + history during move
      if (isDraggingCalibrationRef.current) {
        isDraggingCalibrationRef.current = false;
        return;
      }
      // Blueprint (no live drag): snapshot then apply on drop.
      const ptId = markerId.replace('calib-pt-', '');
      const coordKey = mode === 'blueprint' ? 'blueprint' : 'panorama';
      const cx = Math.max(0, Math.min(1, textureX));
      const cy = Math.max(0, Math.min(1, textureY));
      pushHistory(annotations);
      setCalibrationPoints(prev => prev.map(p =>
        p._id === ptId ? { ...p, [coordKey]: [cx, cy] } : p
      ));
      return;
    }

    pushHistory(annotations);
    setAnnotations(prevAnnotations => prevAnnotations.map(a => {
      if (a.id === markerId) {
        if (a.type === 'poi' && a.variant === 'callout') {
          return mode === 'blueprint'
            ? { ...a, position: { textureX, textureY }, blueprint_anchor: [textureX, textureY] }
            : { ...a, position: { textureX, textureY }, panorama_anchor: [textureX, textureY] };
        }
        return { ...a, position: { textureX, textureY } };
      }
      return a;
    }));
  };

  const handleImportFromBlueprint = () => {
    const newPanoCoords = projectPolygon(selectedMarker?.blueprint_coordinates, homography);
    if (!newPanoCoords) return;
    pushHistory(annotations);
    setAnnotations(prev => prev.map(a =>
      a.id === selectedId
        ? { ...a, panorama_coordinates: newPanoCoords, polygonPixels: mode === 'panorama' ? newPanoCoords : a.polygonPixels }
        : a
    ));
  };

  const importPolygonsFromBlueprint = async ({ overwrite }) => {
    if (!homography) return;
    const candidates = annotations.filter(annotation => (
      annotation.type === 'polygon'
      && !annotation.pending
      && annotation.blueprint_coordinates?.length >= 3
      && (overwrite || !annotation.panorama_coordinates?.length)
    ));
    if (candidates.length === 0) {
      notify(overwrite
        ? 'No hay lotes del plano disponibles para reproyectar.'
        : 'Todos los lotes del plano ya tienen ubicación en el panorama.', { variant: 'info' });
      return;
    }
    if (overwrite) {
      const ok = await confirm(
        `¿Reproyectar ${candidates.length} lote(s)? Se reemplazará su ubicación actual en el panorama.`,
        { title: 'Reproyectar lotes', confirmLabel: 'Reproyectar' }
      );
      if (!ok) return;
    }

    const projected = projectLotAnnotations(annotations, homography, { overwrite, mode });
    if (projected.count === 0) {
      notify('No se pudo proyectar ningún lote con la calibración actual.', { variant: 'error' });
      return;
    }

    pushHistory(annotations);
    setAnnotations(projected.annotations);
    notify(`${projected.count} lote(s) ${overwrite ? 'reproyectados' : 'proyectados'} al panorama.`, { variant: 'success' });
  };

  const handleUnimportSelected = async () => {
    if (!selectedMarker?.panorama_coordinates?.length) return;
    const ok = await confirm(
      `¿Quitar "${selectedMarker.tooltip || 'este lote'}" del panorama? El polígono del plano se conservará.`,
      { title: 'Quitar del panorama', confirmLabel: 'Quitar' }
    );
    if (!ok) return;
    pushHistory(annotations);
    setAnnotations(prev => unimportLotAnnotations(prev, [selectedId], mode));
  };

  const handleUnimportAll = async () => {
    const imported = annotations.filter(annotation => (
      annotation.type === 'polygon' && !annotation.pending && annotation.panorama_coordinates?.length
    ));
    if (imported.length === 0) {
      notify('No hay lotes importados en el panorama.', { variant: 'info' });
      return;
    }
    const ok = await confirm(
      `¿Quitar ${imported.length} lote(s) del panorama? Sus polígonos del plano se conservarán.`,
      { title: 'Quitar todos del panorama', confirmLabel: 'Quitar' }
    );
    if (!ok) return;
    const importedIds = new Set(imported.map(annotation => annotation.id));
    pushHistory(annotations);
    setAnnotations(prev => unimportLotAnnotations(prev, importedIds, mode));
  };

  const updateSelected = (key, value) => {
    setAnnotations(annotations.map(a =>
      a.id === selectedId ? { ...a, [key]: value } : a
    ));
  };

  const updateNestedSelected = (parent, key, value) => {
    setAnnotations(annotations.map(a =>
      a.id === selectedId ? { ...a, [parent]: { ...a[parent], [key]: value } } : a
    ));
  };

  const removeSelected = async () => {
    if (!selectedMarker) return;

    if (selectedMarker.type === 'calibration-point') {
      const ptId = selectedId.replace('calib-pt-', '');
      const idx = calibrationPoints.findIndex(p => p._id === ptId);
      if (idx !== -1) handleDeleteCalibrationPoint(idx);
      setSelectedId(null);
      return;
    }

    if (selectedMarker.type === 'polygon') {
      const isPersisted = Boolean(selectedMarker.uuid);
      const ok = await handleRemoveLot(selectedMarker);
      if (!ok) return;
      if (!isPersisted) pushHistory(annotations);
      setAnnotations(annotations.filter(a => a.id !== selectedId));
      if (isPersisted) {
        savedAnnotationsRef.current = savedAnnotationsRef.current.filter(a =>
          a.id !== selectedMarker.id && a.uuid !== selectedMarker.uuid
        );
        removeAnnotationFromHistory(selectedMarker.id, selectedMarker.uuid);
      }
      setSelectedId(null);
      return;
    }

    if (selectedMarker.type === 'poi') {
      const isPersisted = Boolean(selectedMarker.uuid);
      if (isPersisted) {
        const confirmed = await confirm(
          `¿Eliminar el POI "${selectedMarker.tooltip || selectedMarker.uuid}"? Esta acción no se puede deshacer.`,
          { title: 'Eliminar POI', danger: true, confirmLabel: 'Eliminar' }
        );
        if (!confirmed) return;
      } else {
        pushHistory(annotations);
      }

      const deleted = await handleDeletePoi(selectedMarker.uuid);
      if (deleted && isPersisted) {
        savedAnnotationsRef.current = savedAnnotationsRef.current.filter(a =>
          a.id !== selectedMarker.id && a.uuid !== selectedMarker.uuid
        );
        removeAnnotationFromHistory(selectedMarker.id, selectedMarker.uuid);
      }
      return;
    }

    pushHistory(annotations);
    setAnnotations(annotations.filter(a => a.id !== selectedId));
    setSelectedId(null);
  };

  // Keep keyboard shortcuts synced with the latest state without mutating refs during render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    keyboardStateRef.current = {
      removeSelected,
      undo,
      redo,
      setActiveTool,
      cancelPolygon,
      cancelRect,
      handleEscapeCalibration,
      handleEscapeGeoCalibration,
      activeTool,
      mode,
      saveAll: handleSaveAll,
      renderTestMode,
      onRenderTestModeChange: handleRenderTestModeChange,
      onToggleRenderStreetEditMode: toggleRenderStreetEditMode,
      onClearRenderShapes: clearRenderShapes,
      hasRenderShapes: renderManzanaShapes.length > 0 || renderCalleShapes.length > 0,
      hasStreetPathShapes: renderCalleShapes.some(s => s.axis),
    };
  });





  // Red de seguridad para cuando el loteo cargado no pertenece a la cuenta
  // activa (ver reset por logout más arriba): descarta el ?data=/&orgId=/&from=
  // de la URL y el loteo en memoria para volver al listado sin recargar la página.
  const handleBackToList = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('data');
    params.delete('orgId');
    params.delete('from');
    const cleaned = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState({}, '', cleaned);
    setLoteoId(null);
    setSelectedLoteo(null);
    setLoteoAccessDenied(false);
  };

  const handleLoteoSelect = (loteo) => {
    const dataUrl = `${API_BASE}/loteos/${loteo.id}/visor_data`;
    // Lleva la org activa al link para que, si se refresca o reabre esa
    // pestaña, siga sabiendo con qué org corresponde ese loteo (ver useAuth).
    const orgIdParam = activeOrgId ? `&orgId=${encodeURIComponent(activeOrgId)}` : '';
    const editorUrl = `${window.location.origin}${window.location.pathname}?data=${encodeURIComponent(dataUrl)}&from=list${orgIdParam}`;
    window.open(editorUrl, '_blank');
  };

  const params = new URLSearchParams(window.location.search);
  const fromList = params.get('from') === 'list';

  if (!accessToken) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // user === undefined mientras /auth/me todavía no respondió.
  if (user === undefined) {
    return null;
  }

  if (!selectedLoteo && (!hasDataParam || untrustedDirectLink)) {
    return (
      <LoteoList
        token={accessToken}
        onSelect={handleLoteoSelect}
        onAuthError={handleLogout}
        user={user}
        activeOrgId={activeOrgId}
        onOrgChange={setActiveOrgId}
      />
    );
  }

  if (loteoAccessDenied) {
    return (
      <div className="access-screen">
        <h2>No tenés acceso a este loteo</h2>
        <p>Este loteo no pertenece a tu cuenta. Pedile el acceso al dueño o volvé al listado.</p>
        <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={handleBackToList}>
          Volver al listado
        </button>
      </div>
    );
  }

  if (hasDataParam && !selectedLoteo) {
    return (
      <div className="access-screen">
        <div className="access-screen__spinner" />
        <p>Verificando acceso…</p>
      </div>
    );
  }

  // layersVisible es un filtro puramente visual (qué capas se ven en el
  // toolbar de Render) — se guarda en render_surfaces para persistir entre
  // sesiones, pero no debe contar como "cambio sin guardar".
  const { layersVisible: _renderSurfacesLayersVisible, ...renderSurfacesForDirtyCheck } = renderSurfaces;
  const { layersVisible: _savedLayersVisible, ...savedRenderSurfacesForDirtyCheck } = savedRenderSurfacesRef.current ?? {};
  const hasUnsavedChanges = (
    JSON.stringify(annotations) !== JSON.stringify(savedAnnotationsRef.current)
    || JSON.stringify(calibrationPoints) !== JSON.stringify(savedCalibrationRef.current)
    || JSON.stringify(geoCalibrationPoints) !== JSON.stringify(savedGeoCalibrationRef.current)
    || JSON.stringify(renderSurfacesForDirtyCheck) !== JSON.stringify(savedRenderSurfacesForDirtyCheck)
  );

  return (
    <div className="editor-container">
      <DraftBanner
        draft={pendingDraft}
        onRestore={(draft) => { setAnnotations(draft.annotations); setCalibrationPoints(draft.calibrationPoints ?? []); clearDraft(); }}
        onDiscard={clearDraft}
      />

      <SessionExpiredBanner
        visible={sessionExpiredDuringSave}
        onLogin={() => { clearSessionExpired(); handleLogout(); }}
      />

      <DocumentBar
        projectName={selectedLoteo?.name}
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={isSavingAll}
        onSave={handleSaveAll}
        onBack={fromList
          ? () => { window.location.href = window.location.origin + window.location.pathname; }
          : () => { window.opener?.focus(); window.close(); }
        }
        backTitle={fromList ? 'Volver al listado' : 'Volver a la plataforma'}
        onLogout={handleLogout}
        projectPanelOpen={projectPanelOpen}
        onToggleProjectPanel={() => setProjectPanelOpen(open => !open)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen(open => !open)}
      />

      <div className="editor-workspace">
        {activeTool === 'calibrate' ? (
          <CalibrationOverlay
            mode={mode}
            panoramaUrl={panoramaUrl}
            blueprintUrl={blueprintUrl}
            annotations={displayAnnotations}
            selectedId={selectedId}
            onClick={handleViewerClick}
            onMarkerSelect={(id) => setSelectedId(id.startsWith('ghost-') ? id.slice('ghost-'.length) : id)}
            onPolygonUpdate={handlePolygonUpdate}
            onMarkerDragEnd={handleMarkerDragEnd}
            onMarkerDrag={handleCalibrationDragLive}
            getPositionRef={getViewerPositionRef}
            onViewerReadyChange={setViewerReady}
            onPanoramaDimensions={setPanoramaDimensions}
            calibrationPoints={calibrationPoints}
            pendingBlueprintPoints={pendingBlueprintPoints}
            onCancelCalibration={cancelCalibration}
            onDeleteCalibrationPoint={handleDeleteCalibrationPoint}
            onClearCalibration={handleClearCalibration}
          />
        ) : activeTool === 'calibrate-geo' ? (
          <GeoCalibrationOverlay
            blueprintUrl={blueprintUrl}
            annotations={geoDisplayAnnotations}
            onBlueprintClick={handleViewerClick}
            latitude={selectedLoteo?.latitude}
            longitude={selectedLoteo?.longitude}
            geoCalibrationPoints={geoCalibrationPoints}
            pendingGeoBlueprintPoint={pendingGeoBlueprintPoint}
            onMapPointPicked={handleGeoMapPointPicked}
            geoPolygons={geoPolygons}
            onCancelCalibration={cancelGeoCalibration}
            onDeleteCalibrationPoint={handleDeleteGeoCalibrationPoint}
            onClearCalibration={handleClearGeoCalibration}
            onUpdateGeoPolygons={handleUpdateGeoPolygons}
          />
        ) : (
        <>
        <ProjectPanel
          open={projectPanelOpen}
          onClose={() => setProjectPanelOpen(false)}
          activeTab={projectPanelTab}
          onTabChange={setProjectPanelTab}
          projectName={selectedLoteo?.name ?? ''}
          snapThreshold={snapThreshold}
          onSaveSettings={handleSaveProjectSettings}
          panoramaUrl={panoramaUrl}
          blueprintUrl={blueprintUrl}
          mode={mode}
          annotations={annotations}
          selectedId={selectedId}
          onSelectAnnotation={(id) => {
            setSelectedId(id);
            setInspectorOpen(true);
          }}
          calibrationPoints={calibrationPoints}
          pendingBlueprintPoints={pendingBlueprintPoints}
          homography={homography}
          calibrationNotice={calibrationNotice}
          activeTool={activeTool}
          onEnterCalibration={() => handleToolChange('calibrate')}
          onCancelCalibration={cancelCalibration}
          onDeleteCalibrationPoint={handleDeleteCalibrationPoint}
          onClearCalibration={handleClearCalibration}
          autoDetectParams={autoDetectParams}
          onAutoDetectParamsChange={setAutoDetectParams}
          autoDetectLoading={autoDetectLoading}
          autoDetectError={autoDetectError}
          autoDetectLotsGenerated={autoDetectLotsGenerated}
          onProjectMissing={() => importPolygonsFromBlueprint({ overwrite: false })}
          onReprojectAll={() => importPolygonsFromBlueprint({ overwrite: true })}
          onRemoveAllFromPanorama={handleUnimportAll}
          homePosition={homePosition}
          northOffset={northOffset}
          onCaptureHome={handleCaptureHome}
          onResetHome={handleResetHome}
          onSetNorth={handleSetNorth}
          onResetNorth={handleResetNorth}
          canOrientPanorama={!!loteoId && !!panoramaUrl && mode === 'panorama' && viewerReady}
          loteoLatitude={selectedLoteo?.latitude}
          loteoLongitude={selectedLoteo?.longitude}
          geoCalibrationPoints={geoCalibrationPoints}
          onEnterGeoCalibration={() => handleToolChange('calibrate-geo')}
        />

        <main className="viewer-pane">
          <Toolbar
            activeTool={activeTool}
            onToolChange={handleToolChange}
            mode={mode}
            onModeChange={handleModeChange}
            panoramaUrl={panoramaUrl}
            blueprintUrl={blueprintUrl}
            drawingPolygon={drawingPolygon}
            onFinishPolygon={finishPolygon}
            onCancelPolygon={cancelPolygon}
            rectStart={rectStart}
            onCancelRect={cancelRect}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            calibrationPoints={calibrationPoints}
            renderTestMode={renderTestMode}
            onRenderTestModeChange={handleRenderTestModeChange}
            renderDrawingPtsCount={renderDrawingPts.length}
            onFinishRenderShape={finishRenderShape}
            onCancelRenderDrawing={cancelRenderDrawing}
            renderLayersVisible={renderLayersVisible}
            onToggleRenderLayer={(key) => setRenderLayersVisible(v => ({ ...v, [key]: !v[key] }))}
            renderColorMode={renderColorMode}
            onRenderColorModeChange={setRenderColorMode}
            renderManzanaOpacity={renderManzanaOpacity}
            onRenderManzanaOpacityChange={setRenderManzanaOpacity}
            hasRenderShapes={renderManzanaShapes.length > 0 || renderCalleShapes.length > 0}
            onClearRenderShapes={clearRenderShapes}
            renderStreetWidth={renderStreetWidth}
            onRenderStreetWidthChange={setRenderStreetWidth}
            renderStreetEditMode={renderStreetEditMode}
            onToggleRenderStreetEditMode={toggleRenderStreetEditMode}
            renderStreetEditTarget={renderStreetEditTarget}
            hasStreetPathShapes={renderCalleShapes.some(s => s.axis)}
            streetEditWidth={renderCalleShapes.find(s => s.id === renderStreetEditTarget)?.width ?? renderStreetWidth}
            onStreetEditWidthChange={(width) => renderStreetEditTarget && setStreetWidth(renderStreetEditTarget, width)}
          />

          <div className="viewer-surface">
            {isLoadingDefault ? (
              <div className="viewer-feedback">Cargando loteo…</div>
            ) : mode === 'blueprint' && blueprintUrl ? (
              <BlueprintEditor
                blueprintUrl={blueprintUrl}
                activeTool={activeTool}
                annotations={displayAnnotations}
                selectedId={selectedId}
                rectStart={rectStart}
                onClick={handleViewerClick}
                onMarkerSelect={(id) => {
                  if (activeTool === 'polygon' && id === 'temp-pt-0') finishPolygon();
                  else {
                    setSelectedId(id);
                    if (!id.startsWith('calib-')) setInspectorOpen(true);
                  }
                }}
                onPolygonUpdate={handlePolygonUpdate}
                onMarkerDragEnd={handleMarkerDragEnd}
              />
            ) : (mode === 'panorama' || mode === 'render') && panoramaUrl ? (
              <EditorViewer
                mode={mode}
                panoramaUrl={panoramaUrl}
                activeTool={activeTool}
                annotations={displayAnnotations}
                onClick={handleViewerClick}
                onMarkerSelect={(id) => {
                  if (activeTool === 'polygon' && id === 'temp-pt-0') finishPolygon();
                  else {
                    setSelectedId(id.startsWith('ghost-') ? id.slice('ghost-'.length) : id);
                    if (!id.startsWith('calib-')) setInspectorOpen(true);
                  }
                }}
                onPolygonUpdate={handlePolygonUpdate}
                onMarkerDragEnd={handleMarkerDragEnd}
                onMarkerDrag={handleCalibrationDragLive}
                getPositionRef={getViewerPositionRef}
                onViewerReadyChange={setViewerReady}
                onPanoramaDimensions={setPanoramaDimensions}
                renderTestMode={renderTestMode}
                renderDrawingPts={renderDrawingPts}
                onRenderDrawingPtsChange={setRenderDrawingPts}
                renderManzanaShapes={renderManzanaShapes}
                renderCalleShapes={renderCalleShapes}
                renderLayersVisible={renderLayersVisible}
                renderColorMode={renderColorMode}
                renderManzanaOpacity={renderManzanaOpacity}
                onFinishRenderShape={finishRenderShape}
                onCancelRenderDrawing={cancelRenderDrawing}
                renderStreetWidth={renderStreetWidth}
                renderStreetEditMode={renderStreetEditMode}
                renderStreetEditTarget={renderStreetEditTarget}
                onStreetShapeSelect={setRenderStreetEditTarget}
                onStreetAxisChange={setStreetAxis}
              />
            ) : (
              <div className="viewer-feedback viewer-feedback--empty">
                <ImageIcon size={40} />
                <h2>{mode === 'blueprint' ? 'Este loteo no tiene plano' : 'Falta cargar el panorama'}</h2>
                <p>Administrá las imágenes desde la ficha del loteo en el CRM.</p>
              </div>
            )}
          </div>

          {calibrationNotice && (
            <div className="calibration-complete-overlay" role="dialog" aria-modal="true" aria-labelledby="calibration-complete-title">
              <div className="calibration-complete-overlay__card">
                <div className="calibration-complete-overlay__icon"><Check size={20} /></div>
                <div className="calibration-complete-overlay__copy">
                  <strong id="calibration-complete-title">Calibración lista</strong>
                  <span>Ajustá los puntos en el plano si hace falta.</span>
                </div>
                <button
                  type="button"
                  className="editor-icon-btn"
                  onClick={() => setCalibrationNotice('')}
                  aria-label="Cerrar aviso de calibración"
                >
                  <X size={16} />
                </button>
                <button type="button" className="editor-btn editor-btn--primary" onClick={() => setCalibrationNotice('')}>
                  Entendido
                </button>
              </div>
            </div>
          )}
        </main>

        <InspectorPanel
          inspectorOpen={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          annotations={annotations}
          selectedMarker={selectedMarker}
          mode={mode}
          homography={homography}
          onImportFromBlueprint={handleImportFromBlueprint}
          onUnimportSelected={handleUnimportSelected}
          onDelete={removeSelected}
          updateSelected={updateSelected}
          updateNestedSelected={updateNestedSelected}
          pendingMode={pendingMode}
          onPendingModeChange={setPendingMode}
          isCreatingLote={isCreatingLote}
          onCreateLote={() => handleCreateLote(selectedMarker)}
          assignTargetId={assignTargetId}
          onAssignTargetChange={setAssignTargetId}
          isAssigning={isAssigning}
          onAssign={() => handleAssignToExistingLot(selectedMarker)}
          siblingStages={siblingStages}
          accessToken={accessToken}
          uploadFn={uploadFn}
          onPoiFieldChange={(field, value) => {
            setAnnotations(annotations.map(annotation =>
              annotation.id === selectedId
                ? { ...annotation, [field]: value, ...(field === 'title' ? { tooltip: value } : {}) }
                : annotation
            ));
          }}
        />
        </>
        )}
      </div>
    </div>
  );
}

export default App;

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
import { projectPolygon, projectLotAnnotations, unimportLotAnnotations } from './utils/projection';
import { isCalibrationPairTooClose } from './utils/calibration';
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
  const { pushHistory, undo, redo, canUndo, canRedo, removeAnnotationFromHistory } = useHistory({ annotations, setAnnotations, calibrationPoints, setCalibrationPoints });
  const isDraggingPolygonRef = useRef(false);
  const preDragAnnotationsRef = useRef(null);
  const isDraggingCalibrationRef = useRef(false);
  const keyboardStateRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drawingPolygon, setDrawingPolygon] = useState([]);
  // Rectángulo de 2 clicks: guarda la primera esquina mientras se espera la opuesta
  const [rectStart, setRectStart] = useState(null);

  const [panoramaUrl, setPanoramaUrl] = useState(null);
  const [panoramaDimensions, setPanoramaDimensions] = useState(null);
  const [blueprintUrl, setBlueprintUrl] = useState(null);
  const [mode, setMode] = useState('panorama'); // 'panorama' or 'blueprint'

  // Derived projector — recomputed whenever calibration points or panorama
  // dimensions change. Fits the homography in gnomonic (rectilinear) space,
  // not directly in equirectangular texture space — see panoramaProjection.js.
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
  // Snapshot of annotations as last saved/loaded — used to diff before saving
  const savedAnnotationsRef = useRef([]);
  const savedCalibrationRef = useRef([]);
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
  } = useSaveAll({ annotations, setAnnotations, token: accessToken, loteoId, savedAnnotationsRef, onAfterSave: clearDraft, calibrationPoints, savedCalibrationRef });



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
              const imgRes = await fetch(data.panoramaUrl);
              if (imgRes.ok) {
                const blob = await imgRes.blob();
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
              setPanoramaUrl(data.panoramaUrl);
            }
          }
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
          notify(`No se pudo cargar el JSON desde la URL: ${err.message}`, { variant: 'error' });
        })
        .finally(() => setIsLoadingDefault(false));
      return;
    }

    setIsLoadingDefault(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Etapas hermanas del grupo (para que un POI pueda navegar a otra etapa).
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
        if (!me?.grupo_id) { setSiblingStages([]); return; }
        const siblings = data.items
          .filter(l => l.grupo_id === me.grupo_id && l.id !== loteoId)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
          .map(l => ({ id: l.id, name: l.name, tipo: l.tipo }));
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
  };

  // Clear in-progress drawing when switching modes — coordinates are not transferable between spaces
  // Exception: calibrate drives mode changes intentionally, so don't reset it
  useEffect(() => {
    if (activeTool === 'calibrate') return;
    // Mode changes invalidate an in-progress polygon because the coordinate spaces differ.
    setDrawingPolygon([]);
    setRectStart(null);
    setActiveTool('select');
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      activeTool,
      mode,
      saveAll: handleSaveAll,
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

  const hasUnsavedChanges = (
    JSON.stringify(annotations) !== JSON.stringify(savedAnnotationsRef.current)
    || JSON.stringify(calibrationPoints) !== JSON.stringify(savedCalibrationRef.current)
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
            ) : mode === 'panorama' && panoramaUrl ? (
              <EditorViewer
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

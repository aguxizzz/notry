import { useState, useRef, useEffect, useMemo } from 'react';
import { visorDataUrl } from './api/loteos';
import { createUploadFn } from './api/upload';
import { useAuth } from './hooks/useAuth';
import { useCalibration } from './hooks/useCalibration';
import { useDraft } from './hooks/useDraft';
import { useLotDrafts } from './hooks/useLotDrafts';
import { insertIntoSaved } from './utils/lotDrafts';
import { useGeoCalibration } from './hooks/useGeoCalibration';
import { useGeoSurfaces } from './hooks/useGeoSurfaces';
import { useHistory } from './hooks/useHistory';
import { useLoteoData } from './hooks/useLoteoData';
import { useLotOperations } from './hooks/useLotOperations';
import { usePoiOperations } from './hooks/usePoiOperations';
import { useSaveAll } from './hooks/useSaveAll';
import { useDisplayAnnotations } from './hooks/useDisplayAnnotations';
import { projectPolygon, projectLotAnnotations, unimportLotAnnotations } from './utils/projection';
import {
  hasLocationIn, isCallout, newPendingLot, normalizeApiAnnotation, withAnchor, withShapeCoords,
} from './utils/annotationModel';
import {
  FIRST_TEMP_POINT_ID, isCalibrationMarker, parseCalibPointId, selectableAnnotationId,
} from './utils/markerIds';
import { detectLotPolygon, getDetectionOverlay } from './utils/lotDetectionClient';
import { DEFAULT_RENDER_SURFACES } from './utils/renderSurfaces';
import { detectChanges, hasUnsavedChanges } from './utils/editorChanges';
import { useRenderSurfaces } from './hooks/useRenderSurfaces';
import { useUIFeedback } from './hooks/useUIFeedback';
import { Check, Image as ImageIcon, X } from 'lucide-react';
import EditorViewer from './components/EditorViewer';
import BlueprintEditor from './components/BlueprintEditor';
import LoginScreen from './components/LoginScreen';
import Loader from './components/Loader';
import LoteoList from './components/LoteoList';
import DraftBanner from './components/DraftBanner';
import SessionExpiredBanner from './components/SessionExpiredBanner';
import Toolbar from './components/Toolbar';
import InspectorPanel from './components/InspectorPanel';
import DocumentBar from './components/DocumentBar';
import ProjectPanel from './components/ProjectPanel';
import CalibrationOverlay from './components/CalibrationOverlay';
import GeoCalibrationOverlay from './components/GeoCalibrationOverlay';
import SatelliteView from './components/SatelliteView';
import './App.css';

function App() {
  const { confirm, notify } = useUIFeedback();
  const [activeTool, setActiveTool] = useState('select');
  const [annotations, setAnnotations] = useState([]);
  const [mode, setMode] = useState('panorama'); // 'panorama' | 'blueprint' | 'render' | 'satellite'
  const { token: accessToken, user, handleLogin, handleLogout, activeOrgId, setActiveOrgId } = useAuth();
  const getViewerPositionRef = useRef(null);
  // Snapshot of annotations as last saved/loaded — used to diff before saving
  const savedAnnotationsRef = useRef([]);
  // Arranca igual que el estado inicial de useRenderSurfaces, para que el diff
  // no se dispare en loteos que nunca tocaron el modo Render.
  const savedRenderSurfacesRef = useRef(DEFAULT_RENDER_SURFACES);

  // Todos los cambios que se pueden deshacer guardan snapshot antes de aplicarse.
  const snapshotHistory = () => pushHistory(annotations);

  const loteo = useLoteoData({
    accessToken, user, activeOrgId, notify, getViewerPositionRef,
    onDataLoaded: (data, ctx) => applyLoadedData(data, ctx),
  });
  const { loteoId, selectedLoteo, panoramaUrl, blueprintUrl } = loteo;

  // Pares plano↔panorama y la proyección que sale de ellos (ver useCalibration).
  const calibration = useCalibration({
    mode, activeTool, setActiveTool,
    panoramaDimensions: loteo.panoramaDimensions,
    onBeforeChange: snapshotHistory,
    confirm,
    goToView: view => switchView(view),
  });
  const { homography } = calibration;

  // Modo Render: manzanas/calles sobre el panorama (ver useRenderSurfaces).
  const render = useRenderSurfaces({ homography, onBeforeChange: snapshotHistory });
  const { endWidthDrag: endStreetWidthDrag } = render;

  // Pares plano↔lat/lng para el modo satelital (ver useGeoCalibration).
  const geo = useGeoCalibration({
    activeTool, setActiveTool, annotations, setAnnotations, onBeforeChange: snapshotHistory, confirm, notify,
  });
  // Manzanas/calles dibujadas en la vista Satélite (todavía sin guardar: solo
  // viven en el historial de la sesión).
  const geoSurfaces = useGeoSurfaces({ geoPoints: geo.points, onBeforeChange: snapshotHistory });

  const { pushHistory, undo, redo, canUndo, canRedo, removeAnnotationFromHistory } = useHistory({
    slices: {
      annotations: [annotations, setAnnotations],
      calibrationPoints: [calibration.points, calibration.setPoints],
      geoCalibrationPoints: [geo.points, geo.setPoints],
      geoSurfaces: [geoSurfaces.surfaces, geoSurfaces.setSurfaces],
      renderManzanaShapes: [render.manzanas, render.setManzanas],
      renderCalleShapes: [render.calles, render.setCalles],
    },
  });

  // Lo editable de ahora contra lo último guardado/cargado: una sola
  // detección para el indicador, el borrador y el "Guardar todo".
  const editorState = {
    annotations,
    calibrationPoints: calibration.points,
    geoCalibrationPoints: geo.points,
    renderSurfaces: render.surfaces,
  };
  const changes = detectChanges(editorState, {
    annotations: savedAnnotationsRef.current,
    calibrationPoints: calibration.savedRef.current,
    geoCalibrationPoints: geo.savedRef.current,
    renderSurfaces: savedRenderSurfacesRef.current,
  });
  const isDirty = hasUnsavedChanges(changes);

  const isDraggingPolygonRef = useRef(false);
  const preDragAnnotationsRef = useRef(null);
  const keyboardStateRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drawingPolygon, setDrawingPolygon] = useState([]);
  // Rectángulo de 2 clicks: guarda la primera esquina mientras se espera la opuesta
  const [rectStart, setRectStart] = useState(null);
  // Auto-detect mode: detection parameters and state
  const [autoDetectParams, setAutoDetectParams] = useState({ threshold: 128, maxTextDim: 20, epsilon: 2.0 });
  const [autoDetectLoading, setAutoDetectLoading] = useState(false);
  const [autoDetectError, setAutoDetectError] = useState(null);
  const [autoDetectLotsGenerated, setAutoDetectLotsGenerated] = useState(0);
  // What the detector "sees" (lines vs. ignored text), drawn over the plano while the tool is active.
  const [autoDetectOverlay, setAutoDetectOverlay] = useState(null);
  const [autoDetectProcessing, setAutoDetectProcessing] = useState(false);

  const [viewerReady, setViewerReady] = useState(false);
  const uploadFn = useMemo(() => createUploadFn(accessToken, handleLogout), [accessToken, handleLogout]);
  const { pendingDraft, loadDraft, clearDraft } = useDraft({
    loteoId, state: editorState, isDirty,
    panoramaDimensions: loteo.panoramaDimensions,
  });
  // Auto-detected pending lots stored on the back (not the localStorage draft above).
  const lotDrafts = useLotDrafts({
    annotations, setAnnotations, savedAnnotationsRef,
    token: accessToken, loteoId, notify, onAuthError: handleLogout,
    // Pendings that the MCP filled in or discarded: out of the undo history (an undo would
    // bring back a pending that no longer exists) and out of the selection.
    onServerChanges: ({ goneIds }) => {
      if (goneIds.length === 0) return;
      removeAnnotationFromHistory(...goneIds);
      setSelectedId(current => (goneIds.includes(current) ? null : current));
    },
  });
  const {
    pendingMode, setPendingMode,
    assignTargetId, setAssignTargetId,
    handleCreateLote,
    handleAssignToExistingLot,
    handleDeleteLot,
  } = useLotOperations({
    annotations, setAnnotations,
    setSelectedId,
    token: accessToken,
    loteoId, mode,
    onAuthError: handleLogout,
    // El lote ya está en la base: entra a la foto de "lo último guardado"
    // para no contar como cambio pendiente. Esa comparación es del array
    // entero (JSON), así que va en la misma posición relativa que en pantalla:
    // detrás de los que ya estaban guardados y lo precedían.
    // A lot made from a server draft shares its temp id with the draft's saved entry: that
    // entry goes first (the back already deleted the draft), then the lot takes its place.
    onAfterCreate: (createdLot, annotationsAtCreate, tempId) => {
      const saved = savedAnnotationsRef.current.filter(a => a.id !== tempId);
      savedAnnotationsRef.current = insertIntoSaved(saved, createdLot, annotationsAtCreate, tempId);
      // A poll that read the back mid-create would still list this lot's draft.
      lotDrafts.noteLocalChange();
      clearDraft();
    },
    // La forma ya quedó en la base: se copia a la foto de "lo último guardado"
    // para que no aparezca como cambio pendiente. Solo esa forma, no el lote
    // entero, así otras ediciones sin guardar del lote siguen contando.
    onAfterAssign: (lotId, assignedMode, coords, pending) => {
      savedAnnotationsRef.current = savedAnnotationsRef.current.map(a => (
        a.id === lotId ? withShapeCoords(a, assignedMode, coords) : a
      ));
      // The pending shape now belongs to that lot, so its server draft has no reason to stay.
      if (pending?.draftId) lotDrafts.discardDraft(pending);
    },
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
  // Capas ocultas desde el panel de Contenido ({ polygon, poi, text }) y el
  // elemento con el mouse encima en ese panel, que se resalta en la vista.
  const [hiddenLayers, setHiddenLayers] = useState({});
  const [hoveredId, setHoveredId] = useState(null);
  const {
    isSavingAll,
    sessionExpiredDuringSave, clearSessionExpired,
    handleSaveAll,
  } = useSaveAll({
    annotations, setAnnotations, token: accessToken, loteoId, savedAnnotationsRef, onAfterSave: clearDraft,
    changes,
    calibrationPoints: calibration.points, savedCalibrationRef: calibration.savedRef,
    geoCalibrationPoints: geo.points, savedGeoCalibrationRef: geo.savedRef,
    renderSurfaces: render.surfaces, savedRenderSurfacesRef,
  });

  // Lo editable que trae el loteo (lo llama useLoteoData al terminar de cargar).
  function applyLoadedData(data, { loteoId: loadedLoteoId, panoramaDimensions }) {
    if (Array.isArray(data.annotations)) {
      const mappedAnnotations = data.annotations.map(normalizeApiAnnotation);
      setAnnotations(mappedAnnotations);
      savedAnnotationsRef.current = mappedAnnotations;
      // Check for draft from previous session
      loadDraft(loadedLoteoId, panoramaDimensions);
      // visor_data is public and only has real lots; pending ones come from the drafts endpoint.
      lotDrafts.loadServerDrafts(loadedLoteoId);
    }
    if (Array.isArray(data.calibrationPoints) && data.calibrationPoints.length > 0) {
      calibration.load(data.calibrationPoints);
    }
    if (Array.isArray(data.geoCalibrationPoints) && data.geoCalibrationPoints.length > 0) {
      geo.load(data.geoCalibrationPoints);
    }
    if (data.renderSurfaces && typeof data.renderSurfaces === 'object') {
      savedRenderSurfacesRef.current = render.load(data.renderSurfaces);
    }
  }

  // Reset pending panel state when selection changes
  useEffect(() => {
    setPendingMode('create');
    setAssignTargetId('');
  }, [selectedId, setAssignTargetId, setPendingMode]);



  const handleViewerClick = async (textureX, textureY) => {
    if (activeTool === 'calibrate-geo') {
      // La mitad plano de un par de calibración geo (la otra es el click en el mapa).
      geo.pickBlueprintPoint([textureX, textureY]);
      return;
    }

    if (activeTool === 'calibrate') {
      await calibration.handleClick([textureX, textureY]);
      return;
    }

    if (activeTool === 'rect') {
      if (!rectStart) {
        setRectStart([textureX, textureY]);
      } else {
        const [x1, y1] = rectStart;
        const newId = `polygon-${crypto.randomUUID()}`;
        const newAnn = newPendingLot({
          id: newId,
          mode,
          coords: [[x1, y1], [textureX, y1], [textureX, textureY], [x1, textureY]],
        });
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
    let newAnn;
    if (activeTool === 'poi') {
      newAnn = withAnchor({
        id: newId,
        type: 'poi',
        variant: 'callout',
        pending: true,
        tooltip: 'Nuevo lugar',
        color: '#c5a059',
        callout_stem_height: 96,
      }, mode, [textureX, textureY]);
    } else if (activeTool === 'text') {
      newAnn = {
        id: newId,
        type: 'text',
        position: { textureX, textureY },
        tooltip: 'Texto',
        textColor: '#ffffff',
        bgColor: '#ffffff',
        bgOpacity: 0,
        fontSize: 14,
      };
    } else {
      return;
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
    const newId = `polygon-${Date.now()}`;
    const newAnn = newPendingLot({ id: newId, mode, coords: drawingPolygon });
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

  const handleAutoDetectClick = async (textureX, textureY) => {
    if (!blueprintUrl) return;
    setAutoDetectLoading(true);
    setAutoDetectError(null);

    // textureX/Y already come normalized [0, 1] from BlueprintEditor.
    // Masks are cached by params, so a click right after the preview is instant.
    const result = await detectLotPolygon(blueprintUrl, textureX, textureY, autoDetectParams);

    if (!result.success) {
      setAutoDetectError(result.error);
      setAutoDetectLoading(false);
      return;
    }

    // result.coordinates ya viene normalizado [0, 1] (espacio del plano).
    const newId = `lot-${crypto.randomUUID()}`;
    const newAnn = newPendingLot({
      id: newId,
      mode: 'blueprint',
      coords: result.coordinates,
      tooltip: `Lote Auto ${autoDetectLotsGenerated + 1}`,
      // Sin svgStyle propio: usa el naranja punteado de todo lote pendiente.
      // Antes era verde, y se confundía con un lote ya creado y disponible.
    });

    pushHistory(annotations);
    setAnnotations([...annotations, newAnn]);
    setSelectedId(newId);
    // Stored on the back right away, so it survives a reload and the MCP can fill it in.
    lotDrafts.persistDetected(newAnn);
    setAutoDetectLotsGenerated(prev => prev + 1);
    setAutoDetectLoading(false);
    setInspectorOpen(true);
  };

  // Recompute the detection overlay when the tool opens or a slider is released.
  // No debounce needed: AutoDetectInspector only sends the value once the drag ends.
  const autoDetectActive = activeTool === 'autodetect' && !!blueprintUrl;
  const { threshold: adThreshold, maxTextDim: adMaxTextDim } = autoDetectParams;
  useEffect(() => {
    if (!autoDetectActive) {
      setAutoDetectOverlay(null);
      // A run cancelled mid-way never clears its own flag, so leaving the tool does.
      setAutoDetectProcessing(false);
      return;
    }
    let cancelled = false;
    // The detection runs in a Web Worker (lotDetectionClient), so the cover
    // paints right away and stays up for the whole computation.
    setAutoDetectProcessing(true);
    (async () => {
      try {
        const overlay = await getDetectionOverlay(blueprintUrl, { threshold: adThreshold, maxTextDim: adMaxTextDim });
        if (cancelled) return;
        setAutoDetectOverlay(overlay);
        // Lift the cover only after the new overlay is on screen: two frames = React
        // commits + BlueprintEditor draws it, then the browser paints that frame.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      } catch (err) {
        if (!cancelled) setAutoDetectError(err.message);
      } finally {
        if (!cancelled) setAutoDetectProcessing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [autoDetectActive, blueprintUrl, adThreshold, adMaxTextDim]);

  // Cambio de vista pedido por el usuario: avisa si hay marcadores que no
  // existen en la vista destino.
  const handleModeChange = async (nextMode) => {
    if (nextMode === mode) return;
    // En Satélite los lotes salen del plano por la calibración: no hay
    // ubicación propia que pueda faltar.
    if (nextMode === 'satellite') { switchView(nextMode); return; }
    // Lotes ↔ Superficies es el mismo panorama: las ubicaciones no cambian.
    const panoramaModes = ['panorama', 'render'];
    if (panoramaModes.includes(mode) && panoramaModes.includes(nextMode)) { switchView(nextMode); return; }
    const spatialAnnotations = annotations.filter(a => (
      !a.pending
      && (a.type === 'polygon' || (nextMode === 'panorama' && a.type === 'poi'))
    ));
    const missing = spatialAnnotations.filter(a => !hasLocationIn(a, nextMode));
    if (missing.length > 0) {
      const ok = await confirm(
        `${missing.length} marcador(es) no tienen ubicación en la vista ${nextMode === 'blueprint' ? 'Plano' : 'Panorama'}.\n` +
        `Aparecerán vacíos. ¿Continuar de todas formas?`,
        { title: 'Marcadores sin ubicación', confirmLabel: 'Continuar' }
      );
      if (!ok) return;
    }
    switchView(nextMode);
  };

  // Único cambio de vista (toolbar, calibración, autodetección). Lo que se
  // está dibujando no pasa de un espacio de coordenadas al otro, así que se
  // descarta junto con la herramienta — salvo calibrar, que trabaja en las
  // dos vistas. Quien entra a una herramienta con vista propia llama esto
  // ANTES de setActiveTool, para que la herramienta nueva gane.
  const switchView = (nextMode) => {
    if (nextMode === mode) return;
    setSelectedId(null);
    // Salir de Render descarta la herramienta de dibujo y el trazo en curso.
    if (mode === 'render') render.resetDrawing();
    if (mode === 'satellite') geoSurfaces.reset();
    setMode(nextMode);
    if (activeTool !== 'calibrate') {
      setDrawingPolygon([]);
      setRectStart(null);
      setActiveTool('select');
    }
  };

  // Entrada a una herramienta (toolbar, panel, atajos): los paneles y la
  // vista siguen a la herramienta venga de donde venga. Los flujos que
  // terminan y vuelven a Seleccionar limpian lo suyo y usan el setter directo.
  // (El lote o punto pendiente de calibración lo resetean useCalibration /
  // useGeoCalibration.)
  const handleToolChange = (tool) => {
    // Recién entrando: re-clickear Calibrar a mitad de un lote no lo saca del panorama.
    if (tool === 'calibrate' && activeTool !== 'calibrate' && blueprintUrl) switchView('blueprint');
    if (tool === 'autodetect') switchView('blueprint');
    // Calibrar el satélite se abre desde su vista y vuelve a ella al salir,
    // también si se entra desde el panel del proyecto estando en otra.
    if (tool === 'calibrate-geo') switchView('satellite');
    setActiveTool(tool);
    if (tool !== 'polygon') setDrawingPolygon([]);
    if (tool !== 'rect') setRectStart(null);
    if (tool === 'calibrate' || tool === 'calibrate-geo' || tool === 'autodetect') {
      setSelectedId(null);
      setProjectPanelOpen(true);
      setProjectPanelTab('project');
    }
    if (tool === 'calibrate') calibration.setNotice('');
    if (tool === 'autodetect') {
      setAutoDetectError(null);
      setAutoDetectLotsGenerated(0);
    }
  };

  // Si el plano desaparece (se borró desde el panel) estando en esa vista o en
  // Satélite (que depende de él), se vuelve al panorama. Es lo único que
  // cambia la vista desde afuera.
  useEffect(() => {
    if (!blueprintUrl && (mode === 'blueprint' || mode === 'satellite')) {
      setSelectedId(null);
      setMode('panorama');
      setDrawingPolygon([]);
      setRectStart(null);
      setActiveTool('select');
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
      // El snapshot del slider de ancho ya se guardó en su primer tick: acá
      // solo se cierra el gesto (ver useRenderSurfaces.setEditTargetWidth).
      endStreetWidthDrag();
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, [pushHistory, endStreetWidthDrag]);

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
          keyboardStateRef.current.handleEscapeGeoCalibration();
        } else if (keyboardStateRef.current?.mode === 'satellite') {
          // Corta el trazo, después la selección, después vuelve a Seleccionar.
          keyboardStateRef.current.geoSurfaces.handleEscape();
        } else if (keyboardStateRef.current?.activeTool === 'autodetect') {
          keyboardStateRef.current?.setActiveTool('select');
        } else if (keyboardStateRef.current?.activeTool === 'rect') {
          keyboardStateRef.current?.cancelRect();
        } else {
          keyboardStateRef.current?.cancelPolygon();
        }
        if (keyboardStateRef.current?.mode === 'render') keyboardStateRef.current.render.clearSelection();
        return;
      }
      // Vista Satélite (sin la calibración abierta): atajos de manzanas/calles
      // en vez de los de lotes, que acá no se dibujan.
      if (keyboardStateRef.current?.mode === 'satellite' && keyboardStateRef.current.activeTool !== 'calibrate-geo') {
        const { geoSurfaces: gs } = keyboardStateRef.current;
        if (e.key === 'Enter') { e.preventDefault(); gs.finish(); return; }
        // A medio trazo, Ctrl+Z saca el último punto (el trazo no está en el historial).
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey && gs.drawing.length) {
          e.preventDefault();
          gs.handleDeleteKey();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); gs.handleDeleteKey(); return; }
        const SATELLITE_KEYS = { v: 'select', 1: 'manzana', 2: 'calle' };
        const key = e.key.toLowerCase();
        if (!e.ctrlKey && !e.metaKey && (key in SATELLITE_KEYS || key === '3')) {
          // Sin vincular no hay herramientas; igual se corta acá para que no
          // caigan a las de lotes ("3", Texto del panorama, tampoco existe acá).
          if (gs.canDraw && SATELLITE_KEYS[key]) gs.setTool(SATELLITE_KEYS[key]);
          return;
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        // En Render, primero la manzana/calle seleccionada; si no hay, el lote.
        if (keyboardStateRef.current?.mode === 'render' && keyboardStateRef.current.render.deleteSelected()) return;
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
        const { render: r } = keyboardStateRef.current;
        if (key === '1') {
          r.toggleTool('manzana');
          return;
        }
        if (key === '2') {
          r.toggleTool('calle');
          return;
        }
        if (key === '3') {
          if (r.hasStreetPaths) r.toggleStreetEditMode();
          return;
        }
        if (key === 'l') {
          if (r.hasShapes) r.clearShapes();
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
    calibrationPoints: calibration.points, pendingBlueprintPoints: calibration.pending, homography,
    panoramaDimensions: loteo.panoramaDimensions,
    hiddenTypes: hiddenLayers,
  });

  const handlePolygonUpdate = (markerId, newPolygonPixels) => {
    if (!isDraggingPolygonRef.current) {
      isDraggingPolygonRef.current = true;
      preDragAnnotationsRef.current = annotations;
    }
    setAnnotations(prevAnnotations => prevAnnotations.map(a => (
      a.id === markerId ? withShapeCoords(a, mode, newPolygonPixels) : a
    )));
  };

  // One-shot shape edit (e.g. deleting a vertex): unlike handlePolygonUpdate it
  // isn't part of a drag, so it goes to history right away instead of on pointerup.
  const handlePolygonCommit = (markerId, newPolygonPixels) => {
    pushHistory(annotations);
    setAnnotations(prevAnnotations => prevAnnotations.map(a => (
      a.id === markerId ? withShapeCoords(a, mode, newPolygonPixels) : a
    )));
  };

  const handleMarkerDragEnd = (markerId, textureX, textureY) => {
    if (calibration.dragEnd(markerId, textureX, textureY)) return;

    pushHistory(annotations);
    setAnnotations(prevAnnotations => prevAnnotations.map(a => {
      if (a.id !== markerId) return a;
      if (isCallout(a)) return withAnchor(a, mode, [textureX, textureY]);
      return { ...a, position: { textureX, textureY } };
    }));
  };

  const handleImportFromBlueprint = () => {
    const newPanoCoords = projectPolygon(selectedMarker?.blueprint_coordinates, homography);
    if (!newPanoCoords) return;
    pushHistory(annotations);
    setAnnotations(prev => prev.map(a => (
      a.id === selectedId ? withShapeCoords(a, 'panorama', newPanoCoords) : a
    )));
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

    const projected = projectLotAnnotations(annotations, homography, { overwrite });
    if (projected.count === 0) {
      notify('No se pudo proyectar ningún lote con la calibración actual.', { variant: 'error' });
      return;
    }

    pushHistory(annotations);
    setAnnotations(projected.annotations);
    notify(`${projected.count} lote(s) ${overwrite ? 'reproyectados' : 'proyectados'} al panorama.`, { variant: 'success' });
  };

  // "Quitar de esta vista": el lote sigue existiendo (con su geometría en la
  // otra vista) y vuelve a aparecer en la lista de lotes sin ubicación acá.
  const removeSelectedFromView = (view = mode) => {
    if (!selectedId) return;
    pushHistory(annotations);
    setAnnotations(prev => unimportLotAnnotations(prev, [selectedId], view));
    // Desde el plano se puede sacar del panorama sin que deje de verse acá.
    if (view === mode) setSelectedId(null);
  };

  const deleteSelectedLot = () => handleDeleteLot(selectedMarker, {
    onDeleted: (lot) => {
      savedAnnotationsRef.current = savedAnnotationsRef.current.filter(a => a.id !== lot.id && a.uuid !== lot.uuid);
      removeAnnotationFromHistory(lot.id, lot.uuid);
    },
  });

  const handleUnimportAll = async () => {
    const imported = annotations.filter(annotation => (
      annotation.type === 'polygon' && !annotation.pending && annotation.panorama_coordinates?.length
    ));
    if (imported.length === 0) {
      notify('No hay lotes importados en el panorama.', { variant: 'info' });
      return;
    }
    const ok = await confirm(
      `¿Sacar ${imported.length} polígono(s) del panorama? Los lotes NO se borran: siguen en la base con su polígono del plano, listos para volver a proyectar. Se deshace con Ctrl+Z.`,
      { title: 'Desubicar del panorama', confirmLabel: 'Desubicar' }
    );
    if (!ok) return;
    const importedIds = new Set(imported.map(annotation => annotation.id));
    pushHistory(annotations);
    setAnnotations(prev => unimportLotAnnotations(prev, importedIds));
  };

  // Updaters funcionales: un inspector puede cambiar varios campos en el
  // mismo evento (ej. un estilo predefinido de texto).
  const updateSelected = (key, value) => {
    setAnnotations(prev => prev.map(a =>
      a.id === selectedId ? { ...a, [key]: value } : a
    ));
  };

  const updateNestedSelected = (parent, key, value) => {
    setAnnotations(prev => prev.map(a =>
      a.id === selectedId ? { ...a, [parent]: { ...a[parent], [key]: value } } : a
    ));
  };

  // Click sobre un marker en el plano o el panorama. Clickear el primer punto
  // del trazo cierra el polígono; un fantasma selecciona su lote real; los
  // puntos de calibración se seleccionan sin abrir el inspector.
  const handleMarkerSelect = (markerId) => {
    if (activeTool === 'polygon' && markerId === FIRST_TEMP_POINT_ID) {
      finishPolygon();
      return;
    }
    setSelectedId(selectableAnnotationId(markerId));
    if (!isCalibrationMarker(markerId)) setInspectorOpen(true);
  };

  const removeSelected = async () => {
    // Los puntos de calibración no son anotaciones (selectedMarker nunca los
    // incluye): se resuelven por id antes de mirar selectedMarker.
    const calibPairId = parseCalibPointId(selectedId);
    if (calibPairId) {
      calibration.deletePointById(calibPairId);
      setSelectedId(null);
      return;
    }

    if (!selectedMarker) return;

    // Lote cuyo POST /lots todavía no volvió: si se borrara de la pantalla
    // ahora, quedaría creado en la base sin que se vea. Se espera al id real.
    if (selectedMarker.creating) {
      notify('El lote se está creando, probá de nuevo en un segundo.', { variant: 'info' });
      return;
    }

    // Lote guardado: Supr (y "Borrar" por default) lo quita solo de esta
    // vista — se deshace con Ctrl+Z. Borrarlo de la base es "Eliminar lote".
    if (selectedMarker.type === 'polygon' && selectedMarker.uuid) {
      removeSelectedFromView();
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

    // Pending lot stored on the back: deleting it there can't be undone, so it also leaves
    // the undo history (an undo would bring back a draft the back no longer has).
    if (selectedMarker.draftId) {
      setAnnotations(prev => prev.filter(a => a.id !== selectedMarker.id));
      setSelectedId(null);
      if (await lotDrafts.discardDraft(selectedMarker)) {
        removeAnnotationFromHistory(selectedMarker.id);
      } else {
        setAnnotations(prev => [...prev, selectedMarker]);
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
      setActiveTool: handleToolChange,
      cancelPolygon,
      cancelRect,
      handleEscapeCalibration: calibration.escape,
      handleEscapeGeoCalibration: geo.escape,
      activeTool,
      mode,
      saveAll: handleSaveAll,
      render,
      geoSurfaces,
    };
  });


  const handleLoteoSelect = (item) => {
    const dataUrl = visorDataUrl(item.id);
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
    return <Loader fullscreen label="Preparando el editor…" />;
  }

  if (!selectedLoteo && (!loteo.hasDataParam || loteo.untrustedDirectLink)) {
    return (
      <LoteoList
        token={accessToken}
        onSelect={handleLoteoSelect}
        onAuthError={handleLogout}
        onLogout={handleLogout}
        user={user}
        activeOrgId={activeOrgId}
        onOrgChange={setActiveOrgId}
      />
    );
  }

  if (loteo.loteoAccessDenied) {
    return (
      <div className="access-screen">
        <h2>No tenés acceso a este loteo</h2>
        <p>Este loteo no pertenece a tu cuenta. Pedile el acceso al dueño o volvé al listado.</p>
        <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={loteo.backToList}>
          Volver al listado
        </button>
      </div>
    );
  }

  if (loteo.hasDataParam && !selectedLoteo) {
    return <Loader fullscreen label="Abriendo loteo…" />;
  }

  // Borradores viejos (v2) no traen geo-calibración ni Render: eso queda
  // como vino del servidor.
  const restoreDraft = (draft) => {
    // The local copy may predate drafts filled in or discarded elsewhere (the MCP, another tab).
    setAnnotations(lotDrafts.reconcileRestored(draft.annotations ?? []));
    calibration.setPoints(draft.calibrationPoints ?? []);
    if (Array.isArray(draft.geoCalibrationPoints)) geo.setPoints(draft.geoCalibrationPoints);
    if (draft.renderSurfaces) render.load(draft.renderSurfaces);
    clearDraft();
  };

  return (
    <div className="editor-container">
      {/* Covers the whole editor while auto-detect reprocesses the plano, so nobody
          edits lots against an overlay that's about to change. */}
      {autoDetectProcessing && (
        <div className="processing-cover" role="status" aria-live="polite">
          <p className="processing-cover__title">Procesando el plano…</p>
          <p className="processing-cover__sub">Aplicando los ajustes de detección</p>
        </div>
      )}
      <DraftBanner
        draft={pendingDraft}
        onRestore={restoreDraft}
        onDiscard={clearDraft}
      />

      <SessionExpiredBanner
        visible={sessionExpiredDuringSave}
        onLogin={() => { clearSessionExpired(); handleLogout(); }}
      />

      <DocumentBar
        projectName={selectedLoteo?.name}
        hasUnsavedChanges={isDirty}
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
            onMarkerSelect={(id) => setSelectedId(selectableAnnotationId(id))}
            onPolygonUpdate={handlePolygonUpdate}
            onMarkerDragEnd={handleMarkerDragEnd}
            onMarkerDrag={calibration.dragLive}
            getPositionRef={getViewerPositionRef}
            onViewerReadyChange={setViewerReady}
            onPanoramaDimensions={loteo.setPanoramaDimensions}
            calibrationPoints={calibration.points}
            pendingBlueprintPoints={calibration.pending}
            onCancelCalibration={calibration.cancel}
            onDeleteCalibrationPoint={calibration.deletePoint}
            onClearCalibration={calibration.clear}
          />
        ) : activeTool === 'calibrate-geo' ? (
          <GeoCalibrationOverlay
            blueprintUrl={blueprintUrl}
            annotations={geo.overlayAnnotations}
            onBlueprintClick={handleViewerClick}
            latitude={selectedLoteo?.latitude}
            longitude={selectedLoteo?.longitude}
            geoCalibrationPoints={geo.points}
            pendingGeoBlueprintPoint={geo.pending}
            onMapPointPicked={geo.pickMapPoint}
            geoPolygons={geo.polygons}
            surfaces={geoSurfaces}
            onAdjust={geo.adjust}
            onCancelCalibration={geo.cancel}
            onDeleteCalibrationPoint={geo.deletePoint}
            onClearCalibration={geo.clear}
            onUpdateGeoPolygons={geo.updatePolygons}
          />
        ) : (
        <>
        <ProjectPanel
          open={projectPanelOpen}
          onClose={() => setProjectPanelOpen(false)}
          activeTab={projectPanelTab}
          onTabChange={setProjectPanelTab}
          projectName={selectedLoteo?.name ?? ''}
          snapThreshold={loteo.snapThreshold}
          onSaveSettings={loteo.saveSettings}
          panoramaUrl={panoramaUrl}
          blueprintUrl={blueprintUrl}
          mode={mode}
          annotations={annotations}
          selectedId={selectedId}
          onSelectAnnotation={(id) => {
            setSelectedId(id);
            setInspectorOpen(true);
          }}
          hiddenLayers={hiddenLayers}
          onToggleLayer={type => setHiddenLayers(prev => ({ ...prev, [type]: !prev[type] }))}
          onHoverAnnotation={setHoveredId}
          calibrationPoints={calibration.points}
          pendingBlueprintPoints={calibration.pending}
          homography={homography}
          calibrationNotice={calibration.notice}
          activeTool={activeTool}
          onEnterCalibration={() => handleToolChange('calibrate')}
          onCancelCalibration={calibration.cancel}
          onDeleteCalibrationPoint={calibration.deletePoint}
          onClearCalibration={calibration.clear}
          autoDetectParams={autoDetectParams}
          onAutoDetectParamsChange={setAutoDetectParams}
          autoDetectLoading={autoDetectLoading || autoDetectProcessing}
          autoDetectError={autoDetectError}
          autoDetectLotsGenerated={autoDetectLotsGenerated}
          onExitAutoDetect={() => setActiveTool('select')}
          onProjectMissing={() => importPolygonsFromBlueprint({ overwrite: false })}
          onReprojectAll={() => importPolygonsFromBlueprint({ overwrite: true })}
          onRemoveAllFromPanorama={handleUnimportAll}
          homePosition={loteo.homePosition}
          northOffset={loteo.northOffset}
          onCaptureHome={loteo.captureHome}
          onResetHome={loteo.resetHome}
          onSetNorth={loteo.setNorth}
          onResetNorth={loteo.resetNorth}
          canOrientPanorama={!!loteoId && !!panoramaUrl && mode === 'panorama' && viewerReady}
          loteoLatitude={selectedLoteo?.latitude}
          loteoLongitude={selectedLoteo?.longitude}
          geoCalibrationPoints={geo.points}
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
            calibrationPoints={calibration.points}
            geoCalibrationPoints={geo.points}
            render={render}
            geoSurfaces={geoSurfaces}
          />

          <div className="viewer-surface">
            {loteo.isLoading ? (
              <Loader label="Cargando loteo…" />
            ) : mode === 'satellite' ? (
              <SatelliteView
                latitude={selectedLoteo?.latitude}
                longitude={selectedLoteo?.longitude}
                blueprintUrl={blueprintUrl}
                geo={geo}
                surfaces={geoSurfaces}
                onLink={() => handleToolChange('calibrate-geo')}
              />
            ) : mode === 'blueprint' && blueprintUrl ? (
              <BlueprintEditor
                blueprintUrl={blueprintUrl}
                activeTool={activeTool}
                annotations={displayAnnotations}
                selectedId={selectedId}
                highlightedId={hoveredId}
                rectStart={rectStart}
                detectOverlay={autoDetectOverlay}
                onClick={handleViewerClick}
                onMarkerSelect={handleMarkerSelect}
                onPolygonUpdate={handlePolygonUpdate}
                onPolygonCommit={handlePolygonCommit}
                onMarkerDragEnd={handleMarkerDragEnd}
              />
            ) : (mode === 'panorama' || mode === 'render') && panoramaUrl ? (
              <EditorViewer
                mode={mode}
                panoramaUrl={panoramaUrl}
                activeTool={activeTool}
                annotations={displayAnnotations}
                highlightedId={hoveredId}
                onClick={handleViewerClick}
                onMarkerSelect={handleMarkerSelect}
                onPolygonUpdate={handlePolygonUpdate}
                onMarkerDragEnd={handleMarkerDragEnd}
                onMarkerDrag={calibration.dragLive}
                getPositionRef={getViewerPositionRef}
                onViewerReadyChange={setViewerReady}
                onPanoramaDimensions={loteo.setPanoramaDimensions}
                render={render}
              />
            ) : (
              <div className="viewer-feedback viewer-feedback--empty">
                <ImageIcon size={40} />
                <h2>{mode === 'blueprint' ? 'Este loteo no tiene plano' : 'Falta cargar el panorama'}</h2>
                <p>Administrá las imágenes desde la ficha del loteo en el CRM.</p>
              </div>
            )}
          </div>

          {calibration.notice && (
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
                  onClick={() => calibration.setNotice('')}
                  aria-label="Cerrar aviso de calibración"
                >
                  <X size={16} />
                </button>
                <button type="button" className="editor-btn editor-btn--primary" onClick={() => calibration.setNotice('')}>
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
          onDelete={removeSelected}
          onDeleteLot={deleteSelectedLot}
          onRemoveFromPanorama={() => removeSelectedFromView('panorama')}
          updateSelected={updateSelected}
          updateNestedSelected={updateNestedSelected}
          pendingMode={pendingMode}
          onPendingModeChange={setPendingMode}
          onCreateLote={() => handleCreateLote(selectedMarker)}
          assignTargetId={assignTargetId}
          onAssignTargetChange={setAssignTargetId}
          onAssign={() => handleAssignToExistingLot(selectedMarker)}
          siblingStages={loteo.siblingStages}
          accessToken={accessToken}
          uploadFn={uploadFn}
          onPoiFieldChange={(field, value) => {
            // Updater funcional: el inspector puede cambiar varios campos
            // en el mismo evento (ej. limpiar etapa y link juntos).
            setAnnotations(prev => prev.map(annotation =>
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

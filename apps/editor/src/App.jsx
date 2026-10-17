import { useState, useRef, useEffect, useMemo } from 'react';
import { visorDataUrl } from './api/loteos';
import { createUploadFn } from './api/upload';
import { useAuth } from './hooks/useAuth';
import { useCalibration } from './hooks/useCalibration';
import { useDraft } from './hooks/useDraft';
import { useGeoCalibration } from './hooks/useGeoCalibration';
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
import { detectLotPolygon } from './utils/lotDetection';
import { DEFAULT_RENDER_SURFACES, surfacesForDirtyCheck } from './utils/renderSurfaces';
import { useRenderSurfaces } from './hooks/useRenderSurfaces';
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
import './App.css';

function App() {
  const { confirm, notify } = useUIFeedback();
  const [activeTool, setActiveTool] = useState('select');
  const [annotations, setAnnotations] = useState([]);
  const [mode, setMode] = useState('panorama'); // 'panorama' | 'blueprint' | 'render'
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
    goToView: view => handleModeChange(view, { silent: true }),
  });
  const { homography } = calibration;

  // Modo Render: manzanas/calles sobre el panorama (ver useRenderSurfaces).
  const render = useRenderSurfaces({ homography, onBeforeChange: snapshotHistory });
  const { pushHistory, undo, redo, canUndo, canRedo, removeAnnotationFromHistory } = useHistory({
    annotations, setAnnotations,
    calibrationPoints: calibration.points, setCalibrationPoints: calibration.setPoints,
    renderManzanaShapes: render.manzanas, setRenderManzanaShapes: render.setManzanas,
    renderCalleShapes: render.calles, setRenderCalleShapes: render.setCalles,
  });
  const { endWidthDrag: endStreetWidthDrag } = render;

  // Pares plano↔lat/lng para el modo satelital (ver useGeoCalibration).
  const geo = useGeoCalibration({
    activeTool, setActiveTool, annotations, setAnnotations, onBeforeChange: snapshotHistory, confirm, notify,
  });

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

  const [viewerReady, setViewerReady] = useState(false);
  const uploadFn = useMemo(() => createUploadFn(accessToken, handleLogout), [accessToken, handleLogout]);
  const { pendingDraft, loadDraft, clearDraft } = useDraft({
    annotations, loteoId, savedAnnotationsRef,
    calibrationPoints: calibration.points, savedCalibrationRef: calibration.savedRef,
    panoramaDimensions: loteo.panoramaDimensions,
  });
  const {
    isCreatingLote,
    pendingMode, setPendingMode,
    assignTargetId, setAssignTargetId,
    isAssigning,
    handleCreateLote,
    handleAssignToExistingLot,
    handleDeleteLot,
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
  const {
    isSavingAll,
    sessionExpiredDuringSave, clearSessionExpired,
    handleSaveAll,
  } = useSaveAll({
    annotations, setAnnotations, token: accessToken, loteoId, savedAnnotationsRef, onAfterSave: clearDraft,
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

    // Normalize click to [0, 1] assuming textureX/Y are already in that range
    const result = await detectLotPolygon(blueprintUrl, 1, 1, textureX, textureY, autoDetectParams);

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
      svgStyle: { fill: 'rgba(76,175,80,0.15)', stroke: '#4caf50', strokeWidth: '2', strokeDasharray: '4,2' },
    });

    pushHistory(annotations);
    setAnnotations([...annotations, newAnn]);
    setSelectedId(newId);
    setAutoDetectLotsGenerated(prev => prev + 1);
    setAutoDetectLoading(false);
    setInspectorOpen(true);
  };

  const handleModeChange = async (nextMode, { silent = false } = {}) => {
    if (nextMode === mode) return;
    if (!silent) {
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
    }
    setSelectedId(null);
    // Salir de Render descarta la herramienta de dibujo y el trazo en curso.
    if (mode === 'render') render.resetDrawing();
    setMode(nextMode);
  };

  // Keep tool activation in one place so contextual panels always follow the
  // selected tool, regardless of whether it was chosen from the toolbar or
  // from the project panel.
  const handleToolChange = (tool) => {
    setActiveTool(tool);
    if (tool === 'calibrate') calibration.setNotice('');
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

  // When calibrate tool is activated, start in blueprint so the user picks the
  // reference there first. (El lote pendiente lo resetea useCalibration.)
  useEffect(() => {
    if (activeTool === 'calibrate' && blueprintUrl) {
      setSelectedId(null);
      setMode('blueprint');
      setProjectPanelOpen(true);
      setProjectPanelTab('project');
    }
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Entrando a geo calibración (el punto sin par lo resetea useGeoCalibration).
  useEffect(() => {
    if (activeTool === 'calibrate-geo') {
      setSelectedId(null);
      setProjectPanelOpen(true);
      setProjectPanelTab('project');
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
          keyboardStateRef.current?.handleEscapeGeoCalibration();
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
      handleEscapeCalibration: calibration.escape,
      handleEscapeGeoCalibration: geo.escape,
      activeTool,
      mode,
      saveAll: handleSaveAll,
      render,
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
    return null;
  }

  if (!selectedLoteo && (!loteo.hasDataParam || loteo.untrustedDirectLink)) {
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
    return (
      <div className="access-screen">
        <div className="access-screen__spinner" />
        <p>Verificando acceso…</p>
      </div>
    );
  }

  const renderSurfacesForDirtyCheck = surfacesForDirtyCheck(render.surfaces);
  const savedRenderSurfacesForDirtyCheck = surfacesForDirtyCheck(savedRenderSurfacesRef.current);
  const hasUnsavedChanges = (
    JSON.stringify(annotations) !== JSON.stringify(savedAnnotationsRef.current)
    || JSON.stringify(calibration.points) !== JSON.stringify(calibration.savedRef.current)
    || JSON.stringify(geo.points) !== JSON.stringify(geo.savedRef.current)
    || JSON.stringify(renderSurfacesForDirtyCheck) !== JSON.stringify(savedRenderSurfacesForDirtyCheck)
  );

  return (
    <div className="editor-container">
      <DraftBanner
        draft={pendingDraft}
        onRestore={(draft) => { setAnnotations(draft.annotations); calibration.setPoints(draft.calibrationPoints ?? []); clearDraft(); }}
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
          autoDetectLoading={autoDetectLoading}
          autoDetectError={autoDetectError}
          autoDetectLotsGenerated={autoDetectLotsGenerated}
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
            render={render}
          />

          <div className="viewer-surface">
            {loteo.isLoading ? (
              <div className="viewer-feedback">Cargando loteo…</div>
            ) : mode === 'blueprint' && blueprintUrl ? (
              <BlueprintEditor
                blueprintUrl={blueprintUrl}
                activeTool={activeTool}
                annotations={displayAnnotations}
                selectedId={selectedId}
                rectStart={rectStart}
                onClick={handleViewerClick}
                onMarkerSelect={handleMarkerSelect}
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
          isCreatingLote={isCreatingLote}
          onCreateLote={() => handleCreateLote(selectedMarker)}
          assignTargetId={assignTargetId}
          onAssignTargetChange={setAssignTargetId}
          isAssigning={isAssigning}
          onAssign={() => handleAssignToExistingLot(selectedMarker)}
          siblingStages={loteo.siblingStages}
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

import { useState, useRef, useEffect, useMemo } from 'react';
import { API_BASE, fetchWithTimeout } from './api/config';
import { useAuth } from './hooks/useAuth';
import { useDraft } from './hooks/useDraft';
import { useHistory } from './hooks/useHistory';
import { useLotOperations } from './hooks/useLotOperations';
import { usePoiOperations } from './hooks/usePoiOperations';
import { useSaveAll } from './hooks/useSaveAll';
import { useDisplayAnnotations } from './hooks/useDisplayAnnotations';
import { computeHomography, applyHomography, isHomographyValid } from './utils/homography';
import { CALIBRATION_ENABLED } from './config/features';
import { Image as ImageIcon } from 'lucide-react';
import EditorViewer from './components/EditorViewer';
import BlueprintEditor from './components/BlueprintEditor';
import LoginScreen from './components/LoginScreen';
import LoteoList from './components/LoteoList';
import DraftBanner from './components/DraftBanner';
import SessionExpiredBanner from './components/SessionExpiredBanner';
import Toolbar from './components/Toolbar';
import InspectorPanel from './components/InspectorPanel';
import LoteoSettingsModal from './components/LoteoSettingsModal';
import './App.css';

// Map annotations to the right coordinate system based on mode
const getAnnotationsForMode = (annotations, currentMode) => {
  return annotations.map(ann => {
    if ((ann.type === 'polygon' || ann.type === 'poi') && (ann.panorama_coordinates || ann.blueprint_coordinates)) {
      const coords = currentMode === 'blueprint'
        ? ann.blueprint_coordinates
        : ann.panorama_coordinates;
      return { ...ann, polygonPixels: coords || [] };
    }
    return ann;
  });
};


function App() {
  const [activeTool, setActiveTool] = useState('select');
  const [annotations, setAnnotations] = useState([]);
  // Calibration: correspondence points between blueprint and panorama spaces
  // Each entry: { blueprint: [nx, ny], panorama: [textureX, textureY] }
  // Declared before useHistory so undo/redo can snapshot calibration too.
  const [calibrationPoints, setCalibrationPoints] = useState([]);
  const { pushHistory, undo, redo, canUndo, canRedo } = useHistory({ annotations, setAnnotations, calibrationPoints, setCalibrationPoints });
  const isDraggingPolygonRef = useRef(false);
  const preDragAnnotationsRef = useRef(null);
  const isDraggingCalibrationRef = useRef(false);
  const keyboardStateRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drawingPolygon, setDrawingPolygon] = useState([]);

  const [panoramaUrl, setPanoramaUrl] = useState(null);
  const [blueprintUrl, setBlueprintUrl] = useState(null);
  const [mode, setMode] = useState('panorama'); // 'panorama' or 'blueprint'

  // During a calibration click sequence: holds the pending blueprint point
  // { pendingBlueprint: [nx, ny] } while waiting for the panorama click
  const [calibrationStep, setCalibrationStep] = useState(null);

  // Derived homography — recomputed whenever calibrationPoints changes
  const homography = useMemo(() => {
    if (calibrationPoints.length < 4) return null;
    const H = computeHomography(
      calibrationPoints.map(c => ({ src: c.blueprint, dst: c.panorama }))
    );
    return isHomographyValid(H) ? H : null;
  }, [calibrationPoints]);
  const [snapThreshold, setSnapThreshold] = useState(5);
  const [homePosition, setHomePosition] = useState(null);
  const [loteoSettingsOpen, setLoteoSettingsOpen] = useState(false);
  const getViewerPositionRef = useRef(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [isLoadingDefault, setIsLoadingDefault] = useState(true);
  const [loteoId, setLoteoId] = useState(null);
  const [siblingStages, setSiblingStages] = useState([]);
  const { token: accessToken, handleLogin, handleLogout } = useAuth();
  const [selectedLoteo, setSelectedLoteo] = useState(null);
  const [poiForm, setPoiForm] = useState({ title: '', icon_type: '', description: '', link_url: '', color: '#14b8a6' });
  // Snapshot of annotations as last saved/loaded — used to diff before saving
  const savedAnnotationsRef = useRef([]);
  const savedCalibrationRef = useRef([]);
  const { pendingDraft, loadDraft, clearDraft } = useDraft({ annotations, loteoId, savedAnnotationsRef, calibrationPoints, savedCalibrationRef });
  const {
    isCreatingLote,
    isSavingLote,
    pendingMode, setPendingMode,
    assignTargetId, setAssignTargetId,
    isAssigning,
    handleCreateLote,
    handleSaveLote,
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
  const {
    isCreatingPoi,
    isSavingPoi,
    handleCreatePoi,
    handleSavePoi,
    handleDeletePoi,
  } = usePoiOperations({
    setAnnotations, selectedId, setSelectedId,
    token: accessToken, loteoId, mode,
    onAfterCreate: clearDraft,
    onAuthError: handleLogout,
  });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // Track blob URLs to revoke and prevent memory leak
  const prevPanoramaUrlRef = useRef(null);
  const {
    isSavingAll,
    sessionExpiredDuringSave, clearSessionExpired,
    handleSaveAll,
  } = useSaveAll({ annotations, token: accessToken, loteoId, savedAnnotationsRef, onAuthError: handleLogout, onAfterSave: clearDraft, calibrationPoints, savedCalibrationRef });



  // Cuando se carga vía ?data=URL, selectedLoteo queda null — lo cargamos aparte
  useEffect(() => {
    if (!loteoId || selectedLoteo || !accessToken) return;
    fetch(`${API_BASE}/loteos/${loteoId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSelectedLoteo(data); })
      .catch(() => {});
  }, [loteoId, selectedLoteo, accessToken]);

  // Carga datos desde ?data=URL o desde el panorama.jpg del proyecto padre
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataUrl = params.get('data');
    let extractedLoteoId = null;

    if (dataUrl) {
      const match = dataUrl.match(/\/loteos\/([^/?]+)/);
      if (match) {
        extractedLoteoId = match[1];
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
              if ((ann.type === 'polygon' || ann.type === 'poi') && ann.panorama_coordinates) {
                ann.polygonPixels = ann.panorama_coordinates;
              } else if ((ann.type === 'polygon' || ann.type === 'poi') && ann.blueprint_coordinates) {
                ann.polygonPixels = ann.blueprint_coordinates;
              }
              return ann;
            });
            setAnnotations(mappedAnnotations);
            savedAnnotationsRef.current = mappedAnnotations;

            // Check for draft from previous session
            loadDraft(extractedLoteoId);
          }

          if (data.panoramaUrl && typeof data.panoramaUrl === 'string') {
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
            setCalibrationPoints(data.calibrationPoints);
            savedCalibrationRef.current = data.calibrationPoints;
          }
          if (data.snapThreshold != null) {
            setSnapThreshold(data.snapThreshold);
          }
          if (data.homeYaw != null && data.homePitch != null) {
            setHomePosition({ yaw: data.homeYaw, pitch: data.homePitch });
          }
        })
        .catch(err => {
          alert(`No se pudo cargar el JSON desde la URL: ${err.message}`);
        })
        .finally(() => setIsLoadingDefault(false));
      return;
    }

    fetch('/panorama.jpg', { method: 'HEAD' })
      .then(res => {
        if (res.ok) {
          setPanoramaUrl('/panorama.jpg');
        }
      })
      .catch((err) => console.warn('Fallback panorama.jpg not available:', err))
      .finally(() => setIsLoadingDefault(false));
  }, []);

  // Etapas hermanas del grupo (para que un POI pueda navegar a otra etapa).
  useEffect(() => {
    if (!loteoId || !accessToken) { setSiblingStages([]); return; }
    let cancelled = false;
    fetchWithTimeout(`${API_BASE}/loteos?limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
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
  }, [loteoId, accessToken]);

  // Reset pending panel state when selection changes
  useEffect(() => {
    setPendingMode('create');
    setAssignTargetId('');
  }, [selectedId]);



  const handleViewerClick = (textureX, textureY) => {
    // Calibration is hidden in production via CALIBRATION_ENABLED (VITE_CALIBRATION).
    // Guard here too so a calibrate click can never mutate state where the tool is off.
    if (CALIBRATION_ENABLED && activeTool === 'calibrate') {
      if (!calibrationStep) {
        // Step 1: we're in blueprint — save point and switch to panorama silently
        setCalibrationStep({ pendingBlueprint: [textureX, textureY] });
        handleModeChange('panorama', { silent: true });
      } else {
        // Step 2: we're in panorama — complete the pair
        const newPair = {
          blueprint: calibrationStep.pendingBlueprint,
          panorama: [textureX, textureY],
        };
        setCalibrationPoints(prev => [...prev, newPair]);
        setCalibrationStep(null);
        // Go back to blueprint for the next pair, silently
        handleModeChange('blueprint', { silent: true });
      }
      return;
    }

    if (activeTool === 'select') {
      setSelectedId(null);
      return;
    }

    if (activeTool === 'polygon' || activeTool === 'poi') {
      setDrawingPolygon([...drawingPolygon, [textureX, textureY]]);
      return;
    }

    const newId = `${activeTool}-${Date.now()}`;
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
      newAnn.size = { width: 100, height: 30 };
    }

    pushHistory(annotations);
    setAnnotations([...annotations, newAnn]);
    setSelectedId(newId);
    setActiveTool('select');
    setInspectorOpen(activeTool === 'text');
  };

  const finishPolygon = () => {
    if (drawingPolygon.length < 3) {
      alert("El polígono necesita al menos 3 puntos");
      return;
    }
    const newId = `${activeTool}-${Date.now()}`;
    const isPoi = activeTool === 'poi';
    const newAnn = {
      id: newId,
      type: activeTool,
      pending: true,
      polygonPixels: drawingPolygon,
      tooltip: isPoi ? 'Nuevo POI (sin guardar)' : '',
      svgStyle: isPoi
        ? { fill: 'rgba(20,184,166,0.15)', stroke: '#14b8a6', strokeWidth: '2', strokeDasharray: '8,4' }
        : { fill: 'rgba(255,165,0,0.15)', stroke: '#ffa500', strokeWidth: '2', strokeDasharray: '8,4' },
      color: isPoi ? '#14b8a6' : undefined,
    };
    pushHistory(annotations);
    setAnnotations([...annotations, newAnn]);
    setDrawingPolygon([]);
    setSelectedId(newId);
    setActiveTool('select');
  };

  const cancelPolygon = () => {
    setDrawingPolygon([]);
    setActiveTool('select');
  };

  const cancelCalibration = () => {
    setCalibrationStep(null);
    setActiveTool('select');
  };

  const handleDeleteCalibrationPoint = (index) => {
    // undo-able: the composite snapshot captures the current calibrationPoints
    pushHistory(annotations);
    setCalibrationPoints(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearCalibration = () => {
    if (calibrationPoints.length === 0) return;
    if (!window.confirm('¿Borrar toda la calibración? (podés deshacer con Ctrl+Z)')) return;
    pushHistory(annotations);
    setCalibrationPoints([]);
    setCalibrationStep(null);
  };

  const handleCaptureHome = async () => {
    const pos = getViewerPositionRef.current?.();
    if (!pos) throw new Error('El visor no está listo');
    const res = await fetchWithTimeout(`${API_BASE}/loteos/${loteoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ home_yaw: pos.yaw, home_pitch: pos.pitch }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const saved = await res.json();
    setHomePosition({ yaw: saved.home_yaw, pitch: saved.home_pitch });
  };

  const handleModeChange = (nextMode, { silent = false } = {}) => {
    if (nextMode === mode) return;
    if (!silent) {
      const polygons = annotations.filter(a => (a.type === 'polygon' || a.type === 'poi') && !a.pending);
      const coordKey = nextMode === 'blueprint' ? 'blueprint_coordinates' : 'panorama_coordinates';
      const missing = polygons.filter(a => !a[coordKey] || a[coordKey].length === 0);
      if (missing.length > 0) {
        const ok = window.confirm(
          `${missing.length} polígono(s) no tienen coordenadas en modo ${nextMode === 'blueprint' ? 'Blueprint' : 'Panorama'}.\n` +
          `Aparecerán vacíos. ¿Continuar de todas formas?`
        );
        if (!ok) return;
      }
    }
    setMode(nextMode);
  };

  // Clear in-progress drawing when switching modes — coordinates are not transferable between spaces
  // Exception: calibrate tool drives mode changes intentionally, so don't reset it
  useEffect(() => {
    if (activeTool === 'calibrate') return;
    setDrawingPolygon([]);
    setActiveTool('select');
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // When calibrate tool is activated, start in blueprint so the user picks the reference there first
  useEffect(() => {
    if (activeTool === 'calibrate' && blueprintUrl) {
      setCalibrationStep(null);
      setMode('blueprint');
    }
    // When leaving calibrate tool, clean up any pending step
    if (activeTool !== 'calibrate') {
      setCalibrationStep(null);
    }
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // If blueprintUrl disappears while in blueprint mode, fall back to panorama
  useEffect(() => {
    if (!blueprintUrl && mode === 'blueprint') setMode('panorama');
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
      if (isInput) return;

      if (e.key === 'Escape') {
        keyboardStateRef.current?.cancelPolygon();
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
      if (e.key === '1') { keyboardStateRef.current?.setActiveTool('polygon'); return; }
      if (e.key === '2') { keyboardStateRef.current?.setActiveTool('text');    return; }
      if (e.key === '3') { keyboardStateRef.current?.setActiveTool('poi');     return; }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const { displayAnnotations, selectedMarker } = useDisplayAnnotations({
    annotations, selectedId, mode, drawingPolygon,
    calibrationPoints, calibrationStep, homography,
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
    const i = parseInt(markerId.replace('calib-pt-', ''), 10);
    if (Number.isNaN(i)) return;
    if (!isDraggingCalibrationRef.current) {
      isDraggingCalibrationRef.current = true;
      // Snapshot on first move while calibrationPoints is still pre-drag, so a
      // single Ctrl+Z reverts the whole drag.
      pushHistory(annotations);
    }
    const coordKey = mode === 'blueprint' ? 'blueprint' : 'panorama';
    setCalibrationPoints(prev => prev.map((p, idx) =>
      idx === i ? { ...p, [coordKey]: [x, y] } : p
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
      const i = parseInt(markerId.replace('calib-pt-', ''), 10);
      const coordKey = mode === 'blueprint' ? 'blueprint' : 'panorama';
      pushHistory(annotations);
      setCalibrationPoints(prev => prev.map((p, idx) =>
        idx === i ? { ...p, [coordKey]: [textureX, textureY] } : p
      ));
      return;
    }

    pushHistory(annotations);
    setAnnotations(prevAnnotations => prevAnnotations.map(a => {
      if (a.id === markerId) {
        return { ...a, position: { textureX, textureY } };
      }
      return a;
    }));
  };

  const handleImportFromBlueprint = () => {
    if (!selectedMarker?.blueprint_coordinates?.length || !homography) return;
    const newPanoCoords = selectedMarker.blueprint_coordinates.map(
      ([nx, ny]) => applyHomography(homography, [nx, ny])
    );
    pushHistory(annotations);
    setAnnotations(prev => prev.map(a =>
      a.id === selectedId
        ? { ...a, panorama_coordinates: newPanoCoords, polygonPixels: mode === 'panorama' ? newPanoCoords : a.polygonPixels }
        : a
    ));
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

    if (selectedMarker.type === 'polygon') {
      const snapshot = annotations;
      const ok = await handleRemoveLot(selectedMarker);
      if (!ok) return;
      pushHistory(snapshot);
      setAnnotations(annotations.filter(a => a.id !== selectedId));
      setSelectedId(null);
      return;
    }

    if (selectedMarker.type === 'poi') {
      // handleDeletePoi handles DB delete + local annotation cleanup + selectedId reset
      pushHistory(annotations);
      await handleDeletePoi(selectedMarker.uuid);
      return;
    }

    pushHistory(annotations);
    setAnnotations(annotations.filter(a => a.id !== selectedId));
    setSelectedId(null);
  };

  // Keep keyboard handler ref fresh every render (must be after removeSelected is defined)
  keyboardStateRef.current = { removeSelected, undo, redo, setActiveTool, cancelPolygon };





  const handleLoteoSelect = (loteo) => {
    const dataUrl = `${API_BASE}/loteos/${loteo.id}/visor_data`;
    const editorUrl = `${window.location.origin}${window.location.pathname}?data=${encodeURIComponent(dataUrl)}&from=list`;
    window.open(editorUrl, '_blank');
  };

  const params = new URLSearchParams(window.location.search);
  const hasDataParam = params.has('data');
  const fromList = params.get('from') === 'list';

  if (!accessToken) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!selectedLoteo && !hasDataParam) {
    return <LoteoList token={accessToken} onSelect={handleLoteoSelect} onAuthError={handleLogout} />;
  }

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

      <div className="viewer-pane">
        <Toolbar
          activeTool={activeTool}
          onToolChange={(tool) => {
            setActiveTool(tool);
            if (tool !== 'polygon' && tool !== 'poi') setDrawingPolygon([]);
          }}
          mode={mode}
          onModeChange={handleModeChange}
          panoramaUrl={panoramaUrl}
          blueprintUrl={blueprintUrl}
          drawingPolygon={drawingPolygon}
          onFinishPolygon={finishPolygon}
          onCancelPolygon={cancelPolygon}
          inspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen(o => !o)}
          onLogout={handleLogout}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          calibrationPoints={calibrationPoints}
          calibrationStep={calibrationStep}
          onCancelCalibration={cancelCalibration}
          onDeleteCalibrationPoint={handleDeleteCalibrationPoint}
          onClearCalibration={handleClearCalibration}
          onBack={fromList
            ? () => { window.location.href = window.location.origin + window.location.pathname; }
            : () => { window.opener?.focus(); window.close(); }
          }
          backTitle={fromList ? 'Volver al listado' : 'Volver a la plataforma'}
          onOpenLoteoSettings={loteoId ? () => setLoteoSettingsOpen(true) : undefined}
          onCaptureHome={loteoId ? handleCaptureHome : undefined}
          canCaptureHome={!!panoramaUrl && mode === 'panorama' && viewerReady}
        />

        <div style={{ width: '100%', height: '100%' }}>
          {isLoadingDefault ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa' }}>
              Cargando...
            </div>
          ) : mode === 'blueprint' && blueprintUrl ? (
            <BlueprintEditor
              blueprintUrl={blueprintUrl}
              activeTool={activeTool}
              annotations={displayAnnotations}
              selectedId={selectedId}
              onClick={handleViewerClick}
              onMarkerSelect={(id) => {
                if ((activeTool === 'polygon' || activeTool === 'poi') && id === 'temp-pt-0') {
                  finishPolygon();
                } else {
                  setSelectedId(id);
                  setInspectorOpen(false);
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
                // Ghost polygons and calibration markers are non-interactive
                if (id.startsWith('ghost-') || id.startsWith('calib-')) return;
                if ((activeTool === 'polygon' || activeTool === 'poi') && id === 'temp-pt-0') {
                  finishPolygon();
                } else {
                  setSelectedId(id);
                  setInspectorOpen(false);
                }
              }}
              onPolygonUpdate={handlePolygonUpdate}
              onMarkerDragEnd={handleMarkerDragEnd}
              onMarkerDrag={handleCalibrationDragLive}
              getPositionRef={getViewerPositionRef}
              onViewerReadyChange={setViewerReady}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa', textAlign: 'center', padding: '2rem' }}>
              <ImageIcon size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <h2>{mode === 'blueprint' ? 'No hay blueprint cargado' : 'No hay imagen panorámica cargada'}</h2>
              <p style={{ maxWidth: '400px', lineHeight: '1.5' }}>Usa el botón <b>"Cargar Imagen"</b> en el panel derecho para subir tu fotografía equirrectangular (JPG/PNG) localmente y empezar a mapear.</p>
            </div>
          )}
        </div>
      </div>

      <InspectorPanel
        inspectorOpen={inspectorOpen}
        annotations={annotations}
        selectedMarker={selectedMarker}
        mode={mode}
        homography={homography}
        onImportFromBlueprint={handleImportFromBlueprint}
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
        isSavingLote={isSavingLote}
        onSaveLote={() => handleSaveLote(selectedMarker)}
        onCreatePoi={handleCreatePoi}
        onSavePoi={handleSavePoi}
        siblingStages={siblingStages}
        onDeletePoi={handleDeletePoi}
        onDeselectPoi={() => { setSelectedId(null); setInspectorOpen(false); }}
        onPoiFieldChange={(field, value) => {
          setAnnotations(annotations.map(a =>
            a.id === selectedId
              ? { ...a, [field]: value, ...(field === 'title' ? { tooltip: value } : {}) }
              : a
          ));
        }}
        isCreatingPoi={isCreatingPoi}
        isSavingPoi={isSavingPoi}
        isSavingAll={isSavingAll}
        onSaveAll={handleSaveAll}
      />

      <LoteoSettingsModal
        isOpen={loteoSettingsOpen}
        onClose={() => setLoteoSettingsOpen(false)}
        loteoId={loteoId}
        token={accessToken}
        initialName={selectedLoteo?.name ?? ''}
        initialSnapThreshold={snapThreshold}
        onSaved={(saved) => {
          if (saved.snap_threshold != null) setSnapThreshold(saved.snap_threshold);
          if (saved.home_yaw != null) setHomePosition({ yaw: saved.home_yaw, pitch: saved.home_pitch });
          else if (saved.home_yaw === null) setHomePosition(null);
          setSelectedLoteo(prev => prev ? { ...prev, name: saved.name ?? prev.name } : prev);
        }}
      />
    </div>
  );
}

export default App;

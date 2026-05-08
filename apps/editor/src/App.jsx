import { useState, useRef, useEffect } from 'react';
import { MousePointer2, Pentagon, Type, Download, Image as ImageIcon, ArrowLeft, Grid3x3, Camera, MapPin } from 'lucide-react';
import EditorViewer from './components/EditorViewer';
import BlueprintEditor from './components/BlueprintEditor';
import LoginScreen from './components/LoginScreen';
import LoteoList from './components/LoteoList';
import POIInspector from './components/POIInspector';
import { createPoi, updatePoi, deletePoi, updatePoiCoordinates, updatePoiBlueprintCoordinates } from './services/poiService';
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

// Fetch with timeout using AbortController
const fetchWithTimeout = (url, options, ms = 30000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

function App() {
  const [activeTool, setActiveTool] = useState('select');
  const [annotations, setAnnotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [drawingPolygon, setDrawingPolygon] = useState([]);

  const [panoramaUrl, setPanoramaUrl] = useState(null);
  const [blueprintUrl, setBlueprintUrl] = useState(null);
  const [mode, setMode] = useState('panorama'); // 'panorama' or 'blueprint'
  const [isLoadingDefault, setIsLoadingDefault] = useState(true);
  const [loteoId, setLoteoId] = useState(null);
  const [isSavingText, setIsSavingText] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [accessToken, setAccessToken] = useState(() => {
    const urlToken = new URLSearchParams(window.location.search).get('token');
    if (urlToken) {
      localStorage.setItem('notry_token', urlToken);
      // Remove token from URL to prevent exposure in browser history/address bar
      const params = new URLSearchParams(window.location.search);
      params.delete('token');
      const cleaned = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', cleaned);
      return urlToken;
    }
    return localStorage.getItem('notry_token');
  });
  const [selectedLoteo, setSelectedLoteo] = useState(null);
  const [loteForm, setLoteForm] = useState({ name: '', slug: '', status: 'available', price: '', area: '', comments: '' });
  const [isCreatingLote, setIsCreatingLote] = useState(false);
  const [loteUpdateForm, setLoteUpdateForm] = useState({ name: '', slug: '', status: 'available', price: '', area: '', comments: '' });
  const [isUpdatingLote, setIsUpdatingLote] = useState(false);
  // POI state
  const [poiForm, setPoiForm] = useState({ title: '', icon_type: '', description: '', link_url: '', color: '#14b8a6' });
  const [isCreatingPoi, setIsCreatingPoi] = useState(false);
  const [isUpdatingPoi, setIsUpdatingPoi] = useState(false);
  const [pendingMode, setPendingMode] = useState('create'); // 'create' | 'assign'
  const [assignTargetId, setAssignTargetId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [sessionExpiredDuringSave, setSessionExpiredDuringSave] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  
  // Track blob URLs to revoke and prevent memory leak
  const prevPanoramaUrlRef = useRef(null);

  const handleLogin = (token) => {
    localStorage.setItem('notry_token', token);
    setAccessToken(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('notry_token');
    setAccessToken(null);
  };

  // Draft persistence helpers
  const DRAFT_KEY = loteoId ? `notry_draft_${loteoId}` : null;
  const saveDraft = (currentAnnotations) => {
    if (!DRAFT_KEY) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      loteoId,
      savedAt: new Date().toISOString(),
      annotations: currentAnnotations,
    }));
  };
  const clearDraft = () => {
    if (!DRAFT_KEY) return;
    localStorage.removeItem(DRAFT_KEY);
  };

  // Auto-save debounced (2s)
  useEffect(() => {
    if (!loteoId || annotations.length === 0) return;
    const timer = setTimeout(() => {
      saveDraft(annotations);
    }, 2000);
    return () => clearTimeout(timer);
  }, [annotations, loteoId]);

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

            // Check for draft from previous session
            if (extractedLoteoId) {
              const draftKey = `notry_draft_${extractedLoteoId}`;
              const raw = localStorage.getItem(draftKey);
              if (raw) {
                try {
                  const draft = JSON.parse(raw);
                  if (draft.annotations?.length > 0) {
                    setPendingDraft(draft);
                  }
                } catch {
                  localStorage.removeItem(draftKey);
                }
              }
            }
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

  // Reset pending panel state when selection changes
  useEffect(() => {
    setPendingMode('create');
    setAssignTargetId('');
  }, [selectedId]);

  // Populate update form when an existing (non-pending) polygon is selected
  useEffect(() => {
    const marker = annotations.find(a => a.id === selectedId);
    if (marker && marker.type === 'polygon' && !marker.pending) {
      setLoteUpdateForm({
        name: marker.tooltip || '',
        slug: marker.slug || '',
        status: marker.status || marker.estado || 'available',
        price: marker.price !== undefined && marker.price !== null ? String(marker.price) : (marker.precio !== undefined && marker.precio !== null ? String(marker.precio) : ''),
        area: marker.area_m2 !== undefined && marker.area_m2 !== null ? String(marker.area_m2) : (marker.area !== undefined && marker.area !== null ? String(marker.area) : ''),
        comments: marker.comments || '',
      });
    }
  }, [selectedId]);

  const tools = [
    { id: 'select', icon: MousePointer2, title: 'Seleccionar' },
    { id: 'polygon', icon: Pentagon, title: 'Lote' },
    { id: 'poi', icon: MapPin, title: 'POI' },
    { id: 'text', icon: Type, title: 'Texto' },
  ];

  const handleViewerClick = (textureX, textureY) => {
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

    setAnnotations([...annotations, newAnn]);
    setSelectedId(newId);
    setActiveTool('select');
    setInspectorOpen(false);
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
      tooltip: isPoi ? 'Nuevo POI (sin guardar)' : 'Nuevo lote (sin guardar)',
      svgStyle: isPoi
        ? { fill: 'rgba(20,184,166,0.15)', stroke: '#14b8a6', strokeWidth: '2', strokeDasharray: '8,4' }
        : { fill: 'rgba(255,165,0,0.15)', stroke: '#ffa500', strokeWidth: '2', strokeDasharray: '8,4' },
      color: isPoi ? '#14b8a6' : undefined,
    };
    setAnnotations([...annotations, newAnn]);
    setDrawingPolygon([]);
    setSelectedId(newId);
    setActiveTool('select');
  };

  const cancelPolygon = () => {
    setDrawingPolygon([]);
    setActiveTool('select');
  };

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
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
    setMode(nextMode);
  };

  // Clear in-progress drawing when switching modes — coordinates are not transferable between spaces
  useEffect(() => {
    setDrawingPolygon([]);
    setActiveTool('select');
  }, [mode]);

  // If blueprintUrl disappears while in blueprint mode, fall back to panorama
  useEffect(() => {
    if (!blueprintUrl && mode === 'blueprint') setMode('panorama');
  }, [blueprintUrl, mode]);

  // Apply mode-based coordinate mapping
  const modeAdjustedAnnotations = annotations.map(ann => {
    if ((ann.type === 'polygon' || ann.type === 'poi') && (ann.panorama_coordinates || ann.blueprint_coordinates)) {
      const coords = mode === 'blueprint'
        ? (ann.blueprint_coordinates || [])
        : (ann.panorama_coordinates || []);
      return { ...ann, polygonPixels: coords };
    }
    return ann;
  });

  const displayAnnotations = [...modeAdjustedAnnotations];
  if (drawingPolygon.length > 0) {
    displayAnnotations.push({
      id: 'temp-drawing',
      type: 'polyline',
      polylinePixels: [...drawingPolygon, drawingPolygon[drawingPolygon.length - 1]],
      svgStyle: { stroke: '#ff0', strokeWidth: '3', strokeDasharray: '5,5' }
    });
    drawingPolygon.forEach((pt, i) => {
      displayAnnotations.push({
        id: `temp-pt-${i}`,
        type: 'point',
        position: { textureX: pt[0], textureY: pt[1] },
        radius: i === 0 ? 4 : 3,
        svgStyle: { fill: '#ff0' }
      });
    });
  }

  // Use modeAdjustedAnnotations so selectedMarker.polygonPixels always matches the active view's coordinate space
  const selectedMarker = modeAdjustedAnnotations.find(a => a.id === selectedId);

  if (selectedMarker && selectedMarker.type === 'polygon' && selectedMarker.polygonPixels) {
    selectedMarker.polygonPixels.forEach((pt, i) => {
      displayAnnotations.push({
        id: `edit-corner-${selectedMarker.id}-${i}`,
        type: 'point',
        position: { textureX: pt[0], textureY: pt[1] },
        radius: 4,
        svgStyle: {
          fill: '#fff',
          stroke: '#00f',
          strokeWidth: '2',
          cursor: 'grab'
        },
        tooltip: 'Arrastra para mover esquina'
      });

      const nextPt = selectedMarker.polygonPixels[(i + 1) % selectedMarker.polygonPixels.length];
      let midX = (pt[0] + nextPt[0]) / 2;
      let midY = (pt[1] + nextPt[1]) / 2;

      if (Math.abs(pt[0] - nextPt[0]) > 0.5) {
        midX = (pt[0] + nextPt[0] + 1) / 2;
        if (midX > 1) midX -= 1;
      }

      displayAnnotations.push({
        id: `edit-midpoint-${selectedMarker.id}-${i}`,
        type: 'point',
        position: { textureX: midX, textureY: midY },
        radius: 3,
        svgStyle: { fill: '#fff', stroke: '#0f0', strokeWidth: '2', opacity: 0.8, cursor: 'copy' },
        tooltip: 'Arrastra para añadir punto'
      });
    });
  }

  if (selectedMarker && selectedMarker.type === 'poi' && selectedMarker.polygonPixels) {
    const poiColor = selectedMarker.color ?? '#14b8a6';
    selectedMarker.polygonPixels.forEach((pt, i) => {
      displayAnnotations.push({
        id: `edit-corner-${selectedMarker.id}-${i}`,
        type: 'point',
        position: { textureX: pt[0], textureY: pt[1] },
        radius: 4,
        svgStyle: {
          fill: '#fff',
          stroke: poiColor,
          strokeWidth: '2',
          cursor: 'grab'
        },
        tooltip: 'Arrastra para mover esquina'
      });

      const nextPt = selectedMarker.polygonPixels[(i + 1) % selectedMarker.polygonPixels.length];
      let midX = (pt[0] + nextPt[0]) / 2;
      let midY = (pt[1] + nextPt[1]) / 2;

      if (Math.abs(pt[0] - nextPt[0]) > 0.5) {
        midX = (pt[0] + nextPt[0] + 1) / 2;
        if (midX > 1) midX -= 1;
      }

      displayAnnotations.push({
        id: `edit-midpoint-${selectedMarker.id}-${i}`,
        type: 'point',
        position: { textureX: midX, textureY: midY },
        radius: 3,
        svgStyle: { fill: '#fff', stroke: poiColor, strokeWidth: '2', opacity: 0.8, cursor: 'copy' },
        tooltip: 'Arrastra para añadir punto'
      });
    });
  }

  const handlePolygonUpdate = (markerId, newPolygonPixels) => {
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

  const handleMarkerDragEnd = (markerId, textureX, textureY) => {
    setAnnotations(prevAnnotations => prevAnnotations.map(a => {
      if (a.id === markerId) {
        return { ...a, position: { textureX, textureY } };
      }
      return a;
    }));
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

    if (selectedMarker.type === 'polygon' && selectedMarker.uuid) {
      if (!confirm(`¿Eliminar el lote "${selectedMarker.tooltip || selectedMarker.uuid}" de la base de datos? Esta acción no se puede deshacer.`)) return;
      try {
        const res = await fetch(`https://notry-back.onrender.com/api/v1/lots/${selectedMarker.uuid}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.status === 401) { handleLogout(); return; }
        if (!res.ok) { alert(`Error al eliminar el lote: ${res.status}`); return; }
      } catch (err) {
        alert('Error de conexión al intentar eliminar el lote.');
        return;
      }
    }

    if (selectedMarker.type === 'poi' && selectedMarker.uuid) {
      if (!confirm(`¿Eliminar el POI "${selectedMarker.tooltip || selectedMarker.uuid}" de la base de datos? Esta acción no se puede deshacer.`)) return;
      try {
        await deletePoi(accessToken, selectedMarker.uuid);
      } catch (err) {
        alert('Error de conexión al intentar eliminar el POI.');
        return;
      }
    }

    setAnnotations(annotations.filter(a => a.id !== selectedId));
    setSelectedId(null);
  };

  const handlePolygonDbUpdate = async (marker) => {
    if (!marker.uuid) {
      alert("Por favor, ingresa un UUID");
      return;
    }
    if (!marker.polygonPixels || marker.polygonPixels.length < 3) {
      alert("No hay polígono válido para guardar en este modo.");
      return;
    }

    const payload = {
      uuid: marker.uuid,
      polygonPoints: marker.polygonPixels || []
    };

    try {
      const endpoint = mode === 'blueprint' ? 'update-blueprint-coordinates' : 'update-coordinates';
      const response = await fetch(`https://notry-back.onrender.com/api/v1/lots/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) { handleLogout(); return; }
      if (response.ok) {
        alert("¡Coordenadas actualizadas correctamente en la base de datos!");
      } else {
        alert("Error al actualizar las coordenadas en la base de datos");
      }
    } catch (error) {
      console.error("Error al actualizar el polígono:", error);
      alert("Error de conexión al intentar actualizar");
    }
  };

  const handleUpdateLote = async () => {
    if (!selectedMarker?.uuid) return;

    const body = {};
    if (loteUpdateForm.name.trim()) body.name = loteUpdateForm.name.trim();
    if (loteUpdateForm.slug.trim()) body.slug = loteUpdateForm.slug.trim();
    body.status = loteUpdateForm.status;
    if (loteUpdateForm.price !== '') body.price = parseFloat(loteUpdateForm.price);
    if (loteUpdateForm.area !== '') body.area_m2 = loteUpdateForm.area;
    if (loteUpdateForm.comments.trim()) body.comments = loteUpdateForm.comments.trim();
    else body.comments = null;

    setIsUpdatingLote(true);
    try {
      const res = await fetch(`https://notry-back.onrender.com/api/v1/lots/${selectedMarker.uuid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify(body)
      });

      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) { const msg = await res.text(); alert(`Error al actualizar: ${msg}`); return; }

      const updated = await res.json();
      setAnnotations(prev => prev.map(a =>
        a.id === selectedId ? {
          ...a,
          tooltip: updated.name ?? a.tooltip,
          slug: updated.slug ?? a.slug,
          status: updated.status ?? a.status,
          price: updated.price ?? a.price,
          area_m2: updated.area_m2 ?? a.area_m2,
          comments: updated.comments ?? a.comments,
        } : a
      ));
      alert('¡Datos del lote actualizados correctamente!');
    } catch (err) {
      console.error('Error al actualizar lote:', err);
      alert('Error de conexión al actualizar el lote.');
    } finally {
      setIsUpdatingLote(false);
    }
  };

  const handleAssignToExistingLot = async () => {
    if (!assignTargetId || !selectedMarker) return;
    const targetLot = annotations.find(a => a.id === assignTargetId);
    if (!targetLot?.uuid) return;

    setIsAssigning(true);
    try {
      const endpoint = mode === 'blueprint' ? 'update-blueprint-coordinates' : 'update-coordinates';
      const response = await fetch(`https://notry-back.onrender.com/api/v1/lots/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ uuid: targetLot.uuid, polygonPoints: selectedMarker.polygonPixels || [] })
      });

      if (response.status === 401) { handleLogout(); return; }
      if (!response.ok) { alert('Error al asignar coordenadas'); return; }

      setAnnotations(prev => prev
        .filter(a => a.id !== selectedId)
        .map(a => {
          if (a.id === assignTargetId) {
            const updated = { ...a };
            if (mode === 'blueprint') updated.blueprint_coordinates = selectedMarker.polygonPixels;
            else updated.panorama_coordinates = selectedMarker.polygonPixels;
            updated.polygonPixels = selectedMarker.polygonPixels;
            return updated;
          }
          return a;
        })
      );
      setSelectedId(assignTargetId);
    } catch (err) {
      console.error('Error al asignar:', err);
      alert('Error de conexión al asignar coordenadas.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleCreateLote = async () => {
    if (!loteForm.name.trim()) { alert('El nombre es requerido.'); return; }
    if (!loteoId) { alert('No se encontró el loteo_id.'); return; }
    if (!selectedMarker?.polygonPixels) { alert('Por favor, selecciona un polígono antes de crear un lote.'); return; }

    setIsCreatingLote(true);
    try {
      const res = await fetch('https://notry-back.onrender.com/api/v1/lots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: loteForm.name.trim(),
          ...(loteForm.slug.trim() && { slug: loteForm.slug.trim() }),
          status: loteForm.status,
          ...(loteForm.price !== '' && { price: parseFloat(loteForm.price) }),
          ...(loteForm.area !== '' && { area_m2: parseFloat(loteForm.area) }),
          ...(loteForm.comments?.trim() && { comments: loteForm.comments.trim() }),
          loteo_id: loteoId,
          ...(mode === 'blueprint' 
            ? { blueprint_coordinates: selectedMarker.polygonPixels }
            : { coordinates_360: selectedMarker.polygonPixels })
        })
      });

      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) { const msg = await res.text(); alert(`Error al crear lote: ${msg}`); return; }

      const lote = await res.json();

      setAnnotations(prev => prev.map(a =>
        a.id === selectedId ? {
          ...a,
          id: lote.id,
          uuid: lote.id,
          pending: false,
          tooltip: lote.name,
          precio: lote.price,
          area: lote.area_m2,
          estado: lote.status,
          ...(mode === 'blueprint'
            ? { blueprint_coordinates: a.polygonPixels }
            : { panorama_coordinates: a.polygonPixels })
        } : a
      ));
      setSelectedId(lote.id);
      setLoteForm({ name: '', slug: '', status: 'available', price: '', area: '', comments: '' });
      clearDraft();
    } catch (err) {
      console.error('Error al crear lote:', err);
      alert('Error de conexión al crear el lote.');
    } finally {
      setIsCreatingLote(false);
    }
  };

  const handleCreatePoi = async (form, polygonPixels) => {
    if (!form.title.trim()) { alert('El título es requerido.'); return; }
    if (!loteoId) { alert('No se encontró el loteo_id.'); return; }
    if (!polygonPixels || polygonPixels.length < 3) { alert('Por favor, dibuja un polígono antes de crear el POI.'); return; }

    setIsCreatingPoi(true);
    try {
      const payload = {
        loteo_id: loteoId,
        title: form.title.trim(),
        icon_type: form.icon_type.trim() || null,
        description: form.description.trim() || null,
        link_url: form.link_url.trim() || null,
        color: form.color || '#14b8a6',
        ...(mode === 'blueprint'
          ? { blueprint_coordinates: polygonPixels }
          : { coordinates_360: polygonPixels }),
      };
      const res = await createPoi(accessToken, payload);

      if (res?.id) {
        setAnnotations(prev => prev.map(a =>
          a.id === selectedId
            ? {
                ...a,
                id: res.id,
                uuid: res.id,
                pending: false,
                tooltip: res.title,
                icon_type: res.icon_type,
                description: res.description,
                link_url: res.link_url,
                color: res.color,
                ...(mode === 'blueprint'
                  ? { blueprint_coordinates: polygonPixels }
                  : { panorama_coordinates: polygonPixels }),
              }
            : a
        ));
        setSelectedId(res.id);
        clearDraft();
      }
    } catch (err) {
      console.error('Error al crear POI:', err);
      alert('Error de conexión al crear el POI.');
    } finally {
      setIsCreatingPoi(false);
    }
  };

  const handleUpdatePoi = async (poiId, form) => {
    if (!form.title.trim()) { alert('El título es requerido.'); return; }
    const poiUuid = poiId; // poiId passed from inspector is always the uuid field value
    setIsUpdatingPoi(true);
    try {
      const res = await updatePoi(accessToken, poiUuid, {
        title: form.title.trim(),
        icon_type: form.icon_type.trim() || null,
        description: form.description.trim() || null,
        link_url: form.link_url.trim() || null,
        color: form.color || '#14b8a6',
      });
      if (res?.id) {
        setAnnotations(prev => prev.map(a =>
          (a.uuid === poiUuid || a.id === poiUuid)
            ? {
                ...a,
                tooltip: res.title,
                title: res.title,
                icon_type: res.icon_type,
                description: res.description,
                link_url: res.link_url,
                color: res.color,
              }
            : a
        ));
      }
      alert('¡POI actualizado correctamente!');
    } catch (err) {
      console.error('Error al actualizar POI:', err);
      alert('Error al actualizar el POI.');
    } finally {
      setIsUpdatingPoi(false);
    }
  };

  const handleDeletePoi = async (poiId) => {
    try {
      if (poiId) await deletePoi(accessToken, poiId);
      setAnnotations(prev => prev.filter(a => a.uuid !== poiId && a.id !== poiId && a.id !== selectedId));
      setSelectedId(null);
    } catch (err) {
      console.error('Error al eliminar POI:', err);
      alert('Error de conexión al eliminar el POI.');
    }
  };

  const handleUpdatePoiCoordinates = async (poiId, polygonPixels) => {
    try {
      const fn = mode === 'blueprint' ? updatePoiBlueprintCoordinates : updatePoiCoordinates;
      await fn(accessToken, poiId, polygonPixels);
      alert('¡Coordenadas del POI actualizadas!');
    } catch (err) {
      console.error('Error al actualizar coordenadas del POI:', err);
      alert('Error al actualizar las coordenadas del POI.');
    }
  };

  const handleSaveTextAnnotations = async () => {
    if (!loteoId) {
      alert("No se encontró loteo_id en la URL. Agrega ?loteo_id=... al abrir el editor.");
      return;
    }
    const textAnnotations = annotations.filter(a => a.type === 'text');
    if (textAnnotations.length === 0) {
      alert("No hay anotaciones de texto para guardar.");
      return;
    }
    setIsSavingText(true);
    try {
      const response = await fetch(`https://notry-back.onrender.com/api/v1/loteos/${loteoId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ text_annotations: textAnnotations })
      });
      if (response.status === 401) { handleLogout(); return; }
      if (response.ok) {
        alert(`¡${textAnnotations.length} anotación(es) de texto guardadas correctamente!`);
        clearDraft();
      } else {
        const msg = await response.text();
        alert(`Error al guardar: ${response.status} - ${msg}`);
      }
    } catch (error) {
      console.error("Error al guardar anotaciones de texto:", error);
      alert("Error de conexión al intentar guardar.");
    } finally {
      setIsSavingText(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    const summary = { textOk: false, polyOk: 0, polyFailed: 0, polySkipped: 0, poiOk: 0, poiFailed: 0 };

    try {
      const textAnnotations = annotations.filter(a => a.type === 'text');
      const polygonsWithUuid = annotations.filter(a => a.type === 'polygon' && (a.uuid || a.id));
      const poisWithUuid = annotations.filter(a => a.type === 'poi' && (a.uuid || a.id));
      summary.polySkipped = annotations.filter(a => a.type === 'polygon' && !a.uuid).length;

      const polyRequests = polygonsWithUuid.flatMap(marker => {
          const reqs = [];
          if (marker.panorama_coordinates && marker.panorama_coordinates.length > 0) {
            reqs.push(fetchWithTimeout(`https://notry-back.onrender.com/api/v1/lots/update-coordinates`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
              body: JSON.stringify({ uuid: marker.uuid, polygonPoints: marker.panorama_coordinates })
            }));
          }
          if (marker.blueprint_coordinates && marker.blueprint_coordinates.length > 0) {
            reqs.push(fetchWithTimeout(`https://notry-back.onrender.com/api/v1/lots/update-blueprint-coordinates`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
              body: JSON.stringify({ uuid: marker.uuid, polygonPoints: marker.blueprint_coordinates })
            }));
          }
          return reqs;
        });

      const poiRequests = poisWithUuid.flatMap(poi => {
          const poiId = poi.uuid || poi.id;
          const reqs = [];
          if (poi.panorama_coordinates && poi.panorama_coordinates.length > 0) {
            reqs.push(fetchWithTimeout(`https://notry-back.onrender.com/api/v1/pois/update-coordinates`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
              body: JSON.stringify({ uuid: poiId, polygonPoints: poi.panorama_coordinates })
            }));
          }
          if (poi.blueprint_coordinates && poi.blueprint_coordinates.length > 0) {
            reqs.push(fetchWithTimeout(`https://notry-back.onrender.com/api/v1/pois/update-blueprint-coordinates`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
              body: JSON.stringify({ uuid: poiId, polygonPoints: poi.blueprint_coordinates })
            }));
          }
          // Also save POI metadata (title, icon_type, description, link_url, color)
          // title lives in tooltip field for POIs loaded from visor_data, title field is only set after individual save
          const poiTitle = poi.title ?? poi.tooltip;
          console.log('[handleSaveAll] POI metadata PATCH being queued:', { poiId, poiTitle, uuid: poi.uuid || poi.id });
          if (poiTitle && (poi.uuid || poi.id)) {
            reqs.push(fetchWithTimeout(`https://notry-back.onrender.com/api/v1/pois/${poiId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
              body: JSON.stringify({
                title: poiTitle,
                icon_type: poi.icon_type || null,
                description: poi.description || null,
                link_url: poi.link_url || null,
                color: poi.color || '#14b8a6',
              })
            }));
          }
          return reqs;
        });

      console.log('[handleSaveAll] Total requests to queue:', { poiRequests: poiRequests.length, polyRequests: polyRequests.length });
      const allResults = await Promise.all([
        loteoId && textAnnotations.length > 0
          ? fetchWithTimeout(`https://notry-back.onrender.com/api/v1/loteos/${loteoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ text_annotations: textAnnotations })
          })
          : Promise.resolve(null),
        ...polyRequests,
        ...poiRequests,
      ]);

      const [textRes, ...restResults] = allResults;
      const polyResults = restResults.slice(0, polyRequests.length);
      const poiResults = restResults.slice(polyRequests.length);

      if (textRes?.status === 401 || [...polyResults, ...poiResults].some(r => r?.status === 401)) {
        setSessionExpiredDuringSave(true);
        return;
      }

      summary.textOk = textRes?.ok ?? false;
      const polyCount = polyResults.length;
      const poiCount = poiResults.length;
      polyResults.forEach(r => { if (r.ok) summary.polyOk++; else summary.polyFailed++; });
      poiResults.forEach((r, i) => {
        console.log(`[handleSaveAll] POI result ${i}: status=${r?.status}, ok=${r?.ok}, url=${r?.url}`);
        if (r.ok) summary.poiOk++; else summary.poiFailed++;
      });

      const parts = [];
      if (summary.textOk) parts.push(`${textAnnotations.length} texto(s) guardados`);
      if (summary.polyOk > 0) parts.push(`${summary.polyOk} lote(s) actualizados`);
      if (summary.polyFailed > 0) parts.push(`${summary.polyFailed} lote(s) fallaron`);
      if (summary.poiOk > 0) parts.push(`${summary.poiOk} POI(s) actualizados`);
      if (summary.poiFailed > 0) parts.push(`${summary.poiFailed} POI(s) fallaron`);
      if (summary.polySkipped > 0) parts.push(`${summary.polySkipped} lote(s) sin UUID omitidos`);

      clearDraft();
      alert(parts.length ? parts.join(' · ') : 'Nada que guardar.');
    } catch (error) {
      if (error.name === 'AbortError') {
        alert('El servidor tardó demasiado en responder. Tu trabajo se guardó localmente. Intenta guardar de nuevo en unos segundos.');
      } else {
        console.error('Error en Guardar Todo:', error);
        alert('Error de conexión al guardar.');
      }
    } finally {
      setIsSavingAll(false);
    }
  };


  const handleLoteoSelect = (loteo) => {
    const dataUrl = `https://notry-back.onrender.com/api/v1/loteos/${loteo.id}/visor_data`;
    const editorUrl = `${window.location.origin}${window.location.pathname}?data=${encodeURIComponent(dataUrl)}`;
    window.open(editorUrl, '_blank');
  };

  const hasDataParam = new URLSearchParams(window.location.search).has('data');

  if (!accessToken) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!selectedLoteo && !hasDataParam) {
    return <LoteoList token={accessToken} onSelect={handleLoteoSelect} onAuthError={handleLogout} />;
  }

  return (
    <div className="editor-container">
      {pendingDraft && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1001,
          background: '#3a3a00', color: '#ffeb3b', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: '12px', fontSize: 'var(--text-md)'
        }}>
          <span>Hay cambios sin guardar de la sesión anterior ({new Date(pendingDraft.savedAt).toLocaleTimeString()}).</span>
          <button onClick={() => { setAnnotations(pendingDraft.annotations); setPendingDraft(null); }}
            style={{ background: '#ffeb3b', color: '#1a1a00', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontWeight: 'var(--weight-semibold)' }}>
            Restaurar
          </button>
          <button onClick={() => { clearDraft(); setPendingDraft(null); }}
            style={{ background: 'transparent', color: '#ffeb3b', border: '1px solid #ffeb3b', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>
            Descartar
          </button>
        </div>
      )}

      {sessionExpiredDuringSave && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1001,
          background: '#3a0000', color: '#ff8a80', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: '12px', fontSize: 'var(--text-md)'
        }}>
          <span>Sesión expirada. Tu trabajo está guardado localmente.</span>
          <button onClick={() => { setSessionExpiredDuringSave(false); handleLogout(); }}
            style={{ background: '#ff8a80', color: '#1a0000', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontWeight: 'var(--weight-semibold)' }}>
            Iniciar sesión
          </button>
        </div>
      )}

      <div className="viewer-pane">
        <div className="toolbar">
          <button
            className="tool-btn"
            onClick={() => window.location.href = window.location.origin + window.location.pathname}
            title="Volver al listado"
            style={{ marginRight: '10px', background: '#333' }}
          >
            <ArrowLeft size={20} />
          </button>

          <div style={{ height: '24px', width: '1px', background: '#444', marginRight: '10px' }} />

          {/* Mode toggle */}
          <button
            className={`tool-btn ${mode === 'panorama' ? 'active' : ''}`}
            onClick={() => handleModeChange('panorama')}
            title="Modo Panorama"
            disabled={!panoramaUrl}
            style={{ opacity: !panoramaUrl ? 0.4 : 1 }}
          >
            <Camera size={20} />
          </button>
          {blueprintUrl && (
            <button
              className={`tool-btn ${mode === 'blueprint' ? 'active' : ''}`}
              onClick={() => handleModeChange('blueprint')}
              title="Modo Blueprint"
            >
              <Grid3x3 size={20} />
            </button>
          )}

          <div style={{ height: '24px', width: '1px', background: '#444', marginRight: '10px' }} />

          {tools.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTool(tool.id);
                  if (tool.id !== 'polygon' && tool.id !== 'poi') setDrawingPolygon([]);
                }}
                title={tool.title}
                disabled={!panoramaUrl}
              >
                <Icon size={20} />
              </button>
            )
          })}
        </div>

        <button
          onClick={handleLogout}
          style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: 'var(--text-base)'
          }}
        >
          Cerrar Sesión
        </button>

        <button
          className="inspector-toggle-btn"
          onClick={() => setInspectorOpen(o => !o)}
          title="Toggle Inspector"
          aria-label="Toggle inspector panel"
        >
          {inspectorOpen ? '×' : '☰'}
        </button>

        {(activeTool === 'polygon' || activeTool === 'poi') && drawingPolygon.length > 0 && (
          <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', gap: '1rem' }}>
            <button className="btn-primary" onClick={finishPolygon} style={{ background: '#28a745', width: 'auto' }}>Finalizar Polígono ({drawingPolygon.length} pts)</button>
            <button className="btn-primary" onClick={cancelPolygon} style={{ background: '#dc3545', width: 'auto' }}>Cancelar</button>
          </div>
        )}

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
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa', textAlign: 'center', padding: '2rem' }}>
              <ImageIcon size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <h2>{mode === 'blueprint' ? 'No hay blueprint cargado' : 'No hay imagen panorámica cargada'}</h2>
              <p style={{ maxWidth: '400px', lineHeight: '1.5' }}>Usa el botón <b>"Cargar Imagen"</b> en el panel derecho para subir tu fotografía equirrectangular (JPG/PNG) localmente y empezar a mapear.</p>
            </div>
          )}
        </div>
      </div>

      <div className={`inspector-pane${inspectorOpen ? ' open' : ''}`}>
        <div className="inspector-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Inspector</span>
          <span style={{ fontSize: 'var(--text-base)', color: '#aaa' }}>{annotations.length} capas</span>
        </div>

        <div className="inspector-body">
          {!selectedMarker ? (

            <div style={{ color: '#888', fontSize: 'var(--text-lg)' }}>
              <p>Ningún marcador seleccionado.</p>
              <p>Selecciona una herramienta y haz clic en la imagen, o selecciona uno existente.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: '#c5a059', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{selectedMarker.type}</h3>
                <button onClick={removeSelected} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: 'var(--text-base)' }}>Borrar</button>
              </div>

              {selectedMarker.type !== 'polygon' && (
                <div className="inspector-section">
                  <span className="inspector-section-title">General</span>
                  <span className="inspector-label">ID</span>
                  <input className="inspector-input" value={selectedMarker.id} onChange={e => updateSelected('id', e.target.value)} />
                </div>
              )}

              {selectedMarker.type !== 'text' && selectedMarker.type !== 'polygon' && selectedMarker.type !== 'poi' && (
                <div className="inspector-section">
                  <span className="inspector-section-title">Datos</span>
                  <span className="inspector-label">Tooltip</span>
                  <input className="inspector-input" value={selectedMarker.tooltip || ''} onChange={e => updateSelected('tooltip', e.target.value)} />
                  <span className="inspector-label">Precio</span>
                  <input className="inspector-input" value={selectedMarker.precio || ''} onChange={e => updateSelected('precio', e.target.value)} />
                  <span className="inspector-label">Área</span>
                  <input className="inspector-input" value={selectedMarker.area || ''} onChange={e => updateSelected('area', e.target.value)} />
                </div>
              )}

              {selectedMarker.type === 'text' && (
                <>
                  <div className="inspector-section">
                    <span className="inspector-section-title">Contenido</span>
                    <span className="inspector-label">Texto</span>
                    <input className="inspector-input" value={selectedMarker.tooltip || ''} onChange={e => updateSelected('tooltip', e.target.value)} />
                    <span className="inspector-label">Color del texto</span>
                    <input type="color" value={selectedMarker.textColor || '#ffffff'} onChange={e => updateSelected('textColor', e.target.value)} style={{ width: '40px', height: '30px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                    <span className="inspector-label">Fondo</span>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <input type="color" value={selectedMarker.bgColor || '#ffffff'} onChange={e => updateSelected('bgColor', e.target.value)} style={{ width: '40px', height: '30px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                      <input type="range" min="0" max="1" step="0.05" value={selectedMarker.bgOpacity !== undefined ? selectedMarker.bgOpacity : 0} onChange={e => updateSelected('bgOpacity', parseFloat(e.target.value))} style={{ flex: 1 }} />
                    </div>
                    <span className="inspector-label">Tamaño de fuente (px)</span>
                    <input className="inspector-input" type="number" min="8" max="200" value={selectedMarker.fontSize ?? 14} onChange={e => updateSelected('fontSize', parseInt(e.target.value))} />
                  </div>

                  <div className="inspector-section">
                    <span className="inspector-section-title">Tamaño</span>
                    <span className="inspector-label">Ancho</span>
                    <input className="inspector-input" type="number" value={selectedMarker.size?.width || 0} onChange={e => updateNestedSelected('size', 'width', parseInt(e.target.value))} />
                    <span className="inspector-label">Alto</span>
                    <input className="inspector-input" type="number" value={selectedMarker.size?.height || 0} onChange={e => updateNestedSelected('size', 'height', parseInt(e.target.value))} />
                  </div>
                </>
              )}

              {selectedMarker.type !== 'polygon' && selectedMarker.type !== 'poi' && (
                <div className="inspector-section">
                  <span className="inspector-section-title">Estilos SVG</span>
                  <span className="inspector-label">Relleno (fill)</span>
                  <input className="inspector-input" value={selectedMarker.svgStyle?.fill || selectedMarker.style?.backgroundColor || ''} onChange={e => { updateNestedSelected('svgStyle', 'fill', e.target.value); updateNestedSelected('style', 'backgroundColor', e.target.value); }} placeholder="rgba(0,0,0,0.5)" />
                  <span className="inspector-label">Borde (stroke)</span>
                  <input className="inspector-input" value={selectedMarker.svgStyle?.stroke || selectedMarker.style?.borderColor || ''} onChange={e => { updateNestedSelected('svgStyle', 'stroke', e.target.value); updateNestedSelected('style', 'borderColor', e.target.value); }} />
                </div>
              )}

              {selectedMarker.type === 'polygon' && (
                <div className="inspector-section">
                  {selectedMarker.pending ? (
                    (() => {
                      const lotsWithEmptyCoords = annotations.filter(a =>
                        a.type === 'polygon' && !a.pending && a.uuid &&
                        (mode === 'panorama'
                          ? (!a.panorama_coordinates || a.panorama_coordinates.length === 0)
                          : (!a.blueprint_coordinates || a.blueprint_coordinates.length === 0))
                      );
                      return (
                        <>
                          {/* Toggle buttons */}
                          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                            <button
                              onClick={() => setPendingMode('create')}
                              style={{
                                flex: 1, padding: '5px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: 'var(--text-base)',
                                background: pendingMode === 'create' ? '#ffa500' : '#333', color: pendingMode === 'create' ? '#000' : '#aaa'
                              }}
                            >
                              Nuevo lote
                            </button>
                            <button
                              onClick={() => setPendingMode('assign')}
                              disabled={lotsWithEmptyCoords.length === 0}
                              style={{
                                flex: 1, padding: '5px', border: 'none', borderRadius: '4px', cursor: lotsWithEmptyCoords.length === 0 ? 'not-allowed' : 'pointer', fontSize: 'var(--text-base)',
                                background: pendingMode === 'assign' ? '#0d6efd' : '#333',
                                color: pendingMode === 'assign' ? '#fff' : lotsWithEmptyCoords.length === 0 ? '#555' : '#aaa'
                              }}
                            >
                              Asignar existente {lotsWithEmptyCoords.length > 0 ? `(${lotsWithEmptyCoords.length})` : ''}
                            </button>
                          </div>

                          {pendingMode === 'create' ? (
                            <>
                              <span className="inspector-section-title" style={{ color: '#ffa500' }}>Crear Lote</span>
                              <span className="inspector-label">Nombre *</span>
                              <input className="inspector-input" value={loteForm.name} onChange={e => setLoteForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Lote 07" />
                              <span className="inspector-label">Slug</span>
                              <input className="inspector-input" value={loteForm.slug} onChange={e => setLoteForm(f => ({ ...f, slug: e.target.value }))} placeholder="Ej: lote-07" />
                              <span className="inspector-label">Estado</span>
                              <select className="inspector-input" value={loteForm.status} onChange={e => setLoteForm(f => ({ ...f, status: e.target.value }))}>
                                <option value="available">Disponible</option>
                                <option value="reserved">Reservado</option>
                                <option value="sold">Vendido</option>
                              </select>
                              <span className="inspector-label">Precio</span>
                              <input className="inspector-input" type="number" value={loteForm.price} onChange={e => setLoteForm(f => ({ ...f, price: e.target.value }))} placeholder="Ej: 150000" />
                              <span className="inspector-label">Área (m²)</span>
                              <input className="inspector-input" type="number" value={loteForm.area} onChange={e => setLoteForm(f => ({ ...f, area: e.target.value }))} placeholder="Ej: 150" />
                              <span className="inspector-label">Observaciones</span>
                              <textarea
                                className="inspector-input"
                                value={loteForm.comments}
                                onChange={e => setLoteForm(f => ({ ...f, comments: e.target.value }))}
                                placeholder="Notas u observaciones..."
                                rows={3}
                                style={{ resize: 'vertical' }}
                              />
                              <button
                                onClick={handleCreateLote}
                                disabled={isCreatingLote}
                                className="btn-primary"
                                style={{ marginTop: '4px', background: isCreatingLote ? '#555' : '#28a745' }}
                              >
                                {isCreatingLote ? 'Creando...' : 'Crear Lote'}
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="inspector-section-title" style={{ color: '#0d6efd' }}>Asignar a lote existente</span>
                              <span className="inspector-label" style={{ marginBottom: '4px' }}>
                                Lotes sin coords de {mode === 'panorama' ? 'panorama' : 'plano'}
                              </span>
                              <select
                                className="inspector-input"
                                value={assignTargetId}
                                onChange={e => setAssignTargetId(e.target.value)}
                              >
                                <option value="">— Seleccionar lote —</option>
                                {lotsWithEmptyCoords.map(lot => (
                                  <option key={lot.id} value={lot.id}>
                                    {lot.tooltip || lot.uuid}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={handleAssignToExistingLot}
                                disabled={!assignTargetId || isAssigning}
                                className="btn-primary"
                                style={{ marginTop: '4px', background: !assignTargetId || isAssigning ? '#555' : '#0d6efd' }}
                              >
                                {isAssigning ? 'Asignando...' : 'Asignar coordenadas'}
                              </button>
                            </>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <>
                      <span className="inspector-section-title">Base de datos</span>
                      <span className="inspector-label">UUID</span>
                      <input className="inspector-input" value={selectedMarker.uuid || ''} onChange={e => updateSelected('uuid', e.target.value)} placeholder="3fa85f64-...-2c963f66afa6" />
                      <button onClick={() => handlePolygonDbUpdate(selectedMarker)} className="btn-primary" style={{ marginTop: '4px' }}>
                        Actualizar coordenadas
                      </button>

                      <span className="inspector-section-title" style={{ marginTop: '12px' }}>Datos del lote</span>
                      <span className="inspector-label">Nombre</span>
                      <input className="inspector-input" value={loteUpdateForm.name} onChange={e => setLoteUpdateForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Lote 07" />
                      <span className="inspector-label">Slug</span>
                      <input className="inspector-input" value={loteUpdateForm.slug} onChange={e => setLoteUpdateForm(f => ({ ...f, slug: e.target.value }))} placeholder="Ej: lote-07" />
                      <span className="inspector-label">Estado</span>
                      <select className="inspector-input" value={loteUpdateForm.status} onChange={e => setLoteUpdateForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="available">Disponible</option>
                        <option value="reserved">Reservado</option>
                        <option value="sold">Vendido</option>
                      </select>
                      <span className="inspector-label">Precio</span>
                      <input className="inspector-input" type="number" value={loteUpdateForm.price} onChange={e => setLoteUpdateForm(f => ({ ...f, price: e.target.value }))} placeholder="Ej: 150000" />
                      <span className="inspector-label">Área (m²)</span>
                      <input className="inspector-input" type="text" value={loteUpdateForm.area} onChange={e => setLoteUpdateForm(f => ({ ...f, area: e.target.value }))} placeholder="Ej: 200m2" />
                      <span className="inspector-label">Observaciones</span>
                      <textarea
                        className="inspector-input"
                        value={loteUpdateForm.comments}
                        onChange={e => setLoteUpdateForm(f => ({ ...f, comments: e.target.value }))}
                        placeholder="Notas u observaciones..."
                        rows={3}
                        style={{ resize: 'vertical' }}
                      />
                      <button
                        onClick={handleUpdateLote}
                        disabled={isUpdatingLote}
                        className="btn-primary"
                        style={{ marginTop: '4px', background: isUpdatingLote ? '#555' : '#0d6efd' }}
                      >
                        {isUpdatingLote ? 'Guardando...' : 'Actualizar datos'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {selectedMarker.type === 'poi' && (
                <POIInspector
                  poi={selectedMarker}
                  onCreatePoi={handleCreatePoi}
                  onUpdatePoi={handleUpdatePoi}
                  onDeletePoi={handleDeletePoi}
                  onUpdatePoiCoordinates={handleUpdatePoiCoordinates}
                  onDeselect={() => { setSelectedId(null); setInspectorOpen(false); }}
                  onFieldChange={(field, value) => {
                    if (field === 'title') {
                      setAnnotations(annotations.map(a =>
                        a.id === selectedId ? { ...a, title: value, tooltip: value } : a
                      ));
                    } else {
                      setAnnotations(annotations.map(a =>
                        a.id === selectedId ? { ...a, [field]: value } : a
                      ));
                    }
                  }}
                  mode={mode}
                  isSaving={isCreatingPoi || isUpdatingPoi}
                />
              )}
            </>
          )}
        </div>

        <div className="inspector-footer">
          <button
            className="btn-primary"
            onClick={handleSaveAll}
            disabled={isSavingAll}
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: isSavingAll ? '#555' : '#28a745' }}
          >
            <Download size={18} /> {isSavingAll ? 'Guardando...' : 'Guardar Todo'}
          </button>
          <button
            className="btn-primary"
            onClick={handleSaveTextAnnotations}
            disabled={isSavingText}
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            <Type size={18} /> {isSavingText ? 'Guardando...' : 'Guardar textos'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

import { useState, useRef, useEffect } from 'react';
import { MousePointer2, Pentagon, Type, Download, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import EditorViewer from './components/EditorViewer';
import LoginScreen from './components/LoginScreen';
import LoteoList from './components/LoteoList';
import './App.css';

function App() {
  const [activeTool, setActiveTool] = useState('select');
  const [annotations, setAnnotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [drawingPolygon, setDrawingPolygon] = useState([]);

  const [panoramaUrl, setPanoramaUrl] = useState(null);
  const [isLoadingDefault, setIsLoadingDefault] = useState(true);
  const [loteoId, setLoteoId] = useState(null);
  const [isSavingText, setIsSavingText] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [accessToken, setAccessToken] = useState(() => {
    const urlToken = new URLSearchParams(window.location.search).get('token');
    if (urlToken) {
      localStorage.setItem('notry_token', urlToken);
      return urlToken;
    }
    return localStorage.getItem('notry_token');
  });
  const [selectedLoteo, setSelectedLoteo] = useState(null);
  const [loteForm, setLoteForm] = useState({ name: '', slug: '', status: 'available', price: '', area: '' });
  const [isCreatingLote, setIsCreatingLote] = useState(false);

  const handleLogin = (token) => {
    localStorage.setItem('notry_token', token);
    setAccessToken(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('notry_token');
    setAccessToken(null);
  };

  // Carga datos desde ?data=URL o desde el panorama.jpg del proyecto padre
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataUrl = params.get('data');

    if (dataUrl) {
      const match = dataUrl.match(/\/loteos\/([^/?]+)/);
      if (match) setLoteoId(match[1]);
    }

    if (dataUrl) {
      fetch(dataUrl)
        .then(res => {
          if (!res.ok) throw new Error(`Error ${res.status}`);
          return res.json();
        })
        .then(async data => {
          if (data.annotations && Array.isArray(data.annotations)) {
            setAnnotations(data.annotations.map((a, i) => ({ ...a, id: a.id ?? a.uuid ?? `ann-${i}` })));
          }
          if (data.panoramaUrl && typeof data.panoramaUrl === 'string') {
            try {
              const imgRes = await fetch(data.panoramaUrl);
              if (imgRes.ok) {
                const blob = await imgRes.blob();
                setPanoramaUrl(URL.createObjectURL(blob));
              } else {
                setPanoramaUrl(data.panoramaUrl);
              }
            } catch {
              setPanoramaUrl(data.panoramaUrl);
            }
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
      .catch(() => { })
      .finally(() => setIsLoadingDefault(false));
  }, []);

  const tools = [
    { id: 'select', icon: MousePointer2, title: 'Seleccionar' },
    { id: 'polygon', icon: Pentagon, title: 'Polígono' },
    { id: 'text', icon: Type, title: 'Texto' },
  ];

  const handleViewerClick = (textureX, textureY) => {
    if (activeTool === 'select') {
      setSelectedId(null);
      return;
    }

    if (activeTool === 'polygon') {
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
  };

  const finishPolygon = () => {
    if (drawingPolygon.length < 3) {
      alert("El polígono necesita al menos 3 puntos");
      return;
    }
    const newId = `polygon-${Date.now()}`;
    const newAnn = {
      id: newId,
      type: 'polygon',
      pending: true,
      polygonPixels: drawingPolygon,
      tooltip: 'Nuevo lote (sin guardar)',
      svgStyle: { fill: 'rgba(255,165,0,0.15)', stroke: '#ffa500', strokeWidth: '2', strokeDasharray: '8,4' }
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

  const displayAnnotations = [...annotations];
  if (drawingPolygon.length > 0) {
    displayAnnotations.push({
      id: 'temp-drawing',
      type: 'polyline',
      polylinePixels: [...drawingPolygon, drawingPolygon[drawingPolygon.length - 1]],
      svgStyle: { stroke: '#ff0', strokeWidth: '3', strokeDasharray: '5,5' }
    });
  }
  if (drawingPolygon.length > 0) {
    drawingPolygon.forEach((pt, i) => {
      displayAnnotations.push({
        id: `temp-pt-${i}`,
        type: 'point',
        position: { textureX: pt[0], textureY: pt[1] },
        radius: i === 0 ? 6 : 4,
        svgStyle: { fill: '#ff0' }
      });
    });
  }

  const selectedMarker = annotations.find(a => a.id === selectedId);

  if (selectedMarker && selectedMarker.type === 'polygon' && selectedMarker.polygonPixels) {
    selectedMarker.polygonPixels.forEach((pt, i) => {
      displayAnnotations.push({
        id: `edit-corner-${selectedMarker.id}-${i}`,
        type: 'point',
        position: { textureX: pt[0], textureY: pt[1] },
        radius: 6,
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
        radius: 5,
        svgStyle: { fill: '#fff', stroke: '#0f0', strokeWidth: '2', opacity: 0.8, cursor: 'copy' },
        tooltip: 'Arrastra para añadir punto'
      });
    });
  }

  const handlePolygonUpdate = (markerId, newPolygonPixels) => {
    setAnnotations(prevAnnotations => prevAnnotations.map(a => {
      if (a.id === markerId) {
        return { ...a, polygonPixels: newPolygonPixels };
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

    setAnnotations(annotations.filter(a => a.id !== selectedId));
    setSelectedId(null);
  };

  const handlePolygonDbUpdate = async (marker) => {
    if (!marker.uuid) {
      alert("Por favor, ingresa un UUID");
      return;
    }

    const payload = {
      uuid: marker.uuid,
      polygonPoints: marker.polygonPixels || []
    };

    try {
      // TODO: Reemplazar por la URL real de tu API
      const response = await fetch('https://notry-back.onrender.com/api/v1/lots/update-coordinates', {
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

  const handleCreateLote = async () => {
    if (!loteForm.name.trim()) { alert('El nombre es requerido.'); return; }
    if (!loteoId) { alert('No se encontró el loteo_id.'); return; }

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
          loteo_id: loteoId,
          coordinates_360: selectedMarker.polygonPixels,
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
          estado: lote.status
        } : a
      ));
      setSelectedId(lote.id);
      setLoteForm({ name: '', slug: '', status: 'available', price: '', area: '' });
    } catch (err) {
      console.error('Error al crear lote:', err);
      alert('Error de conexión al crear el lote.');
    } finally {
      setIsCreatingLote(false);
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
    const summary = { textOk: false, polyOk: 0, polyFailed: 0, polySkipped: 0 };

    try {
      const textAnnotations = annotations.filter(a => a.type === 'text');
      const polygonsWithUuid = annotations.filter(a => a.type === 'polygon' && a.uuid);
      summary.polySkipped = annotations.filter(a => a.type === 'polygon' && !a.uuid).length;

      const [textRes, ...polyResults] = await Promise.all([
        loteoId && textAnnotations.length > 0
          ? fetch(`https://notry-back.onrender.com/api/v1/loteos/${loteoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ text_annotations: textAnnotations })
          })
          : Promise.resolve(null),
        ...polygonsWithUuid.map(marker =>
          fetch('https://notry-back.onrender.com/api/v1/lots/update-coordinates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
            body: JSON.stringify({ uuid: marker.uuid, polygonPoints: marker.polygonPixels || [] })
          })
        )
      ]);

      if (textRes?.status === 401 || polyResults.some(r => r?.status === 401)) {
        handleLogout();
        return;
      }

      summary.textOk = textRes?.ok ?? false;
      polyResults.forEach(r => { if (r.ok) summary.polyOk++; else summary.polyFailed++; });

      const parts = [];
      if (summary.textOk) parts.push(`${textAnnotations.length} texto(s) guardados`);
      if (summary.polyOk > 0) parts.push(`${summary.polyOk} polígono(s) actualizados`);
      if (summary.polyFailed > 0) parts.push(`${summary.polyFailed} polígono(s) fallaron`);
      if (summary.polySkipped > 0) parts.push(`${summary.polySkipped} polígono(s) sin UUID omitidos`);
      alert(parts.length ? parts.join(' · ') : 'Nada que guardar.');
    } catch (error) {
      console.error('Error en Guardar Todo:', error);
      alert('Error de conexión al guardar.');
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

          {tools.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveTool(tool.id);
                  if (tool.id !== 'polygon') setDrawingPolygon([]);
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
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            zIndex: 10,
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '0.8rem'
          }}
        >
          Cerrar Sesión
        </button>

        {activeTool === 'polygon' && drawingPolygon.length > 0 && (
          <div style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: '1rem' }}>
            <button className="btn-primary" onClick={finishPolygon} style={{ background: '#28a745', width: 'auto' }}>Finalizar Polígono ({drawingPolygon.length} pts)</button>
            <button className="btn-primary" onClick={cancelPolygon} style={{ background: '#dc3545', width: 'auto' }}>Cancelar</button>
          </div>
        )}

        <div style={{ width: '100%', height: '100%' }}>
          {isLoadingDefault ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa' }}>
              Cargando motor 3D...
            </div>
          ) : panoramaUrl ? (
            <EditorViewer
              panoramaUrl={panoramaUrl}
              activeTool={activeTool}
              annotations={displayAnnotations}
              onClick={handleViewerClick}
              onMarkerSelect={(id) => {
                if (activeTool === 'polygon' && id === 'temp-pt-0') {
                  finishPolygon();
                } else {
                  setSelectedId(id);
                }
              }}
              onPolygonUpdate={handlePolygonUpdate}
              onMarkerDragEnd={handleMarkerDragEnd}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa', textAlign: 'center', padding: '2rem' }}>
              <ImageIcon size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <h2>No hay imagen panorámica cargada</h2>
              <p style={{ maxWidth: '400px', lineHeight: '1.5' }}>Usa el botón <b>"Cargar Imagen"</b> en el panel derecho para subir tu fotografía equirrectangular (JPG/PNG) localmente y empezar a mapear.</p>
            </div>
          )}
        </div>
      </div>

      <div className="inspector-pane">
        <div className="inspector-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Inspector</span>
          <span style={{ fontSize: '0.8rem', color: '#aaa' }}>{annotations.length} capas</span>
        </div>

        <div className="inspector-body">
          {!selectedMarker ? (

            <div style={{ color: '#888', fontSize: '0.9rem' }}>
              <p>Ningún marcador seleccionado.</p>
              <p>Selecciona una herramienta y haz clic en la imagen, o selecciona uno existente.</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#c5a059', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{selectedMarker.type}</h3>
                <button onClick={removeSelected} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem' }}>Borrar</button>
              </div>

              {selectedMarker.type !== 'polygon' && (
                <div className="inspector-section">
                  <span className="inspector-section-title">General</span>
                  <span className="inspector-label">ID</span>
                  <input className="inspector-input" value={selectedMarker.id} onChange={e => updateSelected('id', e.target.value)} />
                </div>
              )}

              {selectedMarker.type !== 'text' && selectedMarker.type !== 'polygon' && (
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

              {selectedMarker.type !== 'polygon' && (
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
                      <span className="inspector-section-title">Base de datos</span>
                      <span className="inspector-label">UUID</span>
                      <input className="inspector-input" value={selectedMarker.uuid || ''} onChange={e => updateSelected('uuid', e.target.value)} placeholder="3fa85f64-...-2c963f66afa6" />
                      <button onClick={() => handlePolygonDbUpdate(selectedMarker)} className="btn-primary" style={{ marginTop: '4px' }}>
                        Actualizar coordenadas
                      </button>
                    </>
                  )}
                </div>
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

import { useState, useRef, useEffect } from 'react';
import { MousePointer2, Pentagon, Square, Circle, Type, MapPin, Download, Upload, Image as ImageIcon } from 'lucide-react';
import EditorViewer from './components/EditorViewer';
import './App.css';

function App() {
  const [activeTool, setActiveTool] = useState('select');
  const [annotations, setAnnotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [drawingPolygon, setDrawingPolygon] = useState([]);

  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const [panoramaUrl, setPanoramaUrl] = useState(null);
  const [panoramaFilename, setPanoramaFilename] = useState('');
  const [isLoadingDefault, setIsLoadingDefault] = useState(true);

  // Carga datos desde ?data=URL o desde el panorama.jpg del proyecto padre
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataUrl = params.get('data');

    if (dataUrl) {
      fetch(dataUrl)
        .then(res => {
          if (!res.ok) throw new Error(`Error ${res.status}`);
          return res.json();
        })
        .then(async data => {
          if (data.annotations && Array.isArray(data.annotations)) {
            setAnnotations(data.annotations);
          }
          if (data.panoramaUrl && typeof data.panoramaUrl === 'string') {
            setPanoramaFilename(data.panoramaUrl);
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
          setPanoramaFilename('/panorama.jpg');
        }
      })
      .catch(() => { })
      .finally(() => setIsLoadingDefault(false));
  }, []);

  const tools = [
    { id: 'select', icon: MousePointer2, title: 'Seleccionar' },
    { id: 'polygon', icon: Pentagon, title: 'Polígono' },
    { id: 'rectangle', icon: Square, title: 'Rectángulo' },
    { id: 'circle', icon: Circle, title: 'Círculo' },
    { id: 'point', icon: MapPin, title: 'Punto' },
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

    if (activeTool === 'rectangle') {
      newAnn.type = 'polygon';
      newAnn.polygonPixels = [
        [textureX - 50, textureY - 50],
        [textureX + 50, textureY - 50],
        [textureX + 50, textureY + 50],
        [textureX - 50, textureY + 50]
      ];
      delete newAnn.position;
    }
    if (activeTool === 'circle' || activeTool === 'point') newAnn.radius = 20;
    if (activeTool === 'text') {
      newAnn.tooltip = "Texto";
      newAnn.textColor = "#000000";
      newAnn.bgColor = "#ffffff";
      newAnn.bgOpacity = 1;
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
      polygonPixels: drawingPolygon,
      tooltip: 'Nuevo polígono',
      svgStyle: { fill: 'rgba(0,100,255,0.3)', stroke: '#06c', strokeWidth: '2' }
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

  const removeSelected = () => {
    setAnnotations(annotations.filter(a => a.id !== selectedId));
    setSelectedId(null);
  };

  const handleExport = () => {
    const data = {
      panoramaUrl: panoramaFilename || "/panorama.jpg",
      annotations: annotations
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'viewer.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImageImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPanoramaFilename("/" + file.name);
    setPanoramaUrl(URL.createObjectURL(file));
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
      const response = await fetch('http://127.0.0.1:8000/api/v1/lots/update-coordinates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

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

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.annotations && Array.isArray(data.annotations)) {
          setAnnotations(data.annotations);
          setSelectedId(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
          alert('El archivo no tiene el formato correcto de viewer.json');
        }
      } catch (err) {
        alert("JSON Inválido importado");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="editor-container">
      <div className="viewer-pane">
        <div className="toolbar">
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
            <div style={{ color: '#aaa', fontSize: '0.9rem' }}>
              <p>Ningún marcador seleccionado.</p>
              <p>Selecciona una herramienta y haz clic en la imagen, o selecciona uno existente.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#1a73e8' }}>{selectedMarker.type.toUpperCase()}</h3>
                <button onClick={removeSelected} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>Borrar</button>
              </div>

              <label style={{ fontSize: '0.85rem', color: '#aaa' }}>ID</label>
              <input value={selectedMarker.id} onChange={e => updateSelected('id', e.target.value)} style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }} />

              {selectedMarker.type !== 'text' ? (
                <>
                  <label style={{ fontSize: '0.85rem', color: '#aaa' }}>Tooltip</label>
                  <input value={selectedMarker.tooltip || ''} onChange={e => updateSelected('tooltip', e.target.value)} style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }} />

                  <label style={{ fontSize: '0.85rem', color: '#aaa' }}>Precio</label>
                  <input value={selectedMarker.precio || ''} onChange={e => updateSelected('precio', e.target.value)} style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }} />

                  <label style={{ fontSize: '0.85rem', color: '#aaa' }}>Área</label>
                  <input value={selectedMarker.area || ''} onChange={e => updateSelected('area', e.target.value)} style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }} />

                </>
              ) : (
                <>
                  <label style={{ fontSize: '0.85rem', color: '#aaa' }}>Texto a mostrar (Tooltip)</label>
                  <input
                    value={selectedMarker.tooltip || ''}
                    onChange={e => updateSelected('tooltip', e.target.value)}
                    style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }}
                  />

                  <label style={{ fontSize: '0.85rem', color: '#aaa', marginTop: '10px' }}>Color del Texto</label>
                  <input type="color" value={selectedMarker.textColor || '#000000'} onChange={e => updateSelected('textColor', e.target.value)} style={{ width: '40px', height: '30px', padding: 0, border: 'none', background: 'transparent' }} />

                  <label style={{ fontSize: '0.85rem', color: '#aaa', marginTop: '10px' }}>Fondo del Contenedor</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="color" value={selectedMarker.bgColor || '#ffffff'} onChange={e => updateSelected('bgColor', e.target.value)} style={{ width: '40px', height: '30px', padding: 0, border: 'none', background: 'transparent' }} />
                    <input type="range" min="0" max="1" step="0.05" value={selectedMarker.bgOpacity !== undefined ? selectedMarker.bgOpacity : 1} onChange={e => updateSelected('bgOpacity', parseFloat(e.target.value))} style={{ flex: 1 }} />
                  </div>
                </>
              )}

              {(selectedMarker.type === 'polygon' || selectedMarker.type === 'rectangle') && (
                <>
                  <label style={{ fontSize: '0.85rem', color: '#aaa', marginTop: '10px' }}>Estilo de Polígono</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="color" value={selectedMarker.fillColor || '#ff0000'} onChange={e => updateSelected('fillColor', e.target.value)} style={{ width: '40px', height: '30px', padding: 0, border: 'none', background: 'transparent' }} />
                    <input type="range" min="0" max="1" step="0.05" value={selectedMarker.fillOpacity !== undefined ? selectedMarker.fillOpacity : 0.5} onChange={e => updateSelected('fillOpacity', parseFloat(e.target.value))} style={{ flex: 1 }} />
                  </div>
                </>
              )}

              {(selectedMarker.type === 'text') && (
                <>
                  <label style={{ fontSize: '0.85rem', color: '#aaa', marginTop: '10px' }}>Ancho</label>
                  <input type="number" value={selectedMarker.size?.width || 0} onChange={e => updateNestedSelected('size', 'width', parseInt(e.target.value))} style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }} />

                  <label style={{ fontSize: '0.85rem', color: '#aaa' }}>Alto</label>
                  <input type="number" value={selectedMarker.size?.height || 0} onChange={e => updateNestedSelected('size', 'height', parseInt(e.target.value))} style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }} />
                </>
              )}

              <hr style={{ borderColor: '#444', width: '100%', margin: '15px 0' }} />
              <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: 600 }}>Estilos SVG</p>

              <label style={{ fontSize: '0.85rem', color: '#aaa' }}>Color de relleno (fill)</label>
              <input value={selectedMarker.svgStyle?.fill || selectedMarker.style?.backgroundColor || ''} onChange={e => { updateNestedSelected('svgStyle', 'fill', e.target.value); updateNestedSelected('style', 'backgroundColor', e.target.value); }} style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }} placeholder="rgba(0,0,0,0.5)" />

              <label style={{ fontSize: '0.85rem', color: '#aaa' }}>Color de borde (stroke)</label>
              <input value={selectedMarker.svgStyle?.stroke || selectedMarker.style?.borderColor || ''} onChange={e => { updateNestedSelected('svgStyle', 'stroke', e.target.value); updateNestedSelected('style', 'borderColor', e.target.value) }} style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }} />

              {selectedMarker.type === 'polygon' && (
                <>
                  <hr style={{ borderColor: '#444', width: '100%', margin: '15px 0' }} />
                  <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: 600 }}>Servidor de BD</p>

                  <label style={{ fontSize: '0.85rem', color: '#aaa' }}>UUID</label>
                  <input
                    value={selectedMarker.uuid || ''}
                    onChange={e => updateSelected('uuid', e.target.value)}
                    style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '6px', borderRadius: '4px' }}
                    placeholder="3fa85f64-...-2c963f66afa6"
                  />

                  <button
                    onClick={() => handlePolygonDbUpdate(selectedMarker)}
                    style={{ marginTop: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', padding: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Actualizar
                  </button>
                </>
              )}

            </div>
          )}
        </div>

        <div className="inspector-footer" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input type="file" ref={imageInputRef} accept="image/*" onChange={handleImageImport} style={{ display: 'none' }} id="import-img" />
          <label htmlFor="import-img" className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', backgroundColor: '#555', textAlign: 'center' }}>
            <ImageIcon size={18} /> Cargar Imagen
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input type="file" ref={fileInputRef} accept=".json" onChange={handleImport} style={{ display: 'none' }} id="import-json" />
            <label htmlFor="import-json" className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flex: 1, backgroundColor: '#444', textAlign: 'center', padding: '0.75rem 0' }}>
              <Upload size={18} /> JSON
            </label>
            <button className="btn-primary" onClick={handleExport} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flex: 1, padding: '0.75rem 0' }}>
              <Download size={18} /> JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

import { useRef, useEffect } from 'react';
import { Download } from 'lucide-react';
import POIInspector from './POIInspector';
import PendingPolygonInspector from './PendingPolygonInspector';
import LoteInspector from './LoteInspector';

export default function InspectorPanel({
  inspectorOpen,
  annotations,
  selectedMarker,
  mode,
  homography,
  onImportFromBlueprint,
  onDelete,
  updateSelected,
  updateNestedSelected,
  // Lot — pending
  pendingMode, onPendingModeChange,
  isCreatingLote, onCreateLote,
  assignTargetId, onAssignTargetChange,
  isAssigning, onAssign,
  // Lot — existing
  isSavingLote, onSaveLote,
  // POI
  onCreatePoi, onSavePoi, onDeletePoi,
  onDeselectPoi, onPoiFieldChange,
  isCreatingPoi, isSavingPoi,
  // Save
  isSavingAll, onSaveAll,
}) {
  const textInputRef = useRef(null);
  useEffect(() => {
    if (selectedMarker?.type === 'text') {
      setTimeout(() => { textInputRef.current?.focus(); textInputRef.current?.select(); }, 50);
    }
  }, [selectedMarker?.id]);

  const lotsWithEmptyCoords = annotations.filter(a =>
    a.type === 'polygon' && !a.pending && a.uuid &&
    (mode === 'panorama'
      ? (!a.panorama_coordinates || a.panorama_coordinates.length === 0)
      : (!a.blueprint_coordinates || a.blueprint_coordinates.length === 0))
  );

  return (
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
            {selectedMarker.type !== 'poi' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: '#c5a059', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {selectedMarker.type}
                </h3>
                <button onClick={onDelete} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: 'var(--text-base)' }}>
                  Borrar
                </button>
              </div>
            )}

            {selectedMarker.type !== 'polygon' && selectedMarker.type !== 'poi' && (
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
                  <input ref={textInputRef} className="inspector-input" value={selectedMarker.tooltip || ''} onChange={e => updateSelected('tooltip', e.target.value)} />
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

              </>
            )}

            {selectedMarker.type !== 'polygon' && selectedMarker.type !== 'poi' && selectedMarker.type !== 'text' && (
              <div className="inspector-section">
                <span className="inspector-section-title">Estilos SVG</span>
                <span className="inspector-label">Relleno (fill)</span>
                <input className="inspector-input" value={selectedMarker.svgStyle?.fill || selectedMarker.style?.backgroundColor || ''} onChange={e => { updateNestedSelected('svgStyle', 'fill', e.target.value); updateNestedSelected('style', 'backgroundColor', e.target.value); }} placeholder="rgba(0,0,0,0.5)" />
                <span className="inspector-label">Borde (stroke)</span>
                <input className="inspector-input" value={selectedMarker.svgStyle?.stroke || selectedMarker.style?.borderColor || ''} onChange={e => { updateNestedSelected('svgStyle', 'stroke', e.target.value); updateNestedSelected('style', 'borderColor', e.target.value); }} />
              </div>
            )}

            {selectedMarker.type === 'polygon' && (
              selectedMarker.pending ? (
                <PendingPolygonInspector
                  pendingMode={pendingMode}
                  onPendingModeChange={onPendingModeChange}
                  selectedMarker={selectedMarker}
                  onUpdateSelected={updateSelected}
                  isCreatingLote={isCreatingLote}
                  onCreateLote={onCreateLote}
                  lotsWithEmptyCoords={lotsWithEmptyCoords}
                  assignTargetId={assignTargetId}
                  onAssignTargetChange={onAssignTargetChange}
                  isAssigning={isAssigning}
                  onAssign={onAssign}
                  editorMode={mode}
                />
              ) : (
                <LoteInspector
                  selectedMarker={selectedMarker}
                  onUpdateSelected={updateSelected}
                  isSavingLote={isSavingLote}
                  onSaveLote={onSaveLote}
                  homography={homography}
                  onImportFromBlueprint={onImportFromBlueprint}
                />
              )
            )}

            {selectedMarker.type === 'poi' && (
              <POIInspector
                poi={selectedMarker}
                onCreatePoi={onCreatePoi}
                onSavePoi={onSavePoi}
                onDeletePoi={onDeletePoi}
                onDeselect={onDeselectPoi}
                onFieldChange={onPoiFieldChange}
                isSaving={isCreatingPoi || isSavingPoi}
              />
            )}
          </>
        )}
      </div>

      <div className="inspector-footer">
        <button
          className="btn-primary"
          onClick={onSaveAll}
          disabled={isSavingAll}
          style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: isSavingAll ? '#555' : '#28a745' }}
        >
          <Download size={18} /> {isSavingAll ? 'Guardando...' : 'Guardar Todo'}
        </button>
      </div>
    </div>
  );
}

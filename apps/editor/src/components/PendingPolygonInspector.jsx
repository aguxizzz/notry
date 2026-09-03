export default function PendingPolygonInspector({
  pendingMode,
  onPendingModeChange,
  selectedMarker,
  onUpdateSelected,
  isCreatingLote,
  onCreateLote,
  lotsWithEmptyCoords,
  assignTargetId,
  onAssignTargetChange,
  isAssigning,
  onAssign,
  editorMode,
}) {
  const name     = selectedMarker.tooltip || '';
  const status   = selectedMarker.status || 'available';
  const price    = selectedMarker.price != null ? String(selectedMarker.price) : '';
  const area     = selectedMarker.area_m2 != null ? String(selectedMarker.area_m2) : '';
  const comments = selectedMarker.comments || '';

  return (
    <>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        <button
          onClick={() => onPendingModeChange('create')}
          style={{
            flex: 1, padding: '5px', border: 'none', borderRadius: '4px',
            cursor: 'pointer', fontSize: 'var(--text-base)',
            background: pendingMode === 'create' ? '#ffa500' : '#333',
            color: pendingMode === 'create' ? '#000' : '#aaa',
          }}
        >
          Nuevo lote
        </button>
        <button
          onClick={() => onPendingModeChange('assign')}
          disabled={lotsWithEmptyCoords.length === 0}
          style={{
            flex: 1, padding: '5px', border: 'none', borderRadius: '4px',
            cursor: lotsWithEmptyCoords.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 'var(--text-base)',
            background: pendingMode === 'assign' ? '#0d6efd' : '#333',
            color: pendingMode === 'assign' ? '#fff' : lotsWithEmptyCoords.length === 0 ? '#555' : '#aaa',
          }}
        >
          Asignar existente {lotsWithEmptyCoords.length > 0 ? `(${lotsWithEmptyCoords.length})` : ''}
        </button>
      </div>

      {pendingMode === 'create' ? (
        <>
          <span className="inspector-section-title" style={{ color: '#ffa500' }}>Crear Lote</span>
          <span className="inspector-label">Nombre *</span>
          <input className="inspector-input" value={name} onChange={e => onUpdateSelected('tooltip', e.target.value)} placeholder="Ej: Lote 07" />
          <span className="inspector-label">Estado</span>
          <select className="inspector-input" value={status} onChange={e => onUpdateSelected('status', e.target.value)}>
            <option value="available">Disponible</option>
            <option value="reserved">Reservado</option>
            <option value="sold">Vendido</option>
          </select>
          <span className="inspector-label">Precio</span>
          <input
            className="inspector-input"
            type="number"
            value={price}
            onChange={e => onUpdateSelected('price', e.target.value)}
            onBlur={() => { if (price === '') onUpdateSelected('price', 0); }}
            placeholder="Ej: 150000"
          />
          <span className="inspector-label">Área (m²)</span>
          <input
            className="inspector-input"
            type="number"
            value={area}
            onChange={e => onUpdateSelected('area_m2', e.target.value)}
            onBlur={() => { if (area === '') onUpdateSelected('area_m2', 0); }}
            placeholder="Ej: 150"
          />
          <span className="inspector-label">Observaciones</span>
          <textarea
            className="inspector-input"
            value={comments}
            onChange={e => onUpdateSelected('comments', e.target.value)}
            placeholder="Notas u observaciones..."
            rows={3}
            style={{ resize: 'vertical' }}
          />
          <button
            onClick={onCreateLote}
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
            Lotes sin coords de {editorMode === 'panorama' ? 'panorama' : 'plano'}
          </span>
          <select
            className="inspector-input"
            value={assignTargetId}
            onChange={e => onAssignTargetChange(e.target.value)}
          >
            <option value="">— Seleccionar lote —</option>
            {lotsWithEmptyCoords.map(lot => (
              <option key={lot.id} value={lot.id}>{lot.tooltip || lot.uuid}</option>
            ))}
          </select>
          <button
            onClick={onAssign}
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
}

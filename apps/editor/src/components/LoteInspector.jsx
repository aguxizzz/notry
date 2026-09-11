import { useState } from 'react';

export default function LoteInspector({
  selectedMarker,
  onUpdateSelected,
  homography,
  onImportFromBlueprint,
  onUnimportSelected,
}) {
  const name    = selectedMarker.tooltip || '';
  const status  = selectedMarker.status || selectedMarker.estado || 'available';
  const price   = selectedMarker.price != null ? String(selectedMarker.price) : (selectedMarker.precio != null ? String(selectedMarker.precio) : '');
  const area    = selectedMarker.area_m2 != null ? String(selectedMarker.area_m2) : (selectedMarker.area != null ? String(selectedMarker.area) : '');
  const comments = selectedMarker.comments || '';

  const [justImportedId, setJustImportedId] = useState(null);
  const justImported = justImportedId === selectedMarker.id;

  const alreadyImported = (selectedMarker.panorama_coordinates?.length ?? 0) > 0;

  const handleImport = () => {
    const importedId = selectedMarker.id;
    onImportFromBlueprint();
    setJustImportedId(importedId);
    setTimeout(() => {
      setJustImportedId(currentId => currentId === importedId ? null : currentId);
    }, 2000);
  };

  return (
    <>
      <div className="inspector-section">
        <span className="inspector-section-title">Datos del lote</span>
        <span className="inspector-label">Nombre</span>
        <input className="inspector-input" value={name} onChange={e => onUpdateSelected('tooltip', e.target.value)} placeholder="Ej: Lote 07" />
        <span className="inspector-label">Estado</span>
        <select className="inspector-input" value={status} onChange={e => onUpdateSelected('status', e.target.value)}>
          <option value="available">Disponible</option>
          <option value="reserved">Reservado</option>
          <option value="sold">Vendido</option>
          <option value="unavailable">No disponible</option>
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
          placeholder="Ej: 200"
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
      </div>

      {homography && selectedMarker.blueprint_coordinates?.length >= 3 && (
        <div className="inspector-section" style={{ borderTop: '1px solid #383840', paddingTop: '10px', marginTop: '4px' }}>
          <span className="inspector-section-title">Importar desde Blueprint</span>
          <p style={{ fontSize: 'var(--text-base)', color: '#888', margin: '4px 0 8px', lineHeight: 1.4 }}>
            {alreadyImported
              ? 'Ya importado. Re-importar aplica la calibración actual sobre las coordenadas existentes.'
              : 'Proyecta las coordenadas del blueprint al panorama usando la calibración activa.'}
          </p>
          <button
            type="button"
            onClick={handleImport}
            className={`editor-btn editor-btn--secondary lot-projection-action${justImported ? ' is-success' : ''}`}
          >
            {justImported
              ? 'Importado ✓'
              : alreadyImported
                ? 'Re-importar a Panorama'
                : 'Importar a Panorama'}
          </button>
          {alreadyImported && (
            <button
              type="button"
              onClick={onUnimportSelected}
              className="editor-btn editor-btn--danger lot-projection-action"
              style={{ marginTop: 'var(--space-xs)' }}
            >
              Eliminar de la importación
            </button>
          )}
        </div>
      )}
    </>
  );
}

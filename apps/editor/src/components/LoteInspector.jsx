import { useState, useEffect } from 'react';

export default function LoteInspector({
  selectedMarker,
  onUpdateSelected,
  isSavingLote,
  onSaveLote,
  homography,
  onImportFromBlueprint,
}) {
  const name    = selectedMarker.tooltip || '';
  const slug    = selectedMarker.slug || '';
  const status  = selectedMarker.status || selectedMarker.estado || 'available';
  const price   = selectedMarker.price != null ? String(selectedMarker.price) : (selectedMarker.precio != null ? String(selectedMarker.precio) : '');
  const area    = selectedMarker.area_m2 != null ? String(selectedMarker.area_m2) : (selectedMarker.area != null ? String(selectedMarker.area) : '');
  const comments = selectedMarker.comments || '';

  const [justImported, setJustImported] = useState(false);

  // Reset flash when selection changes
  useEffect(() => {
    setJustImported(false);
  }, [selectedMarker.id]);

  const alreadyImported = (selectedMarker.panorama_coordinates?.length ?? 0) > 0;

  const handleImport = () => {
    onImportFromBlueprint();
    setJustImported(true);
    setTimeout(() => setJustImported(false), 2000);
  };

  return (
    <>
      <div className="inspector-section">
        <span className="inspector-section-title">Datos del lote</span>
        <span className="inspector-label">Nombre</span>
        <input className="inspector-input" value={name} onChange={e => onUpdateSelected('tooltip', e.target.value)} placeholder="Ej: Lote 07" />
        <span className="inspector-label">Slug</span>
        <input className="inspector-input" value={slug} onChange={e => onUpdateSelected('slug', e.target.value)} placeholder="Ej: lote-07" />
        <span className="inspector-label">Estado</span>
        <select className="inspector-input" value={status} onChange={e => onUpdateSelected('status', e.target.value)}>
          <option value="available">Disponible</option>
          <option value="reserved">Reservado</option>
          <option value="sold">Vendido</option>
        </select>
        <span className="inspector-label">Precio</span>
        <input className="inspector-input" type="number" value={price} onChange={e => onUpdateSelected('price', e.target.value)} placeholder="Ej: 150000" />
        <span className="inspector-label">Área (m²)</span>
        <input className="inspector-input" type="text" value={area} onChange={e => onUpdateSelected('area_m2', e.target.value)} placeholder="Ej: 200" />
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
          <span className="inspector-section-title" style={{ color: '#f59e0b' }}>Importar desde Blueprint</span>
          <p style={{ fontSize: 'var(--text-base)', color: '#888', margin: '4px 0 8px', lineHeight: 1.4 }}>
            {alreadyImported
              ? 'Ya importado. Re-importar aplica la calibración actual sobre las coordenadas existentes.'
              : 'Proyecta las coordenadas del blueprint al panorama usando la calibración activa.'}
          </p>
          <button
            onClick={handleImport}
            className="btn-primary"
            style={justImported
              ? { background: '#166534', borderColor: '#22c55e', color: '#bbf7d0', width: '100%' }
              : { background: '#92400e', borderColor: '#f59e0b', color: '#fde68a', width: '100%' }
            }
          >
            {justImported
              ? 'Importado ✓'
              : alreadyImported
                ? 'Re-importar a Panorama'
                : 'Importar a Panorama'}
          </button>
        </div>
      )}

      <button
        onClick={onSaveLote}
        disabled={isSavingLote}
        className="btn-primary"
        style={{ marginTop: '4px' }}
      >
        {isSavingLote ? 'Guardando...' : 'Guardar lote'}
      </button>

    </>
  );
}

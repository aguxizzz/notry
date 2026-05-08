import { useState, useEffect } from 'react';
import {
  DoorOpen, Dumbbell, Waves, Car, Utensils, ShoppingBag,
  Eye, TreePine, Landmark, HelpCircle
} from 'lucide-react';

/**
 * @typedef {Object} PoiIconOption
 * @property {string} value - Icon identifier (stored as icon_type)
 * @property {React.ComponentType<{size?: number}>} Icon - Lucide icon component
 * @property {string} label - Human-readable label
 */

const POI_ICON_OPTIONS = [
  { value: 'entrance',   Icon: DoorOpen,    label: 'Entrada' },
  { value: 'gym',        Icon: Dumbbell,    label: 'Gimnasio' },
  { value: 'pool',       Icon: Waves,       label: 'Piscina' },
  { value: 'parking',    Icon: Car,         label: 'Estacionamiento' },
  { value: 'restaurant',Icon: Utensils,    label: 'Restaurante' },
  { value: 'shop',       Icon: ShoppingBag, label: 'Compras' },
  { value: 'view',       Icon: Eye,        label: 'Vista' },
  { value: 'park',       Icon: TreePine,    label: 'Parque' },
  { value: 'landmark',   Icon: Landmark,   label: 'Punto clave' },
  { value: 'other',      Icon: HelpCircle, label: 'Otro' },
];

/**
 * POI-specific inspector panel.
 * Handles both creation (pending POI) and editing (saved POI) modes.
 *
 * @param {Object} props
 * @param {Object} props.poi - The POI annotation object from the annotations array
 * @param {Function} props.onCreatePoi - (poiFormState, polygonPixels) => void
 * @param {Function} props.onUpdatePoi - (poiId, poiFormState) => void
 * @param {Function} props.onDeletePoi - (poiId) => void
 * @param {Function} props.onUpdatePoiCoordinates - (poiId, polygonPixels) => void
 * @param {Function} props.onDeselect - () => void
 * @param {boolean} props.mode - 'panorama' | 'blueprint' - current editing mode
 * @param {boolean} props.isSaving - loading flag for async operations
 */
export default function POIInspector({
  poi,
  onCreatePoi,
  onUpdatePoi,
  onDeletePoi,
  onUpdatePoiCoordinates,
  onDeselect,
  onFieldChange,
  mode,
  isSaving,
}) {
  const isPending = poi.pending === true;

  const [form, setForm] = useState({
    title: poi.tooltip || '',
    icon_type: poi.icon_type || '',
    description: poi.description || '',
    link_url: poi.link_url || '',
    color: poi.color || '#14b8a6',
  });

  // Sync form when selected POI changes
  useEffect(() => {
    setForm({
      title: poi.tooltip || '',
      icon_type: poi.icon_type || '',
      description: poi.description || '',
      link_url: poi.link_url || '',
      color: poi.color || '#14b8a6',
    });
  }, [poi.id]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (onFieldChange) onFieldChange(field, value);
  };

  const handleCreate = () => {
    if (!form.title.trim()) {
      alert('El título es requerido.');
      return;
    }
    onCreatePoi(form, poi.polygonPixels);
  };

  const handleUpdate = () => {
    if (!form.title.trim()) {
      alert('El título es requerido.');
      return;
    }
    if (!poi.uuid) return;
    onUpdatePoi(poi.uuid, form);
  };

  const handleDelete = () => {
    if (!poi.uuid) {
      // Just remove from canvas locally
      onDeletePoi(null);
      return;
    }
    if (!confirm(`¿Eliminar el POI "${poi.tooltip}"? Esta acción no se puede deshacer.`)) return;
    onDeletePoi(poi.uuid);
  };

  const handleSaveCoordinates = () => {
    if (!poi.uuid || !poi.polygonPixels) return;
    onUpdatePoiCoordinates(poi.uuid, poi.polygonPixels);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: '#14b8a6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          POI
        </h3>
        <button
          onClick={handleDelete}
          style={{
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: 'var(--text-base)',
          }}
        >
          Borrar
        </button>
      </div>

      {isPending ? (
        <>
          <div className="inspector-section">
            <span className="inspector-section-title" style={{ color: '#ffa500' }}>Crear POI</span>

            <span className="inspector-label">Título *</span>
            <input
              className="inspector-input"
              value={form.title}
              onChange={e => handleChange('title', e.target.value)}
              placeholder="Ej: Pileta climatizada"
            />

            <span className="inspector-label">Tipo de icono</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {POI_ICON_OPTIONS.map(({ value, Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  onClick={() => handleChange('icon_type', value)}
                  style={{
                    background: form.icon_type === value ? '#14b8a6' : 'transparent',
                    border: `1px solid ${form.icon_type === value ? '#14b8a6' : '#383840'}`,
                    borderRadius: '6px',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    color: form.icon_type === value ? '#fff' : '#888',
                  }}
                >
                  <Icon size={18} />
                  <span style={{ fontSize: '10px' }}>{label}</span>
                </button>
              ))}
            </div>

            <span className="inspector-label">Descripción</span>
            <textarea
              className="inspector-input"
              value={form.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Descripción del lugar..."
              rows={3}
              style={{ resize: 'vertical' }}
            />

            <span className="inspector-label">URL (opcional)</span>
            <input
              className="inspector-input"
              value={form.link_url}
              onChange={e => handleChange('link_url', e.target.value)}
              placeholder="https://..."
            />

            <span className="inspector-label">Color</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="color"
                value={form.color}
                onChange={e => handleChange('color', e.target.value)}
                style={{ width: '40px', height: '30px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
              />
              <input
                className="inspector-input"
                value={form.color}
                onChange={e => handleChange('color', e.target.value)}
                placeholder="#14b8a6"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={isSaving}
            className="btn-primary"
            style={{ marginTop: '4px', background: isSaving ? '#555' : '#28a745' }}
          >
            {isSaving ? 'Creando...' : 'Crear POI'}
          </button>
        </>
      ) : (
        <>
          <div className="inspector-section">
            <span className="inspector-section-title">Base de datos</span>
            <span className="inspector-label">UUID</span>
            <input className="inspector-input" value={poi.uuid || ''} readOnly style={{ opacity: 0.6 }} />

            <button
              onClick={handleSaveCoordinates}
              disabled={isSaving}
              className="btn-primary"
              style={{ marginTop: '4px', background: isSaving ? '#555' : '#0d6efd' }}
            >
              {isSaving ? 'Guardando coords...' : 'Actualizar coordenadas'}
            </button>
          </div>

          <div className="inspector-section">
            <span className="inspector-section-title">Datos del POI</span>

            <span className="inspector-label">Título</span>
            <input
              className="inspector-input"
              value={form.title}
              onChange={e => handleChange('title', e.target.value)}
              placeholder="Ej: Pileta climatizada"
            />

            <span className="inspector-label">Tipo de icono</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {POI_ICON_OPTIONS.map(({ value, Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  onClick={() => handleChange('icon_type', value)}
                  style={{
                    background: form.icon_type === value ? '#14b8a6' : 'transparent',
                    border: `1px solid ${form.icon_type === value ? '#14b8a6' : '#383840'}`,
                    borderRadius: '6px',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    color: form.icon_type === value ? '#fff' : '#888',
                  }}
                >
                  <Icon size={18} />
                  <span style={{ fontSize: '10px' }}>{label}</span>
                </button>
              ))}
            </div>

            <span className="inspector-label">Descripción</span>
            <textarea
              className="inspector-input"
              value={form.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Descripción del lugar..."
              rows={3}
              style={{ resize: 'vertical' }}
            />

            <span className="inspector-label">URL (opcional)</span>
            <input
              className="inspector-input"
              value={form.link_url}
              onChange={e => handleChange('link_url', e.target.value)}
              placeholder="https://..."
            />

            <span className="inspector-label">Color</span>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="color"
                value={form.color}
                onChange={e => handleChange('color', e.target.value)}
                style={{ width: '40px', height: '30px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
              />
              <input
                className="inspector-input"
                value={form.color}
                onChange={e => handleChange('color', e.target.value)}
                placeholder="#14b8a6"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <button
            onClick={handleUpdate}
            disabled={isSaving}
            className="btn-primary"
            style={{ marginTop: '4px', background: isSaving ? '#555' : '#0d6efd' }}
          >
            {isSaving ? 'Guardando...' : 'Actualizar POI'}
          </button>
        </>
      )}
    </>
  );
}
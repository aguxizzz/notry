import { useState, useEffect } from 'react';
import {
  DoorOpen, Dumbbell, Waves, Car, Utensils, ShoppingBag,
  Eye, TreePine, Landmark, HelpCircle
} from 'lucide-react';

const POI_ICON_OPTIONS = [
  { value: 'entrance',    Icon: DoorOpen,    label: 'Entrada' },
  { value: 'gym',         Icon: Dumbbell,    label: 'Gimnasio' },
  { value: 'pool',        Icon: Waves,       label: 'Piscina' },
  { value: 'parking',     Icon: Car,         label: 'Estacionamiento' },
  { value: 'restaurant',  Icon: Utensils,    label: 'Restaurante' },
  { value: 'shop',        Icon: ShoppingBag, label: 'Compras' },
  { value: 'view',        Icon: Eye,         label: 'Vista' },
  { value: 'park',        Icon: TreePine,    label: 'Parque' },
  { value: 'landmark',    Icon: Landmark,    label: 'Punto clave' },
  { value: 'other',       Icon: HelpCircle,  label: 'Otro' },
];

const IconGrid = ({ value: selected, onChange }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
    {POI_ICON_OPTIONS.map(({ value, Icon, label }) => (
      <button
        key={value}
        type="button"
        title={label}
        onClick={() => onChange(value)}
        style={{
          background: selected === value ? '#14b8a6' : 'transparent',
          border: `1px solid ${selected === value ? '#14b8a6' : '#383840'}`,
          borderRadius: '6px',
          padding: '7px 10px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '8px',
          color: selected === value ? '#fff' : '#888',
          whiteSpace: 'nowrap',
        }}
      >
        <Icon size={15} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: '11px' }}>{label}</span>
      </button>
    ))}
  </div>
);

export default function POIInspector({
  poi,
  onCreatePoi,
  onSavePoi,
  onDeletePoi,
  onDeselect,
  onFieldChange,
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

  const handleDelete = () => {
    if (!poi.uuid) { onDeletePoi(null); return; }
    if (!confirm(`¿Eliminar el POI "${poi.tooltip}"? Esta acción no se puede deshacer.`)) return;
    onDeletePoi(poi.uuid);
  };

  const formFields = (
    <>
      <span className="inspector-label">Título *</span>
      <input
        className="inspector-input"
        value={form.title}
        onChange={e => handleChange('title', e.target.value)}
        placeholder="Ej: Pileta climatizada"
      />

      <span className="inspector-label">Tipo de icono</span>
      <IconGrid value={form.icon_type} onChange={v => handleChange('icon_type', v)} />

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
    </>
  );

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: '#14b8a6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          POI
        </h3>
        <button
          onClick={handleDelete}
          style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: 'var(--text-base)' }}
        >
          Borrar
        </button>
      </div>

      {isPending ? (
        <>
          <div className="inspector-section">
            <span className="inspector-section-title" style={{ color: '#ffa500' }}>Crear POI</span>
            {formFields}
          </div>
          <button
            onClick={() => onCreatePoi(form, poi.polygonPixels)}
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
            <span className="inspector-section-title">Datos del POI</span>
            {formFields}
          </div>
          <button
            onClick={() => onSavePoi(poi.uuid, form, poi.polygonPixels)}
            disabled={isSaving}
            className="btn-primary"
            style={{ marginTop: '4px' }}
          >
            {isSaving ? 'Guardando...' : 'Guardar POI'}
          </button>
        </>
      )}
    </>
  );
}

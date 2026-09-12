import { createElement } from 'react';
import {
  DoorOpen, Dumbbell, Waves, Car, Utensils, ShoppingBag,
  Eye, TreePine, Landmark, HelpCircle
} from 'lucide-react';
import ImageUploadField from './ImageUploadField';

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
        {createElement(Icon, { size: 15, style: { flexShrink: 0 } })}
        <span style={{ fontSize: '11px' }}>{label}</span>
      </button>
    ))}
  </div>
);

export default function POIInspector({
  poi,
  onDelete,
  siblingStages = [],
  onFieldChange,
  uploadFn,
}) {
  const isPending = poi.pending === true;

  const form = {
    title: poi.tooltip || '',
    icon_type: poi.icon_type || '',
    description: poi.description || '',
    link_url: poi.link_url || '',
    image_url: poi.image_url || '',
    color: poi.color || '#14b8a6',
    target_loteo_id: poi.target_loteo_id || '',
    callout_stem_height: poi.callout_stem_height ?? 96,
  };

  const handleChange = (field, value) => {
    onFieldChange?.(field, value);
  };

  const hasImage = !!form.image_url;

  const fieldGroupStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' };
  const disabledFieldStyle = { ...fieldGroupStyle, opacity: 0.4, pointerEvents: 'none' };

  const formFields = (
    <>
      <span className="inspector-label">Título *</span>
      <input
        className="inspector-input"
        value={form.title}
        onChange={e => handleChange('title', e.target.value)}
        placeholder="Ej: Pileta climatizada"
      />

      <span className="inspector-label">Imagen</span>
      <ImageUploadField
        showLabel={false}
        value={form.image_url}
        uploadFn={uploadFn}
        onUpload={({ url }) => handleChange('image_url', url)}
        onRemove={() => handleChange('image_url', '')}
      />

      {hasImage && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
          Con imagen cargada, el visor muestra solo la foto: el ícono, la descripción, la URL y "ir a etapa" no se ven. Quitá la imagen para volver a usarlos.
        </p>
      )}

      <div style={hasImage ? disabledFieldStyle : fieldGroupStyle}>
        <span className="inspector-label">Tipo de icono</span>
        <IconGrid value={form.icon_type} onChange={v => handleChange('icon_type', v)} />
      </div>

      <div style={hasImage ? disabledFieldStyle : fieldGroupStyle}>
        <span className="inspector-label">Descripción</span>
        <textarea
          className="inspector-input"
          value={form.description}
          onChange={e => handleChange('description', e.target.value)}
          placeholder="Descripción del lugar..."
          rows={3}
          style={{ resize: 'vertical' }}
          disabled={hasImage}
        />
      </div>

      {siblingStages.length > 0 && (
        <div style={hasImage ? disabledFieldStyle : fieldGroupStyle}>
          <span className="inspector-label">Ir a etapa (opcional)</span>
          <select
            className="inspector-input"
            value={form.target_loteo_id}
            onChange={e => handleChange('target_loteo_id', e.target.value)}
            disabled={hasImage}
          >
            <option value="">— Ninguna —</option>
            {siblingStages.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={hasImage ? disabledFieldStyle : fieldGroupStyle}>
        <span className="inspector-label">URL (opcional)</span>
        <input
          className="inspector-input"
          value={form.link_url}
          onChange={e => handleChange('link_url', e.target.value)}
          placeholder="https://..."
          disabled={hasImage || !!form.target_loteo_id}
          title={form.target_loteo_id ? 'Deshabilitado: el POI ya navega a una etapa' : undefined}
        />
      </div>

      <span className="inspector-label">Alto de línea — <strong>{form.callout_stem_height}px</strong></span>
      <input
        type="range"
        value={form.callout_stem_height}
        onChange={e => handleChange('callout_stem_height', Number(e.target.value))}
        min={40}
        max={260}
        step={4}
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
          onClick={onDelete}
          style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: 'var(--text-base)' }}
        >
          Borrar
        </button>
      </div>

      <div className="inspector-section">
        <span className="inspector-section-title" style={isPending ? { color: '#ffa500' } : undefined}>
          {isPending ? 'Crear POI' : 'Datos del POI'}
        </span>
        {formFields}
      </div>
    </>
  );
}

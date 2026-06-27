import { useState } from 'react';
import ImageUploadField from '../ImageUploadField';
import '../../ui/components/Modal.css';

const FONT_OPTIONS = [
  { value: '', label: 'Default (Space Grotesk)' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Helvetica Neue, Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Playfair Display, serif', label: 'Playfair Display' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat' },
  { value: 'Lato, sans-serif', label: 'Lato' },
];

const DEFAULT_PRIMARY_COLOR = '#c5a059';
const DEFAULT_ACCENT_COLOR = '#b38a3f';

const EMPTY_BRANDING = {
  primary_color: DEFAULT_PRIMARY_COLOR,
  accent_color: DEFAULT_ACCENT_COLOR,
  font_family: '',
  logo_primary: '',
  logo_secondary: '',
};

export default function ProjectFormModal({ isOpen, onClose, onSubmit, loading, error, initialData = null, apiFetch, uploadFn, onUploadEvent }) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [branding, setBranding] = useState({
    ...EMPTY_BRANDING,
    ...(initialData?.branding ?? {}),
  });

  if (!isOpen) return null;

  function setBrandingField(field, value) {
    setBranding(b => ({ ...b, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const brandingPayload = Object.fromEntries(
      Object.entries(branding).filter(([, v]) => v !== '')
    );
    onSubmit({ name, branding: Object.keys(brandingPayload).length ? brandingPayload : null });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card project-form-modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{initialData ? 'Editar proyecto' : 'Nuevo proyecto'}</h3>

        <form onSubmit={handleSubmit} className="project-form">
          <div className="form-group">
            <label className="form-label">Nombre del proyecto</label>
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Paseo Berlin"
              required
            />
          </div>

          <div className="form-section-title">Branding visual</div>

          <div className="project-colors-row">
            <div className="form-group">
              <label className="form-label">Color principal</label>
              <div className="color-input-row">
                <input type="color" value={branding.primary_color || DEFAULT_PRIMARY_COLOR} onChange={e => setBrandingField('primary_color', e.target.value)} />
                <input className="form-input" type="text" value={branding.primary_color} onChange={e => setBrandingField('primary_color', e.target.value)} placeholder="#c5a059" maxLength={9} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Color de acento</label>
              <div className="color-input-row">
                <input type="color" value={branding.accent_color || DEFAULT_ACCENT_COLOR} onChange={e => setBrandingField('accent_color', e.target.value)} />
                <input className="form-input" type="text" value={branding.accent_color} onChange={e => setBrandingField('accent_color', e.target.value)} placeholder="#b38a3f" maxLength={9} />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Tipografía</label>
            <select className="form-input" value={branding.font_family} onChange={e => setBrandingField('font_family', e.target.value)}>
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Logo principal</label>
            <ImageUploadField
              value={branding.logo_primary}
              onUpload={result => setBrandingField('logo_primary', result?.url ?? result)}
              label="Logo principal"
              showLabel={false}
              apiFetch={apiFetch}
              uploadFn={uploadFn}
              onUploadEvent={onUploadEvent}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Logo secundario</label>
            <ImageUploadField
              value={branding.logo_secondary}
              onUpload={result => setBrandingField('logo_secondary', result?.url ?? result)}
              label="Logo secundario"
              showLabel={false}
              apiFetch={apiFetch}
              uploadFn={uploadFn}
              onUploadEvent={onUploadEvent}
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="submit" className="btn-primary" disabled={loading || !name.trim()}>
              {loading ? 'Guardando...' : initialData ? 'Guardar cambios' : 'Crear proyecto'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

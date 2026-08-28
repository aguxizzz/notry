import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ImageUploadField from '../ImageUploadField';
import { Button } from '../../ui/components';
import { SIMULADOR_URL } from '../../config';
import '../../ui/components/Modal.css';

// Fuentes del selector de tipografía que no carga la app por defecto.
// Se cargan perezosamente al abrir el modal para previsualizar cada opción.
const FONT_PREVIEW_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400&family=Lato:wght@400&family=Montserrat:wght@400&family=Playfair+Display:wght@400&display=swap';

const FONT_OPTIONS = [
  { value: '', label: 'Default (Space Grotesk)' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Helvetica Neue, Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Playfair Display, serif', label: 'Playfair Display' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat' },
  { value: 'Lato, sans-serif', label: 'Lato' },
];

const DEFAULT_PLANS = [
  { id: '120', installments: 120 },
  { id: '144', installments: 144 },
  { id: '180', installments: 180 },
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

export default function ProjectFormModal({ isOpen, onClose, onSubmit, loading, error, initialData = null, apiFetch, uploadFn, onUploadEvent, allLoteos = [] }) {
  const [name, setName] = useState(initialData?.name ?? '');
  const [slug, setSlug] = useState(initialData?.slug ?? '');
  const [branding, setBranding] = useState({
    ...EMPTY_BRANDING,
    ...(initialData?.branding ?? {}),
  });

  const initialFinance = initialData?.finance_config ?? null;
  const [viewerLoteoId, setViewerLoteoId] = useState(initialFinance?.viewer_loteo_id ?? '');
  const [installmentsInput, setInstallmentsInput] = useState(
    (initialFinance?.plans ?? DEFAULT_PLANS).map(p => p.installments).join(', ')
  );
  const [writingThresholdPercent, setWritingThresholdPercent] = useState(
    initialFinance?.writing_threshold_percent ?? 10
  );

  const projectLoteoIds = new Set((initialData?.loteo_ids ?? []).map(String));
  const assignedLoteos = allLoteos.filter(l => projectLoteoIds.has(String(l.id)));

  // Carga perezosa de las fuentes del selector, solo al abrir el modal.
  useEffect(() => {
    if (!isOpen) return;
    const id = 'project-font-preview';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = FONT_PREVIEW_HREF;
    document.head.appendChild(link);
  }, [isOpen]);

  if (!isOpen) return null;

  function setBrandingField(field, value) {
    setBranding(b => ({ ...b, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const brandingPayload = Object.fromEntries(
      Object.entries(branding).filter(([, v]) => v !== '')
    );
    const installments = installmentsInput
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n > 0);
    const financeConfig = viewerLoteoId ? {
      viewer_loteo_id: viewerLoteoId,
      plans: installments.map(n => ({ id: String(n), installments: n })),
      writing_threshold_percent: Number(writingThresholdPercent) || 10,
    } : null;
    onSubmit({
      name,
      slug: slug.trim() || null,
      branding: Object.keys(brandingPayload).length ? brandingPayload : null,
      finance_config: financeConfig,
    });
  }

  return createPortal(
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

          <div className="form-group">
            <label className="form-label">Slug del simulador</label>
            <input
              className="form-input"
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="Se genera del nombre si lo dejás vacío"
            />
            <p className="form-hint">
              URL pública: {SIMULADOR_URL}/{slug.trim() || '(slug)'}
            </p>
          </div>

          <div className="form-section-title">Simulador de compra</div>

          {assignedLoteos.length === 0 ? (
            <p className="form-hint">
              Asigná al menos un loteo a este proyecto (desde la lista de Proyectos) y volvé a editarlo para configurar el simulador.
            </p>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Loteo del visor 360</label>
                <select
                  className="form-input"
                  value={viewerLoteoId}
                  onChange={e => setViewerLoteoId(e.target.value)}
                >
                  <option value="">Sin configurar (el simulador no va a funcionar)</option>
                  {assignedLoteos.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <p className="form-hint">A dónde se abre el visor al hacer clic en "Ver lotes compatibles".</p>
              </div>

              <div className="project-colors-row">
                <div className="form-group">
                  <label className="form-label">Plazos (cuotas)</label>
                  <input
                    className="form-input"
                    type="text"
                    value={installmentsInput}
                    onChange={e => setInstallmentsInput(e.target.value)}
                    placeholder="120, 144, 180"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Umbral de escrituración (%)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={writingThresholdPercent}
                    onChange={e => setWritingThresholdPercent(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

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
            <select
              className="form-input"
              value={branding.font_family}
              onChange={e => setBrandingField('font_family', e.target.value)}
              style={{ fontFamily: branding.font_family || undefined }}
            >
              {FONT_OPTIONS.map(f => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.value || undefined }}>
                  {f.label}
                </option>
              ))}
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
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Guardando...' : initialData ? 'Guardar cambios' : 'Crear proyecto'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

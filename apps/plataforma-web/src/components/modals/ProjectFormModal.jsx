import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ImageUploadField from '../ImageUploadField';
import { Button, Select } from '../../ui/components';
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
].map(f => ({
  ...f,
  label: <span style={{ fontFamily: f.value || undefined }}>{f.label}</span>,
}));

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
  const [plazos, setPlazos] = useState(
    (initialFinance?.plans ?? DEFAULT_PLANS).map(p => p.installments)
  );
  const [plazoDraft, setPlazoDraft] = useState('');
  const [writingThresholdPercent, setWritingThresholdPercent] = useState(
    initialFinance?.writing_threshold_percent ?? 10
  );

  function addPlazo(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0 || plazos.includes(n)) return;
    setPlazos(p => [...p, n].sort((a, b) => a - b));
  }

  function removePlazo(n) {
    setPlazos(p => p.filter(x => x !== n));
  }

  function handleAddPlazoClick() {
    if (!plazoDraft.trim()) return;
    addPlazo(plazoDraft);
    setPlazoDraft('');
  }

  function handlePlazoDraftKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddPlazoClick();
    }
  }

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
    const financeConfig = viewerLoteoId ? {
      viewer_loteo_id: viewerLoteoId,
      plans: plazos.map(n => ({ id: String(n), installments: n })),
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
          <div className="project-form-col project-form-col--left">
            <div className="form-row-2">
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
              </div>
            </div>
            <p className="form-hint">
              URL pública: {SIMULADOR_URL}/{slug.trim() || '(slug)'}
            </p>

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
                  <p className="form-hint">
                    {viewerLoteoId
                      ? 'A dónde se abre el visor al hacer clic en "Ver lotes compatibles".'
                      : 'Elegí un loteo para poder configurar los plazos y el umbral de escrituración.'}
                  </p>
                </div>

                <div className={`form-group${viewerLoteoId ? '' : ' form-group--disabled'}`}>
                  <label className="form-label">Plazos (cuotas)</label>
                  <div className="plazo-box">
                    {plazos.map(n => (
                      <span className="plazo-chip" key={n}>
                        {n}<span className="plazo-chip-unit">cuotas</span>
                        <button type="button" disabled={!viewerLoteoId} aria-label={`Quitar plazo de ${n} cuotas`} onClick={() => removePlazo(n)}>×</button>
                      </span>
                    ))}
                    <input
                      className="plazo-add"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      placeholder="Cuotas"
                      value={plazoDraft}
                      disabled={!viewerLoteoId}
                      onChange={e => setPlazoDraft(e.target.value)}
                      onKeyDown={handlePlazoDraftKeyDown}
                    />
                    <button
                      type="button"
                      className="plazo-add-btn"
                      disabled={!viewerLoteoId || !plazoDraft.trim()}
                      aria-label="Agregar plazo"
                      onClick={handleAddPlazoClick}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className={`form-group${viewerLoteoId ? '' : ' form-group--disabled'}`}>
                  <label className="form-label">Umbral de escrituración (%)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={writingThresholdPercent}
                    disabled={!viewerLoteoId}
                    onChange={e => setWritingThresholdPercent(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="project-form-col project-form-col--right">
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

            <Select
              id="project-font-family"
              label="Tipografía"
              value={branding.font_family}
              onChange={e => setBrandingField('font_family', e.target.value)}
              options={FONT_OPTIONS}
            />

            <div className="form-group">
              <label className="form-label">Logos</label>
              <div className="project-logos-row">
                <ImageUploadField
                  value={branding.logo_primary}
                  onUpload={result => setBrandingField('logo_primary', result?.url ?? result)}
                  label="Logo principal"
                  apiFetch={apiFetch}
                  uploadFn={uploadFn}
                  onUploadEvent={onUploadEvent}
                />
                <ImageUploadField
                  value={branding.logo_secondary}
                  onUpload={result => setBrandingField('logo_secondary', result?.url ?? result)}
                  label="Logo secundario"
                  apiFetch={apiFetch}
                  uploadFn={uploadFn}
                  onUploadEvent={onUploadEvent}
                />
              </div>
            </div>
          </div>

          {error && <p className="form-error project-form-full">{error}</p>}

          <div className="modal-actions project-form-full">
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

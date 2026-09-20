import { useState, useEffect } from 'react';
import { X, Wallet } from 'lucide-react';
import ImageUploadField from './ImageUploadField';
import { Select, Panel, FeedbackState } from '../ui/components';
import { createProject, updateProject, assignLoteos, unassignLoteo } from '../api/projects';
import { updateOrg } from '../api/organizations';
import { SIMULADOR_URL } from '../config';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import './ProjectSettingsPanel.css';

// Fuentes del selector de tipografía que no carga la app por defecto.
// Se cargan perezosamente al montar el panel para previsualizar cada opción.
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

// Un logo vacío se envía como '' para que el backend lo quite del branding.
const LOGO_FIELDS = ['logo_primary', 'logo_secondary'];

const EMPTY_BRANDING = {
  primary_color: DEFAULT_PRIMARY_COLOR,
  accent_color: DEFAULT_ACCENT_COLOR,
  font_family: '',
  logo_primary: '',
  logo_secondary: '',
  lote_badge_style: 'default',
  lote_badge_colors: false,
};

const LOTE_BADGE_STYLE_OPTIONS = [
  { value: 'default', label: 'Píldora blanca (default)' },
  { value: 'ghost', label: 'Contorno fantasma' },
  { value: 'status_ring', label: 'Anillo de estado' },
];

// Vacío/null → null; si no, número. Para comparar cotizaciones sin que "1500.50" vs 1500.5 cuente como cambio.
const normalizeRate = v => (v === '' || v == null ? null : Number(v));

export default function ProjectSettingsPanel({
  section = 'visual',
  apiFetch,
  uploadFn,
  onUploadEvent,
  allLoteos = [],
  addToast,
  projects,
  projectsLoading,
  setProjects,
  isVisorOnly = false,
  org,
  orgLoading,
  setOrg,
}) {
  const project = projects?.[0] ?? null;
  const [saveError, setSaveError] = useState(null);

  const [cementRate, setCementRate] = useState(org?.cement_bag_rate_ars ?? '');
  const [usdRate, setUsdRate] = useState(org?.usd_ars_rate ?? '');
  const [ratesError, setRatesError] = useState(null);

  const [name, setName] = useState(project?.name ?? '');
  const [slug, setSlug] = useState(project?.slug ?? '');
  const [branding, setBranding] = useState({
    ...EMPTY_BRANDING,
    ...(project?.branding ?? {}),
  });

  const initialFinance = project?.finance_config ?? null;
  const [viewerLoteoId, setViewerLoteoId] = useState(initialFinance?.viewer_loteo_id ?? '');
  const [plazos, setPlazos] = useState(
    (initialFinance?.plans ?? DEFAULT_PLANS).map(p => p.installments)
  );
  const [plazoDraft, setPlazoDraft] = useState('');
  const [writingThresholdPercent, setWritingThresholdPercent] = useState(
    initialFinance?.writing_threshold_percent ?? 10
  );

  // Sin botón de guardar: el modal de Configuración consulta `dirty` al cerrarse.
  // El snapshot cubre todo lo que persiste el proyecto; `baseline` se actualiza tras guardar.
  const draftSnapshot = JSON.stringify({ name, slug, branding, viewerLoteoId, plazos, writingThresholdPercent });
  const [baseline, setBaseline] = useState(draftSnapshot);
  const projectDirty = draftSnapshot !== baseline;
  const ratesDirty = section === 'finanzas' && (
    normalizeRate(cementRate) !== normalizeRate(org?.cement_bag_rate_ars) ||
    normalizeRate(usdRate) !== normalizeRate(org?.usd_ars_rate)
  );

  // Carga perezosa de las fuentes del selector, solo una vez.
  useEffect(() => {
    const id = 'project-font-preview';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = FONT_PREVIEW_HREF;
    document.head.appendChild(link);
  }, []);

  function setBrandingField(field, value) {
    setBranding(b => ({ ...b, [field]: value }));
  }

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

  const assignedLoteoIds = new Set((project?.loteo_ids ?? []).map(String));
  const assignedLoteos = allLoteos.filter(l => assignedLoteoIds.has(String(l.id)));
  const availableLoteos = allLoteos.filter(l => !assignedLoteoIds.has(String(l.id)));

  async function handleAssignLoteo(loteoId) {
    if (!loteoId || !project) return;
    const snapshot = projects;
    setProjects(prev => prev.map(p =>
      p.id === project.id ? { ...p, loteo_ids: [...(p.loteo_ids ?? []), loteoId] } : p
    ));
    try {
      const updated = await assignLoteos({ apiFetch, projectId: project.id, loteoIds: [loteoId] });
      setProjects(prev => prev.map(p => p.id === project.id ? updated : p));
    } catch {
      setProjects(snapshot);
      addToast?.('Error al asignar el loteo', 'error');
    }
  }

  async function handleUnassignLoteo(loteoId) {
    if (!project) return;
    const snapshot = projects;
    setProjects(prev => prev.map(p =>
      p.id === project.id
        ? { ...p, loteo_ids: (p.loteo_ids ?? []).filter(id => String(id) !== String(loteoId)) }
        : p
    ));
    try {
      const updated = await unassignLoteo({ apiFetch, projectId: project.id, loteoId });
      setProjects(prev => prev.map(p => p.id === project.id ? updated : p));
    } catch {
      setProjects(snapshot);
      addToast?.('Error al remover el loteo', 'error');
    }
  }

  async function saveProject() {
    if (!projectDirty) return true;
    if (!name.trim()) {
      setSaveError('El nombre del proyecto no puede quedar vacío');
      return false;
    }
    setSaveError(null);
    const brandingPayload = Object.fromEntries(
      Object.entries(branding).filter(([k, v]) => v !== '' || (project && LOGO_FIELDS.includes(k)))
    );
    const financeConfig = viewerLoteoId ? {
      viewer_loteo_id: viewerLoteoId,
      plans: plazos.map(n => ({ id: String(n), installments: n })),
      writing_threshold_percent: Number(writingThresholdPercent) || 10,
    } : null;
    const payload = {
      name,
      slug: slug.trim() || null,
      branding: Object.keys(brandingPayload).length ? brandingPayload : null,
      finance_config: financeConfig,
    };
    try {
      if (project) {
        const updated = await updateProject({ apiFetch, projectId: project.id, ...payload });
        setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
        addToast?.('Proyecto actualizado', 'success');
      } else {
        const created = await createProject({ apiFetch, ...payload });
        setProjects(prev => [...prev, created]);
        addToast?.('Proyecto creado', 'success');
      }
      setBaseline(draftSnapshot);
      return true;
    } catch (err) {
      setSaveError(err.message || 'Error al guardar');
      return false;
    }
  }

  async function saveRates() {
    if (!ratesDirty) return true;
    const numericCement = Number(cementRate);
    const numericUsd = Number(usdRate);
    if (!Number.isFinite(numericCement) || numericCement <= 0 || !Number.isFinite(numericUsd) || numericUsd <= 0) {
      setRatesError('Ingresá valores mayores a cero.');
      return false;
    }
    setRatesError(null);
    const previousOrg = org;
    setOrg?.(current => current
      ? { ...current, cement_bag_rate_ars: numericCement, usd_ars_rate: numericUsd }
      : current);
    try {
      const updatedOrg = await updateOrg({ apiFetch, cement_bag_rate_ars: numericCement, usd_ars_rate: numericUsd });
      setOrg?.(updatedOrg);
      addToast?.('Cotizaciones actualizadas', 'success');
      return true;
    } catch (err) {
      setOrg?.(previousOrg);
      setRatesError(err.message || 'No pudimos guardar las cotizaciones');
      return false;
    }
  }

  useUnsavedChanges(`project-${section}`, { dirty: projectDirty, save: saveProject });
  useUnsavedChanges(`rates-${section}`, { dirty: ratesDirty, save: saveRates });

  if (projectsLoading) {
    return (
      <FeedbackState
        className="project-settings-feedback"
        busy
        title="Cargando proyecto"
        description="Consultando identidad visual y configuración financiera…"
      />
    );
  }

  const cotizacionesPanel = section === 'finanzas' && (
    <Panel as="section" className="cfg-card project-settings-panel" flush>
      <div className="cfg-card-head">
        <div className="cfg-card-head-title">
          <h3>Cotizaciones</h3>
        </div>
      </div>

      <div className="cfg-card-body project-settings-form">
        <div className="project-settings-tabpanel">
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">ARS por bolsa de cemento</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={cementRate}
                onChange={e => setCementRate(e.target.value)}
                placeholder="0,00"
                disabled={orgLoading}
              />
              <p className="form-hint">Se propone en los próximos pagos de contratos en bolsas. Los pagos ya registrados no cambian.</p>
            </div>

            <div className="form-group">
              <label className="form-label">ARS por dólar</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={usdRate}
                onChange={e => setUsdRate(e.target.value)}
                placeholder="0,00"
                disabled={orgLoading}
              />
              <p className="form-hint">Se usa para convertir el precio en USD de los lotes a UCB en el simulador de compra.</p>
            </div>
          </div>
        </div>

        {ratesError && <p className="form-error">{ratesError}</p>}
      </div>
    </Panel>
  );

  if (section === 'finanzas' && !project) {
    return (
      <>
        {cotizacionesPanel}
        <FeedbackState
          className="project-settings-feedback"
          icon={<Wallet size={25} />}
          title="Configurá primero la identidad visual"
          description="Creá el proyecto desde la sección Visual y volvé acá para configurar el simulador de compra."
        />
      </>
    );
  }

  return (
    <>
      {cotizacionesPanel}

      <Panel as="section" className="cfg-card project-settings-panel" flush>
        <div className="cfg-card-head">
          <div className="cfg-card-head-title">
            <h3>{section === 'finanzas' ? 'Simulador de compra' : 'Visual'}</h3>
          </div>
        </div>

        <div className="cfg-card-body project-settings-form">
        {section === 'visual' && (
          <div className="project-settings-tabpanel">
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Nombre del proyecto</label>
                <input
                  className="form-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: Paseo Berlin"
                  autoComplete="off"
                />
              </div>

              {!isVisorOnly && (
                <div className="form-group">
                  <label className="form-label">Slug del simulador</label>
                  <input
                    className="form-input"
                    type="text"
                    value={slug}
                    onChange={e => setSlug(e.target.value)}
                    placeholder="Se genera del nombre si lo dejás vacío"
                    autoComplete="off"
                  />
                </div>
              )}
            </div>

            {!isVisorOnly && (
              <p className="form-hint">
                URL pública: {SIMULADOR_URL}/{slug.trim() || '(slug)'}
              </p>
            )}

            <div className="form-section-title">Branding visual</div>

            <div className="project-colors-row">
              <div className="form-group">
                <label className="form-label">Color principal</label>
                <div className="color-input-row">
                  <input type="color" value={branding.primary_color || DEFAULT_PRIMARY_COLOR} onChange={e => setBrandingField('primary_color', e.target.value)} />
                  <input className="form-input" type="text" value={branding.primary_color} onChange={e => setBrandingField('primary_color', e.target.value)} placeholder="#c5a059" maxLength={9} autoComplete="off" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Color de acento</label>
                <div className="color-input-row">
                  <input type="color" value={branding.accent_color || DEFAULT_ACCENT_COLOR} onChange={e => setBrandingField('accent_color', e.target.value)} />
                  <input className="form-input" type="text" value={branding.accent_color} onChange={e => setBrandingField('accent_color', e.target.value)} placeholder="#b38a3f" maxLength={9} autoComplete="off" />
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

            <Select
              id="project-lote-badge-style"
              label="Estilo de badge de lote (visor)"
              value={branding.lote_badge_style || 'default'}
              onChange={e => setBrandingField('lote_badge_style', e.target.value)}
              options={LOTE_BADGE_STYLE_OPTIONS}
            />

            {(branding.lote_badge_style || 'default') === 'default' && (
              <div className="form-group">
                <label className="project-checkbox" htmlFor="project-lote-badge-colors">
                  <input
                    id="project-lote-badge-colors"
                    type="checkbox"
                    checked={Boolean(branding.lote_badge_colors)}
                    onChange={e => setBrandingField('lote_badge_colors', e.target.checked)}
                  />
                  <span className="project-checkbox-text">
                    <span className="project-checkbox-title">Colorear badge según estado</span>
                    <span className="project-checkbox-hint">
                      Vendido/reservado en azul y no disponible en marrón, en vez de ocultarlo.
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Logos</label>
              <div className="project-logos-row">
                <ImageUploadField
                  value={branding.logo_primary}
                  onUpload={result => setBrandingField('logo_primary', result?.url ?? result)}
                  onRemove={() => setBrandingField('logo_primary', '')}
                  label="Logo principal"
                  apiFetch={apiFetch}
                  uploadFn={uploadFn}
                  onUploadEvent={onUploadEvent}
                />
                <ImageUploadField
                  value={branding.logo_secondary}
                  onUpload={result => setBrandingField('logo_secondary', result?.url ?? result)}
                  onRemove={() => setBrandingField('logo_secondary', '')}
                  label="Logo secundario"
                  apiFetch={apiFetch}
                  uploadFn={uploadFn}
                  onUploadEvent={onUploadEvent}
                />
              </div>
            </div>

            {project && (
              <>
                <div className="form-section-title">Loteos incluidos</div>
                {assignedLoteos.length > 0 && (
                  <div className="project-loteo-list project-loteo-list--panel">
                    {assignedLoteos.map(l => (
                      <div key={l.id} className="project-loteo-row">
                        <span className="project-loteo-name">{l.name}</span>
                        <button
                          type="button"
                          className="project-loteo-remove"
                          onClick={() => handleUnassignLoteo(l.id)}
                          title="Quitar loteo"
                          aria-label={`Quitar ${l.name}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {availableLoteos.length > 0 ? (
                  <Select
                    id="project-assign-loteo"
                    value=""
                    onChange={e => handleAssignLoteo(e.target.value)}
                    options={[
                      { value: '', label: 'Asignar loteo' },
                      ...availableLoteos.map(l => ({ value: String(l.id), label: l.name })),
                    ]}
                  />
                ) : assignedLoteos.length === 0 && (
                  <p className="form-hint">No hay loteos disponibles para asignar todavía.</p>
                )}
              </>
            )}
          </div>
        )}

        {section === 'finanzas' && !isVisorOnly && (
          <div className="project-settings-tabpanel">
            {assignedLoteos.length === 0 ? (
              <p className="form-hint">
                Asigná al menos un loteo a este proyecto (pestaña Visual) para configurar el simulador.
              </p>
            ) : (
              <>
                <Select
                  id="project-viewer-loteo"
                  label={
                    <>
                      Loteo predeterminado
                      <span className="form-label-note">— Es el loteo que el visor abre primero en cualquier caso.</span>
                    </>
                  }
                  value={viewerLoteoId}
                  onChange={e => setViewerLoteoId(e.target.value)}
                  options={[
                    { value: '', label: 'Sin configurar (el simulador no va a funcionar)' },
                    ...assignedLoteos.map(l => ({ value: String(l.id), label: l.name })),
                  ]}
                />
                {!viewerLoteoId && (
                  <p className="form-hint">
                    Elegí un loteo para poder configurar los plazos y el umbral de escrituración.
                  </p>
                )}

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
                  <label className="form-label">
                    Umbral de escrituración (%)
                    <span className="form-label-note">— Porcentaje del precio del lote que hay que pagar para iniciar la escrituración. El simulador lo usa para mostrar el avance y la fecha estimada.</span>
                  </label>
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
        )}

        {saveError && <p className="form-error">{saveError}</p>}
      </div>
      </Panel>
    </>
  );
}

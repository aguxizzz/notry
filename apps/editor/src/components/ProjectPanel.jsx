import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  CircleAlert,
  Compass,
  Crosshair,
  FileImage,
  Layers3,
  MapPin,
  Pentagon,
  RotateCcw,
  Search,
  Settings2,
  Type,
  Wand2,
  X,
} from 'lucide-react';
import CalibrationInspector from './CalibrationInspector';
import AutoDetectInspector from './AutoDetectInspector';
import { useUIFeedback } from '../hooks/useUIFeedback';
import { errorMessage } from '../api/client';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'polygon', label: 'Lotes' },
  { id: 'poi', label: 'Lugares' },
  { id: 'text', label: 'Textos' },
];

const getAnnotationLabel = annotation => (
  annotation.tooltip || annotation.title || annotation.slug || annotation.uuid || 'Sin nombre'
);

const AnnotationIcon = ({ type }) => {
  if (type === 'polygon') return <Pentagon size={14} />;
  if (type === 'poi') return <MapPin size={14} />;
  return <Type size={14} />;
};

function StatusRow({ icon, label, value, tone = 'neutral' }) {
  return (
    <div className="project-status-row">
      <span className="project-status-row__label">{createElement(icon, { size: 15 })}{label}</span>
      <span className={`project-status-row__value is-${tone}`}>{value}</span>
    </div>
  );
}

function ProjectSection({ title, icon, summary, defaultOpen = false, detailsRef, children }) {
  const sectionRef = useRef(null);

  useEffect(() => {
    if (defaultOpen && sectionRef.current) sectionRef.current.open = true;
  }, [defaultOpen]);

  const setSectionRef = node => {
    sectionRef.current = node;
    if (detailsRef) detailsRef.current = node;
  };

  return (
    <details ref={setSectionRef} className="project-section">
      <summary>
        <span className="project-section__title">{createElement(icon, { size: 15 })}{title}</span>
        <span className="project-section__summary">{summary}</span>
        <ChevronDown className="project-section__chevron" size={15} aria-hidden="true" />
      </summary>
      <div className="project-section__body">{children}</div>
    </details>
  );
}

export default function ProjectPanel({
  open,
  onClose,
  activeTab,
  onTabChange,
  projectName,
  snapThreshold,
  onSaveSettings,
  panoramaUrl,
  blueprintUrl,
  mode,
  annotations,
  selectedId,
  onSelectAnnotation,
  calibrationPoints,
  pendingBlueprintPoints,
  calibrationNotice,
  homography,
  activeTool,
  onEnterCalibration,
  onCancelCalibration,
  onDeleteCalibrationPoint,
  onClearCalibration,
  autoDetectParams,
  onAutoDetectParamsChange,
  autoDetectLoading,
  autoDetectError,
  autoDetectLotsGenerated,
  onProjectMissing,
  onReprojectAll,
  onRemoveAllFromPanorama,
  homePosition,
  northOffset,
  onCaptureHome,
  onResetHome,
  onSetNorth,
  onResetNorth,
  canOrientPanorama,
  loteoLatitude,
  loteoLongitude,
  geoCalibrationPoints,
  onEnterGeoCalibration,
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [nameDraft, setNameDraft] = useState(null);
  const [snapDraft, setSnapDraft] = useState(null);
  const [actionState, setActionState] = useState({ key: null });
  const { notify } = useUIFeedback();
  const calibrationSectionRef = useRef(null);
  const projectionSectionRef = useRef(null);
  const name = nameDraft ?? projectName ?? '';
  const snap = snapDraft ?? snapThreshold ?? 5;
  const availableFilters = mode === 'blueprint'
    ? FILTERS.filter(option => option.id === 'all' || option.id === 'polygon')
    : FILTERS;
  const effectiveFilter = availableFilters.some(option => option.id === filter) ? filter : 'all';

  const projectableLots = useMemo(() => annotations.filter(annotation => (
    annotation.type === 'polygon'
    && !annotation.pending
    && annotation.blueprint_coordinates?.length >= 3
  )), [annotations]);
  const projectedLots = useMemo(() => projectableLots.filter(annotation => (
    annotation.panorama_coordinates?.length >= 3
  )), [projectableLots]);
  const importedLots = useMemo(() => annotations.filter(annotation => (
    annotation.type === 'polygon'
    && !annotation.pending
    && annotation.panorama_coordinates?.length >= 3
  )), [annotations]);
  const missingCount = projectableLots.length - projectedLots.length;

  const visibleAnnotations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es');
    return annotations
      .filter(annotation => ['polygon', 'poi', 'text'].includes(annotation.type))
      .filter(annotation => mode !== 'blueprint' || annotation.type === 'polygon')
      .filter(annotation => effectiveFilter === 'all' || annotation.type === effectiveFilter)
      .filter(annotation => !normalizedQuery || getAnnotationLabel(annotation).toLocaleLowerCase('es').includes(normalizedQuery));
  }, [annotations, effectiveFilter, mode, query]);

  const runAction = async (key, action, successMessage) => {
    if (!action || actionState.key) return;
    setActionState({ key });
    try {
      await action();
      if (key === 'settings') {
        setNameDraft(null);
        setSnapDraft(null);
      }
      setActionState({ key: null });
      notify(successMessage, { variant: 'success' });
    } catch (error) {
      setActionState({ key: null });
      notify(errorMessage(error, 'No se pudo completar la acción. Intentá de nuevo.'), { variant: 'error' });
    }
  };

  const saveSettings = () => runAction(
    'settings',
    () => onSaveSettings?.({ name: name.trim(), snapThreshold: Math.max(1, Number(snap) || 1) }),
    'Configuración guardada.',
  );

  const calibrationSummary = calibrationPoints.length >= 4
    ? `${calibrationPoints.length} pares · lista`
    : `${calibrationPoints.length} de 4 pares`;

  const geoPairCount = geoCalibrationPoints?.length ?? 0;
  const geoCalibrationSummary = geoPairCount >= 4
    ? `${geoPairCount} pares · lista`
    : `${geoPairCount} de 4 pares`;
  const hasGeoCenter = loteoLatitude != null && loteoLongitude != null;

  // The native `defaultOpen` attribute only applies on first mount. Re-open
  // both contextual sections when calibration is entered from the top toolbar
  // so the tool instructions and its next action are visible together.
  useEffect(() => {
    if (activeTool === 'calibrate') {
      if (calibrationSectionRef.current) calibrationSectionRef.current.open = true;
      if (projectionSectionRef.current) projectionSectionRef.current.open = true;
    }
  }, [activeTool]);

  return (
    <aside className={`project-pane${open ? ' open' : ''}`} aria-label="Proyecto y contenido">
      <div className="side-panel-header">
        <div>
          <span className="side-panel-header__eyebrow">Loteo</span>
          <strong title={projectName}>{projectName || 'Sin nombre'}</strong>
        </div>
        <button type="button" className="editor-icon-btn side-panel-close" onClick={onClose} aria-label="Cerrar panel de proyecto">
          <X size={17} />
        </button>
      </div>

      <div className="side-panel-tabs" role="tablist" aria-label="Panel izquierdo">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'project'}
          className={activeTab === 'project' ? 'is-active' : ''}
          onClick={() => onTabChange('project')}
        >
          <Settings2 size={15} /> Proyecto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'content'}
          className={activeTab === 'content' ? 'is-active' : ''}
          onClick={() => onTabChange('content')}
        >
          <Layers3 size={15} /> Contenido <span>{annotations.length}</span>
        </button>
      </div>

      {activeTab === 'content' ? (
        <div className="project-pane__content content-browser">
          <label className="content-search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Buscar contenido</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={mode === 'blueprint' ? 'Buscar lote' : 'Buscar lote, lugar o texto'}
            />
          </label>

          <div className="content-filters" aria-label="Filtrar contenido">
            {availableFilters.map(option => (
              <button
                key={option.id}
                type="button"
                className={effectiveFilter === option.id ? 'is-active' : ''}
                onClick={() => setFilter(option.id)}
                aria-pressed={effectiveFilter === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="content-list">
            {visibleAnnotations.length === 0 ? (
              <div className="panel-empty-state">
                <Layers3 size={22} />
                <strong>{query ? 'No hay coincidencias' : 'Todavía no hay contenido'}</strong>
                <span>{query
                  ? 'Probá con otro nombre o filtro.'
                  : mode === 'blueprint'
                    ? 'Dibujá un lote desde la barra de herramientas.'
                    : 'Dibujá un lote, lugar o texto desde la barra de herramientas.'}</span>
              </div>
            ) : visibleAnnotations.map(annotation => {
              const projected = annotation.type !== 'polygon' || annotation.panorama_coordinates?.length >= 3;
              return (
                <button
                  key={annotation.id}
                  type="button"
                  className={`content-row${selectedId === annotation.id ? ' is-selected' : ''}`}
                  onClick={() => onSelectAnnotation(annotation.id)}
                >
                  <span className={`content-row__icon is-${annotation.type}`}><AnnotationIcon type={annotation.type} /></span>
                  <span className="content-row__main">
                    <strong title={getAnnotationLabel(annotation)}>{getAnnotationLabel(annotation)}</strong>
                    <small>{annotation.type === 'polygon' ? 'Lote' : annotation.type === 'poi' ? 'Lugar' : 'Texto'}</small>
                  </span>
                  {annotation.pending ? (
                    <span className="content-row__status is-warning" title="Pendiente de guardar">Pendiente</span>
                  ) : !projected ? (
                    <span className="content-row__status" title="Sin ubicación en panorama">Sin panorama</span>
                  ) : (
                    <Check className="content-row__check" size={14} aria-label="Listo" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="project-pane__content">
          {blueprintUrl && panoramaUrl && (
            <ProjectSection key={activeTool === 'calibrate' ? 'calibrating' : 'idle'} detailsRef={calibrationSectionRef} title="Calibración" icon={Crosshair} summary={calibrationSummary} defaultOpen={activeTool === 'calibrate' || !!calibrationNotice}>
              {activeTool === 'calibrate' ? (
                <CalibrationInspector
                  calibrationPoints={calibrationPoints}
                  pendingBlueprintPoints={pendingBlueprintPoints}
                  mode={mode}
                  onCancelCalibration={onCancelCalibration}
                  onDeleteCalibrationPoint={onDeleteCalibrationPoint}
                  onClearCalibration={onClearCalibration}
                  embedded
                />
              ) : (
                <>
                  <div className={`calibration-health${homography ? ' is-ready' : ''}`}>
                    {homography ? <Check size={16} /> : <CircleAlert size={16} />}
                    <span>{homography ? 'La proyección está lista.' : 'Marcá al menos cuatro pares de referencia.'}</span>
                  </div>
                  <button type="button" className="editor-btn editor-btn--secondary" onClick={onEnterCalibration}>
                    <Crosshair size={15} /> {calibrationPoints.length ? 'Editar calibración' : 'Iniciar calibración'}
                  </button>
                </>
              )}
            </ProjectSection>
          )}

          {blueprintUrl && hasGeoCenter && (
            <ProjectSection title="Calibración geográfica" icon={Compass} summary={geoCalibrationSummary} defaultOpen={activeTool === 'calibrate-geo'}>
              <div className={`calibration-health${geoPairCount >= 4 ? ' is-ready' : ''}`}>
                {geoPairCount >= 4 ? <Check size={16} /> : <CircleAlert size={16} />}
                <span>{geoPairCount >= 4 ? 'Lista para actualizar los polígonos satelitales.' : 'Marcá al menos cuatro pares de referencia.'}</span>
              </div>
              <button type="button" className="editor-btn editor-btn--secondary" onClick={onEnterGeoCalibration}>
                <Compass size={15} /> {geoPairCount ? 'Editar calibración geográfica' : 'Iniciar calibración geográfica'}
              </button>
            </ProjectSection>
          )}

          {blueprintUrl && activeTool === 'autodetect' && (
            <ProjectSection key="autodetect" title="Detección Automática" icon={Wand2} summary={`${autoDetectLotsGenerated} lote${autoDetectLotsGenerated === 1 ? '' : 's'}`} defaultOpen>
              <AutoDetectInspector
                blueprintUrl={blueprintUrl}
                isLoading={autoDetectLoading}
                error={autoDetectError}
                params={autoDetectParams}
                onParamsChange={onAutoDetectParamsChange}
                generatedCount={autoDetectLotsGenerated}
              />
            </ProjectSection>
          )}

          {blueprintUrl && (
            <ProjectSection detailsRef={projectionSectionRef} title="Proyección" icon={Layers3} summary={`${projectedLots.length} de ${projectableLots.length} lotes`} defaultOpen>
              <div className="projection-progress" aria-label={`${projectedLots.length} de ${projectableLots.length} lotes proyectados`}>
                <span style={{ '--projection-progress': projectableLots.length ? `${(projectedLots.length / projectableLots.length) * 100}%` : '0%' }} />
              </div>
              <p className="panel-help">
                {homography
                  ? `${missingCount} lote${missingCount === 1 ? '' : 's'} todavía sin ubicación en el panorama.`
                  : 'Completá la calibración antes de proyectar los lotes.'}
              </p>
              <button
                type="button"
                className="editor-btn editor-btn--primary"
                onClick={onProjectMissing}
                disabled={!homography || missingCount === 0}
              >
                Proyectar faltantes ({missingCount})
              </button>
              <details className="advanced-actions">
                <summary>Acciones avanzadas</summary>
                <button type="button" className="editor-btn editor-btn--secondary" onClick={onReprojectAll} disabled={!homography || projectableLots.length === 0}>
                  <RotateCcw size={15} /> Reproyectar todos ({projectableLots.length})
                </button>
                <button type="button" className="editor-btn editor-btn--danger" onClick={onRemoveAllFromPanorama} disabled={importedLots.length === 0}>
                  Quitar todos del panorama ({importedLots.length})
                </button>
              </details>
            </ProjectSection>
          )}

          {panoramaUrl && mode === 'panorama' && (
            <ProjectSection title="Orientación" icon={Compass} summary="Inicio y norte">
              <div className="orientation-control">
                <div>
                  <strong>Vista inicial</strong>
                  <span>{homePosition ? `${(homePosition.yaw * 180 / Math.PI).toFixed(1)}° / ${(homePosition.pitch * 180 / Math.PI).toFixed(1)}°` : 'Sin configurar'}</span>
                </div>
                <button type="button" className="editor-btn editor-btn--secondary" disabled={!canOrientPanorama || actionState.key === 'home'} onClick={() => runAction('home', onCaptureHome, 'Vista inicial guardada.')}>
                  Usar vista actual
                </button>
                {homePosition && <button type="button" className="editor-text-btn" onClick={() => runAction('reset-home', onResetHome, 'Vista inicial restablecida.')}>Restablecer</button>}
              </div>
              <div className="orientation-control">
                <div>
                  <strong>Norte de la brújula</strong>
                  <span>{northOffset != null ? `${(northOffset * 180 / Math.PI).toFixed(1)}°` : 'Sin configurar'}</span>
                </div>
                <button type="button" className="editor-btn editor-btn--secondary" disabled={!canOrientPanorama || actionState.key === 'north'} onClick={() => runAction('north', onSetNorth, 'Norte guardado.')}>
                  Usar dirección actual
                </button>
                {northOffset != null && <button type="button" className="editor-text-btn" onClick={() => runAction('reset-north', onResetNorth, 'Norte restablecido.')}>Restablecer</button>}
              </div>
            </ProjectSection>
          )}

          <ProjectSection title="Configuración" icon={Settings2} summary="Imágenes, nombre y ajuste de dibujo">
            <StatusRow icon={Camera} label="Panorama" value={panoramaUrl ? 'Cargado' : 'Falta cargar'} tone={panoramaUrl ? 'success' : 'warning'} />
            <StatusRow icon={FileImage} label="Plano" value={blueprintUrl ? 'Cargado' : 'Opcional'} tone={blueprintUrl ? 'success' : 'neutral'} />
            <p className="panel-help">Las imágenes se administran desde la ficha del loteo en el CRM.</p>
            <label className="editor-field">
              <span>Nombre del loteo</span>
              <input value={name} maxLength={160} onChange={event => setNameDraft(event.target.value)} />
            </label>
            <label className="editor-field">
              <span>Unión de vértices</span>
              <div className="editor-field__with-unit">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={snap}
                  onChange={event => setSnapDraft(event.target.value)}
                />
                <span>px</span>
              </div>
              <small>Distancia mínima para unir vértices de lotes vecinos.</small>
            </label>
            <button
              type="button"
              className="editor-btn editor-btn--secondary"
              onClick={saveSettings}
              disabled={actionState.key === 'settings'}
            >
              {actionState.key === 'settings' ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </ProjectSection>
        </div>
      )}
    </aside>
  );
}

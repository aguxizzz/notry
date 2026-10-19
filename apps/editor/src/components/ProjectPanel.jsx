import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Compass,
  Eye,
  EyeOff,
  Crosshair,
  FileImage,
  Layers3,
  ListChecks,
  RotateCcw,
  Satellite,
  X,
} from 'lucide-react';
import CalibrationInspector from './CalibrationInspector';
import AutoDetectInspector from './AutoDetectInspector';
import ContentBrowser from './ContentBrowser';
import { Field, Slider } from './inspector/InspectorUI';
import { useUIFeedback } from '../hooks/useUIFeedback';
import { errorMessage } from '../api/client';

const toDegrees = radians => (radians * 180) / Math.PI;
const formatDegrees = radians => `${toDegrees(radians).toFixed(1).replace('.', ',')}°`;

function ProgressRing({ value, total }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const complete = total > 0 && value === total;
  return (
    <div className="setup-ring" aria-label={`${value} de ${total} pasos listos`}>
      <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true">
        <circle cx="21" cy="21" r={radius} fill="none" stroke="var(--panel-deep)" strokeWidth="4" />
        <circle
          cx="21"
          cy="21"
          r={radius}
          fill="none"
          stroke={complete ? 'var(--color-success)' : 'var(--accent)'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${total ? (circumference * value) / total : 0} ${circumference}`}
          transform="rotate(-90 21 21)"
        />
      </svg>
      <span>{value}/{total}</span>
    </div>
  );
}

// Dial chico: un abanico para la vista inicial o una aguja con N para el norte.
function Dial({ radians, north = false }) {
  const degrees = radians == null ? 0 : toDegrees(radians);
  const angle = ((degrees - 90) * Math.PI) / 180;
  const point = (r, a) => `${30 + Math.cos(a) * r} ${30 + Math.sin(a) * r}`;
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r="27" fill="var(--panel-raised)" stroke="var(--border)" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const outer = 27;
        const inner = i % 3 ? 24.5 : 22.5;
        return (
          <line
            key={i}
            x1={30 + Math.sin(a) * inner}
            y1={30 - Math.cos(a) * inner}
            x2={30 + Math.sin(a) * outer}
            y2={30 - Math.cos(a) * outer}
            stroke="var(--text-subtle)"
            strokeWidth={i % 3 ? 1 : 1.5}
          />
        );
      })}
      {radians != null && (north ? (
        <g transform={`rotate(${degrees} 30 30)`}>
          <path d="M30 8 34.5 30 30 27 25.5 30Z" fill="var(--color-danger)" />
          <path d="M30 52 34.5 30 30 33 25.5 30Z" fill="var(--text-muted)" />
          <text x="30" y="20" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--color-text)">N</text>
        </g>
      ) : (
        <g>
          <path d={`M30 30 L${point(22, angle - 0.4)} A22 22 0 0 1 ${point(22, angle + 0.4)} Z`} fill="var(--accent)" fillOpacity="0.3" />
          <line x1="30" y1="30" x2={30 + Math.cos(angle) * 22} y2={30 + Math.sin(angle) * 22} stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="30" cy="30" r="2.6" fill="var(--color-text)" />
    </svg>
  );
}

// Vista inicial y Norte: mismo layout, botones apilados a ancho completo para
// que no dependa del largo de cada texto.
function OrientationControl({ north = false, radians, help, captureIcon: CaptureIcon, captureLabel, onCapture, onReset, busy, canCapture, disabledHelp }) {
  const isSet = radians != null;
  return (
    <>
      <div className="setup-dial-row">
        <Dial radians={radians} north={north} />
        <div>
          <strong>{isSet ? formatDegrees(radians) : '—'}</strong>
          <small>{help}</small>
        </div>
      </div>
      <div className="setup-actions">
        <button
          type="button"
          className={`ins-mini${isSet ? '' : ' ins-mini--primary'}`}
          disabled={!canCapture || busy}
          onClick={onCapture}
        >
          <CaptureIcon size={13} /> {captureLabel}
        </button>
        {isSet && (
          <button type="button" className="ins-mini" onClick={onReset}>
            <RotateCcw size={13} /> Restablecer
          </button>
        )}
      </div>
      {disabledHelp && <p className="ins-help">{disabledHelp}</p>}
    </>
  );
}

function SetupItem({ id, title, meta, state, open, onToggle, wide = false, children }) {
  return (
    <div className={`setup-item${open ? ' is-open' : ''}`}>
      <button type="button" className="setup-item__head" aria-expanded={open} onClick={() => onToggle(id)}>
        <span className={`setup-check is-${state}`}>
          {state === 'done' && <Check size={13} strokeWidth={2.8} />}
        </span>
        <span>
          <strong>{title}</strong>
          <small>{meta}</small>
        </span>
        <ChevronDown className="setup-item__chevron" size={15} aria-hidden="true" />
      </button>
      {open && <div className={`setup-item__body${wide ? ' setup-item__body--wide' : ''}`}>{children}</div>}
    </div>
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
  hiddenLayers,
  onToggleLayer,
  onHoverAnnotation,
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
  const [nameDraft, setNameDraft] = useState(null);
  const [snapDraft, setSnapDraft] = useState(null);
  const [actionState, setActionState] = useState({ key: null });
  // undefined = todavía no tocó nada (se abre el primer pendiente); null = todo cerrado.
  const [openItem, setOpenItem] = useState(undefined);
  const { notify } = useUIFeedback();
  const name = nameDraft ?? projectName ?? '';
  const snap = Number(snapDraft ?? snapThreshold ?? 5) || 1;

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
    () => onSaveSettings?.({ name: name.trim(), snapThreshold: Math.max(1, snap) }),
    'Configuración guardada.',
  );

  const pairCount = calibrationPoints.length;
  const geoPairCount = geoCalibrationPoints?.length ?? 0;
  const hasGeoCenter = loteoLatitude != null && loteoLongitude != null;
  const onPanorama = mode === 'panorama';

  // Pasos de la puesta a punto, en el orden en que conviene hacerlos.
  const items = [];
  items.push({
    id: 'images',
    title: 'Imágenes',
    state: panoramaUrl ? 'done' : 'todo',
    meta: panoramaUrl ? (blueprintUrl ? 'Panorama y plano cargados' : 'Panorama cargado · sin plano') : 'Falta cargar el panorama',
  });
  if (blueprintUrl && panoramaUrl) {
    items.push({
      id: 'calibration',
      title: 'Calibración',
      state: activeTool === 'calibrate' ? 'active' : homography ? 'done' : 'todo',
      meta: homography ? `${pairCount} pares · proyección lista` : `${pairCount} de 4 pares`,
    });
  }
  if (blueprintUrl && projectableLots.length > 0) {
    items.push({
      id: 'projection',
      title: 'Lotes en el panorama',
      state: missingCount === 0 ? 'done' : 'todo',
      meta: `${projectedLots.length} de ${projectableLots.length} ubicados`,
    });
  }
  if (panoramaUrl) {
    items.push({
      id: 'home',
      title: 'Vista inicial',
      state: homePosition ? 'done' : 'todo',
      meta: homePosition ? `${formatDegrees(homePosition.yaw)} · ${formatDegrees(homePosition.pitch)}` : 'Sin configurar',
    });
    items.push({
      id: 'north',
      title: 'Norte',
      state: northOffset != null ? 'done' : 'todo',
      meta: northOffset != null ? formatDegrees(northOffset) : 'Sin configurar · la brújula no se orienta',
    });
  }
  if (blueprintUrl && hasGeoCenter) {
    items.push({
      id: 'geo',
      title: 'Ubicación satelital',
      optional: true,
      state: geoPairCount >= 4 ? 'done' : 'optional',
      meta: geoPairCount >= 4 ? `${geoPairCount} pares · lista` : `Opcional · ${geoPairCount} de 4 pares`,
    });
  }
  const showAutoDetect = blueprintUrl && activeTool === 'autodetect';
  if (showAutoDetect) {
    items.unshift({
      id: 'autodetect',
      title: 'Detección automática',
      state: 'active',
      meta: `${autoDetectLotsGenerated} lote${autoDetectLotsGenerated === 1 ? '' : 's'} generado${autoDetectLotsGenerated === 1 ? '' : 's'}`,
    });
  }

  const required = items.filter(item => !item.optional && item.id !== 'autodetect');
  const doneCount = required.filter(item => item.state === 'done').length;
  const firstPending = required.find(item => item.state !== 'done')?.id ?? null;
  const forcedItem = activeTool === 'calibrate' || calibrationNotice
    ? 'calibration'
    : showAutoDetect ? 'autodetect' : null;
  const openId = forcedItem ?? (openItem === undefined ? firstPending : openItem);
  const toggleItem = id => setOpenItem(openId === id ? null : id);

  const orientHelp = !onPanorama
    ? 'Pasá a la vista Panorama para usar la vista actual.'
    : !canOrientPanorama ? 'Esperá a que cargue el panorama.' : null;

  const renderBody = id => {
    switch (id) {
      case 'autodetect':
        return (
          <AutoDetectInspector
            blueprintUrl={blueprintUrl}
            isLoading={autoDetectLoading}
            error={autoDetectError}
            params={autoDetectParams}
            onParamsChange={onAutoDetectParamsChange}
            generatedCount={autoDetectLotsGenerated}
          />
        );
      case 'images':
        return (
          <>
            <div className="ins-where">
              <div className={`ins-where__row${panoramaUrl ? '' : ' is-missing'}`}>
                <span className="ins-where__icon"><Camera size={16} /></span>
                <span className="ins-where__text"><strong>Panorama</strong></span>
                {panoramaUrl ? <span className="ins-pill is-ok">Cargado</span> : <span className="ins-pill is-warn">Falta</span>}
              </div>
              <div className="ins-where__row">
                <span className="ins-where__icon"><FileImage size={16} /></span>
                <span className="ins-where__text"><strong>Plano</strong></span>
                {blueprintUrl ? <span className="ins-pill is-ok">Cargado</span> : <span className="ins-pill is-neutral">Opcional</span>}
              </div>
            </div>
            <p className="ins-help">Las imágenes se administran desde la ficha del loteo en el CRM.</p>
          </>
        );
      case 'calibration':
        return activeTool === 'calibrate' ? (
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
            <p className="ins-help">
              {homography
                ? 'Los lotes del plano ya se pueden proyectar al panorama.'
                : 'Marcá al menos cuatro puntos en común entre el plano y el panorama.'}
            </p>
            <div className="ins-btn-row">
              <button type="button" className={`ins-mini${homography ? '' : ' ins-mini--primary'}`} onClick={onEnterCalibration}>
                <Crosshair size={13} /> {pairCount ? 'Editar calibración' : 'Iniciar calibración'}
              </button>
            </div>
          </>
        );
      case 'projection':
        return (
          <>
            <div className="setup-progress">
              <span style={{ '--progress': `${(projectedLots.length / projectableLots.length) * 100}%` }} />
            </div>
            <p className="ins-help">
              {!homography
                ? 'Completá la calibración antes de proyectar los lotes.'
                : missingCount === 0
                  ? 'Todos los lotes del plano se ven en el panorama.'
                  : `${missingCount} lote${missingCount === 1 ? ' está' : 's están'} en el plano pero todavía no en el panorama.`}
            </p>
            {missingCount > 0 && (
              <div className="setup-actions">
                <button type="button" className="ins-mini ins-mini--primary" onClick={onProjectMissing} disabled={!homography}>
                  <ArrowRight size={13} /> Proyectar {missingCount} faltante{missingCount === 1 ? '' : 's'}
                </button>
              </div>
            )}
            <details className="setup-more">
              <summary>Más acciones <ChevronDown size={13} /></summary>
              <div className="setup-actions">
                <button type="button" className="ins-mini" onClick={onReprojectAll} disabled={!homography}>
                  <RotateCcw size={13} /> Reproyectar los {projectableLots.length}
                </button>
                <button
                  type="button"
                  className="ins-mini"
                  onClick={onRemoveAllFromPanorama}
                  disabled={importedLots.length === 0}
                  title="Saca los polígonos del panorama para volver a proyectarlos. Los lotes y sus polígonos del plano no se tocan"
                >
                  <EyeOff size={13} /> Quitar todos del panorama
                </button>
              </div>
            </details>
          </>
        );
      case 'home':
        return (
          <OrientationControl
            radians={homePosition?.yaw ?? null}
            help="Hacia dónde mira el visor al abrir el loteo."
            captureIcon={Eye}
            captureLabel="Usar la vista actual"
            onCapture={() => runAction('home', onCaptureHome, 'Vista inicial guardada.')}
            onReset={() => runAction('reset-home', onResetHome, 'Vista inicial restablecida.')}
            busy={actionState.key === 'home'}
            canCapture={canOrientPanorama}
            disabledHelp={orientHelp}
          />
        );
      case 'north':
        return (
          <OrientationControl
            north
            radians={northOffset ?? null}
            help="Mirá hacia el norte real en el panorama y guardalo."
            captureIcon={Compass}
            captureLabel="Usar la dirección actual"
            onCapture={() => runAction('north', onSetNorth, 'Norte guardado.')}
            onReset={() => runAction('reset-north', onResetNorth, 'Norte restablecido.')}
            busy={actionState.key === 'north'}
            canCapture={canOrientPanorama}
            disabledHelp={orientHelp}
          />
        );
      case 'geo':
        return (
          <>
            <p className="ins-help">Ubica los lotes sobre el mapa satelital del visor. Se calibra con 4 puntos entre el plano y el satélite.</p>
            <div className="ins-btn-row">
              <button type="button" className="ins-mini" onClick={onEnterGeoCalibration}>
                <Satellite size={13} /> {geoPairCount ? 'Editar calibración' : 'Iniciar'}
              </button>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <aside className={`project-pane${open ? ' open' : ''}`} aria-label="Proyecto y contenido">
      <div className="side-panel-header setup-header">
        {activeTab === 'project' && required.length > 0 && <ProgressRing value={doneCount} total={required.length} />}
        <div>
          <span className="side-panel-header__eyebrow">
            {activeTab === 'project' && required.length > 0
              ? (doneCount === required.length ? 'Listo para publicar' : `Faltan ${required.length - doneCount} pasos`)
              : 'Loteo'}
          </span>
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
          <ListChecks size={15} /> Puesta a punto
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
        <div className="project-pane__content">
          <ContentBrowser
            annotations={annotations}
            mode={mode}
            selectedId={selectedId}
            onSelect={onSelectAnnotation}
            onHover={onHoverAnnotation}
            hiddenLayers={hiddenLayers}
            onToggleLayer={onToggleLayer}
          />
        </div>
      ) : (
        <div className="project-pane__content">
          <div className="setup-list">
            {items.map(item => (
              <SetupItem
                key={item.id}
                id={item.id}
                title={item.title}
                meta={item.meta}
                state={item.state}
                open={openId === item.id}
                onToggle={toggleItem}
                wide={item.id === 'autodetect' || (item.id === 'calibration' && activeTool === 'calibrate')}
              >
                {renderBody(item.id)}
              </SetupItem>
            ))}
          </div>

          <div className="setup-settings">
            <section className="ins-sec">
              <div className="ins-sec__label"><span>Ajustes del loteo</span></div>
              <Field label="Nombre del loteo" htmlFor="loteo-name">
                <input id="loteo-name" value={name} maxLength={160} onChange={event => setNameDraft(event.target.value)} />
              </Field>
              <Slider
                id="loteo-snap"
                label="Unión de vértices"
                valueLabel={`${snap} px`}
                min={1}
                max={Math.max(30, snap)}
                value={snap}
                onChange={value => setSnapDraft(value)}
              />
              <p className="ins-help">En el visor, los vértices de lotes vecinos a menos de esta distancia se unen en uno.</p>
              <div className="ins-btn-row">
                <button
                  type="button"
                  className="ins-mini"
                  onClick={saveSettings}
                  disabled={actionState.key === 'settings' || (nameDraft === null && snapDraft === null)}
                >
                  {actionState.key === 'settings' ? 'Guardando…' : 'Guardar ajustes'}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </aside>
  );
}

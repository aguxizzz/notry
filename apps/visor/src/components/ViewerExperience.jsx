import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { InfoPanel } from './InfoPanel.jsx';
import { LoadingScreen } from './LoadingScreen.jsx';
import { OnboardingOverlay } from './OnboardingOverlay.jsx';
import { useViewer } from '../hooks/useViewer.js';
import { annotationsToMarkers } from '../annotations.js';
import { renderSurfacesToMarkers } from '../renderSurfaces.js';
import { getLoteLabels } from '../loteLabels.js';
import BlueprintViewer from './BlueprintViewer.jsx';
import StageSwitcher from './StageSwitcher.jsx';
import { Compass } from './Compass.jsx';
import { useCompass } from '../hooks/useCompass.js';
import { API_BASE } from '../api/config.js';
import { trackEvent, detectOrigin } from '../analytics.js';

const API_URL = '/api/viewer/current';
const DATA_URL_PARAM = 'data';
const CLICK_BASE_URL = `${API_BASE}/public/lots`;

const VISIT_ORIGIN = detectOrigin();

// @arcgis/core pesa varios MB — se separa en su propio chunk y solo se baja
// si el usuario efectivamente activa el modo satelital.
const SatelliteViewer = lazy(() => import('./SatelliteViewer.jsx'));

// Slugs en el path — URL amigable alternativa a ?data=:
//   /paseoberlin           → [projectSlug]
//   /paseoberlin/mitte     → [projectSlug, loteoSlug] (loteo puntual dentro del proyecto)
function getSlugPartsFromPath() {
  return window.location.pathname.split('/').filter(Boolean);
}

// Resuelve de dónde sacar el JSON del visor: ?data=<url> explícito tiene
// prioridad (usado por enlaces internos que apuntan a un loteo puntual),
// si no hay se intenta el/los slug(s) del path (URL pública amigable).
export function getViewerDataUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryUrl = params.get(DATA_URL_PARAM);
  if (queryUrl && typeof queryUrl === 'string' && queryUrl.trim()) return queryUrl.trim();

  const [projectSlug, loteoSlug] = getSlugPartsFromPath();
  if (projectSlug && loteoSlug) {
    return `${API_BASE}/public/projects/by-slug/${projectSlug}/loteos/by-slug/${loteoSlug}/group_visor_data`;
  }
  if (projectSlug) {
    return `${API_BASE}/public/projects/by-slug/${projectSlug}/group_visor_data`;
  }

  return null;
}

// El slug de proyecto en el path (si lo hay), para pedir el branding aparte
// del group_visor_data — el logo tiene que aparecer en pantalla de carga
// aunque el fetch pesado (lotes, pois, etc.) todavía no haya respondido.
function getProjectSlugFromPath() {
  const [projectSlug] = getSlugPartsFromPath();
  return projectSlug ?? null;
}

export async function fetchProjectBranding(projectSlug) {
  if (!projectSlug) return null;
  try {
    const res = await fetch(`${API_BASE}/public/projects/by-slug/${projectSlug}/branding`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

export async function fetchViewerData() {
  const queryDataUrl = getViewerDataUrl();
  if (queryDataUrl) {
    try {
      const res = await fetch(queryDataUrl);
      if (res.ok) return await res.json();
      throw new Error(`La URL devolvió ${res.status}`);
    } catch (err) {
      throw new Error(`No se pudo cargar el JSON desde la URL: ${err.message}`);
    }
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(API_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.json();
  } catch (_) {
    // Backend no disponible o tardó demasiado
  }
  return null;
}

function postLoteClick(id) {
  fetch(`${CLICK_BASE_URL}/${id}/click`, { method: 'POST' })
    .catch((err) => console.warn('POST lote click:', err));
}

// Normaliza la respuesta a un grupo de etapas. Soporta la forma nueva
// (group_visor_data: { stages, entry_stage_id }) y la vieja (visor_data plano),
// que se envuelve como un grupo de una sola etapa.
export function normalizeToGroup(data) {
  if (data && Array.isArray(data.stages)) {
    return {
      projectId: data.project_id ?? null,
      entryStageId: data.entry_stage_id ?? data.stages[0]?.id ?? null,
      stages: data.stages,
      project: data.project ?? null,
      loteoLogoUrl: data.loteo_logo_url ?? null,
      whatsappPhone: data.whatsapp_phone ?? null,
      hideContactForm: data.hide_contact_form ?? false,
      __usingFallback: data.__usingFallback,
    };
  }
  return {
    projectId: null,
    entryStageId: 'single',
    stages: [{ id: 'single', name: '', orden: 0, visor: data }],
    project: null,
    loteoLogoUrl: null,
    whatsappPhone: data?.whatsapp_phone ?? null,
    hideContactForm: data?.hide_contact_form ?? false,
    __usingFallback: data?.__usingFallback,
  };
}

const PANEL_CLOSED = { isOpen: false, title: '', content: '', markerId: null, detail: {} };

// Panorama es la vista por defecto salvo que la etapa no tenga panorama y sí
// blueprint (etapa blueprint-only) — caso real: el editor permite guardar
// una etapa con solo el plano cargado.
function defaultViewModeForVisor(visor) {
  if (visor?.panoramaUrl) return 'panorama';
  if (visor?.blueprintUrl) return 'blueprint';
  return 'panorama';
}

function initialViewModeForGroup(group) {
  if (!group) return 'panorama';
  const entryStage = group.stages?.find((s) => s.id === group.entryStageId) ?? group.stages?.[0];
  return defaultViewModeForVisor(entryStage?.visor);
}

const IconBackArrow = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const VIEW_MODE_LABELS = {
  panorama: 'Ver panorama',
  blueprint: 'Ver plano',
  satellite: 'Ver vista satelital',
};

const VIEW_MODE_SHORT_LABELS = {
  panorama: 'Modo panorama',
  blueprint: 'Modo plano',
  satellite: 'Modo satélite',
};

const VIEW_MODE_ICONS = {
  panorama: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </svg>
  ),
  blueprint: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  satellite: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 7 9 3 5 7l4 4" />
      <path d="M17 11l4 4-4 4-4-4" />
      <path d="m8 12 4 4" />
      <path d="m10.5 9.5 4 4" />
      <path d="M3 21c2-1 3-2 4-4" />
    </svg>
  ),
};

/**
 * Experiencia 360° del visor (panorama + blueprint + markers + panel de info).
 *
 * @param {object|null} preloadedGroup     - Grupo ya normalizado/precargado. Si se pasa,
 *                                            no vuelve a hacer fetch.
 * @param {Function|null} onBackToPresentation - Si se pasa, muestra un botón "volver".
 */
// ?showcase=1 — modo grabación: autocompleta el form de precalificación
// (sin tipeo) y no manda fetches reales (ni click ni submit).
const isShowcaseMode = new URLSearchParams(window.location.search).get('showcase') === '1';

export default function ViewerExperience({ preloadedGroup = null, onBackToPresentation = null }) {
  const [group, setGroup] = useState(preloadedGroup);
  const [earlyLogoUrl, setEarlyLogoUrl] = useState(null);
  const [currentStageId, setCurrentStageId] = useState(preloadedGroup?.entryStageId ?? null);
  const [committedStageId, setCommittedStageId] = useState(null);
  const [loading, setLoading] = useState(!preloadedGroup);
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [stageError, setStageError] = useState(null);
  const [stagePending, setStagePending] = useState(true);
  const [stageProgress, setStageProgress] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [panel, setPanel] = useState(PANEL_CLOSED);
  const [viewMode, setViewMode] = useState(() => initialViewModeForGroup(preloadedGroup));
  const [recommendedIds, setRecommendedIds] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get('recommended');
    return raw ? new Set(raw.split(',').filter(Boolean)) : new Set();
  });
  const [focusMode, setFocusMode] = useState(false);
  const autoEnabledFocusRef = useRef(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const onboardingCheckedRef = useRef(false);

  // Al llegar recomendados (por query param o por el simulador), el modo
  // foco arranca activado una sola vez. Si el usuario lo apaga a mano, no
  // se vuelve a forzar aunque lleguen más recomendados después.
  useEffect(() => {
    if (recommendedIds.size > 0 && !autoEnabledFocusRef.current) {
      autoEnabledFocusRef.current = true;
      setFocusMode(true);
    }
  }, [recommendedIds]);

  // Puente con el simulador de compra: cuando corre embebido en la misma
  // landing, manda `eligibleLotIds` por postMessage al abrir "Ver lotes
  // compatibles". Mientras esa integración no esté conectada, el param
  // ?recommended=id1,id2 permite probar el highlight de forma standalone.
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'notry:simulator-view-lots' && Array.isArray(event.data.eligibleLotIds)) {
        setRecommendedIds(new Set(event.data.eligibleLotIds));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Branding liviano (solo logo/colores) pedido en paralelo al fetch pesado
  // del group_visor_data: en un cold start del backend, este responde mucho
  // antes y permite mostrar el logo del proyecto durante toda la carga.
  useEffect(() => {
    if (preloadedGroup) return;
    let cancelled = false;
    fetchProjectBranding(getProjectSlugFromPath())
      .then((branding) => {
        if (!cancelled && branding?.logo_primary) setEarlyLogoUrl(branding.logo_primary);
      });
    return () => { cancelled = true; };
  }, [preloadedGroup, loadAttempt]);

  useEffect(() => {
    if (preloadedGroup) return; // Datos ya provistos por <Presentation>.
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchViewerData()
      .then((data) => {
        if (cancelled) return; // StrictMode dispara este efecto 2 veces en dev.
        if (data) {
          const normalized = normalizeToGroup(data);
          setGroup(normalized);
          setCurrentStageId(normalized.entryStageId);
          setViewMode(initialViewModeForGroup(normalized));
        }
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'No se pudo cargar el visor.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [preloadedGroup, loadAttempt]);

  // Inyecta CSS vars de branding del proyecto en :root al cargar
  useEffect(() => {
    const p = group?.project;
    if (!p) return;
    const root = document.documentElement;
    if (p.primary_color) root.style.setProperty('--accent', p.primary_color);
    if (p.accent_color)  root.style.setProperty('--accent-hover', p.accent_color);
    if (p.font_family)   root.style.setProperty('--font-body', p.font_family + ', system-ui, sans-serif');
    return () => {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--font-body');
    };
  }, [group?.project]);

  const stages = group?.stages ?? [];
  const currentStage = useMemo(
    () => stages.find((s) => s.id === currentStageId) ?? stages[0] ?? null,
    [stages, currentStageId]
  );
  const rawData = currentStage?.visor ?? null;
  const blueprintUrl = rawData?.blueprintUrl || null;
  const satelliteLatitude = rawData?.latitude ?? null;
  const satelliteLongitude = rawData?.longitude ?? null;
  const hasSatellite = satelliteLatitude != null && satelliteLongitude != null;
  const availableViewModes = useMemo(() => {
    const modes = [];
    if (rawData?.panoramaUrl) modes.push('panorama');
    if (blueprintUrl) modes.push('blueprint');
    if (hasSatellite) modes.push('satellite');
    return modes;
  }, [rawData?.panoramaUrl, blueprintUrl, hasSatellite]);

  // Un solo evento de inicio de sesión por visita, con la etapa de entrada.
  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (sessionStartedRef.current || !currentStage?.id) return;
    sessionStartedRef.current = true;
    trackEvent(currentStage.id, 'session_start');
  }, [currentStage?.id]);

  // Mapa id→nombre de etapa para resolver el destino de un POI de navegación.
  const stageNameById = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s.name])),
    [stages]
  );

  const goToStage = useCallback((stageId) => {
    const targetStage = stages.find((stage) => stage.id === stageId);
    if (!targetStage) return;
    setStageError(null);
    setStagePending(true);
    setStageProgress(0);
    setCurrentStageId(stageId);
    setPanel(PANEL_CLOSED);
    setViewMode(defaultViewModeForVisor(targetStage.visor));
    trackEvent(stageId, 'stage_change');
  }, [stages]);

  const handleStageReady = useCallback(({ stageId, markersOk }) => {
    setCommittedStageId(stageId);
    setStagePending(false);
    setStageProgress(100);
    setStageError(null);
    if (!markersOk) console.warn(`La etapa ${stageId} cargó con anotaciones inválidas omitidas.`);
  }, []);

  // En blueprint no hay panorama que dispare `onStageReady` (BlueprintViewer
  // maneja su propio loading interno) — sin esto, "Cargando etapa..." y el
  // selector de etapas deshabilitado quedarían pegados para siempre en una
  // etapa blueprint-only.
  useEffect(() => {
    if ((viewMode === 'blueprint' || viewMode === 'satellite') && currentStage?.id) {
      handleStageReady({ stageId: currentStage.id, markersOk: true });
    }
  }, [viewMode, currentStage?.id, handleStageReady]);

  // Onboarding de gestos: una sola vez por sesión de pestaña (sessionStorage),
  // recién cuando la primera etapa terminó de cargar (no tapar la pantalla de carga).
  useEffect(() => {
    if (onboardingCheckedRef.current || committedStageId === null) return;
    onboardingCheckedRef.current = true;
    const key = `notry_visor_onboarding_seen_${group?.projectId ?? 'default'}`;
    try {
      if (!sessionStorage.getItem(key)) setShowOnboarding(true);
    } catch (_) {
      setShowOnboarding(true);
    }
  }, [committedStageId, group?.projectId]);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    const key = `notry_visor_onboarding_seen_${group?.projectId ?? 'default'}`;
    try { sessionStorage.setItem(key, '1'); } catch (_) { /* sessionStorage no disponible */ }
  }, [group?.projectId]);

  const handleStageError = useCallback(({ stageId, message }) => {
    setStageError({ stageId, message });
    setStagePending(false);
  }, []);

  const handleStageProgress = useCallback(({ stageId, progress }) => {
    if (currentStage?.id === stageId) setStageProgress(progress ?? 0);
  }, [currentStage?.id]);

  const retryStage = useCallback(() => {
    if (!stageError?.stageId) return;
    setStageError(null);
    setStagePending(true);
    setStageProgress(0);
    setCurrentStageId(stageError.stageId);
    setRetryNonce((value) => value + 1);
  }, [stageError]);

  const annotations = rawData?.annotations ?? [];

  const annotationsById = useMemo(
    () => Object.fromEntries(annotations.map((a) => [a.uuid ?? a.id, a])),
    [annotations]
  );

  const blueprintAnnotations = useMemo(
    () => annotations.filter(a => a.type === 'polygon' && a.blueprint_coordinates?.length >= 3 || a.type === 'poi' && ((a.variant === 'callout' || a.marker_variant === 'callout') ? (a.blueprint_anchor ?? a.blueprint_coordinates?.[0]) : a.blueprint_coordinates?.length >= 3)),
    [annotations]
  );

  // Candidatas para una única precarga conservadora. useViewer descarta las
  // pesadas, las tiles y las conexiones con ahorro de datos.
  const preloadCandidates = useMemo(
    () => stages.map((stage) => ({
      url: stage.visor?.panoramaUrl,
      byteSize: stage.visor?.panorama?.byteSize ?? stage.visor?.panoramaByteSize ?? null,
    })).filter((item) => item.url),
    [stages]
  );

  const homePosition = useMemo(
    () => rawData?.homeYaw != null ? { yaw: rawData.homeYaw, pitch: rawData.homePitch ?? 0 } : null,
    [rawData]
  );
  const northOffset = rawData?.northOffset ?? null;
  // Prototipo client-only de códigos de lote (ver loteLabels.js): sin backend,
  // se prueba visualmente antes de conectarlo a un campo real.
  const loteLabels = useMemo(() => getLoteLabels(annotations), [annotations]);
  const badgeStyle = group?.project?.lote_badge_style ?? 'default';
  const badgeColors = group?.project?.lote_badge_colors ?? false;
  // Estilo de los lotes en el plano: 'inherit' (o ausente) = igual que panorama.
  const planoStyle = group?.project?.lote_plano_style;
  const blueprintBadgeStyle = planoStyle && planoStyle !== 'inherit' ? planoStyle : badgeStyle;
  // Las superficies de manzana/calle van primero en el array: los markers
  // "poly" de PSV pintan en orden de inserción (no por zIndex), así quedan
  // detrás de los polígonos de lote.
  const surfaceMarkers = useMemo(
    () => renderSurfacesToMarkers(rawData?.renderSurfaces),
    [rawData?.renderSurfaces]
  );
  const markers = useMemo(
    () => [
      ...surfaceMarkers,
      ...annotationsToMarkers(annotations, rawData?.snapThreshold, recommendedIds, focusMode, loteLabels, badgeStyle, badgeColors),
    ],
    [surfaceMarkers, annotations, rawData?.snapThreshold, recommendedIds, focusMode, loteLabels, badgeStyle, badgeColors]
  );
  const viewerData = useMemo(
    () => viewMode === 'blueprint' || viewMode === 'satellite' || !rawData
      ? null
      : {
          // La etapa es la identidad del contenido. La URL puede repetirse
          // entre etapas y no alcanza para decidir si hay que reemplazar
          // markers, posición o metadata.
          stageId: currentStage?.id ?? null,
          panoramaUrl: rawData.panoramaUrl,
          markers,
          annotations,
          requestNonce: retryNonce,
        },
    [viewMode, currentStage?.id, rawData, markers, annotations, retryNonce]
  );

  const handleMarkerSelect = useCallback((marker, markersPlugin) => {
    // Ignore synthetic markers (border polylines, icon overlays, lote badges,
    // manzana/calle de fondo)
    if (marker.id.includes('__border__') || marker.id.includes('__icon') || marker.id.includes('__badge') || marker.id.startsWith('render-')) return;

    const ann = annotationsById[marker.id];

    if (ann?.type === 'text') {
      markersPlugin.hideMarkerPanel?.();
      return;
    }

    if (ann?.type === 'poi') {
      trackEvent(currentStage?.id, 'poi_click', { type: 'poi', id: marker.id });
      setPanel({
        isOpen: true,
        title: ann.tooltip ?? marker.id,
        content: ann.description ?? '',
        markerId: marker.id,
        detail: {
          type: 'poi',
          icon_type: ann.icon_type ?? null,
          link_url: ann.link_url ?? null,
          color: ann.color ?? '#14b8a6',
          image_url: ann.image_url ?? null,
          poi_kind: ann.poi_kind ?? 'place',
          distance_value: ann.distance_value ?? null,
          distance_unit: ann.distance_unit ?? null,
          target_loteo_id: ann.target_loteo_id ?? null,
          target_stage_name: ann.target_loteo_id ? (stageNameById[ann.target_loteo_id] ?? null) : null,
        },
      });
      return;
    }

    if (!isShowcaseMode) postLoteClick(marker.id);
    trackEvent(currentStage?.id, 'lote_click', { type: 'lote', id: marker.id });

    setPanel({
      isOpen: true,
      title: ann?.tooltip ?? marker.id,
      content: ann?.content ?? '',
      markerId: marker.id,
      detail: { price: ann?.price, area_m2: ann?.area_m2, estado: ann?.status ?? ann?.estado, comments: ann?.comments ?? null, image_urls: ann?.image_urls ?? [] },
    });
  }, [annotationsById, stageNameById, currentStage?.id]);

  const handleBlueprintSelect = useCallback((ann) => {
    const id = ann.uuid || ann.id;

    if (ann.type === 'poi') {
      trackEvent(currentStage?.id, 'poi_click', { type: 'poi', id });
      setPanel({
        isOpen: true,
        title: ann.tooltip ?? id,
        content: ann.description ?? '',
        markerId: id,
        detail: {
          type: 'poi',
          icon_type: ann.icon_type ?? null,
          link_url: ann.link_url ?? null,
          color: ann.color ?? '#14b8a6',
          image_url: ann.image_url ?? null,
          poi_kind: ann.poi_kind ?? 'place',
          distance_value: ann.distance_value ?? null,
          distance_unit: ann.distance_unit ?? null,
          target_loteo_id: ann.target_loteo_id ?? null,
          target_stage_name: ann.target_loteo_id ? (stageNameById[ann.target_loteo_id] ?? null) : null,
        },
      });
      return;
    }

    if (!isShowcaseMode) postLoteClick(id);
    trackEvent(currentStage?.id, 'lote_click', { type: 'lote', id });

    setPanel({
      isOpen: true,
      title: ann.tooltip ?? id,
      content: ann.content ?? '',
      markerId: id,
      detail: { price: ann.price, area_m2: ann.area_m2, estado: ann.status ?? ann.estado, comments: ann.comments ?? null, image_urls: ann.image_urls ?? [] },
    });
  }, [stageNameById, currentStage?.id]);

  const handleMarkerUnselect = useCallback(() => {
    setPanel(PANEL_CLOSED);
  }, []);

  const { yaw: compassYaw, onPositionChange } = useCompass();
  const viewerRef = useViewer(
    viewerData,
    handleMarkerSelect,
    handleMarkerUnselect,
    preloadCandidates,
    homePosition,
    onPositionChange,
    handleStageReady,
    handleStageError,
    handleStageProgress,
  );

  const selectViewMode = useCallback((mode) => {
    setViewMode((current) => {
      if (mode === current) return current;
      if (mode === 'panorama') {
        setStagePending(true);
        setStageProgress(0);
      } else {
        // blueprint/satellite no dependen de que cargue el panorama esférico.
        setCommittedStageId(currentStage?.id ?? null);
        setStagePending(false);
        setStageError(null);
      }
      return mode;
    });
  }, [currentStage?.id]);

  if (loadError) {
    return (
      <div className="viewer-load-error" role="alert">
        <p>{loadError}</p>
        <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          Reintentar
        </button>
      </div>
    );
  }

  if (loading || !group || !rawData) {
    return <LoadingScreen logoUrl={group?.project?.logo_primary ?? earlyLogoUrl} progress={stageProgress} />;
  }

  return (
    <>
      {committedStageId === null && !stageError && (
        <LoadingScreen logoUrl={group?.project?.logo_primary ?? earlyLogoUrl} progress={stageProgress} />
      )}

      <OnboardingOverlay
        visible={showOnboarding}
        onDismiss={dismissOnboarding}
        projectName={group?.project?.name}
        hasViewToggle={availableViewModes.length > 1}
        hasStages={stages.length > 1}
      />

      {onBackToPresentation && (
        <button
          className="back-to-presentation"
          onClick={onBackToPresentation}
          aria-label="Volver a la presentación"
          title="Volver a la presentación"
        >
          <IconBackArrow />
          <span>Presentación</span>
        </button>
      )}

      <Compass
        yaw={compassYaw}
        northOffset={northOffset}
        visible={viewMode === 'panorama'}
        logoUrl={group?.project?.logo_primary ?? null}
      />

      {recommendedIds.size > 0 && (
        <button
          type="button"
          className={`recommended-filter-toggle${stages.length > 1 ? ' recommended-filter-toggle--above-switcher' : ''}`}
          onClick={() => setFocusMode((v) => !v)}
          aria-pressed={focusMode}
          title={focusMode ? 'Mostrar todos los lotes' : 'Mostrar solo los recomendados'}
        >
          <span className="recommended-filter-toggle__dot" />
          {focusMode ? 'Ver todos los lotes' : 'Ver solo recomendados'}
        </button>
      )}

      {availableViewModes.length > 1 && (
        <div className="view-toggle-group" role="group" aria-label="Modo de vista">
          {availableViewModes.map((mode) => (
            <button
              key={mode}
              type="button"
              className="view-toggle"
              style={viewMode === mode ? { background: 'var(--accent)', color: '#1a1a1a', borderColor: 'transparent' } : {}}
              onClick={() => selectViewMode(mode)}
              aria-pressed={viewMode === mode}
              aria-label={VIEW_MODE_LABELS[mode]}
              title={VIEW_MODE_LABELS[mode]}
            >
              <span className="view-toggle__icon">{VIEW_MODE_ICONS[mode]}</span>
              <span className="view-toggle__label">{VIEW_MODE_SHORT_LABELS[mode]}</span>
            </button>
          ))}
        </div>
      )}

      {viewMode === 'blueprint' ? (
        <BlueprintViewer
          blueprintUrl={blueprintUrl}
          annotations={blueprintAnnotations}
          selectedId={panel.markerId}
          onMarkerSelect={handleBlueprintSelect}
          onMarkerHover={() => {}}
          hasStageSwitcher={stages.length > 1}
          recommendedIds={recommendedIds}
          focusMode={focusMode}
          loteLabels={loteLabels}
          badgeStyle={blueprintBadgeStyle}
          badgeColors={badgeColors}
        />
      ) : viewMode === 'satellite' ? (
        <Suspense fallback={null}>
          <SatelliteViewer
            latitude={satelliteLatitude}
            longitude={satelliteLongitude}
            annotations={blueprintAnnotations}
            onMarkerSelect={handleBlueprintSelect}
          />
        </Suspense>
      ) : (
        <div id="viewer-container" ref={viewerRef} />
      )}

      {stages.length > 1 && (
        <StageSwitcher
          stages={stages}
          currentStageId={committedStageId}
          pendingStageId={stagePending ? currentStage?.id : null}
          progress={stageProgress}
          onSelect={goToStage}
        />
      )}

      {(stagePending || currentStage?.id !== committedStageId) && !stageError && (
        <div
          className={`stage-transition-status${recommendedIds.size > 0 ? ' stage-transition-status--above-filter' : ''}`}
          role="status"
          aria-live="polite"
        >
          {stageProgress > 0 && stageProgress < 100
            ? `Cargando etapa… ${Math.round(stageProgress)}%`
            : 'Cargando etapa…'}
        </div>
      )}

      {stageError && (
        <div
          className={`stage-transition-error${recommendedIds.size > 0 ? ' stage-transition-error--above-filter' : ''}`}
          role="alert"
        >
          <span>{stageError.message}</span>
          <button type="button" onClick={retryStage}>Reintentar</button>
        </div>
      )}

      <InfoPanel
        isOpen={panel.isOpen}
        title={panel.title}
        content={panel.content}
        markerId={panel.markerId}
        detail={panel.detail}
        services={currentStage?.visor?.services ?? null}
        origin={VISIT_ORIGIN}
        whatsappPhone={group?.whatsappPhone}
        hideContactForm={group?.hideContactForm}
        loteoId={currentStage?.id}
        onClose={() => setPanel(PANEL_CLOSED)}
        onGoToStage={goToStage}
        showcase={isShowcaseMode}
      />
    </>
  );
}

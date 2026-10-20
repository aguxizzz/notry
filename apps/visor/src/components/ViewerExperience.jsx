import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { InfoPanel } from './InfoPanel.jsx';
import { Compass } from './Compass.jsx';
import { LotPanel, LotFloat, MapControls, CompassTape, FLOAT_SHEET_RATIO } from './LotPanel.jsx';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { LoadingScreen } from './LoadingScreen.jsx';
import { OnboardingOverlay } from './OnboardingOverlay.jsx';
import { useViewer, focusMarker, CENTERED_PANEL_QUERY } from '../hooks/useViewer.js';
import { annotationsToOrbitLots, markersToOrbitPins, markersToOrbitSurfaces } from '../lotOrbit.js';
import { annotationsToMarkers } from '../annotations.js';
import { renderSurfacesToMarkers } from '../renderSurfaces.js';
import { getLoteLabels } from '../loteLabels.js';
import BlueprintViewer from './BlueprintViewer.jsx';
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
// El loteo (si viene) es para que la galería de carga sea la misma etapa con la que abre.
function getBrandingSlugsFromPath() {
  const [projectSlug, loteoSlug] = getSlugPartsFromPath();
  return { projectSlug: projectSlug ?? null, loteoSlug: loteoSlug ?? null };
}

export async function fetchProjectBranding(projectSlug, loteoSlug = null) {
  if (!projectSlug) return null;
  const query = loteoSlug ? `?loteo=${encodeURIComponent(loteoSlug)}` : '';
  try {
    const res = await fetch(`${API_BASE}/public/projects/by-slug/${projectSlug}/branding${query}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

// Fotos del desarrollo para la pantalla de carga: [{ url, caption }]. El back
// las entrega ya resueltas (las del loteo, o las del proyecto como respaldo).
// Acepta también strings sueltos por si alguna vez llegan solo URLs.
const MAX_LOADING_GALLERY = 6;
function normalizeLoadingGallery(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === 'string' ? { url: item } : item))
    .filter((item) => typeof item?.url === 'string' && item.url)
    .map((item) => ({ url: item.url, caption: item.caption?.trim() || '' }))
    .slice(0, MAX_LOADING_GALLERY);
}

// Solo dev: ?loadingGallery=demo usa los recortes del mockup (design-lab/)
// para probar la galería sin datos cargados en el back.
const DEV_LOADING_GALLERY = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('loadingGallery') === 'demo'
  ? [
      { url: '/design-lab/carga-assets/render-2.jpg', caption: 'Acceso principal' },
      { url: '/design-lab/carga-assets/render-3.jpg', caption: 'Club house y amenities' },
      { url: '/design-lab/carga-assets/render-1.jpg', caption: 'Espacios verdes' },
      { url: '/design-lab/carga-assets/render-4.jpg', caption: 'Vista aérea del loteo' },
    ]
  : null;

// Cuánto queda montada la pantalla de carga después de terminar, para que
// se disuelva sobre el visor (coincide con la transición de .is-done).
const LOADING_FADE_MS = 1000;

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
      loadingGallery: normalizeLoadingGallery(data.loading_gallery),
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
    loadingGallery: normalizeLoadingGallery(data?.loading_gallery),
    whatsappPhone: data?.whatsapp_phone ?? null,
    hideContactForm: data?.hide_contact_form ?? false,
    __usingFallback: data?.__usingFallback,
  };
}

const PANEL_CLOSED = { isOpen: false, title: '', content: '', markerId: null, detail: {} };

function lotPanelState(ann, id, docked = false) {
  return {
    isOpen: true,
    title: ann?.tooltip ?? id,
    content: ann?.content ?? '',
    markerId: id,
    detail: { price: ann?.price, area_m2: ann?.area_m2, estado: ann?.status ?? ann?.estado, comments: ann?.comments ?? null, image_urls: ann?.image_urls ?? [] },
    docked,
  };
}

// Escritorio con lugar para el panel lateral (lista de lotes + ficha). En
// celular y apaisado chico va el flotante (LotFloat).
const LOT_PANEL_QUERY = '(min-width: 768px) and (min-height: 520px)';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// Cuánto tapa la ficha acoplada, para que la órbita encuadre el lote en lo
// que queda libre: al costado en escritorio, abajo en celular.
const ORBIT_PANEL_MARGIN = 16;

// Con el panel lateral la ficha vive adentro: lo que tapa es el panel. En
// celular tapan la barra de arriba y la ficha, que sube desde abajo.
function getLotPanelInsets() {
  const float = document.getElementById('lot-float');
  if (float) {
    const top = float.querySelector('.lf-top')?.getBoundingClientRect().bottom ?? 0;
    return { top: top + ORBIT_PANEL_MARGIN / 2, bottom: Math.round(window.innerHeight * FLOAT_SHEET_RATIO) };
  }
  const lotPanel = document.getElementById('lot-panel');
  if (!lotPanel) return null;
  if (lotPanel.dataset.collapsed === '1') return {};
  return { left: lotPanel.getBoundingClientRect().right + ORBIT_PANEL_MARGIN };
}

function getOrbitInsets() {
  const panelInsets = getLotPanelInsets();
  if (panelInsets) return panelInsets;
  const wrap = document.getElementById('info-panel-wrap');
  if (!wrap) return null;
  return window.matchMedia(CENTERED_PANEL_QUERY).matches
    ? { right: wrap.offsetWidth + ORBIT_PANEL_MARGIN, bottom: 0 }
    : { right: 0, bottom: wrap.offsetHeight };
}

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

// Lotes que no pasan los filtros del panel: se apagan en la foto (relleno
// oscuro, borde tenue, badge translúcido) en vez de desaparecer.
const DIM_FILL = 'rgba(10,10,10,0.42)';
function dimFilteredMarkers(markers, visibleIds, lotIds) {
  return markers.map((m) => {
    const [id, kind] = String(m.id).split('__');
    if (!lotIds.has(id) || visibleIds.has(id)) return m;
    if (!kind) return { ...m, svgStyle: { ...m.svgStyle, fill: DIM_FILL } };
    if (kind === 'border') return { ...m, svgStyle: { ...m.svgStyle, stroke: 'rgba(255,255,255,0.3)' } };
    if (kind === 'badge') return { ...m, style: { ...m.style, opacity: 0.28 } };
    return m;
  });
}

const IconBackArrow = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

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
  const [earlyGallery, setEarlyGallery] = useState([]);
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
  const usePanel = useMediaQuery(LOT_PANEL_QUERY);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [lotFilter, setLotFilter] = useState(null);

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
    const { projectSlug, loteoSlug } = getBrandingSlugsFromPath();
    fetchProjectBranding(projectSlug, loteoSlug)
      .then((branding) => {
        if (cancelled) return;
        if (branding?.logo_primary) setEarlyLogoUrl(branding.logo_primary);
        setEarlyGallery(normalizeLoadingGallery(branding?.loading_gallery));
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
    // Si se entra por link a un lote, la ficha ya explica todo: no hace falta.
    if (new URLSearchParams(window.location.search).get('lote')) return;
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
  const baseMarkers = useMemo(
    () => [
      ...surfaceMarkers,
      ...annotationsToMarkers(annotations, rawData?.snapThreshold, recommendedIds, focusMode, loteLabels, badgeStyle, badgeColors),
    ],
    [surfaceMarkers, annotations, rawData?.snapThreshold, recommendedIds, focusMode, loteLabels, badgeStyle, badgeColors]
  );
  const lotIds = useMemo(
    () => new Set(annotations.filter((a) => a.type === 'polygon').map((a) => a.uuid ?? a.id)),
    [annotations]
  );
  const markers = useMemo(
    () => (lotFilter ? dimFilteredMarkers(baseMarkers, lotFilter, lotIds) : baseMarkers),
    [baseMarkers, lotFilter, lotIds]
  );
  const orbitLots = useMemo(
    () => annotationsToOrbitLots(annotations, { recommendedIds, focusMode, badgeStyle }),
    [annotations, recommendedIds, focusMode, badgeStyle]
  );
  const orbitSurfaces = useMemo(() => markersToOrbitSurfaces(surfaceMarkers), [surfaceMarkers]);
  const orbitPins = useMemo(() => markersToOrbitPins(markers), [markers]);
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
          orbitLots,
          orbitSurfaces,
          orbitPins,
          annotations,
          requestNonce: retryNonce,
        },
    [viewMode, currentStage?.id, rawData, markers, orbitLots, orbitSurfaces, orbitPins, annotations, retryNonce]
  );

  const handleMarkerSelect = useCallback((marker, markersPlugin, viewer, orbit) => {
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
    // Órbita alrededor del lote con la ficha acoplada; si no se puede
    // (panorama parcial, movimiento reducido), vuelo simple con la ficha modal.
    const orbiting = Boolean(orbit?.select(marker.id));
    if (!orbiting) focusMarker(viewer, marker, getLotPanelInsets());

    setPanel(lotPanelState(ann, marker.id, orbiting));
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

  // Click en otro lote estando ya en órbita (los markers de PSV están ocultos).
  const handleOrbitPick = useCallback((id, orbit) => {
    if (!orbit.select(id)) return;
    if (!isShowcaseMode) postLoteClick(id);
    trackEvent(currentStage?.id, 'lote_click', { type: 'lote', id });
    setPanel(lotPanelState(annotationsById[id], id, true));
  }, [annotationsById, currentStage?.id]);

  const { yaw: compassYaw, onPositionChange } = useCompass();
  const { containerRef: viewerRef, orbitRef, viewerRef: psvRef } = useViewer(
    viewerData,
    handleMarkerSelect,
    handleMarkerUnselect,
    preloadCandidates,
    homePosition,
    onPositionChange,
    handleStageReady,
    handleStageError,
    handleStageProgress,
    handleOrbitPick,
    getOrbitInsets,
  );

  // Cerrar la ficha (X, Esc, envío del form, cambio de etapa) vuelve al dron.
  useEffect(() => {
    if (!panel.isOpen) orbitRef.current?.exit();
  }, [panel.isOpen, orbitRef]);

  // Elegir un lote desde el panel: mismo recorrido que tocarlo en la foto.
  const selectLotById = useCallback((id) => {
    const ann = annotationsById[id];
    if (!ann || ann.type !== 'polygon') return;
    if (!isShowcaseMode) postLoteClick(id);
    trackEvent(currentStage?.id, 'lote_click', { type: 'lote', id });
    let orbiting = false;
    const viewer = psvRef.current;
    if (viewMode === 'panorama' && viewer) {
      orbiting = Boolean(orbitRef.current?.select(id));
      if (!orbiting) {
        try {
          focusMarker(viewer, viewer.getPlugin(MarkersPlugin).getMarker(id), getLotPanelInsets());
        } catch (_) { /* el lote no tiene polígono en el panorama */ }
      }
    }
    setPanelCollapsed(false);
    setPanel(lotPanelState(ann, id, orbiting));
  }, [annotationsById, currentStage?.id, viewMode, orbitRef, psvRef]);

  const closeLot = useCallback(() => setPanel(PANEL_CLOSED), []);

  // Hover en una fila de la lista (escritorio): resalta el lote en la foto sin
  // mover la cámara. Va directo al DOM de PSV (y a la órbita) en vez de pasar
  // por los markers: cambiarlos re-aplica la etapa entera.
  const hoveredLotRef = useRef(null);
  const hoverLot = useCallback((id) => {
    if (hoveredLotRef.current === id) return;
    hoveredLotRef.current = id;
    orbitRef.current?.highlight(id);
    const viewer = psvRef.current;
    if (!viewer) return;
    viewer.container.querySelectorAll('.is-row-hover').forEach((el) => el.classList.remove('is-row-hover'));
    if (!id) return;
    try {
      for (const marker of viewer.getPlugin(MarkersPlugin).getMarkers()) {
        const mid = String(marker.id);
        if (mid === id || mid.startsWith(`${id}__border__`)) marker.domElement?.classList.add('is-row-hover');
      }
    } catch (_) { /* sin markers todavía */ }
  }, [orbitRef, psvRef]);

  // "Cerca": lleva la cámara al lugar, sin abrir nada encima.
  const flyToPoi = useCallback((id) => {
    const viewer = psvRef.current;
    if (viewMode !== 'panorama' || !viewer) return;
    setPanel(PANEL_CLOSED);
    try {
      const marker = viewer.getPlugin(MarkersPlugin).getMarker(id);
      const pos = marker?.state?.position;
      if (!pos) return;
      const insets = getLotPanelInsets() ?? {};
      const zoom = 40;
      const hFov = viewer.dataHelper.vFovToHFov(viewer.dataHelper.zoomLevelToFov(zoom));
      const yaw = pos.yaw - ((insets.left ?? 0) / 2 / viewer.state.size.width) * hFov * (Math.PI / 180);
      viewer.animate({ yaw, pitch: pos.pitch, zoom, speed: 1100 });
    } catch (_) { /* el lugar no está en el panorama */ }
  }, [viewMode, psvRef]);

  const zoomBy = useCallback((delta) => {
    const viewer = psvRef.current;
    if (!viewer) return;
    viewer.animate({ zoom: Math.max(0, Math.min(100, viewer.getZoomLevel() + delta)), speed: 400 });
  }, [psvRef]);
  const resetView = useCallback(() => {
    const viewer = psvRef.current;
    if (!viewer) return;
    viewer.animate({ ...(homePosition ?? { yaw: 0, pitch: 0 }), zoom: 50, speed: 900 });
  }, [psvRef, homePosition]);
  const faceNorth = useCallback(() => {
    const viewer = psvRef.current;
    if (!viewer || northOffset === null) return;
    viewer.animate({ yaw: northOffset, pitch: viewer.getPosition().pitch, speed: 900 });
  }, [psvRef, northOffset]);

  // El resto del visor (brújula, avisos de etapa) se acomoda al panel.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('lp-on', usePanel);
    root.classList.toggle('lp-collapsed', usePanel && panelCollapsed);
    root.classList.toggle('lf-on', !usePanel);
    return () => root.classList.remove('lp-on', 'lp-collapsed', 'lf-on');
  }, [usePanel, panelCollapsed]);

  // Link por lote (?lote=slug|id, lo genera "Copiar link" de la ficha): se
  // abre una sola vez, apenas la etapa de entrada terminó de cargar.
  const deepLinkDoneRef = useRef(false);
  useEffect(() => {
    if (deepLinkDoneRef.current || committedStageId === null || committedStageId !== currentStage?.id) return;
    deepLinkDoneRef.current = true;
    const wanted = new URLSearchParams(window.location.search).get('lote');
    if (!wanted) return;
    const ann = annotations.find((a) => a.type === 'polygon' && (a.slug === wanted || (a.uuid ?? a.id) === wanted));
    if (ann) setTimeout(() => selectLotById(ann.uuid ?? ann.id), 400);
  }, [committedStageId, currentStage?.id, annotations, selectLotById]);

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

  const loadingActive = loading || !group || !rawData || (committedStageId === null && !stageError);
  const [loadingFading, setLoadingFading] = useState(false);
  const wasLoadingRef = useRef(loadingActive);
  useEffect(() => {
    const was = wasLoadingRef.current;
    wasLoadingRef.current = loadingActive;
    if (loadingActive || !was) { setLoadingFading(false); return undefined; }
    setLoadingFading(true);
    const t = setTimeout(() => setLoadingFading(false), LOADING_FADE_MS);
    return () => clearTimeout(t);
  }, [loadingActive]);

  const loadingGallery = useMemo(() => {
    if (DEV_LOADING_GALLERY) return DEV_LOADING_GALLERY;
    return group?.loadingGallery?.length ? group.loadingGallery : earlyGallery;
  }, [group?.loadingGallery, earlyGallery]);

  // Misma key en las dos ramas de abajo: al pasar de "cargando datos" a
  // "cargando panorama" la galería sigue donde estaba en vez de reiniciarse.
  const loadingScreen = (loadingActive || loadingFading) && (
    <LoadingScreen
      key="loading-screen"
      logoUrl={group?.project?.logo_primary ?? earlyLogoUrl}
      progress={stageProgress}
      gallery={loadingGallery}
      done={!loadingActive}
    />
  );

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
    return <>{loadingScreen}</>;
  }

  return (
    <>
      {loadingScreen}

      <OnboardingOverlay
        visible={showOnboarding}
        onDismiss={dismissOnboarding}
        containerRef={viewerRef}
        psvRef={psvRef}
        sway={viewMode === 'panorama'}
        silenceWhen={panel.isOpen}
        pulseSelector={usePanel ? (panelCollapsed ? '.lp-reopen' : '.lp-tabs button') : '.lf-bar'}
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

      {viewMode === 'blueprint' ? (
        <BlueprintViewer
          blueprintUrl={blueprintUrl}
          annotations={blueprintAnnotations}
          selectedId={panel.markerId}
          onMarkerSelect={handleBlueprintSelect}
          onMarkerHover={() => {}}
          hasStageSwitcher={!usePanel}
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

      {usePanel && (
        <>
          <LotPanel
            project={group?.project}
            stageName={currentStage?.name || null}
            stages={stages}
            currentStageId={currentStage?.id}
            stageBusy={stagePending}
            onSelectStage={goToStage}
            viewModes={availableViewModes}
            viewMode={viewMode}
            onSelectViewMode={selectViewMode}
            annotations={annotations}
            labels={loteLabels}
            services={currentStage?.visor?.services ?? null}
            selectedId={panel.isOpen && panel.detail?.type !== 'poi' ? panel.markerId : null}
            onSelectLot={(id) => { hoverLot(null); selectLotById(id); }}
            onHoverLot={hoverLot}
            onCloseLot={closeLot}
            onPoiSelect={flyToPoi}
            onFilterChange={setLotFilter}
            collapsed={panelCollapsed}
            onToggleCollapsed={() => setPanelCollapsed((v) => !v)}
            whatsappPhone={group?.whatsappPhone}
            hideContactForm={group?.hideContactForm}
            origin={VISIT_ORIGIN}
            loteoId={currentStage?.id}
            showcase={isShowcaseMode}
          />
          {viewMode === 'panorama' && (
            <MapControls
              onZoomIn={() => zoomBy(12)}
              onZoomOut={() => zoomBy(-12)}
              onReset={resetView}
              hidden={Boolean(panel.isOpen && panel.docked)}
            />
          )}
        </>
      )}

      {!usePanel && (
        <LotFloat
          project={group?.project}
          stageName={currentStage?.name || null}
          stages={stages}
          currentStageId={currentStage?.id}
          stageBusy={stagePending}
          onSelectStage={goToStage}
          viewModes={availableViewModes}
          viewMode={viewMode}
          onSelectViewMode={selectViewMode}
          annotations={annotations}
          labels={loteLabels}
          services={currentStage?.visor?.services ?? null}
          selectedId={panel.isOpen && panel.detail?.type !== 'poi' ? panel.markerId : null}
          onSelectLot={selectLotById}
          onCloseLot={closeLot}
          onPoiSelect={flyToPoi}
          onFilterChange={setLotFilter}
          whatsappPhone={group?.whatsappPhone}
          hideContactForm={group?.hideContactForm}
          origin={VISIT_ORIGIN}
          loteoId={currentStage?.id}
          showcase={isShowcaseMode}
          compass={viewMode === 'panorama' && (
            <CompassTape yaw={compassYaw} northOffset={northOffset} onNorth={faceNorth} />
          )}
        />
      )}

      <InfoPanel
        isOpen={panel.isOpen && panel.detail?.type === 'poi'}
        title={panel.title}
        content={panel.content}
        markerId={panel.markerId}
        detail={panel.detail}
        docked={Boolean(panel.docked)}
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

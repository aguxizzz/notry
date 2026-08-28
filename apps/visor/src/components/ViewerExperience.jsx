import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { InfoPanel } from './InfoPanel.jsx';
import { useViewer } from '../hooks/useViewer.js';
import { annotationsToMarkers } from '../annotations.js';
import BlueprintViewer from './BlueprintViewer.jsx';
import StageSwitcher from './StageSwitcher.jsx';
import { Compass } from './Compass.jsx';
import { useCompass } from '../hooks/useCompass.js';

const API_URL = '/api/viewer/current';
const DATA_URL_PARAM = 'data';
const CLICK_BASE_URL = 'https://notry-back.onrender.com/api/v1/public/lots';

function detectOrigin() {
  const params = new URLSearchParams(window.location.search);
  const ref = (params.get('ref') || params.get('utm_source') || '').toLowerCase();
  if (ref) {
    if (ref.includes('whatsapp')) return 'visor_whatsapp';
    if (ref.includes('youtube'))  return 'visor_youtube';
    if (ref.includes('tiktok'))   return 'visor_tiktok';
    if (ref.includes('facebook') || ref.includes('fb')) return 'visor_facebook';
    if (ref.includes('google'))   return 'visor_google';
  }
  const referrer = document.referrer.toLowerCase();
  if (!referrer) return 'visor_direct';
  if (referrer.includes('whatsapp')) return 'visor_whatsapp';
  if (referrer.includes('youtube'))  return 'visor_youtube';
  if (referrer.includes('tiktok'))   return 'visor_tiktok';
  if (referrer.includes('facebook')) return 'visor_facebook';
  if (referrer.includes('google'))   return 'visor_google';
  return 'visor_direct';
}

const VISIT_ORIGIN = detectOrigin();

export function getDataUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get(DATA_URL_PARAM);
  if (!url || typeof url !== 'string') return null;
  return url.trim() || null;
}

export async function fetchViewerData() {
  const queryDataUrl = getDataUrlFromQuery();
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
      grupoId: data.grupo_id ?? null,
      entryStageId: data.entry_stage_id ?? data.stages[0]?.id ?? null,
      stages: data.stages,
      project: data.project ?? null,
      loteoLogoUrl: data.loteo_logo_url ?? null,
      whatsappPhone: data.whatsapp_phone ?? null,
      __usingFallback: data.__usingFallback,
    };
  }
  return {
    grupoId: null,
    entryStageId: 'single',
    stages: [{ id: 'single', name: '', tipo: null, orden: 0, visor: data }],
    project: null,
    loteoLogoUrl: null,
    whatsappPhone: data?.whatsapp_phone ?? null,
    __usingFallback: data?.__usingFallback,
  };
}

const PANEL_CLOSED = { isOpen: false, title: '', content: '', markerId: null, detail: {} };

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
export default function ViewerExperience({ preloadedGroup = null, onBackToPresentation = null }) {
  const [group, setGroup] = useState(preloadedGroup);
  const [currentStageId, setCurrentStageId] = useState(preloadedGroup?.entryStageId ?? null);
  const [committedStageId, setCommittedStageId] = useState(null);
  const [loading, setLoading] = useState(!preloadedGroup);
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [stageError, setStageError] = useState(null);
  const [stagePending, setStagePending] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);
  const [panel, setPanel] = useState(PANEL_CLOSED);
  const [viewMode, setViewMode] = useState('panorama');
  const [recommendedIds, setRecommendedIds] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get('recommended');
    return raw ? new Set(raw.split(',').filter(Boolean)) : new Set();
  });
  const [focusMode, setFocusMode] = useState(false);
  const autoEnabledFocusRef = useRef(false);

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

  useEffect(() => {
    if (preloadedGroup) return; // Datos ya provistos por <Presentation>.
    setLoading(true);
    setLoadError(null);
    fetchViewerData()
      .then((data) => {
        if (data) {
          const normalized = normalizeToGroup(data);
          setGroup(normalized);
          setCurrentStageId(normalized.entryStageId);
        }
      })
      .catch((err) => setLoadError(err.message || 'No se pudo cargar el visor.'))
      .finally(() => setLoading(false));
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

  // Mapa id→nombre de etapa para resolver el destino de un POI de navegación.
  const stageNameById = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s.name])),
    [stages]
  );

  const goToStage = useCallback((stageId) => {
    if (!stageId || !stages.some((stage) => stage.id === stageId)) return;
    setStageError(null);
    setStagePending(true);
    setCurrentStageId(stageId);
    setPanel(PANEL_CLOSED);
    setViewMode('panorama');
  }, [stages]);

  const handleStageReady = useCallback((stageId) => {
    setCommittedStageId(stageId);
    setStagePending(false);
    setStageError(null);
  }, []);

  const handleStageError = useCallback(({ stageId, message }) => {
    setStageError({ stageId, message });
    setStagePending(false);
    // El selector vuelve a la última etapa confirmada. La etapa fallida queda
    // guardada en stageError para poder reintentarla explícitamente.
    setCurrentStageId((selectedId) => selectedId === stageId ? (committedStageId ?? selectedId) : selectedId);
  }, [committedStageId]);

  const retryStage = useCallback(() => {
    if (!stageError?.stageId) return;
    setStageError(null);
    setStagePending(true);
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

  // URLs de panorama de todas las etapas para precargarlas en la cache del visor
  // y que el primer cambio a cada una sea instantáneo.
  const preloadUrls = useMemo(
    () => stages.map((s) => s.visor?.panoramaUrl).filter(Boolean),
    [stages]
  );

  const homePosition = useMemo(
    () => rawData?.homeYaw != null ? { yaw: rawData.homeYaw, pitch: rawData.homePitch ?? 0 } : null,
    [rawData]
  );
  const northOffset = rawData?.northOffset ?? null;
  const markers = useMemo(
    () => annotationsToMarkers(annotations, rawData?.snapThreshold, recommendedIds, focusMode),
    [annotations, rawData?.snapThreshold, recommendedIds, focusMode]
  );
  const viewerData = useMemo(
    () => viewMode === 'blueprint' || !rawData
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
    // Ignore synthetic markers (border polylines and icon overlays)
    if (marker.id.includes('__border__') || marker.id.includes('__icon')) return;

    const ann = annotationsById[marker.id];

    if (ann?.type === 'text') {
      markersPlugin.hideMarkerPanel?.();
      return;
    }

    if (ann?.type === 'poi') {
      postLoteClick(marker.id);
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
          target_loteo_id: ann.target_loteo_id ?? null,
          target_stage_name: ann.target_loteo_id ? (stageNameById[ann.target_loteo_id] ?? null) : null,
        },
      });
      return;
    }

    postLoteClick(marker.id);

    const title = ann?.tooltip ?? marker.id;
    const content = ann?.content ?? '';

    setPanel({
      isOpen: true,
      title,
      content,
      markerId: marker.id,
      detail: { price: ann?.price, area_m2: ann?.area_m2, estado: ann?.status ?? ann?.estado, comments: ann?.comments ?? null },
    });
  }, [annotationsById, stageNameById]);

  const handleBlueprintSelect = useCallback((ann) => {
    const id = ann.uuid || ann.id;
    postLoteClick(id);

    if (ann.type === 'poi') {
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
          target_loteo_id: ann.target_loteo_id ?? null,
          target_stage_name: ann.target_loteo_id ? (stageNameById[ann.target_loteo_id] ?? null) : null,
        },
      });
      return;
    }

    setPanel({
      isOpen: true,
      title: ann.tooltip ?? id,
      content: ann.content ?? '',
      markerId: id,
      detail: { price: ann.price, area_m2: ann.area_m2, estado: ann.status ?? ann.estado, comments: ann.comments ?? null },
    });
  }, [stageNameById]);

  const handleMarkerUnselect = useCallback(() => {
    setPanel(PANEL_CLOSED);
  }, []);

  const { yaw: compassYaw, onPositionChange } = useCompass();
  const viewerRef = useViewer(
    viewerData,
    handleMarkerSelect,
    handleMarkerUnselect,
    preloadUrls,
    homePosition,
    onPositionChange,
    handleStageReady,
    handleStageError,
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
    return <div style={{ width: '100%', height: '100vh', background: '#1a1a1a' }} />;
  }

  return (
    <>
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

      {blueprintUrl && (
        <button
          className="view-toggle"
          style={viewMode === 'blueprint' ? { background: 'var(--accent)', color: '#1a1a1a', border: 'none' } : {}}
          onClick={() => setViewMode(v => v === 'panorama' ? 'blueprint' : 'panorama')}
          aria-label={viewMode === 'blueprint' ? 'Cambiar a vista panorama' : 'Cambiar a vista blueprint'}
          title={viewMode === 'blueprint' ? 'Ver panorama' : 'Ver blueprint'}
        >
          {viewMode === 'blueprint' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          )}
        </button>
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
        />
      ) : (
        <div id="viewer-container" ref={viewerRef} />
      )}

      {stages.length > 1 && (
        <StageSwitcher
          stages={stages}
          currentStageId={committedStageId}
          onSelect={goToStage}
          disabled={stagePending || currentStage?.id !== committedStageId}
        />
      )}

      {(stagePending || currentStage?.id !== committedStageId) && !stageError && (
        <div
          className={`stage-transition-status${recommendedIds.size > 0 ? ' stage-transition-status--above-filter' : ''}`}
          role="status"
          aria-live="polite"
        >
          Cargando etapa…
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
        origin={VISIT_ORIGIN}
        whatsappPhone={group?.whatsappPhone}
        onClose={() => setPanel(PANEL_CLOSED)}
        onGoToStage={goToStage}
      />
    </>
  );
}

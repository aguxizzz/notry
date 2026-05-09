import { useState, useEffect, useCallback, useMemo } from 'react';
import { InfoPanel } from './components/InfoPanel.jsx';
import { useViewer } from './hooks/useViewer.js';
import { annotationsToMarkers } from './annotations.js';
import BlueprintViewer from './components/BlueprintViewer.jsx';

const API_URL = '/api/viewer/current';
const FALLBACK_DATA_URL = '/data/viewer.json';
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

function getDataUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get(DATA_URL_PARAM);
  if (!url || typeof url !== 'string') return null;
  return url.trim() || null;
}

async function fetchViewerData() {
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
    // Backend no disponible o tardó demasiado: usar datos locales
  }
  const res = await fetch(FALLBACK_DATA_URL);
  if (!res.ok) throw new Error('No se pudo cargar el panorama ni los datos de prueba.');
  const data = await res.json();
  data.__usingFallback = true;
  return data;
}

function postLoteClick(id) {
  fetch(`${CLICK_BASE_URL}/${id}/click`, { method: 'POST' })
    .catch((err) => console.warn('POST lote click:', err));
}

const PANEL_CLOSED = { isOpen: false, title: '', content: '', markerId: null, detail: {} };

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [error, setError] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [panel, setPanel] = useState(PANEL_CLOSED);
  const [viewMode, setViewMode] = useState('panorama');
  const blueprintUrl = rawData?.blueprintUrl || null;

  useEffect(() => {
    fetchViewerData()
      .then((data) => {
        if (data.__usingFallback) setUsingFallback(true);
        setRawData(data);
      })
      .catch((err) => setError(err.message));
  }, []);

  const annotations = rawData?.annotations ?? [];

  const annotationsById = useMemo(
    () => Object.fromEntries(annotations.map((a) => [a.uuid ?? a.id, a])),
    [annotations]
  );

  const blueprintAnnotations = useMemo(
    () => annotations.filter(a => (a.type === 'polygon' || a.type === 'poi') && a.blueprint_coordinates?.length >= 3),
    [annotations]
  );

  const markers = useMemo(() => annotationsToMarkers(annotations, rawData?.snapThreshold), [annotations, rawData?.snapThreshold]);
  const viewerData = useMemo(
    () => viewMode === 'blueprint' || !rawData
      ? null
      : { panoramaUrl: rawData.panoramaUrl, markers, annotations },
    [viewMode, rawData, markers, annotations]
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
  }, [annotationsById]);

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
  }, []);

  const handleMarkerUnselect = useCallback(() => {
    setPanel(PANEL_CLOSED);
  }, []);

  const viewerRef = useViewer(viewerData, handleMarkerSelect, handleMarkerUnselect);

  if (error) {
    return (
      <p style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        Error: {error}. Puedes usar <code>?data=URL</code> para cargar un JSON desde una URL, o
        asegúrate de tener <code>public/data/viewer.json</code> y una imagen de panorama válida.
      </p>
    );
  }

  if (!rawData) {
    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #444', borderTopColor: '#c5a059', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <>
      {blueprintUrl && (
        <button
          className="view-toggle"
          style={{ background: viewMode === 'blueprint' ? 'var(--accent)' : '#333' }}
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
        />
      ) : (
        <div id="viewer-container" ref={viewerRef} />
      )}

      {usingFallback && (
        <div className="fallback-banner">
          Modo offline · datos locales
        </div>
      )}
      <InfoPanel
        isOpen={panel.isOpen}
        title={panel.title}
        content={panel.content}
        markerId={panel.markerId}
        detail={panel.detail}
        origin={VISIT_ORIGIN}
        onClose={() => setPanel(PANEL_CLOSED)}
      />
    </>
  );
}

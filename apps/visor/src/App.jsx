import { useState, useEffect, useCallback, useMemo } from 'react';
import { InfoPanel } from './components/InfoPanel.jsx';
import { useViewer } from './hooks/useViewer.js';
import { annotationsToMarkers } from './annotations.js';

const API_URL = '/api/viewer/current';
const FALLBACK_DATA_URL = '/data/viewer.json';
const DATA_URL_PARAM = 'data';
const CLICK_BASE_URL = 'https://notry-back.onrender.com/api/v1/public/lots';

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

  const markers = useMemo(() => annotationsToMarkers(annotations), [annotations]);
  const viewerData = useMemo(
    () => rawData ? { panoramaUrl: rawData.panoramaUrl, markers, annotations } : null,
    [rawData, markers, annotations]
  );

  const handleMarkerSelect = useCallback((marker, markersPlugin) => {
    const ann = annotationsById[marker.id];

    if (ann?.type === 'text') {
      markersPlugin.hideMarkerPanel?.();
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
      detail: { price: ann?.price, area_m2: ann?.area_m2, estado: ann?.status ?? ann?.estado },
    });
  }, [annotationsById]);

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
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <>
      <div id="viewer-container" ref={viewerRef} />
      {usingFallback && (
        <div style={{
          position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: '#333', color: '#aaa', fontSize: '0.75rem',
          padding: '6px 14px', borderRadius: 20, zIndex: 9999,
          pointerEvents: 'none'
        }}>
          Modo offline · datos locales
        </div>
      )}
      <InfoPanel
        isOpen={panel.isOpen}
        title={panel.title}
        content={panel.content}
        markerId={panel.markerId}
        detail={panel.detail}
        onClose={() => setPanel(PANEL_CLOSED)}
      />
    </>
  );
}

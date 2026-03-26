import { useState, useEffect, useCallback, useMemo } from 'react';
import { InfoPanel } from './components/InfoPanel.jsx';
import { useViewer } from './hooks/useViewer.js';
import { annotationsToMarkers } from './annotations.js';

const API_URL = '/api/viewer/current';
const FALLBACK_DATA_URL = '/data/viewer.json';
const DATA_URL_PARAM = 'data';
const CLICK_TRACKING_URL = 'https://ejemplo.com/api/lote/click';

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
    const res = await fetch(API_URL);
    if (res.ok) return await res.json();
  } catch (_) {
    // Backend no disponible: usar datos locales
  }
  const res = await fetch(FALLBACK_DATA_URL);
  if (!res.ok) throw new Error('No se pudo cargar el panorama ni los datos de prueba.');
  return await res.json();
}

function postLoteId(url, id) {
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  }).catch((err) => console.warn('POST lote:', err));
}

const PANEL_CLOSED = { isOpen: false, title: '', content: '', markerId: null, detail: {} };

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [error, setError] = useState(null);
  const [panel, setPanel] = useState(PANEL_CLOSED);

  useEffect(() => {
    fetchViewerData()
      .then((data) => setRawData(data))
      .catch((err) => setError(err.message));
  }, []);

  const annotations = rawData?.annotations ?? [];

  const annotationsById = useMemo(
    () => Object.fromEntries(annotations.map((a) => [a.id, a])),
    [annotations]
  );

  const markers = annotationsToMarkers(annotations);
  const viewerData = rawData
    ? { panoramaUrl: rawData.panoramaUrl, markers, annotations }
    : null;

  const handleMarkerSelect = useCallback((marker, markersPlugin) => {
    const ann = annotationsById[marker.id];

    if (ann?.type === 'text') {
      markersPlugin.hideMarkerPanel?.();
      return;
    }

    postLoteId(CLICK_TRACKING_URL, marker.id);

    const title = ann?.tooltip ?? marker.id;
    const content = ann?.content ?? '';

    setPanel({
      isOpen: true,
      title,
      content,
      markerId: marker.id,
      detail: { precio: ann?.precio, area: ann?.area, estado: ann?.estado },
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

  return (
    <>
      <div id="viewer-container" ref={viewerRef} />
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

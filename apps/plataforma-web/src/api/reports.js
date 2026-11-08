import { API_BASE } from '../config';

export function buildAnalisisCallbacks({ apiFetch, setClicksCache, setVisorDataCache, setClicksLoadingIds, setVisorDataLoadingIds, setAnalyticsCache, setAnalyticsLoadingIds }) {
  const handleAnalisisRequestClicks = (loteoId, signal) => {
    setClicksLoadingIds(prev => new Set([...prev, loteoId]));
    apiFetch(`${API_BASE}/loteos/${loteoId}/clicks`, { signal })
      .then(data => {
        if (!Array.isArray(data)) return;
        setClicksCache(prev => ({
          ...prev,
          [loteoId]: [...data].sort((a, b) => b.clicks - a.clicks),
        }));
      })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); })
      .finally(() => {
        setClicksLoadingIds(prev => {
          const next = new Set(prev);
          next.delete(loteoId);
          return next;
        });
      });
  };

  const handleAnalisisRequestVisorData = (loteoId, signal) => {
    setVisorDataLoadingIds(prev => new Set([...prev, loteoId]));
    apiFetch(`${API_BASE}/loteos/${loteoId}/visor_data`, { signal })
      .then(data => {
        if (data.blueprintUrl || data.annotations) {
          setVisorDataCache(prev => ({ ...prev, [loteoId]: data }));
        }
      })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); })
      .finally(() => {
        setVisorDataLoadingIds(prev => {
          const next = new Set(prev);
          next.delete(loteoId);
          return next;
        });
      });
  };

  // Analítica del visor agregada por día (/analytics): una sola respuesta por
  // loteo de la que la vista deriva cualquier período y canal en memoria.
  const handleAnalisisRequestAnalytics = (loteoId, signal) => {
    setAnalyticsLoadingIds(prev => new Set([...prev, loteoId]));
    apiFetch(`${API_BASE}/loteos/${loteoId}/analytics`, { signal })
      .then(data => {
        if (data?.days) setAnalyticsCache(prev => ({ ...prev, [loteoId]: data }));
      })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); })
      .finally(() => {
        setAnalyticsLoadingIds(prev => {
          const next = new Set(prev);
          next.delete(loteoId);
          return next;
        });
      });
  };

  return { handleAnalisisRequestClicks, handleAnalisisRequestVisorData, handleAnalisisRequestAnalytics };
}

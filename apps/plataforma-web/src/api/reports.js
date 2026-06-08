import { API_BASE } from '../config';

export async function fetchReportsBg({ apiFetch, token, setReportsCache, days }) {
  if (!token) return;
  try {
    const [genData, finData] = await Promise.all([
      apiFetch(`${API_BASE}/reports/general?last_days=${days}`),
      apiFetch(`${API_BASE}/reports/finances?last_days=${days}`),
    ]);

    setReportsCache(prev => ({
      ...prev,
      [days]: {
        prospectos: genData.prospectos_en_periodo ?? 0,
        ventas: finData.ventas_en_periodo ?? 0,
        lotesVendidos: finData.cantidad_vendidos_en_periodo ?? 0,
      },
    }));
  } catch (error) {
    if (error.name !== 'AbortError') console.error(error);
  }
}

export function buildAnalisisCallbacks({ apiFetch, setClicksCache, setVisorDataCache, setClicksLoadingIds, setVisorDataLoadingIds }) {
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

  return { handleAnalisisRequestClicks, handleAnalisisRequestVisorData };
}

import { API_BASE } from '../config';

export function buildAnalisisCallbacks({ apiFetch, setClicksCache, setVisorDataCache, setClicksLoadingIds, setVisorDataLoadingIds, setFunnelCache, setFunnelLoadingIds, setEngagementCache, setEngagementLoadingIds }) {
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

  const handleAnalisisRequestFunnel = (loteoId, lastDays, channel, signal) => {
    const cacheKey = `${loteoId}:${lastDays}:${channel ?? 'all'}`;
    setFunnelLoadingIds(prev => new Set([...prev, cacheKey]));
    const channelQs = channel ? `&channel=${encodeURIComponent(channel)}` : '';
    apiFetch(`${API_BASE}/loteos/${loteoId}/funnel?last_days=${lastDays}${channelQs}`, { signal })
      .then(data => {
        setFunnelCache(prev => ({ ...prev, [cacheKey]: data }));
      })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); })
      .finally(() => {
        setFunnelLoadingIds(prev => {
          const next = new Set(prev);
          next.delete(cacheKey);
          return next;
        });
      });
  };

  const handleAnalisisRequestEngagement = (loteoId, lastDays, signal) => {
    const cacheKey = `${loteoId}:${lastDays}`;
    setEngagementLoadingIds(prev => new Set([...prev, cacheKey]));
    apiFetch(`${API_BASE}/loteos/${loteoId}/engagement?last_days=${lastDays}`, { signal })
      .then(data => {
        setEngagementCache(prev => ({ ...prev, [cacheKey]: data }));
      })
      .catch(err => { if (err.name !== 'AbortError') console.error(err); })
      .finally(() => {
        setEngagementLoadingIds(prev => {
          const next = new Set(prev);
          next.delete(cacheKey);
          return next;
        });
      });
  };

  return { handleAnalisisRequestClicks, handleAnalisisRequestVisorData, handleAnalisisRequestFunnel, handleAnalisisRequestEngagement };
}

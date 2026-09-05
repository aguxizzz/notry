import { useState, useCallback, useRef } from 'react';
import { API_BASE } from '../config';
import { logActivity } from '../api/activityLogs';

export function usePatchProspect({ onError, apiFetch, loteOwnerId, addActivity }) {
  const [patchingIds, setPatchingIds] = useState(new Set());
  // Tracks the latest in-flight request per prospect id, so that if the same
  // prospect is moved again before a previous PATCH resolves, the stale
  // response (which would otherwise reapply an outdated category) is ignored.
  const requestSeqRef = useRef({});

  const patchProspect = useCallback(async (id, category, previousColumns, setColumns, onSuccess, prospectName) => {
    const seq = (requestSeqRef.current[id] || 0) + 1;
    requestSeqRef.current[id] = seq;
    const isStale = () => requestSeqRef.current[id] !== seq;

    setPatchingIds(prev => new Set([...prev, id]));

    try {
      // apiFetch already retries with backoff, sets Authorization/X-Active-Org-Id,
      // and calls logout() on a 401 — no need to duplicate any of that here.
      await apiFetch(`${API_BASE}/prospects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });

      if (isStale()) return; // superseded by a newer move of the same prospect

      // Log activity for category change
      logActivity({
        apiFetch,
        activityType: 'prospect_updated',
        entityType: 'prospect',
        entityId: id,
        loteOwnerId,
        description: `Prospecto "${prospectName || 'Sin nombre'}" actualizado`,
        extraData: { prospect_name: prospectName || 'Sin nombre' },
        name: prospectName || 'Sin nombre',
        addActivity,
      });
      onSuccess?.();
    } catch (err) {
      console.error(err);
      if (!isStale()) {
        setColumns(previousColumns);
        onError?.('No se pudo mover el prospecto');
      }
      throw err;
    } finally {
      if (!isStale()) {
        setPatchingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  }, [apiFetch, onError, loteOwnerId, addActivity]);

  return { patchProspect, patchingIds };
}
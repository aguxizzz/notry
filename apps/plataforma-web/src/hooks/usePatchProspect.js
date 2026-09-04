import { useState, useCallback, useRef } from 'react';
import { API_BASE } from '../config';
import { logActivity } from '../api/activityLogs';

export function usePatchProspect({ token, onSessionExpired, onError, apiFetch, loteOwnerId, addActivity }) {
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
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`${API_BASE}/prospects/${id}`, {
            method: 'PATCH',
            headers: {
              accept: 'application/json',
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ category }),
          });

          if (res.status === 401) {
            onSessionExpired?.();
            throw new Error('401');
          }

          if (res.ok) {
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
            return;
          }

          if (res.status >= 400 && res.status < 500) {
            throw new Error('Error al actualizar prospecto');
          }

          throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          const isLastAttempt = attempt === 3;
          if (isLastAttempt || err.name === 'AbortError') {
            console.error(err);
            if (!isStale()) {
              setColumns(previousColumns);
              onError?.('No se pudo mover el prospecto');
            }
            if (err.message === '401' && onSessionExpired) onSessionExpired();
            throw err;
          }
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        }
      }
    } finally {
      if (!isStale()) {
        setPatchingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  }, [token, onSessionExpired, onError, apiFetch, loteOwnerId, addActivity]);

  return { patchProspect, patchingIds };
}
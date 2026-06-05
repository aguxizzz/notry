import { useRef, useCallback } from 'react';

/**
 * usePendingMutations — protects optimistic edits from being clobbered by a
 * sync that hasn't propagated the change yet.
 *
 * When a row is edited locally (optimistic update), we record the expected
 * field values. While that mutation is "pending", an incoming sync that still
 * carries the old value is ignored for that row (the local optimistic value is
 * kept). As soon as the server echoes the expected values — or a short TTL
 * elapses — the pending entry is cleared and sync data flows through normally.
 *
 * Scoped per entity ('lots' | 'loteos' | 'prospectos') and keyed by id.
 */
const PENDING_TTL = 10000; // 10s safety fallback

export function usePendingMutations() {
  // { [entity]: Map<id, { fields, ts }> }
  const ref = useRef({});

  const markPending = useCallback((entity, id, fields) => {
    if (!ref.current[entity]) ref.current[entity] = new Map();
    ref.current[entity].set(id, { fields, ts: Date.now() });
  }, []);

  /**
   * shouldKeepLocal — true if the local optimistic row should win over the
   * incoming server row (i.e. the server hasn't caught up yet).
   */
  const shouldKeepLocal = useCallback((entity, incomingItem, getId = (x) => x.id) => {
    const map = ref.current[entity];
    if (!map) return false;
    const id = getId(incomingItem);
    const pending = map.get(id);
    if (!pending) return false;

    // Expired — give up and accept whatever the server says.
    if (Date.now() - pending.ts > PENDING_TTL) {
      map.delete(id);
      return false;
    }

    // Server now reflects every expected field → mutation confirmed.
    // Loose equality tolerates number/string formatting differences.
    const confirmed = Object.keys(pending.fields).every(
      (k) => incomingItem[k] == pending.fields[k] // eslint-disable-line eqeqeq
    );
    if (confirmed) {
      map.delete(id);
      return false;
    }

    return true; // keep local optimistic value
  }, []);

  return { markPending, shouldKeepLocal };
}

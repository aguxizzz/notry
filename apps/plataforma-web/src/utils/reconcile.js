/**
 * reconcile — merge incoming list data into existing cache without churning
 * references for items that haven't actually changed.
 *
 * Used by useSync so that a poll returning identical data produces no visual
 * change (no row re-render, no reorder). Mirrors the merge approach the
 * ActivityFeed already uses (see useActivityFeed.handleRawActivities).
 */

/** Shallow-equal two plain objects (one level deep). */
export function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * reconcileById — produce a merged array from `prev` and `incoming`, keyed by id.
 *
 * - Output order follows `incoming` (the server order).
 * - For each incoming item that shallow-equals its previous counterpart, the
 *   previous object reference is reused so React skips re-rendering that row.
 * - Items present in `prev` but absent from `incoming` are dropped (deleted).
 * - If the merged result is element-wise identical to `prev` (same references,
 *   same order, same length), `prev` is returned as-is so no state update fires.
 *
 * @param {Array} prev      current cached list
 * @param {Array} incoming  fresh list from the server
 * @param {Function} getId  id accessor, defaults to `x => x.id`
 * @param {Function} [shouldKeepLocal]  optional `(prevItem, incomingItem) => bool`;
 *   when it returns true the previous (optimistic) item is kept over the incoming
 *   one. Used to protect in-flight edits from a stale sync (see usePendingMutations).
 * @returns {Array} merged list (possibly the same reference as `prev`)
 */
export function reconcileById(prev, incoming, getId = (x) => x.id, shouldKeepLocal) {
  const incomingList = Array.isArray(incoming) ? incoming : [];
  if (!Array.isArray(prev) || prev.length === 0) return incomingList;

  const prevById = new Map(prev.map((item) => [getId(item), item]));

  let identical = incomingList.length === prev.length;
  const merged = incomingList.map((item, index) => {
    const existing = prevById.get(getId(item));
    // Protect a pending optimistic edit: keep the local row until the server
    // catches up.
    if (existing && shouldKeepLocal && shouldKeepLocal(existing, item)) {
      if (prev[index] !== existing) identical = false;
      return existing;
    }
    if (existing && shallowEqual(existing, item)) {
      if (prev[index] !== existing) identical = false;
      return existing; // reuse reference — no re-render
    }
    identical = false;
    return item;
  });

  return identical ? prev : merged;
}

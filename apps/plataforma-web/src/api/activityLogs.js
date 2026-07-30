import { API_BASE } from '../config';

export async function fetchActivityLogs({ apiFetch, setActivityLogs, signal, limit = 20 }) {
  try {
    const data = await apiFetch(`${API_BASE}/activity-logs?limit=${limit}`, { signal });
    setActivityLogs(data?.items ?? []);
  } catch (err) {
    if (err.name !== 'AbortError') console.error('[activityLogs]', err);
  }
}

export async function postActivityLog({ apiFetch, activityType, entityType, entityId, loteOwnerId, description, extraData }) {
  try {
    const body = { activity_type: activityType, entity_type: entityType, entity_id: entityId, lote_owner_id: loteOwnerId };
    if (description) body.description = description;
    if (extraData) body.extra_data = extraData;
    await apiFetch(`${API_BASE}/activity-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.name !== 'AbortError') console.error('[postActivityLog]', err);
  }
}

/**
 * logActivity — persist an activity log AND optimistically push it to the
 * in-memory feed so it shows instantly. Replaces the duplicated
 * `postActivityLog(...) + addActivity({...})` block scattered across the
 * lots/loteos/prospects services.
 *
 * The optimistic entry uses the same `activityType` and `description` as the
 * real (synced) item so useActivityFeed dedupes them by signature
 * (`type|description`) — keeping `type` aligned avoids duplicate feed entries.
 *
 * No-ops when `loteOwnerId` is missing (owner context required).
 */
export function logActivity({ apiFetch, activityType, entityType, entityId, loteOwnerId, description, extraData, name, addActivity }) {
  if (!loteOwnerId) return;
  postActivityLog({ apiFetch, activityType, entityType, entityId, loteOwnerId, description, extraData });
  addActivity?.({
    type: activityType,
    name: name ?? extraData?.prospect_name ?? 'Sin nombre',
    description,
  });
}

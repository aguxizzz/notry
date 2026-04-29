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

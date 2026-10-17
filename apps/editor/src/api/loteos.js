import { API_BASE } from './config';
import { apiRequest } from './client';

// URL que el editor recibe en ?data= para abrir un loteo (ver App.jsx).
export const visorDataUrl = loteoId => `${API_BASE}/loteos/${loteoId}/visor_data`;

// Público (sin token): es el mismo endpoint que consume el visor.
export const fetchVisorData = url => apiRequest(url);

export const getLoteo = (token, loteoId) => apiRequest(`/loteos/${loteoId}`, { token });

export const listLoteos = (token, { limit, orgId } = {}) =>
  apiRequest(`/loteos${limit ? `?limit=${limit}` : ''}`, { token, orgId });

export const patchLoteo = (token, loteoId, patch) =>
  apiRequest(`/loteos/${loteoId}`, { method: 'PATCH', token, body: patch });

export const bulkSaveLoteo = (token, loteoId, payload) =>
  apiRequest(`/loteos/${loteoId}/bulk-save`, { method: 'POST', token, body: payload });

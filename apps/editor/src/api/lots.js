import { apiRequest } from './client';

export const createLot = (token, lot) => apiRequest('/lots', { method: 'POST', token, body: lot });

export const deleteLot = (token, lotId) => apiRequest(`/lots/${lotId}`, { method: 'DELETE', token });

// Drafts: plano polygons with no lot data yet (auto-detected). They live in their own
// table on the back; POST /lots with `draft_id` turns one into a lot and deletes it.
export const listLotDrafts = (token, loteoId) => apiRequest(`/loteos/${loteoId}/drafts`, { token });

export const createLotDrafts = (token, loteoId, drafts) => apiRequest(
  `/loteos/${loteoId}/drafts`, { method: 'POST', token, body: { drafts } },
);

export const deleteLotDraft = (token, loteoId, draftId) => apiRequest(
  `/loteos/${loteoId}/drafts/${draftId}`, { method: 'DELETE', token },
);

// `space`: 'blueprint' (plano) o 'panorama' — son endpoints distintos.
export const assignLotCoordinates = (token, { uuid, polygonPoints, space }) => apiRequest(
  `/lots/${space === 'blueprint' ? 'update-blueprint-coordinates' : 'update-coordinates'}`,
  { method: 'POST', token, body: { uuid, polygonPoints } },
);

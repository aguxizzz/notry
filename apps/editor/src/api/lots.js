import { apiRequest } from './client';

export const createLot = (token, lot) => apiRequest('/lots', { method: 'POST', token, body: lot });

export const deleteLot = (token, lotId) => apiRequest(`/lots/${lotId}`, { method: 'DELETE', token });

// `space`: 'blueprint' (plano) o 'panorama' — son endpoints distintos.
export const assignLotCoordinates = (token, { uuid, polygonPoints, space }) => apiRequest(
  `/lots/${space === 'blueprint' ? 'update-blueprint-coordinates' : 'update-coordinates'}`,
  { method: 'POST', token, body: { uuid, polygonPoints } },
);

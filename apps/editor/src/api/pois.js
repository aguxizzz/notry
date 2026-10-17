import { apiRequest } from './client';

export const deletePoi = (token, poiId) => apiRequest(`/pois/${poiId}`, { method: 'DELETE', token });

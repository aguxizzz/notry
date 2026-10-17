import { apiRequest } from './client';

export const login = ({ email, password }) =>
  apiRequest('/auth/login', { method: 'POST', body: { email, password } });

export const getMe = token => apiRequest('/auth/me', { token });

export const listOrganizations = token => apiRequest('/organizations', { token });

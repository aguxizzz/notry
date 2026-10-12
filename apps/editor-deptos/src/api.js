export const API_BASE = import.meta.env.VITE_API_BASE || 'https://notry-back.vercel.app/api/v1';

const TOKEN_KEY = 'notry_deptos_token';
const ORG_KEY = 'notry_deptos_org';

// Sesión fuera de React: las funciones de servicio son planas y no reciben props.
const session = { token: null, orgId: null, onUnauthorized: () => {} };

export function loadSession() {
  try {
    session.token = localStorage.getItem(TOKEN_KEY);
    session.orgId = localStorage.getItem(ORG_KEY);
  } catch {
    /* sin storage */
  }
  return session;
}

export function setToken(token) {
  session.token = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin storage */
  }
}

// Solo lo usa super_admin (el backend ignora el header para el resto).
export function setOrgId(orgId) {
  session.orgId = orgId || null;
  try {
    if (orgId) localStorage.setItem(ORG_KEY, orgId);
    else localStorage.removeItem(ORG_KEY);
  } catch {
    /* sin storage */
  }
}

export function onUnauthorized(fn) {
  session.onUnauthorized = fn;
}

function headers(extra) {
  return {
    ...extra,
    Authorization: `Bearer ${session.token}`,
    ...(session.orgId ? { 'X-Active-Org-Id': session.orgId } : {}),
  };
}

async function request(path, { method = 'GET', body, form } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: headers(body ? { 'Content-Type': 'application/json' } : undefined),
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  if (res.status === 401) {
    session.onUnauthorized();
    throw new Error('Sesión vencida');
  }
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') detail = data.detail;
      else if (Array.isArray(data.detail)) detail = data.detail.map((d) => d.msg).join(', ');
    } catch {
      /* cuerpo no JSON */
    }
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Credenciales inválidas');
  return (await res.json()).access_token;
}

export const me = () => request('/auth/me');
export const listOrganizations = () => request('/organizations');

export const listBuildings = () => request('/buildings');
export const createBuilding = (data) => request('/buildings', { method: 'POST', body: data });
export const getBuilding = (id) => request(`/buildings/${id}`);
export const updateBuilding = (id, data) => request(`/buildings/${id}`, { method: 'PATCH', body: data });
export const deleteBuilding = (id) => request(`/buildings/${id}`, { method: 'DELETE' });

export const createFloor = (buildingId, data) =>
  request(`/buildings/${buildingId}/floors`, { method: 'POST', body: data });
export const updateFloor = (id, data) => request(`/buildings/floors/${id}`, { method: 'PATCH', body: data });
export const deleteFloor = (id) => request(`/buildings/floors/${id}`, { method: 'DELETE' });

export const createUnit = (floorId, data) =>
  request(`/buildings/floors/${floorId}/units`, { method: 'POST', body: data });
export const updateUnit = (id, data) => request(`/buildings/units/${id}`, { method: 'PATCH', body: data });
export const deleteUnit = (id) => request(`/buildings/units/${id}`, { method: 'DELETE' });

// purpose: facade | plans | source-plans | units
export function uploadImage(buildingId, file, purpose) {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', purpose);
  return request(`/buildings/${buildingId}/images`, { method: 'POST', form });
}

// Small notry-back client for the MCP server: logs in with the account in the env,
// keeps the token in memory and logs in again once if it expires.

const API_BASE = (process.env.NOTRY_API_BASE || 'http://localhost:8000/api/v1').replace(/\/$/, '');
const EMAIL = process.env.NOTRY_EMAIL;
const PASSWORD = process.env.NOTRY_PASSWORD;
// Only for super_admin accounts: which org to act as (same header the apps send).
const ORG_ID = process.env.NOTRY_ORG_ID;

let token = null;

async function login() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Faltan NOTRY_EMAIL y NOTRY_PASSWORD en el entorno del MCP');
  }
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login falló (${res.status}): ${await res.text()}`);
  token = (await res.json()).access_token;
}

/**
 * JSON request against the API. Throws an Error with the back's `detail` so the tool
 * result tells the model what went wrong (a 422 says which field, for example).
 */
export async function api(path, { method = 'GET', body } = {}, retried = false) {
  if (!token) await login();
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (ORG_ID) headers['X-Active-Org-Id'] = ORG_ID;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Expired token: one fresh login and retry, never a loop.
  if (res.status === 401 && !retried) {
    token = null;
    return api(path, { method, body }, true);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail ?? data);
    const error = new Error(`${method} ${path} → ${res.status}: ${detail}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

/** Walks a paginated list endpoint ({ items, total }) until it has every item. */
export async function listAll(path, pageSize = 100) {
  const items = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let offset = 0; ; offset += pageSize) {
    const page = await api(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) return items;
  }
}

export const apiBase = API_BASE;

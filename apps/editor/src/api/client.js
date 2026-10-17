import { API_BASE, authHeaders, fetchWithTimeout } from './config';

// Error único para cualquier falla de la API: HTTP (status + detail del
// backend), timeout o red. El 401 NO se maneja acá a propósito — cada caller
// decide (useSaveAll muestra "sesión vencida" sin desloguear para no perder
// trabajo; el resto desloguea con onAuthError).
export class ApiError extends Error {
  constructor(message, { status = null, detail = null, timeout = false, network = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.timeout = timeout;
    this.network = network;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

// Texto para mostrarle al usuario: el detail del backend, o el mensaje de
// timeout/red; un error HTTP sin detail ("HTTP 500") no le dice nada, así
// que ahí se usa `fallback`.
export function errorMessage(error, fallback) {
  if (error instanceof ApiError && error.status && !error.detail) return fallback;
  return error?.message || fallback;
}

// FastAPI manda `detail` como string (HTTPException) o como lista de errores
// de validación (422) — se normaliza a un string legible.
function detailToMessage(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(item => item?.msg).filter(Boolean);
    return messages.length ? messages.join('; ') : null;
  }
  return null;
}

/**
 * fetch a la API con timeout, auth y parseo de errores.
 *
 * @param {string} path — relativo a API_BASE (`/loteos/1`) o URL absoluta.
 * @param {object} options
 * @param {string} [options.method='GET']
 * @param {string} [options.token] — sin token no se mandan headers de auth.
 * @param {string|null} [options.orgId] — pisa la org activa ambiental.
 * @param {*} [options.body] — se serializa como JSON.
 * @param {number} [options.timeoutMs=30000]
 * @returns {Promise<any>} JSON de la respuesta, o null si viene vacía.
 * @throws {ApiError}
 */
export async function apiRequest(path, { method = 'GET', token, orgId, body, timeoutMs = 30000 } = {}) {
  const url = /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
  const extraHeaders = body !== undefined ? { 'Content-Type': 'application/json' } : {};
  const headers = token
    ? (orgId === undefined ? authHeaders(token, extraHeaders) : authHeaders(token, extraHeaders, orgId))
    : extraHeaders;

  let res;
  try {
    res = await fetchWithTimeout(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }, timeoutMs);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('El servidor tardó demasiado en responder.', { timeout: true });
    }
    throw new ApiError('Error de conexión.', { network: true });
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    const detail = detailToMessage(errorBody?.detail);
    throw new ApiError(detail ?? `HTTP ${res.status}`, { status: res.status, detail });
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

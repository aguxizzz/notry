import { API_BASE } from '../config';

/**
 * Creates an apiFetch function bound to the current token and logout handler.
 *
 * @param {string} token - Current auth token
 * @param {Function} logout - No-argument logout function (called on 401)
 * @returns {Function} Bound apiFetch(url, opts)
 */
export function createApiFetch(token, logout) {
  return async function apiFetch(url, opts = {}) {
    const { retries = 3, retryDelay = 500, ...fetchOpts } = opts;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          ...fetchOpts,
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...fetchOpts.headers,
          },
        });

        if (res.status === 401) {
          logout();
          throw new Error('Sesión expirada. Inicia sesión nuevamente.');
        }

        if (res.ok) {
          const body = await res.text();
          return body ? JSON.parse(body) : null;
        }

        if (res.status >= 400 && res.status < 500) {
          const raw = await res.text();
          let detail = raw;
          try { detail = JSON.parse(raw).detail; } catch {}
          throw new Error(detail || `HTTP ${res.status}`);
        }

        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        const isAbort = err.name === 'AbortError';
        const isLastAttempt = attempt === retries;

        if (isAbort || isLastAttempt) throw err;

        await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt - 1)));
      }
    }
  };
}

/**
 * Fetch an image as a CORS request. If the browser served it from a cache entry
 * stored by a previous non-CORS load (<img> without crossOrigin), that response
 * has no CORS headers and the fetch rejects — only a real network transfer works,
 * so retry bypassing the cache.
 */
export async function fetchImage(url, init = {}) {
  const opts = { mode: 'cors', credentials: 'omit', ...init };
  try {
    const res = await fetch(url, opts);
    if (res.ok) return res;
  } catch {
    // fall through to the cache-bypassing retry
  }
  return fetch(url, { ...opts, cache: 'reload' });
}

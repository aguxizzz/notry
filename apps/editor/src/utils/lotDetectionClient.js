/**
 * Browser side of auto-detect: downloads the plano, hands it to lotDetection.worker.js
 * and caches what comes back, so the app never runs the pixel work on the main thread.
 * Moving a slider only re-runs the masks step; clicking a lot reuses the cached masks.
 */

import { fetchImage } from './fetchImage';
import { detectLotAt } from './lotDetection';

let worker = null;
let nextId = 1;
const pending = new Map(); // message id → { resolve, reject }

/** Starts the worker on first use and sends one message; resolves with its reply. */
function callWorker(message) {
  if (!worker) {
    worker = new Worker(new URL('./lotDetection.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const { id, result, error } = event.data;
      const call = pending.get(id);
      if (!call) return;
      pending.delete(id);
      if (error) call.reject(new Error(error));
      else call.resolve(result);
    };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...message });
  });
}

// Only the last plano and the last param combo are kept: the tool works on one at a time.
let loadCache = { url: null, promise: null };
let maskCache = { key: null, promise: null };

/** Downloads the plano here (fetchImage handles the CORS cache quirk) and loads it into the worker. */
function loadPlano(url) {
  if (loadCache.url === url) return loadCache.promise;
  const promise = (async () => {
    const response = await fetchImage(url, { headers: { Accept: 'image/*' } });
    if (!response.ok) throw new Error(`No se pudo descargar el plano (${response.status}).`);
    return callWorker({ type: 'load', url, blob: await response.blob() });
  })();
  loadCache = { url, promise };
  // A failed download shouldn't stay cached forever.
  promise.catch(() => { if (loadCache.promise === promise) loadCache = { url: null, promise: null }; });
  return promise;
}

/**
 * Line/text masks of the plano (+ the overlay to draw) for the given params, cached.
 * The promise itself is cached, so a click while the preview is still computing
 * waits for that same run instead of starting another one.
 * maxTextDim is in pixels of the ORIGINAL image (converted inside the worker).
 */
function getDetectionMasks(url, { threshold = 128, maxTextDim = 20 } = {}) {
  const key = `${url}|${threshold}|${maxTextDim}`;
  if (maskCache.key === key) return maskCache.promise;
  const promise = loadPlano(url).then(() => callWorker({ type: 'masks', url, threshold, maxTextDim }));
  maskCache = { key, promise };
  promise.catch(() => { if (maskCache.promise === promise) maskCache = { key: null, promise: null }; });
  return promise;
}

/** Click → lot outline in normalized coords. The flood fill is one region, cheap enough for the main thread. */
export async function detectLotPolygon(url, nx, ny, params = {}) {
  try {
    const masks = await getDetectionMasks(url, params);
    return detectLotAt(masks, nx, ny, params.epsilon ?? 2.0);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Overlay for BlueprintEditor, as an ImageBitmap (shared with the cache, so never close() it). */
export async function getDetectionOverlay(url, params = {}) {
  const { overlay } = await getDetectionMasks(url, params);
  return overlay;
}

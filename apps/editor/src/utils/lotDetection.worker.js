// Web Worker for auto-detect: runs the heavy pixel work of lotDetection.js off the
// main thread, so the editor (and its "Procesando…" cover) keeps painting meanwhile.
// lotDetection.js talks to it through { id, type, ... } messages and gets { id, result | error } back.
import { toGrayMinPooled, binarize, removeText, buildOverlay } from './lotDetection';

// Grayscale of the last plano loaded, reused for every slider change on it.
let current = { url: null, gray: null, w: 0, h: 0, scale: 1 };

/** Decodes the plano's blob and keeps its downscaled grayscale. */
async function load({ url, blob }) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  current = { url, ...toGrayMinPooled(data, canvas.width, canvas.height) };
  return { w: current.w, h: current.h };
}

/**
 * Line/text masks + the colored overlay for one param combo.
 * The overlay goes back as an ImageBitmap (already decoded, GPU-ready): drawing it is cheap,
 * while putImageData of the raw pixels on the main thread was part of the freeze.
 */
async function masks({ url, threshold, maxTextDim }) {
  if (current.url !== url) throw new Error('El plano no está cargado en el procesador.');
  const { gray, w, h, scale } = current;
  const mask = binarize(gray, threshold);
  // maxTextDim comes in pixels of the ORIGINAL image; scale converts it to working pixels.
  const { cleaned, text } = removeText(mask, w, h, Math.max(1, Math.round(maxTextDim * scale)));
  const { data, width, height } = buildOverlay({ cleaned, text, w, h });
  const overlay = await createImageBitmap(new ImageData(data, width, height));
  return { cleaned, text, w, h, overlay };
}

self.onmessage = async (event) => {
  const { id, type, ...args } = event.data;
  try {
    if (type === 'load') {
      self.postMessage({ id, result: await load(args) });
    } else if (type === 'masks') {
      const result = await masks(args);
      // Transfer instead of copying (each mask is ~16 MB at 4096²); the worker doesn't
      // need them again, the next call rebuilds from `gray`.
      self.postMessage({ id, result }, [result.cleaned.buffer, result.text.buffer, result.overlay]);
    } else {
      throw new Error(`Mensaje desconocido: ${type}`);
    }
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};

/**
 * Lot detection via image processing: binarize → clean text → magic wand → contour tracing
 * All client-side, no external dependencies beyond standard JS Canvas API
 */

import { fetchImage } from './fetchImage';

export async function loadPixelData(url) {
  try {
    const response = await fetchImage(url, { headers: { 'Accept': 'image/*' } });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const blob = await response.blob();
    const img = new Image();
    img.crossOrigin = 'anonymous';

    return new Promise((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({ imageData, width: canvas.width, height: canvas.height });
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = URL.createObjectURL(blob);
    });
  } catch (err) {
    throw new Error(`loadPixelData: ${err.message}`);
  }
}

export function binarize(imageData, w, h, threshold = 128) {
  const data = imageData.data;
  const mask = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    mask[i] = gray < threshold ? 1 : 0;
  }

  return mask;
}

/**
 * Connected-component labeling: find all distinct black blobs, erase small ones (text)
 * Blob = maxTextDim in both width AND height → text signature vs line
 */
export function cleanText(mask, w, h, maxTextDim = 20) {
  const labeled = new Uint32Array(mask.length);
  let nextLabel = 1;
  const blobs = new Map(); // label -> { minX, maxX, minY, maxY }

  // First pass: label connected components (8-connected)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 0 || labeled[idx] > 0) continue;

      // Start flood fill
      const stack = [[x, y]];
      const blob = { minX: x, maxX: x, minY: y, maxY: y };

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        const cidx = cy * w + cx;

        if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
        if (mask[cidx] === 0 || labeled[cidx] > 0) continue;

        labeled[cidx] = nextLabel;
        blob.minX = Math.min(blob.minX, cx);
        blob.maxX = Math.max(blob.maxX, cx);
        blob.minY = Math.min(blob.minY, cy);
        blob.maxY = Math.max(blob.maxY, cy);

        // 8-connected neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx !== 0 || dy !== 0) stack.push([cx + dx, cy + dy]);
          }
        }
      }

      blobs.set(nextLabel, blob);
      nextLabel++;
    }
  }

  // Second pass: zero out small blobs (text)
  const cleaned = new Uint8Array(mask.length);
  for (let label = 1; label < nextLabel; label++) {
    const blob = blobs.get(label);
    const w_blob = blob.maxX - blob.minX + 1;
    const h_blob = blob.maxY - blob.minY + 1;

    // Keep blob only if it's large in at least one dimension (line = long, text = small in both)
    const isText = w_blob <= maxTextDim && h_blob <= maxTextDim;

    if (!isText) {
      for (let i = 0; i < labeled.length; i++) {
        if (labeled[i] === label) cleaned[i] = 1;
      }
    }
  }

  return cleaned;
}

/**
 * Magic wand: flood fill from click, detect if region is closed (no escape to edge)
 */
export function floodFillRegion(mask, w, h, sx, sy) {
  const visited = new Uint8Array(w * h);
  const region = [];
  let reachesEdge = false;

  const stack = [[sx, sy]];
  const startValue = mask[sy * w + sx];

  while (stack.length > 0) {
    const [x, y] = stack.pop();

    if (x < 0 || x >= w || y < 0 || y >= h) {
      reachesEdge = true;
      continue;
    }

    const idx = y * w + x;
    if (visited[idx] || mask[idx] !== startValue) continue;

    visited[idx] = 1;
    region.push([x, y]);

    if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
      reachesEdge = true;
    }

    // 4-connected
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return { region, reachesEdge, visited };
}

/**
 * Moore-neighbor contour tracing from a region
 */
export function traceBoundary(visited, w, h) {
  // Find a point on the boundary
  let startX = -1, startY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (visited[y * w + x] === 1) {
        startX = x;
        startY = y;
        break;
      }
    }
    if (startX >= 0) break;
  }

  if (startX < 0) return [];

  const contour = [];
  let x = startX, y = startY;
  let dir = 0; // Start going right
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let steps = 0;
  const maxSteps = w * h * 2;

  do {
    contour.push([x, y]);
    let found = false;

    for (let i = 0; i < 8; i++) {
      const [dx, dy] = dirs[(dir + i) % 8];
      const nx = x + dx;
      const ny = y + dy;

      if (nx >= 0 && nx < w && ny >= 0 && ny < h && visited[ny * w + nx] === 1) {
        x = nx;
        y = ny;
        dir = (dir + i) % 8;
        found = true;
        break;
      }
    }

    if (!found) break;
    steps++;
  } while ((x !== startX || y !== startY) && steps < maxSteps);

  return contour;
}

/**
 * Douglas-Peucker: simplify polygon by removing points below epsilon tolerance
 */
export function simplify(points, epsilon = 1.0) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;

  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointLineDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplify(points.slice(0, maxIdx + 1), epsilon);
    const right = simplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  } else {
    return [start, end];
  }
}

function pointLineDistance(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const num = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax);
  const den = Math.sqrt((by - ay) ** 2 + (bx - ax) ** 2);
  return den === 0 ? Math.hypot(px - ax, py - ay) : num / den;
}

/**
 * Main entry point: detect lot polygon from blueprint image at click point
 * Returns normalized coordinates [0, 1] ready for blueprint_coordinates
 */
export async function detectLotPolygon(url, w, h, sx, sy, params = {}) {
  const {
    threshold = 128,
    maxTextDim = 20,
    epsilon = 2.0
  } = params;

  try {
    // Load and binarize
    const { imageData, width: imgW, height: imgH } = await loadPixelData(url);
    const mask = binarize(imageData, imgW, imgH, threshold);

    // Clean text
    const cleaned = cleanText(mask, imgW, imgH, maxTextDim);

    // Scale click to image space if needed
    const clickX = Math.round(sx * imgW);
    const clickY = Math.round(sy * imgH);

    if (clickX < 0 || clickX >= imgW || clickY < 0 || clickY >= imgH) {
      throw new Error('Click outside image bounds');
    }

    // Magic wand
    const { region, reachesEdge } = floodFillRegion(cleaned, imgW, imgH, clickX, clickY);

    if (reachesEdge) {
      throw new Error('Region reaches image edge (not a closed lot)');
    }

    if (region.length < 3) {
      throw new Error('Region too small to form polygon');
    }

    // Recreate visited array from region
    const visited = new Uint8Array(imgW * imgH);
    region.forEach(([x, y]) => { visited[y * imgW + x] = 1; });

    // Trace boundary
    const contour = traceBoundary(visited, imgW, imgH);
    if (contour.length < 3) {
      throw new Error('Could not trace boundary');
    }

    // Simplify
    const simplified = simplify(contour, epsilon);
    if (simplified.length < 3) {
      throw new Error('Simplified polygon has < 3 points');
    }

    // Normalize to [0, 1]
    const normalized = simplified.map(([x, y]) => [x / imgW, y / imgH]);

    return {
      success: true,
      coordinates: normalized,
      vertexCount: normalized.length,
      message: `Detected ${normalized.length}-vertex polygon`
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      coordinates: []
    };
  }
}

/**
 * For preview: binarize + clean, return downscaled mask as ImageData for canvas rendering
 */
export async function getPreviewMask(url, params = {}, maxDim = 640) {
  const { threshold = 128, maxTextDim = 20 } = params;

  try {
    const { imageData, width: w, height: h } = await loadPixelData(url);
    const mask = binarize(imageData, w, h, threshold);
    const cleaned = cleanText(mask, w, h, maxTextDim);

    // Downscale for preview
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const previewW = Math.round(w * scale);
    const previewH = Math.round(h * scale);

    const preview = new Uint8ClampedArray(previewW * previewH * 4);
    for (let y = 0; y < previewH; y++) {
      for (let x = 0; x < previewW; x++) {
        const srcIdx = (Math.floor(y / scale) * w + Math.floor(x / scale));
        const dstIdx = (y * previewW + x) * 4;

        const val = cleaned[srcIdx] * 255;
        preview[dstIdx] = val;     // R
        preview[dstIdx + 1] = val; // G
        preview[dstIdx + 2] = val; // B
        preview[dstIdx + 3] = 255; // A
      }
    }

    return new ImageData(preview, previewW, previewH);
  } catch (err) {
    console.error('getPreviewMask:', err.message);
    return null;
  }
}

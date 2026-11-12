/**
 * Lot detection on the blueprint image: grayscale → binarize → drop text blobs →
 * flood fill from a click → trace the region's outline → simplify.
 * Only pure functions on typed arrays (testable without a DOM). They run inside
 * lotDetection.worker.js; the app calls them through lotDetectionClient.js.
 */

// Longest side the plano is processed at. Big CAD exports (8000px+) would need
// hundreds of MB of typed arrays; 4096 keeps every lot dozens of pixels wide.
export const WORK_MAX_DIM = 4096;
// The overlay drawn over the plano doesn't need full precision, only to be readable.
const OVERLAY_MAX_DIM = 2048;

// 8 neighbors in clockwise screen order (y grows down), starting east.
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * RGBA → grayscale, downscaled so the longest side fits maxDim.
 * Each target pixel keeps the DARKEST source pixel of its block (min-pooling):
 * averaging would turn 1px lines into light gray and the threshold would lose them.
 */
export function toGrayMinPooled(rgba, srcW, srcH, maxDim = WORK_MAX_DIM) {
  const k = Math.max(1, Math.ceil(Math.max(srcW, srcH) / maxDim));
  const w = Math.ceil(srcW / k);
  const h = Math.ceil(srcH / k);
  const gray = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < srcH; y++) {
    const row = ((y / k) | 0) * w;
    for (let x = 0; x < srcW; x++) {
      const i = (y * srcW + x) * 4;
      // Transparent pixels count as paper, not as ink.
      const g = rgba[i + 3] < 128 ? 255 : (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
      const t = row + ((x / k) | 0);
      if (g < gray[t]) gray[t] = g;
    }
  }
  return { gray, w, h, scale: 1 / k };
}

/** 1 = ink (line or text), 0 = paper. */
export function binarize(gray, threshold = 128) {
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < threshold ? 1 : 0;
  return mask;
}

/**
 * Splits ink into lines and text: every 8-connected ink blob whose bounding box
 * fits in maxTextDim × maxTextDim is text (lot numbers, labels), the rest is kept.
 * One labeling pass + one sweep, so it's linear in the pixel count.
 * Returns { cleaned, text }: two masks with the same shape as the input.
 */
export function removeText(mask, w, h, maxTextDim = 20) {
  const labels = new Int32Array(w * h);
  // Each pixel is labeled when pushed, so it enters the stack at most once.
  const stack = new Int32Array(w * h);
  const keep = [0];
  let next = 1;

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || labels[start] !== 0) continue;
    let minX = start % w, maxX = minX, minY = (start / w) | 0, maxY = minY;
    let top = 0;
    stack[top++] = start;
    labels[start] = next;
    while (top > 0) {
      const idx = stack[--top];
      const x = idx % w;
      const y = (idx - x) / w;
      if (x < minX) minX = x; else if (x > maxX) maxX = x;
      if (y < minY) minY = y; else if (y > maxY) maxY = y;
      for (let d = 0; d < 8; d++) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const n = ny * w + nx;
        if (mask[n] === 1 && labels[n] === 0) {
          labels[n] = next;
          stack[top++] = n;
        }
      }
    }
    // A line is long in at least one direction; text is small in both.
    keep.push(maxX - minX + 1 > maxTextDim || maxY - minY + 1 > maxTextDim ? 1 : 0);
    next++;
  }

  const cleaned = new Uint8Array(w * h);
  const text = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l === 0) continue;
    if (keep[l]) cleaned[i] = 1; else text[i] = 1;
  }
  return { cleaned, text };
}

/**
 * Magic wand: 4-connected fill of the paper region under (sx, sy).
 * 4-connectivity on paper pairs with 8-connectivity on ink, so a diagonal
 * line still closes the lot. Returns the region mask, its size, whether it
 * leaked to the image border (not a closed lot) and its first pixel in raster order.
 */
export function floodFill(mask, w, h, sx, sy) {
  const region = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const startIdx = sy * w + sx;
  let top = 0, size = 0, reachesEdge = false, firstIdx = startIdx;
  stack[top++] = startIdx;
  region[startIdx] = 1;
  while (top > 0) {
    const idx = stack[--top];
    size++;
    if (idx < firstIdx) firstIdx = idx;
    const x = idx % w;
    const y = (idx - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) reachesEdge = true;
    if (x + 1 < w && !region[idx + 1] && !mask[idx + 1]) { region[idx + 1] = 1; stack[top++] = idx + 1; }
    if (x > 0 && !region[idx - 1] && !mask[idx - 1]) { region[idx - 1] = 1; stack[top++] = idx - 1; }
    if (y + 1 < h && !region[idx + w] && !mask[idx + w]) { region[idx + w] = 1; stack[top++] = idx + w; }
    if (y > 0 && !region[idx - w] && !mask[idx - w]) { region[idx - w] = 1; stack[top++] = idx - w; }
  }
  return { region, size, reachesEdge, firstIdx };
}

/**
 * Moore-neighbor tracing of a region's outer boundary, clockwise.
 * startIdx must be the region's first pixel in raster order: everything above
 * it and to its left is outside, which is where the search begins.
 * Stops with Jacob's criterion (back at the start about to repeat the first move),
 * which handles regions that pass through the start pixel twice.
 */
export function traceBoundary(region, w, h, startIdx) {
  const inside = (x, y) => x >= 0 && x < w && y >= 0 && y < h && region[y * w + x] === 1;
  const sx = startIdx % w;
  const sy = (startIdx - sx) / w;
  const contour = [[sx, sy]];
  let x = sx, y = sy;
  let back = 4; // the west neighbor of the start is known to be outside
  let firstMove = -1;
  const maxSteps = 4 * w * h;

  for (let step = 0; step < maxSteps; step++) {
    let moved = -1;
    for (let i = 1; i <= 8; i++) {
      const d = (back + i) % 8;
      if (inside(x + DIRS[d][0], y + DIRS[d][1])) { moved = d; break; }
    }
    if (moved < 0) break; // single isolated pixel
    if (x === sx && y === sy && moved === firstMove) break;
    if (firstMove < 0) firstMove = moved;
    x += DIRS[moved][0];
    y += DIRS[moved][1];
    // Restart the search from the last outside pixel checked before the move,
    // seen from the new position (it depends on whether the move was diagonal).
    back = moved % 2 === 0 ? (moved + 6) % 8 : (moved + 5) % 8;
    contour.push([x, y]);
  }

  // The loop closes on the start pixel; drop the duplicate.
  if (contour.length > 1 && contour[contour.length - 1][0] === sx && contour[contour.length - 1][1] === sy) {
    contour.pop();
  }
  return contour;
}

/** Douglas-Peucker for an open polyline. */
export function simplify(points, epsilon = 1.0) {
  if (points.length <= 2) return points;
  const start = points[0];
  const end = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointLineDistance(points[i], start, end);
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist <= epsilon) return [start, end];
  const left = simplify(points.slice(0, maxIdx + 1), epsilon);
  const right = simplify(points.slice(maxIdx), epsilon);
  return [...left.slice(0, -1), ...right];
}

/**
 * Douglas-Peucker for a closed ring: plain DP collapses when first and last
 * point are neighbors, so the ring is cut at the point farthest from the start
 * and each half is simplified on its own.
 */
export function simplifyClosed(points, epsilon = 1.0) {
  if (points.length <= 3) return points;
  const [ax, ay] = points[0];
  let far = 0, farDist = -1;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i][0] - ax) ** 2 + (points[i][1] - ay) ** 2;
    if (d > farDist) { farDist = d; far = i; }
  }
  const a = simplify(points.slice(0, far + 1), epsilon);
  const b = simplify([...points.slice(far), points[0]], epsilon);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function pointLineDistance(p, a, b) {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const num = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax);
  const den = Math.hypot(by - ay, bx - ax);
  return den === 0 ? Math.hypot(px - ax, py - ay) : num / den;
}

/**
 * Lot outline under a click, on already-processed masks.
 * nx, ny: click in normalized plano coords [0, 1]. Returns normalized coords or an error in Spanish.
 */
export function detectLotAt({ cleaned, w, h }, nx, ny, epsilon = 2.0) {
  const sx = Math.floor(nx * w);
  const sy = Math.floor(ny * h);
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) {
    return { success: false, error: 'El clic quedó fuera del plano.' };
  }
  if (cleaned[sy * w + sx] === 1) {
    return { success: false, error: 'Hiciste clic sobre una línea. Probá en el medio del lote.' };
  }
  const { region, size, reachesEdge, firstIdx } = floodFill(cleaned, w, h, sx, sy);
  if (reachesEdge) {
    return { success: false, error: 'Esa zona no está cerrada: se escapa hasta el borde del plano. Si el lote tiene un hueco en la línea, bajá el umbral.' };
  }
  if (size < 16) {
    return { success: false, error: 'La zona es demasiado chica para ser un lote.' };
  }
  const contour = traceBoundary(region, w, h, firstIdx);
  const simplified = simplifyClosed(contour, epsilon);
  if (simplified.length < 3) {
    return { success: false, error: 'No se pudo armar un contorno con esa zona.' };
  }
  return {
    success: true,
    // +0.5 → pixel centers, so the polygon doesn't drift half a pixel up-left.
    coordinates: simplified.map(([x, y]) => [(x + 0.5) / w, (y + 0.5) / h]),
  };
}

/**
 * Overlay of what the detector sees, for drawing on top of the plano:
 * lines in the editor's gold, removed text in red, paper transparent.
 * Returns raw RGBA (wrap it in ImageData to draw it).
 */
export function buildOverlay({ cleaned, text, w, h }, maxDim = OVERLAY_MAX_DIM) {
  const k = Math.max(1, Math.ceil(Math.max(w, h) / maxDim));
  const ow = Math.ceil(w / k);
  const oh = Math.ceil(h / k);
  // 2 = line, 1 = text; a line anywhere in the block wins so thin lines survive.
  const prio = new Uint8Array(ow * oh);
  for (let y = 0; y < h; y++) {
    const row = ((y / k) | 0) * ow;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = cleaned[i] ? 2 : text[i] ? 1 : 0;
      const t = row + ((x / k) | 0);
      if (p > prio[t]) prio[t] = p;
    }
  }
  const data = new Uint8ClampedArray(ow * oh * 4);
  for (let i = 0; i < prio.length; i++) {
    const o = i * 4;
    if (prio[i] === 2) { data[o] = 197; data[o + 1] = 160; data[o + 2] = 89; data[o + 3] = 255; }
    else if (prio[i] === 1) { data[o] = 248; data[o + 1] = 113; data[o + 2] = 113; data[o + 3] = 230; }
  }
  return { data, width: ow, height: oh };
}

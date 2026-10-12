/**
 * Planar homography via DLT (Direct Linear Transform).
 *
 * Maps blueprint normalized coords [nx, ny] ∈ [0,1]
 * to panorama texture coords [textureX, textureY].
 *
 * Requires ≥4 correspondence pairs for a well-determined system.
 */

// ─── Matrix helpers (row-major, flat arrays) ──────────────────────────────────

function matMul(A, B, rowsA, colsA, colsB) {
  const C = new Array(rowsA * colsB).fill(0);
  for (let i = 0; i < rowsA; i++)
    for (let k = 0; k < colsA; k++)
      for (let j = 0; j < colsB; j++)
        C[i * colsB + j] += A[i * colsA + k] * B[k * colsB + j];
  return C;
}

function transpose(A, rows, cols) {
  const T = new Array(cols * rows);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++)
      T[j * rows + i] = A[i * cols + j];
  return T;
}

/**
 * Gaussian elimination with partial pivoting.
 * Solves A·x = b in place. Returns x or null if singular.
 * A is n×n (flat row-major), b is length-n.
 */
function gaussianElimination(A, b) {
  const n = b.length;
  const M = A.map(v => v); // copy
  const rhs = b.map(v => v);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    let maxVal = Math.abs(M[col * n + col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(M[row * n + col]);
      if (val > maxVal) { maxVal = val; maxRow = row; }
    }
    if (maxVal < 1e-12) return null; // singular

    // Swap rows
    for (let j = 0; j < n; j++) {
      [M[col * n + j], M[maxRow * n + j]] = [M[maxRow * n + j], M[col * n + j]];
    }
    [rhs[col], rhs[maxRow]] = [rhs[maxRow], rhs[col]];

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = M[row * n + col] / M[col * n + col];
      for (let j = col; j < n; j++)
        M[row * n + j] -= factor * M[col * n + j];
      rhs[row] -= factor * rhs[col];
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = rhs[i];
    for (let j = i + 1; j < n; j++)
      x[i] -= M[i * n + j] * x[j];
    x[i] /= M[i * n + i];
  }
  return x;
}

// ─── Normalization (improves numerical stability) ─────────────────────────────

function normalizePoints(pts) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n;
  const cy = pts.reduce((s, p) => s + p[1], 0) / n;
  const scale = pts.reduce((s, p) => s + Math.sqrt((p[0]-cx)**2 + (p[1]-cy)**2), 0) / n || 1;
  const factor = Math.SQRT2 / scale;
  const T = [
    factor, 0, -factor * cx,
    0, factor, -factor * cy,
    0, 0, 1,
  ];
  const normalized = pts.map(p => [factor * (p[0] - cx), factor * (p[1] - cy)]);
  return { normalized, T };
}

function denormalizeH(H, Tsrc, Tdst) {
  // H_denorm = inv(Tdst) · H · Tsrc
  // inv of a similarity T is computed analytically
  const invTdst = invertSimilarity(Tdst);
  const tmp = matMul(H, Tsrc, 3, 3, 3);
  return matMul(invTdst, tmp, 3, 3, 3);
}

function invertSimilarity(T) {
  // T = [s, 0, tx; 0, s, ty; 0, 0, 1]
  const s = T[0], tx = T[2], ty = T[5];
  return [
    1/s, 0, -tx/s,
    0, 1/s, -ty/s,
    0, 0, 1,
  ];
}

// ─── Core DLT ─────────────────────────────────────────────────────────────────

/**
 * Build the 2N×9 DLT matrix from N correspondence pairs.
 * Each pair (src=[x,y], dst=[u,v]) contributes 2 rows.
 */
function buildDLTMatrix(srcPts, dstPts) {
  const N = srcPts.length;
  const A = new Array(2 * N * 9).fill(0);

  for (let i = 0; i < N; i++) {
    const [x, y] = srcPts[i];
    const [u, v] = dstPts[i];
    const row1 = 2 * i;
    const row2 = 2 * i + 1;
    // row 1: [-x, -y, -1,  0,  0,  0,  u*x,  u*y,  u]
    A[row1 * 9 + 0] = -x;  A[row1 * 9 + 1] = -y;  A[row1 * 9 + 2] = -1;
    A[row1 * 9 + 3] =  0;  A[row1 * 9 + 4] =  0;  A[row1 * 9 + 5] =  0;
    A[row1 * 9 + 6] = u*x; A[row1 * 9 + 7] = u*y; A[row1 * 9 + 8] = u;
    // row 2: [0, 0, 0, -x, -y, -1, v*x, v*y, v]
    A[row2 * 9 + 0] =  0;  A[row2 * 9 + 1] =  0;  A[row2 * 9 + 2] =  0;
    A[row2 * 9 + 3] = -x;  A[row2 * 9 + 4] = -y;  A[row2 * 9 + 5] = -1;
    A[row2 * 9 + 6] = v*x; A[row2 * 9 + 7] = v*y; A[row2 * 9 + 8] = v;
  }
  return A;
}

/**
 * Solve the DLT system for h (9-vector, last element = 1).
 * For exactly 4 points: 8×8 linear system (fix h8=1, solve for h0..h7).
 * For >4 points: least-squares via normal equations (A^T·A)·h = 0, fix h8=1.
 */
function solveDLT(A, N) {
  const rows = 2 * N;
  // Fix h[8] = 1 and move its column to the RHS
  // System: A[:,0..7] · h[0..7] = -A[:,8]
  const cols8 = 8;
  const M = new Array(rows * cols8);
  const rhs = new Array(rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols8; j++)
      M[i * cols8 + j] = A[i * 9 + j];
    rhs[i] = -A[i * 9 + 8];
  }

  if (N === 4) {
    // Exactly 8 equations, 8 unknowns — direct solve
    return gaussianElimination(M, rhs);
  }

  // Overdetermined: normal equations (M^T M) h = M^T rhs
  const MT = transpose(M, rows, cols8);
  const MtM = matMul(MT, M, cols8, rows, cols8);
  const Mtrhs = matMul(MT, rhs, cols8, rows, 1);
  return gaussianElimination(MtM, Mtrhs);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a 3×3 homography matrix (flat, row-major, 9 elements) from
 * ≥4 correspondence pairs.
 *
 * @param {Array<{src: [number,number], dst: [number,number]}>} correspondences
 * @returns {number[]|null} H (9 elements) or null on failure
 */
export function computeHomography(correspondences) {
  if (!correspondences || correspondences.length < 4) return null;

  const srcPts = correspondences.map(c => c.src);
  const dstPts = correspondences.map(c => c.dst);

  const { normalized: srcN, T: Tsrc } = normalizePoints(srcPts);
  const { normalized: dstN, T: Tdst } = normalizePoints(dstPts);

  const A = buildDLTMatrix(srcN, dstN);
  const h = solveDLT(A, correspondences.length);
  if (!h) return null;

  const Hn = [...h, 1]; // append h8=1
  const H = denormalizeH(Hn, Tsrc, Tdst);

  // Normalize so H[8] = 1
  const scale = H[8];
  if (Math.abs(scale) < 1e-12) return null;
  return H.map(v => v / scale);
}

/**
 * Apply homography H to a source point.
 *
 * @param {number[]} H — 9-element row-major matrix
 * @param {[number,number]} point — [nx, ny] in blueprint space
 * @returns {[number,number]} — [textureX, textureY] in panorama space
 */
export function applyHomography(H, [x, y]) {
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-12) return [0, 0];
  return [
    (H[0] * x + H[1] * y + H[2]) / w,
    (H[3] * x + H[4] * y + H[5]) / w,
  ];
}

/**
 * Inverse of a 3×3 projective matrix (standard cofactor/adjugate method).
 *
 * @param {number[]} H — 9-element row-major matrix
 * @returns {number[]|null} inverse H (9 elements), or null if singular
 */
export function invertHomography(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const Hc = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;

  // Inverse = adjugate(H)^T / det — adjugate is the cofactor matrix transposed,
  // so this is the cofactor matrix laid out column-major (= transposed back).
  return [
    A * invDet, D * invDet, G * invDet,
    B * invDet, E * invDet, Hc * invDet,
    C * invDet, F * invDet, I * invDet,
  ];
}

/**
 * Returns true if H is a usable (non-degenerate) homography.
 *
 * @param {number[]|null} H
 * @returns {boolean}
 */
export function isHomographyValid(H) {
  if (!H || H.length !== 9) return false;
  if (H.some(v => !Number.isFinite(v))) return false;
  // Check determinant of the 2×2 upper-left submatrix (rough sanity check)
  const det = H[0] * H[4] - H[1] * H[3];
  return Math.abs(det) > 1e-6;
}

// ─── Homography whose target is a 3D ray direction, not a 2D pixel ────────────
// Used to map a flat ground plane directly to a spherical view-ray direction.
// Unlike routing through a single gnomonic tangent-plane (only defined within
// ~90° of one reference direction — see panoramaProjection.js, this was the
// cause of street ribbons distorting badly far from the calibration center),
// this stays valid over the WHOLE sphere: it only degenerates exactly at the
// horizon, where the ray becomes parallel to the ground plane, which is a
// real physical singularity (points at infinity), not an arbitrary cutoff.
//
// Same DLT idea as computeHomography, generalized: the target is a 3-vector
// [u,v,w] (not assumed to have w=1), so the "fix h8=1, solve inhomogeneous
// 8×8" shortcut doesn't apply (nothing guarantees h33 ≠ 0 here) — instead we
// find the null space of AᵀA directly via inverse power iteration.

function buildRayDLTMatrix(srcPts, dstRays) {
  const N = srcPts.length;
  const A = new Array(2 * N * 9).fill(0);
  for (let i = 0; i < N; i++) {
    const [x, y] = srcPts[i];
    const [u, v, w] = dstRays[i];
    const row1 = 2 * i;
    const row2 = 2 * i + 1;
    // v·(h3·x) - w·(h2·x) = 0
    A[row1 * 9 + 3] = -w * x; A[row1 * 9 + 4] = -w * y; A[row1 * 9 + 5] = -w;
    A[row1 * 9 + 6] =  v * x; A[row1 * 9 + 7] =  v * y; A[row1 * 9 + 8] =  v;
    // w·(h1·x) - u·(h3·x) = 0
    A[row2 * 9 + 0] =  w * x; A[row2 * 9 + 1] =  w * y; A[row2 * 9 + 2] =  w;
    A[row2 * 9 + 6] = -u * x; A[row2 * 9 + 7] = -u * y; A[row2 * 9 + 8] = -u;
  }
  return A;
}

function computeAtA(A, rows, cols) {
  const AT = transpose(A, rows, cols);
  return matMul(AT, A, cols, rows, cols);
}

// Inverse power iteration on (AᵀA + εI) to find the eigenvector of AᵀA's
// smallest eigenvalue, i.e. the null space direction of A (up to the usual
// DLT overall-scale ambiguity, which doesn't matter here: the target is a
// ray direction, not a fixed-scale point).
function nullSpaceVector(AtA, n, iterations = 60) {
  const trace = Array.from({ length: n }, (_, i) => AtA[i * n + i]).reduce((a, b) => a + b, 0);
  const eps = Math.max(Math.abs(trace), 1) * 1e-9;
  const M = AtA.slice();
  for (let i = 0; i < n; i++) M[i * n + i] += eps;

  let v = new Array(n).fill(1 / Math.sqrt(n));
  for (let iter = 0; iter < iterations; iter++) {
    const solved = gaussianElimination(M, v);
    if (!solved) return null;
    const norm = Math.hypot(...solved);
    if (norm < 1e-15) return null;
    v = solved.map(x => x / norm);
  }
  return v;
}

/**
 * Compute a 3×3 matrix mapping blueprint [nx, ny] (homogeneous [x,y,1]) to a
 * 3D view-ray direction (homogeneous, arbitrary scale) — the generalization
 * of computeHomography() to a non-planar (spherical) target.
 *
 * @param {Array<{src: [number,number], dst: [number,number,number]}>} correspondences
 *   dst = unit ray direction [rx, ry, rz] (see spherical.js sphericalToRay).
 * @returns {number[]|null} H (9 elements, row-major), or null on failure.
 */
export function computeRayHomography(correspondences) {
  if (!correspondences || correspondences.length < 4) return null;

  const srcPts = correspondences.map(c => c.src);
  const dstRays = correspondences.map(c => c.dst);

  const { normalized: srcN, T: Tsrc } = normalizePoints(srcPts);

  const A = buildRayDLTMatrix(srcN, dstRays);
  const AtA = computeAtA(A, 2 * correspondences.length, 9);
  const h = nullSpaceVector(AtA, 9);
  if (!h) return null;

  // h maps NORMALIZED src -> ray; undo the src-side normalization only (the
  // ray side has no transform to undo — its overall scale is meaningless).
  return matMul(h, Tsrc, 3, 3, 3);
}

/**
 * Apply a 3×3 matrix to a homogeneous 3-vector without perspective division —
 * the result is itself homogeneous (e.g. a ray direction, or [gx, gy, gw]
 * that the caller still needs to divide by gw to get a 2D point).
 */
export function applyMat3(M, [a, b, c]) {
  return [
    M[0] * a + M[1] * b + M[2] * c,
    M[3] * a + M[4] * b + M[5] * c,
    M[6] * a + M[7] * b + M[8] * c,
  ];
}

/**
 * Sanity check for a ray-target homography (see isHomographyValid): that one
 * uses a fixed 2×2-submatrix determinant threshold, which assumes a specific
 * output scale (pixels). Here the output is a direction with an arbitrary
 * null-vector normalization, so the check is scaled relative to the matrix's
 * own magnitude instead of an absolute pixel-scale threshold.
 */
export function isRayHomographyValid(H) {
  if (!H || H.length !== 9 || H.some(v => !Number.isFinite(v))) return false;
  const [a, b, c, d, e, f, g, h, i] = H;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const scale = Math.hypot(...H) || 1;
  return Math.abs(det) > 1e-9 * scale ** 3;
}

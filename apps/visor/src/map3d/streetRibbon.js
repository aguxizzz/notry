// Calle outline from its axis: a ribbon of constant width with rounded
// corners, and the union of crossing calles into one street network.
// Pure geometry on [x, y] points in any planar unit (meters in the visor's
// 3D map). Shared with the editor through @map3d (its streetPath.js).

import polygonClipping from 'polygon-clipping';

function normalize([x, y]) {
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}

function perp([x, y]) {
  return [-y, x];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

function bezierPoint(p0, control, p1, t) {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * control[0] + t * t * p1[0],
    mt * mt * p0[1] + 2 * mt * t * control[1] + t * t * p1[1],
  ];
}

// Derivada de la Bézier cuadrática en t, normalizada: tangente real de la
// curva en ese punto (a diferencia de aproximarla por diferencia con el
// punto muestreado vecino, que es inestable porque el muestreo en t no es
// uniforme en longitud de arco).
function bezierTangent(p0, control, p1, t) {
  const mt = 1 - t;
  return normalize([
    2 * mt * (control[0] - p0[0]) + 2 * t * (p1[0] - control[0]),
    2 * mt * (control[1] - p0[1]) + 2 * t * (p1[1] - control[1]),
  ]);
}

function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

// Eje trazado a mano = quiebre duro en cada click. En vez de curvar la calle
// entera (spline), solo se redondea cada esquina: se recorta un tramito de
// largo `radius` a cada lado del vértice y se lo reemplaza por una Bézier
// cuadrática (control = el vértice original) — el resto de cada tramo recto
// entre esquinas queda intacto. `radius` se clampea a la mitad del tramo más
// corto adyacente para que dos esquinas seguidas no se superpongan.
//
// Devuelve, junto con los puntos, la tangente real en cada uno: el ancho de
// la calle se offsetea perpendicular a esa tangente, no por diferencia entre
// puntos vecinos (eso era lo que hacía fluctuar el grosor a lo largo de las
// curvas — el muestreo de la Bézier no es uniforme).
function filletCenterline(points, radius, segments = 8) {
  const n = points.length;
  if (n < 2) {
    return { pts: points.slice(), dirs: points.map(() => [1, 0]) };
  }
  if (n < 3 || radius <= 0) {
    const dirs = points.map((_, i) => {
      if (i === 0) return normalize(sub(points[1], points[0]));
      if (i === n - 1) return normalize(sub(points[n - 1], points[n - 2]));
      return normalize(sub(points[i + 1], points[i - 1]));
    });
    return { pts: points.slice(), dirs };
  }
  const pts = [points[0]];
  const dirs = [];
  for (let i = 1; i < n - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const r = Math.min(radius, distance(p0, p1) / 2, distance(p1, p2) / 2);
    const dirIn = normalize([p1[0] - p0[0], p1[1] - p0[1]]);
    const dirOut = normalize([p2[0] - p1[0], p2[1] - p1[1]]);
    const pA = [p1[0] - dirIn[0] * r, p1[1] - dirIn[1] * r];
    const pB = [p1[0] + dirOut[0] * r, p1[1] + dirOut[1] * r];
    pts.push(pA);
    dirs.push(dirIn);
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      pts.push(bezierPoint(pA, p1, pB, t));
      dirs.push(bezierTangent(pA, p1, pB, t));
    }
  }
  pts.push(points[n - 1]);
  dirs.unshift(dirs[0] ?? normalize(sub(points[1], points[0])));
  dirs.push(normalize(sub(points[n - 1], points[n - 2])));
  return { pts, dirs };
}

/**
 * Closed outline of a street of `width` around the axis `points` (same units),
 * with the corners rounded by filletCenterline. [] if there's no axis or width.
 */
export function buildStreetRibbon(points, width) {
  if (!points || points.length < 2 || !width) return [];
  const { pts, dirs } = filletCenterline(points, width);
  const half = width / 2;
  const left = pts.map((p, i) => {
    const normal = perp(dirs[i]);
    return [p[0] + normal[0] * half, p[1] + normal[1] * half];
  });
  const right = pts.map((p, i) => {
    const normal = perp(dirs[i]);
    return [p[0] - normal[0] * half, p[1] - normal[1] * half];
  });
  return [...left, ...right.reverse()];
}

/**
 * Union of calle outlines into one contour per connected group, keeping the
 * holes: a grid of crossing streets is the normal case, and the manzana
 * enclosed by four calles is a hole of their union, not street.
 * Returns [{ outer, holes: [ring...] }], rings open (no repeated closing point).
 */
export function unionStreetAreas(polygonsPoints) {
  const closed = polygonsPoints
    .filter(pts => pts && pts.length >= 3)
    .map(pts => [[...pts.map(([x, y]) => [x, y]), pts[0]]]);
  if (!closed.length) return [];
  const open = ring => ring.slice(0, -1);
  return polygonClipping.union(...closed).map(([outer, ...holes]) => ({
    outer: open(outer),
    holes: holes.map(open),
  }));
}

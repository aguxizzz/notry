/**
 * Equirectangular <-> spherical <-> gnomonic conversions.
 *
 * The texture <-> spherical formulas mirror exactly what
 * @photo-sphere-viewer/core's EquirectangularAdapter uses internally
 * (textureCoordsToSphericalCoords / sphericalCoordsToTextureCoords), so
 * yaw/pitch computed here line up with what the viewer renders. Panoramas
 * are assumed uncropped (croppedX/Y = 0, full = panorama dimensions), which
 * matches how this app loads panoramas.
 */

const TWO_PI = Math.PI * 2;

function normalizeYaw(yaw) {
  let y = yaw % TWO_PI;
  if (y < 0) y += TWO_PI;
  return y;
}

// ─── Equirectangular texture pixel <-> spherical (yaw, pitch) ────────────────

export function textureToSpherical(textureX, textureY, width, height) {
  const relativeX = (textureX / width) * TWO_PI;
  const relativeY = (textureY / height) * Math.PI;
  return {
    yaw: relativeX >= Math.PI ? relativeX - Math.PI : relativeX + Math.PI,
    pitch: Math.PI / 2 - relativeY,
  };
}

export function sphericalToTexture(yaw, pitch, width, height) {
  const y = normalizeYaw(yaw);
  const relativeLong = (y / TWO_PI) * width;
  const relativeLat = (pitch / Math.PI) * height;
  const textureX = y < Math.PI ? relativeLong + width / 2 : relativeLong - width / 2;
  const textureY = height / 2 - relativeLat;
  return { textureX, textureY };
}

// ─── Spherical <-> 3D unit ray ────────────────────────────────────────────────
// Internal convention only (never fed back into PSV directly) — self-consistent
// is all that matters here.

export function sphericalToRay(yaw, pitch) {
  return [
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(yaw),
  ];
}

export function rayToSpherical([x, y, z]) {
  const r = Math.hypot(x, y, z);
  return {
    yaw: normalizeYaw(Math.atan2(x, z)),
    pitch: Math.asin(y / r),
  };
}

export function averageRayDirection(sphericalPoints) {
  let sx = 0, sy = 0, sz = 0;
  sphericalPoints.forEach(({ yaw, pitch }) => {
    const [x, y, z] = sphericalToRay(yaw, pitch);
    sx += x; sy += y; sz += z;
  });
  return rayToSpherical([sx, sy, sz]);
}

// ─── Gnomonic (tangent-plane / rectilinear) projection ───────────────────────
// This is the space where a flat ground plane truly maps to image coordinates
// via a projective transform — unlike equirectangular texture space, which is
// linear in the *angles* themselves and therefore not projective.

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TWO_PI;
  while (d <= -Math.PI) d += TWO_PI;
  return d;
}

export function gnomonicProject(yaw, pitch, refYaw, refPitch) {
  const dLon = angleDiff(yaw, refYaw);
  const cosC = Math.sin(refPitch) * Math.sin(pitch) +
               Math.cos(refPitch) * Math.cos(pitch) * Math.cos(dLon);
  const X = (Math.cos(pitch) * Math.sin(dLon)) / cosC;
  const Y = (Math.cos(refPitch) * Math.sin(pitch) -
             Math.sin(refPitch) * Math.cos(pitch) * Math.cos(dLon)) / cosC;
  return [X, Y];
}

export function gnomonicUnproject(X, Y, refYaw, refPitch) {
  const rho = Math.hypot(X, Y);
  if (rho < 1e-9) return { yaw: refYaw, pitch: refPitch };
  const c = Math.atan(rho);
  const sinC = Math.sin(c), cosC = Math.cos(c);
  const pitch = Math.asin(cosC * Math.sin(refPitch) + (Y * sinC * Math.cos(refPitch)) / rho);
  const yaw = normalizeYaw(refYaw + Math.atan2(
    X * sinC,
    rho * Math.cos(refPitch) * cosC - Y * Math.sin(refPitch) * sinC
  ));
  return { yaw, pitch };
}

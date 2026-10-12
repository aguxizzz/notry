/**
 * Equirectangular <-> spherical <-> gnomonic conversions.
 *
 * The texture <-> spherical formulas mirror exactly what
 * @photo-sphere-viewer/core's EquirectangularAdapter uses internally
 * (textureCoordsToSphericalCoords / sphericalCoordsToTextureCoords), so
 * yaw/pitch computed here line up with what the viewer renders. Panoramas
 * without XMP pano data are framed the way PSV frames them: an image that is
 * not 2:1 is a centered crop of the full sphere (see fullFrame), so its
 * poles render black instead of the image being stretched to fill them.
 */

const TWO_PI = Math.PI * 2;

function normalizeYaw(yaw) {
  let y = yaw % TWO_PI;
  if (y < 0) y += TWO_PI;
  return y;
}

// ─── Equirectangular texture pixel <-> spherical (yaw, pitch) ────────────────

// Mirrors PSV's default panoData when the image carries no XMP: the full
// sphere is 2:1, sized to contain the image, and the image sits centered in it.
function fullFrame(width, height) {
  const fullWidth = Math.max(width, height * 2);
  const fullHeight = fullWidth / 2;
  return {
    fullWidth,
    fullHeight,
    croppedX: (fullWidth - width) / 2,
    croppedY: (fullHeight - height) / 2,
  };
}

export function textureToSpherical(textureX, textureY, width, height) {
  const { fullWidth, fullHeight, croppedX, croppedY } = fullFrame(width, height);
  const relativeX = ((textureX + croppedX) / fullWidth) * TWO_PI;
  const relativeY = ((textureY + croppedY) / fullHeight) * Math.PI;
  return {
    yaw: relativeX >= Math.PI ? relativeX - Math.PI : relativeX + Math.PI,
    pitch: Math.PI / 2 - relativeY,
  };
}

export function sphericalToTexture(yaw, pitch, width, height) {
  const { fullWidth, fullHeight, croppedX, croppedY } = fullFrame(width, height);
  const y = normalizeYaw(yaw);
  const relativeLong = (y / TWO_PI) * fullWidth;
  const relativeLat = (pitch / Math.PI) * fullHeight;
  const textureX = (y < Math.PI ? relativeLong + fullWidth / 2 : relativeLong - fullWidth / 2) - croppedX;
  const textureY = fullHeight / 2 - relativeLat - croppedY;
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

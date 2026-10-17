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

// ─── Punto medio de una arista del panorama ─────────────────────────────────

/**
 * Punto medio de la arista a→b sobre la esfera (el arco más corto), en
 * pixeles de textura. Es lo que PSV pinta como "línea recta" en la vista, y
 * cruza la costura del panorama por el lado corto. Si a y b son antípodas no
 * hay arco único y se cae al promedio en pixeles.
 */
export function sphericalMidpoint([ax, ay], [bx, by], { width, height }) {
  const sa = textureToSpherical(ax, ay, width, height);
  const sb = textureToSpherical(bx, by, width, height);
  const ra = sphericalToRay(sa.yaw, sa.pitch);
  const rb = sphericalToRay(sb.yaw, sb.pitch);
  const mid = [ra[0] + rb[0], ra[1] + rb[1], ra[2] + rb[2]];
  if (Math.hypot(...mid) < 1e-9) return [(ax + bx) / 2, (ay + by) / 2];
  const { yaw, pitch } = rayToSpherical(mid);
  const { textureX, textureY } = sphericalToTexture(yaw, pitch, width, height);
  return [textureX, textureY];
}

// Cámara sintética para tests de proyección: un plano de piso cuya relación
// blueprint -> rayo es exactamente proyectiva y conocida, así los tests
// comparan contra la verdad geométrica en vez de contra la propia
// implementación.
//
// Cámara en el origen, piso a altura y = -1. Un punto del plano [nx, ny]
// (normalizado 0..1) cae en el piso en X = (nx - 0.5) * 10, Z = 3 + ny * 10,
// o sea, delante de la cámara (yaw cercano a 0, centro de la textura).
import { rayToSpherical, sphericalToTexture } from '../utils/spherical.js';

export const PANO = { width: 4000, height: 2000 };

export function groundRay([nx, ny]) {
  return [(nx - 0.5) * 10, -1, 3 + ny * 10];
}

export function trueTexture(point, dims = PANO) {
  const { yaw, pitch } = rayToSpherical(groundRay(point));
  const { textureX, textureY } = sphericalToTexture(yaw, pitch, dims.width, dims.height);
  return [textureX, textureY];
}

export const CALIBRATION_BLUEPRINT = [[0.1, 0.1], [0.9, 0.15], [0.85, 0.9], [0.15, 0.85]];

export function syntheticCorrespondences(points = CALIBRATION_BLUEPRINT, dims = PANO) {
  return points.map(src => ({ src, dst: trueTexture(src, dims) }));
}

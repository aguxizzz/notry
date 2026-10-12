/**
 * Blueprint -> panorama projector.
 *
 * The naive approach — fitting a single planar homography directly from
 * blueprint (x, y) to equirectangular texture pixels — is only valid for a
 * ground plane -> rectilinear (pinhole) image mapping. Equirectangular
 * texture space is linear in yaw/pitch (the angles themselves), which is a
 * genuinely non-linear (trigonometric) relationship to a 3D ground plane —
 * so no 3x3 projective matrix can represent it exactly.
 *
 * Fix: fit the homography so its TARGET is the 3D view-ray direction
 * (unit vector on the sphere) instead of a 2D pixel or a 2D gnomonic
 * tangent-plane coordinate. A flat ground plane -> ray-direction relationship
 * really is projective (it's just "where does this ground point sit relative
 * to the camera", expressed homogeneously), and — unlike routing through a
 * single gnomonic tangent plane centered on one reference direction, which
 * is only mathematically defined within 90° of that center — this stays
 * valid over the WHOLE sphere. It only degenerates exactly at the horizon,
 * where the ray is parallel to the ground plane (points at infinity), which
 * is a real physical singularity, not an arbitrary cutoff.
 */
import { computeRayHomography, applyMat3, invertHomography, isRayHomographyValid } from './homography.js';
import { textureToSpherical, sphericalToTexture, sphericalToRay, rayToSpherical } from './spherical.js';

/**
 * @param {Array<{src: [number,number], dst: [number,number]}>} correspondences
 *   src = blueprint [nx, ny] normalized; dst = panorama [textureX, textureY] pixels.
 * @param {{width: number, height: number}} panoramaDimensions
 * @returns {object|null} projector, or null if under-determined/degenerate.
 */
export function computeProjector(correspondences, panoramaDimensions) {
  if (!correspondences || correspondences.length < 4) return null;
  const { width, height } = panoramaDimensions ?? {};
  if (!width || !height) return null;

  const rayCorrespondences = correspondences.map(c => {
    const { yaw, pitch } = textureToSpherical(c.dst[0], c.dst[1], width, height);
    return { src: c.src, dst: sphericalToRay(yaw, pitch) };
  });

  const H = computeRayHomography(rayCorrespondences);
  if (!isRayHomographyValid(H)) return null;
  const Hinv = invertHomography(H);
  if (!Hinv) return null;

  const projector = { H, Hinv, width, height };
  // Factor único px(panorama)->blueprint para TODO este panorama: promedio
  // de la escala de área local (ver localAreaScale) en los propios puntos de
  // calibración. Herramientas como la Ruta de calles lo usan como un único
  // escalar fijo para toda la forma, en vez de medir la escala punto a punto
  // — la escala local real varía muchísimo (>10x) entre un punto cerca de la
  // cámara y uno cerca del horizonte del plano de piso, lo cual es
  // físicamente correcto pero hacía que una misma calle se viera con anchos
  // muy distintos en sus propios extremos, y que dos calles que se tocan en
  // el mismo punto calcularan anchos distintos ahí. Un solo factor fijo por
  // panorama prioriza consistencia visual entre calles por sobre el
  // foreshortening de perspectiva "perfecto" punto a punto.
  const scales = correspondences
    .map(c => localAreaScale(projector, c.dst, c.src))
    .filter(Number.isFinite);
  projector.widthScale = scales.length ? scales.reduce((a, b) => a + b, 0) / scales.length : null;
  return projector;
}

// Factor de escala de área local de la proyección texture->blueprint en un
// punto: raíz del determinante del jacobiano (diferencias finitas en x e y),
// evaluado alrededor de `texturePoint` (cuyo unproject ya se conoce como
// `basePoint`, para no recalcularlo).
const AREA_SCALE_EPS_PX = 2;
function localAreaScale(projector, texturePoint, basePoint) {
  const px = unprojectPoint(projector, [texturePoint[0] + AREA_SCALE_EPS_PX, texturePoint[1]]);
  const py = unprojectPoint(projector, [texturePoint[0], texturePoint[1] + AREA_SCALE_EPS_PX]);
  if (!Number.isFinite(px[0]) || !Number.isFinite(py[0])) return null;
  const ex = [(px[0] - basePoint[0]) / AREA_SCALE_EPS_PX, (px[1] - basePoint[1]) / AREA_SCALE_EPS_PX];
  const ey = [(py[0] - basePoint[0]) / AREA_SCALE_EPS_PX, (py[1] - basePoint[1]) / AREA_SCALE_EPS_PX];
  const det = ex[0] * ey[1] - ex[1] * ey[0];
  if (!Number.isFinite(det)) return null;
  return Math.sqrt(Math.abs(det));
}

/**
 * @param {object} projector — from computeProjector
 * @param {[number,number]} point — [nx, ny] in blueprint space
 * @returns {[number,number]} — [textureX, textureY] in panorama space
 */
export function applyProjector(projector, point) {
  const { H, width, height } = projector;
  const [rx, ry, rz] = applyMat3(H, [point[0], point[1], 1]);
  const { yaw, pitch } = rayToSpherical([rx, ry, rz]);
  const { textureX, textureY } = sphericalToTexture(yaw, pitch, width, height);
  return [textureX, textureY];
}

/**
 * Inverse of applyProjector — panorama texture pixel back to blueprint space.
 * Lets tools that draw directly on the panorama (e.g. the render-mode street
 * tool) round-trip through blueprint (flat, Euclidean) space to do geometry
 * — offsets, fillets — correctly, then re-project with applyProjector.
 *
 * @param {object} projector — from computeProjector
 * @param {[number,number]} point — [textureX, textureY] in panorama space
 * @returns {[number,number]} — [nx, ny] in blueprint space (NaN if the ray
 *   is parallel to the ground plane — the point sits exactly on the horizon)
 */
export function unprojectPoint(projector, point) {
  const { Hinv, width, height } = projector;
  const { yaw, pitch } = textureToSpherical(point[0], point[1], width, height);
  const ray = sphericalToRay(yaw, pitch);
  const [gx, gy, gw] = applyMat3(Hinv, ray);
  if (!Number.isFinite(gw) || Math.abs(gw) < 1e-9) return [NaN, NaN];
  return [gx / gw, gy / gw];
}

export function isProjectorValid(projector) {
  return Boolean(projector && isRayHomographyValid(projector.H) && projector.Hinv);
}

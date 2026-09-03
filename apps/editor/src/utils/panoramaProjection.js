/**
 * Blueprint -> panorama projector.
 *
 * The naive approach — fitting a single planar homography directly from
 * blueprint (x, y) to equirectangular texture pixels — is only valid for a
 * ground plane -> rectilinear (pinhole) image mapping. Equirectangular
 * texture space is linear in yaw/pitch (the angles themselves), which is a
 * genuinely non-linear (trigonometric) relationship to a 3D ground plane —
 * so no 3x3 projective matrix can represent it exactly. Fitting one anyway
 * degrades as calibration points spread across a wide field of view, and
 * gets *worse*, not better, as more points are added (least squares has to
 * average an error that is systematic, not noise).
 *
 * Fix: fit the homography in a gnomonic (rectilinear) tangent-plane space —
 * where the ground-plane -> image relationship really is projective — then
 * convert back to spherical/texture space only at the end, per point.
 */
import { computeHomography, applyHomography, isHomographyValid } from './homography.js';
import {
  textureToSpherical, sphericalToTexture,
  averageRayDirection, gnomonicProject, gnomonicUnproject,
} from './spherical.js';

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

  const spherical = correspondences.map(c => textureToSpherical(c.dst[0], c.dst[1], width, height));
  const { yaw: refYaw, pitch: refPitch } = averageRayDirection(spherical);

  const gnomonicCorrespondences = correspondences.map((c, i) => ({
    src: c.src,
    dst: gnomonicProject(spherical[i].yaw, spherical[i].pitch, refYaw, refPitch),
  }));

  const H = computeHomography(gnomonicCorrespondences);
  if (!isHomographyValid(H)) return null;

  return { H, refYaw, refPitch, width, height };
}

/**
 * @param {object} projector — from computeProjector
 * @param {[number,number]} point — [nx, ny] in blueprint space
 * @returns {[number,number]} — [textureX, textureY] in panorama space
 */
export function applyProjector(projector, point) {
  const { H, refYaw, refPitch, width, height } = projector;
  const [X, Y] = applyHomography(H, point);
  const { yaw, pitch } = gnomonicUnproject(X, Y, refYaw, refPitch);
  const { textureX, textureY } = sphericalToTexture(yaw, pitch, width, height);
  return [textureX, textureY];
}

export function isProjectorValid(projector) {
  return Boolean(projector && isHomographyValid(projector.H));
}

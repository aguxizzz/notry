export const BLUEPRINT_CLOSE_THRESHOLD = 0.025;
export const PANORAMA_CLOSE_THRESHOLD = 12;

export function isCalibrationPairTooClose(existingPair, blueprintPoint, panoramaPoint) {
  if (!existingPair?.blueprint || !existingPair?.panorama) return false;

  const blueprintDistance = Math.hypot(
    existingPair.blueprint[0] - blueprintPoint[0],
    existingPair.blueprint[1] - blueprintPoint[1],
  );
  const panoramaDistance = Math.hypot(
    existingPair.panorama[0] - panoramaPoint[0],
    existingPair.panorama[1] - panoramaPoint[1],
  );

  return blueprintDistance < BLUEPRINT_CLOSE_THRESHOLD
    && panoramaDistance < PANORAMA_CLOSE_THRESHOLD;
}

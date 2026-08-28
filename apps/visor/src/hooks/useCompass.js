import { useState, useCallback } from 'react';

/**
 * Tracks camera yaw from PSV for use by the Compass component.
 * Returns the current yaw (radians) and a stable callback to pass to useViewer.
 */
export function useCompass() {
  const [yaw, setYaw] = useState(0);
  const onPositionChange = useCallback((newYaw) => setYaw(newYaw), []);
  return { yaw, onPositionChange };
}

// How the satellite map is shown: background (satélite / render), how much of
// the blueprint shows on top and which way it's turned. Lives outside
// GeoCalibrationMap so the Satellite view can put these controls in the main
// toolbar instead of a second bar floating over the map.
import { useState } from 'react';

/** `initialOpacity`: blueprint opacity on first use (0 = hidden). */
export function useMapView(initialOpacity = 0.5) {
  const [mode, setMode] = useState('satellite');
  const [opacity, setOpacity] = useState(initialOpacity);
  // 'plano': map turned like the blueprint pane; 'north': north up.
  const [orientation, setOrientation] = useState('plano');
  return { mode, setMode, opacity, setOpacity, orientation, setOrientation };
}

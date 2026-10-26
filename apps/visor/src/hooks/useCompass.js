import { useState } from 'react';
import { createHeadingStore } from '../headingStore.js';

/**
 * Rumbo de la cámara para las brújulas. `heading` es un store (no estado):
 * moverse no re-renderiza el visor. `onPositionChange` va a useViewer.
 */
export function useCompass() {
  const [heading] = useState(() => createHeadingStore());
  return { heading, onPositionChange: heading.set };
}

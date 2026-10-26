import { useCallback } from 'react';

const ZOOM_STEP = 12;

/**
 * Botones de cámara del panorama: zoom, volver a la vista inicial y mirar al
 * norte (brújula). No hacen nada si PSV no está montado.
 *
 * @param {object} handles - useViewerHandles()
 */
export function useCameraControls({ viewerRef }, { homePosition, northOffset }) {
  const zoomBy = useCallback((delta) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.animate({ zoom: Math.max(0, Math.min(100, viewer.getZoomLevel() + delta)), speed: 400 });
  }, [viewerRef]);

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(-ZOOM_STEP), [zoomBy]);

  const resetView = useCallback(() => {
    viewerRef.current?.animate({ ...(homePosition ?? { yaw: 0, pitch: 0 }), zoom: 50, speed: 900 });
  }, [viewerRef, homePosition]);

  const faceNorth = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || northOffset === null) return;
    viewer.animate({ yaw: northOffset, pitch: viewer.getPosition().pitch, speed: 900 });
  }, [viewerRef, northOffset]);

  return { zoomIn, zoomOut, resetView, faceNorth };
}

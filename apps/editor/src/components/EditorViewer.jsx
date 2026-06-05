import { useEffect, useRef } from 'react';
import { Viewer, EquirectangularAdapter } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { annotationsToMarkers } from '../utils/annotations';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';

// Tools that draw a polygon by clicking points and snapping to close
const isPolyDrawTool = (t) => t === 'polygon' || t === 'poi';

export default function EditorViewer({ panoramaUrl, annotations, activeTool, onClick, onMarkerSelect, onPolygonUpdate, onMarkerDragEnd, onMarkerDrag }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const markersPluginRef = useRef(null);
  const isPanoramaReadyRef = useRef(false);

  const onClickRef = useRef(onClick);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  const onPolygonUpdateRef = useRef(onPolygonUpdate);
  const onMarkerDragEndRef = useRef(onMarkerDragEnd);
  const onMarkerDragRef = useRef(onMarkerDrag);
  const activeToolRef = useRef(activeTool);
  const annotationsRef = useRef(annotations);

  useEffect(() => {
    onClickRef.current = onClick;
    onMarkerSelectRef.current = onMarkerSelect;
    onPolygonUpdateRef.current = onPolygonUpdate;
    onMarkerDragEndRef.current = onMarkerDragEnd;
    onMarkerDragRef.current = onMarkerDrag;
    activeToolRef.current = activeTool;
    annotationsRef.current = annotations;
  }, [onClick, onMarkerSelect, onPolygonUpdate, onMarkerDragEnd, onMarkerDrag, activeTool, annotations]);

  // Init viewer
  useEffect(() => {
    if (!containerRef.current) return;

    const initialMarkers = annotations ? annotationsToMarkers(annotations) : [];
    const pluginConfig = MarkersPlugin.withConfig({
      markers: initialMarkers,
    });

    viewerRef.current = new Viewer({
      container: containerRef.current,
      panorama: panoramaUrl,
      adapter: EquirectangularAdapter,
      plugins: [pluginConfig],
      navbar: 'zoom move fullscreen',
      defaultZoomLvl: 50,
      minFov: 5,
      mousewheel: true,
      mousemove: true,
    });

    markersPluginRef.current = viewerRef.current.getPlugin(MarkersPlugin);
    isPanoramaReadyRef.current = false;

    viewerRef.current.addEventListener('ready', () => {
      isPanoramaReadyRef.current = true;
      if (annotationsRef.current) {
        markersPluginRef.current.setMarkers(annotationsToMarkers(annotationsRef.current));
      }
    });

    viewerRef.current.addEventListener('click', (e) => {
      onClickRef.current && onClickRef.current(e.data.textureX, e.data.textureY);
    });

    markersPluginRef.current.addEventListener('select-marker', ({ marker }) => {
      onMarkerSelectRef.current && onMarkerSelectRef.current(marker.id);
    });

    return () => {
      viewerRef.current.destroy();
    };
  }, [panoramaUrl]); 

  // Manejar el toggle entre exploración 3D y dibujo en canvas
  useEffect(() => {
    if (!viewerRef.current) return;
    viewerRef.current.setOptions({ mousemove: true, mousewheel: true });
    viewerRef.current.container.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
  }, [activeTool]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let draggingCorner = null;
    let draggingMarker = null;
    let isSnappedToFirstPoint = false;

    const blockLeftDrag = (e) => {
      if (e.buttons === 1 || e.touches) {
        e.stopPropagation();
      }
    };

    const handlePointerDown = (e) => {
      // Actuar exclusivamente en clic izquierdo
      if (e.button !== 0) return;

      if (isSnappedToFirstPoint && isPolyDrawTool(activeToolRef.current)) {
        e.stopPropagation();
        isSnappedToFirstPoint = false;
        onMarkerSelectRef.current && onMarkerSelectRef.current('temp-pt-0');
        return;
      }

      const cornerEl = e.target.closest('[id^="psv-marker-edit-corner-"]');
      if (cornerEl) {
        e.stopPropagation(); 
        
        const parts = cornerEl.id.replace('psv-marker-edit-corner-', '').split('-');
        const index = parseInt(parts.pop(), 10);
        const markerId = parts.join('-');
        
        draggingCorner = { markerId, index, lastTexture: null };
        return;
      }

      const midpointEl = e.target.closest('[id^="psv-marker-edit-midpoint-"]');
      if (midpointEl) {
        e.stopPropagation(); 
        const parts = midpointEl.id.replace('psv-marker-edit-midpoint-', '').split('-');
        const index = parseInt(parts.pop(), 10);
        const markerId = parts.join('-');
        
        const marker = markersPluginRef.current?.getMarker(markerId);
        if (marker && marker.config.polygonPixels) {
          const pts = [...marker.config.polygonPixels];
          
          const rect = containerRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const spherical = viewerRef.current.dataHelper.viewerCoordsToSphericalCoords({ x, y });
          if (spherical) {
            const texture = viewerRef.current.dataHelper.sphericalCoordsToTextureCoords(spherical);
            pts.splice(index + 1, 0, [texture.textureX, texture.textureY]);
            
            onPolygonUpdateRef.current && onPolygonUpdateRef.current(markerId, pts);
            
            draggingCorner = { markerId, index: index + 1, lastTexture: texture };
          }
        }
        return;
      }

      const markerEl = e.target.closest('.psv-marker');
      if (markerEl) {
        const markerId = markerEl.id.replace('psv-marker-', '');

        // Calibration points are only draggable with the Select tool; in other
        // tools let the click flow through (e.g. placing new calibration points)
        if (markerId.startsWith('calib-') && activeToolRef.current !== 'select') {
          return;
        }

        e.stopPropagation();

        onMarkerSelectRef.current && onMarkerSelectRef.current(markerId);

        const marker = markersPluginRef.current?.getMarker(markerId);
        if (marker && !marker.isPoly()) {
          draggingMarker = { markerId, lastTexture: null, isDrag: false };
        }
      }
    };

    const handlePointerMove = (e) => {
      if (!draggingCorner && !draggingMarker && !isPolyDrawTool(activeToolRef.current)) return;
      
      const viewer = viewerRef.current;
      const markersPlugin = markersPluginRef.current;
      if (!viewer || !markersPlugin) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const spherical = viewer.dataHelper.viewerCoordsToSphericalCoords({ x, y });
      if (spherical) {
        const texture = viewer.dataHelper.sphericalCoordsToTextureCoords(spherical);
        
        if (isPolyDrawTool(activeToolRef.current)) {
          const tempMarker = markersPlugin.getMarker('temp-drawing');
          if (tempMarker && tempMarker.config.polylinePixels) {
            const pts = [...tempMarker.config.polylinePixels];
            
            let snapTx = texture.textureX;
            let snapTy = texture.textureY;

            if (pts.length - 1 >= 3) {
              const firstPtMarker = markersPlugin.getMarker('temp-pt-0');
              if (firstPtMarker && firstPtMarker.state.position2D) {
                const p2d = firstPtMarker.state.position2D;
                const dx = x - p2d.x;
                const dy = y - p2d.y;
                const screenDist = Math.sqrt(dx*dx + dy*dy);
                
                const snapPx = 15 + viewer.getZoomLevel() * 0.4;
                if (screenDist < snapPx) {
                   if (firstPtMarker.config.position) {
                      snapTx = firstPtMarker.config.position.textureX;
                      snapTy = firstPtMarker.config.position.textureY;
                      isSnappedToFirstPoint = true;
                   }
                } else {
                   isSnappedToFirstPoint = false;
                }
              } else {
                 isSnappedToFirstPoint = false;
              }
            } else {
               isSnappedToFirstPoint = false;
            }

            pts[pts.length - 1] = [snapTx, snapTy];
            markersPlugin.updateMarker({
              id: 'temp-drawing',
              polylinePixels: pts
            });
          }
        }
        
        if (draggingCorner) {
          const cornerMarkerId = `edit-corner-${draggingCorner.markerId}-${draggingCorner.index}`;
          markersPlugin.updateMarker({
            id: cornerMarkerId,
            position: { textureX: texture.textureX, textureY: texture.textureY }
          });

          const polyMarker = markersPlugin.getMarker(draggingCorner.markerId);
          if (polyMarker && polyMarker.config.polygonPixels) {
            const newPixels = [...polyMarker.config.polygonPixels];
            newPixels[draggingCorner.index] = [texture.textureX, texture.textureY];
            markersPlugin.updateMarker({
              id: draggingCorner.markerId,
              polygonPixels: newPixels
            });
          }
          
          draggingCorner.lastTexture = texture;
        } else if (draggingMarker) {
          draggingMarker.isDrag = true;
          markersPlugin.updateMarker({
            id: draggingMarker.markerId,
            position: { textureX: texture.textureX, textureY: texture.textureY }
          });
          draggingMarker.lastTexture = texture;
          // Calibration points update state live so ghost polygons reproject in real time
          if (draggingMarker.markerId.startsWith('calib-')) {
            onMarkerDragRef.current?.(draggingMarker.markerId, texture.textureX, texture.textureY);
          }
        }
      }
    };

    const handlePointerUp = () => {
      if (draggingCorner) {
        if (draggingCorner.lastTexture && onPolygonUpdateRef.current) {
          const polyMarker = markersPluginRef.current?.getMarker(draggingCorner.markerId);
          if (polyMarker && polyMarker.config.polygonPixels) {
            onPolygonUpdateRef.current(draggingCorner.markerId, polyMarker.config.polygonPixels);
          }
        }
        draggingCorner = null;
      } else if (draggingMarker) {
        if (draggingMarker.isDrag && draggingMarker.lastTexture && onMarkerDragEndRef.current) {
          onMarkerDragEndRef.current(
            draggingMarker.markerId, 
            draggingMarker.lastTexture.textureX, 
            draggingMarker.lastTexture.textureY
          );
        }
        draggingMarker = null;
      }
    };

    container.addEventListener('mousemove', blockLeftDrag, { capture: true });
    container.addEventListener('touchmove', blockLeftDrag, { capture: true });
    container.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    
    return () => {
      container.removeEventListener('mousemove', blockLeftDrag, { capture: true });
      container.removeEventListener('touchmove', blockLeftDrag, { capture: true });
      container.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  // Sync annotations to markers
  useEffect(() => {
    if (!markersPluginRef.current || !annotations || !viewerRef.current || !isPanoramaReadyRef.current) return;

    const markers = annotationsToMarkers(annotations);

    const viewer = viewerRef.current;
    if (viewer) {
      markers.forEach(m => {
        if (typeof m.id === 'string' && m.id.startsWith('edit-midpoint-')) {
           const parts = m.id.replace('edit-midpoint-', '').split('-');
           const index = parseInt(parts.pop(), 10);
           const polyId = parts.join('-');

           const poly = annotations.find(a => a.id === polyId);
           if (poly && poly.polygonPixels) {
              const pt1 = poly.polygonPixels[index];
              const pt2 = poly.polygonPixels[(index + 1) % poly.polygonPixels.length];

              const sph1 = viewer.dataHelper.textureCoordsToSphericalCoords({ textureX: pt1[0], textureY: pt1[1] });
              const sph2 = viewer.dataHelper.textureCoordsToSphericalCoords({ textureX: pt2[0], textureY: pt2[1] });

              const v1 = {
                 x: Math.cos(sph1.pitch) * Math.sin(sph1.yaw),
                 y: Math.sin(sph1.pitch),
                 z: -Math.cos(sph1.pitch) * Math.cos(sph1.yaw)
              };
              const v2 = {
                 x: Math.cos(sph2.pitch) * Math.sin(sph2.yaw),
                 y: Math.sin(sph2.pitch),
                 z: -Math.cos(sph2.pitch) * Math.cos(sph2.yaw)
              };

              const midV = {
                 x: (v1.x + v2.x) / 2,
                 y: (v1.y + v2.y) / 2,
                 z: (v1.z + v2.z) / 2
              };
              const len = Math.sqrt(midV.x*midV.x + midV.y*midV.y + midV.z*midV.z);
              midV.x /= len; midV.y /= len; midV.z /= len;

              const midSph = {
                 pitch: Math.asin(midV.y),
                 yaw: Math.atan2(midV.x, -midV.z)
              };
              if (midSph.yaw < 0) midSph.yaw += 2 * Math.PI;

              const midTex = viewer.dataHelper.sphericalCoordsToTextureCoords(midSph);

              if (m.position) {
                 m.position = { textureX: midTex.textureX, textureY: midTex.textureY };
              }
           }
        }
      });
    }

    markersPluginRef.current.setMarkers(markers);
  }, [annotations]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
  );
}

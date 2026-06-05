import { useMemo } from 'react';
import { applyHomography } from '../utils/homography';

export function useDisplayAnnotations({ annotations, selectedId, mode, drawingPolygon, calibrationPoints, calibrationStep, homography }) {
  const modeAdjustedAnnotations = useMemo(() => {
    return annotations.map(ann => {
      if ((ann.type === 'polygon' || ann.type === 'poi') && (ann.panorama_coordinates || ann.blueprint_coordinates)) {
        const coords = mode === 'blueprint'
          ? (ann.blueprint_coordinates || [])
          : (ann.panorama_coordinates || []);
        return { ...ann, polygonPixels: coords };
      }
      return ann;
    });
  }, [annotations, mode]);

  const selectedMarker = useMemo(
    () => modeAdjustedAnnotations.find(a => a.id === selectedId) ?? null,
    [modeAdjustedAnnotations, selectedId]
  );

  const displayAnnotations = useMemo(() => {
    const result = [...modeAdjustedAnnotations];

    if (drawingPolygon.length > 0) {
      result.push({
        id: 'temp-drawing',
        type: 'polyline',
        polylinePixels: [...drawingPolygon, drawingPolygon[drawingPolygon.length - 1]],
        svgStyle: { stroke: '#ff0', strokeWidth: '3', strokeDasharray: '5,5' },
      });
      drawingPolygon.forEach((pt, i) => {
        result.push({
          id: `temp-pt-${i}`,
          type: 'point',
          position: { textureX: pt[0], textureY: pt[1] },
          radius: i === 0 ? 4 : 3,
          svgStyle: { fill: '#ff0' },
        });
      });
    }

    if (selectedMarker?.type === 'polygon' && selectedMarker.polygonPixels) {
      selectedMarker.polygonPixels.forEach((pt, i) => {
        result.push({
          id: `edit-corner-${selectedMarker.id}-${i}`,
          type: 'point',
          position: { textureX: pt[0], textureY: pt[1] },
          radius: 4,
          svgStyle: { fill: '#fff', stroke: '#00f', strokeWidth: '2', cursor: 'grab' },
          tooltip: 'Arrastra para mover esquina',
        });

        const nextPt = selectedMarker.polygonPixels[(i + 1) % selectedMarker.polygonPixels.length];
        let midX = (pt[0] + nextPt[0]) / 2;
        let midY = (pt[1] + nextPt[1]) / 2;
        if (Math.abs(pt[0] - nextPt[0]) > 0.5) {
          midX = (pt[0] + nextPt[0] + 1) / 2;
          if (midX > 1) midX -= 1;
        }

        result.push({
          id: `edit-midpoint-${selectedMarker.id}-${i}`,
          type: 'point',
          position: { textureX: midX, textureY: midY },
          radius: 3,
          svgStyle: { fill: '#fff', stroke: '#0f0', strokeWidth: '2', opacity: 0.8, cursor: 'copy' },
          tooltip: 'Arrastra para añadir punto',
        });
      });
    }

    if (selectedMarker?.type === 'poi' && selectedMarker.polygonPixels) {
      const poiColor = selectedMarker.color ?? '#14b8a6';
      selectedMarker.polygonPixels.forEach((pt, i) => {
        result.push({
          id: `edit-corner-${selectedMarker.id}-${i}`,
          type: 'point',
          position: { textureX: pt[0], textureY: pt[1] },
          radius: 4,
          svgStyle: { fill: '#fff', stroke: poiColor, strokeWidth: '2', cursor: 'grab' },
          tooltip: 'Arrastra para mover esquina',
        });

        const nextPt = selectedMarker.polygonPixels[(i + 1) % selectedMarker.polygonPixels.length];
        let midX = (pt[0] + nextPt[0]) / 2;
        let midY = (pt[1] + nextPt[1]) / 2;
        if (Math.abs(pt[0] - nextPt[0]) > 0.5) {
          midX = (pt[0] + nextPt[0] + 1) / 2;
          if (midX > 1) midX -= 1;
        }

        result.push({
          id: `edit-midpoint-${selectedMarker.id}-${i}`,
          type: 'point',
          position: { textureX: midX, textureY: midY },
          radius: 3,
          svgStyle: { fill: '#fff', stroke: poiColor, strokeWidth: '2', opacity: 0.8, cursor: 'copy' },
          tooltip: 'Arrastra para añadir punto',
        });
      });
    }

    // Ghost polygons: blueprint polygons projected into panorama space via homography.
    // Only shown for polygons that don't yet have panorama_coordinates — once a lot
    // is drawn or imported into panorama, the ghost is no longer needed and would
    // overlap the real polygon, breaking PSV's hit-testing for marker selection.
    if (mode === 'panorama' && homography) {
      annotations.forEach(ann => {
        if ((ann.type !== 'polygon' && ann.type !== 'poi') || ann.pending) return;
        if (!ann.blueprint_coordinates?.length) return;
        if (ann.panorama_coordinates?.length) return; // already has panorama coords — skip ghost

        const projectedPixels = ann.blueprint_coordinates
          .map(([nx, ny]) => applyHomography(homography, [nx, ny]))
          .filter(([tx, ty]) => Number.isFinite(tx) && Number.isFinite(ty));

        if (projectedPixels.length < 3) return;

        result.push({
          id: `ghost-${ann.id}`,
          type: 'polygon-ghost',
          polygonPixels: projectedPixels,
          tooltip: ann.tooltip ? `${ann.tooltip} (blueprint)` : undefined,
        });
      });
    }

    // Calibration connection line (closed) — links the calib points in order so
    // their layout/straightness is easier to judge. Display-only, non-interactive.
    if (calibrationPoints?.length >= 2) {
      const linkPts = calibrationPoints
        .map(p => (mode === 'blueprint' ? p.blueprint : p.panorama))
        .filter(Boolean);
      if (linkPts.length >= 2) {
        // Order points by angle around their centroid so the closed line forms a
        // simple (non-self-intersecting) polygon regardless of creation order.
        const cx = linkPts.reduce((s, p) => s + p[0], 0) / linkPts.length;
        const cy = linkPts.reduce((s, p) => s + p[1], 0) / linkPts.length;
        const ordered = [...linkPts].sort(
          (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx)
        );
        result.push({
          id: 'calib-link',
          type: 'calibration-link',
          polylinePixels: [...ordered, ordered[0]],
        });
      }
    }

    // Calibration point markers (numbered circles, per-mode)
    if (calibrationPoints?.length > 0) {
      calibrationPoints.forEach((pair, i) => {
        const coord = mode === 'blueprint' ? pair.blueprint : pair.panorama;
        if (!coord) return;
        result.push({
          id: `calib-pt-${i}`,
          type: 'calibration-point',
          position: { textureX: coord[0], textureY: coord[1] },
          label: String(i + 1),
          radius: 7,
          // Blue for blueprint markers, orange for panorama markers
          svgStyle: {
            fill: mode === 'blueprint' ? '#3b82f6' : '#f59e0b',
            stroke: '#fff',
            strokeWidth: '2',
          },
        });
      });
    }

    // Pending blueprint point (waiting for panorama click) — only shown in blueprint mode
    if (calibrationStep?.pendingBlueprint && mode === 'blueprint') {
      result.push({
        id: 'calib-pending',
        type: 'calibration-point',
        position: {
          textureX: calibrationStep.pendingBlueprint[0],
          textureY: calibrationStep.pendingBlueprint[1],
        },
        label: String((calibrationPoints?.length ?? 0) + 1),
        radius: 7,
        svgStyle: { fill: '#3b82f6', stroke: '#fff', strokeWidth: '2', opacity: 0.5 },
      });
    }

    return result;
  }, [modeAdjustedAnnotations, selectedMarker, drawingPolygon, calibrationPoints, calibrationStep, mode, homography, annotations]);

  return { displayAnnotations, selectedMarker };
}

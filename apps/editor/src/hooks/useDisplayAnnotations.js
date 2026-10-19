import { useMemo } from 'react';
import { projectPolygonDense } from '../utils/projection';
import { isShape, toModeAnnotation } from '../utils/annotationModel';
import { sphericalMidpoint } from '../utils/spherical';
import {
  MARKER_ID, calibPendingId, calibPointId, editCornerId, editMidpointId, ghostId, tempPointId,
} from '../utils/markerIds';

/** Anotaciones visibles en la vista `mode`, con la geometría de esa vista. */
export function toModeAnnotations(annotations, mode) {
  return annotations
    .filter(ann => mode !== 'blueprint' || (ann.type !== 'poi' && ann.type !== 'text'))
    .map(ann => toModeAnnotation(ann, mode));
}

export const planarMidpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * Cómo se calcula el punto medio de una arista en cada vista: en el plano es
 * el promedio; en el panorama, el punto medio del arco sobre la esfera (lo
 * que PSV pinta como recta, y cruza la costura por el lado corto). Sin las
 * dimensiones del panorama, promedio.
 */
export const midpointFnFor = (mode, panoramaDimensions) => (
  mode === 'blueprint' || !panoramaDimensions
    ? planarMidpoint
    : (a, b) => sphericalMidpoint(a, b, panoramaDimensions)
);

/** Posición del punto medio de cada arista (la última cierra contra el primer vértice). */
export const edgeMidpoints = (points, midpointOf = planarMidpoint) => (
  points.map((pt, i) => midpointOf(pt, points[(i + 1) % points.length]))
);

/**
 * Esquinas (arrastrables) y puntos medios (arrastrar = insertar vértice) de
 * la forma seleccionada.
 */
export function buildVertexHandles(marker, midpointOf = planarMidpoint) {
  const points = marker.polygonPixels;
  if (!points?.length) return [];
  const stroke = marker.type === 'poi' ? (marker.color ?? '#14b8a6') : '#00f';
  const midpointStroke = marker.type === 'poi' ? stroke : '#0f0';
  const midpoints = edgeMidpoints(points, midpointOf);

  return points.flatMap((pt, i) => {
    const [midX, midY] = midpoints[i];
    return [
      {
        id: editCornerId(marker.id, i),
        type: 'point',
        position: { textureX: pt[0], textureY: pt[1] },
        radius: 4,
        svgStyle: { fill: '#fff', stroke, strokeWidth: '2', cursor: 'grab' },
        tooltip: 'Arrastra para mover esquina',
      },
      {
        id: editMidpointId(marker.id, i),
        type: 'point',
        position: { textureX: midX, textureY: midY },
        radius: 3,
        svgStyle: { fill: '#fff', stroke: midpointStroke, strokeWidth: '2', opacity: 0.8, cursor: 'copy' },
        tooltip: 'Arrastra para añadir punto',
      },
    ];
  });
}

/** Línea punteada + puntos del polígono que se está dibujando. */
export function buildDrawingMarkers(drawingPolygon) {
  if (!drawingPolygon.length) return [];
  return [
    {
      id: MARKER_ID.tempDrawing,
      type: 'polyline',
      polylinePixels: [...drawingPolygon, drawingPolygon[drawingPolygon.length - 1]],
      svgStyle: { stroke: '#ffa500', strokeWidth: '3', strokeDasharray: '5,5' },
    },
    ...drawingPolygon.map((pt, i) => ({
      id: tempPointId(i),
      type: 'point',
      position: { textureX: pt[0], textureY: pt[1] },
      radius: i === 0 ? 4 : 3,
      svgStyle: { fill: '#ffa500' },
    })),
  ];
}

/**
 * Fantasmas: formas del plano proyectadas al panorama vía la calibración.
 * Solo para las que todavía no tienen geometría en el panorama — una vez que
 * la tienen, el fantasma se superpondría al polígono real y rompería el
 * hit-testing de PSV para seleccionarlo.
 */
export function buildGhostMarkers(annotations, homography) {
  if (!homography) return [];
  return annotations.flatMap(ann => {
    if (!isShape(ann) || ann.pending) return [];
    if (!ann.blueprint_coordinates?.length || ann.panorama_coordinates?.length) return [];
    const projectedPixels = projectPolygonDense(ann.blueprint_coordinates, homography);
    if (!projectedPixels || projectedPixels.length < 3) return [];
    return [{
      id: ghostId(ann.id),
      type: 'polygon-ghost',
      polygonPixels: projectedPixels,
      tooltip: ann.tooltip ? `${ann.tooltip} (blueprint)` : undefined,
    }];
  });
}

/** Puntos de calibración numerados + la línea cerrada que los une (solo display). */
export function buildCalibrationMarkers(calibrationPoints = [], pendingBlueprintPoints = [], mode) {
  const space = mode === 'blueprint' ? 'blueprint' : 'panorama';
  const result = [];

  const linkPts = calibrationPoints.map(p => p[space]).filter(Boolean);
  if (linkPts.length >= 2) {
    // Ordenados por ángulo alrededor del centroide para que la línea cerrada
    // sea un polígono simple sin importar el orden de creación.
    const cx = linkPts.reduce((s, p) => s + p[0], 0) / linkPts.length;
    const cy = linkPts.reduce((s, p) => s + p[1], 0) / linkPts.length;
    const ordered = [...linkPts].sort(
      (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx)
    );
    result.push({ id: MARKER_ID.calibLink, type: 'calibration-link', polylinePixels: [...ordered, ordered[0]] });
  }

  calibrationPoints.forEach((pair, i) => {
    const coord = pair[space];
    if (!coord) return;
    result.push({
      id: calibPointId(pair._id),
      type: 'calibration-point',
      position: { textureX: coord[0], textureY: coord[1] },
      label: String(i + 1),
      radius: 7,
      // Azul en el plano, naranja en el panorama
      svgStyle: { fill: space === 'blueprint' ? '#3b82f6' : '#f59e0b', stroke: '#fff', strokeWidth: '2' },
    });
  });

  // Puntos del plano en cola esperando su par en el panorama — solo en el
  // plano, numerados a continuación de los pares ya completos.
  if (space === 'blueprint') {
    pendingBlueprintPoints.forEach((pt, i) => {
      result.push({
        id: calibPendingId(i),
        type: 'calibration-point',
        position: { textureX: pt[0], textureY: pt[1] },
        label: String(calibrationPoints.length + i + 1),
        radius: 7,
        svgStyle: { fill: '#3b82f6', stroke: '#fff', strokeWidth: '2', opacity: 0.5 },
      });
    });
  }
  return result;
}

/**
 * Saca las capas ocultas desde el panel de Contenido (`hiddenTypes`:
 * { polygon, poi, text }). El seleccionado se sigue viendo aunque su capa
 * esté oculta, para poder terminar de editarlo.
 */
export const withoutHiddenLayers = (annotations, hiddenTypes, selectedId) => (
  annotations.filter(ann => !hiddenTypes?.[ann.type] || ann.id === selectedId)
);

export function useDisplayAnnotations({
  annotations, selectedId, mode, drawingPolygon, calibrationPoints, pendingBlueprintPoints, homography, panoramaDimensions,
  hiddenTypes,
}) {
  const modeAnnotations = useMemo(() => toModeAnnotations(annotations, mode), [annotations, mode]);

  const selectedMarker = useMemo(
    () => modeAnnotations.find(a => a.id === selectedId) ?? null,
    [modeAnnotations, selectedId]
  );

  const displayAnnotations = useMemo(() => [
    ...withoutHiddenLayers(modeAnnotations, hiddenTypes, selectedId),
    ...buildDrawingMarkers(drawingPolygon),
    ...(isShape(selectedMarker) ? buildVertexHandles(selectedMarker, midpointFnFor(mode, panoramaDimensions)) : []),
    ...(mode === 'panorama' ? buildGhostMarkers(withoutHiddenLayers(annotations, hiddenTypes, selectedId), homography) : []),
    ...buildCalibrationMarkers(calibrationPoints, pendingBlueprintPoints, mode),
  ], [modeAnnotations, selectedMarker, selectedId, hiddenTypes, drawingPolygon, calibrationPoints, pendingBlueprintPoints, mode, homography, annotations, panoramaDimensions]);

  return { displayAnnotations, selectedMarker };
}

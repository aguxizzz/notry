import { buildNormalizedBorders } from './normalizeLotBorders.js';

/**
 * Convierte anotaciones del contrato del backend al formato MarkerConfig del MarkersPlugin.
 * Soporta coordenadas en píxeles (textureX, textureY, polygonPixels, polylinePixels).
 * Para polígonos de lotes, normaliza bordes compartidos para evitar duplicación visual.
 *
 * @param {BackendAnnotation[]} annotations - Lista de anotaciones del API
 * @param {number} [snapThreshold=5] - Threshold en píxeles para snapping de vértices
 * @returns {import('@photo-sphere-viewer/markers-plugin').MarkerConfig[]}
 */
export function annotationsToMarkers(annotations, snapThreshold = 5) {
  if (!Array.isArray(annotations)) return [];

  // Pre-compute border normalization for all polygon annotations
  const polygonAnns = annotations.filter(
    (a) =>
      a.type === 'polygon' &&
      (a.panorama_coordinates ?? a.polygonPixels ?? a.polygon)?.length >= 3
  );
  const borderData = buildNormalizedBorders(polygonAnns, snapThreshold);

  return annotations.flatMap((ann) => {
    // No pasamos content al plugin para que no abra su propio panel; el contenido se muestra en nuestro panel lateral.
    const base = {
      id: ann.uuid ?? ann.id,
      tooltip: ann.tooltip ?? null,
      visible: ann.visible !== false,
      ...(ann.svgStyle && { svgStyle: ann.svgStyle }),
      ...(ann.style && { style: ann.style }),
    };

    switch (ann.type) {
      case 'rectangle': {
        const position = ann.position && ('textureX' in ann.position || 'textureY' in ann.position)
          ? { textureX: ann.position.textureX, textureY: ann.position.textureY }
          : undefined;
        const size = ann.size ?? { width: 40, height: 30 };
        return {
          ...base,
          rect: Array.isArray(size) ? size : [size.width, size.height],
          position,
        };
      }

      case 'polygon': {
        const points = ann.panorama_coordinates ?? ann.polygonPixels ?? ann.polygon ?? [];
        if (points.length < 3) return []; // Skip invalid polygons

        const statusKey = ann.status ?? ann.estado;
        const statusStyles = {
          available: { fill: 'rgba(34,197,94,0.08)',  stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeDasharray: '12 6', strokeLinecap: 'round' },
          sold:      { fill: 'rgba(239,68,68,0.08)',   stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeDasharray: '12 6', strokeLinecap: 'round' },
          reserved:  { fill: 'rgba(59,130,246,0.08)',  stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeDasharray: '12 6', strokeLinecap: 'round' },
        };
        const fillStyle = statusKey && statusStyles[statusKey]
          ? statusStyles[statusKey]
          : { fill: 'rgba(0,100,255,0.08)', stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeDasharray: '12 6', strokeLinecap: 'round' };

        const annId = ann.uuid ?? ann.id;
        const polyData = borderData.get(annId);

        // Fill marker uses snapped coordinates so it aligns with the border
        const fillMarker = {
          ...base,
          polygonPixels: polyData?.snappedPoints ?? points,
          svgStyle: {
            fill: fillStyle.fill,
            stroke: 'none',
            pointerEvents: 'fill',
          },
          tooltip: null,
        };

        // Border markers: one multi-point polyline per chain of consecutive edges
        const borderMarkers = (polyData?.chains ?? []).map((chain, i) => ({
          id: `${annId}__border__${i}`,
          visible: ann.visible !== false,
          polylinePixels: chain,
          svgStyle: {
            stroke: fillStyle.stroke,
            strokeWidth: fillStyle.strokeWidth ?? '1.5',
            strokeDasharray: fillStyle.strokeDasharray,
            strokeLinecap: fillStyle.strokeLinecap,
            strokeLinejoin: 'round',
            fill: 'none',
            pointerEvents: 'none',
          },
          tooltip: null,
        }));

        return [fillMarker, ...borderMarkers];
      }

      case 'polyline': {
        const points = ann.polylinePixels ?? ann.polyline ?? [];
        return {
          ...base,
          polylinePixels: points,
        };
      }

      case 'circle': {
        const position = ann.position && ('textureX' in ann.position || 'textureY' in ann.position)
          ? { textureX: ann.position.textureX, textureY: ann.position.textureY }
          : undefined;
        return {
          ...base,
          circle: ann.radius ?? 10,
          position,
        };
      }

      case 'text': {
        const position = ann.position && ('textureX' in ann.position || 'textureY' in ann.position)
          ? { textureX: ann.position.textureX, textureY: ann.position.textureY }
          : undefined;

        let generatedHtml = ann.html ?? '';
        if (!generatedHtml) {
          const displayContent = ann.tooltip || '&nbsp;';
          const hexBg = ann.bgColor || '#ffffff';
          const bgOpa = ann.bgOpacity !== undefined ? ann.bgOpacity : 0.5;
          const rgbaBg = hexBg.length === 7 ? `rgba(${parseInt(hexBg.slice(1,3),16)}, ${parseInt(hexBg.slice(3,5),16)}, ${parseInt(hexBg.slice(5,7),16)}, ${bgOpa})` : hexBg;
          const textColor = ann.textColor || '#000000';
          const fontSize = ann.fontSize ?? 14;
          generatedHtml = `<div style='background:${rgbaBg};padding:5px;border-radius:4px;color:${textColor};white-space:nowrap;text-align:center;font-family:"Oswald",sans-serif;font-weight:600;font-size:${fontSize}px;'>${displayContent}</div>`;
        }

        return {
          ...base,
          tooltip: null, // Sin tooltip del plugin: con pointer-events none parpadea; solo usamos nuestro hover (brightness).
          html: generatedHtml,
          ...(ann.size ? { size: ann.size } : {}),
          position,
          style: { ...(ann.style || {}), pointerEvents: 'none' },
        };
      }

      case 'point': {
        const position = ann.position && ('textureX' in ann.position || 'textureY' in ann.position)
          ? { textureX: ann.position.textureX, textureY: ann.position.textureY }
          : undefined;
        return {
          ...base,
          circle: ann.radius ?? 8,
          position,
        };
      }

      default:
        return { ...base, circle: 5, position: { textureX: 0, textureY: 0 } };
    }
  }).filter((m) => {
    if (m.position === undefined && !m.polygonPixels?.length && !m.polylinePixels?.length) return false;
    return true;
  });
}

/**
 * @typedef {Object} BackendAnnotation
 * @property {string} id
 * @property {string} type - 'rectangle' | 'polygon' | 'polyline' | 'circle' | 'text' | 'point'
 * @property {{ textureX: number, textureY: number } | { yaw: number, pitch: number }} [position]
 * @property {{ width: number, height: number }} [size]
 * @property {[number, number][]} [polygonPixels]
 * @property {[number, number][]} [polylinePixels]
 * @property {[number, number][]} [polygon]
 * @property {[number, number][]} [polyline]
 * @property {string} [html]
 * @property {string} [tooltip]
 * @property {Record<string, string>} [style]
 * @property {Record<string, string>} [svgStyle]
 * @property {number} [radius]
 * @property {boolean} [visible]
 * @property {string} [content]
 */

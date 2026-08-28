import { buildNormalizedBorders } from './normalizeLotBorders.js';
import { POI_ICON_MARKERS } from './icons/poiIcons.js';

/**
 * Builds an HTML string for a POI icon overlay marker.
 * Renders a colored circle with the icon path centered inside.
 */
function getPoiIconSvg(iconType, iconColor, bgColor) {
  const path = POI_ICON_MARKERS[iconType];
  if (!path) return '';
  return `<svg viewBox="0 0 72 72" style="overflow:visible" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="32" fill="${bgColor}" opacity="0.95"/>
    <circle cx="36" cy="36" r="32" fill="none" stroke="white" stroke-width="3"/>
    <g transform="translate(20, 20)" style="color:${iconColor}">
      <svg viewBox="0 0 24 24" width="32" height="32" style="display:block">
        <path d="${path}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </g>
  </svg>`;
}

const POI_PHOTO_CHIP_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2.4" stroke="#8e7343" stroke-width="1.7"/><circle cx="12" cy="13" r="3.4" stroke="#8e7343" stroke-width="1.7"/><path d="M8 6l1.2-2h5.6L16 6" stroke="#8e7343" stroke-width="1.7" stroke-linejoin="round"/></svg>`;

function getPoiMarkerElement(title, stemHeight, hasPhoto) {
  const safeTitle = String(title || (hasPhoto ? 'Ver foto' : 'Lugar')).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const height = Math.max(40, Math.min(260, Number(stemHeight) || 96));
  const element = document.createElement('div');
  element.className = hasPhoto ? 'poi-callout poi-callout--photo' : 'poi-callout';
  element.style.setProperty('--poi-callout-stem', `${height}px`);
  element.innerHTML = `${hasPhoto ? `<span class="poi-callout__chip">${POI_PHOTO_CHIP_ICON}</span>` : ''}<span class="poi-callout__stem"></span><span class="poi-callout__dot"></span><span class="poi-callout__title">${safeTitle}</span>`;

  let previousFontSize = null;
  let previousMarkerScale = null;
  element.updateMarker = ({ zoomLevel }) => {
    const normalizedZoom = Math.max(0, Math.min(1, zoomLevel / 100));
    const markerScale = 0.5 + normalizedZoom ** 2;
    // Compensate PSV's marker scale without letting the label dominate the
    // panorama at full zoom-out. Preserve the current 16.5px zoom-in size and
    // add only a subtle boost as the camera moves away.
    const zoomOutBoost = 0.7 * (1 - normalizedZoom) ** 2;
    const visibleFontSize = 16.5 + zoomOutBoost;
    const fontSize = `${(visibleFontSize / markerScale).toFixed(2)}px`;
    if (fontSize !== previousFontSize) {
      element.style.setProperty('--poi-callout-font-size', fontSize);
      previousFontSize = fontSize;
    }
    // El chip, el punto y la guía no tienen su propia compensación de tamaño
    // de texto: sin esto, PSV los encoge junto con el marcador entero al
    // alejar la cámara y quedan chicos al lado del título (que sí se mantiene
    // legible). Exponemos la escala para que el CSS los agrande en la misma
    // proporción y su tamaño en pantalla se mantenga constante.
    const markerScaleStr = markerScale.toFixed(3);
    if (markerScaleStr !== previousMarkerScale) {
      element.style.setProperty('--poi-callout-marker-scale', markerScaleStr);
      previousMarkerScale = markerScaleStr;
    }
  };
  return element;
}

/**
 * Convierte anotaciones del contrato del backend al formato MarkerConfig del MarkersPlugin.
 * Soporta coordenadas en píxeles (textureX, textureY, polygonPixels, polylinePixels).
 * Para polígonos de lotes, normaliza bordes compartidos para evitar duplicación visual.
 *
 * @param {BackendAnnotation[]} annotations - Lista de anotaciones del API
 * @param {number} [snapThreshold=5] - Threshold en píxeles para snapping de vértices
 * @returns {import('@photo-sphere-viewer/markers-plugin').MarkerConfig[]}
 */
export function annotationsToMarkers(annotations, snapThreshold = 5, recommendedIds = null, focusMode = false) {
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

      case 'poi': {
        if (ann.image_url) {
          const anchor = ann.panorama_anchor ?? ann.panorama_coordinates?.[0];
          if (!anchor) return [];
          return {
            ...base,
            element: getPoiMarkerElement(ann.tooltip, ann.callout_stem_height, true),
            position: { textureX: anchor[0], textureY: anchor[1] },
            size: { width: 230, height: Math.max(40, Math.min(260, Number(ann.callout_stem_height) || 96)) },
            anchor: 'bottom center',
            // Compensa la variación visual que produce el zoom del panorama.
            // Es la misma curva que usan los iconos de POIs existentes.
            scale: [0.5, 1.5],
            hoverScale: false,
            tooltip: null,
            className: 'psv-marker--poi-photo',
          };
        }
        if (ann.variant === 'callout' || ann.marker_variant === 'callout') {
          const anchor = ann.panorama_anchor ?? ann.panorama_coordinates?.[0];
          if (!anchor) return [];
          return {
            ...base,
            element: getPoiMarkerElement(ann.tooltip, ann.callout_stem_height, false),
            position: { textureX: anchor[0], textureY: anchor[1] },
            size: { width: 230, height: Math.max(40, Math.min(260, Number(ann.callout_stem_height) || 96)) },
            anchor: 'bottom center',
            // Compensa la variación visual que produce el zoom del panorama.
            // Es la misma curva que usan los iconos de POIs existentes.
            scale: [0.5, 1.5],
            hoverScale: false,
            tooltip: null,
            className: 'psv-marker--poi-callout',
          };
        }
        const points = ann.panorama_coordinates ?? ann.polygonPixels ?? ann.polygon ?? [];
        if (points.length < 3) return [];

        const poiColor = ann.color ?? '#14b8a6';
        const fillStyle = {
          fill: `${poiColor}22`,
          stroke: poiColor,
          strokeWidth: '1.5',
          strokeDasharray: '8 4',
          strokeLinecap: 'round',
        };

        const polygonMarker = {
          ...base,
          polygonPixels: points,
          svgStyle: fillStyle,
          tooltip: ann.tooltip ?? null,
        };

        // Icon overlay at centroid — only if icon_type is present
        if (ann.icon_type) {
          const cx = points.reduce((s, [x]) => s + x, 0) / points.length;
          const cy = points.reduce((s, [, y]) => s + y, 0) / points.length;
          const iconSize = 72;
          const r = iconSize / 2;
          const iconSvg = getPoiIconSvg(ann.icon_type, '#ffffff', poiColor);
          return [
            polygonMarker,
            {
              id: `${ann.uuid ?? ann.id}__icon`,
              visible: ann.visible !== false,
              html: iconSvg,
              position: { textureX: cx, textureY: cy },
              size: { width: iconSize, height: iconSize },
              anchor: 'center',
              tooltip: null,
              scale: [0.5, 1.5],
            },
          ];
        }

        return [polygonMarker];
      }

      case 'polygon': {
        const points = ann.panorama_coordinates ?? ann.polygonPixels ?? ann.polygon ?? [];
        if (points.length < 3) return []; // Skip invalid polygons

        const statusKey = ann.status ?? ann.estado;
        const statusStyles = {
          available: { fill: 'rgba(34,197,94,0.16)',  stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeLinecap: 'butt' },
          unavailable: { fill: 'rgba(107,114,128,0.28)', stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeLinecap: 'butt' },
          sold:      { fill: 'rgba(239,68,68,0.18)',  stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeLinecap: 'butt' },
          reserved:  { fill: 'rgba(59,130,246,0.24)', stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeLinecap: 'butt' },
        };
        const fillStyle = statusKey && statusStyles[statusKey]
          ? statusStyles[statusKey]
          : { fill: 'rgba(0,100,255,0.08)', stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeLinecap: 'butt' };

        const annId = ann.uuid ?? ann.id;
        const polyData = borderData.get(annId);
        const isRecommended = Boolean(recommendedIds?.has(annId));
        // "Modo foco": con recomendados presentes, todo lo demás se apaga a
        // gris (sigue siendo clickeable, solo pierde el color de estado).
        const isMuted = Boolean(focusMode) && !isRecommended && (recommendedIds?.size ?? 0) > 0;
        const extraClass = isRecommended ? ' psv-marker--lot-recommended' : isMuted ? ' psv-marker--lot-muted' : '';

        const resolvedFill = isRecommended ? 'rgba(197,160,89,0.42)' : isMuted ? 'rgba(160,160,160,0.20)' : fillStyle.fill;
        const resolvedStroke = isMuted ? 'rgba(255,255,255,0.6)' : fillStyle.stroke;
        const resolvedStrokeWidth = isMuted ? '1.5' : (fillStyle.strokeWidth ?? '1.5');

        // Fill marker uses snapped coordinates so it aligns with the border
        const fillMarker = {
          ...base,
          className: `psv-marker--lot psv-marker--lot-${statusKey || 'default'}${extraClass}`,
          polygonPixels: polyData?.snappedPoints ?? points,
          svgStyle: {
            fill: resolvedFill,
            stroke: 'none',
            pointerEvents: 'fill',
          },
          tooltip: null,
        };

        // Border markers: one multi-point polyline per chain of consecutive edges
        const borderMarkers = (polyData?.chains ?? []).map((chain, i) => ({
          id: `${annId}__border__${i}`,
          visible: ann.visible !== false,
          className: `psv-marker--lot psv-marker--lot-${statusKey || 'default'} psv-marker--lot-border${extraClass}`,
          polylinePixels: chain,
          svgStyle: { stroke: resolvedStroke, strokeWidth: resolvedStrokeWidth, strokeLinecap: fillStyle.strokeLinecap, strokeLinejoin: 'miter', fill: 'none', pointerEvents: 'none' },
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

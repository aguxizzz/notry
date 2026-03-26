/**
 * Convierte anotaciones del contrato del backend al formato MarkerConfig del MarkersPlugin.
 * Soporta coordenadas en píxeles (textureX, textureY, polygonPixels, polylinePixels).
 *
 * @param {BackendAnnotation[]} annotations - Lista de anotaciones del API
 * @returns {import('@photo-sphere-viewer/markers-plugin').MarkerConfig[]}
 */
export function annotationsToMarkers(annotations) {
  if (!Array.isArray(annotations)) return [];

  return annotations.map((ann) => {
    // No pasamos content al plugin para que no abra su propio panel; el contenido se muestra en nuestro panel lateral.
    const base = {
      id: ann.id,
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
        const points = ann.polygonPixels ?? ann.polygon ?? [];
        return {
          ...base,
          tooltip: null, // suppress the cursor tooltip; interaction is handled by our panel
          polygonPixels: points,
        };
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
          generatedHtml = `<div style='background:${rgbaBg};padding:5px;border-radius:4px;color:${textColor};min-width:20px;min-height:20px;font-family:"Anton SC",sans-serif;font-size:${fontSize}px;'>${displayContent}</div>`;
        }

        return {
          ...base,
          tooltip: null, // Sin tooltip del plugin: con pointer-events none parpadea; solo usamos nuestro hover (brightness).
          html: generatedHtml,
          size: ann.size ?? { width: 120, height: 30 },
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

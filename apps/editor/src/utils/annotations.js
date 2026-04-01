export function annotationsToMarkers(annotations) {
  if (!Array.isArray(annotations)) return [];

  return annotations.map((ann) => {
    if (!ann || typeof ann !== 'object') return null;
    const base = {
      id: ann.id ?? ann.uuid,
      tooltip: ann.tooltip ?? null,
      visible: ann.visible !== false,
      ...(ann.svgStyle && { svgStyle: ann.svgStyle }),
      ...(ann.style && { style: ann.style }),
      ...(ann.className && { className: ann.className }),
    };

    if (ann.fillColor) {
      base.svgStyle = {
        ...(base.svgStyle || {}),
        fill: ann.fillColor,
        fillOpacity: ann.fillOpacity !== undefined ? ann.fillOpacity : 0.5,
        stroke: ann.fillColor,
        strokeWidth: '2'
      };
    }

    switch (ann.type) {
      case 'rectangle': {
        const position = ann.position && ('textureX' in ann.position || 'textureY' in ann.position)
          ? { textureX: ann.position.textureX, textureY: ann.position.textureY }
          : undefined;
        const size = ann.size ?? { width: 40, height: 30 };
        return { ...base, rect: Array.isArray(size) ? size : [size.width, size.height], position };
      }
      case 'polygon': {
        const points = (ann.polygonPixels ?? ann.polygon ?? []).filter(
          pt => Array.isArray(pt) && pt.length === 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number'
        );
        const estadoStyles = {
          available: { fill: 'rgba(34,197,94,0.15)',  stroke: 'rgba(22,163,74,0.5)',  strokeWidth: '2' },
          sold:      { fill: 'rgba(239,68,68,0.25)',   stroke: 'rgba(220,38,38,0.7)',  strokeWidth: '2' },
          reserved:  { fill: 'rgba(59,130,246,0.22)',  stroke: 'rgba(37,99,235,0.65)', strokeWidth: '2' },
        };
        const svgStyle = ann.estado && estadoStyles[ann.estado]
          ? estadoStyles[ann.estado]
          : (ann.svgStyle ?? {});
        return { ...base, svgStyle, polygonPixels: points };
      }
      case 'polyline': {
        const points = (ann.polylinePixels ?? ann.polyline ?? []).filter(
          pt => Array.isArray(pt) && pt.length === 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number'
        );
        return { ...base, polylinePixels: points };
      }
      case 'circle': {
        const position = ann.position && ('textureX' in ann.position || 'textureY' in ann.position)
          ? { textureX: ann.position.textureX, textureY: ann.position.textureY }
          : undefined;
        return { ...base, circle: ann.radius ?? 10, position };
      }
      case 'text': {
        const position = ann.position && ('textureX' in ann.position || 'textureY' in ann.position)
          ? { textureX: ann.position.textureX, textureY: ann.position.textureY }
          : undefined;
        const displayContent = ann.tooltip || '&nbsp;';

        // Interpretar opacidad (HEX a RGBA opcional para fondo)
        const hexBg = ann.bgColor || '#ffffff';
        const bgOpa = ann.bgOpacity !== undefined ? ann.bgOpacity : 1;
        const rgbaBg = hexBg.length === 7 ? `rgba(${parseInt(hexBg.slice(1,3),16)}, ${parseInt(hexBg.slice(3,5),16)}, ${parseInt(hexBg.slice(5,7),16)}, ${bgOpa})` : hexBg;

        const textColor = ann.textColor || '#000000';
        const fontSize = ann.fontSize ?? 14;
        const generatedHtml = `<div style='background:${rgbaBg};padding:5px;border-radius:4px;color:${textColor};white-space:nowrap;text-align:center;font-family:"Oswald",sans-serif;font-weight:600;font-size:${fontSize}px;'>${displayContent}</div>`;
        return {
          ...base,
          html: generatedHtml,
          ...(ann.size ? { size: ann.size } : {}),
          position,
          style: { ...(ann.style || {}), cursor: 'pointer' },
        };
      }
      case 'point': {
        const position = ann.position && ('textureX' in ann.position || 'textureY' in ann.position)
          ? { textureX: ann.position.textureX, textureY: ann.position.textureY }
          : undefined;
        return { ...base, circle: ann.radius ?? 8, position };
      }
      default:
        return { ...base, circle: 5, position: { textureX: 0, textureY: 0 } };
    }
  }).filter((m) => {
    if (!m) return false;
    if (!m.id) return false;
    if (m.polygonPixels !== undefined && m.polygonPixels.length < 3) return false;
    if (m.position === undefined && !m.polygonPixels?.length && !m.polylinePixels?.length) return false;
    return true;
  });
}

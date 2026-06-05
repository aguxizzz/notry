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
        const statusKey = ann.status ?? ann.estado;
        const estadoStyles = {
          available: { fill: 'rgba(34,197,94,0.15)',  stroke: 'rgba(22,163,74,0.5)',  strokeWidth: '2' },
          sold:      { fill: 'rgba(239,68,68,0.25)',   stroke: 'rgba(220,38,38,0.7)',  strokeWidth: '2' },
          reserved:  { fill: 'rgba(59,130,246,0.22)',  stroke: 'rgba(37,99,235,0.65)', strokeWidth: '2' },
        };
        const svgStyle = !ann.pending && statusKey && estadoStyles[statusKey]
          ? estadoStyles[statusKey]
          : (ann.svgStyle ?? {});
        return { ...base, svgStyle, polygonPixels: points };
      }
      case 'poi': {
        const points = (ann.polygonPixels ?? ann.polygon ?? []).filter(
          pt => Array.isArray(pt) && pt.length === 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number'
        );
        // POIs use a custom color field; fall back to a teal default
        const poiColor = ann.color ?? '#14b8a6';
        const svgStyle = {
          fill: `${poiColor}33`,
          stroke: poiColor,
          strokeWidth: '2',
        };
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
        const generatedHtml = `<div style='background:${rgbaBg};padding:5px;border-radius:4px;color:${textColor};white-space:nowrap;text-align:center;font-family:var(--font-body),system-ui,sans-serif;font-weight:600;font-size:${fontSize}px;'>${displayContent}</div>`;
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
      case 'polygon-ghost': {
        const points = (ann.polygonPixels ?? []).filter(
          pt => Array.isArray(pt) && pt.length === 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number'
        );
        return {
          ...base,
          svgStyle: {
            fill: 'rgba(255,200,0,0.08)',
            stroke: 'rgba(255,200,0,0.5)',
            strokeWidth: '1.5',
            strokeDasharray: '6,3',
            pointerEvents: 'none',
          },
          polygonPixels: points,
        };
      }
      case 'calibration-link': {
        const points = (ann.polylinePixels ?? []).filter(
          pt => Array.isArray(pt) && pt.length === 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number'
        );
        return {
          ...base,
          polylinePixels: points,
          svgStyle: {
            fill: 'none',
            stroke: 'rgba(245,158,11,0.5)',
            strokeWidth: '2',
            strokeDasharray: '6,4',
            pointerEvents: 'none',
          },
        };
      }
      case 'calibration-point': {
        const position = ann.position && ('textureX' in ann.position || 'textureY' in ann.position)
          ? { textureX: ann.position.textureX, textureY: ann.position.textureY }
          : undefined;
        const color = ann.svgStyle?.fill ?? '#3b82f6';
        const opacity = ann.svgStyle?.opacity ?? 1;
        const html = `<div style="
          width:20px;height:20px;border-radius:50%;
          background:${color};border:2px solid #fff;
          display:flex;align-items:center;justify-content:center;
          font-size:10px;font-weight:700;color:#fff;
          box-shadow:0 1px 4px rgba(0,0,0,0.5);
          opacity:${opacity};
        ">${ann.label ?? ''}</div>`;
        return { ...base, html, size: { width: 20, height: 20 }, position, style: { cursor: 'grab' } };
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

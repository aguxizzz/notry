import { HIGHLIGHT_SVG_STYLE, getLotSvgStyle } from './lotStyles.js';
import { isCallout } from './annotationModel.js';

const POI_PHOTO_CHIP_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2.4" stroke="#8e7343" stroke-width="1.7"/><circle cx="12" cy="13" r="3.4" stroke="#8e7343" stroke-width="1.7"/><path d="M8 6l1.2-2h5.6L16 6" stroke="#8e7343" stroke-width="1.7" stroke-linejoin="round"/></svg>`;

const escapeHtml = value => String(value).replace(
  /[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
);

const sanitizeHexColor = (value, fallback) => (
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback
);

const clampNumber = (value, fallback, min, max) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(min, Math.min(max, numericValue))
    : fallback;
};

// Ported from apps/visor/src/annotations.js — keeps the editor's panorama
// preview of a callout POI in sync with how it actually renders in the
// public viewer (stem + title label, optional photo chip).
function getPoiMarkerElement(title, stemHeight, hasPhoto, color) {
  const safeTitle = escapeHtml(title || (hasPhoto ? 'Ver foto' : 'Lugar'));
  const height = Math.max(40, Math.min(260, Number(stemHeight) || 96));
  const element = document.createElement('div');
  element.className = hasPhoto ? 'poi-callout poi-callout--photo' : 'poi-callout';
  element.style.setProperty('--poi-callout-stem', `${height}px`);
  element.style.setProperty('--poi-callout-color', sanitizeHexColor(color, '#ffffff'));
  element.innerHTML = `${hasPhoto ? `<span class="poi-callout__chip">${POI_PHOTO_CHIP_ICON}</span>` : ''}<span class="poi-callout__stem"></span><span class="poi-callout__dot"></span><span class="poi-callout__title">${safeTitle}</span>`;

  let previousFontSize = null;
  let previousMarkerScale = null;
  element.updateMarker = ({ zoomLevel }) => {
    const normalizedZoom = Math.max(0, Math.min(1, zoomLevel / 100));
    const markerScale = 0.5 + normalizedZoom ** 2;
    const zoomOutBoost = 0.7 * (1 - normalizedZoom) ** 2;
    const visibleFontSize = 16.5 + zoomOutBoost;
    const fontSize = `${(visibleFontSize / markerScale).toFixed(2)}px`;
    if (fontSize !== previousFontSize) {
      element.style.setProperty('--poi-callout-font-size', fontSize);
      previousFontSize = fontSize;
    }
    const markerScaleStr = markerScale.toFixed(3);
    if (markerScaleStr !== previousMarkerScale) {
      element.style.setProperty('--poi-callout-marker-scale', markerScaleStr);
      previousMarkerScale = markerScaleStr;
    }
  };
  return element;
}

export function annotationsToMarkers(annotations) {
  if (!Array.isArray(annotations)) return [];

  return annotations.map((ann) => {
    if (!ann || typeof ann !== 'object') return null;
    const base = {
      id: ann.id ?? ann.uuid,
      tooltip: ann.tooltip == null ? null : escapeHtml(ann.tooltip),
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
        return { ...base, svgStyle: getLotSvgStyle(ann), polygonPixels: points };
      }
      case 'poi': {
        if (isCallout(ann)) {
          const anchor = ann.panorama_anchor;
          if (!anchor) return null;
          const hasPhoto = !!ann.image_url;
          return {
            ...base,
            element: getPoiMarkerElement(ann.tooltip, ann.callout_stem_height, hasPhoto, ann.color),
            position: { textureX: anchor[0], textureY: anchor[1] },
            size: { width: 230, height: Math.max(40, Math.min(260, Number(ann.callout_stem_height) || 96)) },
            anchor: 'bottom center',
            scale: [0.5, 1.5],
            hoverScale: false,
            tooltip: null,
            className: hasPhoto ? 'psv-marker--poi-photo' : 'psv-marker--poi-callout',
          };
        }
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
        const displayContent = ann.tooltip ? escapeHtml(ann.tooltip) : '&nbsp;';

        const hexBg = sanitizeHexColor(ann.bgColor, '#ffffff');
        const bgOpacity = clampNumber(ann.bgOpacity, 1, 0, 1);
        const rgbaBg = `rgba(${parseInt(hexBg.slice(1,3), 16)}, ${parseInt(hexBg.slice(3,5), 16)}, ${parseInt(hexBg.slice(5,7), 16)}, ${bgOpacity})`;

        const textColor = sanitizeHexColor(ann.textColor, '#000000');
        const fontSize = clampNumber(ann.fontSize, 14, 8, 200);
        const generatedHtml = `<div style='background:${rgbaBg};padding:5px;border-radius:4px;color:${textColor};white-space:nowrap;text-align:center;font-family:var(--font-body),system-ui,sans-serif;font-weight:600;font-size:${fontSize}px;'>${displayContent}</div>`;
        return {
          ...base,
          html: generatedHtml,
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
        ">${escapeHtml(ann.label ?? '')}</div>`;
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

const HIGHLIGHT_CLASS = 'is-highlighted';

/**
 * Par de updates de PSV para resaltar un marcador y volverlo a su estado: los
 * polígonos cambian su svgStyle; los de HTML (textos, lugares con tallo) se
 * resaltan por clase. PSV rearma la clase en cada update, así que restaurar
 * con la clase original alcanza para sacarla.
 */
export function markerHighlightUpdates(marker) {
  const isSvg = !!(marker.polygonPixels || marker.polylinePixels);
  return {
    on: {
      id: marker.id,
      className: [marker.className, HIGHLIGHT_CLASS].filter(Boolean).join(' '),
      ...(isSvg && { svgStyle: { ...marker.svgStyle, ...HIGHLIGHT_SVG_STYLE } }),
    },
    off: {
      id: marker.id,
      className: marker.className ?? '',
      ...(isSvg && { svgStyle: marker.svgStyle }),
    },
  };
}

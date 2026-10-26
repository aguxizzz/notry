import { buildNormalizedBorders } from './normalizeLotBorders.js';
import { POI_ICON_MARKERS } from './icons/poiIcons.js';
import { annId, annStatus, annPoints, STATUS_COLORS, STATUS_FILL_COLORS, STATUS_FILL_FALLBACK } from './lotData.js';
import './markers.css';

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

const POI_CARD_CAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11l1.2-3.5A2 2 0 0 1 8.1 6h7.8a2 2 0 0 1 1.9 1.5L19 11"/><path d="M3 16v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/><path d="M3 16h18"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/></svg>`;
const POI_CARD_PIN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>`;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * Formatea el campo de distancia genérico de un POI ("3.5 km" / "45 min").
 */
export function formatPoiDistance(value, unit) {
  if (value == null || value === '') return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  const rounded = Number.isInteger(num) ? num : Math.round(num * 10) / 10;
  return unit === 'min' ? `${rounded} min` : `${rounded} km`;
}

/**
 * Datos de la ficha de un POI (PoiPanel). `stageNameById` resuelve el nombre
 * de la etapa a la que lleva el botón "Ir a…".
 */
export function poiFromAnnotation(ann, id, stageNameById = {}) {
  return {
    title: ann.tooltip ?? id,
    content: ann.description ?? '',
    icon_type: ann.icon_type ?? null,
    link_url: ann.link_url ?? null,
    color: ann.color ?? '#14b8a6',
    image_url: ann.image_url ?? null,
    poi_kind: ann.poi_kind ?? 'place',
    distance_value: ann.distance_value ?? null,
    distance_unit: ann.distance_unit ?? null,
    target_loteo_id: ann.target_loteo_id ?? null,
    target_stage_name: ann.target_loteo_id ? (stageNameById[ann.target_loteo_id] ?? null) : null,
  };
}

// Colores de fondo para la variante "default" con badgeColors activado
// (branding.lote_badge_colors): disponible sigue en blanco, vendido/reservado
// pasan a azul y no disponible a marrón, en vez de ocultar la píldora.
const BADGE_STATUS_FILL_COLORS = {
  sold: '#1e40af',
  reserved: '#1e40af',
  unavailable: '#8a5a35',
};

/**
 * Builds an HTML string for a lote badge overlay: a short code/number
 * centered on a white circle. Si el texto tiene más de 2 caracteres, el
 * círculo se estira en ancho hasta convertirse en píldora en vez de achicar
 * la tipografía, para que el número se lea siempre al mismo tamaño.
 * Prototipo client-only (ver loteLabels.js). Devuelve también el ancho/alto
 * en unidades del viewBox para que el caller escale el marker manteniendo
 * la proporción real (evita que PSV lo "letterbox-ee" dentro de un box cuadrado).
 *
 * `style` selecciona la variante visual (configurable por proyecto vía
 * branding.lote_badge_style): 'default' | 'ghost' | 'status_ring'
 * ('status_fill' no dibuja badge: pinta el polígono, ver STATUS_FILL_COLORS).
 * `statusKey` (estado del lote) lo usa 'status_ring' siempre, y 'default'
 * solo cuando `useStatusColors` está activo (branding.lote_badge_colors).
 */
export function getLoteBadgeSvg(label, style = 'default', statusKey = null, useStatusColors = false) {
  const safeLabel = String(label).slice(0, 4).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const height = 72;
  const width = safeLabel.length > 2 ? height + (safeLabel.length - 2) * 20 : height;
  const fontSize = 25;
  const isPill = width !== height;

  if (style === 'ghost') {
    const shape = isPill
      ? `<rect x="3" y="3" width="${width - 6}" height="${height - 6}" rx="${(height - 6) / 2}" fill="none" stroke="#ffffff" stroke-width="4"/>`
      : `<circle cx="${width / 2}" cy="${height / 2}" r="27" fill="none" stroke="#ffffff" stroke-width="4"/>`;
    const html = `<svg viewBox="0 0 ${width} ${height}" style="overflow:visible;filter:drop-shadow(0 2px 4px rgba(0,0,0,.65))" xmlns="http://www.w3.org/2000/svg">
      ${shape}
      <text x="${width / 2}" y="${height / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff" style="paint-order:stroke;stroke:rgba(0,0,0,.6);stroke-width:5px;stroke-linejoin:round">${safeLabel}</text>
    </svg>`;
    return { html, width, height };
  }

  if (style === 'status_ring') {
    const ringColor = STATUS_COLORS[statusKey] ?? '#9ca3af';
    const shape = isPill
      ? `<rect x="0" y="0" width="${width}" height="${height}" rx="${height / 2}" fill="${ringColor}"/>
         <rect x="5" y="5" width="${width - 10}" height="${height - 10}" rx="${(height - 10) / 2}" fill="white"/>`
      : `<circle cx="${width / 2}" cy="${height / 2}" r="30" fill="${ringColor}"/>
         <circle cx="${width / 2}" cy="${height / 2}" r="25" fill="white"/>`;
    const html = `<svg viewBox="0 0 ${width} ${height}" style="overflow:visible" xmlns="http://www.w3.org/2000/svg">
      ${shape}
      <text x="${width / 2}" y="${height / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, sans-serif" font-weight="700" font-size="${fontSize}" fill="#1f2937">${safeLabel}</text>
    </svg>`;
    return { html, width, height };
  }

  const fillColor = (useStatusColors && BADGE_STATUS_FILL_COLORS[statusKey]) || 'white';
  const isColored = fillColor !== 'white';
  const textColor = isColored ? '#ffffff' : '#1f2937';
  const strokeColor = isColored ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.2)';
  const shape = width === height
    ? `<circle cx="${width / 2}" cy="${height / 2}" r="29" fill="${fillColor}" opacity="0.94"/>
       <circle cx="${width / 2}" cy="${height / 2}" r="29" fill="none" stroke="${strokeColor}" stroke-width="2"/>`
    : `<rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="${(height - 3) / 2}" fill="${fillColor}" opacity="0.94"/>
       <rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="${(height - 3) / 2}" fill="none" stroke="${strokeColor}" stroke-width="2"/>`;
  const html = `<svg viewBox="0 0 ${width} ${height}" style="overflow:visible" xmlns="http://www.w3.org/2000/svg">
    ${shape}
    <text x="${width / 2}" y="${height / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-family="Oswald, sans-serif" font-weight="700" font-size="${fontSize}" fill="${textColor}">${safeLabel}</text>
  </svg>`;
  return { html, width, height };
}

/**
 * `variant`: 'card' (poi_kind "place" con foto: tarjeta vertical con la foto
 * y, en el pie, título + distancia, todo visible sin click) | 'chip' (poi_kind
 * "perspective": chip genérico de cámara, la foto grande se ve al click) |
 * 'text' (callout sin foto: solo título).
 */
function getPoiMarkerElement(title, stemHeight, variant, photoUrl, distanceText) {
  const safeTitle = escapeHtml(title || (variant !== 'text' ? 'Ver foto' : 'Lugar'));
  const height = Math.max(40, Math.min(260, Number(stemHeight) || 96));
  const element = document.createElement('div');
  element.style.setProperty('--poi-callout-stem', `${height}px`);

  if (variant === 'card') {
    element.className = 'poi-callout poi-callout--card';
    const safeDistance = distanceText ? escapeHtml(distanceText) : '';
    const distanceIcon = distanceText && distanceText.includes('min') ? POI_CARD_CAR_ICON : POI_CARD_PIN_ICON;
    element.innerHTML = `<span class="poi-card">
        <img class="poi-card__img" src="${escapeHtml(photoUrl)}" alt="" />
        <span class="poi-card__footer">
          <span class="poi-card__title">${safeTitle}</span>
          ${safeDistance ? `<span class="poi-card__distance">${distanceIcon}<span>${safeDistance}</span></span>` : ''}
        </span>
      </span><span class="poi-callout__stem"></span><span class="poi-callout__dot"></span>`;
  } else {
    const hasPhoto = variant === 'chip';
    element.className = hasPhoto ? 'poi-callout poi-callout--photo' : 'poi-callout';
    const chip = hasPhoto ? `<span class="poi-callout__chip">${POI_PHOTO_CHIP_ICON}</span>` : '';
    element.innerHTML = `${chip}<span class="poi-callout__stem"></span><span class="poi-callout__dot"></span><span class="poi-callout__title">${safeTitle}</span>`;
  }

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
 * Solo geometría y estilo base: lo que cambia con recomendados y filtros lo
 * aplica styleLotMarkers encima, para no rehacer esto en cada click.
 *
 * @param {BackendAnnotation[]} annotations - Lista de anotaciones del API
 * @param {number} [snapThreshold=5] - Threshold en píxeles para snapping de vértices
 * @returns {import('@photo-sphere-viewer/markers-plugin').MarkerConfig[]}
 */
export function annotationsToMarkers(annotations, snapThreshold = 5, loteLabels = null, badgeStyle = 'default', badgeColors = false) {
  if (!Array.isArray(annotations)) return [];

  // Pre-compute border normalization for all polygon annotations
  const polygonAnns = annotations.filter(
    (a) =>
      a.type === 'polygon' &&
      annPoints(a).length >= 3
  );
  const borderData = buildNormalizedBorders(polygonAnns, snapThreshold);

  return annotations.flatMap((ann) => {
    // No pasamos content al plugin para que no abra su propio panel; el contenido se muestra en nuestro panel lateral.
    const base = {
      id: annId(ann),
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
          // "place" (default): tarjeta vertical con la foto y, en el pie,
          // título + distancia visibles sin click. "perspective": chip
          // genérico de cámara, la foto grande se ve al click.
          const isPlace = (ann.poi_kind ?? 'place') !== 'perspective';
          const distanceText = formatPoiDistance(ann.distance_value, ann.distance_unit);
          const stemHeight = Math.max(40, Math.min(260, Number(ann.callout_stem_height) || 96));
          return {
            ...base,
            element: getPoiMarkerElement(ann.tooltip, ann.callout_stem_height, isPlace ? 'card' : 'chip', ann.image_url, distanceText),
            position: { textureX: anchor[0], textureY: anchor[1] },
            // El size declarado acá tiene que matchear el height/width real del
            // contenedor .poi-callout en CSS (siempre stemHeight x 230px): la
            // tarjeta/chip/título flotan por encima con position:absolute, pero
            // PSV usa este size para calcular dónde cae "bottom center" (el
            // punto real, el dot). Si no coincide, el anchor queda corrido.
            size: { width: 230, height: stemHeight },
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
        const points = annPoints(ann);
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
          const iconSvg = getPoiIconSvg(ann.icon_type, '#ffffff', poiColor);
          return [
            polygonMarker,
            {
              id: `${annId(ann)}__icon`,
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
        const points = annPoints(ann);
        if (points.length < 3) return []; // Skip invalid polygons

        const statusKey = annStatus(ann);
        // Por defecto el lote no lleva relleno de color (pedido del cliente):
        // el polígono queda transparente y solo se ve su borde. El color de
        // estado aparece en el badge status_ring o, con el estilo status_fill,
        // como relleno suave del polígono (sin badge).
        const isStatusFill = badgeStyle === 'status_fill';
        const fillStyle = { fill: isStatusFill ? (STATUS_FILL_COLORS[statusKey] ?? STATUS_FILL_FALLBACK) : 'transparent', stroke: 'rgba(255,255,255,0.9)', strokeWidth: '1.5', strokeLinecap: 'butt' };

        const id = annId(ann);
        const polyData = borderData.get(id);

        // Fill marker uses snapped coordinates so it aligns with the border
        const fillMarker = {
          ...base,
          className: `psv-marker--lot psv-marker--lot-${statusKey || 'default'}`,
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
          id: `${id}__border__${i}`,
          visible: ann.visible !== false,
          className: `psv-marker--lot psv-marker--lot-${statusKey || 'default'} psv-marker--lot-border`,
          polylinePixels: chain,
          svgStyle: { stroke: fillStyle.stroke, strokeWidth: fillStyle.strokeWidth, strokeLinecap: fillStyle.strokeLinecap, strokeLinejoin: 'miter', fill: 'none', pointerEvents: 'none' },
          tooltip: null,
        }));

        // Badge overlay (código/número corto) en el centroide del lote.
        // Prototipo client-only: solo aparece si se pasó un label para este id.
        // Sin badgeColors: vendido/reservado/no disponible no muestran badge
        // (pedido del cliente). Con badgeColors: se muestra siempre, coloreado
        // según estado (ver BADGE_STATUS_FILL_COLORS).
        const label = loteLabels?.get?.(id) ?? loteLabels?.[id];
        const isUnavailableStatus = statusKey === 'sold' || statusKey === 'reserved' || statusKey === 'unavailable';
        const showBadge = label && !isStatusFill && (badgeColors || !isUnavailableStatus);
        const badgeMarkers = showBadge ? (() => {
          const badge = getLoteBadgeSvg(label, badgeStyle, statusKey, badgeColors);
          const badgeHeightPx = 30;
          return [{
            id: `${id}__badge`,
            visible: ann.visible !== false,
            html: badge.html,
            position: { textureX: points.reduce((s, [x]) => s + x, 0) / points.length, textureY: points.reduce((s, [, y]) => s + y, 0) / points.length },
            size: { width: Math.round(badgeHeightPx * (badge.width / badge.height)), height: badgeHeightPx },
            anchor: 'center',
            tooltip: null,
            scale: [0.5, 1.5],
            className: 'psv-marker--lot-badge',
            // opacity explícita: PSV mezcla el style nuevo sobre el viejo al
            // actualizar, y sin esto el badge quedaría apagado al quitar el filtro.
            style: { pointerEvents: 'none', opacity: 1 },
          }];
        })() : [];

        return [fillMarker, ...borderMarkers, ...badgeMarkers];
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

// Lotes que no pasan los filtros del panel: se apagan en la foto (relleno
// oscuro, borde tenue, badge translúcido) en vez de desaparecer.
const DIM_FILL = 'rgba(10,10,10,0.42)';

/**
 * Estilo que cambia con la interacción, encima de annotationsToMarkers:
 * recomendados en dorado, el resto en gris con el modo foco (sigue siendo
 * clickeable) y los que no pasan el filtro, apagados. Los markers que no
 * cambian se devuelven tal cual (misma referencia), así el viewer actualiza
 * solo esos.
 *
 * @param {object[]} markers - salida de annotationsToMarkers
 * @param {{ lotIds: Set<string>, recommendedIds?: Set<string>|null, focusMode?: boolean, visibleIds?: Set<string>|null }} opts
 *   lotIds: todos los lotes (lo demás no se toca); visibleIds: lotes que pasan el filtro (null = sin filtro)
 */
export function styleLotMarkers(markers, { lotIds, recommendedIds = null, focusMode = false, visibleIds = null }) {
  const hasRecommended = (recommendedIds?.size ?? 0) > 0;
  if (!hasRecommended && !visibleIds) return markers;
  return markers.map((m) => {
    const [id, kind] = String(m.id).split('__');
    if (!lotIds.has(id)) return m;
    const isRecommended = Boolean(recommendedIds?.has(id));
    const isMuted = focusMode && hasRecommended && !isRecommended;
    const isDimmed = Boolean(visibleIds) && !visibleIds.has(id);

    if (kind === 'badge') return isDimmed ? { ...m, style: { ...m.style, opacity: 0.28 } } : m;
    if (!isRecommended && !isMuted && !isDimmed) return m;
    const className = `${m.className}${isRecommended ? ' psv-marker--lot-recommended' : isMuted ? ' psv-marker--lot-muted' : ''}`;
    if (!kind) {
      const fill = isDimmed ? DIM_FILL : isRecommended ? 'rgba(197,160,89,0.42)' : 'rgba(160,160,160,0.20)';
      return { ...m, className, svgStyle: { ...m.svgStyle, fill } };
    }
    if (kind === 'border') {
      const stroke = isDimmed ? 'rgba(255,255,255,0.3)' : isMuted ? 'rgba(255,255,255,0.6)' : m.svgStyle.stroke;
      return { ...m, className, svgStyle: { ...m.svgStyle, stroke } };
    }
    return m;
  });
}

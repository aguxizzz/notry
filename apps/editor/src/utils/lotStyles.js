// Estilo de un lote según su estado comercial — fuente única para el
// panorama (annotationsToMarkers) y el plano (BlueprintEditor).
export const LOT_STATUS_STYLES = {
  available:   { fill: 'rgba(34,197,94,0.15)',   stroke: 'rgba(22,163,74,0.5)',  strokeWidth: '2' },
  unavailable: { fill: 'rgba(107,114,128,0.25)', stroke: 'rgba(75,85,99,0.75)',  strokeWidth: '2' },
  sold:        { fill: 'rgba(239,68,68,0.25)',   stroke: 'rgba(220,38,38,0.7)',  strokeWidth: '2' },
  reserved:    { fill: 'rgba(59,130,246,0.40)',  stroke: 'rgba(37,99,235,0.80)', strokeWidth: '2' },
};

// Resaltado al pasar el mouse por la fila del panel de Contenido: dorado del
// editor, para que se distinga de cualquier estado.
export const HIGHLIGHT_SVG_STYLE = { fill: 'rgba(221,184,108,0.38)', stroke: '#ddb86c', strokeWidth: '4' };

// Un lote pendiente (recién dibujado, sin crear en la base) se ve con su
// propio svgStyle punteado aunque traiga un estado.
export function getLotSvgStyle(annotation) {
  const statusStyle = LOT_STATUS_STYLES[annotation.status ?? annotation.estado];
  if (!annotation.pending && statusStyle) return statusStyle;
  return annotation.svgStyle ?? {};
}

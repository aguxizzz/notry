// Diff contra el último estado guardado + armado de items para
// POST /loteos/{id}/bulk-save. Funciones puras (sin React) para poder
// testearlas — useSaveAll es quien las orquesta.
import { coordsEqual, parseNumberOrZero } from './saveAllUtils';
import { isCallout } from './annotationModel';

/** Un lugar nuevo necesita título y ubicación (ancla o polígono) en alguna vista. */
export const isPendingPoiValid = poi => {
  const hasPosition = isCallout(poi)
    ? Boolean(poi.panorama_anchor || poi.blueprint_anchor)
    : poi.panorama_coordinates?.length >= 3 || poi.blueprint_coordinates?.length >= 3;
  return Boolean((poi.title ?? poi.tooltip ?? '').trim()) && hasPosition;
};

export const polygonChanged = (cur, saved) => {
  if (!saved) return true;
  return (
    !coordsEqual(cur.panorama_coordinates, saved.panorama_coordinates) ||
    !coordsEqual(cur.blueprint_coordinates, saved.blueprint_coordinates) ||
    !coordsEqual(cur.geo_coordinates, saved.geo_coordinates) ||
    !coordsEqual(cur.panorama_anchor, saved.panorama_anchor) ||
    !coordsEqual(cur.blueprint_anchor, saved.blueprint_anchor) ||
    (cur.variant ?? cur.marker_variant ?? 'area') !== (saved.variant ?? saved.marker_variant ?? 'area') ||
    Number(cur.callout_stem_height ?? 96) !== Number(saved.callout_stem_height ?? 96) ||
    cur.tooltip !== saved.tooltip ||
    cur.status !== saved.status ||
    String(cur.price ?? '') !== String(saved.price ?? '') ||
    String(cur.area_m2 ?? '') !== String(saved.area_m2 ?? '') ||
    (cur.comments ?? '') !== (saved.comments ?? '') ||
    !coordsEqual(cur.image_urls, saved.image_urls)
  );
};

export const poiChanged = (cur, saved) => {
  if (!saved) return true;
  return (
    !coordsEqual(cur.panorama_coordinates, saved.panorama_coordinates) ||
    !coordsEqual(cur.blueprint_coordinates, saved.blueprint_coordinates) ||
    !coordsEqual(cur.panorama_anchor, saved.panorama_anchor) ||
    !coordsEqual(cur.blueprint_anchor, saved.blueprint_anchor) ||
    (cur.variant ?? cur.marker_variant ?? 'area') !== (saved.variant ?? saved.marker_variant ?? 'area') ||
    Number(cur.callout_stem_height ?? 96) !== Number(saved.callout_stem_height ?? 96) ||
    (cur.title ?? cur.tooltip) !== (saved.title ?? saved.tooltip) ||
    (cur.icon_type ?? '') !== (saved.icon_type ?? '') ||
    (cur.description ?? '') !== (saved.description ?? '') ||
    (cur.link_url ?? '') !== (saved.link_url ?? '') ||
    (cur.color ?? '') !== (saved.color ?? '') ||
    (cur.target_loteo_id ?? '') !== (saved.target_loteo_id ?? '')
    || (cur.image_url ?? '') !== (saved.image_url ?? '')
    || (cur.poi_kind ?? 'place') !== (saved.poi_kind ?? 'place')
    || String(cur.distance_value ?? '') !== String(saved.distance_value ?? '')
    || (cur.distance_unit ?? '') !== (saved.distance_unit ?? '')
    || (cur.category ?? '') !== (saved.category ?? '')
  );
};

export const buildLotItem = (marker, savedMap) => {
  const markerId = marker.uuid ?? marker.id;
  const savedMarker = savedMap.get(markerId);
  const item = { uuid: markerId };
  if (!coordsEqual(marker.panorama_coordinates, savedMarker?.panorama_coordinates)) {
    item.coordinates_360 = marker.panorama_coordinates ?? [];
  }
  if (!coordsEqual(marker.blueprint_coordinates, savedMarker?.blueprint_coordinates)) {
    item.blueprint_coordinates = marker.blueprint_coordinates ?? [];
  }
  if (!coordsEqual(marker.geo_coordinates, savedMarker?.geo_coordinates)) {
    item.geo_coordinates = marker.geo_coordinates ?? [];
  }
  if (marker.tooltip?.trim()) item.name = marker.tooltip.trim();
  item.status = marker.status || marker.estado || 'available';
  if (String(marker.price ?? '') !== String(savedMarker?.price ?? '')) {
    item.price = parseNumberOrZero(marker.price);
  }
  if (String(marker.area_m2 ?? '') !== String(savedMarker?.area_m2 ?? '')) {
    item.area_m2 = parseNumberOrZero(marker.area_m2);
  }
  if (!coordsEqual(marker.image_urls, savedMarker?.image_urls)) {
    item.image_urls = marker.image_urls ?? [];
  }
  item.comments = marker.comments?.trim() || null;
  return item;
};

// Campos de metadata de un POI, iguales para crear y para actualizar.
const poiMetadataFields = poi => {
  const callout = isCallout(poi);
  return {
    icon_type: poi.icon_type || null,
    description: poi.description || null,
    link_url: poi.link_url || null,
    color: poi.color || '#14b8a6',
    marker_variant: callout ? 'callout' : 'area',
    callout_stem_height: callout ? (poi.callout_stem_height ?? 96) : null,
    target_loteo_id: poi.target_loteo_id || null,
    image_url: poi.image_url || null,
    poi_kind: poi.poi_kind || 'place',
    distance_value: poi.distance_value === '' || poi.distance_value == null ? null : Number(poi.distance_value),
    distance_unit: poi.distance_unit || null,
    category: poi.category?.trim() || null,
  };
};

export const buildPoiUpdateItem = poi => {
  const callout = isCallout(poi);
  const item = {
    uuid: poi.uuid || poi.id,
    title: poi.title ?? poi.tooltip,
    ...poiMetadataFields(poi),
  };
  if (callout && poi.panorama_anchor) item.panorama_anchor = poi.panorama_anchor;
  else if (poi.panorama_coordinates?.length > 0) item.coordinates_360 = poi.panorama_coordinates;
  if (callout && poi.blueprint_anchor) item.blueprint_anchor = poi.blueprint_anchor;
  else if (poi.blueprint_coordinates?.length > 0) item.blueprint_coordinates = poi.blueprint_coordinates;
  return item;
};

export const buildPoiCreateItem = poi => {
  return {
    client_id: String(poi.id),
    title: (poi.title ?? poi.tooltip).trim(),
    ...poiMetadataFields(poi),
    ...(poi.panorama_anchor ? { panorama_anchor: poi.panorama_anchor } : {}),
    ...(poi.blueprint_anchor ? { blueprint_anchor: poi.blueprint_anchor } : {}),
    ...(poi.panorama_coordinates?.length >= 3 ? { coordinates_360: poi.panorama_coordinates } : {}),
    ...(poi.blueprint_coordinates?.length >= 3 ? { blueprint_coordinates: poi.blueprint_coordinates } : {}),
  };
};

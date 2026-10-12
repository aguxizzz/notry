import { useState } from 'react';
import { API_BASE, fetchWithTimeout, authHeaders } from '../api/config';
import { coordsEqual, parseNumberOrZero } from '../utils/saveAllUtils';
import { useUIFeedback } from './useUIFeedback';

const polygonChanged = (cur, saved) => {
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

const poiChanged = (cur, saved) => {
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
  );
};

const buildLotItem = (marker, savedMap) => {
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

const buildPoiUpdateItem = poi => {
  const poiId = poi.uuid || poi.id;
  const isCallout = poi.variant === 'callout' || poi.marker_variant === 'callout';
  const item = {
    uuid: poiId,
    title: poi.title ?? poi.tooltip,
    icon_type: poi.icon_type || null,
    description: poi.description || null,
    link_url: poi.link_url || null,
    color: poi.color || '#14b8a6',
    marker_variant: isCallout ? 'callout' : 'area',
    callout_stem_height: isCallout ? (poi.callout_stem_height ?? 96) : null,
    target_loteo_id: poi.target_loteo_id || null,
    image_url: poi.image_url || null,
    poi_kind: poi.poi_kind || 'place',
    distance_value: poi.distance_value === '' || poi.distance_value == null ? null : Number(poi.distance_value),
    distance_unit: poi.distance_unit || null,
  };
  if (isCallout && poi.panorama_anchor) item.panorama_anchor = poi.panorama_anchor;
  else if (poi.panorama_coordinates?.length > 0) item.coordinates_360 = poi.panorama_coordinates;
  if (isCallout && poi.blueprint_anchor) item.blueprint_anchor = poi.blueprint_anchor;
  else if (poi.blueprint_coordinates?.length > 0) item.blueprint_coordinates = poi.blueprint_coordinates;
  return item;
};

const buildPoiCreateItem = poi => {
  const isCallout = poi.variant === 'callout' || poi.marker_variant === 'callout';
  return {
    client_id: String(poi.id),
    title: (poi.title ?? poi.tooltip).trim(),
    icon_type: poi.icon_type || null,
    description: poi.description || null,
    link_url: poi.link_url || null,
    color: poi.color || '#14b8a6',
    marker_variant: isCallout ? 'callout' : 'area',
    callout_stem_height: isCallout ? (poi.callout_stem_height ?? 96) : null,
    target_loteo_id: poi.target_loteo_id || null,
    image_url: poi.image_url || null,
    poi_kind: poi.poi_kind || 'place',
    distance_value: poi.distance_value === '' || poi.distance_value == null ? null : Number(poi.distance_value),
    distance_unit: poi.distance_unit || null,
    ...(poi.panorama_anchor ? { panorama_anchor: poi.panorama_anchor } : {}),
    ...(poi.blueprint_anchor ? { blueprint_anchor: poi.blueprint_anchor } : {}),
    ...(poi.panorama_coordinates?.length >= 3 ? { coordinates_360: poi.panorama_coordinates } : {}),
    ...(poi.blueprint_coordinates?.length >= 3 ? { blueprint_coordinates: poi.blueprint_coordinates } : {}),
  };
};

export function useSaveAll({ annotations, setAnnotations, token, loteoId, savedAnnotationsRef, onAfterSave, calibrationPoints, savedCalibrationRef, geoCalibrationPoints, savedGeoCalibrationRef, renderSurfaces, savedRenderSurfacesRef }) {
  const { notify } = useUIFeedback();
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [sessionExpiredDuringSave, setSessionExpiredDuringSave] = useState(false);

  const handleSaveAll = async () => {
    setIsSavingAll(true);

    try {
      const savedMap = new Map(
        (savedAnnotationsRef?.current ?? []).map(a => [a.uuid ?? a.id, a])
      );

      const textAnnotations = annotations.filter(a => a.type === 'text');
      const savedTextAnnotations = (savedAnnotationsRef?.current ?? []).filter(a => a.type === 'text');
      const textChanged = JSON.stringify(textAnnotations) !== JSON.stringify(savedTextAnnotations);

      const allPolygons = annotations.filter(a => a.type === 'polygon' && !a.pending && (a.uuid || a.id));
      const polygonsWithUuid = allPolygons.filter(m => polygonChanged(m, savedMap.get(m.uuid ?? m.id)));

      const pendingPois = annotations.filter(a => a.type === 'poi' && a.pending);
      if (pendingPois.length > 0 && !loteoId) {
        notify('No se encontró el loteo_id para guardar los lugares nuevos.', { variant: 'error' });
        return;
      }
      const invalidPendingPoi = pendingPois.find(poi => {
        const isCallout = poi.variant === 'callout' || poi.marker_variant === 'callout';
        const hasPosition = isCallout
          ? !!(poi.panorama_anchor || poi.blueprint_anchor)
          : !!(poi.panorama_coordinates?.length >= 3 || poi.blueprint_coordinates?.length >= 3);
        return !(poi.title ?? poi.tooltip ?? '').trim() || !hasPosition;
      });
      if (invalidPendingPoi) {
        notify('Revisá que cada lugar nuevo tenga título y ubicación antes de guardar.', { variant: 'error' });
        return;
      }

      const allPois = annotations.filter(a => a.type === 'poi' && !a.pending && (a.uuid || a.id));
      const poisWithUuid = allPois.filter(p => poiChanged(p, savedMap.get(p.uuid ?? p.id)));

      const pendingLots = annotations.filter(a => a.type === 'polygon' && a.pending);

      const calibrationChanged = JSON.stringify(calibrationPoints ?? []) !== JSON.stringify(savedCalibrationRef?.current ?? []);
      const geoCalibrationChanged = JSON.stringify(geoCalibrationPoints ?? []) !== JSON.stringify(savedGeoCalibrationRef?.current ?? []);
      const renderSurfacesChanged = JSON.stringify(renderSurfaces ?? null) !== JSON.stringify(savedRenderSurfacesRef?.current ?? null);

      if ((calibrationChanged || geoCalibrationChanged) && !loteoId) {
        notify('No se encontró el loteo_id para guardar la calibración.', { variant: 'error' });
        return;
      }

      if (!textChanged && polygonsWithUuid.length === 0 && pendingPois.length === 0 && poisWithUuid.length === 0 && !calibrationChanged && !geoCalibrationChanged && !renderSurfacesChanged) {
        if (pendingLots.length > 0) {
          notify(
            `${pendingLots.length} lote(s) siguen pendientes. Abrí cada uno y elegí “Crear lote” o “Asignar existente” antes de guardarlos.`,
            { variant: 'warning' }
          );
          return;
        }
        notify('Sin cambios para guardar.', { variant: 'info' });
        return;
      }

      const payload = {
        ...(textChanged ? { text_annotations: textAnnotations } : {}),
        ...(calibrationChanged ? { calibration_points: calibrationPoints ?? [] } : {}),
        ...(geoCalibrationChanged ? { geo_calibration_points: geoCalibrationPoints ?? [] } : {}),
        ...(renderSurfacesChanged ? { render_surfaces: renderSurfaces ?? null } : {}),
        lots: polygonsWithUuid.map(marker => buildLotItem(marker, savedMap)),
        pois_create: pendingPois.map(buildPoiCreateItem),
        pois_update: poisWithUuid.map(buildPoiUpdateItem),
      };

      const response = await fetchWithTimeout(`${API_BASE}/loteos/${loteoId}/bulk-save`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        setSessionExpiredDuringSave(true);
        return;
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        notify(errorBody?.detail ? `No se pudo guardar: ${errorBody.detail}` : 'No se pudo guardar. Nada se modificó.', { variant: 'error' });
        return;
      }

      const result = await response.json();

      const createdByLocalId = new Map(
        result.pois_created.map(({ client_id, poi }) => [client_id, poi])
      );
      let workingAnnotations = annotations;
      if (createdByLocalId.size > 0) {
        const applyCreatedPois = currentAnnotations => currentAnnotations.map(annotation => {
          const created = createdByLocalId.get(String(annotation.id));
          if (!created) return annotation;
          return {
            ...created,
            ...annotation,
            id: created.id,
            uuid: created.id,
            pending: false,
            tooltip: annotation.tooltip ?? created.title,
            title: annotation.title ?? annotation.tooltip ?? created.title,
            variant: annotation.variant ?? created.marker_variant ?? 'callout',
          };
        });
        workingAnnotations = applyCreatedPois(annotations);
        setAnnotations?.(applyCreatedPois);
      }

      if (savedAnnotationsRef) {
        savedAnnotationsRef.current = workingAnnotations
          .filter(annotation => !(annotation.type === 'polygon' && annotation.pending))
          .map(annotation => ({ ...annotation }));
      }
      if (savedCalibrationRef) savedCalibrationRef.current = calibrationPoints ?? [];
      if (savedGeoCalibrationRef) savedGeoCalibrationRef.current = geoCalibrationPoints ?? [];
      if (savedRenderSurfacesRef) savedRenderSurfacesRef.current = renderSurfaces ?? null;
      if (pendingLots.length === 0) onAfterSave?.();

      const parts = [];
      if (result.loteo_updated) parts.push('texto/calibración guardados');
      if (result.lots_updated.length > 0) parts.push(`${result.lots_updated.length} lote(s) actualizados`);
      if (result.pois_created.length > 0) parts.push(`${result.pois_created.length} lugar(es) creados`);
      if (result.pois_updated.length > 0) parts.push(`${result.pois_updated.length} POI(s) actualizados`);
      if (pendingLots.length > 0) parts.push(`${pendingLots.length} lote(s) todavía pendientes`);

      notify(parts.length ? parts.join(' · ') : 'Sin cambios para guardar.', {
        variant: pendingLots.length > 0 ? 'warning' : 'success',
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        notify('El servidor tardó demasiado en responder. Tu trabajo se guardó localmente. Intenta guardar de nuevo en unos segundos.', { variant: 'warning' });
      } else {
        notify('Error de conexión al guardar.', { variant: 'error' });
      }
    } finally {
      setIsSavingAll(false);
    }
  };

  return {
    isSavingAll,
    sessionExpiredDuringSave,
    clearSessionExpired: () => setSessionExpiredDuringSave(false),
    handleSaveAll,
  };
}

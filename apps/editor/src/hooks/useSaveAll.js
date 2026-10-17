import { useState } from 'react';
import { bulkSaveLoteo } from '../api/loteos';
import {
  polygonChanged, poiChanged, buildLotItem, buildPoiUpdateItem, buildPoiCreateItem,
} from '../utils/saveAllPayload';
import { useUIFeedback } from './useUIFeedback';

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

      let result;
      try {
        result = await bulkSaveLoteo(token, loteoId, payload);
      } catch (error) {
        // 401: banner de sesión vencida en vez de logout directo — así el
        // trabajo sin guardar sigue en pantalla (y en el borrador local).
        if (error.isUnauthorized) setSessionExpiredDuringSave(true);
        else if (error.timeout) notify('El servidor tardó demasiado en responder. Tu trabajo se guardó localmente. Intenta guardar de nuevo en unos segundos.', { variant: 'warning' });
        else if (error.network) notify('Error de conexión al guardar.', { variant: 'error' });
        else notify(error.detail ? `No se pudo guardar: ${error.detail}` : 'No se pudo guardar. Nada se modificó.', { variant: 'error' });
        return;
      }

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
      // Los errores del request se manejan arriba; esto es un bug del editor
      // (armando el payload o aplicando la respuesta).
      console.error('useSaveAll: error inesperado', error);
      notify('Error inesperado al guardar. Recargá la página antes de seguir editando.', { variant: 'error' });
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

import { useState } from 'react';
import { API_BASE, fetchWithTimeout } from '../api/config';

const coordsEqual = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

const polygonChanged = (cur, saved) => {
  if (!saved) return true;
  return (
    !coordsEqual(cur.panorama_coordinates, saved.panorama_coordinates) ||
    !coordsEqual(cur.blueprint_coordinates, saved.blueprint_coordinates) ||
    cur.tooltip !== saved.tooltip ||
    cur.slug !== saved.slug ||
    cur.status !== saved.status ||
    String(cur.price ?? '') !== String(saved.price ?? '') ||
    String(cur.area_m2 ?? '') !== String(saved.area_m2 ?? '') ||
    (cur.comments ?? '') !== (saved.comments ?? '')
  );
};

const poiChanged = (cur, saved) => {
  if (!saved) return true;
  return (
    !coordsEqual(cur.panorama_coordinates, saved.panorama_coordinates) ||
    !coordsEqual(cur.blueprint_coordinates, saved.blueprint_coordinates) ||
    (cur.title ?? cur.tooltip) !== (saved.title ?? saved.tooltip) ||
    (cur.icon_type ?? '') !== (saved.icon_type ?? '') ||
    (cur.description ?? '') !== (saved.description ?? '') ||
    (cur.link_url ?? '') !== (saved.link_url ?? '') ||
    (cur.color ?? '') !== (saved.color ?? '')
  );
};

export function useSaveAll({ annotations, token, loteoId, savedAnnotationsRef, onAuthError, onAfterSave, calibrationPoints, savedCalibrationRef }) {
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [sessionExpiredDuringSave, setSessionExpiredDuringSave] = useState(false);

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    const summary = {
      textOk: false,
      polyCoordOk: 0, polyCoordFailed: 0, polyCoordSkipped: 0,
      lotMetaOk: 0, lotMetaFailed: 0,
      poiOk: 0, poiFailed: 0,
    };

    try {
      const savedMap = new Map(
        (savedAnnotationsRef?.current ?? []).map(a => [a.uuid ?? a.id, a])
      );

      const textAnnotations = annotations.filter(a => a.type === 'text');
      const savedTextAnnotations = (savedAnnotationsRef?.current ?? []).filter(a => a.type === 'text');
      const textChanged = JSON.stringify(textAnnotations) !== JSON.stringify(savedTextAnnotations);

      const allPolygons = annotations.filter(a => a.type === 'polygon' && !a.pending && (a.uuid || a.id));
      const polygonsWithUuid = allPolygons.filter(m => polygonChanged(m, savedMap.get(m.uuid ?? m.id)));

      const allPois = annotations.filter(a => a.type === 'poi' && !a.pending && (a.uuid || a.id));
      const poisWithUuid = allPois.filter(p => poiChanged(p, savedMap.get(p.uuid ?? p.id)));

      summary.polyCoordSkipped = annotations.filter(a => a.type === 'polygon' && !a.uuid).length;

      const calibrationChanged = JSON.stringify(calibrationPoints ?? []) !== JSON.stringify(savedCalibrationRef?.current ?? []);

      if (!textChanged && polygonsWithUuid.length === 0 && poisWithUuid.length === 0 && !calibrationChanged) {
        alert('Sin cambios para guardar.');
        return;
      }

      // Coordinate updates for lots
      const polyCoordRequests = polygonsWithUuid.flatMap(marker => {
        const reqs = [];
        if (marker.panorama_coordinates?.length > 0) {
          reqs.push(fetchWithTimeout(`${API_BASE}/lots/update-coordinates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ uuid: marker.uuid, polygonPoints: marker.panorama_coordinates }),
          }));
        }
        if (marker.blueprint_coordinates?.length > 0) {
          reqs.push(fetchWithTimeout(`${API_BASE}/lots/update-blueprint-coordinates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ uuid: marker.uuid, polygonPoints: marker.blueprint_coordinates }),
          }));
        }
        return reqs;
      });

      // Metadata updates for lots (name, status, price, area, comments)
      const lotMetaRequests = polygonsWithUuid.map(marker =>
        fetchWithTimeout(`${API_BASE}/lots/${marker.uuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            ...(marker.tooltip?.trim() && { name: marker.tooltip.trim() }),
            ...(marker.slug?.trim() && { slug: marker.slug.trim() }),
            status: marker.status || marker.estado || 'available',
            ...(!isNaN(parseFloat(marker.price)) && { price: parseFloat(marker.price) }),
            ...(marker.area_m2 != null && marker.area_m2 !== '' && { area_m2: String(marker.area_m2) }),
            comments: marker.comments?.trim() || null,
          }),
        })
      );

      // Coordinate + metadata updates for POIs
      const poiRequests = poisWithUuid.flatMap(poi => {
        const poiId = poi.uuid || poi.id;
        const reqs = [];
        if (poi.panorama_coordinates?.length > 0) {
          reqs.push(fetchWithTimeout(`${API_BASE}/pois/update-coordinates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ uuid: poiId, polygonPoints: poi.panorama_coordinates }),
          }));
        }
        if (poi.blueprint_coordinates?.length > 0) {
          reqs.push(fetchWithTimeout(`${API_BASE}/pois/update-blueprint-coordinates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ uuid: poiId, polygonPoints: poi.blueprint_coordinates }),
          }));
        }
        const poiTitle = poi.title ?? poi.tooltip;
        if (poiTitle && poiId) {
          reqs.push(fetchWithTimeout(`${API_BASE}/pois/${poiId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              title: poiTitle,
              icon_type: poi.icon_type || null,
              description: poi.description || null,
              link_url: poi.link_url || null,
              color: poi.color || '#14b8a6',
            }),
          }));
        }
        return reqs;
      });

      // Build a single PATCH for the loteo when text or calibration changed
      const loteoBody = {};
      if (textChanged && textAnnotations.length > 0) loteoBody.text_annotations = textAnnotations;
      if (calibrationChanged) loteoBody.calibration_points = calibrationPoints ?? [];
      const hasLoteoUpdate = Object.keys(loteoBody).length > 0;

      const allResults = await Promise.all([
        loteoId && hasLoteoUpdate
          ? fetchWithTimeout(`${API_BASE}/loteos/${loteoId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(loteoBody),
            })
          : Promise.resolve(null),
        ...polyCoordRequests,
        ...lotMetaRequests,
        ...poiRequests,
      ]);

      const [textRes, ...restResults] = allResults;
      const polyCoordResults = restResults.slice(0, polyCoordRequests.length);
      const lotMetaResults = restResults.slice(polyCoordRequests.length, polyCoordRequests.length + lotMetaRequests.length);
      const poiResults = restResults.slice(polyCoordRequests.length + lotMetaRequests.length);

      const allResponses = [textRes, ...restResults].filter(Boolean);
      if (allResponses.some(r => r?.status === 401)) {
        setSessionExpiredDuringSave(true);
        return;
      }

      summary.textOk = textRes?.ok ?? false;
      const calibrationOk = textRes?.ok && calibrationChanged;
      polyCoordResults.forEach(r => { if (r.ok) summary.polyCoordOk++; else summary.polyCoordFailed++; });
      lotMetaResults.forEach(r => { if (r.ok) summary.lotMetaOk++; else summary.lotMetaFailed++; });
      poiResults.forEach(r => { if (r.ok) summary.poiOk++; else summary.poiFailed++; });

      const parts = [];
      if (summary.textOk) parts.push(`${textAnnotations.length} texto(s) guardados`);
      if (calibrationOk) parts.push(`calibración guardada (${(calibrationPoints ?? []).length} pares)`);
      if (summary.polyCoordOk > 0) parts.push(`${summary.polyCoordOk} coord(s) de lotes actualizadas`);
      if (summary.polyCoordFailed > 0) parts.push(`${summary.polyCoordFailed} coord(s) de lotes fallaron`);
      if (summary.lotMetaOk > 0) parts.push(`${summary.lotMetaOk} lote(s) actualizados`);
      if (summary.lotMetaFailed > 0) parts.push(`${summary.lotMetaFailed} lote(s) fallaron`);
      if (summary.poiOk > 0) parts.push(`${summary.poiOk} POI(s) actualizados`);
      if (summary.poiFailed > 0) parts.push(`${summary.poiFailed} POI(s) fallaron`);
      if (summary.polyCoordSkipped > 0) parts.push(`${summary.polyCoordSkipped} lote(s) sin UUID omitidos`);

      const anyFailed = summary.polyCoordFailed > 0 || summary.lotMetaFailed > 0 || summary.poiFailed > 0;
      if (!anyFailed && savedAnnotationsRef) {
        savedAnnotationsRef.current = annotations.map(a => ({ ...a }));
        if (savedCalibrationRef) savedCalibrationRef.current = calibrationPoints ?? [];
        onAfterSave?.();
      }
      alert(parts.length ? parts.join(' · ') : 'Sin cambios para guardar.');
    } catch (error) {
      if (error.name === 'AbortError') {
        alert('El servidor tardó demasiado en responder. Tu trabajo se guardó localmente. Intenta guardar de nuevo en unos segundos.');
      } else {
        alert('Error de conexión al guardar.');
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

import { useMemo, useRef, useState } from 'react';
import { withPairIds } from '../utils/calibration';
import { geoOverlayAnnotations, projectGeoPolygons } from '../utils/geoCalibration';

/**
 * Calibración geográfica (plano ↔ lat/lng), para el modo satelital del visor.
 * Más simple que la del panorama: un punto por vez — click en el plano,
 * después en el mapa, y se agrega el par.
 *
 * Los pares entran al undo/redo (useHistory hace snapshot de `points`):
 * `onBeforeChange` se llama antes de agregar, borrar o limpiar pares, y antes
 * de "Actualizar polígonos satelitales" (que cambia anotaciones).
 */
export function useGeoCalibration({
  activeTool, setActiveTool, annotations, setAnnotations, onBeforeChange, confirm, notify,
}) {
  // Cada par: { _id, blueprint: [nx, ny], geo: [lat, lng] }
  const [points, setPoints] = useState([]);
  // Punto del plano esperando su click en el mapa.
  const [pending, setPending] = useState(null);
  const savedRef = useRef([]);

  // Entrar o salir de cualquier herramienta descarta el punto sin par (se
  // ajusta durante el render, igual que en useCalibration).
  const [pendingTool, setPendingTool] = useState(activeTool);
  if (pendingTool !== activeTool) {
    setPendingTool(activeTool);
    setPending(null);
  }

  const load = (raw) => {
    const withIds = withPairIds(raw);
    setPoints(withIds);
    savedRef.current = withIds;
  };

  // Siempre viene del plano (el overlay pone plano y mapa lado a lado).
  // Volver a clickear pisa el punto todavía sin par.
  const pickBlueprintPoint = point => setPending(point);

  const pickMapPoint = ({ latitude, longitude }) => {
    if (!pending) return;
    onBeforeChange();
    setPoints(prev => [...prev, { _id: crypto.randomUUID(), blueprint: pending, geo: [latitude, longitude] }]);
    setPending(null);
  };

  const deletePoint = (index) => {
    onBeforeChange();
    setPoints(prev => prev.filter((_, i) => i !== index));
  };

  const clear = async () => {
    if (points.length === 0) return;
    const ok = await confirm('¿Borrar toda la calibración geográfica?', {
      title: 'Borrar calibración geográfica', danger: true, confirmLabel: 'Borrar',
    });
    if (!ok) return;
    onBeforeChange();
    setPoints([]);
    setActiveTool('select');
  };

  const cancel = () => {
    setPending(null);
    setActiveTool('select');
  };

  const escape = () => {
    if (pending) setPending(null);
    else cancel();
  };

  // Cálculo "horneado": se corre a mano con el botón cada vez que cambian los
  // pares o el plano de algún lote (mismo criterio que el resto de la
  // calibración: nada de esto se recalcula solo).
  const updatePolygons = () => {
    if (points.length < 4) return;
    const projected = projectGeoPolygons(annotations, points);
    if (!projected) {
      notify('No se pudo calcular una calibración geográfica válida con estos puntos.', { variant: 'error' });
      return;
    }
    onBeforeChange();
    setAnnotations(projected);
    notify('Polígonos satelitales actualizados.', { variant: 'success' });
  };

  const overlayAnnotations = useMemo(
    () => geoOverlayAnnotations(annotations, points, pending),
    [annotations, points, pending]
  );

  const polygons = useMemo(
    () => annotations.filter(a => a.type === 'polygon' && a.geo_coordinates?.length >= 3),
    [annotations]
  );

  return {
    points, setPoints, savedRef, load,
    pending,
    pickBlueprintPoint, pickMapPoint,
    deletePoint, clear, cancel, escape,
    updatePolygons,
    overlayAnnotations, polygons,
  };
}

import { useMemo, useRef, useState } from 'react';
import { computeProjector, isProjectorValid } from '../utils/panoramaProjection';
import { parseCalibPointId } from '../utils/markerIds';
import {
  isCalibrationPairTooClose, matchPanoramaPoint, moveCalibrationPoint, queueBlueprintPoint, withPairIds,
} from '../utils/calibration';

/**
 * Calibración plano ↔ panorama: los pares de puntos, el lote de puntos del
 * plano que espera emparejarse, y la proyección que sale de ahí.
 *
 * Flujo de la herramienta "calibrate": se juntan puntos en el plano (hasta
 * completar 4 pares), se pasa solo al panorama y cada click ahí se empareja
 * con el punto del plano más viejo en cola. Al terminar el lote se vuelve al
 * plano para enderezar los puntos.
 *
 * Los pares entran al historial de undo (useHistory hace snapshot de
 * `points`): `onBeforeChange` se llama antes de cada cambio confirmado.
 */
export function useCalibration({
  mode, activeTool, setActiveTool, panoramaDimensions, onBeforeChange, confirm, goToView,
}) {
  // Cada par: { _id, blueprint: [nx, ny], panorama: [textureX, textureY] }
  const [points, setPoints] = useState([]);
  // Puntos del plano del lote actual, en orden, esperando su par del panorama.
  const [pending, setPending] = useState([]);
  const [notice, setNotice] = useState('');
  // Lo último guardado/cargado, para el diff de "Guardar todo".
  const savedRef = useRef([]);
  const isDraggingRef = useRef(false);

  // Se ajusta con la dirección del rayo como destino (válido en toda la
  // esfera), no en pixeles ni en un plano tangente — ver panoramaProjection.js.
  const homography = useMemo(() => {
    if (points.length < 4 || !panoramaDimensions) return null;
    const projector = computeProjector(points.map(c => ({ src: c.blueprint, dst: c.panorama })), panoramaDimensions);
    return isProjectorValid(projector) ? projector : null;
  }, [points, panoramaDimensions]);

  // Entrar o salir de cualquier herramienta descarta el lote en curso (se
  // ajusta durante el render, sin efecto — ver "you might not need an effect").
  const [pendingTool, setPendingTool] = useState(activeTool);
  if (pendingTool !== activeTool) {
    setPendingTool(activeTool);
    setPending([]);
  }

  const load = (raw) => {
    const withIds = withPairIds(raw);
    setPoints(withIds);
    savedRef.current = withIds;
  };

  const handleClick = async (point) => {
    if (mode === 'blueprint') {
      const step = queueBlueprintPoint(points, pending, point);
      if (!step) return;
      setPending(step.pending);
      if (step.batchFull) goToView('panorama');
      return;
    }
    if (pending.length === 0) return;
    const tooClose = points.some(pair => isCalibrationPairTooClose(pair, pending[0], point));
    if (tooClose && !(await confirm(
      'Este punto está muy cerca de uno existente.\nPuede afectar la estabilidad de la calibración. ¿Agregar de todas formas?',
      { title: 'Punto de calibración cercano', confirmLabel: 'Agregar de todas formas' }
    ))) return;

    const step = matchPanoramaPoint(points, pending, point, crypto.randomUUID());
    setPoints(step.pairs);
    setPending(step.pending);
    if (!step.batchDone) return;
    // Lote terminado: de vuelta al plano en Seleccionar, para poder enderezar
    // los puntos de referencia sin cambiar de herramienta.
    goToView('blueprint');
    if (step.calibrationComplete) {
      setActiveTool('select');
      setNotice('Calibración lista. Ajustá los puntos en el plano si hace falta.');
    }
  };

  const cancel = () => {
    setPending([]);
    setActiveTool('select');
  };

  // Escape: si hay lote en curso se descarta y se vuelve al plano a elegir
  // de nuevo (sin salir de la herramienta); los pares ya hechos no se tocan
  // (se deshacen con Ctrl+Z). Sin lote, sale de la herramienta.
  const escape = () => {
    if (pending.length > 0) {
      setPending([]);
      goToView('blueprint');
    } else {
      cancel();
    }
  };

  const deletePoint = (index) => {
    onBeforeChange();
    setPoints(prev => prev.filter((_, i) => i !== index));
  };

  const deletePointById = (pairId) => {
    const index = points.findIndex(p => p._id === pairId);
    if (index !== -1) deletePoint(index);
  };

  const clear = async () => {
    if (points.length === 0) return;
    const ok = await confirm('¿Borrar toda la calibración? (podés deshacer con Ctrl+Z)', {
      title: 'Borrar calibración', danger: true, confirmLabel: 'Borrar',
    });
    if (!ok) return;
    onBeforeChange();
    setPoints([]);
    setActiveTool('select');
  };

  // Arrastre en vivo (panorama): se actualiza en cada movimiento para que la
  // proyección y los fantasmas se reacomoden en tiempo real. Devuelve false
  // si el marker no es un punto de calibración.
  const dragLive = (markerId, x, y) => {
    const pairId = parseCalibPointId(markerId);
    if (!pairId) return false;
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      // Snapshot en el primer movimiento (todavía con los pares de antes del
      // arrastre), así un solo Ctrl+Z revierte el arrastre entero.
      onBeforeChange();
    }
    setPoints(prev => moveCalibrationPoint(prev, pairId, mode === 'blueprint' ? 'blueprint' : 'panorama', [x, y]));
    return true;
  };

  // Soltar un punto: mueve solo el lado de la vista actual. En el panorama el
  // arrastre en vivo ya aplicó el cambio y el snapshot; en el plano (sin
  // arrastre en vivo) se aplica acá. Devuelve false si no era de calibración.
  const dragEnd = (markerId, x, y) => {
    const pairId = parseCalibPointId(markerId);
    if (!pairId) return false;
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return true;
    }
    onBeforeChange();
    setPoints(prev => moveCalibrationPoint(prev, pairId, mode === 'blueprint' ? 'blueprint' : 'panorama', [x, y]));
    return true;
  };

  return {
    // pares + setter (historial, borrador)
    points, setPoints, savedRef, load,
    homography,
    pending,
    notice, setNotice,
    handleClick, cancel, escape,
    deletePoint, deletePointById, clear,
    dragLive, dragEnd,
  };
}

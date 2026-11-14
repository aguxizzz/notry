// Estado del dibujo de manzanas y calles en la vista Satélite (ver
// utils/geoSurfaces.js para el modelo). Los clicks llegan del mapa en lat/lng y
// se guardan en coordenadas del plano, así se mueven junto con los lotes si se
// recalibra.
import { useMemo, useState } from 'react';
import { invertHomography } from '../utils/homography';
import { geoHomography } from '../utils/geoCalibration';
import {
  DEFAULT_STREET_WIDTH_M, EMPTY_GEO_SURFACES, addSurface, blueprintToGeo, findCalle, findSurfaceAt,
  geoToBlueprint, minPointsFor, removeSurface, setCalleWidth, surfaceRings,
} from '../utils/geoSurfaces';

// Click a esta distancia del primer punto (en fracción del plano) cierra la
// manzana. Fija porque no depende del zoom del mapa; Enter también cierra.
const CLOSE_DISTANCE = 0.012;

/**
 * `tool`: 'select', 'manzana' o 'calle'. Sin calibración geo válida no se
 * puede dibujar (no hay forma de llevar el click al plano ni de medir el ancho
 * en metros), así que la vista Satélite pide vincular primero.
 *
 * `onBeforeChange` se llama antes de cada cambio a las shapes (historial).
 */
export function useGeoSurfaces({ geoPoints, onBeforeChange }) {
  const [surfaces, setSurfaces] = useState(EMPTY_GEO_SURFACES);
  const [tool, setTool] = useState('select');
  const [drawing, setDrawing] = useState([]); // puntos del plano del trazo en curso
  const [selected, setSelected] = useState(null); // { kind, id }
  const [streetWidth, setStreetWidth] = useState(DEFAULT_STREET_WIDTH_M);

  const H = useMemo(() => geoHomography(geoPoints), [geoPoints]);
  const Hinv = useMemo(() => (H ? invertHomography(H) : null), [H]);

  // Contornos en el plano (para buscar clicks) y en geo (lo que dibuja el mapa).
  const rings = useMemo(() => surfaceRings(surfaces, H, Hinv), [surfaces, H, Hinv]);
  const geoRings = useMemo(
    () => (H ? rings.map(s => ({ ...s, ring: s.ring.map(p => blueprintToGeo(H, p)) })) : []),
    [rings, H]
  );
  const geoDrawing = useMemo(() => (H ? drawing.map(p => blueprintToGeo(H, p)) : []), [drawing, H]);

  const selectedCalle = selected?.kind === 'calle' ? findCalle(surfaces, selected.id) : null;

  /** Cambiar de herramienta corta el trazo y suelta la selección. Re-elegir la activa vuelve a Seleccionar. */
  const changeTool = (next) => {
    setTool(prev => (prev === next ? 'select' : next));
    setDrawing([]);
    setSelected(null);
  };

  /** Al salir de la vista: nada a medio dibujar ni seleccionado. */
  const reset = () => {
    setTool('select');
    setDrawing([]);
    setSelected(null);
  };

  const finish = () => {
    const kind = tool;
    if ((kind !== 'manzana' && kind !== 'calle') || drawing.length < minPointsFor(kind)) return false;
    onBeforeChange();
    setSurfaces(prev => addSurface(prev, { kind, points: drawing, width: streetWidth }));
    setDrawing([]);
    return true;
  };

  /** Un click en el mapa, { latitude, longitude }. */
  const handleMapPoint = ({ latitude, longitude }) => {
    if (!Hinv) return;
    const point = geoToBlueprint(Hinv, [latitude, longitude]);
    if (tool === 'select') {
      setSelected(findSurfaceAt(rings, point));
      return;
    }
    if (tool === 'manzana' && drawing.length >= 3) {
      const [fx, fy] = drawing[0];
      if (Math.hypot(point[0] - fx, point[1] - fy) < CLOSE_DISTANCE) { finish(); return; }
    }
    setDrawing(prev => [...prev, point]);
  };

  const deleteSelected = () => {
    if (!selected) return false;
    onBeforeChange();
    setSurfaces(prev => removeSurface(prev, selected));
    setSelected(null);
    return true;
  };

  // Ancho: se aplica a la calle seleccionada y queda como el de las próximas.
  // Un snapshot de historial por cambio del input (no por tecla del arrastre).
  const changeStreetWidth = (width) => {
    setStreetWidth(width);
    if (!selectedCalle) return;
    onBeforeChange();
    setSurfaces(prev => setCalleWidth(prev, selectedCalle.id, width));
  };

  /** Backspace/Delete: saca el último punto del trazo o borra la selección. */
  const handleDeleteKey = () => {
    if (drawing.length) {
      setDrawing(prev => prev.slice(0, -1));
      return true;
    }
    return deleteSelected();
  };

  /** Escape: corta el trazo, después la selección, después vuelve a Seleccionar. */
  const handleEscape = () => {
    if (drawing.length) { setDrawing([]); return; }
    if (selected) { setSelected(null); return; }
    setTool('select');
  };

  return {
    surfaces, setSurfaces,
    tool, setTool: changeTool, reset, canDraw: !!H,
    drawing, geoDrawing, selected, selectedCalle,
    geoRings,
    streetWidth, changeStreetWidth,
    handleMapPoint, finish, deleteSelected, handleDeleteKey, handleEscape,
  };
}

// Estado del dibujo de manzanas y calles en la vista Satélite (ver
// utils/geoSurfaces.js para el modelo). Los clicks llegan del mapa en lat/lng y
// se guardan en coordenadas del plano, así se mueven junto con los lotes si se
// recalibra.
import { useMemo, useState } from 'react';
import { invertHomography } from '../utils/homography';
import { geoHomography } from '../utils/geoCalibration';
import {
  DEFAULT_NATURAL_SHAPE, DEFAULT_STREET_WIDTH_M, EMPTY_GEO_SURFACES, NATURAL_KINDS, addSurface, blueprintToGeo,
  displayRings, findCalle, findNaturalArea, findSurfaceAt, geoToBlueprint, isAreaKind, minPointsFor, removeSurface,
  setAreaShape, setCalleWidth, snapToAxis, surfaceRings,
} from '../utils/geoSurfaces';

// Click a esta distancia del primer punto (en fracción del plano) cierra el
// polígono. Fija porque no depende del zoom del mapa; Enter también cierra.
const CLOSE_DISTANCE = 0.012;

/**
 * `tool`: 'select', 'calle' o un polígono de AREA_KINDS ('manzana', 'verde',
 * 'agua', 'perimetro'). Sin calibración geo válida no se
 * puede dibujar (no hay forma de llevar el click al plano ni de medir el ancho
 * en metros), así que la vista Satélite pide vincular primero.
 *
 * `onBeforeChange` se llama antes de cada cambio a las shapes (historial).
 * `onSelect` avisa cuando un click selecciona una shape (App abre el inspector).
 * `annotations` son los lotes del editor: verdes y agua se recortan contra ellos.
 */
export function useGeoSurfaces({ geoPoints, annotations, onBeforeChange, onSelect }) {
  const [surfaces, setSurfaces] = useState(EMPTY_GEO_SURFACES);
  const [tool, setTool] = useState('select');
  const [drawing, setDrawing] = useState([]); // puntos del plano del trazo en curso
  const [selected, setSelected] = useState(null); // { kind, id }
  const [streetWidth, setStreetWidth] = useState(DEFAULT_STREET_WIDTH_M);
  const [naturalShape, setNaturalShape] = useState(DEFAULT_NATURAL_SHAPE); // { curve, wobble } de verdes/agua

  const H = useMemo(() => geoHomography(geoPoints), [geoPoints]);
  const Hinv = useMemo(() => (H ? invertHomography(H) : null), [H]);

  // Contornos por shape en el plano (para buscar clicks y marcar la selección)
  // y, en geo, lo que dibuja el mapa: las calles ya fundidas entre sí.
  const lotRings = useMemo(() => (annotations ?? [])
    .filter(a => a.type === 'polygon' && a.blueprint_coordinates?.length >= 3)
    .map(a => a.blueprint_coordinates), [annotations]);
  const rings = useMemo(() => surfaceRings(surfaces, H, Hinv, lotRings), [surfaces, H, Hinv, lotRings]);
  const geoRings = useMemo(() => {
    if (!H) return [];
    const toGeo = ring => ring.map(p => blueprintToGeo(H, p));
    return displayRings(rings).map(s => ({ ...s, ring: toGeo(s.ring), holes: s.holes.map(toGeo) }));
  }, [rings, H]);
  // Borde de la shape seleccionada, aparte: dentro de la unión la calle ya no tiene contorno propio.
  const geoSelectedRing = useMemo(() => {
    const hit = H && selected && rings.find(s => s.kind === selected.kind && s.id === selected.id);
    return hit ? hit.ring.map(p => blueprintToGeo(H, p)) : null;
  }, [rings, H, selected]);
  const geoDrawing = useMemo(() => (H ? drawing.map(p => blueprintToGeo(H, p)) : []), [drawing, H]);

  const selectedCalle = selected?.kind === 'calle' ? findCalle(surfaces, selected.id) : null;
  const selectedArea = findNaturalArea(surfaces, selected);

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
    if ((!isAreaKind(kind) && kind !== 'calle') || drawing.length < minPointsFor(kind)) return false;
    onBeforeChange();
    setSurfaces(prev => addSurface(prev, { kind, points: drawing, width: streetWidth, natural: naturalShape }));
    setDrawing([]);
    return true;
  };

  /** Un click en el mapa, { latitude, longitude }. */
  const handleMapPoint = ({ latitude, longitude }) => {
    if (!Hinv) return;
    const raw = geoToBlueprint(Hinv, [latitude, longitude]);
    // Calles: pegado a los vértices de las otras, así un cruce o una T caen
    // exacto sobre el eje y, si es una punta, addSurface continúa esa calle.
    const point = tool === 'calle' ? snapToAxis(surfaces, raw) : raw;
    if (tool === 'select') {
      const hit = findSurfaceAt(rings, point);
      setSelected(hit);
      if (hit) onSelect?.(hit);
      return;
    }
    if (isAreaKind(tool) && drawing.length >= 3) {
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

  // Dos lugares cambian estos valores: la barra (con la herramienta activa,
  // para lo próximo que se dibuje, sin historial porque no toca ninguna shape)
  // y el inspector (la shape seleccionada, con historial).

  /** Ancho de la calle seleccionada. Un snapshot por cambio del input. */
  const changeSelectedCalleWidth = (width) => {
    if (!selectedCalle) return;
    onBeforeChange();
    setSurfaces(prev => setCalleWidth(prev, selectedCalle.id, width));
  };

  // Los sliders mandan un cambio por cada paso del arrastre, así que el
  // snapshot de historial se toma una sola vez al empezar el gesto
  // (beginSelectedAreaChange) y no en cada cambio.
  const beginSelectedAreaChange = () => {
    if (selectedArea) onBeforeChange();
  };
  /** `curve` y/o `wobble` del verde/agua seleccionado. */
  const changeSelectedArea = (patch) => {
    if (selectedArea) setSurfaces(prev => setAreaShape(prev, selected, patch));
  };
  const changeNaturalShape = patch => setNaturalShape(prev => ({ ...prev, ...patch }));

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
    tool, setTool: changeTool, reset, canDraw: !!H, isDrawingTool: tool === 'calle' || isAreaKind(tool),
    drawing, geoDrawing, selected, selectedCalle,
    geoRings, geoSelectedRing,
    // Para lo próximo a dibujar (barra).
    streetWidth, changeStreetWidth: setStreetWidth,
    naturalShape, changeNaturalShape, showNaturalShape: NATURAL_KINDS.has(tool),
    // La shape seleccionada (inspector).
    selectedArea, changeSelectedCalleWidth, beginSelectedAreaChange, changeSelectedArea,
    handleMapPoint, finish, deleteSelected, handleDeleteKey, handleEscape,
  };
}

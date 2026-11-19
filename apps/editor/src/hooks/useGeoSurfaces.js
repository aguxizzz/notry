// Estado del dibujo de manzanas, calles y textos en la vista Satélite (ver
// utils/geoSurfaces.js para el modelo). Los clicks llegan del mapa en lat/lng y
// se guardan en coordenadas del plano, así se mueven junto con los lotes si se
// recalibra.
import { useMemo, useRef, useState } from 'react';
import { makeProjection } from '@map3d/ground.js';
import { invertHomography } from '../utils/homography';
import { geoHomography } from '../utils/geoCalibration';
import {
  DEFAULT_NATURAL_SHAPE, DEFAULT_STREET_WIDTH_M, EMPTY_GEO_SURFACES, NATURAL_KINDS, addSurface, addText, blueprintToGeo,
  calleAngleAt, displayRings, findCalle, findNaturalArea, findSurfaceAt, findText, findTextAt, geoToBlueprint,
  isAreaKind, minPointsFor, pasteText, removeSurface, setAreaShape, setCalleWidth, snapToAxis, surfaceRings, updateText,
  wrapTextAngle,
} from '../utils/geoSurfaces';

// Click a esta distancia del primer punto (en fracción del plano) cierra el
// polígono. Fija porque no depende del zoom del mapa; Enter también cierra.
const CLOSE_DISTANCE = 0.012;

/**
 * `tool`: 'select', 'calle', 'texto' o un polígono de AREA_KINDS ('manzana', 'verde',
 * 'agua', 'perimetro'). Sin calibración geo válida no se
 * puede dibujar (no hay forma de llevar el click al plano ni de medir el ancho
 * en metros), así que la vista Satélite pide vincular primero.
 *
 * `onBeforeChange` se llama antes de cada cambio a las shapes (historial).
 * `onSelect` avisa cuando un click selecciona una shape (App abre el inspector).
 * `annotations` son los lotes del editor: verdes y agua se recortan contra ellos.
 * `onSelectLot(id | null)`: los lotes también se clickean acá, pero su selección
 * vive en App (selectedId) porque el inspector del lote es el mismo de las otras vistas.
 */
export function useGeoSurfaces({ geoPoints, annotations, onBeforeChange, onSelect, onSelectLot }) {
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
  const lots = useMemo(() => (annotations ?? [])
    .filter(a => a.type === 'polygon' && a.blueprint_coordinates?.length >= 3), [annotations]);
  const lotRings = useMemo(() => lots.map(a => a.blueprint_coordinates), [lots]);
  const rings = useMemo(() => surfaceRings(surfaces, H, Hinv, lotRings), [surfaces, H, Hinv, lotRings]);
  // Lo que se puede clickear: las superficies más los lotes (que no se pintan
  // desde acá, así que no van en `rings`).
  const pickRings = useMemo(() => [
    ...lots.map(a => ({ kind: 'lote', id: a.id, ring: a.blueprint_coordinates, holes: [] })),
    ...rings,
  ], [lots, rings]);
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
  // Textos para el mapa, en lat/lng; la escena los pasa a metros.
  const geoTexts = useMemo(() => (H ? (surfaces.textos ?? []).map(t => {
    const [lat, lng] = blueprintToGeo(H, t.point);
    return { ...t, lat, lng };
  }) : []), [surfaces.textos, H]);

  const selectedCalle = selected?.kind === 'calle' ? findCalle(surfaces, selected.id) : null;
  const selectedArea = findNaturalArea(surfaces, selected);
  const selectedText = selected?.kind === 'texto' ? findText(surfaces, selected.id) : null;

  /** Selecciona una superficie o texto (o nada) y suelta el lote, que vive en App. */
  const selectShape = (hit) => {
    const isLot = hit?.kind === 'lote';
    setSelected(isLot ? null : hit);
    onSelectLot?.(isLot ? hit.id : null);
    if (hit) onSelect?.(hit);
  };

  /** Cambiar de herramienta corta el trazo y suelta la selección. Re-elegir la activa vuelve a Seleccionar. */
  const changeTool = (next) => {
    setTool(prev => (prev === next ? 'select' : next));
    setDrawing([]);
    setSelected(null);
    onSelectLot?.(null);
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
      // Los textos van arriba de todo en el mapa, así que se buscan primero.
      // Una sola cosa seleccionada a la vez: o una superficie/texto (acá) o un lote (en App).
      const textId = findTextAt(surfaces.textos, raw, H);
      selectShape(textId ? { kind: 'texto', id: textId } : findSurfaceAt(pickRings, point));
      return;
    }
    if (tool === 'texto') {
      // Sobre una calle sale alineado con ella; el inspector se abre con el
      // texto seleccionado para escribirlo, y se vuelve a Seleccionar para
      // poder arrastrarlo enseguida.
      const angle = calleAngleAt(surfaces, rings.filter(r => r.kind === 'calle'), raw, H);
      const { surfaces: next, id } = addText(surfaces, { point: raw, angle });
      onBeforeChange();
      setSurfaces(next);
      setTool('select');
      selectShape({ kind: 'texto', id });
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

  // Edición del texto seleccionado. Igual que los sliders, el snapshot de
  // historial se toma al empezar (foco en el campo, o tocar un slider), no
  // por cada letra.
  const beginSelectedTextChange = () => {
    if (selectedText) onBeforeChange();
  };
  /** Campos del texto seleccionado (text, size, angle, style). */
  const changeSelectedText = (patch) => {
    if (selectedText) setSurfaces(prev => updateText(prev, selectedText.id, patch));
  };

  // Portapapeles propio (no el del sistema): guarda el texto tal cual, así
  // también se puede pegar en otro loteo. Se pega corrido, al lado del original.
  const clipboardRef = useRef(null);
  const copySelected = () => {
    if (!selectedText) return false;
    clipboardRef.current = selectedText;
    return true;
  };
  const paste = () => {
    if (!clipboardRef.current || !H) return false;
    onBeforeChange();
    const { surfaces: next, id } = pasteText(surfaces, clipboardRef.current, H, Hinv);
    setSurfaces(next);
    // Lo pegado queda copiado: Ctrl+V otra vez pone otro al lado de este, en escalera.
    clipboardRef.current = findText(next, id);
    selectShape({ kind: 'texto', id });
    return true;
  };
  const duplicateSelected = () => copySelected() && paste();

  // Arrastre de textos con Seleccionar: el mapa pregunta al apretar si hay
  // algo para agarrar (canDragAt) y después manda el movimiento (drag).
  // Con Alt apretado el arrastre gira el texto alrededor de su centro.
  const dragRef = useRef(null); // { id, moved, mode, origin, ... }
  /** ¿Hay un texto bajo { latitude, longitude }? Si hay, queda seleccionado y agarrado. */
  const canDragAt = ({ latitude, longitude }) => {
    if (tool !== 'select' || !Hinv) return false;
    const id = findTextAt(surfaces.textos, geoToBlueprint(Hinv, [latitude, longitude]), H);
    if (!id) return false;
    dragRef.current = { id, moved: false };
    selectShape({ kind: 'texto', id });
    return true;
  };
  /**
   * { phase: 'move' | 'end', from, to, alt } en lat/lng: el texto sigue al
   * puntero, o con Alt gira (lo decide el primer movimiento, no cambia a mitad).
   */
  const drag = ({ phase, from, to, alt }) => {
    const grabbed = dragRef.current;
    if (!grabbed || !Hinv) return;
    if (phase === 'end') { dragRef.current = null; return; }
    if (phase !== 'move') return;
    // Un solo snapshot por arrastre, y ninguno si fue solo un clic.
    if (!grabbed.moved) {
      onBeforeChange();
      grabbed.moved = true;
      const start = findText(surfaces, grabbed.id);
      if (!start) return;
      grabbed.origin = start.point;
      grabbed.mode = alt ? 'rotate' : 'move';
      if (grabbed.mode === 'rotate') {
        // Ángulos medidos en metros alrededor del centro del texto; uno que
        // giraba con la cámara arranca horizontal y pasa a fijo.
        const [lat, lng] = blueprintToGeo(H, start.point);
        grabbed.toLocal = makeProjection(lat, lng).toLocal;
        grabbed.baseAngle = start.angle ?? 0;
      }
    }
    if (!grabbed.origin) return;
    if (grabbed.mode === 'rotate') {
      const bearing = (p) => {
        const { x, z } = grabbed.toLocal(p.latitude, p.longitude);
        return (Math.atan2(z, x) * 180) / Math.PI; // mismo sentido que el ángulo del texto
      };
      const angle = wrapTextAngle(grabbed.baseAngle + bearing(to) - bearing(from));
      setSurfaces(prev => updateText(prev, grabbed.id, { angle }));
      return;
    }
    // Se mueve por la diferencia desde donde se agarró, no al puntero: así el
    // texto no salta a centrarse bajo el mouse.
    const a = geoToBlueprint(Hinv, [from.latitude, from.longitude]);
    const b = geoToBlueprint(Hinv, [to.latitude, to.longitude]);
    const [ox, oy] = grabbed.origin;
    setSurfaces(prev => updateText(prev, grabbed.id, { point: [ox + b[0] - a[0], oy + b[1] - a[1]] }));
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
    isDrawingTool: tool === 'calle' || tool === 'texto' || isAreaKind(tool),
    drawing, geoDrawing, selected, selectedCalle, selectedText,
    geoRings, geoSelectedRing, geoTexts,
    // Para lo próximo a dibujar (barra).
    streetWidth, changeStreetWidth: setStreetWidth,
    naturalShape, changeNaturalShape, showNaturalShape: NATURAL_KINDS.has(tool),
    // La shape seleccionada (inspector).
    selectedArea, changeSelectedCalleWidth, beginSelectedAreaChange, changeSelectedArea,
    beginSelectedTextChange, changeSelectedText,
    copySelected, paste, duplicateSelected,
    canDragAt, drag,
    handleMapPoint, finish, deleteSelected, handleDeleteKey, handleEscape,
  };
}

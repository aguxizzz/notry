import { useState, useEffect } from 'react';

// Alto de la ficha en celular (fracción de la pantalla). Lo usa LotFloat para
// la hoja y el visor para encuadrar el lote en lo que queda libre arriba.
export const FLOAT_SHEET_RATIO = 0.56;

// Escritorio con lugar para el panel lateral (lista de lotes + ficha). En
// celular y apaisado chico va el flotante (LotFloat).
const LOT_PANEL_QUERY = '(min-width: 768px) and (min-height: 520px)';

// Aire entre el lote encuadrado y lo que lo tapa.
const PANEL_MARGIN = 16;

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// Panel colapsado: a propósito NO es estado de React. Si lo fuera, ocultar o
// mostrar el panel re-renderizaba el visor entero (lista de lotes incluida) y
// en un celular de gama baja eso trababa medio segundo o más. Vive en la
// clase lp-collapsed de <html> (el CSS mueve el panel con eso) y quien
// necesite enterarse (el mapa 3D, para re-encuadrar) se suscribe.
const collapseListeners = new Set();

export function isPanelCollapsed() {
  return document.documentElement.classList.contains('lp-collapsed');
}

function setPanelCollapsed(value) {
  if (value === isPanelCollapsed()) return;
  document.documentElement.classList.toggle('lp-collapsed', value);
  collapseListeners.forEach((fn) => fn());
}

export const expandPanel = () => setPanelCollapsed(false);
export const togglePanelCollapsed = () => setPanelCollapsed(!isPanelCollapsed());

/** Avisa cada vez que el panel se colapsa o se abre. Devuelve la desuscripción. */
export function subscribePanelCollapsed(fn) {
  collapseListeners.add(fn);
  return () => collapseListeners.delete(fn);
}

/**
 * Qué interfaz de lotes va (panel lateral o flotante). El resto del visor
 * (brújula, avisos de etapa) se acomoda con las clases lp-on / lf-on en
 * <html>, y con lp-collapsed (siempre junto a lp-on en el CSS) cuando el
 * panel está oculto.
 */
export function usePanelLayout() {
  const usePanel = useMediaQuery(LOT_PANEL_QUERY);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('lp-on', usePanel);
    root.classList.toggle('lf-on', !usePanel);
    return () => root.classList.remove('lp-on', 'lf-on');
  }, [usePanel]);

  // Al desmontar el visor el panel vuelve a arrancar abierto, como antes.
  useEffect(() => () => document.documentElement.classList.remove('lp-collapsed'), []);

  return { usePanel };
}

/**
 * Cuánto tapa la interfaz de lotes, para encuadrar un lote en lo que queda
 * libre (focusMarker, órbita). Con el panel lateral la ficha vive adentro: lo
 * que tapa es el panel. En celular tapan la barra de arriba y la ficha, que
 * sube desde abajo.
 */
export function getLotPanelInsets() {
  const float = document.getElementById('lot-float');
  if (float) {
    const top = float.querySelector('.lf-top')?.getBoundingClientRect().bottom ?? 0;
    return { top: top + PANEL_MARGIN / 2, bottom: Math.round(window.innerHeight * FLOAT_SHEET_RATIO) };
  }
  const lotPanel = document.getElementById('lot-panel');
  if (!lotPanel || isPanelCollapsed()) return {};
  // offsetLeft/offsetWidth y no getBoundingClientRect: el panel entra y sale
  // con un transform animado, y a mitad de la animación el rect da cualquier cosa.
  return { left: lotPanel.offsetLeft + lotPanel.offsetWidth + PANEL_MARGIN };
}

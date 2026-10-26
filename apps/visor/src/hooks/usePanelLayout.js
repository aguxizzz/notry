import { useState, useEffect, useCallback } from 'react';

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

/**
 * Qué interfaz de lotes va (panel lateral o flotante) y si el panel está
 * colapsado. El resto del visor (brújula, avisos de etapa) se acomoda con las
 * clases lp-on / lp-collapsed / lf-on en <html>.
 */
export function usePanelLayout() {
  const usePanel = useMediaQuery(LOT_PANEL_QUERY);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('lp-on', usePanel);
    root.classList.toggle('lp-collapsed', usePanel && collapsed);
    root.classList.toggle('lf-on', !usePanel);
    return () => root.classList.remove('lp-on', 'lp-collapsed', 'lf-on');
  }, [usePanel, collapsed]);

  const expand = useCallback(() => setCollapsed(false), []);
  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);

  return { usePanel, collapsed, expand, toggleCollapsed };
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
  if (!lotPanel || lotPanel.dataset.collapsed === '1') return {};
  return { left: lotPanel.getBoundingClientRect().right + PANEL_MARGIN };
}

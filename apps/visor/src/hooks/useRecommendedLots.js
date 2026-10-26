import { useState, useEffect, useRef, useCallback } from 'react';
import { RECOMMENDED_LOT_IDS } from '../urlParams.js';

/**
 * Lotes recomendados por el simulador de compra y el "modo foco" (apaga el
 * resto). Al llegar recomendados por primera vez el modo foco se activa solo;
 * si el usuario lo apaga a mano, no se vuelve a forzar.
 */
export function useRecommendedLots() {
  const [recommendedIds, setRecommendedIds] = useState(() => new Set(RECOMMENDED_LOT_IDS));
  const [focusMode, setFocusMode] = useState(RECOMMENDED_LOT_IDS.length > 0);
  const autoFocusedRef = useRef(RECOMMENDED_LOT_IDS.length > 0);

  // Puente con el simulador de compra: cuando corre embebido en la misma
  // landing, manda `eligibleLotIds` por postMessage al abrir "Ver lotes
  // compatibles". Sin esa integración, ?recommended=id1,id2 sirve para probar.
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type !== 'notry:simulator-view-lots' || !Array.isArray(event.data.eligibleLotIds)) return;
      const ids = new Set(event.data.eligibleLotIds);
      setRecommendedIds(ids);
      if (ids.size > 0 && !autoFocusedRef.current) {
        autoFocusedRef.current = true;
        setFocusMode(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const toggleFocusMode = useCallback(() => setFocusMode((value) => !value), []);

  return { recommendedIds, focusMode, toggleFocusMode };
}

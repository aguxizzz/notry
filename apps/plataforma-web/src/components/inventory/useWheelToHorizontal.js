import { useCallback, useRef } from 'react';

// Ref-callback: convierte la rueda vertical del mouse en scroll horizontal
// (sólo cuando el contenedor tiene overflow lateral). Listener nativo no-pasivo
// para poder preventDefault. Se re-attachea si el nodo se monta/desmonta.
export function useWheelToHorizontal() {
  const cleanup = useRef(null);
  return useCallback((el) => {
    if (cleanup.current) { cleanup.current(); cleanup.current = null; }
    if (!el) return;
    const onWheel = (e) => {
      if (e.shiftKey) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta || el.scrollWidth <= el.clientWidth) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const next = Math.max(0, Math.min(maxScroll, el.scrollLeft + delta));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft = next;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    cleanup.current = () => el.removeEventListener('wheel', onWheel);
  }, []);
}

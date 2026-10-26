// Rumbo de la cámara (yaw, radianes) fuera del estado de React: cambia en
// cada frame mientras se mueve la vista, y si viviera en un useState
// re-renderizaría todo el visor. Las brújulas se suscriben y escriben su
// transform directo en el DOM.
export function createHeadingStore(initial = 0) {
  let yaw = initial;
  const listeners = new Set();
  return {
    get: () => yaw,
    set(next) {
      if (next === yaw) return;
      yaw = next;
      listeners.forEach((fn) => fn(yaw));
    },
    // Llama a `fn` con el valor actual y después en cada cambio.
    subscribe(fn) {
      listeners.add(fn);
      fn(yaw);
      return () => listeners.delete(fn);
    },
  };
}

// Rumbo en grados [0, 360) con el norte del panorama en 0.
export function headingDegrees(yaw, northOffset) {
  return ((((yaw - northOffset) * 180) / Math.PI) % 360 + 360) % 360;
}

// Diferencia más corta entre dos rumbos, en [-180, 180): 359 → 1 es +2, no -358.
export function shortestDelta(from, to) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

// Modo liviano para equipos de gama baja: se decide una vez al cargar y se
// marca con la clase `perf-lite` en <html>; el CSS saca lo que se recalcula
// en cada cuadro mientras se mueve el panorama (backdrop-filter, drop-shadow
// animado en los lotes). ?lite=1 lo fuerza y ?lite=0 lo apaga, para probar.

/**
 * @param {{ deviceMemory?: number, hardwareConcurrency?: number, connection?: { saveData?: boolean } }} nav
 * @param {string|null} override - valor de ?lite=
 */
export function isLowTierDevice(nav, override = null) {
  if (override === '1') return true;
  if (override === '0') return false;
  // deviceMemory solo existe en Chrome (y viene redondeado, tope 8).
  if (nav.deviceMemory != null && nav.deviceMemory <= 4) return true;
  if (nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 4) return true;
  return Boolean(nav.connection?.saveData);
}

export function applyPerfClass() {
  const override = new URLSearchParams(window.location.search).get('lite');
  const lite = isLowTierDevice(navigator, override);
  document.documentElement.classList.toggle('perf-lite', lite);
  return lite;
}

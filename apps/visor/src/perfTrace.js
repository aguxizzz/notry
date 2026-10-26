// TEMPORAL — diagnóstico del freeze al entrar/salir de la órbita en celulares
// de gama baja. Con ?perfdebug=1 muestra en pantalla las fases marcadas y
// cada cuadro que tardó de más (con la última fase antes del salto). Sin el
// parámetro no hace nada. Borrar cuando se resuelva.

const ENABLED = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('perfdebug') === '1';

const LONG_FRAME_MS = 80;
const MAX_LINES = 18;

let box = null;
let t0 = 0;
let lastMark = '—';
const lines = [];

function print(text) {
  lines.push(text);
  if (lines.length > MAX_LINES) lines.shift();
  console.info(`[perf] ${text}`);
  if (!box) {
    box = document.createElement('pre');
    box.style.cssText = 'position:fixed;top:4px;left:4px;z-index:99999;margin:0;padding:6px 8px;max-width:70vw;'
      + 'font:11px/1.35 monospace;color:#0f0;background:rgba(0,0,0,.78);border-radius:6px;pointer-events:auto;white-space:pre-wrap';
    box.addEventListener('click', () => { lines.length = 0; box.textContent = ''; t0 = 0; });
    document.body.appendChild(box);
  }
  box.textContent = lines.join('\n');
}

const stamp = () => {
  const now = performance.now();
  if (!t0) t0 = now;
  return `${String(Math.round(now - t0)).padStart(5)}ms`;
};

/** Marca una fase (y cuánto tardó si se pasa `ms`). */
export function perfMark(label, ms = null) {
  if (!ENABLED) return;
  lastMark = label;
  print(`${stamp()} ${label}${ms != null ? ` (${ms.toFixed(0)}ms)` : ''}`);
}

/** Corre fn y marca cuánto tardó. */
export function perfTime(label, fn) {
  if (!ENABLED) return fn();
  const start = performance.now();
  try { return fn(); } finally { perfMark(label, performance.now() - start); }
}

if (ENABLED) {
  let prev = performance.now();
  const tick = (now) => {
    const gap = now - prev;
    prev = now;
    if (gap > LONG_FRAME_MS) print(`${stamp()} ⚠ cuadro ${gap.toFixed(0)}ms tras «${lastMark}»`);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) print(`${stamp()} longtask ${entry.duration.toFixed(0)}ms tras «${lastMark}»`);
    }).observe({ type: 'longtask', buffered: false });
  } catch (_) { /* sin longtask (Safari) */ }
}

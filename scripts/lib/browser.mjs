// Helpers compartidos para scripts de Playwright entre las 3 apps de notry
// (plataforma-web, editor, visor). Mantenerlo chico: esto es para scripts de
// debugging/testeo visual ad-hoc, no un framework de tests.

import { chromium } from 'playwright';

// Parsea argv en { positional: [...], flags: { nombre: valor|true } }.
// Uso: node script.mjs <url> [salida] --full --mobile --width=800
export function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = Object.fromEntries(
    argv
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v ?? true];
      }),
  );
  return { positional, flags };
}

// Viewport estándar a partir de flags (--mobile, --width=, --height=).
export function viewportFromFlags(flags) {
  const mobile = Boolean(flags.mobile);
  const width = Number(flags.width) || (mobile ? 390 : 1440);
  const height = Number(flags.height) || (mobile ? 844 : 900);
  return { width, height, deviceScaleFactor: mobile ? 3 : 1, mobile };
}

// Lanza Chromium y devuelve { browser, page } con el viewport dado.
// Cerrar el browser queda a cargo del caller (try/finally).
export async function launchPage(viewport = { width: 1440, height: 900 }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
  });
  return { browser, page };
}

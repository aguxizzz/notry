#!/usr/bin/env node
// Captura de pantalla rápida de una URL usando el Chromium propio de Playwright.
//
// Uso:
//   node scripts/shot.mjs <url> [salida.png] [opciones]
//
// Opciones:
//   --width=<n>     ancho del viewport (default 1440)
//   --height=<n>    alto del viewport (default 900)
//   --full          captura la página completa (scroll), no solo el viewport
//   --wait=<ms>     espera extra tras cargar (default 800)
//   --mobile        viewport mobile (390x844)
//
// Ejemplos:
//   node scripts/shot.mjs http://localhost:5173 /tmp/home.png
//   node scripts/shot.mjs http://localhost:5173/login /tmp/login.png --full
//   node scripts/shot.mjs http://localhost:5173 /tmp/m.png --mobile

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
);

const url = positional[0];
const out = positional[1] ?? `/tmp/shot-${Date.now()}.png`;

if (!url) {
  console.error('Falta la URL. Uso: node scripts/shot.mjs <url> [salida.png]');
  process.exit(1);
}

const mobile = Boolean(flags.mobile);
const width = Number(flags.width) || (mobile ? 390 : 1440);
const height = Number(flags.height) || (mobile ? 844 : 900);
const wait = Number(flags.wait ?? 800);
const fullPage = Boolean(flags.full);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: mobile ? 3 : 1,
});

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  if (wait) await page.waitForTimeout(wait);
  await page.screenshot({ path: out, fullPage });
  console.log(`OK -> ${out} (${width}x${height}${fullPage ? ', full' : ''})`);
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

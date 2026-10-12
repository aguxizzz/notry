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
//   --login         loguea antes de capturar (usa TEST_EMAIL/TEST_PASSWORD del
//                   entorno, o la cuenta de testeo lote_owner por default —
//                   ver memoria "reference_test_credentials")
//
// Ejemplos:
//   node scripts/shot.mjs http://localhost:5173 /tmp/home.png
//   node scripts/shot.mjs http://localhost:5173/login /tmp/login.png --full
//   node scripts/shot.mjs http://localhost:5173 /tmp/m.png --mobile
//   node scripts/shot.mjs http://localhost:5173 /tmp/home.png --login

import { parseArgs, viewportFromFlags, launchPage } from './lib/browser.mjs';
import { login } from './lib/auth.mjs';

const { positional, flags } = parseArgs(process.argv.slice(2));

const url = positional[0];
const out = positional[1] ?? `/tmp/shot-${Date.now()}.png`;

if (!url) {
  console.error('Falta la URL. Uso: node scripts/shot.mjs <url> [salida.png]');
  process.exit(1);
}

const viewport = viewportFromFlags(flags);
const wait = Number(flags.wait ?? 800);
const fullPage = Boolean(flags.full);

const { browser, page } = await launchPage(viewport);

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  if (flags.login) {
    await login(page, {
      email: process.env.TEST_EMAIL || 'aguxis@a.a',
      password: process.env.TEST_PASSWORD || 'password',
    });
    await page.waitForLoadState('networkidle');
  }
  if (wait) await page.waitForTimeout(wait);
  await page.screenshot({ path: out, fullPage });
  console.log(`OK -> ${out} (${viewport.width}x${viewport.height}${fullPage ? ', full' : ''})`);
} catch (err) {
  console.error('Error:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

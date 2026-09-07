import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const PORT = 54174;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const projectRoot = new URL('../../../', import.meta.url).pathname;
const fixtureRoot = new URL('../fotos_equirrectangulares/', import.meta.url);

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('El servidor de prueba del visor no inició a tiempo.');
}

function stage(id, name, panoramaUrl, tipo = 'etapa') {
  return { id, name, tipo, visor: { panoramaUrl, annotations: [] } };
}

async function fulfillGroup(page, url, stages) {
  await page.route(url, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ entry_stage_id: stages[0].id, stages }),
  }));
}

async function waitForCommitted(page, name) {
  await page.waitForFunction(
    (expected) => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.includes(expected),
    name,
    { timeout: 15_000 },
  );
}

async function testLatestSelectionWins(browser, images) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const dataUrl = `${BASE_URL}/__tests/latest.json`;
  const stages = [
    stage('a', 'Etapa A', `${BASE_URL}/__tests/a.jpg`, 'general'),
    stage('b', 'Etapa B', `${BASE_URL}/__tests/b.jpg`),
    stage('c', 'Etapa C', `${BASE_URL}/__tests/c.jpg`),
  ];
  await fulfillGroup(page, dataUrl, stages);
  for (const [name, body] of Object.entries(images)) {
    await page.route(`${BASE_URL}/__tests/${name}.jpg`, (route) => route.fulfill({
      status: 200, contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' }, body,
    }));
  }
  await page.goto(`${BASE_URL}/?data=${encodeURIComponent(dataUrl)}`);
  await waitForCommitted(page, 'Etapa A');

  await page.getByRole('tab', { name: 'Etapa A' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent.includes('Etapa B')), true);
  await page.keyboard.press('Enter');
  await page.getByRole('tab', { name: 'Etapa C' }).click();
  await page.getByRole('tab', { name: 'Etapa A' }).click();
  await page.getByRole('tab', { name: 'Etapa B' }).click();

  await waitForCommitted(page, 'Etapa B');
  assert.equal(await page.locator('[role="tab"][aria-busy="true"]').count(), 0);
  assert.equal(await page.locator('.stage-transition-error').count(), 0);
  assert.deepEqual(runtimeErrors, []);
  await page.close();
}

async function testFailureKeepsPreviousAndRetryWorks(browser, images) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const dataUrl = `${BASE_URL}/__tests/retry.json`;
  await fulfillGroup(page, dataUrl, [
    stage('a', 'Inicial', `${BASE_URL}/__tests/retry-a.jpg`, 'general'),
    stage('b', 'Reintento', `${BASE_URL}/__tests/retry-b.jpg`),
  ]);
  await page.route(`${BASE_URL}/__tests/retry-a.jpg`, (route) => route.fulfill({
    status: 200, contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' }, body: images.a,
  }));
  let failedOnce = false;
  await page.route(`${BASE_URL}/__tests/retry-b.jpg`, (route) => {
    if (!failedOnce) {
      failedOnce = true;
      return route.abort('failed');
    }
    return route.fulfill({
      status: 200, contentType: 'image/jpeg',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: images.b,
    });
  });

  await page.goto(`${BASE_URL}/?data=${encodeURIComponent(dataUrl)}`);
  await waitForCommitted(page, 'Inicial');
  await page.getByRole('tab', { name: 'Reintento' }).click();
  const retry = page.getByRole('button', { name: 'Reintentar' });
  await retry.waitFor({ state: 'visible', timeout: 15_000 });
  assert.match(await page.locator('[role="tab"][aria-selected="true"]').innerText(), /Inicial/);
  await retry.click();
  await waitForCommitted(page, 'Reintento');
  assert.equal(await page.locator('.stage-transition-error').count(), 0);
  assert.equal(failedOnce, true);
  await page.close();
}

const server = spawn(
  'npm', ['run', 'dev', '-w', 'visor', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] },
);
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  const images = {
    a: await readFile(new URL('exterior_occidente.jpg', fixtureRoot)),
    b: await readFile(new URL('exterior_oriente.jpg', fixtureRoot)),
    c: await readFile(new URL('interior_casa.jpg', fixtureRoot)),
  };
  await testLatestSelectionWins(browser, images);
  await browser.close();
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
  await testFailureKeepsPreviousAndRetryWorks(browser, images);
  console.log('stage-switcher: 2 escenarios OK');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

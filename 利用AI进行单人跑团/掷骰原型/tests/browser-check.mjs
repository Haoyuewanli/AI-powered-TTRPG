import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = await import(process.env.DICE_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.DICE_BROWSER_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const issues = [];
const requests = [];
page.on('pageerror', error => issues.push(error.message));
page.on('request', request => requests.push(request.url()));
page.on('response', response => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`); });
try {
  await page.goto('http://127.0.0.1:4173');
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  console.log('INIT', await page.locator('#notice').innerText());
  await page.locator('#roll').click();
  await page.waitForFunction(() => !document.getElementById('roll').disabled, null, { timeout: 20000 });
  console.log('FIRST', await page.locator('#notice').innerText());
  const dice = await page.evaluate(async () => {
    const { animator } = await import('/src/app.mjs');
    return { renderer: animator.box.renderer.getContext().getParameter(7937),
      rolls: animator.latestResult, faces: animator.box.diceList.map(die => die.getFaceValue()) };
  });
  console.log('DICE', JSON.stringify(dice));
  assert.equal(await page.locator('#notice').evaluate(element => element.classList.contains('error')), false);
  assert.ok(dice.rolls);
  const cases = [[4, [1, 2, 4]], [6, [1, 3, 6]], [8, [1, 4, 8]], [10, [1, 5, 10]],
    [12, [1, 6, 12]], [20, [1, 10, 20]], [100, [1, 100, 7, 30, 99]]];
  const measurements = [];
  for (const [sides, values] of cases) {
    const check = await page.evaluate(async ({ sides, values }) => {
      const { animator } = await import('/src/app.mjs');
      const record = { version: 1, id: `browser-${sides}`, createdAt: '2026-10-22T00:00:00Z',
        sides, count: values.length, values, total: values.reduce((a, b) => a + b, 0) };
      const started = performance.now();
      let result;
      try { result = await animator.play(record); }
      catch (error) { return { sides, error: error.message, details: error.cause }; }
      return { sides, status: result.status, milliseconds: performance.now() - started,
        faces: animator.box.diceList.map(die => die.getFaceValue()), result: animator.latestResult };
    }, { sides, values });
    assert.equal(check.status, 'complete', `d${sides}: ${JSON.stringify(check)}`);
    assert.ok(check.result);
    measurements.push(check);
    console.log('TYPE', sides, check.status, Math.round(check.milliseconds));
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const stress = await page.evaluate(async () => {
    const { animator } = await import('/src/app.mjs');
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    const record = { version: 1, id: 'stress', createdAt: '2026-10-22T00:00:00Z',
      sides: 20, count: 20, values, total: 210 };
    const intervals = [];
    let previous;
    const renderer = animator.box.renderer;
    const render = renderer.render.bind(renderer);
    renderer.render = (...args) => {
      if (animator.box.animstate === 'throw') {
        const now = performance.now();
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
      }
      return render(...args);
    };
    const start = performance.now();
    const result = await animator.play(record);
    renderer.render = render;
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { status: result.status, milliseconds: performance.now() - start,
      frames: intervals.length, averageFrameMs: intervals.reduce((a, b) => a + b, 0) / intervals.length,
      p95FrameMs: intervals.sort((a, b) => a - b)[Math.floor(intervals.length * 0.95)],
      viewport: [innerWidth, innerHeight], browser: navigator.userAgent,
      gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      geometries: animator.box.renderer.info.memory.geometries,
      faces: animator.box.diceList.map(die => die.getFaceValue().value) };
  });
  assert.equal(stress.status, 'complete');
  assert.deepEqual(stress.faces, Array.from({ length: 20 }, (_, index) => index + 1));
  console.log('STRESS', JSON.stringify(stress));

  const percentileStress = await page.evaluate(async () => {
    const { animator } = await import('/src/app.mjs');
    const values = Array.from({ length: 20 }, (_, index) => index * 5 + 1);
    const record = { version: 1, id: 'percentile-stress', createdAt: '2026-10-22T00:00:00Z',
      sides: 100, count: 20, values, total: values.reduce((a, b) => a + b, 0) };
    const result = await animator.play(record);
    return { status: result.status, physicalDice: animator.box.diceList.length };
  });
  assert.equal(percentileStress.status, 'complete');
  assert.equal(percentileStress.physicalDice, 40);
  console.log('PERCENTILE STRESS', JSON.stringify(percentileStress));

  const storageKey = 'solo-dice-prototype.last-roll.v1';
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  const beforeReplay = await page.evaluate(key => localStorage.getItem(key), storageKey);
  const restored = JSON.parse(beforeReplay);
  assert.equal(await page.locator('#total').innerText(), String(restored.total));
  await page.locator('#replay').click();
  await page.locator('#skip').click();
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), beforeReplay);
  assert.equal(await page.locator('#total').innerText(), String(restored.total));
  console.log('RECOVERY replay + skip + reload preserved the record');

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = () => { throw new Error('injected write failure'); };
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    window.samplingCalls = 0;
    crypto.getRandomValues = array => { window.samplingCalls++; return getRandomValues(array); };
  });
  await page.locator('#roll').click();
  assert.match(await page.locator('#notice').innerText(), /保存失败/);
  const callsBefore = await page.evaluate(() => window.samplingCalls);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), beforeReplay);
  await page.evaluate(() => window.restoreStorage());
  await page.locator('#roll').click();
  await page.locator('#skip').click();
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await page.evaluate(() => window.samplingCalls), callsBefore);
  console.log('RECOVERY failed save retries without drawing again');

  await page.locator('#roll').click();
  const beforeResize = await page.evaluate(key => localStorage.getItem(key), storageKey);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), beforeResize);
  assert.equal(await page.locator('#total').innerText(), String(JSON.parse(beforeResize).total));
  console.log('RECOVERY resize preserved the record');

  const lifecycle = await page.evaluate(async () => {
    const { animator } = await import('/src/app.mjs');
    return { contactMaterials: animator.box.world.contactmaterials.length };
  });
  assert.equal(lifecycle.contactMaterials, 3);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-sides="20"]').click();
  await page.locator('#count').fill('5');
  await page.locator('#roll').click();
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await page.locator('#notice').evaluate(element => element.classList.contains('error')), false);
  assert.equal(requests.every(url => url.startsWith('http://127.0.0.1:4173/')), true);
  assert.deepEqual(issues, []);
  await mkdir('test-output', { recursive: true });
  await page.screenshot({ path: 'test-output/first-roll.png', fullPage: true });
  await writeFile('test-output/browser-results.json', JSON.stringify({ first: dice, measurements, stress, percentileStress, lifecycle, issues }, null, 2));
} finally {
  await browser.close();
}

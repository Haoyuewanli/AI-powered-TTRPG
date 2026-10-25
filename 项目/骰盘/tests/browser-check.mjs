import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const targetUrl = process.env.DICE_TEST_URL || 'http://127.0.0.1:4173';
const offline = targetUrl.startsWith('file:');
const outputDir = process.env.DICE_TEST_OUTPUT || fileURLToPath(new URL('../../../开发记录/临时/骰盘/', import.meta.url));
const { chromium } = await import(process.env.DICE_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.DICE_BROWSER_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const issues = [];
const requests = [];
page.on('pageerror', error => issues.push(error.message));
page.on('request', request => requests.push(request.url()));
page.on('response', response => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url().slice(0, 160)}`); });
try {
  if (offline) await page.context().setOffline(true);
  await page.goto(targetUrl);
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  console.log('INIT', await page.locator('#notice').innerText());
  await page.locator('#roll').click();
  await page.waitForFunction(() => !document.getElementById('roll').disabled, null, { timeout: 20000 });
  console.log('FIRST', await page.locator('#notice').innerText());
  const dice = await page.evaluate(async () => {
    const { animator } = await import(document.querySelector('script[type="module"]').src);
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
      const { animator } = await import(document.querySelector('script[type="module"]').src);
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
    const { animator } = await import(document.querySelector('script[type="module"]').src);
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
    const { animator } = await import(document.querySelector('script[type="module"]').src);
    const values = Array.from({ length: 20 }, (_, index) => index * 5 + 1);
    const record = { version: 1, id: 'percentile-stress', createdAt: '2026-10-22T00:00:00Z',
      sides: 100, count: 20, values, total: values.reduce((a, b) => a + b, 0) };
    const result = await animator.play(record);
    return { status: result.status, physicalDice: animator.box.diceList.length };
  });
  assert.equal(percentileStress.status, 'complete');
  assert.equal(percentileStress.physicalDice, 40);
  console.log('PERCENTILE STRESS', JSON.stringify(percentileStress));

  const storageKey = 'solo-dice-prototype.last-roll.v2';
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
    const { animator } = await import(document.querySelector('script[type="module"]').src);
    return { contactMaterials: animator.box.world.contactmaterials.length };
  });
  assert.equal(lifecycle.contactMaterials, 3);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#clear-pool').click();
  assert.equal(await page.locator('#roll').isDisabled(), true);
  await page.locator('.die-choice[data-sides="6"]').click();
  await page.locator('.die-choice[data-sides="6"]').click();
  await page.locator('.die-choice[data-sides="20"]').click();
  await page.locator('#modifier-enabled').check();
  await page.locator('#modifier').fill('5');
  assert.equal(await page.locator('#notation').innerText(), '2d6 + 1d20 + 5');
  await page.evaluate(() => {
    window.fixedValues = [0, 5, 19];
    crypto.getRandomValues = array => { if (!window.fixedValues.length) throw new Error('unexpected resample'); array[0] = window.fixedValues.shift(); return array; };
  });
  await page.locator('#roll').click();
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await page.locator('#notice').evaluate(element => element.classList.contains('error')), false);
  assert.equal(await page.locator('#total').innerText(), '32');
  assert.equal(await page.locator('#breakdown').innerText(), '骰子和 27 ＋ 附加 5 ＝ 32');
  const mixedStored = await page.evaluate(key => localStorage.getItem(key), storageKey);
  await page.locator('#replay').click();
  await page.locator('#skip').click();
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), mixedStored);
  assert.equal(await page.locator('#total').innerText(), '32');
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await page.locator('#notation').innerText(), '2d6 + 1d20 + 5');
  assert.equal(await page.locator('#modifier-enabled').isChecked(), true);
  assert.equal(await page.locator('#total').innerText(), '32');
  for (const invalid of ['0', '21', '1.5']) {
    await page.locator('#modifier').fill(invalid);
    assert.equal(await page.locator('#roll').isDisabled(), true);
  }
  await page.locator('#modifier').fill('20');
  await page.locator('.die-count[data-sides="6"]').fill('20');
  assert.equal(await page.locator('#roll').isDisabled(), true, 'mixed pool over twenty must fail');
  await page.locator('#clear-pool').click();
  await page.locator('.die-count[data-sides="4"]').fill('1');
  await page.locator('.die-count[data-sides="10"]').fill('1');
  await page.locator('.die-count[data-sides="100"]').fill('2');
  await page.evaluate(() => {
    window.fixedValues = [3, 9, 6, 99];
    crypto.getRandomValues = array => { if (!window.fixedValues.length) throw new Error('unexpected resample'); array[0] = window.fixedValues.shift(); return array; };
  });
  await page.locator('#roll').click();
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await page.locator('#notice').evaluate(element => element.classList.contains('error')), false);
  assert.equal(await page.locator('#total').innerText(), '141');
  assert.equal(await page.locator('#breakdown').innerText(), '骰子和 121 ＋ 附加 20 ＝ 141');
  console.log('MIXED POOL 2d6 + 1d20 + 5 = 32; d4 + d10 + 2d100 + 20 = 141; replay and refresh preserved modifier');

  const legacyPage = await browser.newPage();
  if (offline) await legacyPage.context().setOffline(true);
  const legacyRecord = { version: 1, id: 'legacy-browser', createdAt: '2026-10-22T00:00:00Z', sides: 6, count: 2, values: [2, 5], total: 7 };
  await legacyPage.addInitScript(record => localStorage.setItem('solo-dice-prototype.last-roll.v1', JSON.stringify(record)), legacyRecord);
  await legacyPage.goto(targetUrl);
  await legacyPage.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await legacyPage.locator('#total').innerText(), '7');
  assert.equal(await legacyPage.locator('#notation').innerText(), '2d6');
  assert.equal(await legacyPage.locator('#modifier-enabled').isChecked(), false);
  await legacyPage.locator('#roll').click();
  await legacyPage.locator('#skip').click();
  await legacyPage.waitForFunction(() => !document.getElementById('roll').disabled);
  const legacyPreserved = await legacyPage.evaluate(() => JSON.parse(localStorage.getItem('solo-dice-prototype.last-roll.v1')));
  assert.deepEqual(legacyPreserved, legacyRecord);
  await legacyPage.close();
  console.log('LEGACY previous version record restored and preserved after a new mixed-format roll');

  await page.locator('#clear-pool').click();
  await page.locator('.die-count[data-sides="6"]').fill('2');
  await page.locator('.die-count[data-sides="20"]').fill('1');
  await page.locator('#modifier').fill('5');
  await page.evaluate(() => { window.fixedValues = [2, 3, 14]; });
  await page.locator('#roll').click();
  await page.waitForFunction(() => !document.getElementById('roll').disabled);
  assert.equal(await page.locator('#total').innerText(), '27');
  assert.equal(requests.every(url => offline ? url === targetUrl || url.startsWith('data:') :
    url.startsWith(new URL(targetUrl).origin + '/')), true);
  assert.deepEqual(issues, []);
  await mkdir(outputDir, { recursive: true });
  const prefix = offline ? 'offline' : 'browser';
  await page.screenshot({ path: join(outputDir, `${prefix}-preview.png`), fullPage: true });
  await writeFile(join(outputDir, `${prefix}-results.json`), JSON.stringify({ mode: prefix,
    offlineNetwork: offline, first: dice, measurements, stress, percentileStress, lifecycle,
    mixedPool: { exampleTotal: 32, percentileAndD10Total: 141, legacyPreserved: true }, issues }, null, 2));
} finally {
  await browser.close();
}

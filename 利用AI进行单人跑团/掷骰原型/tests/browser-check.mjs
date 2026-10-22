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
  assert.equal(requests.every(url => url.startsWith('http://127.0.0.1:4173/')), true);
  assert.deepEqual(issues, []);
  await mkdir('test-output', { recursive: true });
  await page.screenshot({ path: 'test-output/first-roll.png', fullPage: true });
  await writeFile('test-output/browser-first.json', JSON.stringify(dice, null, 2));
} finally {
  await browser.close();
}

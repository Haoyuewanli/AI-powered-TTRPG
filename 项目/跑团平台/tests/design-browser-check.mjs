import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatePlatform, startIsolated } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE
  || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const { directory, isolated } = await isolatePlatform('design-');
let app = await startIsolated(isolated);
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  .catch(async error => { await app.close(); throw error; });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
const errors = [], outside = [], requests = [], checks = [], screenshots = [];
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
});
await context.route('**/*', route => {
  const url = route.request().url();
  if (/^(data:|about:)/.test(url) || new URL(url).origin === app.url) return route.continue();
  outside.push(url); return route.abort();
});
const page = await context.newPage();
const ui = selector => page.locator('#platform-covers ' + selector);
const nav = name => page.locator('[data-platform-page="' + name + '"]').click();
const check = name => { checks.push(name); console.log('PASS: ' + name); };
const shot = async name => { const path = join(directory, name); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };
const wait = ms => new Promise(accept => setTimeout(accept, ms));
async function until(read, accept, label) {
  for (let attempt = 0; attempt < 70; attempt++) { const value = await read(); if (accept(value)) return value; await wait(100); }
  throw new Error('Timed out: ' + label);
}
async function settings(open = true) { await ui('.p-settings').evaluate((node, value) => { node.open = value; }, open); }
async function input(selector, value) {
  await ui(selector).evaluate((node, next) => { node.value = String(next); node.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
const appearance = async () => (await page.request.get(app.url + '/api/appearance')).json();
const idleRing = () => ui('[data-ring][data-motion=idle]').waitFor();
const chooseDisplay = value => ui('[data-display-preset]:visible').first().selectOption(value);
const css = name => page.locator('#platform-covers').evaluate((node, key) => getComputedStyle(node).getPropertyValue(key).trim(), name);

try {
  await page.goto(app.url); await page.locator('#enter-dm').waitFor(); await page.locator('#enter-dm').click();
  await ui('[data-display-preset]:visible').first().waitFor();
  const keys = ['2560x1600', '2560x1440', '2048x1536', '1920x1440'];
  assert.deepEqual(await ui('[data-display-preset]').first().locator('option').evaluateAll(nodes => nodes.map(node => node.value)), keys);
  assert.equal(await ui('[data-preset] option:not([disabled])').count(), 4);
  for (const control of ['ground', 'light', 'shadow', 'accent']) assert.equal(await ui('[data-color="' + control + '"]').count(), 1);
  for (const control of ['start', 'end']) assert.equal(await ui('[data-gradient="' + control + '"]').count(), 1);
  assert(await ui('.p-home-sheet').count() >= 2);
  await shot('设计恢复-首页.png');
  check('首页保留薄片光影与四尺寸入口，四配色、基础色和信息渐变控件齐全');

  const expected = {};
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index]; await chooseDisplay(key); await settings();
    const profile = { ground: '#12345' + index, light: '#fffff' + index, shadow: '#45566' + index, accent: '#bbccd' + index, floorPercent: index * 5, lift: index + 2, strength: 60 + index * 10,
      gradient: { start: '#ffffff', end: '#ccddee' } };
    for (const name of ['ground', 'light', 'shadow', 'accent']) await input('[data-color="' + name + '"]', profile[name]);
    await input('[data-floor-percent]', profile.floorPercent);
    await input('[data-appearance-value=lift]', profile.lift); await input('[data-appearance-value=strength]', profile.strength);
    await input('[data-gradient=start]', profile.gradient.start); await input('[data-gradient=end]', profile.gradient.end);
    expected[key] = profile;
    await until(appearance, value => value.displayPreset === key && value.appearanceProfiles[key].ground.toLowerCase() === profile.ground && value.appearanceProfiles[key].floorPercent === profile.floorPercent, 'save profile ' + key);
  }
  for (const key of keys) {
    await chooseDisplay(key); await settings();
    for (const name of ['ground', 'light', 'shadow', 'accent']) assert.equal((await ui('[data-color="' + name + '"]').inputValue()).toLowerCase(), expected[key][name]);
    assert.equal(Number(await ui('[data-floor-percent]').inputValue()), expected[key].floorPercent);
    assert.equal(Number(await ui('[data-appearance-value=lift]').inputValue()), expected[key].lift);
    assert.equal(Number(await ui('[data-appearance-value=strength]').inputValue()), expected[key].strength);
    assert.equal((await ui('[data-gradient=end]').inputValue()).toLowerCase(), expected[key].gradient.end);
    assert((await ui('[data-profile-label]').textContent()).includes(key.replace('x', '×')));
  }
  await chooseDisplay('1920x1440'); await settings(false);
  await until(appearance, value => value.displayPreset === '1920x1440', 'last selected preset');
  const saved = await appearance();
  await app.close(); app = await startIsolated(isolated);
  await page.goto(app.url); await page.locator('#enter-dm').click(); await settings();
  assert.equal(await ui('[data-display-preset]:visible').first().inputValue(), '1920x1440');
  assert.equal(await ui('[data-color=ground]').inputValue(), '#123453');
  const reopened = await appearance(); assert.deepEqual(reopened.appearanceProfiles, saved.appearanceProfiles);
  check('四种尺寸各自保存完整外观，同为4:3的两项互不串值；重启服务后恢复');

  const other = await context.newPage();
  await other.goto(app.url);
  await until(() => other.locator('[data-appearance-status]').textContent(), text => text.includes('从本地文件读取'), 'second window loaded');
  await other.locator('#enter-dm').click();
  await other.locator('.p-settings').evaluate(node => { node.open = true; });
  await input('[data-color=shadow]', '#405060');
  await until(appearance, value => value.appearanceProfiles['1920x1440'].shadow.toLowerCase() === '#405060', 'winner saved');
  await other.locator('[data-color=shadow]').evaluate(node => { node.value = '#708090'; node.dispatchEvent(new Event('input', { bubbles: true })); });
  await until(() => other.locator('[data-appearance-status]').textContent(), text => text.includes('草稿保留') && text.includes('其他窗口'), 'conflict surfaced');
  assert.equal(await other.locator('[data-color=shadow]').inputValue(), '#708090');
  assert.equal((await appearance()).appearanceProfiles['1920x1440'].shadow.toLowerCase(), '#405060');
  const conflictShot = join(directory, '设计恢复-外观冲突.png'); await other.screenshot({ path: conflictShot, fullPage: true }); screenshots.push(conflictShot);
  await other.locator('[data-appearance-retry]').click();
  await until(() => other.locator('[data-color=shadow]').inputValue(), value => value === '#405060', 'reload winning appearance');
  await other.close();
  check('双窗口外观冲突显示保留草稿和暂停保存，明确重新读取后才恢复磁盘版本');

  await input('[data-floor-percent]', 0); assert(await ui('.p-ground').isHidden());
  const zero = await css('--floor-light-clip');
  await input('[data-floor-percent]', 20); assert(await ui('.p-ground').isVisible());
  assert.notEqual(await css('--floor-light-clip'), zero); assert.equal(await css('--floor-depth'), '20%');
  for (const palette of ['sunlit', 'mint', 'violet', 'peach']) { await ui('[data-preset]').selectOption(palette); assert.equal(await ui('[data-preset]').inputValue(), palette); }
  await ui('[data-preset]').selectOption('violet'); await settings(false);
  check('0%地面完全隐藏，20%地面与透视联动；四套配色可切换');

  await nav('modules'); await ui('[data-group=a]').click(); await idleRing();
  assert.equal(await ui('[data-module-index]').count(), 5);
  assert.equal(await ui('[data-module-name]').textContent(), '封面 A');
  const firstAngle = Number(await ui('[data-ring]').getAttribute('data-angle'));
  for (let index = 0; index < 5; index++) { await ui('[data-module-step="1"]').click(); await idleRing(); }
  const finalAngle = Number(await ui('[data-ring]').getAttribute('data-angle'));
  assert(Math.abs(finalAngle - firstAngle) > 6, 'Ring must continue rotation through the wrap');
  assert.equal(await ui('[data-module-name]').textContent(), '封面 A');
  await ui('[data-group=b]').click(); assert.equal(await ui('[data-module-index]').count(), 3);
  await ui('[data-group=c]').click(); assert.equal(await ui('[data-module-index]').count(), 1);
  assert(await ui('[data-module-step="1"]').isDisabled());
  await ui('[data-group=a]').click(); await ui('[data-module-index="0"]').focus(); await page.keyboard.press('ArrowRight'); await idleRing();
  assert.equal(await ui('[data-module-name]').textContent(), '封面 B');
  await ui('[data-confirm-module]').click(); assert((await ui('[data-module-confirmation]').textContent()).includes('封面 B'));
  await shot('设计恢复-模组环.png');
  check('分类滑块及1/3/5封面环保留，连续跨首尾旋转和方向键浏览、明确确认可用');

  for (let index = 0; index < 2; index++) { await ui('[data-module-step="1"]').click(); await idleRing(); }
  assert((await ui('[data-module-ratio]').textContent()).includes('横版'));
  await ui('[data-open-crop]').click(); await ui('[data-crop-dialog][open]').waitFor();
  await ui('[data-crop-original]').evaluate(image => image.complete && image.naturalWidth || new Promise(accept => image.addEventListener('load', accept, { once: true })));
  await ui('select[data-crop-mode]').selectOption('contain'); assert(await ui('[data-crop-outline]').isHidden());
  await ui('select[data-crop-mode]').selectOption('crop'); await input('[data-crop-value=zoom]', 1.4);
  assert(await ui('[data-crop-outline]').isVisible());
  const preview = JSON.parse(await ui('[data-crop-json]').textContent());
  assert.equal(preview.schemaVersion, 1); assert.deepEqual(preview.frameAspectRatio, [3, 4]);
  const entry = Object.values(preview.covers).find(item => item.sourceSize.width === 640); assert(entry); assert.equal(entry.mode, 'crop');
  await shot('设计恢复-横版裁切.png'); await ui('[data-crop-apply]').click(); assert(await ui('[data-crop-dialog]').isHidden());
  await ui('[data-group=a]').click(); await ui('[data-open-crop]').click(); await ui('[data-crop-dialog][open]').waitFor();
  assert((await ui('[data-crop-subtitle]').textContent()).includes('2:3')); await page.keyboard.press('Escape');
  assert(await ui('[data-crop-dialog]').isHidden());
  check('横竖封面均保留完整显示/3:4裁切演示、JSON预览、应用及取消，不改真实原图');

  await nav('resources');
  const phases = [];
  await ui('[data-resource-layout]').evaluate(node => { window.__resourcePhases = []; new MutationObserver(() => window.__resourcePhases.push(node.dataset.phase)).observe(node, { attributes: true, attributeFilter: ['data-phase'] }); });
  await ui('[data-resource="角色"]').click(); await ui('[data-resource-layout][data-phase=open]').waitFor();
  phases.push(...await page.evaluate(() => window.__resourcePhases));
  assert(phases.indexOf('moving') >= 0 && phases.indexOf('opening') > phases.indexOf('moving') && phases.indexOf('open') > phases.indexOf('opening'));
  assert.equal(await ui('[data-info]').count(), 6); assert(await ui('.p-drawer').isVisible());
  const drawer = await ui('.p-drawer').boundingBox(), workspace = await ui('[data-resource-layout]').boundingBox();
  assert(drawer.height < workspace.height);
  assert((await ui('[data-info]').first().evaluate(node => getComputedStyle(node).backgroundImage)).includes('gradient'));
  await ui('[data-info]').first().click(); assert.equal(await ui('[data-info]').first().getAttribute('aria-pressed'), 'true');
  await shot('设计恢复-资源抽屉.png'); await ui('[data-close-drawer]').click(); assert(await ui('.p-drawer').isHidden());
  check('资源横向分类先移动再开矮抽屉，6张渐变信息卡及选择/收起反馈保留');

  await nav('maps'); assert.equal(await ui('[data-map-id]').count(), 4);
  const mapSource = await ui('[data-map-image]').getAttribute('src');
  await ui('[data-map-id=area-a1]').click(); assert.notEqual(await ui('[data-map-image]').getAttribute('src'), mapSource);
  assert((await ui('[data-map-title]').textContent()).includes('区域A1'));
  await ui('[data-toggle-map-tree]').click(); assert.equal(await ui('[data-toggle-map-tree]').getAttribute('aria-expanded'), 'false'); assert(await ui('[data-map-tree]').isHidden());
  await ui('[data-toggle-map-tree]').click(); assert(await ui('[data-map-tree]').isVisible());
  await shot('设计恢复-地图目录.png');
  check('中央俯视地图及四叶层级目录保留，可切换地图和收起目录');

  await nav('dialogue'); assert.equal(await page.locator('.dialogue-message').count(), 5);
  await page.locator('[data-dialogue-source=map-overland]').click(); await page.locator('#dialogue-layout').selectOption('left-stack');
  assert.equal(await page.locator('[data-dialogue-pane]').count(), 3);
  await page.locator('[data-dialogue-source=chat]').click();
  await page.locator('#dialogue-message').fill('设计恢复检查草稿');
  for (const size of [{ width: 2560, height: 1600 }, { width: 2560, height: 1440 }, { width: 2048, height: 1536 }, { width: 1920, height: 1440 }, { width: 1366, height: 768 }, { width: 1024, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(size);
    for (const name of ['home', 'modules', 'resources', 'maps', 'dialogue', 'battle']) {
      await nav(name);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' overflows at ' + size.width);
    }
    if (size.width <= 390) { await nav('maps'); await shot('设计恢复-地图-' + size.width + '.png'); await nav('dialogue'); await shot('设计恢复-对话-' + size.width + '.png'); }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await nav('modules'); await ui('[data-group=a]').click(); await ui('[data-module-step="1"]').click(); await idleRing();
  await nav('resources'); await ui('[data-resource="NPC"]').click(); await ui('[data-resource-layout][data-phase=open]').waitFor();
  await ui('[data-close-drawer]').click(); await nav('home');
  await page.locator('#platform-switch-identity').click(); await page.locator('#enter-player').click(); await nav('dialogue');
  assert.equal(await page.locator('#dialogue-message').inputValue(), ''); assert.equal(await page.locator('.dialogue-message').count(), 5);
  check('四预设尺寸和常见窄屏下六窗无整页横向溢出，减少动态仍可操作，对话及身份清理保留');

  const apiRequests = requests.filter(item => new URL(item.url).pathname.startsWith('/api/'));
  assert(apiRequests.every(item => new URL(item.url).pathname === '/api/appearance'));
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  const file = JSON.parse(await readFile(join(isolated, '.runtime', '外观.json'), 'utf8')); assert.equal(file.schemaVersion, 1);
  check('仅外观设置写本地JSON，不发游戏业务或外网请求，脚本无错误');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, screenshots, isolated, errors, outside, requests }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, directory, errors, outside }, null, 2));
} finally { await browser.close(); await app.close(); }

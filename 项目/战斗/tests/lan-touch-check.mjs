import { enterBattle } from './browser-platform.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture, command, dm } from './fixture.mjs';

const { chromium } = await import(pathToFileURL(process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../开发记录/临时/局域网与触摸检查/', import.meta.url));
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'campaign-'));
const app = await startApp({ campaignDir: directory, port: 0, initial: fixture });
const browser = await chromium.launch({ executablePath: process.env.BATTLE_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
const checks = [], skipped = [], errors = [], external = [], allowed = new Set([app.url]);
let capabilities, lanPage, touchPage;
async function context(options) {
  const ctx = await browser.newContext(options);
  ctx.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await ctx.route('**/*', route => {
    if (allowed.has(new URL(route.request().url()).origin)) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  return ctx;
}
async function settle(page) {
  await enterBattle(page);await page.locator('canvas[data-ready="true"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(80); await page.locator('canvas[data-settled="true"]').waitFor({ timeout: 15000 });
}
async function revision(page, value = app.store.state.revision) {
  await page.waitForFunction(v => document.querySelector('#save-status').textContent.includes(`v${v}`), value, { timeout: 12000 });
}
async function dispatch(type, payload) {
  return app.workspace.dispatch(command(app.store.state, type, payload), dm);
}
async function point(page, position) {
  await settle(page);
  return page.evaluate(async value => {
    const THREE = await import('/vendor/three.module.js');
    const canvas = document.querySelector('canvas'), rect = canvas.getBoundingClientRect(), view = JSON.parse(canvas.dataset.camera);
    const camera = new THREE.PerspectiveCamera(44, rect.width / rect.height, .1, 1000);
    camera.position.set(view.target[0] + view.distance * Math.sin(view.polar) * Math.sin(view.azimuth), view.distance * Math.cos(view.polar),
      view.target[2] + view.distance * Math.sin(view.polar) * Math.cos(view.azimuth));
    camera.lookAt(new THREE.Vector3(...view.target)); camera.updateMatrixWorld();
    const projected = new THREE.Vector3(value.x, value.y, value.z).project(camera);
    return { x: rect.x + (projected.x + 1) * rect.width / 2, y: rect.y + (1 - projected.y) * rect.height / 2,
      within: projected.x > -1 && projected.x < 1 && projected.y > -1 && projected.y < 1 };
  }, position);
}
async function touchDrag(page, client, destination, cancel = false) {
  const actor = app.store.state.actors[0], y = actor.body.height / 2 + .1;
  const start = await point(page, { ...actor.position, y }), end = await point(page, { ...destination, y });
  assert(start.within && end.within, '模拟触摸位置须位于当前画布内');
  const send = (type, points) => client.send('Input.dispatchTouchEvent', { type,
    touchPoints: points.map(p => ({ x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1, id: 1 })) });
  await send('touchStart', [start]);
  for (let step = 1; step <= 10; step++) {
    const progress = step / 10;
    await send('touchMove', [{ x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress }]);
  }
  await page.locator('canvas[data-dragging="pc-001"]').waitFor({ timeout: 5000 });
  await send(cancel ? 'touchCancel' : 'touchEnd', []);
}

try {
  const sharing = await app.sharing.operate({ operation: 'enable' });
  const invitation = await app.sharing.operate({ operation: 'invite', actorId: 'pc-001' });
  allowed.add(sharing.localUrl);
  // Only an address reported by this computer's networkInterfaces can be selected.
  const lanUrl = sharing.lanUrls.find(url => !new URL(url).hostname.startsWith('127.'));
  const joinAt = base => `${base}/#invite=${invitation.invite.token}`;
  await dispatch('set-dice-mode', { mode: 'physical' });
  await dispatch('collect-initiative', {});
  if (lanUrl) {
    allowed.add(lanUrl);
    lanPage = await (await context({ viewport: { width: 1366, height: 900 } })).newPage();
    await lanPage.goto(joinAt(lanUrl), { timeout: 15000 }); await settle(lanPage);
    capabilities = await lanPage.evaluate(() => ({ secure: isSecureContext, randomUUID: typeof crypto.randomUUID,
      getRandomValues: typeof crypto.getRandomValues, clipboardWrite: typeof navigator.clipboard?.writeText }));
    assert.equal(capabilities.secure, false, '网卡普通HTTP应为非安全上下文');
    assert.equal(capabilities.randomUUID, 'undefined'); assert.equal(capabilities.getRandomValues, 'function');
    const before = app.store.state.revision;
    await lanPage.locator('[data-initiative-actor="pc-001"] input').fill('20');
    await lanPage.locator('[data-submit-initiative="pc-001"]').click(); await revision(lanPage, before + 1);
    const event = app.store.state.events.at(-1);
    assert.equal(event.type, 'submit-initiative');
    assert.match(event.actionId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(app.store.state.initiativeCollection.entries['pc-001'].total, 22);
    checks.push('本机浏览器访问本网卡HTTP：isSecureContext=false、无crypto.randomUUID时仍可生成有效操作ID并提交玩家先攻');
    const sessionBeforeFailure = await lanPage.evaluate(() => sessionStorage.getItem('battle-session'));
    const versionBeforeFailure = app.store.state.revision;
    await lanPage.route('**/api/state', route => route.fulfill({ status: 503, contentType: 'text/html', body: '<html><body>temporary upstream failure</body></html>' }), { times: 1 });
    await lanPage.locator('.session-menu > summary').click(); await lanPage.locator('#refresh').click();
    await lanPage.locator('#connection-status[data-connected="false"]').waitFor({ timeout: 6000 });
    assert.equal(await lanPage.evaluate(() => sessionStorage.getItem('battle-session')), sessionBeforeFailure);
    await lanPage.locator('#connection-status[data-connected="true"]').waitFor({ timeout: 8000 });
    assert(await lanPage.locator('#table').isVisible());
    assert.equal(await lanPage.evaluate(() => sessionStorage.getItem('battle-session')), sessionBeforeFailure);
    assert.equal(app.store.state.revision, versionBeforeFailure);
    assert(!/Unexpected token|SyntaxError/.test(await lanPage.locator('#toast').textContent()));
    checks.push('一次HTML/503连接故障显示断线，保留玩家会话，下一次正常响应自动恢复且不改变进度');
    await lanPage.locator('[data-tool="exchange"]').click(); await lanPage.locator('#export-handoff').click();
    await lanPage.waitForFunction(() => document.querySelector('#exchange-text').value.includes('local-dm-exchange-v2'));
    await lanPage.locator('#copy-exchange').click();
    await lanPage.locator('#toast').filter({ hasText: /已复制|文本已选中/ }).waitFor();
    assert.equal(capabilities.clipboardWrite, 'undefined');
    await lanPage.evaluate(() => {
      window.restoreCopyForTest = document.execCommand;
      document.execCommand = (command, ...args) => command === 'copy' ? false : window.restoreCopyForTest.call(document, command, ...args);
    });
    await lanPage.locator('#copy-exchange').click();
    await lanPage.locator('#toast').filter({ hasText: '文本已选中' }).waitFor();
    const selected = await lanPage.locator('#exchange-text').evaluate(input => ({ start: input.selectionStart, end: input.selectionEnd, length: input.value.length }));
    assert.equal(selected.start, 0); assert.equal(selected.end, selected.length);
    await lanPage.evaluate(() => { document.execCommand = window.restoreCopyForTest; delete window.restoreCopyForTest; });
    await lanPage.screenshot({ path: join(output, '普通HTTP-手动复制回退.png') });
    checks.push('普通HTTP无Clipboard API仍有复制回退；模拟浏览器拒绝复制后自动选中全文供手动复制');
  } else {
    skipped.push('本机无非环回IPv4网卡地址，未执行普通HTTP非安全上下文检查');
    await dispatch('submit-initiative', { actorId: 'pc-001', rolls: [20] });
  }
  await dispatch('submit-initiative', { actorId: 'npc-001', rolls: [5] }); await dispatch('start', {});
  const touchContext = await context({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  touchPage = await touchContext.newPage(); await touchPage.goto(joinAt(lanUrl || sharing.localUrl)); await settle(touchPage);
  const touchCapabilities = await touchPage.evaluate(() => ({ points: navigator.maxTouchPoints, width: innerWidth }));
  assert(touchCapabilities.points > 0); assert.equal(touchCapabilities.width, 390);
  const npc = app.store.state.actors[1], npcPoint = await point(touchPage, { ...npc.position, y: npc.body.height / 2 + .1 });
  const beforeTap = app.store.state.revision;
  await touchPage.touchscreen.tap(npcPoint.x, npcPoint.y);
  assert.equal(await touchPage.locator('#selected-name').textContent(), npc.name);
  assert.equal(app.store.state.revision, beforeTap, '触屏点选不得改变进度');
  const client = await touchContext.newCDPSession(touchPage);
  await touchDrag(touchPage, client, { x: 22.5, z: 32.5 }); await revision(touchPage, beforeTap + 1);
  assert.equal(app.store.state.actors[0].position.z, 32.5);
  assert.equal(app.store.state.combat.moved, 10); assert.equal(app.store.state.revision, beforeTap + 1);
  const beforeCancel = app.store.state.revision;
  await touchDrag(touchPage, client, { x: 22.5, z: 42.5 }, true); await touchPage.waitForTimeout(180);
  assert.equal(app.store.state.revision, beforeCancel); assert.equal(app.store.state.actors[0].position.z, 32.5);
  await touchPage.screenshot({ path: join(output, '模拟触屏-拖动后.png') });
  checks.push('390×844移动触摸模拟：点选不写盘、单指拖放按规则移动且仅保存一次、touchCancel取消不落盘');
  assert.equal(errors.length, 0, errors.join('\n')); assert.equal(external.length, 0, external.join('\n'));
  const result = { checks, skipped, capabilities, directory, networkScope: '同一台电脑通过自己的网卡IP访问合成游戏；未验证第二设备或公网',
    touchScope: 'Edge浏览器移动/触摸模拟及CDP触摸事件；未使用真实手机', errors, external };
  await writeFile(join(output, '结果.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, skipped, capabilities, output }, null, 2));
} catch (error) {
  for (const [name, page] of [['普通HTTP', lanPage], ['模拟触屏', touchPage]]) {
    if (page && !page.isClosed()) await page.screenshot({ path: join(output, `失败-${name}.png`), fullPage: true }).catch(() => {});
  }
  await writeFile(join(output, '失败.json'), JSON.stringify({ error: error.message, stack: error.stack, checks, skipped, capabilities, errors, external }, null, 2));
  throw error;
} finally { await browser.close(); await app.close(); }

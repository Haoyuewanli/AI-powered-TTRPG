import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture, command } from './fixture.mjs';

const { chromium } = await import(pathToFileURL(process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../开发记录/临时/平台首页检查/', import.meta.url));
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'case-'));
const campaignDir = join(directory, '合成团');
const modulesDir = join(directory, '合成模组');
const secretName = 'HIDDEN_PLATFORM_ACTOR_CANARY';
const secretNote = 'PRIVATE_PLATFORM_NOTE_CANARY';
const initial = () => {
  const state = fixture(); state.title = '平台合成战斗';
  state.actors[1].notes = secretNote;
  state.actors.push({ ...structuredClone(state.actors[1]), id: 'npc-hidden', name: secretName, hidden: true,
    tiePriority: 2, position: { x: 72.5, z: 62.5 } });
  return state;
};
const options = { campaignDir, modulesDir, port: 0, initial,
  sharingOptions: { host: '127.0.0.1', interfaces: () => ({ test: [{ address: '127.0.0.1', family: 'IPv4', internal: false }] }) } };
let app = await startApp(options);
const browser = await chromium.launch({ executablePath: process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] }).catch(async error => { await app.close(); throw error; });
const contexts = [], errors = [], outside = [], requests = [], checks = [], screenshots = [];
const allowedOrigins = new Set([app.url]);
let releaseAction = () => {}, releaseState = () => {};
const record = name => { checks.push(name); console.log(`PASS: ${name}`); };
const readDisk = () => readFile(app.store.path, 'utf8');
const token = page => page.evaluate(() => sessionStorage.getItem('battle-session'));
const pageKey = page => page.locator('#platform-root').getAttribute('data-page');
const home = page => page.locator('[data-platform-page="home"]');

async function context(viewport = { width: 1440, height: 1000 }, extra = {}) {
  const value = await browser.newContext({ viewport, deviceScaleFactor: 1, ...extra }); contexts.push(value);
  await value.addInitScript(() => {
    window.platformCheckFrames = 0;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => request(time => { window.platformCheckFrames++; callback(time); });
  });
  value.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) requests.push({ method: request.method(), path: url.pathname, origin: url.origin });
    });
  });
  await value.route('**/*', route => {
    const url = route.request().url();
    if (/^(data:|about:)/.test(url) || allowedOrigins.has(new URL(url).origin)) return route.continue();
    outside.push(url); return route.abort();
  });
  return value;
}
async function login(page, id = 'DM') {
  await page.goto(app.url);
  await page.locator('#enter-dm').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('enter-dm').disabled);
  if (id === 'DM') await page.locator('#enter-dm').click();
  else { await page.locator('#identity').fill(id); await page.locator('#login-form button').click(); }
  await page.locator('#platform-current-session').waitFor({ state: 'visible' });
  assert.equal(await pageKey(page), 'home', '身份建立后停在首页');
}
async function battle(page) {
  await page.locator('#platform-go-battle').click();
  await page.locator('#table').waitFor({ state: 'visible' });
  await page.locator('canvas[data-ready="true"]').waitFor();
  await page.locator('canvas[data-settled="true"]').waitFor({ timeout: 20000 });
  assert.equal(await pageKey(page), 'battle');
}
async function returnHome(page) {
  await home(page).click(); await page.locator('[data-platform-view="home"]').waitFor({ state: 'visible' });
  assert.equal(await pageKey(page), 'home');
}
async function tool(page, name) {
  await page.keyboard.press('Escape');
  await page.locator(`[data-tool="${name}"]:visible`).first().click();
  if (['actor', 'files', 'workspace'].includes(name)) await page.locator(`#${name}-dialog[open]`).waitFor();
  if (name === 'terrain') await page.locator('#scene-tools').waitFor({ state: 'visible' });
}
async function screenshot(page, name) {
  const path = join(directory, name); await page.screenshot({ path, fullPage: true }); screenshots.push(path);
}
async function waitRevision(page, revision = app.store.state.revision) {
  await page.waitForFunction(revision => document.getElementById('platform-save').textContent.includes(`v${revision}`), revision, { timeout: 15000 });
}
async function raw(origin, path, bearer, payload) {
  const response = await fetch(origin + path, { method: payload === undefined ? 'GET' : 'POST',
    headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  const body = await response.json(); return { status: response.status, body };
}
async function loginToken() {
  const response = await raw(app.url, '/api/login', null, { id: 'DM' }); assert.equal(response.status, 200); return response.body.token;
}
async function visibleContents(page) {
  return page.evaluate(() => `${document.body.textContent}\n${[...document.querySelectorAll('input,textarea')].map(node => node.value).join('\n')}`);
}

try {
  const localContext = await context(), page = await localContext.newPage();
  await page.goto(app.url); await page.locator('#platform-root').waitFor();
  assert.equal(await pageKey(page), 'home');
  assert.deepEqual(await page.locator('.platform-nav button').allTextContents(), ['首页', '模组', '资源', '地图', '对话', '战斗']);
  assert(await page.locator('[data-platform-page="battle"]').isDisabled());
  assert(await page.locator('#table').isHidden());
  assert(await page.locator('#enter-dm').isVisible()); assert(await page.locator('#identity').isVisible());
  await screenshot(page, '首页-身份选择.png');
  const health = await raw(app.url, '/health'); assert.equal(health.body.capabilities.platformShell, 1);
  record('未登录首页提供身份选择，六项侧栏顺序正确，未登录不能进入战斗');

  await login(page);
  const dmToken = await token(page), catalog = await raw(app.url, '/api/catalog', dmToken);
  assert.equal(await page.locator('#platform-campaign-name').textContent(), catalog.body.campaignName);
  assert.equal(await page.locator('#platform-battle-name').textContent(), catalog.body.battleName);
  assert.equal(await page.locator('#platform-phase').textContent(), '准备中');
  assert((await page.locator('#platform-identity').textContent()).includes('DM'));
  assert(!requests.some(request => ['/api/files', '/api/module-covers'].includes(request.path)), '首页不预建资料或扫描模组');
  await screenshot(page, '首页-DM.png');
  record('DM首页显示真实团、场和阶段，不自动读取资料库或模组目录');

  const beforeNavigation = await readDisk(), stateBefore = app.store.state, writeStart = requests.length;
  await battle(page);
  for (let index = 0; index < 3; index++) { await returnHome(page); await battle(page); }
  await returnHome(page);
  assert.equal(await token(page), dmToken);
  assert.equal(await readDisk(), beforeNavigation); assert.deepEqual(app.store.state, stateBefore);
  assert.deepEqual(requests.slice(writeStart).filter(request => request.method === 'POST'), [], '导航不提交任何业务POST');
  assert(await page.locator('canvas').getAttribute('data-visible') === 'false');
  await page.waitForTimeout(100);
  const frames = await page.evaluate(() => window.platformCheckFrames), camera = await page.locator('canvas').getAttribute('data-camera');
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas'), viewport = document.getElementById('viewport');
    viewport.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', key: 'q', bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, button: 0, clientX: 100, clientY: 100, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 77, button: 0, buttons: 1, clientX: 240, clientY: 180, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, button: 0, clientX: 240, clientY: 180, bubbles: true }));
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
  });
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.platformCheckFrames), frames, '后台棋盘不运行动画帧');
  assert.equal(await page.locator('canvas').getAttribute('data-camera'), camera);
  assert.equal(await readDisk(), beforeNavigation);
  record('反复往返保留同token和完整文件，导航无POST；首页后台棋盘停止动画及输入');

  await battle(page); await tool(page, 'actor');
  await page.locator('#edit-name').fill('尚未保存的角色草稿'); await page.keyboard.press('Escape');
  await home(page).click(); assert.equal(await pageKey(page), 'battle');
  await tool(page, 'actor'); assert.equal(await page.locator('#edit-name').inputValue(), '尚未保存的角色草稿');
  await page.locator('#reload-editor').click(); await page.keyboard.press('Escape');
  await tool(page, 'terrain'); await page.locator('#terrain-name').fill('尚未保存的地形草稿');
  await home(page).click(); assert.equal(await pageKey(page), 'battle');
  assert.equal(await page.locator('#terrain-name').inputValue(), '尚未保存的地形草稿');
  await page.locator('#terrain-reload').click(); await page.keyboard.press('Escape');
  assert.equal(await readDisk(), beforeNavigation);
  record('角色及地形未保存草稿阻止离页，重新打开仍保留，可明确放弃后继续');

  let actionReached;
  const reachedAction = new Promise(resolve => { actionReached = resolve; });
  const actionGate = new Promise(resolve => { releaseAction = resolve; });
  await page.route('**/api/action', async route => { actionReached(); await actionGate; await route.continue(); });
  await tool(page, 'setup');
  const saveRevision = app.store.state.revision;
  await page.locator('#place-actor').click(); await reachedAction;
  await home(page).click(); assert.equal(await pageKey(page), 'battle');
  await page.locator('.session-menu > summary').click(); await page.locator('#logout').click();
  assert.equal(await token(page), dmToken); assert.equal(await pageKey(page), 'battle');
  assert.equal(requests.filter(request => request.method === 'POST' && request.path === '/api/logout').length, 0);
  releaseAction(); await waitRevision(page, saveRevision + 1); await page.unroute('**/api/action');
  await page.keyboard.press('Escape'); await returnHome(page);
  record('保存请求在途时离页和切身份均被阻止，保存完成后可正常返回');

  const otherDm = await loginToken();
  const change = await raw(app.url, '/api/action', otherDm, command(app.store.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 31 }, reason: '合成另一DM客户端测试' }));
  assert.equal(change.status, 200); await waitRevision(page);
  assert.equal(await pageKey(page), 'home'); await battle(page);
  assert((await page.locator('#actor-info').textContent()).includes('31'));
  assert.equal(app.store.state.actors[0].hp, 31); await returnHome(page);
  record('首页继续同步另一DM客户端的已保存更新，回到战斗看到最新数值');

  await page.locator('#platform-switch-identity').click(); await page.locator('#identity').waitFor({ state: 'visible' });
  const cleared = await visibleContents(page); assert(!cleared.includes(secretName)); assert(!cleared.includes(secretNote));
  assert.equal(await pageKey(page), 'home'); assert.equal(await token(page), null);
  await page.locator('#identity').fill('player-1'); await page.locator('#login-form button').click();
  await page.locator('#platform-current-session').waitFor({ state: 'visible' });
  assert((await page.locator('#platform-identity').textContent()).includes('Player'));
  assert(!(await visibleContents(page)).includes(secretName)); assert(!(await visibleContents(page)).includes(secretNote));
  assert(await page.locator('#platform-module-covers').isHidden());
  assert.equal(await pageKey(page), 'home'); await screenshot(page, '首页-Player.png');
  record('首页切换DM/Player沿用原会话，退出后清空DM文本、表单及隐藏角色');

  const invitation = await app.sharing.operate({ operation: 'invite', actorId: 'pc-001' });
  const inviteUrl = invitation.links.lan[0], remoteOrigin = new URL(inviteUrl).origin; allowedOrigins.add(remoteOrigin);
  const remoteContext = await context(), remote = await remoteContext.newPage();
  const remoteBodies = [];
  remote.on('response', async response => { if (new URL(response.url()).pathname === '/api/state') remoteBodies.push(await response.text().catch(() => '')); });
  await remote.goto(inviteUrl); await remote.locator('#platform-current-session').waitFor({ state: 'visible' });
  assert.equal(await pageKey(remote), 'home');
  assert(await remote.locator('#enter-dm').isHidden()); assert(await remote.locator('#login-form').isHidden());
  assert(await remote.locator('#platform-switch-identity').isHidden());
  assert(!(await visibleContents(remote)).includes(secretName)); assert(!(await visibleContents(remote)).includes(secretNote));
  const remoteToken = await token(remote);
  for (const [path, payload] of [['/api/catalog', undefined], ['/api/module-covers', undefined], ['/api/files', { operation: 'list' }], ['/api/login', { id: 'DM' }]]) {
    const denied = await raw(remoteOrigin, path, remoteToken, payload); assert.equal(denied.status, 403);
  }
  const wrongCredential = await raw(remoteOrigin, '/api/state', otherDm); assert.equal(wrongCredential.status, 401);
  assert(remoteBodies.length > 0); assert(!remoteBodies.join('').includes(secretName)); assert(!remoteBodies.join('').includes(secretNote));
  record('邀请玩家也从首页进入，仅获取授权投影；远程无DM登录、团目录或主机文件能力');

  const staleContext = await context(), stale = await staleContext.newPage(); await login(stale); await battle(stale);
  let holdNext = true, stateReached;
  const reachedState = new Promise(resolve => { stateReached = resolve; });
  const stateGate = new Promise(resolve => { releaseState = resolve; });
  await stale.route('**/api/state', async route => {
    if (!holdNext) return route.continue();
    holdNext = false; const response = await route.fetch(); stateReached(); await stateGate; await route.fulfill({ response });
  });
  await stale.locator('.session-menu > summary').click(); await stale.locator('#refresh').click(); await reachedState;
  await returnHome(stale); await stale.locator('#platform-switch-identity').click(); await stale.locator('#identity').waitFor({ state: 'visible' });
  await stale.locator('#identity').fill('player-1'); await stale.locator('#login-form button').click();
  await stale.locator('#platform-current-session').waitFor({ state: 'visible' });
  releaseState(); await stale.waitForTimeout(200); await stale.unroute('**/api/state');
  assert((await stale.locator('#platform-identity').textContent()).includes('Player'));
  assert(!(await visibleContents(stale)).includes(secretName)); assert(!(await visibleContents(stale)).includes(secretNote));
  assert.equal(await pageKey(stale), 'home');
  record('旧DM状态响应在换身份后到达，不回填Player首页、详情或秘密');

  const pageBefore = await readDisk(), selectedBefore = app.workspace.selection;
  await page.reload(); await page.locator('#platform-current-session').waitFor({ state: 'visible' });
  assert.equal(await pageKey(page), 'home'); assert.equal(await readDisk(), pageBefore);
  assert.equal(await page.locator('#platform-battle-name').textContent(), selectedBefore.battleName);
  record('页面重开恢复当前授权场并停在首页，正式文件保持一致');

  for (const item of contexts.splice(0)) await item.close();
  const restartBefore = await readDisk(); await app.close(); app = await startApp(options); allowedOrigins.clear(); allowedOrigins.add(app.url);
  assert.equal(await readDisk(), restartBefore); assert.deepEqual(app.workspace.selection, selectedBefore);
  const restoredContext = await context(), restored = await restoredContext.newPage(); await login(restored);
  assert.equal(await restored.locator('#platform-battle-name').textContent(), selectedBefore.battleName);
  assert.equal(await restored.locator('#platform-campaign-name').textContent(), selectedBefore.campaignName);
  assert.equal(await pageKey(restored), 'home'); assert.equal(await readDisk(), restartBefore);
  record('服务关闭再打开后从相同本地文件恢复，原身份入口仍可进入首页');

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1024, height: 600 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await restored.setViewportSize(viewport); await returnHome(restored);
    assert(await restored.locator('#platform-go-battle').isVisible());
    let bounds = await restored.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
    assert(bounds.document <= bounds.width + 1, `首页${viewport.width}不横向溢出`);
    for (const label of ['首页', '模组', '资源', '地图', '对话', '战斗']) assert(await restored.getByRole('button', { name: label, exact: true }).isVisible());
    await battle(restored);
    bounds = await restored.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
    assert(bounds.document <= bounds.width + 1, `战斗${viewport.width}不横向溢出`);
    const canvas = await restored.locator('canvas').boundingBox();
    assert(canvas.width >= 180 && canvas.height >= 120, `${viewport.width}×${viewport.height}棋盘需可操作：${JSON.stringify(canvas)}`);
    const background = await restored.locator('#table').evaluate(node => {
      for (let current = node; current; current = current.parentElement) {
        const values = getComputedStyle(current).backgroundColor.match(/[\d.]+/g)?.map(Number);
        if (values && (values.length < 4 || values[3] > .95)) return values.slice(0, 3);
      }
      return [255, 255, 255];
    });
    assert(Math.max(...background) < 90, '战斗白字需保留原有深色外层，不能直接透出浅色平台背景');
    await screenshot(restored, `战斗-${viewport.width}x${viewport.height}.png`);
  }
  await returnHome(restored); await restored.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await restored.locator('[data-platform-page="home"]').evaluate(node => getComputedStyle(node).transitionDuration);
  assert.equal(reduced, '0s'); await battle(restored); await returnHome(restored);
  assert.equal(await readDisk(), restartBefore);
  record('六种尺寸首页/战斗无整页横向溢出，纵向导航和棋盘可用，减少动态仍可往返');

  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, screenshots, pageErrors: errors, outsideRequests: outside }, null, 2) + '\n');
  console.log(`PASS: ${checks.length} groups; output ${directory}`);
} catch (error) {
  await writeFile(join(directory, 'failure.json'), JSON.stringify({ error: error.stack, checks, pageErrors: errors, outsideRequests: outside }, null, 2) + '\n');
  throw error;
} finally {
  releaseAction(); releaseState();
  for (const item of contexts) await item.close();
  await browser.close(); await app.close();
}

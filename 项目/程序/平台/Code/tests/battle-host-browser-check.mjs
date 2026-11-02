import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startPlatform } from '../server.mjs';
import { outputDirectory } from './check-helpers.mjs';
import { openWorkspace, newBattleState } from '../../../战斗/Code/src/workspace.mjs';
import { fixture } from '../../../战斗/Code/tests/fixture.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE
  || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
await mkdir(outputDirectory, { recursive: true });
const directory = await mkdtemp(join(outputDirectory, 'battle-host-browser-')), projectRoot = join(directory, '项目');
const storage = join(projectRoot, '模组'), seed = join(storage, '合成嵌入团/战斗/存档');
await mkdir(seed, { recursive: true });
const workspace = await openWorkspace({ seedDirectory: seed, workspaceDirectory: storage,
  initial: () => newBattleState('test-campaign', 'first-battle', '合成嵌入团', fixture()) });
const selection = workspace.selection;
await workspace.createBattle({ name: '合成第二场', templateBattleId: selection.battleId }, { role: 'dm', id: 'DM' });
const secondSelection = workspace.selection;
await workspace.select(selection, { role: 'dm', id: 'DM' }); await workspace.close();
await mkdir(join(projectRoot, '模组/多人短团/样本'), { recursive: true });
await writeFile(join(projectRoot, '模组/多人短团/样本/模组调用.json'), JSON.stringify({ id: 'module-1', name: '样本' }));
const app = await startPlatform({ port: 0, projectRoot, appearanceFile: join(directory, '外观.json') });
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] }).catch(async error => { await app.close(); throw error; });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
let battleOrigin, platformToken, activeFrame;
const errors = [], outside = [], requests = [], checks = [], screenshots = [], measurements = [];
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const headers = request.headers(); if (headers['x-platform-session']) platformToken = headers['x-platform-session'];
    requests.push({ url: request.url(), method: request.method() });
  });
});
await context.route('**/*', route => {
  const request = route.request(), url = request.url();
  if (/^(data:|about:)/.test(url) || new URL(url).origin === app.url || battleOrigin && new URL(url).origin === battleOrigin) return route.continue();
  if (request.isNavigationRequest() && request.frame().parentFrame() && new URL(url).hostname === '127.0.0.1' && new URL(url).protocol === 'http:') {
    battleOrigin = new URL(url).origin; return route.continue();
  }
  outside.push(url); return route.abort();
});
const page = await context.newPage();
const nav = name => page.locator('[data-platform-page="' + name + '"]').click();
const notice = page.locator('.p-appearance-status > .project-notice');
const pause = ms => new Promise(accept => setTimeout(accept, ms));
const check = name => { checks.push(name); console.log('PASS: ' + name); };
const shot = async name => { const path = join(directory, name); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };
async function until(read, accept, label, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt++) { const value = await read(); if (accept(value)) return value; await pause(100); }
  throw new Error('Timed out: ' + label);
}
const battleStatus = async () => (await page.request.get(app.url + '/api/battle/status', { headers: { 'X-Platform-Session': platformToken } })).json();

try {
  await page.goto(app.url); await page.locator('#enter-dm').click();
  await until(() => notice.textContent(), text => text.includes('本机DM可'), 'DM view');
  await nav('modules'); await page.locator('[data-project-panel=modules] > summary').click();
  await page.locator('[data-project-start-battle]').click();
  const choose = page.locator('[data-project-select-module="campaign:test-campaign"]'); await choose.waitFor({ timeout: 30000 });
  await until(battleStatus, value => value.projection?.state === 'saved', 'initial battle projection');
  await choose.click(); await page.locator('[data-project-battle-frame]').waitFor({ state: 'attached', timeout: 30000 });
  const frameElement = page.locator('[data-project-battle-frame]');
  battleOrigin = new URL(await frameElement.getAttribute('src')).origin;
  assert.equal(new URL(battleOrigin).hostname, '127.0.0.1'); assert.notEqual(battleOrigin, app.url);
  const frame = await (await frameElement.elementHandle()).contentFrame(); activeFrame = frame;
  await until(() => frame.locator('body').getAttribute('data-platform-embedded'), value => value === 'true', 'bridge ready');
  assert(await frame.locator('[data-tool=workspace]').first().isHidden());
  await nav('battle'); await frame.locator('#enter-dm').click(); await frame.locator('canvas[data-ready=true]').waitFor({ timeout: 30000 });
  await until(() => frame.locator('body').getAttribute('data-platform-visible'), value => value === 'true', 'battle visible');
  const hostBox = await frameElement.boundingBox(), workspaceBox = await page.locator('[data-platform-view=battle]').boundingBox();
  assert(hostBox && workspaceBox && hostBox.width >= workspaceBox.width * .8, 'Embedded battle should use the platform workspace width');
  const health = await (await page.request.get(battleOrigin + '/health')).json();
  assert.equal(health.embedOrigin, app.url); assert.equal(health.capabilities.platformBridge, 1); assert.equal(health.coreVersion, 'class-resource-tests-v8');
  const battleToken = await frame.evaluate(() => sessionStorage.getItem('battle-session'));
  let currentBattleToken = battleToken;
  const denied = await page.request.post(battleOrigin + '/api/select', { headers: { Authorization: 'Bearer ' + battleToken }, data: selection });
  assert([403, 409].includes(denied.status()), 'Embedded battle ownership can change only through the platform module window');
  assert((await denied.text()).includes('平台'));
  await shot('整合-独立战斗窗口.png');
  check('平台模组页显式启动独立战斗服务和选择已有团，iframe精确源桥接且保留最新战斗版本；子窗口不能另改所属团');

  await frame.locator('#roster [data-actor-id="pc-001"]').click(); await frame.locator('[data-tool=actor]').first().click();
  if (!await frame.locator('#edit-details').evaluate(node => node.open)) await frame.locator('#edit-details > summary').click();
  await frame.locator('#edit-notes').fill('只属于合成嵌入检查的草稿');
  await nav('home'); await pause(200);
  assert.equal(await page.locator('#platform-root').getAttribute('data-page'), 'battle');
  assert.equal(await frame.locator('#edit-notes').inputValue(), '只属于合成嵌入检查的草稿');
  assert((await notice.textContent()).includes('未提交编辑'));
  await frame.locator('#reload-editor').click(); await frame.locator('#actor-dialog [data-close-tool]').click();
  const before = await readFile(join(seed, '战斗状态.json'));
  await nav('home');
  await until(() => page.locator('#platform-root').getAttribute('data-page'), value => value === 'home', 'leave clean battle');
  await until(() => frame.locator('body').getAttribute('data-platform-visible'), value => value === 'false', 'hidden battle paused');
  const camera = await frame.locator('canvas').getAttribute('data-camera'); await pause(300);
  const reads = () => requests.filter(request => request.url === battleOrigin + '/api/state').length;
  const readsBefore = reads(); await pause(1700); assert.equal(reads(), readsBefore, 'Hidden battle polling is paused');
  assert.equal(await frame.locator('canvas').getAttribute('data-camera'), camera);
  assert.deepEqual(await readFile(join(seed, '战斗状态.json')), before);
  await nav('battle'); await until(() => frame.locator('body').getAttribute('data-platform-visible'), value => value === 'true', 'resume battle');
  assert((await frame.locator('canvas').boundingBox()).width > 100);
  check('未提交战斗草稿阻止父导航；放弃后安全往返，隐藏停止轮询和相机，导航不修改权威战斗文件');

  let unblock, requestStarted, requestFinished, requestFailed;
  const gate = new Promise(accept => { unblock = accept; });
  const started = new Promise(accept => { requestStarted = accept; });
  const continued = new Promise((accept, reject) => { requestFinished = accept; requestFailed = reject; });
  await context.route(battleOrigin + '/api/action', async route => {
    try { requestStarted(); await gate; await route.continue(); requestFinished(); }
    catch (error) { requestFailed(error); }
  });
  await frame.locator('[data-tool=actor]').first().click(); await frame.locator('#edit-hp').fill('32');
  const saved = page.waitForResponse(response => response.url() === battleOrigin + '/api/action' && response.request().method() === 'POST');
  await frame.locator('#edit-form button[type=submit]').click(); await started;
  await nav('home'); await pause(200); assert.equal(await page.locator('#platform-root').getAttribute('data-page'), 'battle');
  assert((await frame.locator('#save-status').textContent()).includes('保存中'));
  unblock(); await continued; assert.equal((await saved).status(), 200); await context.unroute(battleOrigin + '/api/action');
  await until(() => frame.locator('#save-status').textContent(), value => value.includes('v1'), 'saved actor edit');
  await frame.locator('#actor-dialog [data-close-tool]').click(); await nav('home');
  await until(() => page.locator('#platform-root').getAttribute('data-page'), value => value === 'home', 'leave after post');
  const state = JSON.parse(await readFile(join(seed, '战斗状态.json'), 'utf8'));
  assert.equal(state.revision, 1); assert.equal(state.actors.find(actor => actor.id === 'pc-001').hp, 32);
  await until(battleStatus, value => value.projection?.state === 'saved' && value.projection.revision === 1, 'projection transaction committed');
  const callPath = join(projectRoot, '战斗/合成嵌入团/first-battle/战斗调用.json');
  const call = await until(() => readFile(callPath, 'utf8').then(JSON.parse).catch(() => null), value => value?.payload?.projection?.sourceRevision === 1, 'updated projection');
  assert.equal(call.payload.projection.authoritative, false); assert(call.payload.projection.sourcePath.startsWith('资源/'));
  const current = JSON.parse(await readFile(join(projectRoot, call.current.path), 'utf8'));
  const entries = await Promise.all(call.resources.map(async resource => ({ resource, data: JSON.parse(await readFile(join(projectRoot, resource.path), 'utf8')) })));
  const actorBase = entries.find(entry => entry.data.data?.actor?.id === 'pc-001'); assert(actorBase); assert.equal(actorBase.data.data.actor.hp, 40);
  const delta = current.instances.find(instance => instance.resourceId === actorBase.resource.resourceId); assert(delta); assert.equal(delta.delta.hp, -8);
  assert((await readFile(join(projectRoot, '战斗/合成嵌入团/first-battle/战斗日志.txt'), 'utf8')).length > 0);
  check('在途POST阻止父导航，保存完成后可离开；权威状态在资源，当前保存-8差量，战斗目录生成调用JSON和TXT投影');

  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1024, height: 600 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(size); await nav('battle');
    await pause(150); await frame.locator('canvas[data-settled=true]').waitFor({ timeout: 15000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Parent overflow at ' + size.width);
    assert(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Battle overflow at ' + size.width);
    const canvas = await frame.locator('canvas').boundingBox(), host = await frameElement.boundingBox(); measurements.push({ size, canvas, host });
    assert(canvas && canvas.width > 100 && canvas.height >= 150, JSON.stringify({ size, canvas, host }));
    if (size.width <= 390) await shot('整合-战斗-' + size.width + '.png');
  }
  check('六尺寸父平台和独立战斗均无整页横向溢出，窄屏棋盘保持可见');

  await page.setViewportSize({ width: 1600, height: 1100 }); await nav('modules');
  const oldElement = await frameElement.elementHandle();
  await choose.locator('..').getByLabel('该团战斗').selectOption(secondSelection.battleId); await choose.click();
  await until(() => oldElement.evaluate(node => !node.isConnected), value => value, 'previous battle frame removed');
  await frameElement.waitFor({ state: 'attached' });
  const nextFrame = await (await frameElement.elementHandle()).contentFrame(); activeFrame = nextFrame;
  await until(() => nextFrame.locator('body').getAttribute('data-platform-embedded'), value => value === 'true', 'new battle bridge');
  const oldSession = await page.request.get(battleOrigin + '/api/state', { headers: { Authorization: 'Bearer ' + battleToken } });
  assert.equal(oldSession.status(), 401);
  await nav('battle'); assert.equal(await nextFrame.locator('canvas[data-ready=true]').count(), 0);
  await nextFrame.locator('#enter-dm').click(); await nextFrame.locator('canvas[data-ready=true]').waitFor();
  currentBattleToken = await nextFrame.evaluate(() => sessionStorage.getItem('battle-session'));
  assert.notEqual(currentBattleToken, battleToken);
  const nextState = await (await page.request.get(battleOrigin + '/api/state', { headers: { Authorization: 'Bearer ' + currentBattleToken } })).json();
  assert.equal(nextState.state.battleId, secondSelection.battleId);
  assert.equal(nextState.state.actors.find(actor => actor.id === 'pc-001').hp, 40);
  assert.equal(JSON.parse(await readFile(join(seed, '战斗状态.json'), 'utf8')).actors.find(actor => actor.id === 'pc-001').hp, 32);
  await shot('整合-战斗切换-新场.png');
  check('模组页切到另一场先注销并销毁旧frame，新frame无旧画面和旧token，重新核验后只显示新场状态');
  await nav('home');
  await until(() => page.locator('#platform-root').getAttribute('data-page'), value => value === 'home', 'return home before role switch');
  await page.locator('#platform-switch-identity').click(); await page.locator('#enter-player').click();
  await until(() => notice.textContent(), value => value.includes('Player当前为公共预览'), 'Player view');
  assert.equal(await page.locator('[data-project-battle-frame]').count(), 0);
  assert(!(await page.locator('body').textContent()).includes('只属于合成嵌入检查的草稿'));
  const obsolete = await page.request.get(battleOrigin + '/api/state', { headers: { Authorization: 'Bearer ' + currentBattleToken } });
  assert.equal(obsolete.status(), 401, 'Switching platform identity logs out the embedded DM session');
  await nav('battle'); assert.equal(await page.locator('[data-project-battle-frame]').count(), 0);
  await shot('整合-Player无旧战斗内容.png');
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  check('父首页换Player移除旧战斗画布并注销旧DM会话，Player不会重新加载旧团，未出现脚本错误或外网请求');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, screenshots, projectRoot, battleOrigin, errors, outside, requests, measurements }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, directory, errors, outside }, null, 2));
} catch (error) {
  await shot('整合-战斗失败现场.png').catch(() => {});
  const geometry = await activeFrame?.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    outside: [...document.querySelectorAll('body *')].map(node => ({ tag: node.tagName, id: node.id, className: String(node.className), right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width })).filter(node => node.width && node.right > innerWidth + 1).slice(0, 20) })).catch(() => null);
  await writeFile(join(directory, 'failure.json'), JSON.stringify({ error: error.message, checks, errors, outside, geometry, measurements }, null, 2)); throw error;
} finally { await browser.close(); await app.close(); }

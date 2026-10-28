import { enterBattle } from './browser-platform.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture } from './fixture.mjs';

const { chromium } = await import(pathToFileURL(process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../开发记录/临时/界面联机检查/', import.meta.url));
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'campaign-'));
const app = await startApp({ campaignDir: directory, port: 0,
  // This loopback interface exercises the complete sharing gateway without publishing a real game.
  sharingOptions: { host: '127.0.0.1', interfaces: () => ({ test: [{ address: '127.0.0.1', family: 'IPv4', internal: false }] }) },
  initial: () => {
    const state = fixture();
    state.actors[0].notes = 'PRIVATE_NOTE_CANARY';
    const second = { ...structuredClone(state.actors[0]), id: 'pc-002', ownerId: 'player-2', name: '测试旅伴', tiePriority: 2,
      position: { x: 42.5, y: 0, z: 22.5 } };
    const hidden = { ...structuredClone(state.actors[1]), id: 'npc-hidden', name: 'HIDDEN_ACTOR_CANARY', hidden: true, tiePriority: 3,
      position: { x: 72.5, y: 0, z: 62.5 } };
    state.actors.push(second, hidden);
    return state;
  } });
const browser = await chromium.launch({ executablePath: process.env.BATTLE_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
const errors = [], external = [], checks = [], screenshots = [], allowedOrigins = new Set([app.url]);
const contexts = [];
let host, remote, local;

async function context(viewport = { width: 1440, height: 1000 }) {
  const result = await browser.newContext({ viewport, deviceScaleFactor: 1 }); contexts.push(result);
  result.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await result.route('**/*', route => {
    if (allowedOrigins.has(new URL(route.request().url()).origin)) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  return result;
}
async function settle(page) {
  await enterBattle(page);await page.locator('canvas[data-ready="true"]').waitFor();
  await page.waitForTimeout(100);
  await page.locator('canvas[data-settled="true"]').waitFor({ timeout: 20000 });
}
async function login(page, identity) {
  await page.goto(app.url);
  if (identity === 'DM') await page.locator('#enter-dm').click();
  else { await page.locator('#identity').fill(identity); await page.locator('#login-form button').click(); }
  await settle(page);
}
async function closeTools(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
}
async function tool(page, name) {
  await closeTools(page);
  await page.locator(`[data-tool="${name}"]:visible`).first().click();
  if (['setup', 'terrain'].includes(name)) await page.locator('#scene-tools').waitFor();
  else if (name !== 'actions' || page.viewportSize().width <= 1100) await page.locator(`#${name}-dialog[open]`).waitFor();
}
async function actions(page) {
  if (page.viewportSize().width <= 1100 && !await page.locator('#actions-dialog').evaluate(dialog => dialog.open)) await tool(page, 'actions');
}
async function waitRevision(page, version = app.store.state.revision) {
  await page.waitForFunction(revision => document.querySelector('#save-status').textContent.includes(`v${revision}`), version, { timeout: 12000 });
}
async function changed(page, run) {
  const before = app.store.state.revision;
  await run(); await waitRevision(page, before + 1);
  assert.equal(app.store.state.revision, before + 1, '一次操作只能落盘一次');
  return app.store.state;
}
async function screenshot(page, filename) {
  const path = join(output, filename); await page.screenshot({ path }); screenshots.push(path);
}
async function rawRequest(page, path, payload, overrideToken) {
  return page.evaluate(async ({ path, payload, overrideToken }) => {
    const token = overrideToken ?? sessionStorage.getItem('battle-session');
    const response = await fetch(path, { method: payload === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    return { status: response.status, body: await response.json() };
  }, { path, payload, overrideToken });
}
function command(type, payload) {
  const state = app.store.state;
  return { campaignId: state.campaignId, battleId: state.battleId, expectedRevision: state.revision, actionId: randomUUID(), type, payload };
}
async function screenPoint(page, position) {
  await settle(page);
  return page.evaluate(async p => {
    const THREE = await import('/vendor/three.module.js');
    const canvas = document.querySelector('canvas'), rect = canvas.getBoundingClientRect(), view = JSON.parse(canvas.dataset.camera);
    const camera = new THREE.PerspectiveCamera(44, rect.width / rect.height, .1, 1000);
    camera.position.set(view.target[0] + view.distance * Math.sin(view.polar) * Math.sin(view.azimuth),
      view.distance * Math.cos(view.polar), view.target[2] + view.distance * Math.sin(view.polar) * Math.cos(view.azimuth));
    camera.lookAt(new THREE.Vector3(...view.target)); camera.updateMatrixWorld();
    const point = new THREE.Vector3(p.x, p.y, p.z).project(camera);
    return { x: rect.x + (point.x + 1) * rect.width / 2, y: rect.y + (1 - point.y) * rect.height / 2 };
  }, position);
}
async function dragActor(page, actorId, destination, cancel = false) {
  await closeTools(page);
  const actor = app.store.state.actors.find(item => item.id === actorId), y = (actor.position.y || 0) + actor.body.height / 2 + .1;
  const start = await screenPoint(page, { ...actor.position, y }), end = await screenPoint(page, { ...destination, y });
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.locator(`canvas[data-dragging="${actorId}"]`).waitFor({ timeout: 5000 });
  if (typeof cancel === 'function') await cancel();
  else if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
}
async function submitInitiative(page, actorId, values) {
  await actions(page);
  const row = page.locator(`[data-initiative-actor="${actorId}"]`);
  await row.waitFor();
  const inputs = row.locator('input'); assert.equal(await inputs.count(), values.length);
  for (let i = 0; i < values.length; i++) await inputs.nth(i).fill(String(values[i]));
  return changed(page, () => row.locator('button[data-submit-initiative]').click());
}

try {
  host = await (await context()).newPage(); await login(host, 'DM');
  for (const [width, height] of [[1920,1080], [1366,768], [1024,600], [768,1024], [390,844], [360,640]]) {
    await host.setViewportSize({ width, height }); await closeTools(host); await settle(host);
    const layout = await host.evaluate(() => {
      const canvas = document.querySelector('canvas').getBoundingClientRect();
      const status = document.querySelector('#save-status').getBoundingClientRect();
      return { scrollWidth: document.documentElement.scrollWidth, width: innerWidth, height: innerHeight,
        canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height, bottom: canvas.bottom },
        statusVisible: status.width > 0 && status.height > 0 && status.bottom <= innerHeight };
    });
    assert(layout.scrollWidth <= width, `${width}屏宽不能横向溢出：${JSON.stringify(layout)}`);
    assert(layout.canvas.width >= 150 && layout.canvas.height >= 150 && layout.canvas.y >= 0 && layout.canvas.bottom <= height + 2,
      `${width}尺寸首屏必须直接看到可用棋盘：${JSON.stringify(layout)}`);
    assert(layout.statusVisible, '小屏也必须可见保存状态');
    await screenshot(host, `战局-${width}x${height}.png`);
    await tool(host, 'help'); await closeTools(host);
    assert(await host.locator('[data-tool="help"]').evaluate(button => document.activeElement === button), '关闭工具应返回触发按钮');
    await tool(host, 'setup'); await host.locator('#place-x').waitFor();
    assert(await host.locator('canvas').isVisible()); await closeTools(host);
    if (width <= 1100) { await actions(host); assert(await host.locator('#dice-mode').isVisible()); await closeTools(host); }
  }
  checks.push('六种屏幕首屏可见棋盘、保存状态，无横向溢出；工具与小屏抽屉可关闭并恢复焦点');
  await host.setViewportSize({ width: 1440, height: 1000 }); await settle(host);

  const original = structuredClone(app.store.state.actors[0].position), beforeCamera = JSON.parse(await host.locator('canvas').getAttribute('data-camera'));
  await changed(host, () => dragActor(host, 'pc-001', { x: original.x, z: original.z + 10 }));
  assert.equal(app.store.state.actors[0].position.z, original.z + 10);
  const afterCamera = JSON.parse(await host.locator('canvas').getAttribute('data-camera'));
  for (const key of ['azimuth', 'polar', 'distance']) assert(Math.abs(afterCamera[key] - beforeCamera[key]) < .01, '拖棋子不能转动镜头');
  assert(Math.hypot(...afterCamera.target.map((value, index) => value - beforeCamera.target[index])) < .01, '拖棋子不能平移镜头');
  const persisted = JSON.parse(await readFile(join(directory, '战斗状态.json'), 'utf8'));
  assert.equal(persisted.actors[0].position.z, original.z + 10);
  await changed(host, () => host.locator('#undo').click());
  assert.equal(app.store.state.actors[0].position.z, original.z);
  const cancelRevision = app.store.state.revision;
  await dragActor(host, 'pc-001', { x: original.x, z: original.z + 10 }, true); await host.waitForTimeout(200);
  assert.equal(app.store.state.revision, cancelRevision);
  const ground = await screenPoint(host, { x: 60, y: 0, z: 45 }), camera = JSON.parse(await host.locator('canvas').getAttribute('data-camera'));
  await host.mouse.move(ground.x, ground.y); await host.mouse.down(); await host.mouse.move(ground.x + 55, ground.y + 18, { steps: 8 }); await host.mouse.up(); await settle(host);
  assert(Math.abs(JSON.parse(await host.locator('canvas').getAttribute('data-camera')).azimuth - camera.azimuth) > .1);
  await host.locator('#reset-camera').click(); await settle(host);
  checks.push('战前拖动只保存一次且能撤销；Esc取消不写进度；空地拖动旋转镜头');

  await tool(host, 'sharing');
  await host.locator('#share-lan').click(); await host.locator('#share-status').filter({ hasText: '同Wi-Fi可加入' }).waitFor();
  const sharing = (await rawRequest(host, '/api/sharing')).body;
  allowedOrigins.add(sharing.localUrl);
  await host.locator('#share-actor').selectOption('pc-001'); await host.locator('#share-invite').click();
  await host.locator('#share-link:not([hidden])').waitFor();
  const invite = await host.locator('#share-link').inputValue();
  assert.equal(new URL(invite).origin, sharing.localUrl);
  remote = await (await context()).newPage(); await remote.goto(invite); await settle(remote);
  assert.equal(new URL(remote.url()).hash, '', '加入后不应在地址栏继续保留邀请');
  assert(await remote.locator('#enter-dm').isHidden());
  assert.equal(await remote.locator('[data-tool="sharing"]:visible').count(), 0);
  assert.equal(await remote.locator('canvas').getAttribute('data-actor-count'), '3');
  const projected = await rawRequest(remote, '/api/state');
  assert.equal(projected.status, 200);
  for (const secret of ['PRIVATE_NOTE_CANARY', 'HIDDEN_ACTOR_CANARY', 'npc-hidden']) assert(!JSON.stringify(projected.body).includes(secret));
  const token = await host.evaluate(() => sessionStorage.getItem('battle-session'));
  assert.equal((await rawRequest(remote, '/api/login', { id: 'DM' })).status, 403);
  assert.equal((await rawRequest(remote, '/api/sharing')).status, 403);
  assert.equal((await rawRequest(remote, '/api/state', undefined, token)).status, 401);
  const deniedRevision = app.store.state.revision;
  assert.equal((await rawRequest(remote, '/api/action', command('edit-actor', { actorId: 'pc-002', patch: { hp: 1 } }))).status, 403);
  assert.equal(app.store.state.revision, deniedRevision);
  local = await (await context()).newPage(); await login(local, 'player-2');
  await closeTools(host);
  checks.push('主持通过按钮生成邀请；共享玩家浏览器加入，秘密被过滤，远程不能进入DM或使用本机DM令牌');

  await changed(host, () => host.locator('#dice-mode').selectOption('physical'));
  await changed(host, () => host.locator('#start').click());
  await waitRevision(remote); await waitRevision(local);
  assert.equal(await remote.locator('[data-initiative-actor]').count(), 1);
  assert.equal(await local.locator('[data-initiative-actor]').count(), 1);
  await local.locator('[data-initiative-actor="pc-002"] input').fill('12');
  await host.locator('[data-initiative-actor="npc-001"] input').fill('7');
  assert.equal((await rawRequest(remote, '/api/action', command('submit-initiative', { actorId: 'pc-002', rolls: [20] }))).status, 403);
  await submitInitiative(remote, 'pc-001', [20]);
  await waitRevision(local); await waitRevision(host);
  assert.equal(await local.locator('[data-initiative-actor="pc-002"] input').inputValue(), '12');
  assert.equal(await host.locator('[data-initiative-actor="npc-001"] input').inputValue(), '7');
  await changed(local, () => local.locator('[data-submit-initiative="pc-002"]').click());
  await waitRevision(host);
  await changed(host, () => host.locator('[data-submit-initiative="npc-001"]').click());
  await submitInitiative(host, 'npc-hidden', [4]);
  await remote.reload(); await settle(remote);
  assert.match(await remote.locator('[data-initiative-actor="pc-001"]').innerText(), /先攻 22/);
  await changed(host, () => host.locator('#start').click());
  await waitRevision(remote); await waitRevision(local);
  assert.equal(app.store.state.combat.order[0], 'pc-001');
  assert.deepEqual(app.store.state.combat.initiative.map(item => item.total), [22, 9, 14, 6]);
  checks.push('两位玩家各填自己的先攻，DM填NPC；后台同步保留未提交骰点，刷新保留已提交值，开始不重掷');

  const revisionBeforeMove = app.store.state.revision;
  await changed(remote, () => dragActor(remote, 'pc-001', { x: 22.5, z: 27.5 }));
  assert.equal(app.store.state.combat.moved, 5); await waitRevision(host);
  assert.equal(app.store.state.revision, revisionBeforeMove + 1);
  const moved = structuredClone(app.store.state.actors[0].position);
  const denied = app.store.state.revision;
  await dragActor(remote, 'pc-001', { x: 22.5, z: 67.5 });
  await remote.locator('#toast').filter({ hasText: '移动距离超过' }).waitFor();
  assert.equal(app.store.state.revision, denied);
  assert.deepEqual(app.store.state.actors[0].position, moved);
  await changed(host, () => host.locator('#undo').click()); await waitRevision(remote);
  assert.equal(app.store.state.combat.moved, 0);
  const cancelInCombat = app.store.state.revision;
  await dragActor(remote, 'pc-001', { x: 22.5, z: 27.5 }, true); await remote.waitForTimeout(200);
  assert.equal(app.store.state.revision, cancelInCombat);
  await dragActor(remote, 'pc-001', { x: 22.5, z: 27.5 }, async () => {
    await remote.locator('#target-choice').focus();
    assert.equal(await remote.locator('canvas').getAttribute('data-dragging'), null);
  });
  assert.equal(app.store.state.revision, cancelInCombat);
  await dragActor(remote, 'pc-001', { x: 22.5, z: 27.5 }, async () => {
    await changed(host, () => host.locator('#dice-mode').selectOption('program'));
    await waitRevision(remote);
    assert.equal(await remote.locator('canvas').getAttribute('data-dragging'), null);
  });
  assert.equal(app.store.state.actors[0].position.z, 22.5);
  assert.equal(app.store.state.revision, cancelInCombat + 1);
  await changed(host, () => host.locator('#dice-mode').selectOption('physical')); await waitRevision(remote);
  checks.push('共享玩家拖动按规则消耗移动力，超速拒绝复位，取消不保存，DM撤销同步恢复');

  await remote.locator('#target-choice').selectOption('npc-001');
  await remote.locator('#physical-d20 input').waitFor(); await remote.locator('#physical-d20 input').fill('20');
  await remote.waitForFunction(() => document.querySelectorAll('#physical-damage input').length === 2);
  await remote.locator('#physical-damage input').nth(0).fill('4'); await remote.locator('#physical-damage input').nth(1).fill('5');
  await changed(remote, () => remote.locator('#attack-form button[type="submit"]').click());
  assert.equal(app.store.state.actors.find(actor => actor.id === 'npc-001').hp, 28);
  await screenshot(remote, '玩家-集中骰点与结果.png');
  checks.push('共享玩家在线下骰攻击区完成重击伤害录入，本地核心只结算一次');

  await waitRevision(host); await changed(host, () => host.locator('#next').click()); await waitRevision(remote);
  await changed(host, () => host.locator('#next').click()); await waitRevision(remote);
  await changed(host, () => host.locator('#next').click()); await waitRevision(remote);
  await changed(host, () => host.locator('#next').click()); await waitRevision(remote);
  await remote.locator('#physical-d20 input').waitFor(); await remote.locator('#physical-d20 input').fill('16');
  await remote.locator('#physical-damage input').fill('3');
  for (let i = 0; i < 4; i++) { await changed(host, () => host.locator('#next').click()); await waitRevision(remote); }
  await remote.locator('#physical-d20 input').waitFor();
  assert.equal(await remote.locator('#physical-d20 input').inputValue(), '', '上一轮未提交的攻击骰不能带到下一轮');
  checks.push('跨回合重新显示当前待办，上一轮未提交的攻击骰不会复用');

  await waitRevision(host); await tool(host, 'sharing');
  await host.locator('#share-stop').click(); await host.locator('#share-status').filter({ hasText: '分享已关闭' }).waitFor();
  await remote.locator('#connection-status').filter({ hasText: /中断|断开|重连/ }).waitFor({ timeout: 12000 });
  assert.equal(app.sharing.status().enabled, false);
  assert(await remote.locator('#next').isDisabled());
  const finalSaved = JSON.parse(await readFile(join(directory, '战斗状态.json'), 'utf8'));
  assert.equal(finalSaved.revision, app.store.state.revision);
  checks.push('关闭分享后玩家明确看到断线并停止提交；主机已保存进度仍存在');

  await closeTools(host); await host.locator('#roster [data-actor-id="pc-001"]').click();
  await tool(host, 'actor'); await host.locator('#edit-resources').fill('UNSAVED_EDITOR_CANARY'); await closeTools(host);
  const modeBefore = app.store.state.revision;
  await host.locator('#dice-mode').selectOption('program'); await host.waitForTimeout(250);
  assert(app.store.state.revision === modeBefore || app.store.state.revision === modeBefore + 1);
  await tool(host, 'actor');
  assert.equal(await host.locator('#edit-resources').inputValue(), 'UNSAVED_EDITOR_CANARY', '其他操作不能静默覆盖未保存角色草稿');
  assert.notEqual(app.store.state.actors[0].resources, 'UNSAVED_EDITOR_CANARY');
  await host.locator('#reload-editor').click(); await closeTools(host);
  const manualDetails = host.locator('#dm-tools > details');
  if (!await manualDetails.evaluate(element => element.open)) await manualDetails.locator('summary').click();
  await host.locator('#manual-reason').fill('FIRST_ACTOR_DRAFT_CANARY'); await host.locator('#manual-heal').fill('7');
  await host.locator('#roster [data-actor-id="npc-001"]').click();
  assert.notEqual(await host.locator('#manual-reason').inputValue(), 'FIRST_ACTOR_DRAFT_CANARY', 'DM裁定草稿不能随选中角色转移');
  assert.notEqual(await host.locator('#manual-heal').inputValue(), '7');
  checks.push('未保存角色编辑不会被其他操作覆盖；DM裁定草稿按角色隔离');

  if (!await manualDetails.evaluate(element => element.open)) await manualDetails.locator('summary').click();
  await host.locator('#manual-reason').fill('PRIVATE_LATEST_EVENT_CANARY');
  await host.locator('#manual-heal').fill('0'); await host.locator('#manual-temp').fill('0'); await host.locator('#manual-damage').fill('0');
  await host.locator('#manual-public').fill('');
  await changed(host, () => host.locator('#manual-form button[type="submit"]').click());
  assert.match(await host.locator('#latest-event-text').innerText(), /PRIVATE_LATEST_EVENT_CANARY/);
  await host.locator('.session-menu > summary').click(); await host.locator('#logout').click();
  await host.locator('#login').waitFor();
  assert(!(await host.content()).includes('PRIVATE_LATEST_EVENT_CANARY'), '退出DM必须清除最后一条私密记录');
  await host.locator('#enter-dm').click(); await settle(host);
  let releaseHandoff, handoffFetched;
  const heldResponse = new Promise(resolve => { releaseHandoff = resolve; });
  const fetched = new Promise(resolve => { handoffFetched = resolve; });
  await host.route('**/api/handoff', async route => {
    const response = await route.fetch(); handoffFetched(); await heldResponse; await route.fulfill({ response });
  }, { times: 1 });
  await tool(host, 'exchange'); await host.locator('#export-handoff').click();
  await Promise.race([fetched, host.waitForTimeout(10000).then(() => { throw new Error('等待导出请求超时'); })]);
  await closeTools(host); await host.locator('.session-menu > summary').click(); await host.locator('#logout').click();
  await host.locator('#identity').fill('player-2'); await host.locator('#login-form button').click(); await settle(host);
  releaseHandoff(); await host.waitForTimeout(250);
  assert.equal(await host.locator('#exchange-text').inputValue(), '', '前一身份迟到的DM局面包不能写回玩家界面');
  assert(!(await host.content()).includes('PRIVATE_LATEST_EVENT_CANARY'));
  checks.push('退出清空DM私密摘要，迟到的旧身份响应不会污染新玩家界面');

  await host.locator('.session-menu > summary').click(); await host.locator('#logout').click();
  await host.locator('#enter-dm').click(); await settle(host);
  await host.locator('#target-choice').selectOption('npc-001');
  await host.locator('#physical-d20 input').waitFor(); await host.locator('#physical-d20 input').fill('15');
  await host.locator('.session-menu > summary').click(); await changed(host, () => host.locator('#end').click());
  assert(await host.locator('#physical-d20 input').evaluateAll(inputs => inputs.every(input => input.value === '')), '结束战斗时未提交攻击骰应清空');
  await tool(host, 'exchange'); await host.locator('#export-handoff').click();
  await host.waitForFunction(() => document.querySelector('#exchange-text').value.includes('PRIVATE_LATEST_EVENT_CANARY'));
  let releaseOldBattle, oldBattleFetched;
  const heldBattleResponse = new Promise(resolve => { releaseOldBattle = resolve; });
  const fetchedBattle = new Promise(resolve => { oldBattleFetched = resolve; });
  await host.route('**/api/handoff', async route => {
    const response = await route.fetch(); oldBattleFetched(); await heldBattleResponse; await route.fulfill({ response });
  }, { times: 1 });
  await host.locator('#export-handoff').click();
  await Promise.race([fetchedBattle, host.waitForTimeout(10000).then(() => { throw new Error('等待旧战斗导出请求超时'); })]);
  await tool(host, 'workspace');
  if (!await host.locator('#new-battle-form').isVisible()) await host.locator('#workspace-panel details > summary').click();
  await host.locator('#new-battle-name').fill('界面隔离检查'); await host.locator('#new-battle-form button').click();
  await host.waitForFunction(() => document.querySelector('#title').textContent === '界面隔离检查');
  assert.equal(await host.locator('#exchange-text').inputValue(), '', '切换战斗应清空原战斗的交接包');
  releaseOldBattle(); await host.waitForTimeout(250);
  assert.equal(await host.locator('#exchange-text').inputValue(), '', '旧战斗迟到的导出不应填回当前战斗');
  checks.push('结束战斗清空攻击草稿，切换战斗清空交接内容并拒绝旧战斗迟到响应');
  assert.equal(errors.length, 0, errors.join('\n')); assert.equal(external.length, 0, external.join('\n'));
  await writeFile(join(output, '结果.json'), JSON.stringify({ browser: await browser.version(), checks, screenshots, directory,
    networkScope: '仅隔离的本机多客户端及玩家网关；未模拟或宣称真实第二设备/公网成功', errors, external }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, output }, null, 2));
} catch (error) {
  for (const [label, page] of [['DM', host], ['共享玩家', remote], ['本机玩家', local]]) {
    if (page && !page.isClosed()) await page.screenshot({ path: join(output, `失败-${label}.png`), fullPage: true }).catch(() => {});
  }
  await writeFile(join(output, '失败.json'), JSON.stringify({ message: error.message, stack: error.stack, checks, errors, external, directory }, null, 2));
  throw error;
} finally { await browser.close(); await app.close(); }

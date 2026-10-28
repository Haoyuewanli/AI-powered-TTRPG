import { enterBattle } from './browser-platform.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture } from './fixture.mjs';
const { chromium } = await import(pathToFileURL(process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../开发记录/临时/战斗流程检查/', import.meta.url));
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'campaign-'));
const app = await startApp({ campaignDir: directory, port: 0, initial: fixture });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const errors = [], external = [], checks = [];
await context.route('**/*', route => { if (route.request().url().startsWith(app.url + '/')) return route.continue(); external.push(route.request().url()); return route.abort(); });
const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
async function tool(name) {
  if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
  await page.locator(`[data-tool="${name}"]`).first().click();
}
async function library() {
  await tool('workspace');
  if ((await page.locator('#workspace-panel details').getAttribute('open')) === null) await page.locator('#workspace-panel details > summary').click();
}
async function changed(run) { const old = app.store.state.revision; await run(); await page.waitForFunction(v => document.querySelector('#save-status').textContent.includes(`v${v + 1}`), old); }
async function switched(run, prior = app.store.state.battleId) { await run(); await page.waitForFunction(id => document.querySelector('#battle-select').value !== id, prior); await page.waitForTimeout(80); }
async function select(selection) { await library(); await page.locator('#campaign-select').selectOption(selection.campaignId); await page.locator('#battle-select').selectOption(selection.battleId); await page.locator('#open-battle').click(); await page.waitForFunction(id => document.querySelector('#battle-select').value === id && document.querySelector('#title').textContent.length > 0, selection.battleId); await page.waitForTimeout(120); }
async function groundClick(x, z) {
  await page.locator('#viewport').scrollIntoViewIfNeeded(); await page.locator('canvas[data-settled=true]').waitFor();
  const point = await page.evaluate(async ({ x, z }) => {
    const THREE = await import('/vendor/three.module.js'), canvas = document.querySelector('canvas'), box = canvas.getBoundingClientRect();
    const view = JSON.parse(canvas.dataset.camera), cam = new THREE.PerspectiveCamera(44, box.width / box.height, .1, 1000);
    cam.position.set(view.target[0] + view.distance * Math.sin(view.polar) * Math.sin(view.azimuth), view.distance * Math.cos(view.polar), view.target[2] + view.distance * Math.sin(view.polar) * Math.cos(view.azimuth));
    cam.lookAt(new THREE.Vector3(...view.target)); cam.updateMatrixWorld();
    const point = new THREE.Vector3(x, 0, z).project(cam); return { x: box.x + (point.x + 1) * box.width / 2, y: box.y + (1 - point.y) * box.height / 2 };
  }, { x, z });
  await page.mouse.click(point.x, point.y);
}
try {
  await page.goto(app.url); await page.locator('#enter-dm').click(); await enterBattle(page);await page.locator('canvas[data-ready=true]').waitFor();
  await page.locator('#campaign-select option').first().waitFor({ state: 'attached' });
  const first = app.workspace.selection; checks.push('免口令DM入口与步骤引导');
  await tool('setup');
  await changed(() => page.locator('#clone-actor').click());
  const copied = app.store.state.actors.at(-1); assert.equal(copied.confirmed, false);
  await page.locator('#place-x').fill('42.5'); await page.locator('#place-z').fill('42.5'); await changed(() => page.locator('#place-actor').click());
  assert.equal(app.store.state.actors.at(-1).position.x, 42.5);
  await changed(() => page.locator('#remove-actor').click()); assert.equal(app.store.state.actors.length, 2); checks.push('显式复制、摆放、移出棋子');
  await library();
  await page.locator('#new-battle-name').fill('第二场'); await switched(() => page.locator('#new-battle-form button').click());
  const second = app.workspace.selection; assert.notEqual(first.battleId, second.battleId);
  await tool('actor'); await page.locator('#edit-hp').fill('23'); await changed(() => page.locator('#edit-form button[type=submit]').click());
  await select(first); assert.equal(app.store.state.actors[0].hp, 40);
  await select(second); assert.equal(app.store.state.actors[0].hp, 23); checks.push('同团两场战斗互不覆盖');
  await library(); await page.locator('#new-campaign-name').fill('第二个团'); await switched(() => page.locator('#new-campaign-form button').click());
  assert.notEqual(app.workspace.selection.campaignId, first.campaignId);
  await select(first); checks.push('新建独立团并切回');
  await tool('terrain');
  await page.locator('#board-width').fill('120'); await page.locator('#board-depth').fill('100'); await changed(() => page.locator('#board-form button').click());
  for (const [type, name, x, z, y] of [['wall','墙',50,50,0], ['hill','隆起',70,70,0], ['floor','二楼',90,50,9], ['floor','三楼',90,50,19], ['stairs','楼梯',75,50,0], ['prop','HIDDEN_PROP_CANARY',100,85,0]]) {
    await page.locator('#terrain-new').click(); await page.locator('#terrain-type').selectOption(type); await page.locator('#terrain-name').fill(name);
    for (const [axis, value] of [['x',x], ['z',z], ['y',y]]) await page.locator(`#terrain-${axis}`).fill(String(value));
    if (type === 'prop') await page.locator('#terrain-hidden').check();
    await changed(() => page.locator('#terrain-save').click());
  }
  assert.equal(app.store.state.objects.length, 6); assert.equal(await page.locator('canvas').getAttribute('data-object-count'), '6');
  const terrainId = app.store.state.objects[0].id;
  await page.locator('#terrain-select').selectOption(terrainId); await page.locator('#terrain-rotation').selectOption('90'); await changed(() => page.locator('#terrain-save').click());
  await page.locator('#terrain-place-mode').check(); await changed(() => groundClick(50,65));
  assert.equal(app.store.state.objects[0].position.z, 65); await page.locator('#terrain-place-mode').uncheck();
  checks.push('可改盘面及五种积木，二/三楼、旋转和点击摆放');
  await tool('setup'); await page.locator('#roster [data-actor-id="pc-001"]').click(); await page.locator('#place-mode').check();
  await changed(() => groundClick(37.5,42.5)); assert.equal(app.store.state.actors[0].position.x, 37.5);
  await page.locator('#place-mode').uncheck(); await page.locator('#place-y').fill('10'); await changed(() => page.locator('#place-actor').click());
  assert.equal(app.store.state.actors[0].position.y, 10);
  await page.locator('#place-x').fill('22.5'); await page.locator('#place-z').fill('22.5'); await page.locator('#place-y').fill('0'); await changed(() => page.locator('#place-actor').click());
  checks.push('点击摆放棋子与脚底高度设置');
  const playerPage = await context.newPage(); playerPage.on('pageerror', e => errors.push(e.message));
  await playerPage.goto(app.url); await playerPage.locator('#identity').fill('player-1'); await playerPage.locator('#login-form button').click(); await enterBattle(playerPage);await playerPage.locator('canvas[data-ready=true]').waitFor();
  assert.equal(await playerPage.locator('canvas').getAttribute('data-object-count'), '5');
  assert(!(await playerPage.content()).includes('HIDDEN_PROP_CANARY')); await playerPage.close();
  await page.reload(); await enterBattle(page);await page.locator('canvas[data-ready=true]').waitFor();
  assert.equal(app.store.state.board.width, 120); assert.equal(await page.locator('canvas').getAttribute('data-object-count'), '6');
  checks.push('隐藏地形不进玩家页面，重载保留盘面和地形');
  await tool('terrain');
  await page.locator('#viewport').scrollIntoViewIfNeeded(); await page.locator('canvas[data-settled=true]').waitFor();
  await page.locator('#viewport').screenshot({ path: join(output, '地形棋盘.png') });
  await changed(() => page.locator('#dice-mode').selectOption('physical'));
  await changed(() => page.locator('#start').click());
  for (const [id, value] of [['pc-001','20'], ['npc-001','1']]) {
    await page.locator(`[data-initiative-actor="${id}"] input`).fill(value);
    await changed(() => page.locator(`[data-submit-initiative="${id}"]`).click());
  }
  await changed(() => page.locator('#start').click()); assert.equal(app.store.state.combat.order[0], 'pc-001');
  await page.locator('#roster [data-actor-id="pc-001"]').click();
  await page.locator('#physical-d20 input').waitFor(); await page.locator('#physical-d20 input').fill('20');
  assert.equal(await page.locator('#physical-damage input').count(), 2);
  await page.locator('#physical-damage input').nth(0).fill('4'); await page.locator('#physical-damage input').nth(1).fill('5');
  await changed(() => page.locator('#attack-form button[type=submit]').click()); assert.equal(app.store.state.actors[1].hp, 28);
  await changed(() => page.locator('#undo').click()); assert.equal(app.store.state.actors[1].hp, 40); assert(app.store.state.events.at(-2).undoneBy); checks.push('线下先攻、重击双倍伤害骰与有记录的撤销');
  await tool('exchange'); await page.locator('#export-handoff').click();
  await page.waitForFunction(() => document.querySelector('#exchange-text').value.includes('local-dm-exchange-v2'));
  const pack = JSON.parse(await page.locator('#exchange-text').inputValue());
  pack.proposal.type = 'next'; pack.proposal.payload = {};
  await page.locator('#exchange-text').fill(JSON.stringify({ proposal: pack.proposal })); const before = app.store.state.revision;
  await page.locator('#preview-proposal').click(); assert.equal(app.store.state.revision, before);
  await changed(() => page.locator('#import-proposal').click()); checks.push('外部AI提议先预览，再经核心执行');
  await page.screenshot({ path: join(output, '操作流程.png'), fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await writeFile(join(output, '结果.json'), JSON.stringify({ checks, errors, external }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { await browser.close(); await app.close(); }

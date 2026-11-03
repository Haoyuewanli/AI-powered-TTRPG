import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { active } from './fixture.mjs';
const outRoot = fileURLToPath(new URL('../../../../../开发记录/临时/战斗动效检查/', import.meta.url)); await mkdir(outRoot, { recursive: true });
const directory = await mkdtemp(join(outRoot, 'events-')), seed = join(directory, '战斗'); await mkdir(seed);
const initial = active(); initial.actors[0].attacks[0].name = '长剑';
const app = await startApp({ campaignDir: seed, workspaceDir: join(directory, '工作区'), port: 0, initial: () => initial, resourceProvider: { catalog: async () => ({ resources: [] }), read: async () => ({}) } });
const { chromium } = await import(pathToFileURL(join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
let browser; const errors = [];
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
  const dmContext = await browser.newContext(), playerContext = await browser.newContext();
  const dm = await dmContext.newPage(), player = await playerContext.newPage();
  for (const page of [dm, player]) { page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000); }
  await dm.goto(app.url); await dm.locator('#enter-dm').click(); await dm.locator('#viewport canvas').waitFor();
  await player.goto(app.url); await player.locator('#identity').fill('player-1'); await player.locator('#login-form button').click(); await player.locator('#viewport canvas').waitFor();
  const token = await dm.evaluate(() => sessionStorage.getItem('battle-session'));
  const state = app.store.state;
  const result = await dm.request.post(app.url + '/api/action', { headers: { Authorization: 'Bearer ' + token }, data: { campaignId: state.campaignId, battleId: state.battleId, expectedRevision: state.revision, actionId: 'visual-browser-attack', type: 'attack', payload: { actorId: 'pc-001', targetId: 'npc-001', attackId: 'sword' } } }); assert.equal(result.status(), 200);
  for (const page of [dm, player]) {
    await page.waitForFunction(() => JSON.parse(document.querySelector('#viewport canvas')?.dataset.lastEffect || '{}').weapon === 'sword');
    const descriptor = await page.locator('#viewport canvas').getAttribute('data-last-effect'); assert.equal(JSON.parse(descriptor).actorId, 'pc-001');
  }
  const playerToken = await player.evaluate(() => sessionStorage.getItem('battle-session'));
  assert.equal((await player.request.get(app.url + '/api/resource-catalog', { headers: { Authorization: 'Bearer ' + playerToken } })).status(), 403);
  await dm.screenshot({ path: join(directory, 'saved-attack.png') }); assert.deepEqual(errors, []);
  console.log('通过：保存后的攻击在DM和Player画面播放同一武器动画，Player不可读取DM资源选取接口；' + directory);
} finally { await browser?.close(); await app.close(); }

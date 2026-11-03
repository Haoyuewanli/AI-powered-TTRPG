import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture, command, dm } from './fixture.mjs';
const { chromium } = await import(pathToFileURL(join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../../../开发记录/临时/创造搭建检查/', import.meta.url));
await mkdir(output, { recursive: true }); const directory = await mkdtemp(join(output, 'app-'));
const app = await startApp({ campaignDir: directory, port: 0, initial: () => { const state = fixture(); state.board.extended = true; return state; } });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.url); await page.locator('#enter-dm').click(); await page.locator('canvas[data-ready=true]').waitFor();
  await page.getByLabel('添加参战者', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '添加角色、NPC或怪物', exact: true });
  await dialog.getByLabel('参战者类型', { exact: true }).selectOption('npc');
  await dialog.getByLabel('参战者名称', { exact: true }).fill('合成歌利亚法师');
  await dialog.getByLabel('基础种族外观', { exact: true }).selectOption('goliath');
  await dialog.getByLabel('基础职业外观', { exact: true }).selectOption('wizard');
  await dialog.getByLabel('手持武器外观', { exact: true }).selectOption('crossbow');
  await dialog.getByRole('button', { name: '加入本场战斗', exact: true }).click();
  await page.locator('canvas[data-actor-count="3"]').waitFor();
  const added = app.store.state.actors.find(actor => actor.name === '合成歌利亚法师');
  assert.equal(added.appearance.species, 'goliath'); assert.equal(added.appearance.classId, 'wizard'); assert.equal(added.appearance.weapon, 'crossbow');
  await page.locator('[data-tool=setup]:visible').first().click(); await page.locator('#open-editor').click();
  await page.locator('#edit-name').fill('尚未保存的合成名字'); await page.getByLabel('关闭角色资料', { exact: true }).click();
  await page.getByLabel('DM创造搭建视角').click();
  assert.notEqual(await page.locator('canvas').getAttribute('data-build-mode'), 'true');
  await page.locator('#open-editor').click(); await page.locator('#reload-editor').click(); await page.getByLabel('关闭角色资料', { exact: true }).click();
  // Start via the existing authoritative action boundary, then test actual UI building in combat.
  await app.workspace.dispatch(command(app.store.state, 'edit-actor', { actorId: added.id, patch: { confirmed: true } }), dm);
  await app.workspace.dispatch(command(app.store.state, 'start'), dm);
  await page.getByLabel('更多操作', { exact: true }).click(); await page.locator('#refresh').click(); await page.waitForFunction(() => document.querySelector('#phase-label').textContent === '战斗中');
  await page.getByLabel('DM创造搭建视角').click(); await page.locator('canvas[data-build-mode=true][data-build-preview]').waitFor();
  const revision = app.store.state.revision;
  await page.getByRole('button', { name: '放置', exact: true }).click(); await page.waitForFunction(() => document.querySelector('canvas').dataset.objectCount === '1');
  assert.equal(app.store.state.combat.phase, 'active'); assert.equal(app.store.state.revision, revision + 1);
  await page.getByRole('button', { name: '破坏', exact: true }).click(); await page.waitForFunction(() => document.querySelector('canvas').dataset.objectCount === '0');
  await page.locator('#undo').click(); await page.waitForFunction(() => document.querySelector('canvas').dataset.objectCount === '1');
  await page.screenshot({ path: join(directory, 'integrated-creative.png') });
  await page.getByLabel('DM创造搭建视角').click(); if (!await page.locator('#logout').isVisible()) await page.getByLabel('更多操作', { exact: true }).click(); await page.locator('#logout').click();
  await page.locator('#identity').fill('player-1'); await page.locator('#login-form button').click(); await page.locator('canvas[data-ready=true]').waitFor();
  assert.equal(await page.getByLabel('DM创造搭建视角').isVisible(), false);
  assert.equal(await page.getByLabel('添加参战者', { exact: true }).isVisible(), false);
  assert.deepEqual(errors, []); console.log('PASS: actual + actor dialog/model/weapon; dirty editor guard; active-combat creative place/destroy/undo; Player tools absent'); console.log('证据：' + directory);
} catch (error) { console.error('证据：' + directory, errors); throw error; }
finally { await browser.close(); await app.close(); }

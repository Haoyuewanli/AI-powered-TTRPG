import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture } from './fixture.mjs';
const { chromium } = await import(pathToFileURL(join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../../../开发记录/临时/参战者检查/', import.meta.url)); await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'actors-'));
await mkdir(join(directory, '战斗'), { recursive: true });
const value = { resource: { id: 'sample', name: '资源中的合成怪物', kind: '怪物', path: '资源/怪物/合成.md', data: { statBlock: { armorClass: 15, hitPoints: 37, sizeText: '大型', speedsFeet: { walk: 25 } } } }, text: '# 合成怪物\n来源正文仅供DM核对。' };
const app = await startApp({ campaignDir: join(directory, '战斗'), workspaceDir: join(directory, '工作区'), port: 0, initial: fixture,
  resourceProvider: { catalog: async () => ({ resources: [value.resource] }), read: async () => value } });
let browser, page; const errors = [];
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(app.url); await page.locator('#enter-dm').click(); await page.locator('#viewport canvas').waitFor();
  await page.getByRole('button', { name: '添加参战者', exact: true }).click();
  const dialog = page.locator('#add-combatant-dialog'); await dialog.getByRole('button', { name: '使用选中资源', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#combatant-hp')?.value === '37');
  assert.equal(await dialog.getByLabel('生命上限', { exact: true }).inputValue(), '37');
  await dialog.getByLabel('手持武器外观', { exact: true }).selectOption('crossbow');
  await dialog.getByLabel('模型宽（尺）', { exact: true }).fill('7'); await dialog.getByLabel('模型高（尺）', { exact: true }).fill('14');
  await dialog.getByRole('button', { name: '加入本场战斗', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  const added = app.store.state.actors.at(-1); assert.equal(added.name, value.resource.name); assert.equal(added.maxHp, 37); assert.equal(added.body.width, 7); assert.equal(added.body.height, 14); assert.equal(added.appearance.weapon, 'crossbow'); assert.equal(added.appearance.preset, 'monster'); assert.equal(added.confirmed, false);
  await page.getByRole('button', { name: '添加参战者', exact: true }).click();
  await dialog.getByLabel('参战者名称', { exact: true }).fill('龙裔法师'); await dialog.getByLabel('基础种族外观', { exact: true }).selectOption('dragonborn'); await dialog.getByLabel('基础职业外观', { exact: true }).selectOption('wizard');
  await dialog.getByLabel('手持武器外观', { exact: true }).selectOption('staff');
  await dialog.getByRole('button', { name: '加入本场战斗', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  assert.equal(app.store.state.actors.at(-1).appearance.species, 'dragonborn'); assert.equal(app.store.state.actors.at(-1).appearance.classId, 'wizard');
  await page.screenshot({ path: join(directory, 'roster-models.png') });
  const persisted = JSON.parse(await readFile(app.store.path, 'utf8')); assert.equal(persisted.actors.length, 4);
  assert.deepEqual(errors, []); console.log('通过：统一＋选择资源、可调怪物尺寸、基础种族职业与持握武器加入及本地保存；' + directory);
} catch (error) { await page?.screenshot({ path: join(directory, 'failure.png') }); console.error(directory, errors); throw error; }
finally { await browser?.close(); await app.close(); }

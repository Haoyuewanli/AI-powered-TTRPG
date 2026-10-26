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
async function changed(run) { const old = app.store.state.revision; await run(); await page.waitForFunction(v => document.querySelector('#save-status').textContent.includes(`v${v + 1}`), old); }
async function switched(run, prior = app.store.state.battleId) { await run(); await page.waitForFunction(id => document.querySelector('#battle-select').value !== id, prior); await page.waitForTimeout(80); }
async function select(selection) { await page.locator('#campaign-select').selectOption(selection.campaignId); await page.locator('#battle-select').selectOption(selection.battleId); await page.locator('#open-battle').click(); await page.waitForFunction(id => document.querySelector('#battle-select').value === id && document.querySelector('#title').textContent.length > 0, selection.battleId); await page.waitForTimeout(120); }
try {
  await page.goto(app.url); await page.locator('#enter-dm').click(); await page.locator('canvas[data-ready=true]').waitFor();
  await page.locator('#campaign-select option').first().waitFor({ state: 'attached' });
  const first = app.workspace.selection; checks.push('免口令DM入口与步骤引导');
  await changed(() => page.locator('#clone-actor').click());
  const copied = app.store.state.actors.at(-1); assert.equal(copied.confirmed, false);
  await page.locator('#place-x').fill('42.5'); await page.locator('#place-z').fill('42.5'); await changed(() => page.locator('#place-actor').click());
  assert.equal(app.store.state.actors.at(-1).position.x, 42.5);
  await changed(() => page.locator('#remove-actor').click()); assert.equal(app.store.state.actors.length, 2); checks.push('显式复制、摆放、移出棋子');
  await page.locator('#workspace-panel details > summary').click();
  await page.locator('#new-battle-name').fill('第二场'); await switched(() => page.locator('#new-battle-form button').click());
  const second = app.workspace.selection; assert.notEqual(first.battleId, second.battleId);
  await page.locator('#open-editor').click(); await page.locator('#edit-hp').fill('23'); await changed(() => page.locator('#edit-form button[type=submit]').click());
  await select(first); assert.equal(app.store.state.actors[0].hp, 40);
  await select(second); assert.equal(app.store.state.actors[0].hp, 23); checks.push('同团两场战斗互不覆盖');
  await page.locator('#new-campaign-name').fill('第二个团'); await switched(() => page.locator('#new-campaign-form button').click());
  assert.notEqual(app.workspace.selection.campaignId, first.campaignId);
  await select(first); checks.push('新建独立团并切回');
  await changed(() => page.locator('#dice-mode').selectOption('physical'));
  for (const [id, value] of [['pc-001','20'], ['npc-001','1']]) await page.locator(`#initiative-entries [data-actor-id="${id}"] input`).fill(value);
  await changed(() => page.locator('#start').click()); assert.equal(app.store.state.combat.order[0], 'pc-001');
  await page.locator('#roster [data-actor-id="pc-001"]').click();
  await page.locator('#physical-d20 input').waitFor(); await page.locator('#physical-d20 input').fill('20');
  assert.equal(await page.locator('#physical-damage input').count(), 2);
  await page.locator('#physical-damage input').nth(0).fill('4'); await page.locator('#physical-damage input').nth(1).fill('5');
  await changed(() => page.locator('#attack-form button[type=submit]').click()); assert.equal(app.store.state.actors[1].hp, 28);
  await changed(() => page.locator('#undo').click()); assert.equal(app.store.state.actors[1].hp, 40); assert(app.store.state.events.at(-2).undoneBy); checks.push('线下先攻、重击双倍伤害骰与有记录的撤销');
  await page.locator('#exchange-panel > summary').click(); await page.locator('#export-handoff').click();
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

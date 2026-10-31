import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startPlatform } from '../server.mjs';
import { outputDirectory } from './check-helpers.mjs';
import { createVoyageTrainingFixture } from './voyage-training-fixture.mjs';

await mkdir(outputDirectory, { recursive: true });
const directory = await mkdtemp(join(outputDirectory, 'voyage-training-'));
const fixture = await createVoyageTrainingFixture({ sourceRoot: process.env.RPG_MODULE_TEST_ROOT, directory });
const { projectRoot, template, merrow } = fixture;
const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE
  || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
let app = await startPlatform({ projectRoot, port: 0, appearanceFile: join(directory, '外观.json') });
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] }).catch(async error => { await app.close(); throw error; });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
const errors = [], outside = [], requests = [], checks = [], screenshots = [];
let injectedTransientConflicts = 0, automaticSavePosts = 0;
const allowedOrigins = new Set([app.url]);
let platformToken, battleOrigin, battleToken, created, frame;
context.on('page', target => {
  target.on('pageerror', error => errors.push(error.message));
  target.on('request', request => {
    if (request.headers()['x-platform-session']) platformToken = request.headers()['x-platform-session'];
    requests.push({ url: request.url(), method: request.method() });
  });
});
await context.route('**/*', route => {
  const request = route.request(), address = request.url();
  if (/^(data:|about:)/.test(address)) return route.continue();
  const url = new URL(address);
  if (allowedOrigins.has(url.origin)) return route.continue();
  if (request.isNavigationRequest() && request.frame().parentFrame() && url.protocol === 'http:' && url.hostname === '127.0.0.1') {
    battleOrigin = url.origin; allowedOrigins.add(battleOrigin); return route.continue();
  }
  outside.push(address); return route.abort();
});
const page = await context.newPage(), notice = page.locator('.p-appearance-status > .project-notice');
const nav = name => page.locator('[data-platform-page="' + name + '"]').click();
const pause = ms => new Promise(accept => setTimeout(accept, ms));
const check = name => { checks.push(name); console.log('PASS: ' + name); };
const shot = async name => { const path = join(directory, name); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };
async function until(read, accept, label, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const value = await read(); if (accept(value)) return value; await pause(100);
  }
  throw new Error('Timed out: ' + label);
}
async function localApi(path) {
  const response = await page.request.get(app.url + path, { headers: { 'X-Platform-Session': platformToken } });
  assert.equal(response.status(), 200, path); return response.json();
}
async function chooseDm() {
  await page.locator('#enter-dm').click();
  await until(() => notice.textContent(), value => value.includes('本机DM可'), 'platform DM view');
}
const statePath = () => join(projectRoot, '模组', created.folder, '战斗/存档/战斗状态.json');
const state = async () => JSON.parse(await readFile(statePath(), 'utf8'));
async function mountFrame({ enter = true } = {}) {
  const host = page.locator('[data-project-battle-frame]'); await host.waitFor({ state: 'attached', timeout: 30000 });
  battleOrigin = new URL(await host.getAttribute('src')).origin; allowedOrigins.add(battleOrigin);
  frame = await (await host.elementHandle()).contentFrame();
  await until(() => frame.locator('body').getAttribute('data-platform-embedded'), value => value === 'true', 'embedded bridge');
  if (enter) {
    await page.locator('[data-training-enter-battle]').click();
    await frame.locator('#enter-dm').click(); await frame.locator('canvas[data-ready=true]').waitFor({ timeout: 30000 });
    battleToken = await frame.evaluate(() => sessionStorage.getItem('battle-session'));
  }
}
async function action(run, expectedStatus = 200) {
  const response = page.waitForResponse(value => value.url() === battleOrigin + '/api/action' && value.request().method() === 'POST');
  await run(); const value = await response; assert.equal(value.status(), expectedStatus, await value.text());
  return value;
}
async function changed(run) {
  const before = await state(); await action(run);
  await frame.waitForFunction(revision => document.querySelector('#save-status').textContent.includes('v' + revision), before.revision + 1);
  const after = await state(); assert.equal(after.revision, before.revision + 1); return after;
}
async function move(x, z) {
  const details = frame.locator('.movement-section .compact-details');
  if (!await details.evaluate(node => node.open)) await details.locator(':scope > summary').click();
  await frame.locator('#move-x').fill(String(x)); await frame.locator('#move-z').fill(String(z));
}
async function attackPlayer(pc, npc) {
  if (await frame.locator('#attack-choice').inputValue() !== pc.attacks[0].id) await frame.locator('#attack-choice').selectOption(pc.attacks[0].id);
  if (await frame.locator('#target-choice').inputValue() !== npc.id) await frame.locator('#target-choice').selectOption(npc.id);
  await frame.waitForFunction(() => document.querySelector('#physical-plan-note').textContent.startsWith('实际检定') && document.querySelectorAll('#physical-d20 input').length === 1);
  await frame.locator('#physical-d20 input').fill('15');
  await frame.locator('#physical-damage input').first().fill('6');
  return changed(() => frame.locator('#attack-form button[type=submit]').click());
}
async function openModules() {
  await nav('modules'); const details = page.locator('[data-project-panel=modules]');
  if (!await details.evaluate(node => node.open)) await details.locator(':scope > summary').click();
}
async function saveTrainingRecord(label) {
  const saved = page.waitForResponse(value => new URL(value.url()).pathname === '/api/project/module-state' && value.request().method() === 'POST' && value.status() === 200);
  await page.locator('[data-training-save]').click(); await saved;
  await until(() => page.locator('[data-training-status]').textContent(), value => value.includes('本段记录已保存'), label);
}

try {
  await page.goto(app.url); await chooseDm(); await page.locator('[data-project-training-entry]').click();
  const create = page.locator('[data-project-create-training="' + template.moduleId + '"]'); await create.waitFor();
  const row = create.locator('..');
  assert((await row.textContent()).includes(template.batchId));
  assert((await row.textContent()).includes('候选'));
  await row.getByLabel('新团名称').fill('风骸岛序幕 · 隔离训练验收');
  const creation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/project/create-run' && response.request().method() === 'POST');
  await create.evaluate(node => { node.click(); node.click(); });
  const response = await creation; assert.equal(response.status(), 200, await response.text());
  const request = response.request().postDataJSON();
  assert.equal(request.training, true); assert.equal(request.expectedPackageSha256, fixture.packageSha256);
  created = await response.json(); assert.equal(created.training.kind, 'voyage-training-v1');
  assert.notEqual(created.campaignId, fixture.oldSelection.campaignId);
  await page.locator('[data-voyage-training]').waitFor(); await mountFrame({ enter: false });
  assert.equal(requests.filter(entry => new URL(entry.url).pathname === '/api/project/create-run' && entry.method === 'POST').length, 1);
  const registry = JSON.parse(await readFile(join(projectRoot, '模组/工作区.json'), 'utf8'));
  assert.equal(registry.campaigns.length, 2, 'Repeated create clicks must not create a second training campaign');
  const initial = await state(), initialBytes = await readFile(statePath());
  const pc = initial.actors.find(actor => actor.kind === 'pc'), npc = initial.actors.find(actor => actor.kind === 'npc');
  assert.equal(initial.revision, 0); assert.equal(initial.combat.phase, 'preparing');
  assert.equal(initial.actors.length, 2); assert(initial.actors.every(actor => !actor.confirmed));
  assert.match(pc.name, /合成/); assert.equal(npc.reference.resourceId, merrow.id);
  const content = await localApi('/api/project/module-content');
  assert.equal(content.training.kind, 'voyage-training-v1'); assert.equal(content.templateIdentity.packageSha256, fixture.packageSha256);
  assert.equal(content.reviewStatus, 'candidate');
  assert(content.training.sceneNodes.length > 0);
  await page.locator('[data-training-scene-node="' + content.training.sceneNodes[0].id + '"]').click();
  assert((await page.locator('[data-voyage-training]').textContent()).includes(content.training.sceneNodes[0].description));
  assert.deepEqual(await readFile(statePath()), initialBytes);
  assert.equal(requests.filter(entry => new URL(entry.url).pathname === '/api/project/map-image').length, 0);
  await shot('01-真实候选序幕与训练入口.png');
  check('首页入口读取实际候选包及批次摘要，连续两次创建点击只建一个独立合成训练团；阅读来源序幕不自动开图、确认角色或开战');

  let note = '隔离序幕记录：先交涉再决定战斗。<script>window.voyageInjected=true</script>';
  await page.locator('[data-training-notes]').fill(note);
  const outcome = page.locator('[data-training-outcome]');
  let selectedOutcome = 'in-progress'; await outcome.selectOption(selectedOutcome);
  await nav('home'); await pause(150);
  assert.equal(await page.locator('#platform-root').getAttribute('data-page'), 'battle');
  assert.equal(await page.locator('[data-training-notes]').inputValue(), note);
  assert.match(await notice.textContent(), /草稿|未保存/);
  await saveTrainingRecord('training note committed');
  const story = await localApi('/api/project/module-state?kind=' + encodeURIComponent('故事进度'));
  assert.equal(story.state.training.notes, note); assert.equal(story.state.training.outcome, selectedOutcome);
  assert.deepEqual(await readFile(statePath()), initialBytes); assert.equal(await page.evaluate(() => window.voyageInjected), undefined);
  await page.locator('[data-training-refresh]').click();
  await until(() => page.locator('[data-training-notes]').inputValue(), value => value === note, 'training note reloaded');
  check('序幕草稿阻止离开，保存及重读恢复同团故事记录；记录不结算战斗且文字不执行脚本');

  const saveUrl = app.url + '/api/project/module-state';
  const transient = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    automaticSavePosts++;
    if (!injectedTransientConflicts) {
      injectedTransientConflicts++;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '文件管理正被另一个进程使用；原锁和原文件已保留' }) });
    }
    return route.continue();
  };
  await context.route(saveUrl, transient);
  note += '\n短暂文件锁冲突后安全保存。'; await page.locator('[data-training-notes]').fill(note);
  await saveTrainingRecord('automatic save retry committed'); await context.unroute(saveUrl, transient);
  assert.equal(injectedTransientConflicts, 1); assert(automaticSavePosts >= 2, 'One UI save must automatically retry the transient failure');
  assert.equal((await localApi('/api/project/module-state?kind=' + encodeURIComponent('故事进度'))).state.training.notes, note);
  check('只点击一次保存，首次文件锁409由组件重读并安全重试；实际记录成功后才显示已保存');

  const conflictingDraft = note + '\n这一段只留在未保存草稿。';
  await page.locator('[data-training-notes]').fill(conflictingDraft);
  let fakeReads = 0;
  const storyUrl = app.url + '/api/project/module-state?kind=' + encodeURIComponent('故事进度');
  const competingStory = async route => {
    if (route.request().method() !== 'GET' || fakeReads) return route.continue();
    fakeReads++;
    const response = await route.fetch(), body = await response.json();
    body.state = { ...body.state, training: { ...body.state.training, notes: '另一窗口写入的隔离模拟记录' } };
    return route.fulfill({ response, json: body });
  };
  const postCount = () => requests.filter(entry => new URL(entry.url).pathname === '/api/project/module-state' && entry.method === 'POST').length;
  const beforeConflictPosts = postCount(), beforeConflictState = await localApi('/api/project/module-state?kind=' + encodeURIComponent('故事进度'));
  await context.route(storyUrl, competingStory); await page.locator('[data-training-save]').click();
  await until(() => page.locator('[data-training-status]').textContent(), value => value.includes('别处更新') && value.includes('草稿'), 'real story conflict refused');
  await context.unroute(storyUrl, competingStory);
  assert.equal(fakeReads, 1); assert.equal(postCount(), beforeConflictPosts);
  assert.equal(await page.locator('[data-training-notes]').inputValue(), conflictingDraft);
  assert.deepEqual((await localApi('/api/project/module-state?kind=' + encodeURIComponent('故事进度'))).state, beforeConflictState.state);
  await page.locator('[data-training-discard]').click();
  await until(() => page.locator('[data-training-notes]').inputValue(), value => value === note, 'explicit discard restored saved story');
  assert.doesNotMatch(await notice.textContent(), /已在别处更新/);
  check('模拟别处已改故事正文时明确拒绝写入并保留草稿；显式放弃后才重读，未覆盖已有记录');

  await page.locator('[data-training-enter-battle]').click();
  await until(() => page.locator('[data-voyage-training]').evaluate(node => node.open), value => value === false, 'training guidance collapsed after safe entry');
  await frame.locator('#enter-dm').click(); await frame.locator('canvas[data-ready=true]').waitFor({ timeout: 30000 });
  battleToken = await frame.evaluate(() => sessionStorage.getItem('battle-session'));
  for (const actor of initial.actors) {
    await frame.locator('#roster [data-actor-id="' + actor.id + '"]').click();
    await frame.locator('[data-tool=actor]:visible').first().click(); await frame.locator('#edit-confirmed').check();
    await changed(() => frame.locator('#edit-form button[type=submit]').click()); await frame.locator('#actor-dialog [data-close-tool]').click();
  }
  await changed(() => frame.locator('#dice-mode').selectOption('physical')); await changed(() => frame.locator('#start').click());
  for (const [actor, value] of [[pc, '18'], [npc, '8']]) {
    await frame.locator('[data-initiative-actor="' + actor.id + '"] input').fill(value);
    await changed(() => frame.locator('[data-submit-initiative="' + actor.id + '"]').click());
  }
  await changed(() => frame.locator('#start').click());
  assert.equal((await state()).combat.order[0], pc.id);
  await frame.locator('#roster [data-actor-id="' + pc.id + '"]').click();
  await move(pc.position.x + 5, pc.position.z); const walked = await changed(() => frame.locator('#move-form button').click());
  assert.equal(walked.combat.moved, 5); assert.equal(walked.actors.find(actor => actor.id === pc.id).position.x, pc.position.x + 5);
  const beforeRejected = await readFile(statePath());
  await move(pc.position.x + 5 + pc.speed + 5, pc.position.z);
  const rejected = page.waitForResponse(value => value.url() === battleOrigin + '/api/action' && value.request().method() === 'POST');
  await frame.locator('#move-form button').click(); const rejection = await rejected;
  assert(!rejection.ok()); assert.match(await rejection.text(), /移动|速度/);
  assert.deepEqual(await readFile(statePath()), beforeRejected);
  await shot('02-正常训练战斗.png');
  check('核对两名角色、录入先攻后由本地核心开战；正常移动5尺落盘，超过剩余移动力被拒且文件和版本不变');

  let current = await attackPlayer(pc, npc);
  assert.equal(current.actors.find(actor => actor.id === npc.id).hp, npc.hp - 11);
  for (let index = 1; index < pc.attackLimit; index++) current = await attackPlayer(pc, npc);
  assert.equal(current.actors.find(actor => actor.id === npc.id).hp, 1);
  await changed(() => frame.locator('#next').click());
  const beforeNpc = await state(); await pause(250); assert.deepEqual(await state(), beforeNpc);
  await frame.locator('[data-tool=exchange]').first().click(); await frame.locator('#export-handoff').click();
  await frame.waitForFunction(() => document.querySelector('#exchange-text').value.includes('local-dm-exchange-v2'));
  const pack = JSON.parse(await frame.locator('#exchange-text').inputValue());
  const melee = npc.attacks.find(attack => attack.kind === 'melee');
  assert(melee && /^\d+d\d+(?:[+-]\d+)?$/i.test(melee.damage[0].formula));
  const diceCount = Number(melee.damage[0].formula.match(/^(\d+)d/i)[1]);
  pack.proposal.type = 'attack'; pack.proposal.payload = { actorId: npc.id, targetId: pc.id, attackId: melee.id, mode: 'normal', manualRolls: { attack: [15], damage: [Array(diceCount).fill(1)] } };
  await frame.locator('#exchange-text').fill(JSON.stringify({ proposal: pack.proposal }));
  const proposalBytes = await readFile(statePath()); await frame.locator('#preview-proposal').click();
  assert.deepEqual(await readFile(statePath()), proposalBytes);
  current = await changed(() => frame.locator('#import-proposal').click());
  assert(current.actors.find(actor => actor.id === pc.id).hp < pc.hp);
  await frame.locator('#exchange-dialog [data-close-tool]').click();
  await changed(() => frame.locator('#next').click());
  await frame.locator('#roster [data-actor-id="' + pc.id + '"]').click();
  current = await attackPlayer(pc, npc); assert.equal(current.actors.find(actor => actor.id === npc.id).hp, 0);
  const menu = frame.locator('.session-menu'); if (!await menu.evaluate(node => node.open)) await menu.locator(':scope > summary').click();
  current = await changed(() => frame.locator('#end').click()); assert.equal(current.combat.phase, 'ended');
  assert.equal(await frame.locator('#battle-tasks').isVisible(), false);
  await page.locator('[data-voyage-training] > summary').click();
  note += '\n主持已结束本场训练。'; selectedOutcome = 'combat-ended';
  await page.locator('[data-training-notes]').fill(note); await page.locator('[data-training-outcome]').selectOption(selectedOutcome);
  await saveTrainingRecord('completed story note committed');
  await shot('03-主持操作与结束战斗.png');
  check('普通攻击按费用与骰点扣生命；NPC等待主持，JSON提议预览不写盘、确认后统一结算，最后由主持结束训练');

  const completed = await readFile(statePath());
  await page.goto('about:blank'); await app.close();
  app = await startPlatform({ projectRoot, port: 0, appearanceFile: join(directory, '外观.json') }); allowedOrigins.add(app.url);
  await page.goto(app.url); await chooseDm(); await openModules();
  const select = page.locator('[data-project-select-module="' + created.moduleId + '"]'); await select.waitFor(); await select.click();
  await nav('battle'); await page.locator('[data-voyage-training]').waitFor(); await mountFrame({ enter: false });
  await until(() => page.locator('[data-training-notes]').inputValue(), value => value === note, 'story note restored after server restart');
  assert.equal(await page.locator('[data-training-outcome]').inputValue(), selectedOutcome);
  await page.locator('[data-training-enter-battle]').click(); await frame.locator('#enter-dm').click(); await frame.locator('canvas[data-ready=true]').waitFor({ timeout: 30000 });
  assert.deepEqual(await readFile(statePath()), completed); assert.equal(await frame.locator('#table').getAttribute('data-phase'), 'ended');
  const resumed = await state(); assert.equal(resumed.campaignId, created.campaignId); assert.equal(resumed.battleId, created.battleId);
  assert.equal(resumed.actors.find(actor => actor.id === npc.id).hp, 0); assert.equal(resumed.revision, current.revision);
  const runs = await localApi('/api/project/modules'); assert.equal(runs.modules.filter(item => item.id === created.moduleId).length, 1);
  assert.equal(requests.filter(entry => new URL(entry.url).pathname === '/api/project/map-image').length, 0);
  await shot('04-同团重开恢复.png');
  check('真正停止平台与战斗服务后重开、显式选择同一团，故事记录、生命、位置、回合和结束状态从文件恢复，不另建团或自动开图');

  await page.goto('about:blank'); await app.close();
  await fixture.verifyUntouched(); assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  check('原始candidate资料包和MD/2024怪物摘要不变，隔离已有合成团文件不变，浏览器无脚本错误或外网请求');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, screenshots, sourceFilesVerified: fixture.sourceFileCount,
    existingSyntheticFilesVerified: fixture.oldFileCount, templateId: template.moduleId, batchId: template.batchId,
    packageSha256: fixture.packageSha256, projectRoot, moduleId: created.moduleId, campaignId: created.campaignId, battleId: created.battleId,
    injectedTransientConflicts, automaticSavePosts, errors, outside, requests }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, directory, errors, outside }, null, 2));
} catch (error) {
  await shot('失败现场.png').catch(() => {});
  await writeFile(join(directory, 'failure.json'), JSON.stringify({ message: error.message, checks, errors, outside, created, requests }, null, 2));
  throw error;
} finally { await browser.close(); await app.close(); }

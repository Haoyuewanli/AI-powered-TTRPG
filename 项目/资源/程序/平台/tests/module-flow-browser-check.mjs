import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, readdir, lstat, copyFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { startPlatform } from '../server.mjs';
import { threeRoot } from '../../战斗/project-paths.mjs';

const sourceRoot = process.env.RPG_MODULE_TEST_ROOT && resolve(process.env.RPG_MODULE_TEST_ROOT);
assert(sourceRoot, 'Set RPG_MODULE_TEST_ROOT to the project containing the reviewed module. Source files are read-only.');
assert((await lstat(sourceRoot)).isDirectory() && !(await lstat(sourceRoot)).isSymbolicLink(), 'The read-only source project must be a normal directory');
await access(join(threeRoot, 'build/three.module.js'));
let repository = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(repository, 'AGENTS.md'))) {
  const parent = dirname(repository); assert.notEqual(parent, repository, 'Run this check inside the workspace'); repository = parent;
}
const output = join(repository, '开发记录/临时/迭代-20261029/全流程检查'); await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'module-flow-')), projectRoot = join(directory, '项目');
await mkdir(projectRoot);
const templateFolder = '模组/预处理/故事/stormwreck-isle-v1436';
const template = JSON.parse(await readFile(join(sourceRoot, templateFolder, '预处理.json'), 'utf8'));
assert.equal(template.reviewStatus, 'verified'); assert.equal(template.storyNodes.length, 79); assert.equal(template.maps.length, 10);
const merrowId = 'bq-monster-9026766b7332e90a6c002580c8832735';
const merrowPath = '资源/怪物/M/梅洛 Merrow--2580c8832735.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const sourceHashes = new Map(), copied = new Set();
function within(root, path) {
  const target = resolve(root, path), inside = relative(root, target);
  assert(!inside.startsWith('..') && !isAbsolute(inside), 'Fixture copy escaped the approved source or output root');
  return target;
}
async function copySource(path) {
  if (copied.has(path)) return;
  const source = within(sourceRoot, path), target = within(projectRoot, path), info = await lstat(source);
  assert(info.isFile() && !info.isSymbolicLink() && info.nlink <= 1, 'Fixture input must be a normal file');
  const bytes = await readFile(source); sourceHashes.set(path, digest(bytes));
  await mkdir(dirname(target), { recursive: true }); await copyFile(source, target);
  assert.equal(digest(await readFile(target)), sourceHashes.get(path)); copied.add(path);
}
async function copyTemplateTree(path) {
  const source = within(sourceRoot, path), info = await lstat(source);
  assert(info.isDirectory() && !info.isSymbolicLink(), 'Fixture template tree cannot contain directory links');
  for (const entry of await readdir(source, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Fixture template tree cannot contain links');
    if (entry.isDirectory()) await copyTemplateTree(path + '/' + entry.name);
    else if (entry.isFile()) await copySource(path + '/' + entry.name);
  }
}
await copyTemplateTree(templateFolder);
for (const map of template.maps) {
  assert.equal(map.width, 1700); assert.equal(map.height, 1214);
  assert(map.locations.every(location => location.bounds === null));
  await copySource(map.resourcePath);
  const descriptor = JSON.parse(await readFile(within(sourceRoot, map.resourcePath), 'utf8'));
  assert.equal(descriptor.id, map.id); await copySource(descriptor.assetPath);
  if (descriptor.originalAssetPath) await copySource(descriptor.originalAssetPath);
}
for (const item of template.resourceCandidates) await copySource(item.path);
await copySource(merrowPath);
for (const path of ['模组/预处理/战斗/stormwreck-isle-v1436/stormwreck-voyage-merrow.json',
  '模组/预处理/对话/stormwreck-isle-v1436/stormwreck-voyage-template.json']) await copySource(path);
assert(!existsSync(join(projectRoot, '模组/工作区.json')), 'Never copy an actual campaign registry into the test project');
assert(!existsSync(join(projectRoot, '资源/故事/G/管理索引.json')), 'Never copy actual management state into the test project');

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE
  || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const app = await startPlatform({ projectRoot, port: 0, appearanceFile: join(directory, '外观.json') });
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] }).catch(async error => { await app.close(); throw error; });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
const errors = [], outside = [], requests = [], checks = [], screenshots = [], measurements = [];
let platformToken, battleOrigin, battleToken, created, activeFrame;
context.on('page', target => {
  target.on('pageerror', error => errors.push(error.message));
  target.on('request', request => {
    if (request.headers()['x-platform-session']) platformToken = request.headers()['x-platform-session'];
    requests.push({ url: request.url(), method: request.method() });
  });
});
await context.route('**/*', route => {
  const request = route.request(), url = request.url();
  if (/^(data:|about:)/.test(url) || new URL(url).origin === app.url || battleOrigin && new URL(url).origin === battleOrigin) return route.continue();
  if (request.isNavigationRequest() && request.frame().parentFrame() && new URL(url).protocol === 'http:' && new URL(url).hostname === '127.0.0.1') {
    battleOrigin = new URL(url).origin; return route.continue();
  }
  outside.push(url); return route.abort();
});
const page = await context.newPage(), notice = page.locator('.p-appearance-status > .project-notice');
const nav = name => page.locator('[data-platform-page="' + name + '"]').click();
const panel = name => page.locator('[data-project-panel="' + name + '"]');
const resource = id => page.locator('[data-project-resource="' + id + '"]');
const pause = ms => new Promise(accept => setTimeout(accept, ms));
const check = name => { checks.push(name); console.log('PASS: ' + name); };
const shot = async name => { const path = join(directory, name); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };
async function until(read, accept, label, attempts = 150) {
  for (let attempt = 0; attempt < attempts; attempt++) { const value = await read(); if (accept(value)) return value; await pause(100); }
  throw new Error('Timed out: ' + label);
}
async function localApi(path) {
  const response = await page.request.get(app.url + path, { headers: { 'X-Platform-Session': platformToken } });
  assert.equal(response.status(), 200, 'Protected fixture read: ' + path); return response.json();
}
async function chooseDm() {
  await page.locator('#enter-dm').click(); await until(() => notice.textContent(), text => text.includes('本机DM可'), 'DM view');
}
async function openPanel(name) {
  await nav(name); await panel(name).waitFor();
  if (!await panel(name).evaluate(node => node.open)) await panel(name).locator(':scope > summary').click();
}
async function openMapDirectoryEntry(mapId) {
  const choice = page.locator('[data-real-map-choice="' + mapId + '"]'); await choice.waitFor({ state: 'attached' });
  for (const details of await page.locator('[data-real-map-directory] details').filter({ has: choice }).all()) {
    if (!await details.evaluate(node => node.open)) await details.locator(':scope > summary').click();
  }
  return choice;
}
async function selectMap(mapId, locationId) {
  const choice = await openMapDirectoryEntry(mapId);
  if (locationId) await page.locator('[data-real-location-map="' + mapId + '"][data-real-location-choice="' + locationId + '"]').click();
  else await choice.click();
  await until(() => page.locator('[data-real-map-image]').evaluate(node => node.complete && node.naturalWidth === 1700 && node.naturalHeight === 1214), Boolean, 'decoded original map ' + mapId);
  await until(() => choice.getAttribute('aria-pressed'), value => value === 'true', 'selected map ' + mapId);
}
async function loadMaps() {
  await openPanel('maps'); await page.locator('[data-project-load-maps]').click();
  await page.locator('[data-real-map-workspace]').waitFor();
  await until(() => page.locator('[data-real-map-choice]').count(), value => value === 10, 'ten module maps');
  if (await panel('maps').count() && await panel('maps').evaluate(node => node.open)) await panel('maps').locator(':scope > summary').click();
}
async function selectCreatedRun() {
  await openPanel('modules'); const choose = page.locator('[data-project-select-module="' + created.moduleId + '"]'); await choose.waitFor(); await choose.click();
  await until(() => page.locator('[data-platform-view=maps] [data-module-context]').textContent(), text => text === '当前模组：' + created.moduleName, 'reselect isolated module');
  await until(() => localApi('/api/battle/status'), value => value.projection?.state === 'saved', 'battle projection ready');
}

try {
  await page.goto(app.url); await chooseDm(); await openPanel('modules');
  const create = page.locator('[data-project-create-run="stormwreck-isle-v1436"]'); await create.waitFor();
  const preparedRow = create.locator('..'); assert((await preparedRow.textContent()).includes('10张地图')); assert((await preparedRow.textContent()).includes('79个故事节点'));
  await preparedRow.getByLabel('新团名称').fill('风骸岛之龙 · 隔离全流程测试');
  const creation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/project/create-run' && response.request().method() === 'POST');
  await create.click(); const creationResponse = await creation; assert.equal(creationResponse.status(), 200); created = await creationResponse.json();
  await page.locator('[data-project-battle-frame]').waitFor({ state: 'attached', timeout: 30000 });
  await until(() => notice.textContent(), value => value.includes('新团已建立'), 'module run selected');
  await until(() => localApi('/api/battle/status'), value => value.projection?.state === 'saved', 'initial projection ready');
  const statePath = join(projectRoot, '模组', created.folder, '战斗/存档/战斗状态.json');
  const initial = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(initial.revision, 0); assert.equal(initial.combat.phase, 'preparing'); assert.equal(initial.actors.length, 2);
  assert(initial.actors.every(actor => !actor.confirmed)); assert.equal(initial.actors.filter(actor => actor.kind === 'npc').length, 1);
  assert.equal(initial.actors.find(actor => actor.kind === 'npc').reference.resourceId, merrowId);
  for (const area of ['故事', '对话', '战斗']) assert((await lstat(join(projectRoot, '模组', created.folder, area))).isDirectory());
  await shot('01-预处理新建并选择团.png');
  check('从首页DM进入79节点10原图的已核对模板，新建独立团并载入单只梅洛准备场，不自动开战或确认角色');

  await openPanel('resources'); await page.getByLabel('搜索本地资源').fill('Merrow'); await page.getByLabel('搜索本地资源').press('Enter');
  await resource(merrowId).waitFor(); await resource(merrowId).click({ button: 'right' }); await resource(merrowId).locator('[data-project-reference]').click();
  await until(() => notice.textContent(), value => value.includes('已引用到当前模组'), 'reference actual rules resource');
  await resource(merrowId).getByRole('button', { name: '怪物 · 梅洛 Merrow', exact: true }).click(); await page.locator('.project-preview').waitFor();
  assert((await page.locator('.project-preview').textContent()).includes('AC 13')); assert((await page.locator('.project-preview').textContent()).includes('HP 45'));
  check('真实资源按名称找到独立2024梅洛，右键引用和资料标签展示来源数值，未引用旧版模组统计');

  await loadMaps(); assert.equal(await page.locator('[data-real-story-choice]').count(), 79);
  assert((await page.locator('[data-platform-view="maps"] .p-demo-note').textContent()).includes('当前团模组原图'));
  await selectMap('stormwreck-island-dm', 'rest');
  assert((await page.locator('[data-real-map-location]').textContent()).includes('不代表已判定通道或门墙'));
  await page.getByRole('button', { name: '相关地点 · 巨龙之憩（主持人）', exact: true }).click();
  await until(() => page.locator('[data-real-map-caption]').textContent(), value => value.includes('巨龙之憩'), 'related map link');
  await until(() => page.locator('[data-real-map-image]').evaluate(node => node.complete && node.naturalWidth === 1700), Boolean, 'related map decoded');
  assert.equal(await page.locator('[data-real-map-notes]').count(), 1);
  const mapNote = '隔离全流程地点笔记：保留原图与相关地点。<script>window.moduleInjected=true</script>';
  await page.locator('[data-real-map-notes]').fill(mapNote); await page.getByLabel('已探索', { exact: true }).check();
  await page.locator('[data-save-map-state]').click();
  await until(() => page.locator('[data-real-map-status]').textContent(), value => value.includes('地图状态已保存'), 'map notes saved');
  const mapStateFile = join(projectRoot, '模组', created.folder, '故事/地图状态.json');
  const mapState = JSON.parse(await readFile(mapStateFile, 'utf8'));
  assert.equal(mapState.state.locations['map:stormwreck-rest-dm|location:A1'].notes, mapNote);
  assert.equal(mapState.state.locations['map:stormwreck-rest-dm|location:A1'].explored, true);
  assert.equal(mapState.state.locations['map:stormwreck-rest-dm|location:A1'].enemiesHandled, undefined);
  const storyTree = page.locator('[data-real-story-tree]'); if (!await storyTree.evaluate(node => node.open)) await storyTree.locator(':scope > summary').click();
  await page.locator('[data-real-story-choice="stormwreck-voyage"]').click(); await page.getByLabel('团内已知记录', { exact: true }).check();
  await page.locator('[data-save-story-state]').click();
  await until(() => page.locator('[data-real-map-status]').textContent(), value => value.includes('故事进度已保存'), 'story record saved');
  assert.equal(JSON.parse(await readFile(join(projectRoot, '模组', created.folder, '故事/故事进度.json'), 'utf8')).state.nodes['node:stormwreck-voyage'].known, true);
  await page.locator('[data-show-demo-map]').click(); assert(await page.locator('[data-map-image]').isVisible());
  assert((await page.locator('[data-platform-view="maps"] .p-demo-note').textContent()).includes('自绘占位图'));
  await page.locator('[data-show-real-map]').click(); assert(await page.locator('[data-real-map-image]').isVisible());
  await page.locator('[data-toggle-map-tree]').click(); assert.equal(await page.locator('[data-toggle-map-tree]').getAttribute('aria-expanded'), 'false');
  await page.locator('[data-toggle-map-tree]').click();
  await shot('02-原图地点与独立笔记.png');
  check('十张原图与79节点进入原地图目录，地点相关链接有效，探索与敌人状态独立，笔记和故事记录分别保存，公共示例和目录收起保留');

  await openPanel('dialogue'); const message = '隔离测试群聊：引用梅洛资料，不代表真实玩家已获知此信息。';
  await page.locator('[data-project-chat-input]').fill(message);
  const chatSaved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/project/dialogue' && response.request().method() === 'POST');
  await page.locator('[data-project-chat-send]').click(); const chatResponse = await chatSaved; assert.equal(chatResponse.status(), 200); const chatResult = await chatResponse.json();
  const markdown = await readFile(within(projectRoot, chatResult.path), 'utf8');
  assert(markdown.includes(message)); assert(markdown.includes('(<'+merrowPath+'>)')); assert(!markdown.includes(sourceRoot)); assert(!markdown.includes(projectRoot));
  assert(chatResult.path.startsWith(`模组/${created.folder}/对话/`));
  check('群聊消息实际保存时间戳Markdown和项目根相对资源引用，未写绝对主机路径或真实团数据');

  await page.reload(); await chooseDm(); await selectCreatedRun(); await loadMaps(); await selectMap('stormwreck-rest-dm', 'A1');
  assert.equal(await page.locator('[data-real-map-notes]').inputValue(), mapNote); assert.equal(await page.getByLabel('已探索', { exact: true }).isChecked(), true);
  assert.equal(await page.evaluate(() => window.moduleInjected), undefined);
  await openPanel('dialogue'); await until(() => page.locator('[data-project-chat-log]').textContent(), value => value.includes(message), 'chat restored after reload');
  check('页面重开并重新选择同团后，地图笔记与群聊从本地文件恢复；资料文字没有执行脚本');

  await loadMaps();
  for (const preset of ['2560x1600', '2560x1440', '2048x1536', '1920x1440']) {
    await page.locator('select[data-display-preset]:visible').first().selectOption(preset); await pause(120);
    const box = await page.locator('[data-app]').boundingBox(), [width, height] = preset.split('x').map(Number);
    assert(box && Math.abs(box.width / box.height - width / height) < .005); measurements.push({ preset, box });
    if (['2560x1600', '1920x1440'].includes(preset)) await shot('03-真实地图-' + preset + '.png');
  }
  assert.equal(new Set(measurements.map(value => Math.round(value.box.width) + 'x' + Math.round(value.box.height))).size, 4);
  await page.setViewportSize({ width: 320, height: 720 }); await pause(180);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await shot('04-真实地图-320.png');
  await page.setViewportSize({ width: 1600, height: 1100 });
  check('真实地图在四个尺寸预设有四组实际框尺寸，320窄屏无整页横向溢出');

  await nav('battle'); const host = page.locator('[data-project-battle-frame]'); await host.waitFor();
  battleOrigin = new URL(await host.getAttribute('src')).origin; activeFrame = await (await host.elementHandle()).contentFrame();
  await until(() => activeFrame.locator('body').getAttribute('data-platform-embedded'), value => value === 'true', 'battle bridge');
  await activeFrame.locator('#enter-dm').click(); await activeFrame.locator('canvas[data-ready=true]').waitFor({ timeout: 30000 });
  battleToken = await activeFrame.evaluate(() => sessionStorage.getItem('battle-session'));
  const stateResponse = await page.request.get(battleOrigin + '/api/state', { headers: { Authorization: 'Bearer ' + battleToken } }); assert.equal(stateResponse.status(), 200);
  const shown = (await stateResponse.json()).state, npc = shown.actors.find(actor => actor.kind === 'npc');
  assert.equal(shown.campaignId, created.campaignId); assert.equal(shown.combat.phase, 'preparing'); assert.equal(shown.revision, 0);
  assert.equal(shown.actors.length, 2); assert(shown.actors.every(actor => !actor.confirmed)); assert.equal(npc.ac, 13); assert.equal(npc.hp, 45); assert.equal(npc.maxHp, 45);
  assert.equal(npc.attackLimit, 2); assert.equal(npc.attacks.length, 4); assert.equal(npc.reference.resourceId, merrowId);
  assert(shown.actors.find(actor => actor.kind === 'pc').name.includes('待填写')); assert.equal(shown.events.length, 0);
  assert(shown.board.schematic); assert(template.encounterTemplates[0].sourceWarnings.some(value => value.includes('没有序幕航船俯视地图')));
  await shot('05-船上梅洛准备战斗.png');
  await page.setViewportSize({ width: 320, height: 720 }); const canvas = await activeFrame.locator('canvas').boundingBox();
  assert(canvas && canvas.width > 100 && canvas.height >= 150); await shot('06-船上准备战斗-320.png');
  await page.setViewportSize({ width: 1600, height: 1100 });
  const savedState = JSON.parse(await readFile(statePath, 'utf8')); assert.equal(savedState.revision, 0); assert.equal(savedState.combat.phase, 'preparing'); assert.equal(savedState.actors.find(actor => actor.kind === 'npc').hp, 45);
  check('同团船上遭遇进入独立战斗iframe：一只梅洛AC13/HP45、占位PC、四项来源攻击，仍为未确认准备状态且无自动消耗');

  await nav('home'); await page.locator('#platform-switch-identity').click(); await page.locator('#enter-player').click();
  await until(() => notice.textContent(), value => value.includes('Player当前为公共预览'), 'Player preview');
  assert.equal(await page.locator('[data-project-battle-frame]').count(), 0);
  assert(!(await page.locator('body').textContent()).includes(mapNote)); assert(!(await page.locator('body').textContent()).includes(message));
  await nav('maps'); assert.equal(await page.locator('[data-real-map-image]').getAttribute('src'), null);
  assert(await page.locator('[data-real-map-workspace]').isHidden()); assert.equal(await page.locator('[data-real-location-choice]').count(), 0);
  const obsolete = await page.request.get(battleOrigin + '/api/state', { headers: { Authorization: 'Bearer ' + battleToken } }); assert.equal(obsolete.status(), 401);
  for (const [path, fingerprint] of sourceHashes) assert.equal(digest(await readFile(within(sourceRoot, path))), fingerprint, 'Read-only source changed: ' + path);
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  check('切Player清除真实地图、笔记、群聊和战斗票据；原PDF与全部来源资源摘要不变，脚本无错误且无外网请求');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, screenshots, measurements, sourceFilesVerified: sourceHashes.size, sourceRoot,
    projectRoot, moduleId: created.moduleId, campaignId: created.campaignId, battleId: created.battleId, errors, outside, requests }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, directory, sourceFilesVerified: sourceHashes.size, errors, outside }, null, 2));
} catch (error) {
  await shot('失败现场.png').catch(() => {});
  await writeFile(join(directory, 'failure.json'), JSON.stringify({ message: error.message, checks, errors, outside, created, requests }, null, 2)); throw error;
} finally { await browser.close(); await app.close(); }

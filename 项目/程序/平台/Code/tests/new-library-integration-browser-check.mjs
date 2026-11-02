import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isolatePlatform, startIsolated } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const { directory, isolated } = await isolatePlatform('new-library-flow-');
const projectRoot = join(directory, '项目'), original = new Map();
const sha = value => createHash('sha256').update(value).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function source(path, value) { const target = join(projectRoot, path), raw = Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2); await mkdir(dirname(target), { recursive: true }); await writeFile(target, raw); original.set(target, sha(raw)); }
const md = (meta, body) => '---\n' + JSON.stringify(meta, null, 2) + '\n---\n' + body;
await source('模组/合成岛/模组.json', { id: 'synthetic-island', name: '合成岛冒险', version: 'test-1' });
await source('模组/合成岛/资源/故事/岛屿线索.md', md({ id: 'island-clue', name: '岛屿线索', kind: '故事', moduleId: 'synthetic-island', initial: 'D', aliases: ['Island Clue'], tags: ['合成'] }, '# 岛屿线索正文\n\n**只有获准角色能读到这段内容。**\n\n![合成图片](图.png)\n\n<script>window.libraryInjected=true</script>'));
await source('模组/合成岛/资源/故事/图.png', png);
await source('资源/规则/世界规则.md', md({ id: 'world-rule', name: '未开放世界规则', kind: '规则', initial: 'W' }, '# 只供DM查阅的规则\n未向任何角色开放。'));
const mapData = { id: 'synthetic-island', title: '合成岛冒险', capabilities: { sharing: false }, players: [], nodes: [{ id: 'island', name: '合成岛', kind: 'image', parentId: null, width: 200, height: 160, imageUrl: '/assets/island', variants: [{ id: 'dm', label: '主持原图', url: '/assets/island' }], description: '合成海岸的原文描述。', sensory: '可以看见灯塔。', hotspots: [{ label: 'R1', x: .5, y: .5, targetId: 'room' }] }, { id: 'room', parentId: 'island', name: 'R1 房间', kind: 'text', description: '房间原文描述。', sensory: '桌上有一盏灯。', variants: [], hotspots: [] }] };
await source('模组/合成岛/地图/地图包.json', { schemaVersion: 1, moduleData: mapData, assets: { '/assets/island': { path: '图片/岛.png', mime: 'image/png', sha256: sha(png) } }, sources: {} });
await source('模组/合成岛/地图/图片/岛.png', png);
const app = await startIsolated(isolated, { projectRoot });
let browser, dm, alice, bob;
const checks = [], errors = [], problems = [], outside = [], screenshots = [];
const note = text => { checks.push(text); console.log('通过：' + text); };
const nav = (page, name) => page.locator('[data-platform-page=' + name + ']').click();
async function trackedContext(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, ...options });
  await context.route('**/*', route => { const value = route.request().url(); if (value.startsWith(app.url) || /^(data:|blob:|about:)/.test(value)) return route.continue(); outside.push(value); return route.abort(); });
  context.on('page', page => { page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.stack || error.message)); page.on('dialog', dialog => dialog.accept()); });
  return context;
}
async function shot(page, name) { if (!page || page.isClosed()) return; const path = join(directory, name + '.png'); await page.screenshot({ path, fullPage: true }); screenshots.push(path); }
async function info(page) { return page.evaluate(async () => { const response = await fetch('/api/library/context', { headers: { 'X-Platform-Session': sessionStorage.getItem('platform-session') || '', 'X-Library-Token': sessionStorage.getItem('library-token') || '' } }); return response.json(); }); }
async function playerApi(page, path) { return page.evaluate(async path => { const response = await fetch(path, { headers: { 'X-Library-Token': sessionStorage.getItem('library-token') || '' } }); return { status: response.status, value: await response.json() }; }, path); }
async function readyPlayer(page, invite) {
  await page.goto(invite); await page.locator('#enter-player').click();
  await page.locator('.library-notifications').waitFor();
  await page.waitForFunction(() => !!sessionStorage.getItem('library-token'));
}
try {
  browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const dmContext = await trackedContext(); dm = await dmContext.newPage();
  await dm.goto(app.url); await dm.locator('#enter-dm').click();
  await dm.waitForFunction(() => !!sessionStorage.getItem('platform-session'));
  await dm.locator('#platform-go-modules').click(); await dm.locator('[data-real-module-template=synthetic-island]').waitFor();
  assert.equal((await info(dm)).selected, null);
  await dm.getByText('新开一团', { exact: true }).click(); await dm.getByLabel('新团名称').fill('自然入口合成团'); await dm.locator('[data-project-create-run=synthetic-island]').click();
  await dm.waitForFunction(() => document.querySelector('#platform-current-session')?.textContent.includes('自然入口合成团'));
  await dm.locator('[data-real-module-host][aria-busy=false]').waitFor();
  const run = (await info(dm)).selected; assert.equal(run.moduleId, 'synthetic-island'); assert.equal(run.runName, '自然入口合成团');
  await dm.locator('[data-real-run="' + run.runId + '"]').click(); await dm.locator('[data-project-select-module="' + run.runId + '"]').click();
  await dm.locator('[data-real-module-host][aria-busy=false]').waitFor();
  note('首页DM自然进入模组，浏览不切团，新建并明确继续真实独立团');
  await nav(dm, 'dialogue');
  await dm.getByText('本团角色与玩家邀请', { exact: true }).click();
  const party = dm.locator('.library-party-panel'); await party.getByLabel('新角色名称').waitFor();
  for (const name of ['Alice', 'Bob']) {
    await party.getByLabel('新角色名称').fill(name + '角色'); await party.getByLabel('玩家称呼').fill(name);
    await party.getByRole('button', { name: '添加角色', exact: true }).click(); await party.locator('.library-party-member').filter({ hasText: name + '角色' }).waitFor();
  }
  assert.equal((await info(dm)).characters.length, 2); note('对话页正常添加Alice和Bob，两角色分别绑定玩家');
  await nav(dm, 'resources'); await dm.locator('[data-real-resource-kind="模组"]').click();
  const row = dm.locator('[data-project-resource=island-clue]'); await row.waitFor(); await row.locator('[data-resource-expand]').click();
  const reader = dm.locator('.real-resource-reader'); await reader.getByRole('heading', { name: '岛屿线索正文', exact: true }).waitFor();
  await dm.waitForFunction(() => { const image = document.querySelector('.real-resource-reader img'); return image?.complete && image.naturalWidth > 0; });
  assert.equal(await dm.evaluate(() => window.libraryInjected), undefined); await shot(dm, 'dm-resource-open');
  const share = row.locator('[data-resource-character-select=island-clue]'); await share.locator('summary').click(); await row.locator('[data-resource-share-apply]').waitFor({ state: 'visible' });
  await dm.waitForFunction(() => !document.querySelector('[data-resource-share-apply=island-clue]')?.disabled);
  await share.locator('label').filter({ hasText: 'Alice角色' }).locator('input').check();
  assert.equal(await share.locator('label').filter({ hasText: 'Bob角色' }).locator('input').isChecked(), false);
  await row.locator('[data-resource-share-apply]').click(); await dm.locator('.real-resource-status').filter({ hasText: '已更新当前团的角色开放范围' }).waitFor();
  note('模组资源卡展开固定MD与本地图片，角色下拉只向Alice开放');
  await nav(dm, 'dialogue');
  if (!await dm.locator('.library-party-box').evaluate(node => node.open)) await dm.getByText('本团角色与玩家邀请', { exact: true }).click();
  const aliceRow = party.locator('.library-party-member').filter({ hasText: 'Alice角色' }), bobRow = party.locator('.library-party-member').filter({ hasText: 'Bob角色' });
  await aliceRow.getByRole('button', { name: '生成本机邀请', exact: true }).click();
  const aliceInvite = await party.getByLabel('Alice角色的本机邀请链接').inputValue();
  await bobRow.getByRole('button', { name: '生成本机邀请', exact: true }).click();
  const bobInvite = await party.getByLabel('Bob角色的本机邀请链接').inputValue();
  assert(new URL(aliceInvite).hash.startsWith('#invite='));
  const aliceContext = await trackedContext(), bobContext = await trackedContext(); alice = await aliceContext.newPage(); bob = await bobContext.newPage();
  await readyPlayer(alice, aliceInvite); await readyPlayer(bob, bobInvite);
  await alice.locator('[data-shared-resource-id=island-clue]').waitFor();
  assert.match(await alice.locator('.library-notifications').innerText(), /DM向你分享了【岛屿线索】/);
  assert.equal(await bob.locator('[data-shared-resource-id=island-clue]').count(), 0);
  assert.equal((await playerApi(bob, '/api/library/read?resourceId=island-clue')).status, 403);
  assert.equal((await playerApi(alice, '/api/library/read?resourceId=world-rule')).status, 403);
  await shot(alice, 'alice-notification'); note('独立Player会话从专属邀请进入，定向通知仅Alice可见，Bob与未开放资料均被服务端拒绝');
  await alice.locator('[data-shared-resource-id=island-clue]').click();
  try {
    await alice.locator('[data-platform-view=resources]:visible').waitFor();
    await alice.locator('[data-resource-expand=island-clue][aria-expanded=true]').waitFor();
    await alice.locator('.real-resource-reader').getByRole('heading', { name: '岛屿线索正文', exact: true }).waitFor();
    await shot(alice, 'alice-notification-open'); note('点击通知切到资源页并自动定位、展开正确MD资料');
  } catch (error) { problems.push('分享通知未正确自动展开资源：' + error.message); await shot(alice, 'notification-open-failure'); console.error(problems.at(-1)); }
  await nav(dm, 'resources'); await dm.locator('[data-real-resource-kind="模组"]').click();
  const revokeRow = dm.locator('[data-project-resource=island-clue]'), revoke = revokeRow.locator('[data-resource-character-select=island-clue]');
  await revoke.locator('summary').click(); await dm.waitForFunction(() => !document.querySelector('[data-resource-share-apply=island-clue]')?.disabled);
  await revoke.locator('label').filter({ hasText: 'Alice角色' }).locator('input').uncheck(); await revokeRow.locator('[data-resource-share-apply]').click();
  await dm.locator('.real-resource-status').filter({ hasText: '已撤回当前团的角色开放' }).waitFor();
  assert.equal((await playerApi(alice, '/api/library/read?resourceId=island-clue')).status, 403);
  await nav(alice, 'dialogue'); await alice.locator('.library-notifications').filter({ hasText: 'DM撤回了给你的分享【岛屿线索】' }).waitFor();
  assert.equal(await alice.locator('[data-shared-resource-id=island-clue]').count(), 0);
  await nav(alice, 'resources'); await alice.locator('.real-resource-status').filter({ hasText: '共0条' }).waitFor();
  assert.equal(await alice.locator('.real-resource-reader:visible').count(), 0); note('DM撤回后Player后端立即拒读，定向撤回通知与资源列表同步清理');
  await nav(dm, 'maps'); await dm.locator('[data-map-editor]').waitFor();
  const mapFrame = dm.frameLocator('[data-map-editor]'); await dm.waitForFunction(() => document.querySelector('[data-map-editor]')?.contentWindow.mapPreview?.ready);
  await mapFrame.locator('[data-focus-node=island]').click(); await mapFrame.locator('[data-hotspot-index="0"]').click();
  assert.equal(await mapFrame.locator('#selection-name').inputValue(), 'R1 房间');
  await mapFrame.locator('[data-tool=player]').click(); const box = await mapFrame.locator('#viewport').boundingBox(); await dm.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await mapFrame.locator('#selection-name').fill('平台地图标记'); await mapFrame.locator('#selection-name').press('Tab');
  await mapFrame.locator('#viewport').focus(); await dm.keyboard.press('Control+z'); await dm.keyboard.press('Control+z');
  assert.equal(await dm.evaluate(() => document.querySelector('[data-map-editor]').contentWindow.mapPreview.getDocument().objects.length), 0);
  await dm.keyboard.press('Control+y'); await dm.keyboard.press('Control+y');
  await mapFrame.locator('#save').click(); await mapFrame.locator('#status').filter({ hasText: '画布已保存到本地文件' }).waitFor();
  const canvasPath = join(projectRoot, '模组/合成岛/游玩团', run.runId, '画布.json');
  assert.equal(JSON.parse(await readFile(canvasPath, 'utf8')).document.objects[0].name, '平台地图标记');
  await mapFrame.locator('#reset-canvas').click(); assert.equal(await dm.evaluate(() => document.querySelector('[data-map-editor]').contentWindow.mapPreview.getDocument().objects.length), 0);
  await mapFrame.locator('#undo').click(); await mapFrame.locator('#save').click(); await mapFrame.locator('#status').filter({ hasText: '画布已保存到本地文件' }).waitFor();
  await shot(dm, 'dm-map-saved'); note('正常地图入口加载完整工作台，热点、编辑、撤销/重做、可撤销重置与真实团画布保存均可用');
  for (const [path, hash] of original) assert.equal(sha(await readFile(path)), hash, 'Source fixture changed: ' + path);
  assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(problems, []); note('源资料字节保持，无外部请求及页面脚本错误');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, errors, outside, screenshots, runId: run.runId }, null, 2)); console.log('证据：' + directory);
} catch (error) {
  await shot(dm, 'failure-dm'); await shot(alice, 'failure-alice'); await shot(bob, 'failure-bob');
  await writeFile(join(directory, 'failure.json'), JSON.stringify({ message: error.message, checks, errors, problems, outside, screenshots }, null, 2)); console.error('失败证据：' + directory); throw error;
} finally { await browser?.close(); await app.close(); }

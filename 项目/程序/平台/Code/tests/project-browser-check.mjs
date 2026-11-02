import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatePlatform, startIsolated } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE
  || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const { directory, isolated } = await isolatePlatform('project-browser-');
const projectRoot = join(directory, '项目');
for (const path of ['模组/多人短团/样本', '模组/多人短团/另一个样本', '资源/NPC/A', '资源/地图/M', '资源/故事/G']) await mkdir(join(projectRoot, path), { recursive: true });
await writeFile(join(projectRoot, '模组/多人短团/样本/模组调用.json'), JSON.stringify({ id: 'module-1', name: '样本' }));
await writeFile(join(projectRoot, '模组/多人短团/另一个样本/模组调用.json'), JSON.stringify({ id: 'module-2', name: '另一个样本' }));
await writeFile(join(projectRoot, '资源/NPC/A/阿德.json'), JSON.stringify({ id: 'npc-1', name: '阿德', hp: 20, note: '合成DM资料<script>window.resourceInjected=true</script>' }));
await writeFile(join(projectRoot, '资源/故事/G/故事合成.json'), JSON.stringify({ id: 'story-1', name: '故事合成', text: '只是合成故事资料' }));
await writeFile(join(projectRoot, '资源/地图/M/迷宫.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160"><rect width="200" height="160" fill="#d9f6ff"/><path d="M10 10H190V150H10Z M40 10V90H120" fill="none" stroke="#34374d"/></svg>');
const app = await startIsolated(isolated, { projectRoot });
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
  .catch(async error => { await app.close(); throw error; });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, deviceScaleFactor: 1 });
const errors = [], outside = [], requests = [], checks = [], screenshots = [];
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: new URL(request.url()).pathname === '/api/local-view'
    ? JSON.stringify({ role: request.postDataJSON()?.role, hasPrevious: !!request.postDataJSON()?.previous }) : request.postData() }));
});
await context.route('**/*', route => {
  const url = route.request().url();
  if (/^(data:|about:)/.test(url) || new URL(url).origin === app.url) return route.continue();
  outside.push(url); return route.abort();
});
const page = await context.newPage();
const nav = name => page.locator('[data-platform-page="' + name + '"]').click();
const panel = name => page.locator('[data-project-panel="' + name + '"]');
const resource = id => page.locator('[data-project-resource="' + id + '"]');
const notice = page.locator('.p-appearance-status > .project-notice');
const check = name => { checks.push(name); console.log('PASS: ' + name); };
const shot = async name => { const path = join(directory, name); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };
const pause = ms => new Promise(accept => setTimeout(accept, ms));
async function until(read, accept, label) {
  for (let attempt = 0; attempt < 70; attempt++) { const value = await read(); if (accept(value)) return value; await pause(100); }
  throw new Error('Timed out: ' + label);
}
async function chooseDm() {
  await page.locator('#enter-dm').click();
  await until(() => notice.textContent(), text => text.includes('本机DM可'), 'DM local view');
}
async function openPanel(name) { await nav(name); if (!await panel(name).evaluate(node => node.open)) await panel(name).locator('summary').click(); }
async function selectModule(id = 'module-1', title = '样本') {
  await openPanel('modules'); await page.locator('[data-project-select-module="' + id + '"]').waitFor();
  await page.locator('[data-project-select-module="' + id + '"]').click();
  await until(() => page.locator('[data-platform-view=maps] [data-module-context]').textContent(), text => text === '当前模组：' + title, 'real module selected');
  for (const name of ['maps', 'dialogue', 'battle']) assert.equal(await page.locator('[data-platform-view="' + name + '"] [data-module-context]').textContent(), '当前模组：' + title);
}

try {
  const programBefore = await readFile(join(isolated, 'web', 'design-workspace.mjs'));
  await page.goto(app.url); await chooseDm(); await selectModule();
  await shot('整合-真实模组选取.png');
  assert.equal(await page.locator('[data-module-index]').count(), 5);
  check('模组窗口显式选择真实JSON模组，地图/对话/战斗共用所属关系，设计封面环仍保留');

  await openPanel('resources'); await resource('npc-1').waitFor(); await resource('story-1').waitFor();
  await page.locator('[data-project-refresh-resources]').click();
  await resource('npc-1').waitFor();
  const map = page.locator('[data-project-resource]').filter({ hasText: '资源/地图/M/迷宫.svg' }); await map.waitFor();
  assert.equal(await page.locator('[data-resource]').count(), 3, 'Keep the three original design category cards');
  await resource('npc-1').click({ button: 'right' });
  for (const label of ['引用', '开放给某玩家并引用', '打开文件夹位置']) assert(await resource('npc-1').getByRole('button', { name: label, exact: true }).isVisible());
  await shot('整合-资源右键.png');
  check('真实资源列出JSON、故事和矢量地图，右键菜单提供引用/发放/文件夹位置，同时保留设计卡片');

  await resource('npc-1').locator('[data-project-reference]').click();
  await until(() => notice.textContent(), text => text.includes('已引用到当前模组'), 'reference saved');
  await resource('npc-1').getByLabel('开放给玩家ID').fill('player-one');
  await resource('npc-1').locator('[data-project-release]').click();
  await until(() => notice.textContent(), text => text.includes('发放记录与当前引用已保存'), 'release saved');
  const current = JSON.parse(await readFile(join(projectRoot, '模组/样本/故事/当前.json'), 'utf8'));
  assert.equal(current.instances.length, 1); assert.equal(current.instances[0].resourceId, 'npc-1'); assert.equal(current.instances[0].base, '资源/NPC/A/阿德.json');
  const releases = JSON.parse(await readFile(join(projectRoot, '资源/故事/F/发放记录.json'), 'utf8'));
  assert(releases.releases.some(grant => grant.resourceId === 'npc-1' && grant.playerId === 'player-one'));
  const base = JSON.parse(await readFile(join(projectRoot, '资源/NPC/A/阿德.json'), 'utf8')); assert.equal(base.hp, 20);
  check('引用和开放给玩家实际保存当前实例及发放记录，共享资源原JSON保持不变');

  let revealed;
  await page.route(app.url + '/api/project/reveal', async route => { revealed = route.request().postDataJSON(); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ opened: true, projectPath: '资源/NPC/A/阿德.json' }) }); });
  await resource('npc-1').locator('[data-project-reveal]').click();
  await until(() => revealed, value => value?.resourceId === 'npc-1', 'folder target');
  await page.unroute(app.url + '/api/project/reveal');
  await resource('npc-1').getByRole('button', { name: 'NPC · 阿德', exact: true }).click();
  await page.locator('.project-preview').waitFor();
  assert(await page.locator('.project-preview').isVisible()); assert((await page.locator('.project-preview').textContent()).includes('合成DM资料'));
  assert.equal(await page.locator('.project-preview script').count(), 0); assert.equal(await page.evaluate(() => window.resourceInjected), undefined);
  await page.locator('#dialogue-layout').selectOption('grid'); assert.equal(await page.locator('[data-dialogue-pane]').count(), 4);
  check('文件夹按钮只提交资源ID；实际资源可在对话标签预览和分屏，资料文本不会作为脚本执行');

  await openPanel('dialogue'); await page.locator('[data-project-chat-input]').waitFor();
  const message = '合成群聊消息：一起查看阿德资料。<img src=x onerror="window.chatInjected=true"><script>window.chatInjected=true</script>';
  await page.locator('[data-project-chat-input]').fill(message); await page.locator('[data-project-chat-send]').click();
  const path = join(projectRoot, '模组/样本/对话/样本/对话.md');
  const text = await until(() => readFile(path, 'utf8').catch(() => ''), value => value.includes(message), 'Markdown chat saved');
  assert(/## \d{4}-\d\d-\d\dT/.test(text)); assert(text.includes('(<资源/NPC/A/阿德.json>)')); assert(!text.includes(projectRoot));
  await until(() => page.locator('[data-project-chat-log]').textContent(), value => value.includes(message), 'saved chat displayed');
  const rendered = page.locator('.project-message').first(); assert.equal(await rendered.locator('p').textContent(), message);
  assert(/Z$/.test(await rendered.locator('time').getAttribute('datetime')));
  assert(!(await rendered.locator('time').textContent()).includes('T'));
  assert.equal(await rendered.locator('script,img').count(), 0); assert.equal(await page.evaluate(() => window.chatInjected), undefined);
  await rendered.getByRole('button', { name: '阿德', exact: true }).click(); await page.locator('.project-preview').waitFor();
  assert((await page.locator('.project-preview').textContent()).includes('合成DM资料'));
  await page.locator('[data-dialogue-source=real-chat]').click();
  check('正式群聊按安全消息块和友好时间显示，脚本文字不执行，消息内资源引用可打开真实标签');
  await shot('整合-正式群聊引用.png');
  const previousTicket = await page.evaluate(() => sessionStorage.getItem('platform-session')); assert(previousTicket);
  const cleared = page.waitForResponse(response => response.url() === app.url + '/api/local-view' && response.request().method() === 'POST' && response.request().postDataJSON().role === null);
  await page.reload(); await cleared; await page.locator('#enter-dm').waitFor();
  assert.equal(await page.locator('#platform-identity').textContent(), '尚未选择视角');
  assert.equal((await page.request.get(app.url + '/api/project/status', { headers: { 'X-Platform-Session': previousTicket } })).status(), 403);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('platform-session')), null);
  check('刷新回身份首页时撤销旧DM票据，文件API拒绝旧票据且浏览器不保留正式访问身份');
  await chooseDm(); await selectModule(); await openPanel('dialogue');
  await until(() => page.locator('[data-project-chat-log]').textContent(), value => value.includes(message), 'chat restored after page reopen');
  check('当前模组群聊实际写时间戳Markdown及项目相对资源引用，页面重开后从文件恢复');

  const draft = '同模组收起展开后应保留的草稿'; await page.locator('[data-project-chat-input]').fill(draft);
  const oldInput = await page.locator('[data-project-chat-input]').elementHandle();
  await panel('dialogue').locator('summary').click(); await panel('dialogue').locator('summary').click();
  await until(() => oldInput.evaluate(node => !node.isConnected), value => value, 'chat rebuilt after expanding file section');
  assert.equal(await page.locator('[data-project-chat-input]').inputValue(), draft);
  check('同模组收起再展开文件区保留正式聊天草稿，重新构建消息显示不会丢输入');
  await openPanel('modules');
  await page.locator('[data-project-select-module="module-2"]').click();
  await until(() => notice.textContent(), value => value.includes('未发送草稿'), 'unsent draft blocks a module change');
  await openPanel('dialogue');
  assert.equal(await page.locator('[data-project-chat-input]').inputValue(), draft);
  await page.locator('[data-project-chat-input]').fill('');
  check('未发送草稿阻止切团并保持原文，明确清空后才允许切换');

  await openPanel('resources'); await resource('npc-1').waitFor();
  let continueOldModuleRead, moduleReadStarted, moduleReadFinished, moduleReadFailed;
  const moduleReadGate = new Promise(accept => { continueOldModuleRead = accept; });
  const moduleStarted = new Promise(accept => { moduleReadStarted = accept; });
  const moduleFinished = new Promise((accept, reject) => { moduleReadFinished = accept; moduleReadFailed = reject; });
  await page.route(app.url + '/api/project/read?resourceId=npc-1', async route => {
    try { const response = await route.fetch(); moduleReadStarted(); await moduleReadGate; await route.fulfill({ response }); moduleReadFinished(); }
    catch (error) { moduleReadFailed(error); }
  });
  await resource('npc-1').getByRole('button', { name: 'NPC · 阿德', exact: true }).click(); await moduleStarted;
  await selectModule('module-2', '另一个样本');
  assert.equal(await panel('dialogue').evaluate(node => node.open), false);
  assert.equal(await panel('dialogue').locator('.project-tools-body').textContent(), '');
  continueOldModuleRead(); await moduleFinished; await page.unroute(app.url + '/api/project/read?resourceId=npc-1'); await pause(150);
  assert.equal(await page.locator('#platform-root').getAttribute('data-page'), 'modules');
  assert.equal(await page.locator('.project-preview,.project-chat').count(), 0);
  assert(!(await page.locator('body').textContent()).includes(message));
  await openPanel('dialogue'); await page.locator('[data-project-chat-input]').waitFor();
  assert.equal(await page.locator('[data-project-chat-input]').inputValue(), '');
  assert(!(await page.locator('[data-project-chat-log]').textContent()).includes(message));
  check('明确清空草稿后切换真实模组，旧聊天闭包和迟到资源响应不能回填新模组或拉回旧标签');
  await selectModule();

  await openPanel('resources'); await resource('npc-1').waitFor();
  let resumeRead, readStarted, readFinished, readFailed;
  const started = new Promise(accept => { readStarted = accept; });
  const gate = new Promise(accept => { resumeRead = accept; });
  const finished = new Promise((accept, reject) => { readFinished = accept; readFailed = reject; });
  await page.route(app.url + '/api/project/read?resourceId=npc-1', async route => {
    try { const response = await route.fetch(); readStarted(); await gate; await route.fulfill({ response }); readFinished(); }
    catch (error) { readFailed(error); }
  });
  await resource('npc-1').getByRole('button', { name: 'NPC · 阿德', exact: true }).click(); await started;
  await nav('home'); await page.locator('#platform-switch-identity').click(); await page.locator('#enter-player').click();
  await until(() => notice.textContent(), text => text.includes('Player当前为公共预览'), 'player view ready');
  resumeRead(); await finished; await page.unroute(app.url + '/api/project/read?resourceId=npc-1');
  await pause(200);
  assert((await notice.textContent()).includes('Player当前为公共预览'), 'Late DM errors must not replace the current Player status');
  assert.equal(await page.locator('[data-project-resource]').count(), 0); assert.equal(await page.locator('.project-preview').count(), 0);
  assert(!(await page.locator('body').textContent()).includes('合成DM资料')); assert(!(await page.locator('body').textContent()).includes(message));
  for (const name of ['modules', 'resources', 'dialogue']) assert(await panel(name).isHidden());
  await nav('dialogue'); assert.equal(await page.locator('.dialogue-message').count(), 5);
  check('换到Player立即清空真实资料和正式群聊，迟到DM读取不回填，公共示例仍可使用');

  await page.setViewportSize({ width: 320, height: 640 });
  for (const name of ['home', 'modules', 'resources', 'maps', 'dialogue', 'battle']) { await nav(name); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
  await nav('dialogue'); await shot('整合-Player-320.png');
  assert.deepEqual(await readFile(join(isolated, 'web', 'design-workspace.mjs')), programBefore);
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  check('整合后六窗窄屏无横向溢出，程序源文件不随数据操作变化，脚本无错误且无外网请求');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, screenshots, isolated, projectRoot, errors, outside, requests }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, directory, errors, outside }, null, 2));
} finally { await browser.close(); await app.close(); }

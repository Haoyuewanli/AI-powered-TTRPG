import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatePlatform, startIsolated } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE
  || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const { directory, isolated } = await isolatePlatform('browser-');
const app = await startIsolated(isolated);
const browser = await chromium.launch({
  executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader']
}).catch(async error => { await app.close(); throw error; });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [], outside = [], requests = [], checks = [], screenshots = [];
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
});
await context.route('**/*', route => {
  const url = route.request().url();
  if (/^(data:|about:)/.test(url) || new URL(url).origin === app.url) return route.continue();
  outside.push(url); return route.abort();
});
const page = await context.newPage();
const nav = name => page.locator('[data-platform-page="' + name + '"]').click();
const view = name => page.locator('[data-platform-view="' + name + '"]');
const tab = id => page.locator('[role="tab"][data-dialogue-tab="' + id + '"]');
const pane = id => page.locator('[data-dialogue-pane="' + id + '"]');
const open = id => page.locator('[data-dialogue-source="' + id + '"]').click();
const ids = () => page.locator('[role="tab"][data-dialogue-tab]').evaluateAll(nodes => nodes.map(node => node.dataset.dialogueTab));
const order = id => pane(id).locator('[role="tab"]').evaluateAll(nodes => nodes.map(node => node.dataset.dialogueTab));
const check = name => { checks.push(name); console.log('PASS: ' + name); };
const shot = async name => { const path = join(directory, name); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };

async function inventory(root, current = root) {
  const files = {};
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(files, await inventory(root, path));
    else files[relative(root, path)] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return files;
}
async function invariant() {
  const values = await ids(); assert.equal(new Set(values).size, values.length);
  for (const area of await page.locator('[data-dialogue-pane]').all()) {
    const count = await area.locator('[role="tab"]').count();
    assert.equal(await area.locator('[role="tab"][aria-selected=true]').count(), count ? 1 : 0);
  }
}
async function moveTo(id, target) {
  const current = await tab(id).evaluate(node => node.closest('[data-dialogue-pane]').dataset.dialoguePane);
  if (current === target) return;
  await tab(id).click();
  await pane(current).locator('.dialogue-destination').selectOption(target);
  await pane(current).locator('.dialogue-move').click();
  assert.equal(await tab(id).evaluate(node => node.closest('[data-dialogue-pane]').dataset.dialoguePane), target);
}
async function layout(value) {
  await page.locator('#dialogue-layout').selectOption(value);
  await invariant();
}
async function choose(role) {
  await nav('home');
  if (await page.locator('#platform-switch-identity').isVisible()) await page.locator('#platform-switch-identity').click();
  await page.locator(role === 'dm' ? '#enter-dm' : '#enter-player').click();
}

try {
  const filesBefore = await inventory(isolated);
  await page.goto(app.url); await page.locator('#platform-root').waitFor();
  assert.deepEqual(await page.locator('[data-platform-page]').allTextContents(), ['首页', '模组', '资源', '地图', '对话', '战斗']);
  assert((await page.locator('#platform-mode-note').textContent()).includes('尚未接入正式身份'));
  for (const name of ['modules', 'resources', 'maps', 'dialogue', 'battle']) assert(await page.locator('[data-platform-page="' + name + '"]').isDisabled());
  assert.equal(await page.locator('#table, #viewport').count(), 0);
  await shot('独立首页-身份选择.png');
  await page.locator('#enter-dm').click();
  assert((await page.locator('#platform-identity').textContent()).includes('DM'));
  assert((await page.locator('#platform-current-session').textContent()).includes('未选择模组'));
  await shot('独立首页-DM.png');
  check('复制版独立首页提供DM/Player演示入口和六项导航，不需要战斗DOM或业务登录');

  for (const name of ['modules', 'resources', 'maps', 'dialogue', 'battle']) {
    await nav(name); assert(await view(name).isVisible());
    assert.equal(await page.locator('[data-platform-page="' + name + '"]').getAttribute('aria-pressed'), 'true');
    if (['maps', 'dialogue', 'battle'].includes(name)) assert.equal(await view(name).locator('[data-module-context]').textContent(), '未选择模组');
  }
  await nav('dialogue');
  assert((await view('dialogue').locator('.platform-demo-boundary').textContent()).includes('不代表已发放资料'));
  assert.equal(requests.filter(request => new URL(request.url).pathname.startsWith('/api/')).length, 0);
  check('地图/对话/战斗始终保留未选模组空态，对话仅公共演示，没有旧目录或私有API请求');

  assert.equal(await page.locator('.dialogue-message').count(), 5);
  const allTabs = ['chat', 'resource-characters', 'resource-creatures', 'map-overland', 'map-building'];
  for (const id of allTabs) await open(id);
  for (const id of allTabs) await open(id);
  assert.equal((await ids()).length, 5); await invariant();
  await open('chat');
  const message = '<img src=x onerror="window.injected=true"><script>window.injected=true</script>';
  await page.locator('#dialogue-message').fill(message);
  await page.locator('#dialogue-chat-form button[type=submit]').click();
  assert.equal(await page.locator('.dialogue-message').last().locator('p').textContent(), message);
  assert.equal(await page.locator('.dialogue-messages img,.dialogue-messages script').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  const draft = '未发送的本页演示草稿';
  await page.locator('#dialogue-message').fill(draft);
  const beforeOrder = await order('pane-1');
  await pane('pane-1').getByRole('button', { name: '区域 1当前标签后移', exact: true }).click();
  assert.equal((await order('pane-1')).indexOf('chat'), beforeOrder.indexOf('chat') + 1);
  await pane('pane-1').getByRole('button', { name: '区域 1当前标签前移', exact: true }).click();
  assert.deepEqual(await order('pane-1'), beforeOrder);
  await tab('map-building').dragTo(tab('chat'));
  assert.equal((await order('pane-1'))[0], 'map-building');
  await layout('grid');
  await tab('resource-characters').dragTo(pane('pane-2'), { targetPosition: { x: 65, y: 65 } });
  assert.equal(await tab('resource-characters').evaluate(node => node.closest('[data-dialogue-pane]').dataset.dialoguePane), 'pane-2');
  await moveTo('map-overland', 'pane-3');
  await moveTo('map-building', 'pane-4'); await invariant();
  check('五个示例标签去重；输入按纯文本显示，按钮排序和真实拖放/跨分屏移动可用');

  const near = (a, b) => assert(Math.abs(a - b) <= 2);
  for (const [name, count] of [['single', 1], ['columns', 2], ['rows', 2], ['grid', 4], ['left-stack', 3], ['right-stack', 3]]) {
    await layout(name);
    const boxes = await Promise.all((await page.locator('[data-dialogue-pane]').all()).map(area => area.boundingBox()));
    assert.equal(boxes.length, count); assert(boxes.every(Boolean));
    if (name === 'columns') { near(boxes[0].y, boxes[1].y); assert(boxes[0].x < boxes[1].x); }
    if (name === 'rows') { near(boxes[0].x, boxes[1].x); assert(boxes[0].y < boxes[1].y); }
    if (name === 'grid') { near(boxes[0].x, boxes[2].x); near(boxes[0].y, boxes[1].y); near(boxes[1].x, boxes[3].x); near(boxes[2].y, boxes[3].y); }
    if (name === 'left-stack') { near(boxes[0].x, boxes[1].x); assert(boxes[2].height > boxes[0].height * 1.8); assert(boxes[2].x > boxes[0].x); }
    if (name === 'right-stack') { near(boxes[1].x, boxes[2].x); assert(boxes[0].height > boxes[1].height * 1.8); assert(boxes[1].x > boxes[0].x); }
    assert.equal((await ids()).length, 5);
  }
  await open('chat');
  assert.equal(await page.locator('#dialogue-message').inputValue(), draft);
  assert.equal(await page.locator('.dialogue-message').count(), 6);
  await page.getByRole('button', { name: '关闭冒险群聊 · 示例', exact: true }).click();
  await open('chat');
  assert.equal(await page.locator('#dialogue-message').inputValue(), draft);
  await tab('chat').focus(); await page.keyboard.press('Home');
  const activeFirst = await page.evaluate(() => document.activeElement.dataset.dialogueTab);
  assert.equal(activeFirst, (await order(await tab('chat').evaluate(node => node.closest('[data-dialogue-pane]').dataset.dialoguePane)))[0]);
  check('六种布局具有正确几何关系，缩合/关闭重开保留消息与草稿，标签键盘切换可用');

  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1024, height: 600 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(size); await nav('home');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert(await page.locator('.platform-nav').isVisible());
    await nav('dialogue'); await layout('grid');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (size.width < 760) {
      assert(await page.locator('#dialogue-region').isVisible());
      await page.locator('#dialogue-region').selectOption('pane-3');
      assert.equal(await page.locator('[data-dialogue-pane]:visible').count(), 1);
      assert(await pane('pane-3').isVisible());
      await open('chat');
      assert.equal(await page.locator('#dialogue-message').inputValue(), draft);
      await shot('独立对话-' + size.width + '.png');
    }
    await invariant();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-platform-page=home]').hover();
  assert.equal(await page.locator('[data-platform-page=home]').evaluate(element => getComputedStyle(element).transform), 'none');
  await nav('home'); await nav('dialogue');
  check('六尺寸首页/对话无整页横向溢出，窄屏逐区域查看，减少动态模式可操作');

  await choose('player'); assert((await page.locator('#platform-identity').textContent()).includes('Player'));
  await nav('dialogue');
  assert.equal(await page.locator('.dialogue-message').count(), 5);
  assert.equal(await page.locator('#dialogue-message').inputValue(), '');
  assert.deepEqual(await ids(), ['chat']);
  assert.equal(await page.locator('#dialogue-layout').inputValue(), 'single');
  await page.locator('#dialogue-message').fill('只属于这次预览');
  await page.reload(); await page.locator('#enter-player').waitFor();
  assert.equal(await page.locator('#platform-root').getAttribute('data-page'), 'home');
  assert.equal(await page.locator('#platform-identity').textContent(), '尚未选择视角');
  await page.locator('#enter-player').click(); await nav('dialogue');
  assert.equal(await page.locator('#dialogue-message').inputValue(), '');
  assert.equal(await page.locator('.dialogue-message').count(), 5);
  check('首页切换DM/Player清空前一视角输入和标签，页面重开回公开示例且不假装恢复正式身份');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await choose('dm'); await shot('独立首页-上下文.png'); await nav('dialogue'); await layout('grid');
  await open('resource-characters'); await moveTo('resource-characters', 'pane-2');
  await open('map-overland'); await moveTo('map-overland', 'pane-3');
  await open('map-building'); await moveTo('map-building', 'pane-4');
  await shot('独立对话-四格预览.png');
  for (const name of ['maps', 'dialogue', 'battle']) assert.equal(await view(name).locator('[data-module-context]').textContent(), '未选择模组');
  assert.deepEqual(await inventory(isolated), filesBefore, '浏览和演示输入不能修改平台文件夹');
  assert.equal(requests.filter(request => request.method !== 'GET').length, 0);
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  check('演示输入/布局不写文件、不发业务请求；无外部请求或脚本错误，独立文件夹保持逐文件摘要一致');
  const health = await (await fetch(app.url + '/health')).json();
  assert.equal(health.pid, app.child.pid);
  assert.equal(health.rootKey, app.rootKey);
  check('全部浏览器路径实际运行于只有新平台文件夹的复制目录和独立子进程');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, screenshots, isolated, errors, outside, requests }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, directory, errors, outside }, null, 2));
} finally { await browser.close(); await app.close(); }

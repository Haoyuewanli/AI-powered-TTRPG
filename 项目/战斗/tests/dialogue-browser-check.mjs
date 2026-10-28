import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture } from './fixture.mjs';

const { chromium } = await import(pathToFileURL(process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../开发记录/临时/平台对话检查/', import.meta.url));
await mkdir(output, { recursive: true }); const directory = await mkdtemp(join(output, 'case-'));
const app = await startApp({ campaignDir: join(directory, '合成团'), modulesDir: join(directory, '合成模组'), port: 0, initial: fixture });
const browser = await chromium.launch({ executablePath: process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] }).catch(async error => { await app.close(); throw error; });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [], outside = [], requests = [], checks = [], screenshots = [];
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, method: request.method() }); });
});
await context.route('**/*', route => {
  const url = route.request().url(); if (/^(data:|about:)/.test(url) || new URL(url).origin === app.url) return route.continue();
  outside.push(url); return route.abort();
});
const page = await context.newPage();
const tab = id => page.locator(`[role="tab"][data-dialogue-tab="${id}"]`);
const pane = id => page.locator(`[data-dialogue-pane="${id}"]`);
const open = id => page.locator(`[data-dialogue-source="${id}"]`).click();
const tabIds = () => page.locator('[role="tab"][data-dialogue-tab]').evaluateAll(nodes => nodes.map(node => node.dataset.dialogueTab));
const orderIn = id => pane(id).locator('[role="tab"]').evaluateAll(nodes => nodes.map(node => node.dataset.dialogueTab));
const check = name => { checks.push(name); console.log(`PASS: ${name}`); };
const screenshotsAt = async filename => { const path = join(directory, filename); await page.screenshot({ path, fullPage: true }); screenshots.push(path); };
const navHome = () => page.locator('[data-platform-page="home"]').click();
const navDialogue = async () => { await page.locator('[data-platform-page="dialogue"]').click(); await page.locator('#dialogue-workspace').waitFor({ state: 'visible' }); };
const setLayout = async name => { await page.locator('#dialogue-layout').selectOption(name); assert.equal(await page.locator('#dialogue-workspace').getAttribute('data-dialogue-layout'), name); };
const near = (a, b, label) => assert(Math.abs(a - b) <= 2, `${label}: ${a} vs ${b}`);
async function activeInvariant() {
  const all = await tabIds(); assert.equal(new Set(all).size, all.length, '每个标签仅出现一次');
  for (const area of await page.locator('[data-dialogue-pane]').all()) {
    const tabs = await area.locator('[role="tab"]').count(), active = await area.locator('[role="tab"][aria-selected="true"]').count();
    assert.equal(active, tabs ? 1 : 0, '每区域恰有一个活跃标签，空区域没有活跃标签');
    if (tabs) {
      const id = await area.locator('[role="tab"][aria-selected="true"]').getAttribute('id');
      assert.equal(await area.locator('[role="tabpanel"]').getAttribute('aria-labelledby'), id);
    }
  }
}
async function readableToolbar() {
  const colors = await page.locator('.dialogue-field,.dialogue-field select').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color.match(/[\d.]+/g).slice(0, 3).map(Number)));
  assert(colors.length >= 2);
  assert(colors.every(color => Math.max(...color) < 150), '浅色对话工具栏需使用深色文字，不能继承战斗label的浅色');
}
async function fittedMaps() {
  const maps = await page.locator('.dialogue-map').evaluateAll(figures => figures.filter(figure => figure.getClientRects().length).map(figure => {
    const canvas = figure.querySelector('canvas'), caption = figure.querySelector('figcaption'), panel = figure.closest('.dialogue-panel');
    const image = canvas.getBoundingClientRect(), captionBox = caption.getBoundingClientRect(), panelBox = panel.getBoundingClientRect(), style = getComputedStyle(figure);
    return { imageHeight: image.height, availableHeight: panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - parseFloat(style.rowGap) - captionBox.height,
      imageBottom: image.bottom, panelBottom: panelBox.bottom, captionBottom: captionBox.bottom, fit: getComputedStyle(canvas).objectFit };
  }));
  for (const map of maps) {
    assert.equal(map.fit, 'contain');
    assert(map.imageHeight <= map.availableHeight + 2, `地图canvas应容纳在面板有效高度内：${JSON.stringify(map)}`);
    assert(map.imageBottom <= map.panelBottom + 2 && map.captionBottom <= map.panelBottom + 2, '完整地图与说明不能越过面板底部');
  }
  return maps.length;
}
async function moveTo(id, target) {
  const current = await tab(id).evaluate(node => node.closest('[data-dialogue-pane]').dataset.dialoguePane);
  if (current === target) return;
  await tab(id).click(); await pane(current).locator('.dialogue-destination').selectOption(target); await pane(current).locator('.dialogue-move').click();
  assert.equal(await tab(id).evaluate(node => node.closest('[data-dialogue-pane]').dataset.dialoguePane), target);
}
async function login(id = 'DM') {
  await page.goto(app.url); await page.waitForFunction(() => !document.getElementById('enter-dm').disabled);
  if (id === 'DM') await page.locator('#enter-dm').click();
  else { await page.locator('#identity').fill(id); await page.locator('#login-form button').click(); }
  await page.locator('#platform-current-session').waitFor({ state: 'visible' });
}
const raw = async (path, bearer, value) => {
  const response = await fetch(app.url + path, { method: value === undefined ? 'GET' : 'POST', headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  return { status: response.status, body: await response.json() };
};

try {
  await login(); const before = await readFile(app.store.path, 'utf8'); const requestStart = requests.length;
  await navDialogue();
  assert.equal(await page.locator('.dialogue-source').count(), 5);
  assert.equal(await page.locator('.dialogue-message').count(), 5);
  assert.deepEqual(await tabIds(), ['chat']);
  assert((await page.locator('.dialogue-status').textContent()).includes('未写入正式进度'));
  await readableToolbar();
  await page.getByRole('button', { name: '关闭冒险群聊 · 示例', exact: true }).click();
  assert.deepEqual(await tabIds(), []);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.dialogueSource), 'chat', '关闭区域最后标签后焦点返回左侧对应来源');
  await open('chat'); assert.equal(await page.locator('.dialogue-message').count(), 5);
  const ids = ['chat', 'resource-characters', 'resource-creatures', 'map-overland', 'map-building'];
  for (const id of ids) await open(id);
  for (const id of ids) await open(id);
  assert.equal(await tabIds().then(ids => ids.length), 5); await activeInvariant();
  await screenshotsAt('单屏-五个示例标签.png');
  check('左侧五种示例可打开，重复打开不创建副本，关闭最后标签后焦点回到来源');

  await open('chat');
  const message = '<img src=x onerror="window.dialogueInjected=1"> <script>window.dialogueInjected=2</script>';
  await page.locator('#dialogue-message').fill(message); await page.locator('#dialogue-chat-form button[type="submit"]').click();
  assert.equal(await page.locator('.dialogue-message').count(), 6);
  assert.equal(await page.locator('.dialogue-message').last().locator('p').textContent(), message);
  assert.equal(await page.locator('.dialogue-messages img,.dialogue-messages script').count(), 0);
  assert.equal(await page.evaluate(() => window.dialogueInjected), undefined);
  const draft = 'DIALOGUE_DRAFT_CANARY 未发送的文字'; await page.locator('#dialogue-message').fill(draft);
  await setLayout('rows'); await setLayout('grid'); await setLayout('single');
  await open('chat'); assert.equal(await page.locator('#dialogue-message').inputValue(), draft); assert.equal(await page.locator('.dialogue-message').count(), 6);
  await page.getByRole('button', { name: '关闭冒险群聊 · 示例', exact: true }).click();
  assert.equal(await tab('chat').count(), 0); await open('chat');
  assert.equal(await page.locator('#dialogue-message').inputValue(), draft); assert.equal(await page.locator('.dialogue-message').count(), 6);
  check('示例消息按纯文本展示；切布局及关闭重开标签保留消息和未发送草稿');

  const startOrder = await orderIn('pane-1'); const chatIndex = startOrder.indexOf('chat');
  if (chatIndex > 0) {
    await pane('pane-1').getByRole('button', { name: '区域 1当前标签前移', exact: true }).click();
    assert.equal((await orderIn('pane-1')).indexOf('chat'), chatIndex - 1);
    await pane('pane-1').getByRole('button', { name: '区域 1当前标签后移', exact: true }).click();
    assert.deepEqual(await orderIn('pane-1'), startOrder);
  } else {
    await pane('pane-1').getByRole('button', { name: '区域 1当前标签后移', exact: true }).click();
    assert.equal((await orderIn('pane-1')).indexOf('chat'), 1);
    await pane('pane-1').getByRole('button', { name: '区域 1当前标签前移', exact: true }).click();
    assert.deepEqual(await orderIn('pane-1'), startOrder);
  }
  const dragSource = startOrder.at(-1), dragTarget = startOrder[0];
  await tab(dragSource).dragTo(tab(dragTarget));
  const movedOrder = await orderIn('pane-1'); assert.equal(movedOrder[0], dragSource); assert.notDeepEqual(movedOrder, startOrder);
  await activeInvariant();
  check('前移/后移替代操作和真实dragTo可改变同一区域标签顺序');

  await setLayout('grid');
  await tab('resource-characters').dragTo(pane('pane-2'), { targetPosition: { x: 65, y: 65 } });
  assert.equal(await tab('resource-characters').evaluate(node => node.closest('[data-dialogue-pane]').dataset.dialoguePane), 'pane-2');
  await tab('chat').dragTo(pane('pane-3'), { targetPosition: { x: 65, y: 65 } });
  assert.equal(await tab('chat').evaluate(node => node.closest('[data-dialogue-pane]').dataset.dialoguePane), 'pane-3');
  await moveTo('map-overland', 'pane-4'); await activeInvariant();
  await open('chat'); assert.equal(await tabIds().then(ids => ids.length), 5);
  assert.equal(await page.locator('#dialogue-region').inputValue(), 'pane-3');
  assert.equal(await page.locator('#dialogue-message').inputValue(), draft);
  check('真实拖动可跨区域移动标签，选择目标区域按钮也可移动，重复打开保留原区域');

  for (const [layout, count] of [['single', 1], ['columns', 2], ['rows', 2], ['grid', 4], ['left-stack', 3], ['right-stack', 3]]) {
    await setLayout(layout); await activeInvariant();
    const areas = await page.locator('[data-dialogue-pane]').all(); assert.equal(areas.length, count);
    const boxes = await Promise.all(areas.map(area => area.boundingBox())); assert(boxes.every(Boolean));
    if (layout === 'columns') { assert(boxes[0].x < boxes[1].x); near(boxes[0].y, boxes[1].y, '左右分屏顶边'); near(boxes[0].height, boxes[1].height, '左右分屏高度'); }
    if (layout === 'rows') { assert(boxes[0].y < boxes[1].y); near(boxes[0].x, boxes[1].x, '上下分屏左边'); near(boxes[0].width, boxes[1].width, '上下分屏宽度'); }
    if (layout === 'grid') { assert(boxes[0].x < boxes[1].x && boxes[0].y < boxes[2].y); near(boxes[0].y, boxes[1].y, '四方格上边'); near(boxes[0].x, boxes[2].x, '四方格左边'); near(boxes[1].x, boxes[3].x, '四方格右边'); near(boxes[2].y, boxes[3].y, '四方格下边'); }
    if (layout === 'left-stack') { near(boxes[0].x, boxes[1].x, '左二左边'); assert(boxes[0].y < boxes[1].y && boxes[2].x > boxes[0].x); near(boxes[0].y, boxes[2].y, '右一顶边'); assert(boxes[2].height > boxes[0].height * 1.8); }
    if (layout === 'right-stack') { near(boxes[1].x, boxes[2].x, '右二左边'); assert(boxes[1].y < boxes[2].y && boxes[1].x > boxes[0].x); near(boxes[0].y, boxes[1].y, '左一顶边'); assert(boxes[0].height > boxes[1].height * 1.8); }
    assert.equal(await tabIds().then(ids => ids.length), 5, '六种布局切换不丢标签');
    await readableToolbar(); await fittedMaps();
  }
  await setLayout('grid');
  await moveTo('chat', 'pane-1'); await moveTo('resource-characters', 'pane-2'); await moveTo('map-overland', 'pane-3'); await moveTo('map-building', 'pane-4');
  assert.equal(await fittedMaps(), 2, '四格中的两张完整地图都需可见');
  await screenshotsAt('四方格-群聊资料地图.png'); await setLayout('left-stack'); await screenshotsAt('左二右一-群聊资料地图.png'); await setLayout('right-stack'); await screenshotsAt('左一右二-群聊资料地图.png');
  check('单屏、左右、上下、四方格、左二右一和左一右二六种布局具有正确几何关系');

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport); assert(await page.locator('#dialogue-region').isVisible());
    const count = await page.locator('#dialogue-region option').count(); assert.equal(count, 3);
    for (let index = 1; index <= count; index++) {
      await page.locator('#dialogue-region').selectOption(`pane-${index}`);
      assert.equal(await page.locator('[data-dialogue-pane]:visible').count(), 1);
      assert(await pane(`pane-${index}`).isVisible());
      const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert(size.document <= size.viewport + 1, `${viewport.width}窄屏无整页横向溢出`);
      await readableToolbar(); await fittedMaps();
    }
    await page.locator('#dialogue-region').selectOption('pane-1'); await open('chat');
    assert.equal(await page.locator('#dialogue-message').inputValue(), draft); await screenshotsAt(`对话-${viewport.width}x${viewport.height}.png`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.dialogue-source').first().evaluate(node => getComputedStyle(node).transitionDuration), '0s');
  assert.equal(await readFile(app.store.path, 'utf8'), before);
  assert.deepEqual(requests.slice(requestStart).filter(request => request.method === 'POST'), [], '示例聊天及布局不发业务POST');
  check('390/320窄屏可逐区域查看且保留草稿，减少动态可用；全部浏览编辑未写战斗文件或发POST');

  await navHome(); await page.locator('#platform-switch-identity').click(); await page.locator('#identity').waitFor({ state: 'visible' });
  await page.locator('#identity').fill('player-1'); await page.locator('#login-form button').click(); await page.locator('#platform-current-session').waitFor({ state: 'visible' });
  await navDialogue(); assert.equal(await page.locator('#dialogue-message').inputValue(), '');
  assert.equal(await page.locator('.dialogue-message').count(), 5); assert.deepEqual(await tabIds(), ['chat']);
  assert(!(await page.locator('#dialogue-workspace').textContent()).includes(message));
  assert.equal(await page.locator('#dialogue-layout').inputValue(), 'single');
  check('首页换身份后清空上一身份的消息、草稿、标签及布局，恢复公开示例');

  await navHome(); await page.locator('#platform-switch-identity').click(); await page.locator('#enter-dm').waitFor({ state: 'visible' }); await page.locator('#enter-dm').click();
  await page.locator('#platform-current-session').waitFor({ state: 'visible' }); await navDialogue();
  await page.locator('#dialogue-message').fill('CAMPAIGN_DRAFT_CANARY');
  const auth = await raw('/api/login', null, { id: 'DM' }); assert.equal(auth.status, 200);
  const next = await raw('/api/campaigns', auth.body.token, { name: '切换后的合成团', copyCurrent: true }); assert.equal(next.status, 200);
  const newFile = await readFile(app.store.path, 'utf8');
  await page.waitForFunction(() => document.getElementById('platform-campaign-name').textContent === '切换后的合成团', null, { timeout: 15000 });
  assert.equal(await page.locator('#dialogue-message').inputValue(), ''); assert.equal(await page.locator('.dialogue-message').count(), 5); assert.deepEqual(await tabIds(), ['chat']);
  assert.equal(await readFile(app.store.path, 'utf8'), newFile);
  assert.deepEqual(requests.filter(request => request.method === 'POST' && !['/api/login', '/api/logout'].includes(request.path)), [], '对话不调用机械或资料写接口');
  check('当前团改变后清除旧团示例输入，不串团且不改变新场正式文件');

  await page.setViewportSize({ width: 1920, height: 1080 }); await page.emulateMedia({ reducedMotion: 'no-preference' });
  await setLayout('grid'); await open('resource-characters'); await moveTo('resource-characters', 'pane-2');
  await open('map-overland'); await moveTo('map-overland', 'pane-3'); await open('map-building'); await moveTo('map-building', 'pane-4');
  await activeInvariant(); assert.equal(await fittedMaps(), 2); await readableToolbar();
  assert.equal(await page.locator('#dialogue-message').inputValue(), '');
  assert.equal(await page.locator('.dialogue-message').count(), 5);
  const previewText = await page.locator('#dialogue-workspace').textContent();
  assert(!previewText.includes('CANARY') && !previewText.includes('<script>') && !previewText.includes('<img'));
  await screenshotsAt('对话-四格预览.png'); assert.equal(await readFile(app.store.path, 'utf8'), newFile);

  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, screenshots, pageErrors: errors, outsideRequests: outside }, null, 2) + '\n');
  console.log(`PASS: ${checks.length} groups; output ${directory}`);
} catch (error) {
  await page.screenshot({ path: join(directory, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(join(directory, 'failure.json'), JSON.stringify({ error: error.stack, checks, pageErrors: errors, outsideRequests: outside }, null, 2) + '\n');
  throw error;
} finally { await context.close(); await browser.close(); await app.close(); }

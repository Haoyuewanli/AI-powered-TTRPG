import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { startPreview } from './serve.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(directory, '../../..');
const outputRoot = join(workspace, '开发记录/临时/地图窗口预览');
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'check-'));
const source = join(workspace, '项目/模组/预处理/多人短团/风骸岛之龙/故事/原始资料/原文.md');
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const sourceBefore = await hash(source);
const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const app = await startPreview();
const checks = [], errors = [], outside = [];
let browser;
const note = message => { checks.push(message); console.log('通过：' + message); };
try {
  browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^(data:|blob:|about:)/.test(url) || new URL(url).hostname === '127.0.0.1') return route.continue();
    outside.push(url); return route.abort();
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  await page.goto(app.url); await page.waitForFunction(() => window.mapPreview?.ready);
  const data = await page.evaluate(() => window.mapPreview.getModule());
  const state = () => page.evaluate(() => window.mapPreview.getDocument());
  const main = data.nodes.find(n => !n.parentId), caves = data.nodes.find(n => /海藻洞穴/.test(n.name));
  const b1 = data.nodes.find(n => /^B1\s*入口隧道/.test(n.name)), b6 = data.nodes.find(n => /^B6/.test(n.name));
  assert(main && caves && b1 && b6);
  assert.equal(await page.locator('[data-focus-node]').count(), data.nodes.length);
  assert.equal(new Set(data.nodes.map(n => n.id)).size, data.nodes.length);
  assert.equal(await page.locator('.share-panel').count(), data.nodes.filter(n => n.kind === 'image').length);
  assert.equal(await page.locator('.description-panel').count(), data.nodes.length);
  assert.equal(await page.locator('.sensory-panel').count(), data.nodes.length);
  await page.waitForFunction(() => [...document.querySelectorAll('.map-image-wrap>img')].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(await page.locator('#directory .share-panel,#directory .description-panel').count(), 0);
  note('真实地图与末级文本地图同屏；右栏只有唯一地图树，每张图的信息框类型正确');

  const focus = async id => { await page.evaluate(value => window.mapPreview.focusNode(value), id); };
  const xy = async (point) => page.evaluate(value => {
    const camera = window.mapPreview.getDocument().camera, box = document.getElementById('viewport').getBoundingClientRect();
    return { x: box.left + camera.x + value.x * camera.zoom, y: box.top + camera.y + value.y * camera.zoom };
  }, point);
  const clickWorld = async point => { const p = await xy(point); await page.mouse.click(p.x, p.y); };
  const dragWorld = async (a, b) => { const start = await xy(a), end = await xy(b); await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up(); };
  let hotspotCount = 0;
  for (const node of data.nodes.filter(n => n.kind === 'image')) for (const [index, hotspot] of (node.hotspots || []).entries()) {
    assert(data.nodes.some(n => n.id === hotspot.targetId));
    assert(hotspot.x >= 0 && hotspot.x <= 1 && hotspot.y >= 0 && hotspot.y <= 1);
    await focus(node.id);
    const marker = page.locator(`[data-node-id="${node.id}"] [data-hotspot-index="${index}"]`);
    await marker.click();
    assert.equal(await page.locator('#selection-name').inputValue(), data.nodes.find(n => n.id === hotspot.targetId).name);
    hotspotCount++;
  }
  assert(hotspotCount >= 25); note(`${hotspotCount}个原图标注逐个用鼠标点击，均聚焦到对应地图或区域`);

  await focus(main.id);
  let current = await state(), root = current.nodes.find(n => n.id === main.id);
  const inside = { x: root.x + root.w * .25, y: root.y + root.h * .3 };
  await page.locator('[data-tool=rect]').click(); await dragWorld(inside, { x: inside.x + 150, y: inside.y + 85 });
  let shape = (await state()).objects.at(-1); assert.equal(shape.type, 'rect'); assert(shape.w >= 16);
  await page.locator('#outline-only').check(); assert.equal((await state()).objects.at(-1).fill, 'transparent');
  await page.locator('[data-tool=ellipse]').click();
  await dragWorld({ x: inside.x + 180, y: inside.y }, { x: inside.x + 280, y: inside.y + 70 });
  assert.equal((await state()).objects.at(-1).type, 'ellipse'); assert.equal((await state()).objects.at(-1).fill, 'transparent');
  await page.locator('#object-color').evaluate(input => { input.value = '#bd574f'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal((await state()).objects.at(-1).color, '#bd574f');
  await page.locator('[data-tool=text]').click(); await clickWorld({ x: inside.x, y: inside.y + 120 });
  await page.locator('#object-text').fill('营地 · 集合处'); await page.locator('#object-text').press('Tab');
  assert.equal((await state()).objects.at(-1).text, '营地 · 集合处');
  note('矩形、椭圆、空心边框与文本可绘制、选中、改色、编辑');

  await page.locator('[data-tool=player]').click(); await clickWorld({ x: root.x + root.w * .65, y: root.y + root.h * .7 });
  assert.equal((await state()).objects.at(-1).name, 'Player');
  await page.locator('#selection-name').fill('Aster'); await page.locator('#selection-name').press('Tab');
  await page.locator('[data-tool=player]').click(); await clickWorld({ x: root.x + root.w * .8, y: root.y + root.h * .7 });
  await page.locator('#selection-name').fill('Aster'); await page.locator('#selection-name').press('Tab');
  const markers = (await state()).objects.filter(n => n.type === 'player');
  assert.equal(markers.length, 2); assert.equal(markers[0].name, markers[1].name); assert.notEqual(markers[0].id, markers[1].id);
  await page.locator(`[data-object-id="${markers[1].id}"]`).dblclick();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'selection-name');
  const markerBox = await page.locator(`[data-object-id="${markers[1].id}"]`).boundingBox();
  const labelBox = await page.locator(`[data-object-id="${markers[1].id}"] .player-name`).boundingBox();
  assert(labelBox.y + labelBox.height < markerBox.y);
  const markerColor = await page.locator(`[data-object-id="${markers[1].id}"] .player-marker`).evaluate(node => getComputedStyle(node).backgroundColor);
  assert.notEqual(markerColor, 'rgba(0, 0, 0, 0)');
  note('玩家标记默认Player，名字位于上方，两枚同名标记可独立保存且颜色可见');

  await page.locator('[data-tool=arrow]').click();
  await clickWorld({ x: root.x, y: root.y }); await clickWorld({ x: root.x + root.w, y: root.y + root.h });
  let arrow = (await state()).objects.at(-1); assert.equal(arrow.type, 'arrow');
  assert.deepEqual(arrow.a, { nodeId: main.id, anchor: 'nw' }); assert.deepEqual(arrow.b, { nodeId: main.id, anchor: 'se' });
  await page.locator('[data-tool=select]').click();
  await dragWorld({ x: root.x + root.w / 2, y: root.y + 16 }, { x: root.x + root.w / 2 + 35, y: root.y + 46 });
  const moved = (await state()).nodes.find(n => n.id === main.id);
  assert(Math.abs(moved.x - root.x - 35) < 2); assert(Math.abs(moved.y - root.y - 30) < 2);
  const renderedArrow = await page.locator(`[data-arrow-id="${arrow.id}"]`).evaluate(line => ({ x1: Number(line.getAttribute('x1')), y1: Number(line.getAttribute('y1')) }));
  assert.equal(renderedArrow.x1, moved.x); assert.equal(renderedArrow.y1, moved.y);
  await page.locator('#undo').click(); assert(Math.abs((await state()).nodes.find(n => n.id === main.id).x - root.x) < .01);
  await page.locator('#redo').click();
  note('箭头两端分别吸附四角；地图移动后端点与目录连接线跟随，撤销重做保持引用');
  await clickWorld({ x: moved.x + moved.w / 2, y: moved.y + moved.h / 2 });
  await page.locator('#bring-front').click();
  assert.equal((await state()).objects.at(-1).id, arrow.id);
  const topLayer = await page.locator(`[data-arrow-id="${arrow.id}"]`).evaluate(node => Number(node.parentElement.style.zIndex));
  assert.equal(topLayer, (await state()).objects.length - 1);

  await page.locator('#canvas-color').evaluate(input => { input.value = '#e9e3d7'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#grid-mode').selectOption('grid');
  await page.locator('#grid-size').evaluate(input => { input.value = '65'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#grid-color').evaluate(input => { input.value = '#a6b2be'; input.dispatchEvent(new Event('change', { bubbles: true })); });
  const cameraBefore = (await state()).camera.zoom; await page.locator('#zoom-in').click(); assert((await state()).camera.zoom > cameraBefore);
  const configured = (await state()).settings; assert.equal(configured.gridSize, 65); assert.equal(configured.grid, 'grid');
  await page.locator('#undo').click(); assert.equal(await page.locator('#grid-color').inputValue(), (await state()).settings.gridColor);
  await page.locator('#redo').click();
  note('背景、网格类型/尺寸/颜色与缩放可编辑，撤销后控件和画布同步');

  await focus(caves.id);
  const caveCard = page.locator(`[data-node-id="${caves.id}"]`);
  await caveCard.locator('.description-panel>summary').click();
  assert((await caveCard.locator('.description-panel').textContent()).length > 40);
  await caveCard.locator('.description-panel button').click();
  await caveCard.locator('.source-excerpt').waitFor(); assert((await caveCard.locator('.source-excerpt').textContent()).length > 10);
  await caveCard.locator('.sensory-panel>summary').click(); assert((await caveCard.locator('.sensory-panel').textContent()).includes('主持提词'));
  await caveCard.locator('.description-panel>summary').click(); await caveCard.locator('.sensory-panel>summary').click();
  await caveCard.locator('.share-panel>summary').click();
  const playerId = data.players[0].id;
  const request = page.waitForResponse(response => response.url() === app.url + '/api/shares' && response.request().method() === 'POST');
  await caveCard.locator(`.share-panel input[value="${playerId}"]`).check(); await request;
  await page.waitForFunction(() => document.querySelectorAll('#shares-summary a').length > 0);
  const link = page.locator('#shares-summary a').filter({ hasText: data.players[0].name });
  const playerUrl = await link.getAttribute('href');
  const playerPage = await context.newPage(); await playerPage.goto(playerUrl);
  await playerPage.waitForFunction(() => document.images.length > 0 && [...document.images].every(img => img.complete && img.naturalWidth > 0));
  assert.equal(await playerPage.locator('img').count(), 1);
  assert.equal(await playerPage.locator('#directory,.map-node,textarea,.player-name,.description-panel').count(), 0);
  const playerOrigin = new URL(playerUrl).origin;
  for (const path of ['/api/module', '/api/source?node=' + caves.id, '/app.mjs', '/data.mjs']) assert.equal((await fetch(playerOrigin + path)).status, 404);
  note('基础描述可定位原文，移步换景独立展示；获准玩家在独立入口只收到一张图片，DM资料接口无法访问');
  const oldImageUrl = new URL(await playerPage.locator('img').getAttribute('src'), playerOrigin).href;
  const revokeResponse = page.waitForResponse(response => response.url() === app.url + '/api/shares' && response.request().method() === 'POST');
  await caveCard.locator(`.share-panel input[value="${playerId}"]`).uncheck(); await revokeResponse;
  await playerPage.waitForFunction(() => document.images.length === 0);
  assert.equal((await fetch(oldImageUrl)).status, 404);
  const restoreShareResponse = page.waitForResponse(response => response.url() === app.url + '/api/shares' && response.request().method() === 'POST');
  await caveCard.locator(`.share-panel input[value="${playerId}"]`).check(); await restoreShareResponse;
  await playerPage.waitForFunction(() => document.images.length === 1 && document.images[0].complete);
  note('撤回共享后旧图片链接失效，已打开玩家页面自动移除图片；重新授权可恢复');

  const downloadPromise = page.waitForEvent('download'); await page.locator('#save').click(); const download = await downloadPromise;
  const savePath = join(output, 'saved-canvas.json'); await download.saveAs(savePath);
  const saved = JSON.parse(await readFile(savePath, 'utf8'));
  assert.equal(saved.objects.filter(n => n.type === 'player').length, 2);
  const restored = await context.newPage(); await restored.goto(app.url); await restored.waitForFunction(() => window.mapPreview?.ready);
  await restored.locator('#import-file').setInputFiles(savePath);
  await restored.waitForFunction(() => window.mapPreview.getDocument().objects.filter(n => n.type === 'player').length === 2);
  assert.deepEqual(await restored.evaluate(() => window.mapPreview.getDocument()), saved);
  const invalid = structuredClone(saved); invalid.nodes[0].x = 'invalid';
  await restored.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await restored.waitForFunction(() => document.getElementById('status').textContent.startsWith('未载入'));
  assert.deepEqual(await restored.evaluate(() => window.mapPreview.getDocument()), saved);
  note('下载画布后在新页面载入，布局/对象/共享/视角完整恢复；坏文件不覆盖现有草稿');

  for (const [width, height] of [[1920, 1080], [1280, 800], [1024, 768], [600, 800]]) {
    await restored.setViewportSize({ width, height }); await restored.evaluate(() => window.mapPreview.focusNode(window.mapPreview.getModule().nodes[0].id));
    const layout = await restored.evaluate(() => {
      const viewport = document.getElementById('viewport').getBoundingClientRect(), directory = document.getElementById('directory').getBoundingClientRect();
      return { client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, vw: viewport.width, vh: viewport.height, dr: directory.right };
    });
    assert.equal(layout.client, layout.scroll); assert(layout.vw > 150 && layout.vh > 170); assert(layout.dr <= width + 1);
    if (width === 1024) {
      await restored.locator('#read-map').click();
      assert.equal(await restored.locator('#map-reader').evaluate(node => Number.parseFloat(getComputedStyle(node.querySelector('.reader-content p')).fontSize)), 15);
      await restored.locator('#map-reader button').click();
    }
    await restored.screenshot({ path: join(output, `viewport-${width}.png`) });
  }
  await restored.setViewportSize({ width: 1600, height: 1000 }); await restored.locator('#fit-all').click();
  await restored.screenshot({ path: join(output, 'all-maps.png') });
  await restored.evaluate(id => window.mapPreview.focusNode(id), caves.id);
  await restored.locator(`[data-node-id="${caves.id}"] .reader-button`).click();
  await restored.locator('#map-reader[open]').waitFor();
  assert((await restored.locator('#map-reader').textContent()).includes('移步换景'));
  await restored.locator('#map-reader button').click();
  await restored.locator(`[data-node-id="${caves.id}"] .description-panel>summary`).click();
  await restored.locator(`[data-node-id="${caves.id}"] .sensory-panel>summary`).click();
  await restored.screenshot({ path: join(output, 'caves-detail.png') });
  note('1920/1280/1024/600四种窗口下画布与目录可达，无整页横向溢出');
  assert.equal(await hash(source), sourceBefore); assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  note('原文摘要保持，浏览器无脚本错误、无外网请求');
  await writeFile(join(output, 'results.json'), JSON.stringify({ checks, errors, outside, hotspotCount, sourceUnchanged: true }, null, 2));
  console.log('检查输出：' + output);
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, checks, errors, outside }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  await app.close();
}

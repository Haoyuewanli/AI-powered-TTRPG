import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const input = resolve(process.argv[2] || join(workspace, '项目/资源/地图/F/风骸岛地图-完整版.html'));
const root = join(workspace, '开发记录/临时/地图窗口预览');
await mkdir(root, { recursive: true });
const output = await mkdtemp(join(root, 'offline-'));
const isolated = join(output, '地图.html');
await copyFile(input, isolated);
const fileUrl = pathToFileURL(isolated).href;
const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const checks = [], errors = [], outside = [], csp = [];
const note = message => { checks.push(message); console.log('通过：' + message); };
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === fileUrl || /^(data:|blob:|about:)/.test(url)) return route.continue();
    outside.push(url.slice(0, 200)); return route.abort();
  });
  await context.addInitScript(() => {
    window.cspFailures = [];
    document.addEventListener('securitypolicyviolation', event => window.cspFailures.push(event.violatedDirective));
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const open = async target => { await target.goto(fileUrl); await target.waitForFunction(() => window.mapPreview?.ready); };
  await open(page);
  const data = await page.evaluate(() => window.__MAP_OFFLINE__.moduleData.nodes.map(({ id, name, kind, parentId, hotspots }) => ({ id, name, kind, parentId, hotspots })));
  assert.equal(data.length, 32); assert.equal(new Set(data.map(n => n.id)).size, 32);
  assert.equal(await page.locator('[data-focus-node]').count(), 32);
  assert.equal(await page.locator('.description-panel').count(), 32);
  assert.equal(await page.locator('.sensory-panel').count(), 32);
  await page.waitForFunction(() => [...document.querySelectorAll('.map-image-wrap>img')].every(img => img.complete && img.naturalWidth));
  assert.equal(await page.locator('.map-image-wrap>img').count(), 6);
  const images = await page.evaluate(async () => {
    const urls = Object.values(JSON.parse(document.getElementById('map-offline-data').textContent).assets);
    await Promise.all(urls.map(async url => { const img = new Image(); img.src = url; await img.decode(); }));
    return urls.length;
  });
  assert.equal(images, 12);
  note('隔离目录直接以file://打开，32地点、6图片地图及12内嵌图片版本全部正常');
  const focus = id => page.evaluate(value => window.mapPreview.focusNode(value), id);
  let hotspots = 0;
  for (const node of data) for (const [index, hotspot] of (node.hotspots || []).entries()) {
    await focus(node.id);
    await page.locator(`[data-node-id="${node.id}"] [data-hotspot-index="${index}"]`).click();
    assert.equal(await page.locator('#selection-name').inputValue(), data.find(n => n.id === hotspot.targetId).name);
    hotspots++;
  }
  assert.equal(hotspots, 60); note('60个地图热点逐个点击，均跳转到对应地点');
  const main = data.find(n => !n.parentId), caves = data.find(n => /海藻洞穴/.test(n.name));
  await focus(main.id);
  const state = () => page.evaluate(() => window.mapPreview.getDocument());
  const node = (await state()).nodes.find(n => n.id === main.id);
  const click = async point => {
    const xy = await page.evaluate(p => {
      const camera = window.mapPreview.getDocument().camera, box = document.getElementById('viewport').getBoundingClientRect();
      return { x: box.left + camera.x + p.x * camera.zoom, y: box.top + camera.y + p.y * camera.zoom };
    }, point);
    await page.mouse.click(xy.x, xy.y);
  };
  await page.locator('[data-tool=player]').click(); await click({ x: node.x + node.w * .5, y: node.y + node.h * .5 });
  assert.equal((await state()).objects.at(-1).name, 'Player');
  await page.locator('#selection-name').fill('离线测试'); await page.locator('#selection-name').press('Tab');
  assert.equal((await state()).objects.at(-1).name, '离线测试');
  await page.locator('[data-tool=arrow]').click(); await click({ x: node.x, y: node.y }); await click({ x: node.x + node.w, y: node.y + node.h });
  const arrow = (await state()).objects.at(-1);
  assert.equal(arrow.type, 'arrow'); assert.deepEqual(arrow.a, { nodeId: main.id, anchor: 'nw' }); assert.deepEqual(arrow.b, { nodeId: main.id, anchor: 'se' });
  await page.locator('#undo').click(); assert.equal((await state()).objects.length, 1);
  await page.locator('#redo').click(); assert.equal((await state()).objects.length, 2);
  note('离线放置Player、重命名、箭头两端吸附和撤销重做可用');
  await focus(caves.id);
  const card = page.locator(`[data-node-id="${caves.id}"]`);
  await card.locator('.description-panel>summary').click(); await card.locator('.description-panel button').click();
  assert((await card.locator('.source-excerpt').textContent()).length > 20);
  assert.equal(await page.locator('.share-panel button:disabled').count(), 6);
  assert.equal(await page.locator('.share-panel input,.share-panel select,#shares-summary a').count(), 0);
  note('原文片段离线读取，所有共享按钮为禁用占位');
  const pending = page.waitForEvent('download'); await page.locator('#save').click(); const download = await pending;
  const savedPath = join(output, 'canvas.json'); await download.saveAs(savedPath);
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  const restored = await context.newPage(); await open(restored);
  await restored.locator('#import-file').setInputFiles(savedPath);
  await restored.waitForFunction(() => window.mapPreview.getDocument().objects.length === 2);
  assert.deepEqual(await restored.evaluate(() => window.mapPreview.getDocument()), saved);
  const invalid = structuredClone(saved); invalid.nodes[0].x = 'invalid';
  await restored.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await restored.waitForFunction(() => document.getElementById('status').textContent.startsWith('未载入'));
  assert.deepEqual(await restored.evaluate(() => window.mapPreview.getDocument()), saved);
  note('画布JSON可下载并在新打开的离线HTML恢复，坏文件保留原画布');
  for (const [width, height] of [[1600, 1000], [1024, 768]]) {
    await restored.setViewportSize({ width, height }); await restored.evaluate(id => window.mapPreview.focusNode(id), caves.id);
    assert(await restored.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
    await restored.screenshot({ path: join(output, `offline-${width}.png`) });
  }
  await restored.locator('#fit-all').click(); await restored.screenshot({ path: join(output, 'all-maps.png') });
  for (const target of [page, restored]) csp.push(...await target.evaluate(() => window.cspFailures));
  assert.deepEqual(errors, []); assert.deepEqual(outside, []); assert.deepEqual(csp, []);
  note('两种窗口尺寸无横向溢出，无脚本/CSP错误，无网络或相邻文件请求');
  await writeFile(join(output, 'results.json'), JSON.stringify({ input, checks, errors, outside, csp, hotspots }, null, 2));
  console.log('检查输出：' + output);
} catch (error) {
  await writeFile(join(output, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, checks, errors, outside, csp }, null, 2));
  throw error;
} finally { await browser.close(); }

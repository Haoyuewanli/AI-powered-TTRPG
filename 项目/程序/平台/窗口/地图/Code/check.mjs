import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createMapLibraryApi } from '../../../Code/map-library-api.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, '../../../../../..');
const workbench = join(workspace, '项目/预处理/1. 处理地图/Code/工作台');
const output = join(workspace, '开发记录/临时/地图正式整合'); await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'check-'));
const runtime = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(runtime));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const packages = ['a', 'b'].map(id => ({ moduleId: id, title: '合成模组' + id, moduleData: { id, title: '合成模组' + id, capabilities: { sharing: false }, players: [], nodes: [{ id: id + '-root', parentId: null, name: '根地图' + id, kind: 'image', width: 200, height: 160, imageUrl: '/assets/map', variants: [{ id: 'dm', label: '原图', url: '/assets/map' }], description: '合成原文描述', sensory: '有依据的合成提词', hotspots: [{ x: .5, y: .5, targetId: id + '-room', label: 'R1' }] }, { id: id + '-room', parentId: id + '-root', name: 'R1 房间' + id, kind: 'text', description: '房间描述', sensory: '房间提词', variants: [], hotspots: [] }] }, assets: { '/assets/map': { path: '图片/map.png' } }, sources: {} }));
const project = join(directory, '项目');
for (const pack of packages) {
  const folder = join(project, '模组', pack.moduleId); await mkdir(join(folder, '地图/图片'), { recursive: true });
  await writeFile(join(folder, '模组.json'), JSON.stringify({ id: pack.moduleId, name: pack.title }));
  await writeFile(join(folder, '地图/地图包.json'), JSON.stringify({ schemaVersion: 1, moduleData: pack.moduleData, assets: pack.assets, sources: pack.sources }));
  await writeFile(join(folder, '地图/图片/map.png'), Buffer.from(png, 'base64'));
}
await mkdir(join(project, '模组/a/游玩团/run-a'), { recursive: true });
await writeFile(join(project, '模组/a/游玩团/run-a/团.json'), JSON.stringify({ id: 'run-a', moduleId: 'a', name: '合成团', characters: [] }));
const mapApi = createMapLibraryApi({ root: project, authorize: () => ({ role: 'dm' }) });
const saved = path => readFile(join(project, path), 'utf8').then(JSON.parse);
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/map-editor/map-workspace.css"><style>html,body{height:100%;margin:0}#platform-covers{height:100%;--paper:#fafbf9;--ink:#30434b;--quiet:#74838a;--shadow:#82949d}#maps{height:100%;box-sizing:border-box;padding:8px}</style><div id="platform-covers"><section id="maps" data-platform-view="maps"></section></div><script type="module">import {createMapWorkspace} from '/map-editor/map-workspace.mjs';window.context={moduleId:'a',runId:'run-a'};window.mapWorkspace=createMapWorkspace({platform:{root:document.getElementById('platform-covers'),role:'dm'},getContext:()=>context,api:async(path,body)=>{const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw new Error(value.error);return value;}});await mapWorkspace.load();</script>`;
const files = new Map([...['index.html', 'bootstrap.mjs', 'editor.css', 'map-workspace.mjs', 'map-workspace.css'].map(name => ['/map-editor/' + name, join(here, name)]), ...['index.html', 'app.mjs', 'style.css', 'model.mjs'].map(name => ['/map-workbench/' + name, join(workbench, name)])]);
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
  try {
    if (url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(html); return; }
    if (files.has(url.pathname)) { response.writeHead(200, { 'content-type': url.pathname.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' }); response.end(await readFile(files.get(url.pathname))); return; }
    if (await mapApi.handle(request, url, send)) return;
    if (url.pathname === '/test/conflict') { const path = '模组/a/游玩团/run-a/画布.json', value = await saved(path); value.revision++; await writeFile(join(project, path), JSON.stringify(value)); return send(200, value); }
    send(404, { error: 'Not found' });
  } catch (error) { send(500, { error: error.message }); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
let browser; const checks = [], errors = [], outside = [];
const note = text => { checks.push(text); console.log('通过：' + text); };
try {
  browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.route('**/*', route => { const target = route.request().url(); if (target.startsWith(url) || /^(data:|blob:|about:)/.test(target)) return route.continue(); outside.push(target); return route.abort(); });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.goto(url);
  const frame = () => page.frameLocator('[data-map-editor]');
  const ready = async () => { await frame().locator('#viewport').waitFor(); await page.waitForFunction(() => document.querySelector('[data-map-editor]')?.contentWindow.mapPreview?.ready); };
  await ready();
  assert.equal(await frame().locator('[data-focus-node]').count(), 2); assert.equal(await frame().locator('.share-panel input').count(), 0);
  await frame().locator('[data-focus-node="a-root"]').click(); await frame().locator('[data-hotspot-index="0"]').click();
  assert.equal(await frame().locator('#selection-name').inputValue(), 'R1 房间a'); note('正式容器复用完整工作台，目录/热点跳转和共享占位可用');
  async function marker(name) {
    await frame().locator('[data-tool=player]').click();
    const box = await frame().locator('#viewport').boundingBox(); await page.mouse.click(box.x + box.width * .5, box.y + box.height * .5);
    await frame().locator('#selection-name').fill(name); await frame().locator('#selection-name').press('Tab');
  }
  const doc = () => page.evaluate(() => document.querySelector('[data-map-editor]').contentWindow.mapPreview.getDocument());
  await marker('甲团标记'); assert.equal(await page.evaluate(() => mapWorkspace.canLeave()), false);
  await frame().locator('#viewport').focus(); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); assert.equal((await doc()).objects.length, 0);
  await page.keyboard.press('Control+y'); await page.keyboard.press('Control+y'); assert.equal((await doc()).objects[0].name, '甲团标记');
  await frame().locator('#save').click(); await frame().locator('#status').filter({ hasText: '已保存到本地文件' }).waitFor();
  assert.equal(await page.evaluate(() => mapWorkspace.canLeave()), true); assert.equal((await saved('模组/a/游玩团/run-a/画布.json')).document.objects[0].name, '甲团标记'); note('CtrlZ/CtrlY撤销重做，保存以当前模组与团隔离');
  await frame().locator('#reset-canvas').click(); assert.equal((await doc()).objects.length, 0); await frame().locator('#undo').click(); assert.equal((await doc()).objects[0].name, '甲团标记'); note('重置默认布置可撤销，未静默写入文件');
  await page.getByLabel('当前地图画布').selectOption('b'); await ready();
  assert.equal((await doc()).objects.length, 0); assert.match(await frame().locator('.platform-map-context').innerText(), /模组准备画布/);
  await marker('乙模组标记'); await frame().locator('#save').click(); await frame().locator('#status').filter({ hasText: '已保存到本地文件' }).waitFor();
  assert.equal((await saved('模组/b/画布.json')).document.objects[0].name, '乙模组标记'); assert.equal(await page.evaluate(() => context.runId), 'run-a');
  await page.getByLabel('当前地图画布').selectOption('a'); await ready(); assert.equal((await doc()).objects[0].name, '甲团标记'); note('浏览其他模组使用准备画布，不切团，布局与标记不串档');
  await page.request.get(url + '/test/conflict'); await marker('冲突草稿'); await frame().locator('#save').click(); await frame().locator('#status').filter({ hasText: '版本冲突' }).waitFor();
  assert((await doc()).objects.some(item => item.name === '冲突草稿')); assert.equal(await page.evaluate(() => mapWorkspace.canLeave()), false);
  await page.getByRole('button', { name: '重新读取（放弃此画布草稿）' }).click(); await ready(); assert.equal((await doc()).objects.length, 1); note('保存冲突保留草稿，明确重新读取后恢复较新文件');
  await page.getByText('模组筛选 · 2项', { exact: true }).click(); await page.locator('.formal-map-filter input[value=a]').uncheck(); await ready(); assert.equal((await doc()).moduleId, 'b'); assert.equal(await page.evaluate(() => context.moduleId), 'a'); note('模组多选下拉只筛选可浏览画布，不改变当前团上下文');
  await page.setViewportSize({ width: 700, height: 900 }); await frame().locator('#fit-all').click(); await page.screenshot({ path: join(directory, 'map-narrow.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []); assert.deepEqual(outside, []); note('窄窗可达且无页面错误、外部请求');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, errors, outside, savedKeys: ['a|run-a', 'b|preparation'] }, null, 2)); console.log('证据：' + directory);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }

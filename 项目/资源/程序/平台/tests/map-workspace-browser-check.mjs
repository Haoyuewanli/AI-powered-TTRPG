import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { outputDirectory } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
const program = fileURLToPath(new URL('..', import.meta.url));
const html = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/design-workspace.css"><link rel="stylesheet" href="/map-workspace.css">
<style>body{margin:0;background:#f5f6fa}#platform-covers{padding:12px;box-sizing:border-box;height:850px;--ink:#34374d;--quiet:#5c6480;--shadow:#9a9cc5;--paper:#f7f8fb;--ground:#f5f6fa;--cast:#6d6990;--accent:#d49bb8;--active-surface:#d9f6ff;--active-ink:#34374d}.test-controls{display:flex;gap:7px;margin-bottom:10px}[data-platform-view=maps]{height:770px}.p-map-tree{min-height:0}</style>
<div id="platform-covers"><nav class="test-controls"><button id="load">读取当前团地图</button><button id="clear">清空地图</button></nav><section data-platform-view="maps"><div class="p-map-layout"><figure class="p-map-frame"><img data-map-image alt="公共占位图" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='400'%3E%3Crect width='500' height='400' fill='%23eeeeff'/%3E%3C/svg%3E"><figcaption data-map-title>公共占位图</figcaption></figure><aside class="p-map-directory"><header class="p-map-directory-head"><strong>地图目录</strong><button data-toggle>收起</button></header><div data-map-tree class="p-map-tree"><details open><summary>公共示例目录</summary><button data-map-id="demo">公共示例地图</button></details></div></aside></div></section></div>
<script type="module">
import {createMapWorkspace} from '/map-workspace.mjs';
window.fixtureManifest={id:'campaign:synthetic',maps:[{id:'alpha',resourceId:'alpha',name:'合成主图',audience:'dm',width:500,height:400,source:{pdfPage:3},locations:[{id:'room-a',label:'A1 合成地点',description:'安全文本 <img src=x onerror="window.injected=true">',dmNotes:'仅合成DM秘密',sourcePages:[3],bounds:null,links:[{mapId:'beta',locationId:'room-b',label:'相关地点'}]}]},{id:'beta',resourceId:'beta',name:'合成相关图',audience:'dm',width:500,height:400,source:{pdfPage:4},locations:[{id:'room-b',label:'B1 相关地点',description:'第二张图',sourcePages:[4],bounds:null,links:[]}]},{id:'public-map',resourceId:'public-map',name:'合成玩家原图',audience:'player',width:500,height:400,source:{pdfPage:5},locations:[]}],storyNodes:[{id:'arrival',title:'合成抵达节点',description:'玩家自由选择行动。',source:{pdfPages:[3]},conditions:['主持人确认角色已抵达'],optional:true}]};
window.fixtureRevision=0;window.fixtureStates={'地图状态':{},'故事进度':{}};window.fixtureWrites=[];window.fixtureReads=[];window.fixtureErrors=[];window.pendingImage=null;
window.platform={root:document.getElementById('platform-covers'),role:'dm'};
const api=async path=>{window.fixtureReads.push(path);if(path==='/api/project/module-content')return structuredClone(window.fixtureManifest);if(path.startsWith('/api/project/module-state')){const kind=new URL(path,location.href).searchParams.get('kind');return{revision:window.fixtureRevision,state:structuredClone(window.fixtureStates[kind])};}if(path.startsWith('/api/project/map-image')){if(window.pendingImage){await window.pendingImage;window.pendingImage=null;}const mapId=new URL(path,location.href).searchParams.get('mapId');return{mime:'image/svg+xml',base64:btoa('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400"><rect width="500" height="400" fill="'+(mapId==='alpha'?'#c5e9ee':'#e8cee6')+'"/><text x="50" y="60">Synthetic '+mapId+'</text></svg>')};}throw Error('Unexpected API');};
const mutate=async(route,body)=>{if(route!=='module-state')throw Error('Unexpected mutation');if(body.expectedRevision!==window.fixtureRevision)throw Error('合成版本冲突');window.fixtureStates[body.kind]=structuredClone(body.state);window.fixtureWrites.push(structuredClone(body));window.fixtureRevision++;return{revision:window.fixtureRevision};};
const run=async operation=>{try{return await operation();}catch(error){window.fixtureErrors.push(error.message);}};
window.mapView=createMapWorkspace({platform:window.platform,api,mutate,run,openResource:async()=>{}});
document.getElementById('load').onclick=()=>run(()=>window.mapView.load());document.getElementById('clear').onclick=()=>window.mapView.clear();
document.querySelector('[data-toggle]').onclick=()=>{const tree=document.querySelector('[data-map-tree]');tree.hidden=!tree.hidden;};
window.harnessReady=true;
</script>`;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); return; }
  if (['/map-workspace.mjs', '/map-workspace.css', '/design-workspace.css'].includes(path)) {
    response.writeHead(200, { 'Content-Type': path.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
    response.end(await readFile(join(program, 'web', path.slice(1)))); return;
  }
  response.writeHead(404); response.end();
});
await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
const url = 'http://127.0.0.1:' + server.address().port;
await mkdir(outputDirectory, { recursive: true }); const directory = await mkdtemp(join(outputDirectory, 'map-ui-'));
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } }), errors = [], outside = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => { if (route.request().url().startsWith(url + '/') || route.request().url().startsWith('data:')) return route.continue(); outside.push(route.request().url()); return route.abort(); });
const check = message => checks.push(message);
try {
  await page.goto(url); await page.waitForFunction(() => window.harnessReady);
  assert.deepEqual(await page.evaluate(() => window.fixtureReads), []);
  await page.locator('#load').click(); await page.locator('[data-real-map-image][src]').waitFor();
  assert.equal(await page.locator('[data-real-map-choice]').count(), 3); assert(await page.locator('[data-map-image]').isHidden());
  await page.locator('[data-real-map-directory] summary').filter({ hasText: '合成主图' }).evaluate(node => { node.parentElement.open = true; });
  await page.locator('[data-real-location-choice=room-a]').click();
  assert((await page.locator('[data-real-map-location]').textContent()).includes('安全文本 <img'));
  assert.equal(await page.locator('[data-real-map-location] img').count(), 0); assert.equal(await page.evaluate(() => !!window.injected), false);
  await page.locator('[data-real-map-location] summary').click(); assert((await page.locator('[data-real-map-location]').textContent()).includes('仅合成DM秘密'));
  assert.equal(await page.locator('[data-real-map-workspace] [data-map-hotspot]').count(), 0);
  check('真实图仅由DM显式读取，保留公共图和目录，分类三张原图；地点和秘密只作文本，未伪造热点');

  await page.getByRole('checkbox', { name: '已探索', exact: true }).check();
  await page.locator('[data-real-map-notes]').fill('合成地点笔记'); await page.locator('[data-save-map-state]').click();
  await page.waitForFunction(() => window.fixtureWrites.length === 1);
  const mapSaved = await page.evaluate(() => window.fixtureStates['地图状态']);
  assert.equal(mapSaved.locations['map:alpha|location:room-a'].explored, true); assert.equal(mapSaved.locations['map:alpha|location:room-a'].enemiesHandled, undefined);
  await page.locator('[data-reload-real-map]').click(); await page.locator('[data-real-map-notes]').waitFor();
  assert.equal(await page.locator('[data-real-map-notes]').inputValue(), '合成地点笔记');
  await page.evaluate(() => { window.fixtureRevision++; });
  await page.locator('[data-real-map-notes]').fill('冲突时保留的草稿'); await page.locator('[data-save-map-state]').click();
  await page.waitForFunction(() => document.querySelector('[data-real-map-status]').textContent.includes('版本冲突'));
  assert.equal(await page.locator('[data-real-map-notes]').inputValue(), '冲突时保留的草稿');
  assert.equal((await page.evaluate(() => window.fixtureStates['地图状态'])).locations['map:alpha|location:room-a'].notes, '合成地点笔记');
  check('地点探索/敌人/物品标记相互独立，笔记按读取版本保存并重开恢复，冲突保留草稿且不覆盖原记录');

  await page.locator('[data-reload-real-map]').click(); await page.locator('[data-real-map-notes]').waitFor();
  await page.locator('[data-real-story-tree]>summary').click(); await page.locator('[data-real-story-choice=arrival]').click();
  await page.getByRole('checkbox', { name: '团内已知记录', exact: true }).check(); await page.locator('[data-save-story-state]').click();
  await page.waitForFunction(() => window.fixtureWrites.some(entry => entry.kind === '故事进度'));
  assert.equal(await page.evaluate(() => window.fixtureStates['故事进度'].nodes['node:arrival'].known), true);
  assert((await page.locator('[data-real-story-tree]').textContent()).includes('玩家自由选择行动。'));
  await page.locator('[data-real-map-location]').getByRole('button', { name: '相关地点 · 合成相关图' }).click();
  await page.waitForFunction(() => document.querySelector('[data-real-map-caption]').textContent.includes('合成相关图'));
  assert((await page.locator('[data-real-map-location]').textContent()).includes('B1 相关地点'));
  check('故事节点与地图记录分开保存，原书条件可查；相关地点可跳到另一原图与目录位置');

  const transformBefore = await page.locator('.map-image-stage').evaluate(node => node.style.transform);
  await page.getByRole('button', { name: '放大真实地图', exact: true }).click();
  assert.notEqual(await page.locator('.map-image-stage').evaluate(node => node.style.transform), transformBefore);
  const box = await page.locator('.map-viewport').boundingBox(); await page.mouse.move(box.x + 50, box.y + 50); await page.mouse.down(); await page.mouse.move(box.x + 80, box.y + 70); await page.mouse.up();
  const panned = await page.locator('.map-image-stage').evaluate(node => node.style.transform); assert(panned.includes('30px'));
  await page.locator('[data-fit-real-map]').click();
  const picture = await page.locator('[data-real-map-image]').boundingBox(), area = await page.locator('.map-viewport').boundingBox();
  assert(picture.height <= area.height + 2 && picture.width <= area.width + 2);
  await page.locator('[data-show-demo-map]').click(); assert(await page.locator('[data-map-image]').isVisible());
  await page.locator('[data-show-real-map]').click(); assert(await page.locator('[data-real-map-workspace]').isVisible());
  await page.locator('[data-toggle]').click(); assert(await page.locator('[data-map-tree]').isHidden()); await page.locator('[data-toggle]').click();
  await page.screenshot({ path: join(directory, '真实地图与地点.png'), fullPage: true });
  check('原图缩放、平移、适配可用，公共示例可切回，原目录收起行为保留');

  await page.evaluate(() => { window.pendingImage = new Promise(accept => { window.releaseImage = accept; }); });
  await page.locator('[data-real-map-directory] summary').filter({ hasText: '合成主图' }).evaluate(node => { node.parentElement.open = true; });
  await page.locator('[data-real-map-choice=alpha]').click();
  await page.evaluate(() => { window.platform.role = 'player'; window.mapView.clear(); window.releaseImage(); });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-real-map-image]').getAttribute('src'), null); assert.equal(await page.locator('[data-real-location-choice]').count(), 0);
  assert.equal(await page.locator('[data-real-map-notes]').count(), 0); assert(!(await page.locator('#platform-covers').textContent()).includes('仅合成DM秘密'));
  assert(await page.locator('[data-map-image]').isVisible()); assert(await page.locator('[data-real-map-directory]').isHidden());
  assert.deepEqual(await page.evaluate(() => window.fixtureWrites.map(entry => entry.kind)), ['地图状态', '故事进度']);
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  check('换视角清除真实图像、地点、秘密与草稿，迟到图像不回填；所有写入仅本团状态，无脚本错误或外网请求');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, errors, outside }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, directory, errors, outside }, null, 2));
} catch (error) {
  await writeFile(join(directory, 'failure.json'), JSON.stringify({ error: error.message, checks, errors, outside }, null, 2));
  await page.screenshot({ path: join(directory, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close(); await new Promise(accept => server.close(accept));
}

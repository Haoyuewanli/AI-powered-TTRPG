import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { outputDirectory } from './check-helpers.mjs';

const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
await mkdir(outputDirectory, { recursive: true });
const directory = await mkdtemp(join(outputDirectory, 'module-ui-'));
const checks = [], errors = [], requests = [];
const fixture = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/design-workspace.css"><link rel="stylesheet" href="/module-workspace.css"><style>#platform-covers{--paper:#f5f6fa;--ink:#34374d;--quiet:#555b77;--light:#d9f6ff;--light-ink:#34374d;--shadow:#9a9cc5;--accent:#e9b5d5;--cast:#34374d44;--rail:#9296bb;--rail-ink:#fff;padding:20px;width:min(900px,95vw);box-sizing:border-box}button{font:inherit}</style><div id="platform-covers"><div id="host"></div></div><script type="module">
import { createModuleWorkspace } from '/module-workspace.mjs';
window.events=[];
window.catalog={categories:['单人短团','多人短团','长团'],templates:[{id:'a',name:'同名模组',category:'多人短团',maps:2,nodes:3,canTrain:true,coverAvailable:true},{id:'b',name:'同名模组',category:'长团',coverAvailable:false}],modules:[{id:'run-a1',name:'甲团',templateId:'a',lastPlayedAt:'2026-11-01T01:02:03Z'},{id:'run-a2',name:'乙团',templateIdentity:{moduleId:'a'}},{id:'run-b',name:'丙团',templateId:'b'},{id:'unlinked',name:'旧团'}]};
window.workspace=createModuleWorkspace({host:document.getElementById('host'),onContinue:(item,battleId)=>events.push({type:'continue',id:item.id,battleId}),onCreate:(template,options)=>events.push({type:'create',id:template.id,...options}),onRefresh:()=>events.push({type:'refresh'}),loadCover:async()=>({mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='})});
workspace.render(catalog);
</script>`;
const allowed = new Map(['/module-workspace.mjs', '/module-workspace.css', '/design-workspace.css'].map(path => [path, new URL('../../../../资源/程序/平台/web' + path, import.meta.url)]));
const server = createServer(async (request, response) => {
  if (request.url === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(fixture); return; }
  const file = allowed.get(request.url);
  if (!file) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': request.url.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' }); response.end(await readFile(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
let browser;
const pass = name => { checks.push(name); console.log('PASS: ' + name); };
try {
  browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || process.env.BATTLE_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()));
  await page.goto(url);
  await page.locator('[data-real-module-template=a]').waitFor();
  assert.equal(await page.locator('[data-real-module-category="多人短团"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-real-run]').count(), 3);
  assert.deepEqual(await page.evaluate(() => events), []); pass('自然首屏选有内容的真实分类，空分类保留，浏览不切团');
  await page.locator('[data-real-run=run-a1]').click();
  assert.deepEqual(await page.evaluate(() => events), []);
  assert.match(await page.locator('[data-real-run-overview=run-a1]').innerText(), /最后游玩/);
  await page.locator('[data-project-select-module=run-a1]').click();
  assert.equal(await page.evaluate(() => events[0].id), 'run-a1'); pass('先看团概况，仅明确继续触发切团');
  await page.locator('[data-real-module-category="长团"]').click();
  assert.equal(await page.locator('[data-real-run=run-a1]').count(), 0);
  assert.equal(await page.locator('[data-real-run=run-b]').count(), 1); pass('同名不同ID模组不串团');
  await page.locator('[data-real-module-category="单人短团"]').click();
  assert.equal(await page.locator('[data-real-module-template]').count(), 0);
  assert.match(await page.locator('.module-ring').innerText(), /还没有可用模组/); pass('真实空分类显示空态');
  await page.locator('[data-real-module-category="多人短团"]').click();
  await page.getByText('新开一团', { exact: true }).click();
  await page.getByLabel('新团名称').fill('测试新团');
  await page.locator('input[type=checkbox]').uncheck();
  await page.locator('[data-project-create-run=a]').click();
  assert.deepEqual(await page.evaluate(() => events.find(item => item.type === 'create')), { type: 'create', id: 'a', name: '测试新团', training: false }); pass('单个新团入口保留普通与训练选项');
  await page.getByText('其他已有团 · 1', { exact: true }).click();
  await page.locator('[data-real-run=unlinked]').click();
  await page.locator('[data-project-select-module=unlinked]').click();
  assert.equal(await page.evaluate(() => events.at(-1).id), 'unlinked'); pass('未关联旧团仍可先概况后继续');
  for (const [width, height] of [[2560, 1600], [2560, 1440], [2048, 1536], [1920, 1440], [430, 850]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('[data-project-refresh-modules]').click();
  }
  await page.screenshot({ path: join(directory, 'module-narrow.png'), fullPage: true }); pass('四预设及窄窗无横向溢出，刷新可到达');
  await page.evaluate(() => workspace.clear());
  assert.equal(await page.locator('[data-real-module-template]').count(), 0);
  assert.equal(await page.locator('[data-real-run]').count(), 0); pass('清理视角移除真实封面与团信息');
  assert.deepEqual(errors, []);
  assert.equal(requests.filter(value => !value.startsWith(url) && !value.startsWith('data:')).length, 0);
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, errors, requests }, null, 2));
  console.log(JSON.stringify({ directory, checks: checks.length }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }

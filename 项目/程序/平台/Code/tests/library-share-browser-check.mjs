import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLibraryApi } from '../library-api.mjs';
import { outputDirectory } from './check-helpers.mjs';

await mkdir(outputDirectory, { recursive: true }); const directory = await mkdtemp(join(outputDirectory, 'library-share-ui-')), root = join(directory, '项目');
async function put(path, value) { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), value); }
await put('模组/合成模组/模组.json', JSON.stringify({ id: 'module-a', name: '合成模组' }));
await put('模组/合成模组/游玩团/run-a/团.json', JSON.stringify({ id: 'run-a', moduleId: 'module-a', name: '分享验收团', characters: [] }));
await put('资源/怪物/M/梅洛.md', '---\n' + JSON.stringify({ id: 'merrow', name: '梅洛', kind: '怪物', initial: 'M' }) + '\n---\n# 梅洛\n仅获准角色可读的合成正文。');
const api = createLibraryApi({ root, sessionResolver: request => request.headers['x-synthetic-dm'] === 'yes' ? { role: 'dm' } : null });
await api.store.select({ role: 'dm' }, { moduleId: 'module-a', runId: 'run-a' });
const fixture = `<!doctype html><meta charset="utf-8"><style>body{font:14px 'Microsoft YaHei',sans-serif;max-width:850px;margin:25px auto}.library-party-member{padding:12px;border-bottom:1px solid #ddd}button,input{padding:8px;margin:4px}label{display:block}time{display:block;color:#666}article{padding:8px}</style><div id="host"></div><article id="opened"></article><p id="status"></p><script type="module">
import {createPartyPanel} from '/party-panel.mjs';import {createShareNotifications} from '/share-notifications.mjs';
const token=new URLSearchParams(location.hash.slice(1)).get('invite');const dm=!token;let opened=null;
const api=async(path,body)=>{const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(dm?{'X-Synthetic-DM':'yes'}:{'X-Library-Token':token})},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error),{status:response.status,code:result.code});return result;};
const onStatus=text=>document.getElementById('status').textContent=text;
if(dm){window.party=createPartyPanel({host:document.getElementById('host'),api,onStatus});party.load();}else{await api('/api/library/join',{token});window.notifications=createShareNotifications({host:document.getElementById('host'),api,interval:1000,onStatus,onOpenResource:async id=>{const value=await api('/api/library/read?resourceId='+encodeURIComponent(id));opened=id;document.getElementById('opened').textContent=value.text;},onPermissionsChanged:async()=>{if(!opened)return;try{await api('/api/library/read?resourceId='+encodeURIComponent(opened));}catch{document.getElementById('opened').textContent='';opened=null;}}});}
</script>`;
const files = new Map([['/party-panel.mjs', new URL('../../窗口/对话/Code/party-panel.mjs', import.meta.url)], ['/share-notifications.mjs', new URL('../../窗口/对话/Code/share-notifications.mjs', import.meta.url)]]);
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://' + request.headers.host), send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
  if (await api.handle(request, url, send)) return;
  if (url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html;charset=utf-8' }); response.end(fixture); return; }
  if (files.has(url.pathname)) { response.writeHead(200, { 'content-type': 'text/javascript;charset=utf-8' }); response.end(await readFile(files.get(url.pathname))); return; }
  response.writeHead(404); response.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = 'http://127.0.0.1:' + server.address().port;
const playwright = process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwright));
let browser; const checks = [], errors = [], outside = [];
const pass = text => { checks.push(text); console.log('PASS: ' + text); };
try {
  browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', route => { const address = route.request().url(); if (address.startsWith(origin) || address.startsWith('data:')) return route.continue(); outside.push(address); return route.abort(); });
  const dm = await context.newPage(); await dm.goto(origin);
  for (const name of ['艾莉', '波布']) {
    await dm.getByLabel('新角色名称').fill(name); await dm.getByLabel('玩家称呼').fill(name + '的玩家'); await dm.getByRole('button', { name: '添加角色', exact: true }).click();
    await dm.locator('.library-party-member').filter({ hasText: name }).getByRole('button', { name: '生成本机邀请', exact: true }).waitFor();
  }
  const links = [];
  for (const name of ['艾莉', '波布']) {
    await dm.locator('.library-party-member').filter({ hasText: name }).getByRole('button', { name: '生成本机邀请', exact: true }).click();
    const field = dm.getByLabel(name + '的本机邀请链接'); await field.waitFor(); links.push(await field.inputValue());
  }
  pass('DM界面添加角色并生成各自绑定的本机邀请，未向外发送');
  const alice = await context.newPage(), bob = await context.newPage(); await alice.goto(links[0]); await bob.goto(links[1]);
  await alice.getByText('还没有资料开放通知。').waitFor(); await bob.getByText('还没有资料开放通知。').waitFor();
  const current = await api.store.context({ role: 'dm' }), character = current.characters.find(item => item.name === '艾莉');
  await api.store.setShares({ role: 'dm' }, { resourceId: 'merrow', characterIds: [character.id], expectedRevision: current.revision });
  await alice.getByRole('button', { name: 'DM向你分享了【梅洛】', exact: true }).waitFor();
  assert.equal(await bob.locator('[data-shared-resource-id]').count(), 0);
  await alice.getByRole('button', { name: 'DM向你分享了【梅洛】', exact: true }).click(); await alice.locator('#opened').filter({ hasText: '仅获准角色' }).waitFor();
  pass('分享通知仅相应玩家看到，点击后通过服务端权限读取正文');
  await api.store.setShares({ role: 'dm' }, { resourceId: 'merrow', characterIds: [], expectedRevision: (await api.store.context({ role: 'dm' })).revision });
  await alice.getByText('DM撤回了给你的分享【梅洛】', { exact: true }).waitFor();
  assert.equal(await alice.locator('#opened').textContent(), ''); assert.equal(await alice.locator('[data-shared-resource-id]').count(), 0);
  assert.equal(await bob.getByText('DM撤回了给你的分享【梅洛】', { exact: true }).count(), 0);
  pass('撤回通知仍定向，原通知失去点击能力，已打开正文被权限变化回调清除');
  await dm.locator('.library-party-member').filter({ hasText: '艾莉' }).getByRole('button', { name: '撤销此邀请', exact: true }).click();
  await alice.getByText('邀请或玩家会话已失效。').waitFor(); assert.equal(await alice.locator('.library-notification').count(), 0);
  pass('撤销邀请后轮询发现会话失效，清理通知与已打开私有内容');
  await alice.screenshot({ path: join(directory, '玩家邀请失效.png'), fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, errors, outside }, null, 2)); console.log(JSON.stringify({ directory, passed: checks.length }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }

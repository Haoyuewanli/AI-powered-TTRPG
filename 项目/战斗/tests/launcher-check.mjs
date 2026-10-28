import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, access, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.mjs';
import { fixture, command } from './fixture.mjs';

const execute = promisify(execFile);
const output = fileURLToPath(new URL('../../../开发记录/临时/战斗启动检查/', import.meta.url));
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'campaign-'));
const initial = await openStore(directory, fixture); await initial.close();
const reserve = createServer(); await new Promise(accept => reserve.listen(0, '127.0.0.1', accept));
const port = reserve.address().port; await new Promise(accept => reserve.close(accept));
const url = `http://127.0.0.1:${port}`;
const launcher = fileURLToPath(new URL('../launcher.mjs', import.meta.url));
const args = ['--no-browser', '--port', String(port), '--campaign', directory];
const launch = () => process.platform === 'win32' ?
  execute('cmd.exe', ['/d', '/c', '启动战斗.cmd', ...args], { cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 20000, windowsHide: true }) :
  execute(process.execPath, [launcher, ...args], { timeout: 20000, windowsHide: true });
const sleep = ms => new Promise(accept => setTimeout(accept, ms));
let token;
async function login() {
  const response = await fetch(url + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'DM' }) });
  token = (await response.json()).token; assert(token);
}
async function stop() {
  await fetch(url + '/api/shutdown', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
  for (let i = 0; i < 50; i++) {
    try { await access(join(directory, '.battle.lock')); await sleep(100); }
    catch { return; }
  }
  throw new Error('服务停止后锁文件未释放');
}
try {
  await launch();
  const pid = await readFile(join(directory, '.battle.lock'), 'utf8');
  await launch(); assert.equal(await readFile(join(directory, '.battle.lock'), 'utf8'), pid);
  await login();
  const response = await fetch(url + '/api/state', { headers: { Authorization: `Bearer ${token}` } });
  const { state } = await response.json();
  const saved = await fetch(url + '/api/action', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command(state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 25 } })) });
  assert.equal(saved.status, 200);
  const other = await mkdtemp(join(output, 'other-'));
  await assert.rejects(execute(process.execPath, [launcher, '--no-browser', '--port', String(port), '--campaign', other], { windowsHide: true }), /其他服务或战役/);
  await assert.rejects(execute(process.execPath, [launcher, ...args, '--workspace', join(directory, 'other-library')], { windowsHide: true }), /另一个工作区/);
  await stop(); token = null;
  const lease = join(directory, '.工作区', '.workspace.lock');
  await writeFile(lease, String(process.pid));
  const releasing = new Promise((accept, reject) => setTimeout(() => {
    rename(lease, join(directory, '.工作区', '已释放的测试锁')).then(accept, reject);
  }, 350));
  await launch(); await login();
  await releasing;
  const restored = await (await fetch(url + '/api/state', { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.equal(restored.state.revision, 1); assert.equal(restored.state.actors[0].hp, 25);
  await stop(); token = null;
  const hash = value => createHash('sha256').update(value.toLowerCase()).digest('hex');
  let capabilities;
  const oldCore = createHttpServer((request, response) => { response.setHeader('Content-Type','application/json');response.end(JSON.stringify({app:'local-battle-v1',coreVersion:'battle-resources-v5',capabilities,campaignKey:hash(directory),workspaceKey:hash(join(directory,'.工作区'))})); });
  await new Promise(accept => oldCore.listen(port,'127.0.0.1',accept));
  try {
    await assert.rejects(execute(process.execPath,[launcher,...args],{windowsHide:true,timeout:5000}),/缺少模组封面管理/);assert(oldCore.listening);
    capabilities={moduleCovers:1};
    await assert.rejects(execute(process.execPath,[launcher,...args],{windowsHide:true,timeout:5000}),/缺少平台首页/);assert(oldCore.listening);
  }
  finally { await new Promise(accept => oldCore.close(accept)); }
  console.log(JSON.stringify({ windowsCmdEntryTested: process.platform === 'win32', repeatedLaunchReusesProcess: true, differentCampaignRejected: true,
    dmShutdownReleasesLock: true, waitsForClosingLease: true, restartRestoresSavedState: true, oldCoreWithoutModuleToolsRejected: true, oldCoreWithoutPlatformRejected: true, externalRequests: 0 }));
} finally { if (token) await stop().catch(() => {}); }

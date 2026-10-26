import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStore } from '../src/store.mjs';
import { windowBrowser, windowArguments } from '../src/desktop.mjs';
import { fixture } from './fixture.mjs';

const playwrightModule = process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightModule));
const output = fileURLToPath(new URL('../../../开发记录/临时/本地窗口恢复检查/', import.meta.url));
await mkdir(output, { recursive: true });
const dir = await mkdtemp(join(output, 'campaign-'));
const initial = await openStore(dir, fixture); await initial.close();
const reservation = createServer(); await new Promise(accept => reservation.listen(0, '127.0.0.1', accept));
const port = reservation.address().port; await new Promise(accept => reservation.close(accept));
const url = `http://127.0.0.1:${port}`;
const execute = promisify(execFile);
const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url));
async function launch() {
  await execute('cmd.exe', ['/d', '/c', '打开跑团.cmd', '--no-browser', '--port', String(port), '--campaign', dir], {
    cwd: workspaceRoot, timeout: 20000, windowsHide: true
  });
}
const executablePath = await windowBrowser(); assert(executablePath, '需有本机Edge');
assert.throws(() => windowArguments('https://example.invalid', output), /本机/);
let context, external = 0, token;
const errors = [], checks = [];
async function openWindow(profileName) {
  const profile = join(output, profileName);
  context = await chromium.launchPersistentContext(profile, {
    executablePath, headless: true, viewport: { width: 1360, height: 960 },
    args: [...windowArguments(url, profile).filter(arg => !arg.startsWith('--user-data-dir=')), '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader']
  });
  await context.route('**/*', route => {
    if (route.request().url().startsWith(url + '/')) return route.continue();
    external++; return route.abort();
  });
  const page = context.pages().find(p => p.url().startsWith(url)) || await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('#enter-dm').click(); await page.locator('canvas[data-ready="true"]').waitFor();
  await page.locator('canvas[data-settled="true"]').waitFor();
  token = await page.evaluate(() => sessionStorage.getItem('battle-session'));
  return page;
}
async function getState() {
  return (await (await fetch(url + '/api/state', { headers: { Authorization: `Bearer ${token}` } })).json()).state;
}
try {
  await launch();
  const page = await openWindow(`profile-${Date.now()}-first`);
  checks.push('独立应用模式使用本机Edge与专用窗口配置');
  await page.locator('[data-tool=actor]').first().click();
  await page.locator('#edit-hp').fill('17'); await page.locator('#edit-resources').fill('离线修改并保存的合成资源记录');
  await page.locator('#edit-form button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('v1'));
  const saved = await getState();
  assert.equal(saved.actors[0].hp, 17); assert.equal(saved.revision, 1);
  assert.equal(external, 0); checks.push('外部请求被阻断时仍可读取、修改并保存');
  await context.close(); context = null;
  assert.equal((await fetch(url + '/health')).status, 200);
  checks.push('关闭应用窗口不会丢失存档或停止本机核心');
  // This PID belongs to the synthetic campaign just launched by this check.
  const killedPid = Number(await readFile(join(dir, '.battle.lock'), 'utf8'));
  const health = await (await fetch(url + '/health')).json(); assert.equal(health.app, 'local-battle-v1');
  process.kill(killedPid, 'SIGKILL');
  for (let i = 0; i < 50; i++) {
    try { process.kill(killedPid, 0); await new Promise(accept => setTimeout(accept, 100)); }
    catch { break; }
  }
  await access(join(dir, '.battle.lock'));
  await launch();
  const reopened = await openWindow(`profile-${Date.now()}-second`);
  const restored = await getState();
  assert.equal(restored.revision, 1); assert.equal(restored.actors[0].hp, 17);
  assert.equal(restored.actors[0].resources, '离线修改并保存的合成资源记录');
  assert.notEqual(Number(await readFile(join(dir, '.battle.lock'), 'utf8')), killedPid);
  checks.push('强制终止核心后重新双击入口，自动处理旧标记并恢复文件');
  await reopened.locator('[data-tool=actor]').first().click();
  await reopened.locator('#edit-hp').fill('19'); await reopened.locator('#edit-form button[type=submit]').click();
  await reopened.waitForFunction(() => document.querySelector('#save-status').textContent.includes('v2'));
  assert.equal(JSON.parse(await readFile(join(dir, '战斗状态.json'), 'utf8')).actors[0].hp, 19);
  checks.push('恢复后可继续修改同一份正式存档');
  assert.equal(external, 0); assert.equal(errors.length, 0);
  await writeFile(join(output, '结果.json'), JSON.stringify({ checks, externalRequests: external, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, externalRequests: external, errors }));
} finally {
  await context?.close();
  if (token) await fetch(url + '/api/shutdown', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
}

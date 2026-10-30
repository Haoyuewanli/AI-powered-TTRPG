import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { access, readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatePlatform, startIsolated, stopOwnedPlatform } from './check-helpers.mjs';

const execute = promisify(execFile);
async function listen(server) {
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  return server.address().port;
}
async function closed(server) {
  await new Promise((accept, reject) => { server.close(error => error ? reject(error) : accept()); server.closeIdleConnections?.(); });
}

test('the copied folder starts as an actual isolated process and serves its own UI with no sibling files', async () => {
  const { directory, isolated } = await isolatePlatform('portable-');
  const app = await startIsolated(isolated);
  try {
    const response = await fetch(app.url + '/');
    assert.equal(response.status, 200);
    assert((await response.text()).includes('/app.mjs'));
    const health = await (await fetch(app.url + '/health')).json();
    assert.equal(health.pid, app.child.pid);
    assert.equal(health.rootKey, app.rootKey);
    assert.deepEqual((await readdir(directory)).sort(), ['isolated']);
    for (const name of ['node_modules', '战斗', '存档']) await assert.rejects(access(join(isolated, name)), { code: 'ENOENT' });
    for (const name of ['app.mjs', 'platform-shell.mjs', 'dialogue-workspace.mjs']) {
      const body = await (await fetch(app.url + '/' + name)).text();
      assert(!/from\s+['"]\.\.\//.test(body), name + ' requires parent source');
      assert(!body.includes('battle-session'), name + ' requires battle session');
    }
  } finally { await app.close(); }
});

test('the portable launcher reuses the same folder and rejects another folder or unrelated service', async () => {
  const first = await isolatePlatform('launcher-');
  const previousRoot = process.env.RPG_PROJECT_ROOT;
  process.env.RPG_PROJECT_ROOT = join(first.isolated, '.runtime', 'project');
  await mkdir(process.env.RPG_PROJECT_ROOT, { recursive: true });
  const launcher = await import(pathToFileURL(join(first.isolated, 'launcher.mjs')));
  const started = await launcher.launchPlatform({ port: 0, noBrowser: true });
  const foreign = await isolatePlatform('foreign-');
  const other = await startIsolated(foreign.isolated);
  let impostorHealth = { app: 'unrelated-service', pid: process.pid };
  const impostor = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(impostorHealth));
  });
  const occupied = createServer((request, response) => { response.writeHead(404); response.end('not a platform'); });
  try {
    const repeated = await launcher.launchPlatform({ port: Number(new URL(started.url).port), noBrowser: true });
    assert.equal(repeated.url, started.url);
    assert.equal(repeated.pid, started.pid);
    assert.equal(repeated.reused, true);
    assert.equal(started.reused, false);
    const firstProjectRoot = process.env.RPG_PROJECT_ROOT;
    process.env.RPG_PROJECT_ROOT = join(first.directory, 'different-project');
    try { await assert.rejects(launcher.launchPlatform({ port: Number(new URL(started.url).port), noBrowser: true }), /另一个项目资料根目录/); }
    finally { process.env.RPG_PROJECT_ROOT = firstProjectRoot; }
    await assert.rejects(launcher.launchPlatform({ port: Number(new URL(other.url).port), noBrowser: true }), /另一个平台文件夹/);
    assert.equal((await (await fetch(other.url + '/health')).json()).pid, other.child.pid);
    const fakePort = await listen(impostor);
    await assert.rejects(launcher.launchPlatform({ port: fakePort, noBrowser: true }), /其他服务/);
    assert(impostor.listening);
    const ownHealth = await (await fetch(started.url + '/health')).json();
    impostorHealth = { ...ownHealth, version: 'platform-p0', pid: process.pid };
    await assert.rejects(launcher.launchPlatform({ port: fakePort, noBrowser: true }), /版本不同/);
    impostorHealth = { ...ownHealth, capabilities: { standalone: 1 }, pid: process.pid };
    await assert.rejects(launcher.launchPlatform({ port: fakePort, noBrowser: true }), /版本不同/);
    assert(impostor.listening);
    const busyPort = await listen(occupied);
    await assert.rejects(launcher.launchPlatform({ port: busyPort, noBrowser: true }), /占用/);
    assert(occupied.listening);
    assert.equal((await fetch(started.url + '/health')).status, 200);
  } finally {
    await other.close();
    if (impostor.listening) await closed(impostor);
    if (occupied.listening) await closed(occupied);
    await stopOwnedPlatform(started.pid, started.url);
    if (previousRoot === undefined) delete process.env.RPG_PROJECT_ROOT;
    else process.env.RPG_PROJECT_ROOT = previousRoot;
  }
});

test('automatic launch avoids a foreign platform and a new CLI process reuses the verified remembered endpoint', async () => {
  const first = await isolatePlatform('auto-launch-');
  const foreign = await isolatePlatform('auto-foreign-');
  const other = await startIsolated(foreign.isolated);
  const previousRoot = process.env.RPG_PROJECT_ROOT, previousPort = process.env.RPG_PLATFORM_PORT;
  const projectRoot = join(first.isolated, '.runtime', 'project'); await mkdir(projectRoot, { recursive: true });
  process.env.RPG_PROJECT_ROOT = projectRoot; delete process.env.RPG_PLATFORM_PORT;
  const launcher = await import(pathToFileURL(join(first.isolated, 'launcher.mjs')));
  const owned = [];
  try {
    const preferred = Number(new URL(other.url).port);
    const started = await launcher.launchPlatform({ port: preferred, autoPort: true, noBrowser: true }); owned.push(started);
    assert.notEqual(started.url, other.url); assert.equal(started.reused, false);
    const repeated = await launcher.launchPlatform({ port: preferred, autoPort: true, noBrowser: true });
    assert.equal(repeated.url, started.url); assert.equal(repeated.pid, started.pid); assert.equal(repeated.reused, true);
    const result = await execute(process.execPath, [join(first.isolated, 'launcher.mjs'), '--no-browser'], {
      cwd: first.isolated, windowsHide: true, timeout: 20000, env: { ...process.env }
    });
    assert.equal(result.stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0], started.url);
    await assert.rejects(launcher.launchPlatform({ port: preferred, noBrowser: true }), /另一个平台文件夹/);
    process.env.RPG_PLATFORM_PORT = String(preferred);
    await assert.rejects(launcher.launchPlatform({ noBrowser: true }), /另一个平台文件夹/);
    delete process.env.RPG_PLATFORM_PORT;
    const cacheName = (await readdir(join(first.isolated, '.runtime'))).find(name => /^launch-.*\.json$/.test(name));
    assert(cacheName);
    await writeFile(join(first.isolated, '.runtime', cacheName), JSON.stringify({ url: other.url }));
    const recovered = await launcher.launchPlatform({ port: preferred, autoPort: true, noBrowser: true }); owned.push(recovered);
    assert.equal(recovered.reused, false); assert.notEqual(recovered.url, other.url);
    assert.equal((await fetch(other.url + '/health').then(response => response.json())).pid, other.child.pid);
    const recoveredHealth = await fetch(recovered.url + '/health').then(response => response.json());
    assert.equal(recoveredHealth.rootKey, (await fetch(started.url + '/health').then(response => response.json())).rootKey);
    assert.equal(recoveredHealth.projectRootKey, (await fetch(started.url + '/health').then(response => response.json())).projectRootKey);
  } finally {
    for (const value of owned) await stopOwnedPlatform(value.pid, value.url);
    await other.close();
    if (previousRoot === undefined) delete process.env.RPG_PROJECT_ROOT; else process.env.RPG_PROJECT_ROOT = previousRoot;
    if (previousPort === undefined) delete process.env.RPG_PLATFORM_PORT; else process.env.RPG_PLATFORM_PORT = previousPort;
  }
});

test('automatic launch survives a broken or stale endpoint cache and preserves a non-platform listener', async () => {
  const first = await isolatePlatform('auto-stale-');
  const previousRoot = process.env.RPG_PROJECT_ROOT;
  process.env.RPG_PROJECT_ROOT = join(first.isolated, '.runtime', 'project'); await mkdir(process.env.RPG_PROJECT_ROOT, { recursive: true });
  const launcher = await import(pathToFileURL(join(first.isolated, 'launcher.mjs')));
  const busy = createServer((request, response) => { response.writeHead(404); response.end('another local application'); });
  const owned = [];
  try {
    const port = await listen(busy);
    const started = await launcher.launchPlatform({ port, autoPort: true, noBrowser: true }); owned.push(started);
    const file = join(first.isolated, '.runtime', (await readdir(join(first.isolated, '.runtime'))).find(name => /^launch-.*\.json$/.test(name)));
    await writeFile(file, '{broken');
    const recovered = await launcher.launchPlatform({ port, autoPort: true, noBrowser: true }); owned.push(recovered);
    assert.equal(recovered.reused, false); assert.notEqual(recovered.url, started.url);
    await stopOwnedPlatform(recovered.pid, recovered.url);
    owned.pop();
    const restarted = await launcher.launchPlatform({ port, autoPort: true, noBrowser: true }); owned.push(restarted);
    assert.equal(restarted.reused, false);
    assert.equal(await fetch('http://127.0.0.1:' + port + '/').then(response => response.text()), 'another local application');
  } finally {
    for (const value of owned) await stopOwnedPlatform(value.pid, value.url);
    if (busy.listening) await closed(busy);
    if (previousRoot === undefined) delete process.env.RPG_PROJECT_ROOT; else process.env.RPG_PROJECT_ROOT = previousRoot;
  }
});

test('the Windows entry remains ASCII/CRLF and can start the copied platform without a browser', async () => {
  const { isolated } = await isolatePlatform('cmd-');
  const bytes = await readFile(join(isolated, '打开平台.cmd'));
  assert(bytes.every(byte => byte < 128), 'CMD source must remain ASCII');
  assert(bytes.includes(Buffer.from('\r\n')));
  assert(!/(?<!\r)\n/.test(bytes.toString('ascii')), 'CMD lines must use CRLF');
  let started;
  try {
    const projectRoot = join(isolated, '.runtime', 'project'); await mkdir(projectRoot, { recursive: true });
    const env = { ...process.env, RPG_PROJECT_ROOT: projectRoot };
    const result = process.platform === 'win32'
      ? await execute('cmd.exe', ['/d', '/c', '打开平台.cmd', '--port', '0', '--no-browser'], { cwd: isolated, windowsHide: true, timeout: 20000, env })
      : await execute(process.execPath, [join(isolated, 'launcher.mjs'), '--port', '0', '--no-browser'], { cwd: isolated, windowsHide: true, timeout: 20000, env });
    const match = result.stdout.match(/http:\/\/127\.0\.0\.1:\d+/);
    assert(match, 'launcher should print the actual loopback URL');
    const health = await (await fetch(match[0] + '/health')).json();
    started = { url: match[0], pid: health.pid };
    assert.equal(health.app, 'standalone-ttrpg-platform');
    assert.equal((await fetch(started.url + '/platform-shell.mjs')).status, 200);
  } finally { if (started) await stopOwnedPlatform(started.pid, started.url); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { startPlatform } from '../server.mjs';
import { outputDirectory } from './check-helpers.mjs';

async function startTestPlatform() {
  await mkdir(outputDirectory, { recursive: true });
  const projectRoot = await mkdtemp(join(outputDirectory, 'server-'));
  return startPlatform({ port: 0, projectRoot, appearanceFile: join(projectRoot, '外观.json') });
}

function rawRequest(url, path, headers = {}) {
  return new Promise((accept, reject) => {
    const target = new URL(url);
    const encodedPath = path.replace(/[^\x00-\x7f]/gu, character => encodeURIComponent(character));
    const req = request({ hostname: target.hostname, port: target.port, method: 'GET', path: encodedPath, headers }, response => {
      const chunks = [];
      response.on('data', data => chunks.push(data));
      response.on('end', () => accept({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.once('error', reject); req.end();
  });
}

test('standalone health and static files work without a battle, dependency runtime or gameplay state', async () => {
  const app = await startTestPlatform();
  try {
    assert.equal(app.server.address().address, '127.0.0.1');
    const response = await fetch(app.url + '/health');
    const health = await response.json();
    assert.equal(health.app, 'standalone-ttrpg-platform');
    assert.equal(health.version, 'platform-workspace-v8');
    assert.deepEqual(health.capabilities, { standalone: 1, dialogueDemo: 1, design: 1, appearance: 1, projectFiles: 1, battleHost: 1, modulePreprocess: 1, mapWorkspace: 1, ruleLibrary: 1, nativeWindow: 1 });
    assert.match(health.rootKey, /^[a-f0-9]{64}$/);
    assert.match(health.projectRootKey, /^[a-f0-9]{64}$/);
    assert.equal(health.pid, process.pid);
    const paths = [['/', 'text/html'], ['/app.mjs', 'text/javascript'], ['/base.css', 'text/css'],
      ['/platform-shell.mjs', 'text/javascript'], ['/platform-shell.css', 'text/css'],
      ['/dialogue-workspace.mjs', 'text/javascript'], ['/dialogue-workspace.css', 'text/css'],
      ['/design-workspace.mjs', 'text/javascript'], ['/design-workspace.css', 'text/css'],
      ['/project-panel.mjs', 'text/javascript'], ['/project-panel.css', 'text/css'],
      ['/map-workspace.mjs', 'text/javascript'], ['/map-workspace.css', 'text/css']];
    for (const [path, mime] of paths) {
      const file = await fetch(app.url + path);
      assert.equal(file.status, 200, path);
      assert(file.headers.get('content-type').startsWith(mime), path);
      assert((await file.text()).length > 20, path);
      assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(file.headers.get('cache-control'), 'no-store');
      assert(file.headers.get('content-security-policy').includes("default-src 'self'"));
      assert(file.headers.get('content-security-policy').includes("object-src 'none'"));
    }
  } finally { await app.close(); }
});

test('same-origin loopback checks reject foreign hosts and origins without widening the listener', async () => {
  await assert.rejects(startPlatform({ host: '0.0.0.0' }), /127\.0\.0\.1/);
  const app = await startTestPlatform();
  try {
    assert.equal((await rawRequest(app.url, '/health', { Host: 'foreign.example' })).status, 403);
    assert.equal((await fetch(app.url + '/health', { headers: { Origin: 'https://foreign.example' } })).status, 403);
    assert.equal((await fetch(app.url + '/health', { headers: { Origin: app.url } })).status, 200);
  } finally { await app.close(); }
});

test('the static allowlist cannot expose files, old battle APIs or write gameplay data', async () => {
  const app = await startTestPlatform();
  try {
    for (const path of ['/README.md', '/package.json', '/server.mjs', '/launcher.mjs', '/.runtime/server-output.log',
      '/api/state', '/api/login', '/api/action', '/模组', '/资源', '/战斗/server.mjs',
      '/../server.mjs', '/%2e%2e/server.mjs', '/%2e%2e%2fserver.mjs', '/web/../server.mjs', '/web\\..\\server.mjs']) {
      const result = await rawRequest(app.url, path);
      assert.equal(result.status, 404, path);
      assert(!result.body.includes('import '), path + ' leaked source');
    }
    assert.equal((await rawRequest(app.url, '/api/module-covers')).status, 403);
    for (const path of ['/', '/health', '/api/action']) {
      const response = await fetch(app.url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"type":"start"}' });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET');
    }
    assert.equal((await fetch(app.url + '/health')).status, 200);
  } finally { await app.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp } from '../server.mjs';
import { normalizeEmbedOrigin, defaultArchiveRoot, threeRoot } from '../project-paths.mjs';
import { installPlatformBridge, PLATFORM_BRIDGE_CHANNEL } from '../web/platform-bridge.mjs';
import { fixture } from './fixture.mjs';

const output = fileURLToPath(new URL('../../../../../开发记录/临时/战斗平台桥检查/', import.meta.url));
const tick = () => new Promise(accept => setImmediate(accept));

test('relocated defaults point to project resources and the existing Three.js directory', () => {
  const project = fileURLToPath(new URL('../../../..', import.meta.url));
  assert.equal(defaultArchiveRoot, resolve(project, '模组'));
  assert.equal(threeRoot, resolve(project, '资源/程序/骰盘/node_modules/three'));
});

test('embedding accepts one exact local origin and rejects hosts, wildcards and URL suffixes', () => {
  assert.equal(normalizeEmbedOrigin(), null);
  assert.equal(normalizeEmbedOrigin('http://127.0.0.1:4198'), 'http://127.0.0.1:4198');
  for (const value of ['*', 'https://127.0.0.1:4198', 'http://localhost:4198', 'http://127.0.0.1:4198/',
    'http://127.0.0.1:4198/path', 'http://127.0.0.1:4198?x', 'http://127.0.0.1:0', 'http://127.0.0.1:99999',
    'http://127.0.0.1:04198', 'http://127.0.0.1:80', 'http://127.0.0.1:4198\n']) assert.throws(() => normalizeEmbedOrigin(value));
});

test('the bridge checks source, exact origin and message shape, and returns lifecycle booleans only', async () => {
  const messages = [], calls = [];
  let receive, visible = true, allowed = false;
  const parent = { postMessage(value, origin) { messages.push({ value, origin }); } };
  const host = { parent, addEventListener(name, handler) { assert.equal(name, 'message'); receive = handler; }, removeEventListener(name, handler) { assert.equal(handler, receive); receive = null; } };
  const lifecycle = {
    canLeave() { calls.push('canLeave'); return allowed; },
    setVisible(value) { calls.push('visible:' + value); visible = value; return true; },
    logout() { calls.push('logout'); return true; }, get visible() { return visible; }
  };
  const dispose = installPlatformBridge({ origin: 'http://127.0.0.1:4198', lifecycle, host });
  assert.deepEqual(calls, ['visible:false']);
  assert.deepEqual(messages[0], { value: { channel: PLATFORM_BRIDGE_CHANNEL, type: 'ready' }, origin: 'http://127.0.0.1:4198' });
  const data = { channel: PLATFORM_BRIDGE_CHANNEL, id: 'one', type: 'canLeave' };
  for (const event of [{ source: {}, origin: 'http://127.0.0.1:4198', data }, { source: parent, origin: 'http://127.0.0.1:4199', data },
    { source: parent, origin: 'http://127.0.0.1:4198', data: { ...data, type: 'action', payload: { type: 'start' } } },
    { source: parent, origin: 'http://127.0.0.1:4198', data: { ...data, type: 'setVisible', visible: 'yes' } }]) receive(event);
  await tick(); assert.equal(messages.length, 1);
  receive({ source: parent, origin: 'http://127.0.0.1:4198', data });
  await tick(); assert.deepEqual(messages[1].value, { channel: PLATFORM_BRIDGE_CHANNEL, id: 'one', type: 'reply', ok: true, allowed: false, visible: false });
  allowed = true;
  receive({ source: parent, origin: 'http://127.0.0.1:4198', data: { ...data, id: 'two', type: 'setVisible', visible: true } });
  receive({ source: parent, origin: 'http://127.0.0.1:4198', data: { ...data, id: 'three', type: 'logout' } });
  await tick();
  assert.deepEqual(calls, ['visible:false', 'canLeave', 'visible:true', 'logout']);
  assert(messages.every(({ value }) => Object.keys(value).every(key => ['channel', 'id', 'type', 'ok', 'allowed', 'visible'].includes(key))));
  dispose(); assert.equal(receive, null);
});

test('a standalone window or invalid origin never installs a parent bridge', () => {
  const host = { addEventListener() { throw new Error('bridge should stay disabled'); } }; host.parent = host;
  installPlatformBridge({ origin: 'http://127.0.0.1:4198', lifecycle: {}, host })();
  installPlatformBridge({ origin: '*', lifecycle: {}, host: { ...host, parent: {} } })();
});

test('server preserves standalone frame denial and opts in only for the configured parent', async () => {
  await mkdir(output, { recursive: true });
  const campaignDir = await mkdtemp(join(output, 'campaign-'));
  let app = await startApp({ campaignDir, initial: fixture, port: 0 });
  try {
    const response = await fetch(app.url);
    assert(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.equal((await (await fetch(app.url + '/api/client-info')).json()).embedOrigin, null);
    assert.equal((await fetch(app.url + '/vendor/three.module.js')).status, 200);
  } finally { await app.close(); }
  app = await startApp({ campaignDir, initial: fixture, port: 0, embedOrigin: 'http://127.0.0.1:4198' });
  try {
    const response = await fetch(app.url);
    assert(response.headers.get('content-security-policy').includes('frame-ancestors http://127.0.0.1:4198'));
    assert(!response.headers.get('content-security-policy').includes('frame-ancestors *'));
    const info = await (await fetch(app.url + '/api/client-info')).json();
    assert.deepEqual(info, { audience: 'local', embedOrigin: 'http://127.0.0.1:4198' });
    const health = await (await fetch(app.url + '/health')).json();
    assert.equal(health.coreVersion, 'class-resource-tests-v8'); assert.equal(health.capabilities.platformBridge, 1);
    assert.equal((await fetch(app.url + '/platform-bridge.mjs')).status, 200);
    assert.equal((await fetch(app.url + '/project-paths.mjs')).status, 404);
  } finally { await app.close(); }
  await assert.rejects(startApp({ embedOrigin: 'https://invalid.example' }));
});

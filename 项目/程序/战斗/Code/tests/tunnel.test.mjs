import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { createTunnel } from '../src/tunnel.mjs';

function fakeChild() {
  const child = new EventEmitter();
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null, signalCode: null,
    kill() { this.signalCode = 'SIGTERM'; this.emit('exit', null, 'SIGTERM'); } });
  return child;
}
test('tunnel waits for registration, launches hidden without a shell, and stops its helper', async () => {
  const child = fakeChild();
  let invocation;
  const tunnel = createTunnel({ executable: 'C:/test/cloudflared.exe', checkExecutable: async () => {},
    spawnProcess: (...args) => { invocation = args; return child; } });
  try {
    assert.equal((await tunnel.start('http://127.0.0.1:12345')).status, 'starting');
    assert(invocation[1].includes('http://127.0.0.1:12345'));
    assert.equal(invocation[2].windowsHide, true); assert.equal(invocation[2].shell, undefined);
    child.stderr.write('https://test-'); child.stderr.write('table.trycloudflare.com\n');
    assert.equal(tunnel.state.status, 'starting'); assert.equal(tunnel.state.url, 'https://test-table.trycloudflare.com');
    child.stderr.write('Registered tunnel connection connIndex=0\n');
    assert.equal(tunnel.state.status, 'ready');
    await tunnel.stop();
    assert.equal(child.signalCode, 'SIGTERM'); assert.deepEqual(tunnel.state, { status: 'stopped', url: null, error: null });
  } finally { await tunnel.stop(); }
});

test('missing tool is actionable and timeout or process failure never exposes raw helper logs', async () => {
  const missing = createTunnel({ executable: 'missing', checkExecutable: async () => { throw new Error('ENOENT'); } });
  await assert.rejects(missing.start('http://127.0.0.1:1'), error => error.status === 503 && error.message.includes('cloudflared'));
  const child = fakeChild();
  const tunnel = createTunnel({ executable: 'C:/test/cloudflared.exe', checkExecutable: async () => {},
    spawnProcess: () => child, timeoutMs: 10 });
  await tunnel.start('http://127.0.0.1:1');
  child.stderr.write('PRIVATE_RAW_HELPER_DETAILS\n');
  await delay(30);
  assert.equal(tunnel.state.status, 'error'); assert.equal(tunnel.state.url, null);
  assert(!JSON.stringify(tunnel.state).includes('PRIVATE_RAW_HELPER_DETAILS'));
  assert.equal(child.signalCode, 'SIGTERM');
  await tunnel.stop();
});

test('late output from a stopped helper cannot replace a new bridge address', async () => {
  const children = [];
  const tunnel = createTunnel({ executable: 'C:/test/cloudflared.exe', checkExecutable: async () => {},
    spawnProcess: () => { const child = fakeChild(); children.push(child); return child; } });
  await tunnel.start('http://127.0.0.1:1');
  await tunnel.stop();
  await tunnel.start('http://127.0.0.1:2');
  children[0].stderr.write('https://old-table.trycloudflare.com Registered tunnel connection\n');
  assert.equal(tunnel.state.url, null);
  children[1].stderr.write('https://new-table.trycloudflare.com Registered tunnel connection\n');
  assert.equal(tunnel.state.url, 'https://new-table.trycloudflare.com');
  await tunnel.stop();
});

test('retry stops an errored helper before starting another and ignores its late exit', async () => {
  const children = [];
  const tunnel = createTunnel({ executable: 'C:/test/cloudflared.exe', checkExecutable: async () => {},
    spawnProcess: () => { const child = fakeChild(); children.push(child); return child; } });
  await tunnel.start('http://127.0.0.1:1');
  children[0].emit('error', new Error('synthetic process error'));
  assert.equal(tunnel.state.status, 'error');
  await tunnel.start('http://127.0.0.1:1');
  assert.equal(children[0].signalCode, 'SIGTERM');
  children[0].emit('exit', 1);
  children[1].stderr.write('https://retry-table.trycloudflare.com Registered tunnel connection\n');
  assert.equal(tunnel.state.status, 'ready');
  await tunnel.stop();
  assert.equal(children[1].signalCode, 'SIGTERM');
});

test('stop during tool inspection cancels the pending startup', async () => {
  let resolveCheck, spawned = false;
  const tunnel = createTunnel({ executable: 'C:/test/cloudflared.exe',
    checkExecutable: () => new Promise(resolve => { resolveCheck = resolve; }),
    spawnProcess: () => { spawned = true; return fakeChild(); } });
  const starting = tunnel.start('http://127.0.0.1:1');
  await delay(0);
  await tunnel.stop();
  resolveCheck();
  await starting;
  assert.equal(spawned, false); assert.equal(tunnel.state.status, 'stopped');
});

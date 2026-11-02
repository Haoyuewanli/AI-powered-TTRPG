import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { startPlatform } from '../server.mjs';
import { outputDirectory } from './check-helpers.mjs';

async function fixture(nativeWindow) {
  await mkdir(outputDirectory, { recursive: true });
  const projectRoot = await mkdtemp(join(outputDirectory, 'native-window-http-'));
  return startPlatform({ port: 0, projectRoot, appearanceFile: join(projectRoot, '外观.json'), nativeWindow });
}
async function current(app) {
  const response = await fetch(app.url + '/api/appearance');
  return { value: await response.json(), etag: response.headers.get('etag') };
}
const save = (app, value, etag, native = true) => fetch(app.url + '/api/appearance', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': etag, ...(native ? { 'X-Platform-Window': 'application' } : {}) }, body: JSON.stringify(value)
});

test('only an application-window preset change resizes after a successful appearance save', async () => {
  const calls = [], app = await fixture({ async resize(preset) { calls.push(preset); return { status: 'resized', width: 1800, height: 1350, scaled: true }; } });
  try {
    let state = await current(app); state.value.appearanceProfiles['2560x1600'].ground = '#123456';
    let response = await save(app, state.value, state.etag); assert.equal(response.status, 200); assert.deepEqual(calls, []);
    state = await current(app); state.value.displayPreset = '2560x1440';
    response = await save(app, state.value, state.etag, false); assert.equal(response.status, 200); assert.equal(response.headers.get('x-platform-window-state'), 'browser'); assert.deepEqual(calls, []);
    state = await current(app); state.value.displayPreset = '1920x1440';
    response = await save(app, state.value, state.etag); assert.equal(response.status, 200); assert.deepEqual(calls, ['1920x1440']);
    assert.equal(response.headers.get('x-platform-window-size'), '1800x1350'); assert.equal(response.headers.get('x-platform-window-scaled'), '1');
    assert.equal((await response.json()).displayPreset, '1920x1440');
  } finally { await app.close(); }
});

test('stale revisions, invalid dimensions and a concurrent loser cannot move a native window', async () => {
  const calls = [], app = await fixture({ async resize(preset) { calls.push(preset); return { status: 'resized', width: 2048, height: 1536 }; } });
  try {
    const state = await current(app), draft = { ...state.value, displayPreset: '2048x1536' };
    for (const invalid of [{ ...draft, width: 1000 }, { ...draft, displayPreset: '1000x1000' }]) assert.equal((await save(app, invalid, state.etag)).status, 422);
    assert.equal((await save(app, draft, 'stale')).status, 409); assert.deepEqual(calls, []);
    const responses = await Promise.all([save(app, draft, state.etag), save(app, draft, state.etag)]);
    assert.deepEqual(responses.map(x => x.status).sort(), [200, 409]); assert.deepEqual(calls, ['2048x1536']);
  } finally { await app.close(); }
});

test('native failure is reported honestly while the selected preset remains saved for reopening', async () => {
  const app = await fixture({ async resize() { throw new Error('synthetic native failure'); } });
  try {
    const state = await current(app); state.value.displayPreset = '1920x1440';
    const response = await save(app, state.value, state.etag);
    assert.equal(response.status, 200); assert.equal(response.headers.get('x-platform-window-state'), 'failed'); assert.equal(response.headers.get('x-platform-window-size'), null);
    assert.equal((await current(app)).value.displayPreset, '1920x1440');
  } finally { await app.close(); }
});

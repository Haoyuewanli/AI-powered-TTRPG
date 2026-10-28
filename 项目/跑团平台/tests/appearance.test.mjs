import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { outputDirectory } from './check-helpers.mjs';
import { createAppearanceStore, defaultAppearance, validateAppearance, displayPresets } from '../appearance-store.mjs';
import { startPlatform } from '../server.mjs';

async function fixture() {
  await mkdir(outputDirectory, { recursive: true });
  const directory = await mkdtemp(join(outputDirectory, 'appearance-'));
  return { directory, path: join(directory, '外观.json') };
}

test('appearance persists four distinct profiles and rejects unknown or invalid settings without overwriting', async () => {
  const { path } = await fixture();
  const store = createAppearanceStore(path);
  const initial = await store.read();
  assert.equal(initial.etag, 'new');
  await assert.rejects(access(path), { code: 'ENOENT' });
  const value = initial.value;
  displayPresets.forEach((key, index) => Object.assign(value.appearanceProfiles[key], {
    preset: 'custom', ground: '#12345' + index, floorPercent: index * 5, lift: 2 + index, strength: 60 + index,
    gradient: { start: '#FFFFFF', end: '#ABCDEF' }
  }));
  value.displayPreset = '1920x1440';
  const saved = await store.save(value, initial.etag);
  assert.equal(saved.value.revision, 1);
  assert.deepEqual((await createAppearanceStore(path).read()).value, saved.value);
  const bytes = await readFile(path, 'utf8');
  for (const mutate of [
    candidate => { candidate.appearanceProfiles['1920x1440'].floorPercent = 21; },
    candidate => { candidate.appearanceProfiles['1920x1440'].lift = 1; },
    candidate => { candidate.appearanceProfiles['1920x1440'].strength = 101; },
    candidate => { candidate.appearanceProfiles['1920x1440'].gradient.end = 'red'; },
    candidate => { candidate.appearanceProfiles['1920x1440'].secret = 'unexpected'; },
    candidate => { delete candidate.appearanceProfiles['2048x1536']; },
    candidate => { candidate.schemaVersion = 2; }
  ]) {
    const candidate = structuredClone(saved.value); mutate(candidate);
    assert.throws(() => validateAppearance(candidate), error => error.status === 422);
    await assert.rejects(store.save(candidate, saved.etag), error => error.status === 422);
    assert.equal(await readFile(path, 'utf8'), bytes);
  }
});

test('concurrent and externally changed appearance saves preserve the winner and a backup', async () => {
  const { path } = await fixture(); const store = createAppearanceStore(path);
  const first = await store.read();
  const candidates = [structuredClone(first.value), structuredClone(first.value)];
  candidates[0].appearanceProfiles['2560x1600'].floorPercent = 0;
  candidates[1].appearanceProfiles['2560x1600'].floorPercent = 20;
  const results = await Promise.allSettled(candidates.map(value => store.save(value, first.etag)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  const winner = await store.read();
  const oldBytes = await readFile(path, 'utf8');
  const next = structuredClone(winner.value); next.displayPreset = '2048x1536';
  const second = await store.save(next, winner.etag);
  assert.equal(await readFile(path + '.bak', 'utf8'), oldBytes);
  const external = structuredClone(second.value); external.appearanceProfiles['2560x1440'].ground = '#102030';
  await writeFile(path, JSON.stringify(external) + '\n');
  await assert.rejects(store.save(second.value, second.etag), error => error.status === 409);
  assert.deepEqual((await store.read()).value, external);
  await writeFile(path, '{broken');
  await assert.rejects(store.read(), error => error.status === 422);
  await assert.rejects(store.save(defaultAppearance(), 'new'), error => error.status === 422);
  assert.equal(await readFile(path, 'utf8'), '{broken');
});

test('appearance HTTP API requires a matching revision and digest and survives service restart', async () => {
  const { path } = await fixture(); let app = await startPlatform({ port: 0, appearanceFile: path });
  try {
    const response = await fetch(app.url + '/api/appearance');
    const value = await response.json(), tag = response.headers.get('etag');
    assert.equal(response.status, 200); assert.equal(tag, 'new');
    value.appearanceProfiles['2048x1536'].floorPercent = 20;
    const missing = await fetch(app.url + '/api/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal(missing.status, 409);
    const saved = await fetch(app.url + '/api/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': tag }, body: JSON.stringify(value) });
    assert.equal(saved.status, 200); const state = await saved.json();
    assert.equal(state.revision, 1); assert.notEqual(saved.headers.get('etag'), tag);
    const stale = await fetch(app.url + '/api/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': tag }, body: JSON.stringify(value) });
    assert.equal(stale.status, 409);
    const foreign = await fetch(app.url + '/api/appearance', { method: 'POST', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json', 'If-Match': saved.headers.get('etag') }, body: JSON.stringify(state) });
    assert.equal(foreign.status, 403);
    await app.close(); app = await startPlatform({ port: 0, appearanceFile: path });
    assert.deepEqual(await (await fetch(app.url + '/api/appearance')).json(), state);
    await writeFile(path, '{not-json');
    assert.equal((await fetch(app.url + '/api/appearance')).status, 422);
    assert.equal((await fetch(app.url + '/api/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': saved.headers.get('etag') }, body: JSON.stringify(state) })).status, 422);
    assert.equal(await readFile(path, 'utf8'), '{not-json');
  } finally { await app.close(); }
});

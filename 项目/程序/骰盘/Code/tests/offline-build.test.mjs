import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOffline } from '../build-offline.mjs';

test('one offline HTML contains the same UI, code and licenses without sibling assets', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'dice-offline-'));
  const output = join(folder, '独立骰盘.html');
  const first = await buildOffline(output);
  const second = await buildOffline(output);
  const html = await readFile(output, 'utf8');
  assert.equal(first.sha256, second.sha256, 'identical inputs must produce identical offline files');
  assert.match(html, /dice-distribution" content="offline-v1/);
  assert.doesNotMatch(html, /<link rel="stylesheet"/);
  assert.doesNotMatch(html, /<script[^>]+src="(?:https?:|\/)/);
  assert.match(html, /globalThis.{0,80}dice-box-threejs/);
  const entry = html.match(/<script type="module" src="data:text\/javascript;base64,([^"]+)"/);
  assert.ok(entry);
  const source = Buffer.from(entry[1], 'base64').toString('utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.match(source, /export const animator/);
  assert.match(source, /cryptoSource\.getRandomValues/);
  for (const license of ['@3d-dice/dice-box-threejs/LICENSE', 'three/LICENSE', 'cannon-es/LICENSE']) {
    assert.ok(html.includes(license), license);
  }
});

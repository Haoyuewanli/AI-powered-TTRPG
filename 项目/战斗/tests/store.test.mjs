import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openStore, atomicJson } from '../src/store.mjs';
import { fixture, command, dm } from './fixture.mjs';
const output = fileURLToPath(new URL('../../../开发记录/临时/战斗测试/', import.meta.url));
async function directory() { await mkdir(output, { recursive: true }); return mkdtemp(join(output, 'store-')); }

test('saved state survives restart; a second process cannot own the same campaign', async () => {
  const dir = await directory(), store = await openStore(dir, fixture);
  await assert.rejects(openStore(dir, fixture), /另一个进程/);
  await store.dispatch(command(store.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 25 } }), dm);
  await store.close();
  const restored = await openStore(dir, fixture);
  assert.equal(restored.state.actors[0].hp, 25); assert.equal(restored.state.revision, 1);
  await restored.close();
});
test('concurrent proposals serialize and stale one cannot overwrite new progress', async () => {
  const store = await openStore(await directory(), fixture);
  const first = command(store.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 25 } });
  const second = command(store.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 10 } });
  const result = await Promise.allSettled([store.dispatch(first, dm), store.dispatch(second, dm)]);
  assert.equal(result[0].status, 'fulfilled'); assert.equal(result[1].status, 'rejected');
  assert.equal(store.state.actors[0].hp, 25); await store.close();
});
test('failed primary save leaves both committed memory and primary file unchanged', async () => {
  const dir = await directory();
  const store = await openStore(dir, fixture, { persist: async (path, value) => {
    if (path.endsWith('战斗状态.json')) throw new Error('模拟磁盘故障');
    return atomicJson(path, value);
  } });
  const before = await readFile(join(dir, '战斗状态.json'), 'utf8');
  await assert.rejects(store.dispatch(command(store.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 10 } }), dm), /磁盘故障/);
  assert.equal(store.state.revision, 0);
  assert.equal(await readFile(join(dir, '战斗状态.json'), 'utf8'), before); await store.close();
});
test('corrupt primary is preserved and last valid backup recovers with a visible notice', async () => {
  const dir = await directory(); const first = await openStore(dir, fixture);
  await first.dispatch(command(first.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 10 } }), dm);
  await first.close(); await writeFile(join(dir, '战斗状态.json'), '{broken');
  const recovered = await openStore(dir, fixture);
  assert.equal(recovered.state.actors[0].hp, 40); assert(recovered.recoveryNote.includes('恢复'));
  await recovered.close();
});

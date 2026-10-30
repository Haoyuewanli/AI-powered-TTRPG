import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, openStore } from '../src/store.mjs';
import { fixture, command, dm } from './fixture.mjs';

const output = fileURLToPath(new URL('../../../../../开发记录/临时/战斗测试/', import.meta.url));
const delays = [20, 40, 80, 160, 200];
async function directory() {
  await mkdir(output, { recursive: true });
  return mkdtemp(join(output, 'atomic-'));
}
const locked = code => Object.assign(new Error('Synthetic locked destination'), { code });

test('Windows transient replacement locks retry the same complete temporary file', async () => {
  for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
    const dir = await directory(), target = join(dir, '状态.json');
    const before = '{"original":true}\n', next = { saved: code };
    await writeFile(target, before);
    const attempts = [], waited = [];
    await atomicJson(target, next, { platform: 'win32', wait: async ms => { waited.push(ms); },
      renameFile: async (source, destination) => {
        attempts.push([source, destination]);
        assert.equal(await readFile(target, 'utf8'), before);
        assert.deepEqual(JSON.parse(await readFile(source, 'utf8')), next);
        if (attempts.length <= 2) throw locked(code);
        return rename(source, destination);
      }
    });
    assert(attempts.length >= 3 && attempts.length <= 6);
    assert(attempts.every(([source, destination]) => source === attempts[0][0] && destination === target));
    assert.deepEqual(waited, delays.slice(0, attempts.length - 1));
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), next);
    assert.deepEqual(await readdir(dir), ['状态.json']);
  }
});

test('a persistent Windows lock stops after six attempts and preserves committed memory and files', async () => {
  const dir = await directory(), target = join(dir, '战斗状态.json');
  const error = locked('EPERM'), waited = [];
  let attempts = 0, executions = 0;
  const store = await openStore(dir, fixture, { persist: (path, value) => path === target ? atomicJson(path, value, {
    platform: 'win32', wait: async ms => { waited.push(ms); },
    renameFile: async () => { attempts++; throw error; }
  }) : atomicJson(path, value) });
  try {
    const before = store.state, original = await readFile(target, 'utf8');
    await assert.rejects(store.dispatch(command(before, 'edit-actor', { actorId: 'pc-001', patch: { hp: 10 } }), dm, {
      id: () => { executions++; return 'atomic-failed-event'; }
    }), failure => failure === error);
    assert.equal(attempts, 6); assert.deepEqual(waited, delays); assert.equal(executions, 1);
    assert.deepEqual(store.state, before);
    assert.equal(await readFile(target, 'utf8'), original);
    assert.deepEqual(JSON.parse(await readFile(join(dir, '战斗状态.previous.json'), 'utf8')), before);
    assert(!(await readdir(dir)).some(name => name.endsWith('.tmp')));
  } finally { await store.close(); }
});

test('a transient Windows lock commits once without executing the rule again', async () => {
  const dir = await directory(), target = join(dir, '战斗状态.json');
  let attempts = 0, executions = 0;
  const store = await openStore(dir, fixture, { persist: (path, value) => path === target ? atomicJson(path, value, {
    platform: 'win32', wait: async () => {},
    renameFile: async (source, destination) => {
      attempts++;
      if (attempts <= 2) throw locked('EBUSY');
      return rename(source, destination);
    }
  }) : atomicJson(path, value) });
  try {
    await store.dispatch(command(store.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 10 } }), dm, {
      id: () => { executions++; return 'atomic-saved-event'; }
    });
    assert(attempts >= 3 && attempts <= 6); assert.equal(executions, 1);
    assert.equal(store.state.revision, 1); assert.equal(store.state.actors[0].hp, 10);
    assert.equal(store.state.events.length, 1); assert.equal(store.state.appliedIds.length, 1);
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), store.state);
  } finally { await store.close(); }
});

test('non-Windows replacement errors are not retried and leave the old file intact', async () => {
  const dir = await directory(), target = join(dir, '状态.json');
  await writeFile(target, 'original');
  let attempts = 0, waits = 0;
  await assert.rejects(atomicJson(target, { next: true }, { platform: 'linux',
    wait: async () => { waits++; }, renameFile: async () => { attempts++; throw locked('EPERM'); }
  }), { code: 'EPERM' });
  assert.equal(attempts, 1); assert.equal(waits, 0);
  assert.equal(await readFile(target, 'utf8'), 'original');
  assert.deepEqual(await readdir(dir), ['状态.json']);
});

test('Windows errors outside temporary permission or busy codes fail immediately', async () => {
  const dir = await directory(), target = join(dir, '状态.json');
  await writeFile(target, 'original');
  let attempts = 0, waits = 0;
  await assert.rejects(atomicJson(target, { next: true }, { platform: 'win32',
    wait: async () => { waits++; }, renameFile: async () => { attempts++; throw locked('ENOSPC'); }
  }), { code: 'ENOSPC' });
  assert.equal(attempts, 1); assert.equal(waits, 0);
  assert.equal(await readFile(target, 'utf8'), 'original');
  assert.deepEqual(await readdir(dir), ['状态.json']);
});

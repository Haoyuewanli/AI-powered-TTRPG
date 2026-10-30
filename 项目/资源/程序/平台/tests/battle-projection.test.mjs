import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBattleProjection } from '../battle-projection.mjs';
import { openProjectFiles } from '../project-files.mjs';

let repository = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(repository, 'AGENTS.md'))) { const parent = dirname(repository); if (parent === repository) throw new Error('Run inside the workspace'); repository = parent; }
const output = join(repository, '开发记录/临时/战斗投影检查');
const text = value => JSON.stringify(value, null, 2) + '\n';

function state(battleId = 'battle-one', campaignId = 'campaign-one') {
  return { formatVersion: 2, campaignId, battleId, revision: 7, title: '合成战斗',
    board: { width: 100, depth: 80 }, objects: [{ id: 'wall-one', kind: 'wall', hidden: true }],
    actors: [{ id: 'actor-one', kind: 'pc', name: '爱丽丝', maxHp: 12, hp: 9, tempHp: 2, position: { x: 1, z: 1 },
      resourcePools: [{ id: 'slots-one', kind: 'slots', max: 3, current: 1, level: 1, recovery: { long: 'all' } }], inventory: { items: [] } },
    { id: 'actor-two', kind: 'npc', name: '爱丽丝', maxHp: 8, hp: 8, tempHp: 0, position: { x: 10, z: 10 }, resourcePools: [] }],
    combat: { phase: 'preparing', round: 0 }, events: [{ at: '2026-10-28T00:00:00.000Z', revision: 7, dmText: '合成事件：旅人到桥边。', text: '旅人到桥边。' }] };
}

async function fixture(prefix = 'case-') {
  await mkdir(output, { recursive: true }); const directory = await mkdtemp(join(output, prefix)), root = join(directory, '项目');
  const files = await openProjectFiles({ root }); await files.initialize(); const projection = createBattleProjection({ root, files });
  return { root, files, projection,
    async source(value) { const path = `模组/${value.campaignId}/战斗/存档/战斗/${value.battleId}/战斗状态.json`; await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text(value)); return path; },
    async read(path) { return JSON.parse(await readFile(join(root, path), 'utf8')); }
  };
}
const selection = snapshot => ({ campaignId: snapshot.campaignId, campaignName: '合成团', battleId: snapshot.battleId, battleName: '合成战斗' });

test('projection creates immutable actor/map bases, negative HP and slot deltas, relative calls and a TXT log in one transaction', async () => {
  const fixtureValue = await fixture('first-'); const { root, files, projection } = fixtureValue;
  const snapshot = state(), before = structuredClone(snapshot), sourcePath = await fixtureValue.source(snapshot), sourceBytes = await readFile(join(root, sourcePath));
  const result = await projection.sync({ state: snapshot, selection: selection(snapshot), sourcePath });
  assert.equal(result.changed, true); assert.equal(result.revision, 1, 'one projection is one complete file transaction');
  assert.deepEqual(snapshot, before); assert.deepEqual(await readFile(join(root, sourcePath)), sourceBytes);
  const call = await fixtureValue.read(result.callPath); assert.equal(call.moduleId, 'campaign:campaign-one');
  assert.equal(call.resources.length, 3); assert.equal(call.current.instanceIds.length, 3);
  assert.equal(call.payload.projection.sourcePath, sourcePath); assert.equal(call.payload.projection.authoritative, false);
  const listed = await files.listResources(); assert.equal(listed.resources.length, 3);
  const player = listed.resources.find(entry => entry.kind === '角色'); const base = await fixtureValue.read(player.path);
  assert.equal(base.data.actor.hp, 12); assert.equal(base.data.actor.resourcePools[0].current, 3);
  const current = await fixtureValue.read(call.current.path); const instance = current.instances.find(entry => entry.resourceId === player.id);
  assert.equal(instance.delta.hp, -3); assert.equal(instance.delta.tempHp, 2); assert.equal(instance.delta.resourcePools[0].current, -2);
  const log = await readFile(join(root, result.logPath), 'utf8'); assert(log.includes('2026-10-28T00:00:00.000Z')); assert(log.includes('合成事件'));
});

test('same battle revision performs no writes across repeats or adapter reopen and differing content at that revision is rejected', async () => {
  const fixtureValue = await fixture('idempotent-'); const { root, files, projection } = fixtureValue; const snapshot = state(), sourcePath = await fixtureValue.source(snapshot);
  const first = await projection.sync({ state: snapshot, selection: selection(snapshot), sourcePath });
  const indexBefore = await readFile(join(root, '资源/故事/G/管理索引.json'));
  assert.equal((await projection.sync({ state: snapshot, selection: selection(snapshot), sourcePath })).changed, false);
  const reopened = createBattleProjection({ root, files });
  assert.equal((await reopened.sync({ state: snapshot, selection: selection(snapshot), sourcePath })).changed, false);
  assert.deepEqual(await readFile(join(root, '资源/故事/G/管理索引.json')), indexBefore);
  const conflicting = structuredClone(snapshot); conflicting.actors[0].hp--;
  await assert.rejects(projection.sync({ state: conflicting, selection: selection(snapshot), sourcePath }), /同一战斗版本/);
  assert.equal((await files.manifest()).revision, first.revision);
});

test('a new revision updates deltas and explicit absolute overrides while leaving original shared bases unchanged', async () => {
  const fixtureValue = await fixture('update-'); const { root, files, projection } = fixtureValue; const snapshot = state(), sourcePath = await fixtureValue.source(snapshot);
  const first = await projection.sync({ state: snapshot, selection: selection(snapshot), sourcePath });
  const resources = (await files.listResources()).resources; const bases = await Promise.all(resources.map(async entry => ({ path: entry.path, bytes: await readFile(join(root, entry.path)) })));
  const next = structuredClone(snapshot); next.revision++; next.actors[0].hp = 5; next.actors[0].position.x = 15; next.actors[0].resourcePools[0].current = 0; next.objects.push({ id: 'wall-two' });
  await fixtureValue.source(next); const result = await projection.sync({ state: next, selection: selection(next), sourcePath });
  assert.equal(result.revision, first.revision + 1);
  const call = await fixtureValue.read(result.callPath), current = await fixtureValue.read(call.current.path);
  const instance = current.instances.find(entry => entry.resourceId === resources.find(entry => entry.kind === '角色').id);
  assert.equal(instance.delta.hp, -7); assert.equal(instance.delta.resourcePools[0].current, -3);
  assert.equal(instance.delta.otherState.mode, 'absolute-overrides'); assert.deepEqual(instance.delta.otherState.set.position, { x: 15, z: 1 });
  for (const base of bases) assert.deepEqual(await readFile(join(root, base.path)), base.bytes);
});

test('edited shared definitions remain untouched and become the declared baseline for later deltas', async () => {
  const fixtureValue = await fixture('shared-edit-'); const { root, files, projection } = fixtureValue; const snapshot = state(), sourcePath = await fixtureValue.source(snapshot);
  await projection.sync({ state: snapshot, selection: selection(snapshot), sourcePath });
  const resource = (await files.listResources()).resources.find(entry => entry.kind === '角色'), base = await fixtureValue.read(resource.path);
  base.name = '用户调整过的基准'; base.data.actor.hp = 15; base.data.actor.maxHp = 15; await writeFile(join(root, resource.path), text(base));
  const before = await readFile(join(root, resource.path)), next = structuredClone(snapshot); next.revision++; next.actors[0].hp = 8; await fixtureValue.source(next);
  const result = await projection.sync({ state: next, selection: selection(next), sourcePath });
  assert.deepEqual(await readFile(join(root, resource.path)), before);
  const call = await fixtureValue.read(result.callPath), current = await fixtureValue.read(call.current.path);
  assert.equal(current.instances.find(entry => entry.resourceId === resource.id).delta.hp, -7);
});

test('same-campaign actors share definitions across battles but every current instance remains battle-specific', async () => {
  const fixtureValue = await fixture('cross-battle-'); const { files, projection } = fixtureValue;
  const first = state(), second = state('battle-two'); second.actors[0].hp = 4;
  const firstCall = await projection.sync({ state: first, selection: selection(first), sourcePath: await fixtureValue.source(first) });
  const secondCall = await projection.sync({ state: second, selection: selection(second), sourcePath: await fixtureValue.source(second) });
  const one = await fixtureValue.read(firstCall.callPath), two = await fixtureValue.read(secondCall.callPath);
  const pc = (await files.listResources()).resources.filter(entry => entry.kind === '角色'); assert.equal(pc.length, 1);
  const current = await fixtureValue.read(one.current.path), pcInstances = current.instances.filter(entry => entry.resourceId === pc[0].id);
  assert.equal(pcInstances.length, 2); assert.notEqual(pcInstances[0].id, pcInstances[1].id);
  assert.deepEqual(pcInstances.map(entry => entry.delta.hp).sort((a, b) => a - b), [-8, -3]);
  assert(!one.current.instanceIds.some(id => two.current.instanceIds.includes(id)));
});

test('duplicate names, unsafe names and separate campaigns never overwrite one another', async () => {
  const fixtureValue = await fixture('names-'); const { projection, files } = fixtureValue;
  const first = state(), second = state('battle-one', 'campaign-two'); second.actors[0].name = '同名/非法:角色'; second.actors[1].name = '同名/非法:角色';
  const one = await projection.sync({ state: first, selection: selection(first), sourcePath: await fixtureValue.source(first) });
  const two = await projection.sync({ state: second, selection: selection(second), sourcePath: await fixtureValue.source(second) });
  assert.notEqual(one.callPath, two.callPath); assert(two.callPath.includes('--'));
  const resources = (await files.listResources()).resources;
  assert.equal(resources.filter(entry => entry.kind === '角色' || entry.kind === 'NPC').length, 4);
  assert.equal(new Set(resources.map(entry => entry.path)).size, resources.length);
});

test('external projection edits cause an explicit conflict without changing authority, bases or the last completed call', async () => {
  const fixtureValue = await fixture('conflict-'); const { root, files, projection } = fixtureValue; const snapshot = state(), sourcePath = await fixtureValue.source(snapshot);
  const first = await projection.sync({ state: snapshot, selection: selection(snapshot), sourcePath });
  const call = await fixtureValue.read(first.callPath), current = await fixtureValue.read(call.current.path), callBefore = await readFile(join(root, first.callPath));
  current.instances[0].delta.hp = -99; await writeFile(join(root, call.current.path), text(current)); const editedBytes = await readFile(join(root, call.current.path));
  const next = structuredClone(snapshot); next.revision++; next.actors[0].hp--; await fixtureValue.source(next); const sourceBefore = await readFile(join(root, sourcePath));
  await assert.rejects(projection.sync({ state: next, selection: selection(next), sourcePath }), /其他程序修改/);
  assert.deepEqual(await readFile(join(root, call.current.path)), editedBytes); assert.deepEqual(await readFile(join(root, first.callPath)), callBefore);
  assert.deepEqual(await readFile(join(root, sourcePath)), sourceBefore); assert.equal((await files.manifest()).revision, first.revision);
});

test('oversized logs and invalid source references are rejected before any projection files are written', async () => {
  const fixtureValue = await fixture('bounds-'); const { files, projection } = fixtureValue; const snapshot = state(), sourcePath = await fixtureValue.source(snapshot);
  snapshot.events[0].dmText = 'x'.repeat(1000001);
  await assert.rejects(projection.sync({ state: snapshot, selection: selection(snapshot), sourcePath }), /未截断/);
  assert.equal((await files.manifest()).revision, 0); assert.equal((await files.listResources()).resources.length, 0);
  const valid = state(); await assert.rejects(projection.sync({ state: valid, selection: selection(valid), sourcePath: '../outside.json' }), /相对路径/);
  assert.equal((await files.manifest()).revision, 0);
});

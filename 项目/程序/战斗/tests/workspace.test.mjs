import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWorkspace, upgradeBattle } from '../src/workspace.mjs';
import { executeAction, rollD20, rollDamage } from '../src/rules.mjs';
import { fixture, active, dm, player, command } from './fixture.mjs';
const output = fileURLToPath(new URL('../../../../开发记录/临时/多团检查/', import.meta.url));
async function paths() { await mkdir(output, { recursive: true }); const root = await mkdtemp(join(output, 'test-')); const seed = join(root, 'seed'); await mkdir(seed); return { seedDirectory: seed, workspaceDirectory: join(root, 'library'), initial: fixture }; }
const v2 = () => upgradeBattle(active(), 'test-campaign', 'test-battle');

test('physical dice validate face ranges and advantage count, without drawing program RNG', () => {
  const unexpected = () => { throw new Error('不应抽随机数'); };
  assert.equal(rollD20('advantage', unexpected, [4, 19]).natural, 19);
  assert.equal(rollDamage('1d8+3', true, unexpected, [4, 5]).total, 12);
  assert.throws(() => rollD20('normal', unexpected, [21]), /骰点/);
  assert.throws(() => rollD20('advantage', unexpected, [12]), /2颗/);
  assert.throws(() => rollDamage('1d8', true, unexpected, [4]), /2颗/);
});
test('physical critical hit, undo, repeated request and stale version retain audit and dice', () => {
  const state = v2(); state.diceMode = 'physical';
  const input = command(state, 'attack', { actorId: 'pc-001', targetId: 'npc-001', attackId: 'sword',
    manualRolls: { attack: [20], damage: [[4, 5]] } });
  const next = executeAction(state, input, player, { draw: () => { throw new Error('不应抽随机数'); } });
  assert.equal(next.actors[1].hp, 28); assert.equal(next.events.at(-1).rolls[0].source, 'physical');
  const undone = executeAction(next, command(next, 'undo'), dm);
  assert.equal(undone.actors[1].hp, 40); assert.equal(undone.combat.attacksUsed, 0); assert.equal(undone.revision, 2);
  assert.deepEqual(undone.events[0].rolls[1].values, [4, 5]); assert(undone.events[0].undoneBy);
  assert.throws(() => executeAction(undone, input, player), /已执行/);
  assert.throws(() => executeAction(next, command(next, 'undo'), player), /DM权限/);
});
test('a proposal cannot cross battles within the same campaign', () => {
  const state = v2(), input = command(state, 'next'); input.battleId = 'other-battle';
  assert.throws(() => executeAction(state, input, dm), /其他战斗/);
});
test('multiple campaigns and battles retain independent values and last selection after restart', async () => {
  const config = await paths(), library = await openWorkspace(config);
  const first = library.selection;
  await library.dispatch(command(library.store.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 25 } }), dm);
  await library.createBattle({ name: '第二场', templateBattleId: first.battleId }, dm); const second = library.selection;
  await library.dispatch(command(library.store.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 10 } }), dm);
  await library.select(first, dm); assert.equal(library.store.state.actors[0].hp, 25);
  await library.createCampaign({ name: '另一个团', copyCurrent: false }, dm); const other = library.selection;
  assert.notEqual(other.campaignId, first.campaignId);
  await library.select(second, dm); assert.equal(library.store.state.actors[0].hp, 10);
  assert.throws(() => library.context({ ...player, campaignId: first.campaignId, battleId: first.battleId }), /重新选择/);
  await assert.rejects(library.select(first, player), /DM权限/);
  await library.close();
  const restored = await openWorkspace(config);
  assert.equal(restored.selection.battleId, second.battleId); assert.equal(restored.store.state.actors[0].hp, 10);
  const catalog = await restored.catalog(dm); assert.equal(catalog.campaigns.length, 2); assert.equal(catalog.campaigns[0].battles.length, 2);
  await restored.close();
});
test('legacy migration preserves a byte-for-byte original before replacing format', async () => {
  const config = await paths();
  const original = JSON.stringify(fixture()); await writeFile(join(config.seedDirectory, '战斗状态.json'), original);
  const library = await openWorkspace(config);
  const files = await readdir(config.seedDirectory); const backup = files.find(f => f.startsWith('格式迁移前-'));
  assert(backup); assert.equal(await readFile(join(config.seedDirectory, backup), 'utf8'), original); assert.equal(JSON.parse(await readFile(join(config.seedDirectory, backup), 'utf8')).formatVersion, 1);
  assert.equal(library.store.state.formatVersion, 2); assert.equal(library.store.state.actors[0].hp, 40);
  await library.close();
});
test('missing battle files never silently initialize an existing indexed battle from seed data', async () => {
  const config = await paths(), library = await openWorkspace(config);
  await library.close();
  await rename(join(config.seedDirectory, '战斗状态.json'), join(config.seedDirectory, '保留原件.json'));
  await assert.rejects(openWorkspace(config), /主文件及备份均不存在/);
  assert.equal(JSON.parse(await readFile(join(config.seedDirectory, '保留原件.json'), 'utf8')).formatVersion, 2);
});

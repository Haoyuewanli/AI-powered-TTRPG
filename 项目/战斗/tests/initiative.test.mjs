import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { executeAction, projectState, handoff, validateState } from '../src/rules.mjs';
import { openStore } from '../src/store.mjs';
import { upgradeBattle, newBattleState } from '../src/workspace.mjs';
import { fixture, dm, player, command } from './fixture.mjs';

const seed = () => upgradeBattle(fixture(), 'test-campaign', 'test-battle');
const step = (state, type, payload = {}, principal = dm, options) => executeAction(state, command(state, type, payload), principal, options);
const neverDraw = () => { throw new Error('不得重新抽取随机数'); };
const physical = () => { const state = seed(); state.diceMode = 'physical'; return state; };
const collecting = (state = seed(), modes = {}) => step(state, 'collect-initiative', { modes });

test('DM requests initiative, players submit only their own raw dice, and start uses saved values', () => {
  const state = collecting(physical(), { 'pc-001': 'advantage', 'npc-001': 'disadvantage' });
  assert.throws(() => step(state, 'start'), /尚未齐全/);
  assert.throws(() => step(state, 'submit-initiative', { actorId: 'npc-001', rolls: [3, 4] }, player), /其他角色/);
  assert.throws(() => step(state, 'submit-initiative', { actorId: 'pc-001', rolls: [12] }, player), /2颗/);
  assert.throws(() => step(state, 'submit-initiative', { actorId: 'pc-001', rolls: [0, 21] }, player), /骰点/);
  assert.throws(() => step(state, 'submit-initiative', { actorId: 'pc-001', rolls: [4, 18], mode: 'normal' }, player), /预先设置/);
  const playerSubmitted = step(state, 'submit-initiative', { actorId: 'pc-001', rolls: [4, 18] }, player, { draw: neverDraw });
  assert.equal(playerSubmitted.initiativeCollection.entries['pc-001'].total, 20);
  assert.throws(() => step(playerSubmitted, 'start'), /尚未齐全/);
  const ready = step(playerSubmitted, 'submit-initiative', { actorId: 'npc-001', rolls: [19, 8] }, dm, { draw: neverDraw });
  assert.throws(() => step(ready, 'start', { manualRolls: { initiative: {} } }), /已经收集/);
  const active = step(ready, 'start', {}, dm, { draw: neverDraw });
  assert.deepEqual(active.combat.order, ['pc-001', 'npc-001']);
  assert.deepEqual(active.combat.initiative.map(entry => entry.total), [20, 10]);
  assert.equal(active.initiativeCollection, null);
  assert.equal(projectState(active, player).combat.initiative.length, 1);
  assert.deepEqual(projectState(active, player).combat.initiative[0].values, [4, 18]);
  assert.throws(() => step(active, 'collect-initiative'), /已经开始/);
});

test('program bulk roll fills only the selected pending entries and never rerolls a submission', () => {
  let draws = 0;
  const options = { draw: () => { draws++; return 13; } };
  const first = step(collecting(), 'submit-initiative', { actorId: 'pc-001' }, player, options);
  assert.equal(draws, 1);
  const second = step(first, 'roll-initiative', { scope: 'all' }, dm, options);
  assert.equal(draws, 2);
  assert.deepEqual(second.initiativeCollection.entries['pc-001'], first.initiativeCollection.entries['pc-001']);
  assert.throws(() => step(second, 'submit-initiative', { actorId: 'pc-001' }, player, options), /已提交/);
  assert.throws(() => step(second, 'roll-initiative', { scope: 'all' }, dm, options), /已齐全/);
  assert.equal(draws, 2);
  const npcOnly = step(collecting(), 'roll-initiative', { scope: 'npc' }, dm, options);
  assert.deepEqual(Object.keys(npcOnly.initiativeCollection.entries), ['npc-001']);
  assert.throws(() => step(collecting(physical()), 'roll-initiative', { scope: 'all' }), /线下骰/);
  assert.throws(() => step(collecting(physical()), 'submit-initiative', { actorId: 'pc-001' }, player), /线下骰/);
});

test('only DM can request, clear or bulk-fill initiative; malformed settings do not mutate state', () => {
  const original = seed();
  assert.throws(() => step(original, 'collect-initiative', {}, player), /DM权限/);
  assert.throws(() => step(original, 'collect-initiative', { modes: { unknown: 'normal' } }), /设置无效/);
  assert.throws(() => step(original, 'collect-initiative', { modes: { 'pc-001': 'anything' } }), /设置无效/);
  assert.equal(original.initiativeCollection, undefined);
  const state = step(collecting(), 'submit-initiative', { actorId: 'pc-001', rolls: [10] }, player);
  assert.throws(() => step(state, 'clear-initiative', { actorId: 'pc-001' }, player), /DM权限/);
  assert.throws(() => step(state, 'roll-initiative', { scope: 'all' }, player), /DM权限/);
  assert.throws(() => step(state, 'collect-initiative'), /已经在收集/);
  const clear = step(state, 'clear-initiative', { actorId: 'pc-001' });
  assert.equal(Object.hasOwn(clear.initiativeCollection.entries, 'pc-001'), false);
  assert.deepEqual(clear.events.find(event => event.type === 'submit-initiative').rolls[0].values, [10]);
  const corrected = step(clear, 'submit-initiative', { actorId: 'pc-001', rolls: [11] }, player);
  assert.equal(corrected.initiativeCollection.entries['pc-001'].natural, 11);
});

test('player projection and handoff exclude all NPC initiative details, including visible NPCs', () => {
  const state = seed(); state.actors[1].hidden = true;
  const ready = step(collecting(state), 'roll-initiative', { scope: 'all' }, dm, { draw: () => 17 });
  for (const view of [projectState(ready, player), handoff(ready, player).state]) {
    assert.deepEqual(Object.keys(view.initiativeCollection.entries), ['pc-001']);
    assert.deepEqual(Object.keys(view.initiativeCollection.modes), ['pc-001']);
    assert(!JSON.stringify(view).includes('npc-001'));
    assert(!JSON.stringify(view).includes('测试守卫'));
    assert.equal(view.initiativeCollection.entries['pc-001'].natural, 17);
  }
  ready.actors[1].hidden = false;
  assert.equal(projectState(ready, player).initiativeCollection.entries['npc-001'], undefined);
  assert.equal(projectState(ready, dm).initiativeCollection.entries['npc-001'].natural, 17);
});

test('initiative changes invalidate submissions; placement and unrelated edits keep them', () => {
  const state = step(collecting(), 'roll-initiative', { scope: 'all' }, dm, { draw: () => 12 });
  const moved = step(state, 'edit-actor', { actorId: 'pc-001', patch: { position: { x: 12.5, y: 0, z: 12.5 }, name: '新显示名', hp: 39 } });
  assert.deepEqual(moved.initiativeCollection, state.initiativeCollection);
  for (const patch of [{ initiativeBonus: 3 }, { confirmed: false }, { hp: 0 }]) {
    const changed = step(state, 'edit-actor', { actorId: 'pc-001', patch });
    assert.equal(changed.initiativeCollection, null);
    assert.match(changed.events.at(-1).publicText, /重新发起收集/);
  }
  assert.equal(step(state, 'set-dice-mode', { mode: 'physical' }).initiativeCollection, null);
  assert.deepEqual(step(state, 'set-dice-mode', { mode: 'program' }).initiativeCollection, state.initiativeCollection);
  assert.equal(step(state, 'remove-actor', { actorId: 'npc-001' }).initiativeCollection, null);
  assert.equal(step(state, 'add-actor', { name: '合成增援', kind: 'npc', position: { x: 12.5, z: 12.5 } }).initiativeCollection, null);
});

test('undo restores collection and old absent fields, while replayed and stale commands stay rejected', () => {
  const initial = seed(), begun = collecting(initial);
  const reverted = step(begun, 'undo');
  assert.equal(Object.hasOwn(reverted, 'initiativeCollection'), false);
  const input = command(begun, 'submit-initiative', { actorId: 'pc-001', rolls: [8] });
  const first = executeAction(begun, input, player);
  const undone = step(first, 'undo');
  assert.deepEqual(undone.initiativeCollection.entries, {});
  assert.deepEqual(undone.events.find(event => event.actionId === input.actionId).rolls[0].values, [8]);
  assert(undone.events.find(event => event.actionId === input.actionId).undoneBy);
  assert.throws(() => executeAction(undone, input, player), /已执行/);
  assert.throws(() => executeAction(first, command(begun, 'submit-initiative', { actorId: 'npc-001', rolls: [9] }), dm), /进度已变化/);
  const ready = step(first, 'submit-initiative', { actorId: 'npc-001', rolls: [9] });
  const started = step(ready, 'start', {}, dm, { draw: neverDraw });
  assert.deepEqual(step(started, 'undo').initiativeCollection, ready.initiativeCollection);
  const changed = step(ready, 'edit-actor', { actorId: 'pc-001', patch: { initiativeBonus: 5 } });
  assert.deepEqual(step(changed, 'undo').initiativeCollection, ready.initiativeCollection);
});

test('saved collection validates after restart and is excluded from a fresh battle snapshot', async () => {
  const output = fileURLToPath(new URL('../../../开发记录/临时/先攻检查/', import.meta.url));
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, 'initiative-'));
  const store = await openStore(directory, physical);
  try {
    await store.dispatch(command(store.state, 'collect-initiative'), dm);
    await store.dispatch(command(store.state, 'submit-initiative', { actorId: 'pc-001', rolls: [15] }), player);
  } finally { await store.close(); }
  const restored = await openStore(directory, physical);
  try {
    assert.equal(restored.state.initiativeCollection.entries['pc-001'].total, 17);
    validateState(restored.state);
    assert.equal(newBattleState('test-campaign', 'next-battle', '新战斗', restored.state).initiativeCollection, undefined);
    await restored.dispatch(command(restored.state, 'submit-initiative', { actorId: 'npc-001', rolls: [4] }), dm);
    const result = await restored.dispatch(command(restored.state, 'start'), dm, { draw: neverDraw });
    assert.deepEqual(result.combat.initiative.map(entry => entry.total), [17, 6]);
  } finally { await restored.close(); }
});

test('malformed or stale persisted collection is rejected, without deriving new random dice', () => {
  const good = step(collecting(), 'roll-initiative', { scope: 'all' }, dm, { draw: () => 9 });
  for (const corrupt of [
    state => { delete state.initiativeCollection.entries['pc-001'].values; },
    state => { state.initiativeCollection.entries['pc-001'].values = [21]; },
    state => { state.initiativeCollection.entries['pc-001'].total++; },
    state => { state.initiativeCollection.entries['pc-001'].bonus++; },
    state => { state.initiativeCollection.modes = {}; },
    state => { state.initiativeCollection.entries.extra = {}; },
    state => { state.initiativeCollection.status = 'unknown'; },
    state => { state.actors[0].confirmed = false; },
    state => { state.diceMode = 'physical'; }
  ]) {
    const invalid = structuredClone(good); corrupt(invalid); assert.throws(() => validateState(invalid));
  }
  validateState(seed());
  validateState(JSON.parse(JSON.stringify(good)));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAction, applyDamage, rollDamage, parseDice, projectState, handoff, validateState } from '../src/rules.mjs';
import { largestFaces, distanceBetween } from '../src/geometry.mjs';
import { fixture, active, command, dm, player } from './fixture.mjs';

test('critical doubles damage dice, not modifiers; malformed dice rejected', () => {
  assert.deepEqual(rollDamage('1d8+3', true, () => 4), { formula: '1d8+3', values: [4, 4], modifier: 3, total: 11, critical: true });
  for (const value of ['0d6', '21d6', '1d3', 'process.exit()', '1d8+9999']) assert.throws(() => parseDice(value));
});
test('typed damage: immunity, same-type aggregation, resistance before vulnerability, temporary HP first', () => {
  const actor = fixture().actors[0]; actor.tempHp = 4; actor.resistances = ['fire']; actor.vulnerabilities = ['fire']; actor.immunities = ['cold'];
  const result = applyDamage(actor, [{ type: 'fire', amount: 3 }, { type: 'fire', amount: 2 }, { type: 'cold', amount: 100 }, { type: 'slashing', amount: 7 }]);
  assert.equal(result.total, 11); assert.equal(actor.hp, 33); assert.equal(actor.tempHp, 0);
});
test('natural 1 misses despite large bonus; original state remains immutable', () => {
  const state = active(); state.actors[0].attacks[0].bonus = 100;
  const next = executeAction(state, command(state, 'attack', { actorId: 'pc-001', targetId: 'npc-001', attackId: 'sword' }), player, { draw: () => 1 });
  assert.equal(next.actors[1].hp, 40); assert.equal(next.combat.attacksUsed, 1); assert.equal(state.combat.attacksUsed, 0);
});
test('natural 20 hits AC100 and doubles damage dice exactly once', () => {
  const state = active(); state.actors[1].ac = 100; let count = 0;
  const next = executeAction(state, command(state, 'attack', { actorId: 'pc-001', targetId: 'npc-001', attackId: 'sword' }), player,
    { draw: sides => { count++; return sides === 20 ? 20 : 4; } });
  assert.equal(next.actors[1].hp, 29); assert.equal(count, 3);
  assert.throws(() => executeAction(next, command(next, 'attack', { actorId: 'pc-001', targetId: 'npc-001', attackId: 'sword' }), player), /攻击次数/);
});
test('long-range disadvantage cancels an advantage source', () => {
  const state = active(); state.actors[1].position.x = 82.5;
  state.actors[0].attacks = [{ id: 'bow', name: '测试远程', kind: 'ranged', bonus: 5, range: 30, longRange: 100, damage: [{ formula: '1d6', type: 'piercing' }] }];
  const next = executeAction(state, command(state, 'attack', { actorId: 'pc-001', targetId: 'npc-001', attackId: 'bow', mode: 'advantage' }), player, { draw: () => 10 });
  assert.equal(next.events.at(-1).rolls[0].mode, 'normal');
});
test('adjacent occupied grid spaces are 5ft apart, including huge creatures', () => {
  const state = fixture(); assert.equal(distanceBetween(...state.actors), 5);
  state.actors[1].position.x = 32.5; assert.equal(distanceBetween(...state.actors), 10);
  state.actors[1].space = { width: 15, depth: 15 }; assert.equal(distanceBetween(...state.actors), 5);
});
test('diagonal movement uses 5ft squares; fine grid does not silently alter rules', () => {
  const state = active(); state.actors[1].position.x = 82.5;
  const next = executeAction(state, command(state, 'move', { actorId: 'pc-001', position: { x: 27.5, z: 27.5 } }), player);
  assert.equal(next.combat.moved, 5);
  assert.throws(() => executeAction(next, command(next, 'move', { actorId: 'pc-001', position: { x: 28.5, z: 27.5 } }), player), /5尺格/);
  assert.throws(() => executeAction(next, command(next, 'move', { actorId: 'pc-001', position: { x: 67.5, z: 27.5 } }), player), /移动力/);
});
test('occupied destinations and straight paths require adjudication', () => {
  const state = active();
  assert.throws(() => executeAction(state, command(state, 'move', { actorId: 'pc-001', position: { x: 27.5, z: 22.5 } }), player), /目的地/);
  assert.throws(() => executeAction(state, command(state, 'move', { actorId: 'pc-001', position: { x: 32.5, z: 22.5 } }), player), /路径/);
});
test('dash doubles movement and consumes action; player cannot take another turn', () => {
  const state = active(); state.actors[1].position.x = 82.5;
  const dash = executeAction(state, command(state, 'dash', { actorId: 'pc-001' }), player);
  assert.equal(executeAction(dash, command(dash, 'move', { actorId: 'pc-001', position: { x: 62.5, z: 22.5 } }), player).combat.moved, 40);
  assert.throws(() => executeAction(dash, command(dash, 'attack', { actorId: 'pc-001', targetId: 'npc-001', attackId: 'sword' }), player), /其他动作/);
  const next = executeAction(dash, command(dash, 'next'), player);
  assert.equal(next.combat.index, 1);
  assert.throws(() => executeAction(next, command(next, 'next'), player), /其他角色/);
});
test('unverified card blocks start; NPC choices require DM', () => {
  const state = fixture(); state.actors[0].confirmed = false;
  assert.throws(() => executeAction(state, command(state, 'start'), dm), /核对/);
  assert.throws(() => executeAction(state, command(state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 20 } }), player), /DM权限/);
});
test('initiative ties follow DM priorities and are explicitly adjustable', () => {
  const state = fixture();
  const next = executeAction(state, command(state, 'start'), dm, { draw: () => 10 });
  assert.deepEqual(next.combat.order, ['pc-001', 'npc-001']);
  assert.deepEqual(executeAction(next, command(next, 'set-order', { order: ['npc-001', 'pc-001'] }), dm).combat.order, ['npc-001', 'pc-001']);
});
test('replayed and stale proposals cannot consume resources twice', () => {
  const state = active(), action = command(state, 'dash', { actorId: 'pc-001' });
  const next = executeAction(state, action, player);
  assert.throws(() => executeAction(next, action, player), /已执行/);
  assert.throws(() => executeAction(next, command(state, 'next'), player), /进度已变化/);
});
test('manual healing does not restore temporary HP; temporary HP does not stack', () => {
  const state = active(); state.actors[0].hp = 20; state.actors[0].tempHp = 10;
  const next = executeAction(state, command(state, 'adjudicate', { actorId: 'pc-001', reason: '人工测试治疗', heal: 7, temporaryHp: 4 }), dm);
  assert.equal(next.actors[0].hp, 27); assert.equal(next.actors[0].tempHp, 10);
  assert.throws(() => executeAction(next, command(next, 'adjudicate', { actorId: 'pc-001', reason: '' }), dm), /依据/);
});
test('player projection excludes hidden actors, enemy exact statistics, DM notes, rolls and private events', () => {
  const state = active(); state.actors[1].hidden = true;
  state.events.push({ publicText: '', dmText: '隐藏秘密', rolls: [{ secret: true }] });
  const visible = projectState(state, player), serialized = JSON.stringify(visible);
  assert.equal(visible.actors.length, 1);
  for (const secret of ['npc-001', '隐藏秘密', '仅DM读取', 'appliedIds']) assert(!serialized.includes(secret));
  state.actors[1].hidden = false;
  assert(!('hp' in projectState(state, player).actors[1]));
  assert(!('ac' in projectState(state, player).actors[1]));
  assert.equal(projectState(state, dm).actors[1].hp, 40);
  assert.equal(handoff(state, player).audience, 'player');
  assert(!JSON.stringify(handoff(state, player)).includes('仅DM读取'));
});
test('largest opposite faces chosen from actual dimensions, including low flat bodies', () => {
  assert.equal(largestFaces({ width: 2, depth: 1, height: 6 }).axis, 'z');
  assert.equal(largestFaces({ width: 1, depth: 3, height: 6 }).axis, 'x');
  assert.equal(largestFaces({ width: 4, depth: 3, height: 1 }).axis, 'y');
});
test('unknown versions and malformed edits fail before mutation', () => {
  const state = fixture(); state.formatVersion = 2; assert.throws(() => validateState(state), /版本/);
  const good = fixture();
  assert.throws(() => executeAction(good, command(good, 'edit-actor', { actorId: 'pc-001', patch: { hp: -1 } }), dm));
  assert.equal(good.actors[0].hp, 40);
});

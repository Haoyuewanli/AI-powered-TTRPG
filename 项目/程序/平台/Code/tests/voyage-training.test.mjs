import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVoyageTraining } from '../voyage-training.mjs';
import { newBattleState } from '../../../战斗/Code/src/workspace.mjs';
import { executeAction, validateState } from '../../../战斗/Code/src/rules.mjs';
import { actionCatalog, operationProblem } from '../../../战斗/Code/src/action-catalog.mjs';
import { fixture, command, dm } from '../../../战斗/Code/tests/fixture.mjs';

function prepared() {
  const state = newBattleState('voyage-training', 'deck-battle', '合成甲板训练');
  state.board = { ...state.board, width: 80, depth: 60 };
  state.actors[0].position = { x: 27.5, y: 0, z: 27.5 };
  const npc = structuredClone(fixture().actors[1]);
  Object.assign(npc, { name: '合成梅洛替身', hp: 45, maxHp: 45, ac: 13, speed: 10,
    attackLimit: 2, confirmed: false, position: { x: 40, y: 0, z: 30 },
    space: { width: 10, depth: 10 }, reference: { resourceId: 'synthetic-merrow', rulesFamily: 'dnd-2024' } });
  state.actors.push(npc);
  state.objects = [{ id: 'voyage-schematic-deck', name: '合成非阻挡甲板', type: 'tile', shape: 'box',
    position: { x: 40, y: 0, z: 30 }, size: { width: 60, depth: 30, height: .5 },
    rotation: 0, hidden: false, blocksMovement: false }];
  return state;
}

function startTraining() {
  let state = applyVoyageTraining(prepared());
  for (const actor of state.actors) state = executeAction(state,
    command(state, 'edit-actor', { actorId: actor.id, patch: { confirmed: true } }), dm);
  const [pc, npc] = state.actors;
  state = executeAction(state, command(state, 'start', {
    manualRolls: { initiative: { [pc.id]: [18], [npc.id]: [2] } }
  }), dm, { draw: () => { throw new Error('测试先攻必须使用已提供的人工骰点'); } });
  return state;
}

test('training replaces only the new PC with a valid unconfirmed existing fighter preset', () => {
  const state = prepared(), before = structuredClone(state), pc = state.actors[0];
  assert.equal(applyVoyageTraining(state), state);
  validateState(state);
  const trained = state.actors[0];
  assert.equal(trained.id, pc.id); assert.equal(trained.ownerId, pc.ownerId);
  assert.deepEqual(trained.position, pc.position);
  assert.equal(trained.classTestProfile.classId, 'fighter');
  assert.equal(trained.classTestProfile.subclassId, 'champion');
  assert.equal(trained.confirmed, false);
  assert.match(trained.notes, /合成训练数值/); assert.match(trained.notes, /不是完整合法角色卡/);
  assert.deepEqual(state.actors[1], before.actors[1]);
  assert.deepEqual(state.objects, before.objects); assert.deepEqual(state.board, before.board);
  assert.deepEqual(state.combat, before.combat); assert.equal(state.revision, 0);
  assert.deepEqual(state.events, []); assert.deepEqual(state.appliedIds, []);
});

test('existing confirmed preparation remains a required step before training can start', () => {
  const state = applyVoyageTraining(prepared()), before = structuredClone(state);
  assert.throws(() => executeAction(state, command(state, 'start'), dm), /核对全部角色/);
  assert.deepEqual(state, before);
  const active = startTraining(), snapshot = structuredClone(active);
  assert.throws(() => applyVoyageTraining(active), /新建战斗/);
  assert.deepEqual(active, snapshot);
});

test('the training PC can move five feet and settle its ordinary melee attack through existing rules', () => {
  const state = startTraining(), [pc, npc] = state.actors;
  const moved = executeAction(state, command(state, 'move', {
    actorId: pc.id, position: { x: pc.position.x + 5, z: pc.position.z }
  }), dm);
  assert.equal(moved.combat.moved, 5);
  const actor = moved.actors[0], attack = actionCatalog(actor).find(entry => entry.mode === 'attack');
  assert(attack); assert.equal(operationProblem(moved, actor, attack), '');
  const attacked = executeAction(moved, command(moved, 'use-operation', {
    actorId: pc.id, targetId: npc.id, operationId: attack.id,
    manualRolls: { attack: [15], damage: [[4]] }
  }), dm, { draw: () => { throw new Error('测试攻击必须使用已提供的人工骰点'); } });
  assert.equal(attacked.combat.attacksUsed, 1);
  assert.equal(attacked.actors[1].hp, npc.hp - 9);
  assert.equal(attacked.events.at(-1).type, 'attack');
  assert.equal(attacked.events.at(-1).rolls[0].source, 'physical');
  validateState(attacked);
});

test('an over-budget training move is rejected without changing state or spending resources', () => {
  const state = startTraining(), before = structuredClone(state), actor = state.actors[0];
  assert.throws(() => executeAction(state, command(state, 'move', {
    actorId: actor.id, position: { x: actor.position.x, z: actor.position.z + actor.speed + 5 }
  }), dm), /移动力/);
  assert.deepEqual(state, before);
});

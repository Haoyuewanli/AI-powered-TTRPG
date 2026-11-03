import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAction, projectState } from '../src/operations.mjs';
import { combatVisual } from '../src/combat-visual.mjs';
import { active, fixture, dm, player, command } from './fixture.mjs';
test('保存成功的攻击带只含外观的动画信息，实际武器来自所用攻击', () => {
  const before = active(); before.actors[0].attacks[0].name = '长剑';
  const after = executeAction(before, command(before, 'attack', { actorId: 'pc-001', targetId: 'npc-001', attackId: 'sword' }), dm, { draw: sides => sides === 20 ? 10 : 4 });
  const effect = after.events.at(-1).visualEffect; assert.equal(effect.weapon, 'sword'); assert.equal(effect.actorId, 'pc-001');
  assert.deepEqual(projectState(after, player).events.at(-1).visualEffect, effect);
  after.actors[1].hidden = true; assert.equal(projectState(after, player).events.at(-1).visualEffect, undefined);
});
test('魔法仅携带粒子颜色与可见目标，不携带伤害值或私密裁定', () => {
  const state = fixture(); state.actors[0].operations = [{ id: 'fire', category: 'spells' }];
  const first = combatVisual(state, { type: 'use-operation', payload: { actorId: 'pc-001', targetId: 'npc-001', operationId: 'fire', result: { damage: [{ type: 'fire', amount: 100 }] } } });
  const second = combatVisual(state, { type: 'use-operation', payload: { actorId: 'pc-001', operationId: 'fire', result: { damage: [{ type: 'cold', amount: 100 }] } } });
  assert.equal(first.kind, 'magic'); assert.notEqual(first.color, second.color); assert.equal(first.damage, undefined); assert.equal(first.result, undefined);
  assert.equal(combatVisual(state, { type: 'undo', payload: {} }), null);
});

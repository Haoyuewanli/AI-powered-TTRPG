import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeAction, projectState, validateState } from '../src/rules.mjs';
import { objectBounds, pathMeetsObject } from '../src/geometry.mjs';
import { upgradeBattle, openWorkspace } from '../src/workspace.mjs';
import { fixture, active, command, dm, player } from './fixture.mjs';
const v2 = (state = fixture()) => upgradeBattle(state, 'test-campaign', 'test-battle');
const wall = () => ({ id: 'thin-wall', name: '测试墙', type: 'wall', position: { x: 22.5, y: 0, z: 28 },
  size: { width: 15, depth: .5, height: 8 }, rotation: 0, hidden: false, blocksMovement: true });
test('continuous terrain collision blocks a half-foot wall, supports quarter rotation and allows edge contact', () => {
  const actor = fixture().actors[0], obstacle = wall();
  assert(pathMeetsObject(actor, { x: 22.5, z: 42.5 }, obstacle));
  obstacle.rotation = 90;
  assert.equal(objectBounds(obstacle).maxX - objectBounds(obstacle).minX, .5);
  obstacle.position.x = 25.5; obstacle.size.depth = 1;
  assert.equal(pathMeetsObject(actor, { x: 22.5, z: 42.5 }, obstacle), false);
});
test('hidden wall blocks movement without naming hidden terrain; failure does not mutate or spend movement', () => {
  const state = v2(active()); state.objects = [{ ...wall(), hidden: true, name: 'SECRET_WALL' }];
  assert.throws(() => executeAction(state, command(state, 'move', { actorId: 'pc-001', position: { x: 22.5, z: 37.5 } }), player), error => /阻挡/.test(error.message) && !error.message.includes('SECRET'));
  assert.equal(state.combat.moved, 0); assert.equal(projectState(state, player).objects.length, 0);
});
test('terrain edits, visibility and board shrink are validated and reversible', () => {
  let state = v2(); const input = wall(); delete input.id;
  state = executeAction(state, command(state, 'add-object', input), dm);
  const id = state.objects[0].id;
  assert.throws(() => executeAction(state, command(state, 'edit-board', { width: 20, depth: 20, extended: false }), dm), /边界/);
  assert.throws(() => executeAction(state, command(state, 'edit-object', { objectId: id, patch: { rotation: 45 } }), dm), /旋转/);
  assert.throws(() => executeAction(state, command(state, 'remove-object', { objectId: id }), player), /DM权限/);
  state = executeAction(state, command(state, 'edit-object', { objectId: id, patch: { hidden: true } }), dm);
  assert.equal(projectState(state, player).objects.length, 0);
  state = executeAction(state, command(state, 'undo'), dm);
  assert.equal(projectState(state, player).objects.length, 1);
  assert(!('blocksMovement' in projectState(state, player).objects[0]));
});
test('high-level movement and attacks across elevation pause for DM, while ground movement below a high platform works', () => {
  const state = v2(active()); state.actors[0].position.y = 10;
  assert.throws(() => executeAction(state, command(state, 'move', { actorId: 'pc-001', position: { x: 22.5, z: 32.5 } }), player), /楼层/);
  assert.throws(() => executeAction(state, command(state, 'attack', { actorId: 'pc-001', targetId: 'npc-001', attackId: 'sword' }), player), /高差/);
  state.actors[0].position.y = 0;
  state.objects = [{ ...wall(), type: 'floor', position: { x: 22.5, y: 9, z: 28 }, size: { width: 15, depth: 15, height: 1 }, blocksMovement: false }];
  const next = executeAction(state, command(state, 'move', { actorId: 'pc-001', position: { x: 22.5, z: 37.5 } }), player);
  assert.equal(next.combat.moved, 15);
  state.objects[0].position.y = 0;
  assert.throws(() => executeAction(state, command(state, 'move', { actorId: 'pc-001', position: { x: 22.5, z: 37.5 } }), player), /高差地形/);
});
test('objects and board size persist independently per battle after restart', async () => {
  const output = fileURLToPath(new URL('../../../开发记录/临时/地形检查/', import.meta.url));
  await mkdir(output, { recursive: true }); const seed = await mkdtemp(join(output, 'campaign-'));
  const config = { seedDirectory: seed, workspaceDirectory: join(seed, '.工作区'), initial: fixture };
  let workspace = await openWorkspace(config); const first = workspace.selection;
  await workspace.dispatch(command(workspace.store.state, 'edit-board', { width: 120, depth: 90 }), dm);
  await workspace.dispatch(command(workspace.store.state, 'add-object', wall()), dm);
  await workspace.createBattle({ name: '空白场景' }, dm); assert.equal(workspace.store.state.objects.length, 0);
  await workspace.select(first, dm); await workspace.close(); workspace = await openWorkspace(config);
  assert.equal(workspace.store.state.board.width, 120); assert.equal(workspace.store.state.objects[0].name, '测试墙');
  validateState(workspace.store.state); await workspace.close();
});

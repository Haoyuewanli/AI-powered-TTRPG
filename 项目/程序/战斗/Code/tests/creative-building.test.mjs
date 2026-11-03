import test from 'node:test';
import assert from 'node:assert/strict';
import { baseBlockBrush, placementAgainstFace, buildingBoundsValid, baseBlockComposition } from '../web/creative-building.mjs';
import { upgradeBattle } from '../src/workspace.mjs';
import { executeAction } from '../src/rules.mjs';
import { fixture, command, dm, player } from './fixture.mjs';

test('building brush uses exact 1/5 foot solids and preserves custom legacy shapes', () => {
  for (const unit of [1, 5]) assert.deepEqual(baseBlockBrush(unit).size, { width: unit, height: unit, depth: unit });
  assert.throws(() => baseBlockBrush(3));
  const ramp = { shape: 'ramp', size: { width: 10, depth: 5, height: 5 } };
  assert.deepEqual(baseBlockBrush('current', ramp), ramp);
  assert.notEqual(baseBlockBrush('current', ramp), ramp);
});

test('face placement joins floor, side and top faces and rejects boundary overflow', () => {
  const brush = baseBlockBrush(5), board = { width: 100, depth: 80 };
  assert.deepEqual(placementAgainstFace(brush, { x: 12, y: 0, z: 13 }), { x: 12.5, y: 0, z: 12.5 });
  assert.deepEqual(placementAgainstFace(brush, { x: 15, y: 2.5, z: 12.5 }, { x: 1, y: 0, z: 0 }, 5), { x: 17.5, y: 0, z: 12.5 });
  const top = placementAgainstFace(brush, { x: 12.5, y: 5, z: 12.5 }, { x: 0, y: 1, z: 0 }, 5);
  assert.deepEqual(top, { x: 12.5, y: 5, z: 12.5 });
  assert.equal(buildingBoundsValid({ ...brush, position: top }, board), true);
  assert.equal(buildingBoundsValid({ ...brush, position: { x: -2.5, y: 0, z: 12.5 } }, board), false);
  assert.equal(buildingBoundsValid({ ...brush, position: { x: -2.5, y: 0, z: 12.5 } }, { ...board, extended: true }), true);
  const rotated = { ...brush, size: { width: 10, height: 5, depth: 1 }, rotation: 90, position: { x: .5, y: 0, z: 10 } };
  assert.equal(buildingBoundsValid(rotated, board), true);
});

test('integer cuboids decompose into nonoverlapping 5-foot and 1-foot cubes under a mesh budget', () => {
  const size = { width: 11, height: 6, depth: 5 }, cells = baseBlockComposition(size), occupied = new Set();
  assert.ok(cells.some(cell => cell.unit === 5)); assert.ok(cells.some(cell => cell.unit === 1));
  let volume = 0;
  for (const cell of cells) {
    volume += cell.unit ** 3;
    for (let x = 0; x < cell.unit; x++) for (let y = 0; y < cell.unit; y++) for (let z = 0; z < cell.unit; z++) {
      const key = [cell.x + size.width / 2 - cell.unit / 2 + x, cell.y - cell.unit / 2 + y, cell.z + size.depth / 2 - cell.unit / 2 + z].join(',');
      assert.equal(occupied.has(key), false); occupied.add(key);
    }
  }
  assert.equal(volume, size.width * size.height * size.depth);
  assert.equal(baseBlockComposition({ width: 300, height: 60, depth: 300 }), null);
  assert.equal(baseBlockComposition({ width: 5, height: .5, depth: 5 }), null);
  assert.equal(baseBlockComposition(size, 1), null);
});

test('new block place/destroy use existing DM authority, revision and undo instead of preview writes', () => {
  let state = upgradeBattle(fixture(), 'creative-campaign', 'creative-battle');
  const item = { ...baseBlockBrush(5), position: { x: 12.5, y: 0, z: 12.5 } };
  assert.throws(() => executeAction(state, command(state, 'add-object', item), player), /DM权限/);
  state = executeAction(state, command(state, 'add-object', item), dm); assert.equal(state.objects.length, 1);
  const id = state.objects[0].id;
  state = executeAction(state, command(state, 'remove-object', { objectId: id }), dm); assert.equal(state.objects.length, 0);
  state = executeAction(state, command(state, 'undo'), dm); assert.equal(state.objects[0].id, id);
  state = executeAction(state, command(state, 'undo'), dm); assert.equal(state.objects.length, 0);
});

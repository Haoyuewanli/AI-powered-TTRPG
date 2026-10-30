import test from 'node:test';
import assert from 'node:assert/strict';
import { animationDice, notationFor, verifyAnimation } from '../src/animation-contract.mjs';

function record(sides, values) {
  return { version: 1, id: 'test', createdAt: '2026-10-22T00:00:00Z', sides,
    count: values.length, values, total: values.reduce((a, b) => a + b, 0) };
}

test('percentile notation preserves values when upstream groups matching dice types', () => {
  const roll = record(100, [100, 7, 30]);
  assert.equal(notationFor(roll), '3d100+3d10@100,100,30,10,7,10');
  assert.equal(animationDice(roll).length, 6);
  const result = { sets: [{ rolls: animationDice(roll) }] };
  assert.doesNotThrow(() => verifyAnimation(roll, result));
});

test('a wrong face or missing die fails verification without changing the roll', () => {
  const roll = record(20, [1, 20]);
  const before = JSON.stringify(roll);
  assert.throws(() => verifyAnimation(roll, { sets: [{ rolls: [{ sides: 20, value: 1 }, { sides: 20, value: 19 }] }] }));
  assert.throws(() => verifyAnimation(roll, null));
  assert.equal(JSON.stringify(roll), before);
});

test('twenty percentile rolls use two groups instead of exceeding the parser group limit', () => {
  const roll = record(100, Array(20).fill(100));
  assert.ok(notationFor(roll).startsWith('20d100+20d10@'));
  assert.equal(animationDice(roll).length, 40);
});

test('ordinary d10 and percentile ones group together without applying the modifier in animation', () => {
  const roll = { version: 2, id: 'mixed', createdAt: '2026-10-22T00:00:00Z',
    groups: [{ sides: 6, count: 2, values: [1, 6] }, { sides: 10, count: 1, values: [10] },
      { sides: 100, count: 2, values: [7, 100] }], modifier: 20, diceTotal: 124, total: 144 };
  assert.equal(notationFor(roll), '2d6+3d10+2d100@1,6,10,7,10,100,100');
  assert.equal(animationDice(roll).length, 7);
  assert.doesNotThrow(() => verifyAnimation(roll, { sets: [{ rolls: animationDice(roll) }] }));
});

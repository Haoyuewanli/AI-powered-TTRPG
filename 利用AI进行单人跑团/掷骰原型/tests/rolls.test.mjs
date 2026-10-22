import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDES, createRoll, randomInteger, physicalDice, validateRecord } from '../src/rolls.mjs';
import { loadRoll, saveRoll, STORAGE_KEY } from '../src/journal.mjs';

function source(numbers) {
  let index = 0;
  return {
    getRandomValues(buffer) { buffer[0] = numbers[index++]; return buffer; },
    randomUUID: () => 'fixed-test-roll',
    calls: () => index,
  };
}

function fixedRecord(sides, values) {
  return { version: 1, id: 'test', createdAt: '2026-10-22T00:00:00Z', sides,
    count: values.length, values, total: values.reduce((a, b) => a + b, 0) };
}

test('all supported dice can produce both endpoints', () => {
  for (const sides of SIDES) {
    assert.equal(randomInteger(sides, source([0])), 1);
    assert.equal(randomInteger(sides, source([sides - 1])), sides);
  }
});

test('rejection sampling discards the biased tail', () => {
  const rng = source([4294967295, 4294967294, 19]);
  assert.equal(randomInteger(20, rng), 20);
  assert.equal(rng.calls(), 3);
});

test('a roll has immutable individual values and a derived sum', () => {
  const record = createRoll({ sides: 6, count: 3 }, { cryptoSource: source([0, 3, 5]) });
  assert.deepEqual(record.values, [1, 4, 6]);
  assert.equal(record.total, 11);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.values));
});

test('invalid requests fail before sampling', () => {
  const rng = source([]);
  for (const request of [{ sides: 7, count: 1 }, { sides: 6, count: 0 },
    { sides: 20, count: 21 }, { sides: 20, count: 1.5 }]) {
    assert.throws(() => createRoll(request, { cryptoSource: rng }));
  }
  assert.equal(rng.calls(), 0);
});

test('all 100 percentile results map to correct tens and ones faces', () => {
  for (let value = 1; value <= 100; value++) {
    const [tens, ones] = physicalDice(fixedRecord(100, [value]));
    assert.equal(((tens.value % 100) + (ones.value % 10)) || 100, value);
    assert.equal(tens.sides, 100);
    assert.equal(ones.sides, 10);
  }
  assert.deepEqual(physicalDice(fixedRecord(100, [100, 7, 30])).map(d => d.value),
    [100, 10, 100, 7, 30, 10]);
});

test('stored data is validated before restoring', () => {
  const map = new Map();
  const storage = { setItem: (key, value) => map.set(key, value), getItem: key => map.get(key) ?? null };
  assert.equal(loadRoll(storage), null);
  const record = fixedRecord(20, [1, 20]);
  saveRoll(storage, record);
  assert.deepEqual(loadRoll(storage), record);
  map.set(STORAGE_KEY, JSON.stringify({ ...record, total: 99 }));
  assert.throws(() => loadRoll(storage), /合计/);
  assert.throws(() => validateRecord({ ...record, version: 2 }), /版本/);
});

test('storage failures are surfaced without changing the record', () => {
  const record = fixedRecord(20, [20]);
  const serialized = JSON.stringify(record);
  assert.throws(() => saveRoll({ setItem() { throw new Error('quota'); } }, record), /quota/);
  assert.throws(() => saveRoll({ setItem() {}, getItem() { return null; } }, record), /写入/);
  assert.equal(JSON.stringify(record), serialized);
});

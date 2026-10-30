import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDES, createRoll, randomInteger, physicalDice, validateRecord, formatFormula, validateRequest } from '../src/rolls.mjs';
import { loadRoll, saveRoll, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../src/journal.mjs';

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
  assert.deepEqual(record.groups[0].values, [1, 4, 6]);
  assert.equal(record.total, 11);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.groups));
  assert.ok(Object.isFrozen(record.groups[0].values));
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
  assert.throws(() => validateRecord({ ...record, version: 3 }), /版本/);
});

test('storage failures are surfaced without changing the record', () => {
  const record = fixedRecord(20, [20]);
  const serialized = JSON.stringify(record);
  assert.throws(() => saveRoll({ setItem() { throw new Error('quota'); } }, record), /quota/);
  assert.throws(() => saveRoll({ setItem() {}, getItem() { return null; } }, record), /写入/);
  assert.equal(JSON.stringify(record), serialized);
});

test('mixed dice and a modifier are sampled separately and added exactly once', () => {
  for (const modifier of [0, 1, 20]) {
    const roll = createRoll({ groups: [{ sides: 20, count: 1 }, { sides: 6, count: 2 }], modifier },
      { cryptoSource: source([0, 5, 19]) });
    assert.deepEqual(roll.groups.map(group => group.values), [[1, 6], [20]]);
    assert.equal(roll.diceTotal, 27);
    assert.equal(roll.total, 27 + modifier);
    assert.equal(formatFormula(roll), `2d6 + 1d20${modifier ? ` + ${modifier}` : ''}`);
    assert.doesNotThrow(() => validateRecord(roll));
    assert.throws(() => validateRecord({ ...roll, total: roll.total + 1 }), /合计/);
  }
});

test('repeated groups combine and the overall twenty-dice limit applies across types', () => {
  assert.deepEqual(validateRequest({ groups: [{ sides: 6, count: 1 }, { sides: 6, count: 2 }] }).groups,
    [{ sides: 6, count: 3 }]);
  assert.doesNotThrow(() => validateRequest({ groups: [{ sides: 6, count: 10 }, { sides: 20, count: 10 }], modifier: 20 }));
  assert.throws(() => validateRequest({ groups: [{ sides: 6, count: 10 }, { sides: 20, count: 11 }] }), /最多/);
  assert.throws(() => validateRequest({ groups: [] }));
});

test('invalid modifiers fail before random sampling', () => {
  const rng = source([]);
  for (const modifier of [-1, 21, 1.5, NaN, '5']) {
    assert.throws(() => createRoll({ groups: [{ sides: 6, count: 1 }], modifier }, { cryptoSource: rng }));
  }
  assert.equal(rng.calls(), 0);
});

test('new records take priority without overwriting legacy records used for rollback', () => {
  const map = new Map();
  const storage = { setItem: (key, value) => map.set(key, value), getItem: key => map.get(key) ?? null };
  const legacy = fixedRecord(20, [20]);
  saveRoll(storage, legacy);
  assert.deepEqual(loadRoll(storage), legacy);
  const oldSerialized = map.get(LEGACY_STORAGE_KEY);
  const fresh = createRoll({ groups: [{ sides: 6, count: 1 }], modifier: 5 }, { cryptoSource: source([3]) });
  saveRoll(storage, fresh);
  assert.deepEqual(loadRoll(storage), fresh);
  assert.equal(map.get(LEGACY_STORAGE_KEY), oldSerialized);
  assert.equal(JSON.parse(map.get(STORAGE_KEY)).version, 2);
});

export const SIDES = Object.freeze([4, 6, 8, 10, 12, 20, 100]);
export const MAX_DICE = 20;

export function validateRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('骰池请求不合法。');
  const groups = request.groups ?? [{ sides: request.sides, count: request.count }];
  const modifier = request.modifier ?? 0;
  if (!Array.isArray(groups) || !groups.length || groups.length > MAX_DICE) throw new Error('请至少选择一颗骰子。');
  const counts = new Map();
  for (const { sides, count } of groups) {
    if (!SIDES.includes(sides)) throw new Error('请选择支持的骰型。');
    if (!Number.isInteger(count) || count < 1 || count > MAX_DICE) throw new Error('每种骰子的数量须为正整数。');
    counts.set(sides, (counts.get(sides) || 0) + count);
  }
  if ([...counts.values()].reduce((a, b) => a + b, 0) > MAX_DICE) throw new Error(`骰池合计最多 ${MAX_DICE} 颗骰子。`);
  if (!Number.isInteger(modifier) || modifier < 0 || modifier > 20) throw new Error('附加数值须为 1 至 20 的整数，或关闭加值。');
  return { groups: SIDES.filter(sides => counts.has(sides)).map(sides => ({ sides, count: counts.get(sides) })), modifier };
}

export function randomInteger(sides, cryptoSource = globalThis.crypto) {
  if (!SIDES.includes(sides)) throw new Error('不支持的随机范围。');
  const ceiling = 2 ** 32 - (2 ** 32 % sides);
  const buffer = new Uint32Array(1);
  do {
    cryptoSource.getRandomValues(buffer);
  } while (buffer[0] >= ceiling);
  return buffer[0] % sides + 1;
}

export function validateRecord(record) {
  if (!record || ![1, 2].includes(record.version)) throw new Error('判定记录版本不兼容。');
  const groups = record.version === 1 ? [{ sides: record.sides, count: record.count, values: record.values }] : record.groups;
  const modifier = record.version === 1 ? 0 : record.modifier;
  validateRequest({ groups, modifier });
  if (record.version === 2 && (!Number.isInteger(record.modifier) || new Set(groups.map(group => group.sides)).size !== groups.length)) {
    throw new Error('骰池记录不合法。');
  }
  if (typeof record.id !== 'string' || record.id.length < 1 || record.id.length > 100) {
    throw new Error('判定编号不合法。');
  }
  if (typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) {
    throw new Error('判定时间不合法。');
  }
  let diceTotal = 0;
  for (const { sides, count, values } of groups) {
    if (!Array.isArray(values) || values.length !== count || values.some(value => !Number.isInteger(value) || value < 1 || value > sides)) {
      throw new Error('判定点数不合法。');
    }
    diceTotal += values.reduce((sum, value) => sum + value, 0);
  }
  if ((record.version === 2 && record.diceTotal !== diceTotal) || record.total !== diceTotal + modifier) {
    throw new Error('判定合计不一致。');
  }
  return record;
}

export function createRoll(request, {
  cryptoSource = globalThis.crypto,
  now = () => new Date().toISOString(),
} = {}) {
  const normalized = validateRequest(request);
  const groups = normalized.groups.map(({ sides, count }) => Object.freeze({ sides, count,
    values: Object.freeze(Array.from({ length: count }, () => randomInteger(sides, cryptoSource))) }));
  const diceTotal = groups.reduce((sum, group) => sum + group.values.reduce((a, b) => a + b, 0), 0);
  return Object.freeze({
    version: 2,
    id: cryptoSource.randomUUID(),
    createdAt: now(),
    groups: Object.freeze(groups),
    modifier: normalized.modifier,
    diceTotal,
    total: diceTotal + normalized.modifier,
  });
}

export function logicalDice(record) {
  validateRecord(record);
  const groups = record.version === 1 ? [{ sides: record.sides, values: record.values }] : record.groups;
  return groups.flatMap(group => group.values.map(value => ({ sides: group.sides, value })));
}

export function formatFormula(request) {
  const { groups, modifier } = validateRequest(request);
  return [...groups.map(group => `${group.count}d${group.sides}`), ...(modifier ? [String(modifier)] : [])].join(' + ');
}

export function physicalDice(record) {
  return logicalDice(record).flatMap(({ sides, value }, index) => {
    if (sides !== 100) {
      return [{ sides, value, logicalIndex: index }];
    }
    const percentile = value % 100;
    const tens = Math.floor(percentile / 10) * 10;
    const ones = percentile % 10;
    return [
      { sides: 100, value: tens || 100, logicalIndex: index },
      { sides: 10, value: ones || 10, logicalIndex: index },
    ];
  });
}

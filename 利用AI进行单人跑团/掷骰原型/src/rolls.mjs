export const SIDES = Object.freeze([4, 6, 8, 10, 12, 20, 100]);
export const MAX_DICE = 20;

export function validateRequest({ sides, count }) {
  if (!SIDES.includes(sides)) throw new Error('请选择支持的骰型。');
  if (!Number.isInteger(count) || count < 1 || count > MAX_DICE) {
    throw new Error(`骰子数量须为 1 至 ${MAX_DICE} 的整数。`);
  }
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
  if (!record || record.version !== 1) throw new Error('判定记录版本不兼容。');
  validateRequest(record);
  if (typeof record.id !== 'string' || record.id.length < 1 || record.id.length > 100) {
    throw new Error('判定编号不合法。');
  }
  if (typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) {
    throw new Error('判定时间不合法。');
  }
  if (!Array.isArray(record.values) || record.values.length !== record.count ||
      record.values.some(value => !Number.isInteger(value) || value < 1 || value > record.sides)) {
    throw new Error('判定点数不合法。');
  }
  if (record.total !== record.values.reduce((sum, value) => sum + value, 0)) {
    throw new Error('判定合计不一致。');
  }
  return record;
}

export function createRoll(request, {
  cryptoSource = globalThis.crypto,
  now = () => new Date().toISOString(),
} = {}) {
  validateRequest(request);
  const values = Array.from({ length: request.count }, () => randomInteger(request.sides, cryptoSource));
  return Object.freeze({
    version: 1,
    id: cryptoSource.randomUUID(),
    createdAt: now(),
    sides: request.sides,
    count: request.count,
    values: Object.freeze(values),
    total: values.reduce((sum, value) => sum + value, 0),
  });
}

export function physicalDice(record) {
  validateRecord(record);
  return record.values.flatMap((value, index) => {
    if (record.sides !== 100) {
      return [{ sides: record.sides, value, logicalIndex: index }];
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

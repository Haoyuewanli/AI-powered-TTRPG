import { physicalDice } from './rolls.mjs';

export function animationDice(record) {
  const dice = physicalDice(record);
  // Upstream groups matching dice types even when they are not adjacent.
  return record.sides === 100 ? [...dice.filter(die => die.sides === 100), ...dice.filter(die => die.sides === 10)] : dice;
}

export function notationFor(record) {
  const dice = animationDice(record);
  const notation = record.sides === 100 ? `${record.count}d100+${record.count}d10` : `${record.count}d${record.sides}`;
  return `${notation}@${dice.map(die => die.value).join(',')}`;
}

export function verifyAnimation(record, result) {
  const expected = animationDice(record);
  const actual = result?.sets?.flatMap(set => set.rolls) ?? [];
  if (actual.length !== expected.length || actual.some((die, index) =>
    die.sides !== expected[index].sides || die.value !== expected[index].value)) {
    throw new Error('动画落点与已保存点数不一致，已保留正式结果。');
  }
}

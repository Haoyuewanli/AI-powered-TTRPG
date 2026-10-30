import { physicalDice } from './rolls.mjs';

export function animationDice(record) {
  const dice = physicalDice(record);
  // Upstream groups matching dice types even when they are not adjacent.
  return [...new Set(dice.map(die => die.sides))].flatMap(sides => dice.filter(die => die.sides === sides));
}

export function notationFor(record) {
  const dice = animationDice(record);
  const notation = [...new Set(dice.map(die => die.sides))]
    .map(sides => `${dice.filter(die => die.sides === sides).length}d${sides}`).join('+');
  return `${notation}@${dice.map(die => die.value).join(',')}`;
}

export function verifyAnimation(record, result) {
  const expected = animationDice(record);
  const actual = result?.sets?.flatMap(set => set.rolls) ?? [];
  if (actual.length !== expected.length || actual.some((die, index) =>
    die.sides !== expected[index].sides || die.value !== expected[index].value)) {
    throw new Error('动画落点与已保存点数不一致，已保留正式结果。', { cause: { expected, actual } });
  }
}

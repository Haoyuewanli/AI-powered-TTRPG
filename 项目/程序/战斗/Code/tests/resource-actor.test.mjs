import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceActorDraft } from '../src/resource-actor.mjs';
import { executeAction, validateState } from '../src/operations.mjs';
import { fixture, dm, player, command } from './fixture.mjs';

const value = { resource: { id: 'synthetic-monster', name: '合成生物', path: '模组/合成/资源/怪物.md', data: { statBlock: {
  armorClass: 16, hitPoints: 50, speedsFeet: { walk: 25 }, sizeText: '大型', abilityScores: { dex: 14 },
  attacks: [{ name: '长剑', attackBonus: 5, damageFormula: '2d6+3', damageTypeText: '挥砍', reachFeet: 5 }]
} } }, text: '# 合成生物\n原书资料仍待核对。' };
test('资源预填保留明确数值、来源和待核对状态，不从描述推算规则', () => {
  const original = structuredClone(value), { draft } = resourceActorDraft(value);
  assert.equal(draft.maxHp, 50); assert.equal(draft.ac, 16); assert.equal(draft.initiativeBonus, 2); assert.equal(draft.speed, 25);
  assert.equal(draft.space.width, 10); assert.equal(draft.attacks[0].damage[0].type, 'slashing'); assert.match(draft.notes, /原书/);
  assert.deepEqual(value, original);
  const empty = resourceActorDraft({ resource: { name: '只有正文的角色' }, text: '未抄录数值' });
  assert.equal(empty.draft.maxHp, 10); assert.match(empty.draft.resources, /待DM核对/);
});
test('导入新增一次保存可撤销，不能从草稿注入身份或跳过DM权限', () => {
  const state = fixture(), before = structuredClone(state), { draft } = resourceActorDraft(value);
  const result = executeAction(state, command(state, 'add-actor', { name: '导入测试', kind: 'npc', draft }), dm);
  assert.equal(result.actors.length, 3); assert.equal(result.actors.at(-1).confirmed, false); assert.equal(result.actors.at(-1).maxHp, 50);
  assert.deepEqual(state, before);
  assert.throws(() => executeAction(state, command(state, 'add-actor', { draft, name: '禁止' }), player));
  assert.throws(() => executeAction(state, command(state, 'add-actor', { draft: { ...draft, id: 'injected' }, name: '禁止' }), dm));
});
test('空白场景可先搭建，未添加参战者不能开战', () => {
  const state = fixture(); state.actors = []; validateState(state);
  assert.throws(() => executeAction(state, command(state, 'start'), dm), /先点击＋/);
  assert.throws(() => executeAction(state, command(state, 'collect-initiative'), dm), /先点击＋/);
  const added = executeAction(state, command(state, 'add-actor', { name: '首位参战者', kind: 'npc' }), dm);
  assert.equal(added.actors.length, 1);
  const removed = executeAction(added, command(added, 'remove-actor', { actorId: added.actors[0].id }), dm); assert.equal(removed.actors.length, 0);
});
test('固定角色能力表格只提取明确基础数值，不把临时生命和变形增益混入', () => {
  const a = resourceActorDraft({ resource: { name: '合成角色' }, text: '| HP上限 | 87 |\n| AC | 14+2+2=18 |\n| 先攻、速度 | +2、30尺 |\n临时生命+120，变形速度60尺。' });
  assert.equal(a.draft.maxHp, 87); assert.equal(a.draft.ac, 18); assert.equal(a.draft.speed, 30); assert.deepEqual(a.missingFields, []);
  const b = resourceActorDraft({ resource: {}, text: '| HP上限、生命骰 | 47；5d6 |\n| AC、先攻、速度 | 12（法师护甲15）；+2；35尺 |' });
  assert.equal(b.draft.maxHp, 47); assert.equal(b.draft.ac, 12); assert.equal(b.draft.speed, 35); assert.deepEqual(b.missingFields, []);
});

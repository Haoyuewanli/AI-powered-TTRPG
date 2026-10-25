import { randomInt, randomUUID } from 'node:crypto';
import { distanceBetween, overlaps } from './geometry.mjs';

export class RuleError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function requireRule(condition, message, status) {
  if (!condition) throw new RuleError(message, status);
}
export function integer(value, min, max, label) {
  requireRule(Number.isInteger(value) && value >= min && value <= max, `${label}须为 ${min}～${max} 的整数`);
  return value;
}
export const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
  'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
export const die = sides => randomInt(1, sides + 1);

export function parseDice(formula) {
  requireRule(typeof formula === 'string', '伤害公式须为字符串');
  const match = /^(\d{1,2})d(4|6|8|10|12|20|100)([+-]\d{1,3})?$/.exec(formula.replaceAll(' ', ''));
  requireRule(match, '公式示例：1d8+5；支持常见 D&D 骰型，每项最多20颗');
  return { count: integer(Number(match[1]), 1, 20, '骰子数'), sides: Number(match[2]), modifier: Number(match[3] || 0) };
}
export function rollDamage(formula, critical = false, draw = die) {
  const spec = parseDice(formula);
  const values = Array.from({ length: spec.count * (critical ? 2 : 1) }, () => draw(spec.sides));
  return { formula, values, modifier: spec.modifier,
    total: Math.max(0, values.reduce((a, b) => a + b, 0) + spec.modifier), critical };
}
export function rollD20(mode = 'normal', draw = die) {
  requireRule(['normal', 'advantage', 'disadvantage'].includes(mode), '检定模式无效');
  const values = Array.from({ length: mode === 'normal' ? 1 : 2 }, () => draw(20));
  return { mode, values, natural: mode === 'advantage' ? Math.max(...values) : Math.min(...values) };
}
export function applyDamage(actor, components) {
  // Combine the same damage type before rounding resistance once for that type.
  const grouped = {};
  for (const item of components) {
    requireRule(DAMAGE_TYPES.includes(item.type), '伤害类型无效');
    integer(item.amount, 0, 100000, '伤害');
    grouped[item.type] = (grouped[item.type] || 0) + item.amount;
  }
  const details = Object.entries(grouped).map(([type, raw]) => {
    let amount = raw;
    if (actor.immunities.includes(type)) amount = 0;
    else {
      if (actor.resistances.includes(type)) amount = Math.floor(amount / 2);
      if (actor.vulnerabilities.includes(type)) amount *= 2;
    }
    return { type, raw, amount };
  });
  const total = details.reduce((sum, item) => sum + item.amount, 0);
  const absorbed = Math.min(total, actor.tempHp);
  actor.tempHp -= absorbed;
  actor.hp = Math.max(0, actor.hp - (total - absorbed));
  return { details, total, absorbed, hp: actor.hp, tempHp: actor.tempHp };
}

export function validateActor(actor, board) {
  requireRule(typeof actor.id === 'string' && /^[a-zA-Z0-9_-]{1,60}$/.test(actor.id), '棋子ID无效');
  requireRule(['pc', 'npc'].includes(actor.kind), '角色类型无效');
  requireRule(actor.kind === 'pc' ? typeof actor.ownerId === 'string' && /^[\w-]{1,60}$/.test(actor.ownerId) : actor.ownerId === null, '角色归属无效');
  requireRule(typeof actor.name === 'string' && actor.name.trim().length > 0 && actor.name.length <= 80, '名称须为1～80字');
  integer(actor.maxHp, 1, 10000, '生命上限'); integer(actor.hp, 0, actor.maxHp, '当前生命');
  integer(actor.tempHp, 0, 10000, '临时生命'); integer(actor.ac, 0, 100, 'AC');
  integer(actor.speed, 0, 300, '速度'); integer(actor.initiativeBonus, -30, 100, '先攻加值');
  integer(actor.attackLimit, 1, 10, '攻击次数'); integer(actor.tiePriority, 0, 1000, '同分顺序');
  integer(actor.facing, 0, 359, '朝向');
  for (const key of ['width', 'depth', 'height']) {
    requireRule(Number.isFinite(actor.body[key]) && actor.body[key] >= 0.2 && actor.body[key] <= 60, '外观尺寸须为0.2～60尺');
  }
  for (const key of ['width', 'depth']) integer(actor.space[key], 1, 30, '规则占地');
  for (const key of ['x', 'z']) requireRule(Number.isFinite(actor.position[key]) && actor.position[key] % 0.5 === 0, '位置须对齐0.5尺');
  requireRule(actor.position.x - actor.space.width / 2 >= 0 && actor.position.x + actor.space.width / 2 <= board.width &&
    actor.position.z - actor.space.depth / 2 >= 0 && actor.position.z + actor.space.depth / 2 <= board.depth, '棋子超出棋盘边界');
  for (const key of ['immunities', 'resistances', 'vulnerabilities']) {
    requireRule(Array.isArray(actor[key]) && actor[key].every(type => DAMAGE_TYPES.includes(type)), '伤害类型列表无效');
  }
  requireRule(typeof actor.hidden === 'boolean' && typeof actor.confirmed === 'boolean', '公开与核对状态须为布尔值');
  requireRule(typeof actor.notes === 'string' && actor.notes.length <= 8000 && typeof actor.resources === 'string' && actor.resources.length <= 8000, '备注过长或格式无效');
  requireRule(Array.isArray(actor.attacks) && actor.attacks.length <= 20, '攻击列表无效');
  requireRule(new Set(actor.attacks.map(a => a.id)).size === actor.attacks.length, '攻击ID不能重复');
  for (const attack of actor.attacks) {
    requireRule(typeof attack.id === 'string' && /^[\w-]{1,60}$/.test(attack.id) && typeof attack.name === 'string' && attack.name.length > 0 && attack.name.length <= 80, '攻击名称或ID无效');
    requireRule(['melee', 'ranged'].includes(attack.kind), '攻击类型无效');
    integer(attack.bonus, -30, 100, '攻击加值');
    if (attack.kind === 'melee') integer(attack.reach, 1, 60, '触及');
    else { integer(attack.range, 1, 1000, '正常射程'); integer(attack.longRange, attack.range, 2000, '最大射程'); }
    requireRule(Array.isArray(attack.damage) && attack.damage.length > 0 && attack.damage.length <= 8, '伤害分项无效');
    for (const damage of attack.damage) { parseDice(damage.formula); requireRule(DAMAGE_TYPES.includes(damage.type), '伤害类型无效'); }
    requireRule(!attack.manualEffect || (typeof attack.manualEffect === 'string' && attack.manualEffect.length <= 1000), '附加效应说明无效');
  }
}

export function validateState(state) {
  if (state.formatVersion !== 1 || state.rulesVersion !== 'dnd2024-basic-v1') {
    const error = new RuleError('不支持的存档或规则版本；请保留原文件');
    error.code = 'UNSUPPORTED_FORMAT'; throw error;
  }
  requireRule(typeof state.campaignId === 'string' && /^[\w-]{1,100}$/.test(state.campaignId) && typeof state.title === 'string' && state.title.length <= 100, '战役标识无效');
  integer(state.revision, 0, Number.MAX_SAFE_INTEGER, '进度版本');
  requireRule(Array.isArray(state.actors) && state.actors.length > 0 && state.actors.length <= 40, '参与者数量无效');
  integer(state.board.width, 20, 300, '棋盘宽'); integer(state.board.depth, 20, 300, '棋盘深');
  requireRule(state.board.major === 5 && state.board.minor === 1 && state.board.terrain === 'open-flat', '当前仅支持5尺大格、1尺小格的平坦棋盘');
  requireRule(new Set(state.actors.map(a => a.id)).size === state.actors.length, '棋子ID重复');
  for (const actor of state.actors) validateActor(actor, state.board);
  requireRule(['preparing', 'active', 'ended'].includes(state.combat.phase), '战斗阶段无效');
  requireRule(Array.isArray(state.events) && Array.isArray(state.appliedIds), '事件记录无效');
  requireRule(state.events.every(e => e && typeof e.publicText === 'string' && typeof e.dmText === 'string' && Number.isInteger(e.revision)) && state.appliedIds.every(id => typeof id === 'string'), '事件字段无效');
  if (state.combat.phase === 'active') {
    const order = state.combat.order;
    requireRule(Array.isArray(order) && order.length === state.actors.length && new Set(order).size === order.length &&
      order.every(id => state.actors.some(a => a.id === id)), '先攻顺序无效');
    integer(state.combat.index, 0, order.length - 1, '当前回合');
    requireRule(Array.isArray(state.combat.initiative) && state.combat.initiative.length === order.length &&
      new Set(state.combat.initiative.map(r => r.actorId)).size === order.length &&
      state.combat.initiative.every(r => order.includes(r.actorId) && Number.isFinite(r.total)), '先攻记录无效');
    integer(state.combat.round, 1, Number.MAX_SAFE_INTEGER, '轮数');
    integer(state.combat.moved, 0, 10000, '已移动距离'); integer(state.combat.attacksUsed, 0, 10, '已用攻击次数');
    requireRule(['none', 'attack', 'dash', 'manual'].includes(state.combat.action), '动作状态无效');
  }
}

const editable = ['name', 'ac', 'maxHp', 'hp', 'tempHp', 'speed', 'initiativeBonus', 'attackLimit',
  'body', 'space', 'position', 'facing', 'immunities', 'resistances', 'vulnerabilities',
  'notes', 'resources', 'hidden', 'confirmed', 'attacks', 'tiePriority'];
const getActor = (state, id) => {
  const actor = state.actors.find(a => a.id === id);
  requireRule(actor, '棋子不存在或不可见', 404);
  return actor;
};
function dmOnly(principal) { requireRule(principal.role === 'dm', '需要DM权限', 403); }
function owned(actor, principal) { requireRule(principal.role === 'dm' || actor.ownerId === principal.id, '不能操作其他角色', 403); }
function activeTurn(state, actor) {
  requireRule(state.combat.phase === 'active' && state.combat.order[state.combat.index] === actor.id, '尚未进入该角色回合');
  requireRule(actor.hp > 0 && actor.confirmed, '角色倒地或资料尚未核对；需DM裁定');
}

export function executeAction(original, command, principal, { draw = die, id = randomUUID, now = () => new Date().toISOString() } = {}) {
  requireRule(command && typeof command === 'object', '操作格式无效');
  requireRule(command.campaignId === original.campaignId, '提议属于其他战役，请重新导出局面', 409);
  requireRule(typeof command.actionId === 'string' && /^[\w-]{8,100}$/.test(command.actionId), '操作须含8～100位唯一actionId');
  requireRule(!original.appliedIds.includes(command.actionId), '该操作已执行，请刷新局面', 409);
  requireRule(command.expectedRevision === original.revision, '进度已变化，请刷新并重新决定操作', 409);
  const state = structuredClone(original);
  const payload = command.payload || {};
  let publicText = '', dmText = '', rolls = [];
  switch (command.type) {
    case 'edit-actor': {
      dmOnly(principal);
      const actor = getActor(state, payload.actorId);
      requireRule(payload.patch && typeof payload.patch === 'object' && Object.keys(payload.patch).length > 0 && Object.keys(payload.patch).every(k => editable.includes(k)), '修改字段不受支持');
      Object.assign(actor, payload.patch);
      validateActor(actor, state.board);
      dmText = `DM更新了 ${actor.name} 的资料或位置；${payload.reason || '资料核对'}`;
      if (payload.publicNote) publicText = String(payload.publicNote).slice(0, 1000);
      break;
    }
    case 'start': {
      dmOnly(principal);
      requireRule(state.combat.phase !== 'active', '战斗已经开始');
      requireRule(state.actors.every(a => a.confirmed), '请先由DM核对全部角色的数值、资源与形态');
      requireRule(state.actors.every(a => a.hp > 0), '起始参与者须有生命值');
      const initiative = state.actors.map(actor => {
        const roll = rollD20(payload.modes?.[actor.id] || 'normal', draw);
        return { actorId: actor.id, ...roll, bonus: actor.initiativeBonus, total: roll.natural + actor.initiativeBonus };
      });
      const order = [...state.actors].sort((a, b) => initiative.find(r => r.actorId === b.id).total - initiative.find(r => r.actorId === a.id).total || a.tiePriority - b.tiePriority).map(a => a.id);
      state.combat = { phase: 'active', round: 1, index: 0, order, initiative, moved: 0, attacksUsed: 0, action: 'none' };
      rolls = initiative;
      publicText = '战斗开始。先攻已掷；同分顺序按DM设置，可由DM调整。';
      dmText = initiative.map(r => `${getActor(state, r.actorId).name}: ${r.values.join('/')}+${r.bonus}=${r.total}`).join('；');
      break;
    }
    case 'set-order': {
      dmOnly(principal);
      requireRule(state.combat.phase === 'active' && state.combat.round === 1 && state.combat.index === 0 && state.combat.moved === 0 && state.combat.action === 'none', '只可在首轮尚未操作时调整同分顺序');
      const order = payload.order;
      requireRule(Array.isArray(order) && order.length === state.actors.length && new Set(order).size === order.length && order.every(id => state.combat.order.includes(id)), '顺序必须恰好包括全部参与者');
      const score = id => state.combat.initiative.find(r => r.actorId === id).total;
      requireRule(order.every((id, i) => i === 0 || score(order[i - 1]) >= score(id)), '只能调整先攻数值相同者的顺序');
      state.combat.order = order;
      publicText = 'DM已确认同分先攻顺序。';
      break;
    }
    case 'move': {
      const actor = getActor(state, payload.actorId); owned(actor, principal); activeTurn(state, actor);
      const next = { ...actor, position: payload.position };
      validateActor(next, state.board);
      const cost = Math.max(Math.abs(actor.position.x - next.position.x), Math.abs(actor.position.z - next.position.z));
      requireRule(cost > 0 && (actor.position.x - next.position.x) % 5 === 0 &&
        (actor.position.z - next.position.z) % 5 === 0, '规则移动按5尺格进行；1尺细格仅辅助观察，精细定位可由DM调整');
      const allowance = actor.speed * (state.combat.action === 'dash' ? 2 : 1);
      requireRule(state.combat.moved + cost <= allowance, '移动距离超过本回合剩余移动力');
      requireRule(!state.actors.some(other => other.id !== actor.id && overlaps(next, other)), '目的地不可停留；需DM核对占地');
      // This first slice supports an open board. Passing occupied spaces needs adjudication.
      const steps = Math.ceil(cost * 2);
      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        const at = { ...actor, position: { x: actor.position.x + (next.position.x - actor.position.x) * t,
          z: actor.position.z + (next.position.z - actor.position.z) * t } };
        requireRule(!state.actors.some(other => other.id !== actor.id && overlaps(at, other)), '路径穿过占地；请分段绕行或由DM裁定');
      }
      actor.position = payload.position; state.combat.moved += cost;
      publicText = actor.hidden ? '' : `${actor.name} 移动 ${cost} 尺。`;
      dmText = `${actor.name} → (${actor.position.x}, ${actor.position.z})`;
      break;
    }
    case 'dash': {
      const actor = getActor(state, payload.actorId); owned(actor, principal); activeTurn(state, actor);
      requireRule(state.combat.action === 'none', '本回合动作已使用');
      state.combat.action = 'dash'; publicText = actor.hidden ? '' : `${actor.name} 使用疾走。`; break;
    }
    case 'attack': {
      const actor = getActor(state, payload.actorId); owned(actor, principal); activeTurn(state, actor);
      const target = state.actors.find(a => a.id === payload.targetId && (principal.role === 'dm' || !a.hidden || a.ownerId === principal.id));
      requireRule(target, '目标不存在或不可见', 404);
      requireRule(actor.id !== target.id && !actor.hidden && !target.hidden, '自动攻击需选择已揭示的其他棋子；隐藏攻击请由DM裁定');
      requireRule(target.hp > 0, '目标已倒地；后续攻击、死亡豁免与濒死伤害请由DM裁定');
      requireRule(['none', 'attack'].includes(state.combat.action) && state.combat.attacksUsed < actor.attackLimit, '本回合攻击次数已用完或已使用其他动作');
      const attack = actor.attacks.find(a => a.id === payload.attackId); requireRule(attack, '未设置该攻击，请由DM补充角色攻击资料');
      const distance = distanceBetween(actor, target);
      requireRule(distance <= (attack.kind === 'melee' ? attack.reach : attack.longRange), '目标超出触及或射程');
      let mode = payload.mode || 'normal';
      requireRule(['normal', 'advantage', 'disadvantage'].includes(mode), '检定模式无效');
      if (attack.kind === 'ranged') {
        const nearby = state.actors.some(a => a.id !== actor.id && !a.hidden && a.kind !== actor.kind && a.hp > 0 && distanceBetween(actor, a) <= 5);
        const inherentDisadvantage = distance > attack.range || nearby;
        if (inherentDisadvantage) mode = mode === 'advantage' ? 'normal' : 'disadvantage';
      }
      const roll = rollD20(mode, draw);
      const critical = roll.natural === 20;
      const hit = critical || (roll.natural !== 1 && roll.natural + attack.bonus >= target.ac);
      rolls = [{ ...roll, bonus: attack.bonus, total: roll.natural + attack.bonus }];
      let result;
      if (hit) {
        const damage = attack.damage.map(item => ({ ...rollDamage(item.formula, critical, draw), type: item.type }));
        result = applyDamage(target, damage.map(d => ({ type: d.type, amount: d.total })));
        rolls.push(...damage);
      }
      state.combat.action = 'attack'; state.combat.attacksUsed++;
      publicText = `${actor.name} → ${target.name}：${attack.name}，d20[${roll.values.join(',')}]${attack.bonus >= 0 ? '+' : ''}${attack.bonus}=${roll.natural + attack.bonus}，${hit ? `${critical ? '重击，' : '命中，'}造成 ${result.total} 伤害` : '未命中'}。`;
      if (hit) publicText += ` 伤害骰：${rolls.slice(1).map(r => `${r.type} [${r.values.join(',')}]${r.modifier >= 0 ? '+' : ''}${r.modifier}`).join('；')}。`;
      if (hit && attack.manualEffect) publicText += ` 待DM裁定：${attack.manualEffect}`;
      if (hit && target.hp === 0) publicText += ' 目标生命归零，濒死/死亡与形态变化由DM裁定。';
      dmText = publicText + (result ? ` 剩余HP ${target.hp}，临时生命 ${target.tempHp}。` : '');
      break;
    }
    case 'next': {
      requireRule(state.combat.phase === 'active', '战斗尚未开始');
      owned(getActor(state, state.combat.order[state.combat.index]), principal);
      state.combat.index = (state.combat.index + 1) % state.combat.order.length;
      if (state.combat.index === 0) state.combat.round++;
      Object.assign(state.combat, { moved: 0, attacksUsed: 0, action: 'none' });
      publicText = '当前回合结束。'; break;
    }
    case 'end': dmOnly(principal); state.combat.phase = 'ended'; publicText = 'DM结束了这场战斗。'; break;
    case 'adjudicate': {
      dmOnly(principal);
      requireRule(typeof payload.reason === 'string' && payload.reason.trim().length >= 2 && payload.reason.length <= 2000, '请填写人工裁定依据');
      const actor = getActor(state, payload.actorId);
      if (payload.damage) {
        requireRule(Array.isArray(payload.damage) && payload.damage.length <= 20, '伤害分项无效');
        const result = applyDamage(actor, payload.damage); dmText = `人工裁定伤害 ${result.total}；HP ${actor.hp}；`;
      }
      if (payload.heal !== undefined) { integer(payload.heal, 0, 10000, '治疗'); actor.hp = Math.min(actor.maxHp, actor.hp + payload.heal); }
      if (payload.temporaryHp !== undefined) { integer(payload.temporaryHp, 0, 10000, '临时生命'); actor.tempHp = Math.max(actor.tempHp, payload.temporaryHp); }
      if (payload.consumeAction) {
        activeTurn(state, actor);
        requireRule(state.combat.action === 'none', '动作已使用'); state.combat.action = 'manual';
      }
      if (payload.resources !== undefined) actor.resources = payload.resources;
      dmText += `${actor.name}：${payload.reason}`;
      publicText = typeof payload.publicNote === 'string' ? payload.publicNote.slice(0, 2000) : '';
      break;
    }
    default: throw new RuleError('不支持的操作类型');
  }
  state.revision++;
  state.appliedIds.push(command.actionId);
  state.events.push({ id: id(), revision: state.revision, time: now(), actionId: command.actionId,
    type: command.type, publicText, dmText: dmText || publicText, rolls, principal: principal.id });
  validateState(state);
  return state;
}

export function projectState(state, principal) {
  if (principal.role === 'dm') return { ...structuredClone(state), viewRole: 'dm', viewerId: principal.id };
  const visible = state.actors.filter(a => a.ownerId === principal.id || !a.hidden);
  const allowedIds = new Set(visible.map(a => a.id));
  const actors = visible.map(actor => {
    const data = { id: actor.id, name: actor.name, kind: actor.kind, position: structuredClone(actor.position),
      facing: actor.facing, body: structuredClone(actor.body), space: structuredClone(actor.space) };
    if (actor.ownerId === principal.id) {
      for (const key of ['ownerId', 'ac', 'maxHp', 'hp', 'tempHp', 'speed', 'confirmed', 'attacks', 'attackLimit',
        'initiativeBonus', 'immunities', 'resistances', 'vulnerabilities', 'resources']) data[key] = structuredClone(actor[key]);
    }
    return data;
  });
  const current = state.combat.order?.[state.combat.index];
  return { formatVersion: state.formatVersion, rulesVersion: state.rulesVersion, revision: state.revision,
    campaignId: state.campaignId, title: state.title, board: structuredClone(state.board), viewRole: 'player', viewerId: principal.id,
    actors, combat: { phase: state.combat.phase, round: state.combat.round,
      order: (state.combat.order || []).filter(id => allowedIds.has(id)),
      currentActorId: allowedIds.has(current) ? current : null,
      ...(state.actors.find(a => a.id === current)?.ownerId === principal.id ?
        { moved: state.combat.moved, attacksUsed: state.combat.attacksUsed, action: state.combat.action } : {}) },
    events: state.events.filter(e => e.publicText).map(e => ({ revision: e.revision, time: e.time, text: e.publicText })) };
}

export function handoff(state, principal) {
  return { protocol: 'local-dm-exchange-v1', audience: principal.role, expectedRevision: state.revision,
    instructions: '选择动作并返回proposal；骰点和机械结算由本地核心执行。未支持规则使用DM裁定并注明原因。此包可能含秘密，仅交给相应权限主持者。',
    state: projectState(state, principal),
    proposal: { campaignId: state.campaignId, actionId: randomUUID(), expectedRevision: state.revision, type: 'move',
      payload: { actorId: principal.role === 'dm' ? state.actors[0].id : state.actors.find(a => a.ownerId === principal.id)?.id,
        position: { x: 30, z: 40 } } } };
}

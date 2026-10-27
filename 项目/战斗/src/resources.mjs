// Pure data/rule helpers shared by the local core and the browser.
import { requireRule as check } from './rule-errors.mjs';
const number = (n, max = 10000) => Number.isInteger(n) && n >= 0 && n <= max;
const identifier = s => typeof s === 'string' && /^[\w-]{1,60}$/.test(s);
export const RESOURCE_KINDS = ['pool', 'dice', 'slots', 'pact', 'rolls', 'inventory'];
export function validateResources(actor) {
  if (actor.tempHpBase !== undefined) check(number(actor.tempHpBase) && actor.tempHpBase >= actor.tempHp, '临时生命显示基准不能小于当前值');
  if (actor.economy !== undefined) check(actor.economy && ['bonusUsed','reactionUsed'].every(k => typeof actor.economy[k] === 'boolean'), '回合资源状态无效');
  const pools = actor.resourcePools ?? [];
  check(Array.isArray(pools) && pools.length <= 80 && new Set(pools.map(r => r.id)).size === pools.length, '资源池须为不重复ID的数组（最多80项）');
  for (const r of pools) {
    check(identifier(r.id) && !['action','bonus','reaction','attack'].includes(r.id) && typeof r.name === 'string' && r.name.trim().length > 0 && r.name.length <= 80, '资源ID或名称无效');
    check(RESOURCE_KINDS.includes(r.kind) && number(r.max, 1000) && number(r.current, r.max), '资源类型、当前量或上限无效');
    check(typeof r.source === 'string' && r.source.length > 0 && r.source.length <= 1000, '资源须注明已核对的规则来源');
    if (['slots','pact'].includes(r.kind)) check(Number.isInteger(r.level) && r.level >= 1 && r.level <= 9 && r.max <= 20, '法术位须填写1～9环，上限不超过20');
    if (r.kind === 'dice') check([4,6,8,10,12,20,100].includes(r.sides), '骰池须填写有效骰型');
    if (r.kind === 'rolls') check(Array.isArray(r.values) && r.values.length === r.current && r.values.every(v => number(v,100)), '储存骰点须与剩余数量一致');
    check(r.recovery && typeof r.recovery === 'object' && !Array.isArray(r.recovery) && Object.keys(r.recovery).every(k => ['short','long','turn'].includes(k)), '恢复配置须为short/long/turn对象');
    for (const value of Object.values(r.recovery)) check(value === 'all' || number(value,1000), '恢复量须为all或非负整数');
    check(r.kind !== 'rolls' || !Object.keys(r.recovery).length, '预掷结果须由主持重新录入，不能自动生成');
  }
}
export function normalizeResources(state) {
  for (const actor of state.actors) {
    actor.tempHpBase ??= actor.tempHp;
    actor.resourcePools ??= [];
    actor.economy ??= { bonusUsed: false, reactionUsed: false };
  }
  return state;
}
export function recoverResources(actor, when) {
  for (const pool of actor.resourcePools || []) {
    const amount = pool.recovery[when];
    if (amount !== undefined) pool.current = amount === 'all' ? pool.max : Math.min(pool.max, pool.current + amount);
  }
}
export function beginTurn(actor) {
  actor.economy = { bonusUsed: false, reactionUsed: false };
  recoverResources(actor, 'turn');
}
export function resourceView(state, actor) {
  const c = state.combat, turn = c.phase === 'active' && (c.currentActorId || c.order?.[c.index]) === actor.id;
  return [
    { id:'action', name:'动作', kind:'action', current:turn && c.action === 'none' ? 1 : 0, max:1, color:'#62ce8b' },
    { id:'bonus', name:'附赠动作', kind:'bonus', current:turn && !actor.economy?.bonusUsed ? 1 : 0, max:1, color:'#ee9b50' },
    { id:'reaction', name:'反应', kind:'reaction', current:c.phase === 'active' && !actor.economy?.reactionUsed ? 1 : 0, max:1, color:'#b58be8' },
    ...(actor.resourcePools || []).map(r => ({...r, color: r.kind === 'slots' ? '#6fb5f0' : r.kind === 'pact' ? '#cb87e8' : '#e0c36a'}))
  ];
}
export function costProblem(state, actor, costs) {
  if (state.combat.phase !== 'active' || actor.hp <= 0 || !actor.confirmed) return '需要战斗中、资料已核对且未倒地';
  const turn = (state.combat.currentActorId || state.combat.order?.[state.combat.index]) === actor.id;
  if (!turn && !costs.some(c => c.resourceId === 'reaction')) return '尚未进入该角色回合';
  const totals = new Map();
  for (const c of costs) totals.set(c.resourceId, (totals.get(c.resourceId) || 0) + c.amount);
  for (const [key, amount] of totals) {
    if (['action','bonus','attack'].includes(key) && !turn) return '该费用仅能在自己的回合使用';
    if (key === 'action' && (amount !== 1 || state.combat.action !== 'none')) return '动作已使用';
    else if (key === 'bonus' && (amount !== 1 || actor.economy?.bonusUsed)) return '附赠动作已使用';
    else if (key === 'reaction' && (amount !== 1 || actor.economy?.reactionUsed)) return '反应已使用';
    else if (key === 'attack' && (!['none','attack'].includes(state.combat.action) || state.combat.attacksUsed + amount > actor.attackLimit)) return '攻击次数已用完或已使用其他动作';
    else if (!['action','bonus','reaction','attack'].includes(key)) {
      const pool = actor.resourcePools?.find(r => r.id === key);
      if (!pool || pool.current < amount) return `${pool?.name || key}不足`;
    }
  }
  const slots = [...totals].filter(([id]) => ['slots','pact'].includes(actor.resourcePools?.find(r => r.id === id)?.kind));
  if (slots.length && (slots.reduce((n,[,v])=>n+v,0) > 1 || state.combat.slotSpentBy?.includes(actor.id))) return '2024：每回合最多消耗一个法术位（含契约法术位）';
  return '';
}
export function spendResources(state, actor, costs) {
  check(Array.isArray(costs) && costs.length <= 20 && costs.every(c => identifier(c.resourceId) && Number.isInteger(c.amount) && c.amount > 0 && c.amount <= 1000), '费用格式无效');
  const problem = costProblem(state, actor, costs); check(!problem, problem);
  for (const c of costs) {
    if (c.resourceId === 'action') state.combat.action = 'manual';
    else if (c.resourceId === 'bonus') (actor.economy ??= {bonusUsed:false,reactionUsed:false}).bonusUsed = true;
    else if (c.resourceId === 'reaction') (actor.economy ??= {bonusUsed:false,reactionUsed:false}).reactionUsed = true;
    else if (c.resourceId === 'attack') { state.combat.action = 'attack'; state.combat.attacksUsed += c.amount; }
    else {
      const r = actor.resourcePools.find(r => r.id === c.resourceId); r.current -= c.amount;
      if (r.kind === 'rolls') r.values.splice(0,c.amount);
      if (['slots','pact'].includes(r.kind)) (state.combat.slotSpentBy ??= []).push(actor.id);
    }
  }
}

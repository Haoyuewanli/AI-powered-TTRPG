const number = (value, fallback, low, high) => Number.isFinite(value) ? Math.max(low, Math.min(high, Math.round(value))) : fallback;
export function resourceActorDraft(value) {
  const resource = value.resource || {}, stat = resource.data?.statBlock || resource.statBlock || {};
  const rows = String(value.text || '').split(/\r?\n/).filter(line => /^\s*\|/.test(line)).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
  const cell = pattern => rows.find(row => pattern.test(row[0] || ''))?.[1];
  const first = text => text === undefined ? undefined : Number(String(text).match(/\d+/)?.[0]);
  const hpValue = stat.hitPoints ?? first(cell(/^(?:HP上限|生命值上限|最大HP|最大生命)/i));
  const acCell = cell(/^(?:AC|护甲等级)(?:\s|$|、|[（(])/i);
  const acValue = stat.armorClass ?? (acCell?.includes('=') ? first(acCell.split('=').at(-1)) : first(acCell));
  const combinedSpeed = cell(/^(?:AC[、，,])?先攻[、，,]速度$/i);
  const speed = stat.speedsFeet?.walk ?? first(cell(/^速度(?:[（(]|$)/)) ?? (combinedSpeed ? Number(combinedSpeed.match(/(\d+)\s*尺/)?.[1]) : undefined);
  const size = String(stat.sizeText || ''), footprint = /超巨|Gargantuan/i.test(size) ? 20 : /巨型|Huge/i.test(size) ? 15 : /大型|Large/i.test(size) ? 10 : 5;
  const hp = number(hpValue, 10, 1, 10000);
  const missingFields = [[hpValue, '生命上限'], [acValue, 'AC'], [speed, '速度']].filter(([value]) => !Number.isFinite(value)).map(([, label]) => label);
  const draft = { ac: number(acValue, 10, 0, 100), maxHp: hp, hp, tempHp: 0,
    speed: number(speed, 30, 0, 300), initiativeBonus: number(stat.abilityScores?.dex === undefined ? undefined : Math.floor((stat.abilityScores.dex - 10) / 2), 0, -30, 100),
    space: { width: footprint, depth: footprint }, body: { width: footprint * .4, depth: footprint * .3, height: footprint * 1.2 },
    notes: ('来源：' + (resource.path || resource.name || '') + '\n' + (value.text || '')).slice(0, 8000),
    resources: '由资源预填，待DM核对规则版本、数值和能力；没有自动启用来源中的规则。',
    reference: { resourceId: resource.id, name: resource.name, path: resource.path }, attacks: [] };
  const damageTypes = { 挥砍: 'slashing', 穿刺: 'piercing', 钝击: 'bludgeoning', 火焰: 'fire', 寒冷: 'cold', 力场: 'force', 光耀: 'radiant', 暗蚀: 'necrotic', 毒素: 'poison', 强酸: 'acid', 闪电: 'lightning', 雷鸣: 'thunder', 心灵: 'psychic' };
  for (const [index, attack] of (Array.isArray(stat.attacks) ? stat.attacks : []).slice(0, 20).entries()) {
    const type = Object.entries(damageTypes).find(([label]) => String(attack.damageTypeText).includes(label))?.[1];
    if (!type || !/^\d{1,2}d\d{1,3}(?:[+-]\d{1,4})?$/i.test(attack.damageFormula || '') || !Number.isInteger(attack.attackBonus)) continue;
    const ranged = !attack.reachFeet && attack.rangeFeet;
    draft.attacks.push({ id: 'import-' + index, name: String(attack.name || '来源攻击').slice(0, 80), kind: ranged ? 'ranged' : 'melee', bonus: number(attack.attackBonus, 0, -30, 100),
      ...(ranged ? { range: number(attack.rangeFeet, 30, 1, 1000), longRange: number(attack.longRangeFeet || attack.rangeFeet, 30, 1, 2000) } : { reach: number(attack.reachFeet, 5, 1, 60) }),
      damage: [{ formula: attack.damageFormula, type }], manualEffect: '资源原文预填，须由DM核对启用版本及附加效应。' });
  }
  return { name: String(resource.name || '资源棋子').slice(0, 80), draft, sourceText: value.text || '', edition: resource.edition, missingFields };
}

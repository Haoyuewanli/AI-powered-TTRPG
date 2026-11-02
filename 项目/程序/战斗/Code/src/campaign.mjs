import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function findCampaign(storage) {
  const matches = (await readdir(storage, { withFileTypes: true })).filter(e => e.isDirectory() && e.name.startsWith('单人-12级开卡-'));
  if (matches.length !== 1) throw new Error('需有且只有一个12级开卡目录；多个战役时请用 --campaign 指定目录。');
  return join(storage, matches[0].name);
}

export async function initializeCampaign(directory) {
  const card = JSON.parse(await readFile(join(directory, '角色卡/抄录草稿.json'), 'utf8'));
  const monster = JSON.parse(await readFile(join(directory, '怪物/霜巨人.json'), 'utf8'));
  const values = card.candidateValues;
  const common = { tempHp: 0, resistances: [], vulnerabilities: [], immunities: [], notes: '', resources: '',
    hidden: false, facing: 0, confirmed: false };
  return {
    formatVersion: 1, rulesVersion: 'dnd2024-basic-v1', revision: 0, campaignId: randomUUID(),
    title: '单人 · 12级战斗试验', board: { width: 100, depth: 80, major: 5, minor: 1, terrain: 'open-flat' },
    actors: [
      { ...common, id: card.characterId, name: card.name, kind: 'pc', ownerId: 'player-1',
        ac: values.armorClass.value, hp: values.maxHp, maxHp: values.maxHp, speed: values.speedFeet,
        initiativeBonus: values.initiativeBonus, attackLimit: 1, tiePriority: 0,
        position: { x: 22.5, z: 42.5 }, space: { width: 5, depth: 5 }, body: { width: 2, depth: 1, height: 6 },
        attacks: [], resources: '待核对：当前HP、法术位、临时生命、荒野形态及启用形态。',
        notes: '数值由抄录草稿预填，未经核对；未替玩家选择攻击。外观尺寸为显示占位值。', reference: card },
      { ...common, id: 'npc-001', name: monster.name, kind: 'npc', ownerId: null,
        ac: monster.armorClass, hp: monster.hitPoints.average, maxHp: monster.hitPoints.average,
        speed: monster.speedFeet.walk, initiativeBonus: monster.initiative.bonus,
        attackLimit: monster.actions.find(a => a.kind === 'multiattack').count, tiePriority: 1,
        position: { x: 72.5, z: 42.5 }, space: monster.spaceFeet, body: { width: 7, depth: 4, height: 20 },
        immunities: monster.damageImmunities,
        attacks: monster.actions.filter(a => a.kind.endsWith('-attack')).map(a => ({
          id: a.id, name: a.name, kind: a.kind === 'melee-attack' ? 'melee' : 'ranged', bonus: a.attackBonus,
          ...(a.reachFeet ? { reach: a.reachFeet } : { range: a.rangeFeet.normal, longRange: a.rangeFeet.long }),
          damage: a.damage.map(d => ({ formula: d.formula, type: d.type })),
          ...(a.effect ? { manualEffect: '巨弓命中：速度降低10尺，持续到目标下回合结束；由DM调整并及时恢复。' } : {}) })),
        notes: '来源：5E不全书·怪物图鉴2025。战吼充能、临时生命及攻击优势由DM裁定；两次攻击逐次结算。外观尺寸为可编辑显示值。',
        resources: '战吼（充能5～6）；战斗开始前由DM确认可用。', reference: monster }
    ],
    combat: { phase: 'preparing', round: 0, order: [], index: 0, moved: 0, attacksUsed: 0, action: 'none' },
    events: [], appliedIds: []
  };
}

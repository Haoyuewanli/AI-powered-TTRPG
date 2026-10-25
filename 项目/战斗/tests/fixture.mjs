export const dm = { role: 'dm', id: 'DM' };
export const player = { role: 'player', id: 'player-1' };
export function fixture() {
  const base = { ac: 14, maxHp: 40, hp: 40, tempHp: 0, speed: 30, initiativeBonus: 2,
    attackLimit: 1, facing: 0, confirmed: true, hidden: false, resistances: [], vulnerabilities: [], immunities: [],
    notes: '仅DM读取的备注', resources: '无额外资源', space: { width: 5, depth: 5 }, body: { width: 2, depth: 1, height: 6 },
    attacks: [{ id: 'sword', name: '测试近战', kind: 'melee', bonus: 5, reach: 5, damage: [{ formula: '1d8+3', type: 'slashing' }] }] };
  return { formatVersion: 1, rulesVersion: 'dnd2024-basic-v1', revision: 0, campaignId: 'test-campaign', title: '合成测试',
    board: { width: 100, depth: 80, major: 5, minor: 1, terrain: 'open-flat' },
    actors: [{ ...structuredClone(base), id: 'pc-001', name: '测试冒险者', kind: 'pc', ownerId: 'player-1', tiePriority: 0, position: { x: 22.5, z: 22.5 } },
      { ...structuredClone(base), id: 'npc-001', name: '测试守卫', kind: 'npc', ownerId: null, tiePriority: 1, position: { x: 27.5, z: 22.5 } }],
    combat: { phase: 'preparing', round: 0, order: [], index: 0, moved: 0, attacksUsed: 0, action: 'none' }, events: [], appliedIds: [] };
}
let serial = 0;
export const command = (state, type, payload = {}) => ({ campaignId: state.campaignId, actionId: `test-action-${++serial}`, expectedRevision: state.revision, type, payload });
export function active() {
  const state = fixture();
  state.combat = { phase: 'active', round: 1, order: ['pc-001', 'npc-001'], index: 0,
    initiative: [{ actorId: 'pc-001', total: 20 }, { actorId: 'npc-001', total: 10 }], moved: 0, attacksUsed: 0, action: 'none' };
  return state;
}

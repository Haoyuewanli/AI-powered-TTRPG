import { createHash, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\\/\x00-\x1f]/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const key = value => JSON.stringify([value.moduleId, value.runId]);
const legacyKey = value => JSON.stringify([value.moduleId, value.runId, value.legacyCharacterId]);
export const archivePlayerIdentity = id => 'archive-player-' + hash(id);
const memberIdentity = (membership, ownerId) => 'archive-member-' + hash([membership.id, ownerId]);

export function validatePlayerMemberships(state) {
  if (state.playerMemberships === undefined && state.detachedLegacyMembers === undefined) return;
  const memberships = state.playerMemberships ?? [], detached = state.detachedLegacyMembers ?? [];
  if (state.playerMemberships === null || state.detachedLegacyMembers === null) fail('角色参团关系格式无效，原件已保留。', 409);
  if (!Array.isArray(memberships) || memberships.length > 10000 || !Array.isArray(detached) || detached.length > 10000) fail('角色参团关系格式无效，原件已保留。', 409);
  const seen = new Set(), ids = new Set(), legacy = new Set();
  for (const membership of memberships) {
    if (!membership || ![membership.id, membership.characterId, membership.moduleId, membership.runId].every(validId) || membership.legacyCharacterId !== undefined && !validId(membership.legacyCharacterId)) fail('角色参团身份无效。', 409);
    const itemKey = JSON.stringify([membership.characterId, membership.moduleId, membership.runId]);
    if (seen.has(itemKey) || ids.has(membership.id) || membership.legacyCharacterId && legacy.has(legacyKey(membership))) fail('角色参团关系重复，已停止读取。', 409);
    seen.add(itemKey); ids.add(membership.id); if (membership.legacyCharacterId) legacy.add(legacyKey(membership));
  }
  if (detached.some(item => !item || ![item.moduleId, item.runId, item.legacyCharacterId].every(validId))) fail('旧团成员关联记录无效。', 409);
}

export function archiveDirectory(tree) {
  const issues = [...tree.issues], entries = tree.entries.filter(entry => ['player', 'character'].includes(entry.type));
  const counts = new Map();
  for (const entry of entries) if (validId(entry.id)) counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
  const usable = entries.filter(entry => {
    if (validId(entry.id) && counts.get(entry.id) === 1) return true;
    issues.push({ path: entry.path, reason: '档案索引缺少唯一身份，暂不能关联游玩团。' }); return false;
  });
  const players = usable.filter(entry => entry.type === 'player').map(entry => ({ id: entry.id, name: entry.name, path: entry.path }));
  const characters = [];
  for (const entry of usable.filter(entry => entry.type === 'character')) {
    const owner = players.find(player => player.path === entry.path.split('/').slice(0, -1).join('/'));
    if (!owner) { issues.push({ path: entry.path, reason: '所属玩家身份无效，暂不能关联游玩团。' }); continue; }
    const levels = tree.entries.filter(level => level.type === 'level' && level.path.split('/').slice(0, -1).join('/') === entry.path)
      .filter(level => /^\d{1,2}级$/.test(level.name)).sort((a, b) => parseInt(b.name, 10) - parseInt(a.name, 10));
    const level = levels.find(level => tree.entries.some(file => file.path === level.path + '/能力.md'));
    characters.push({ id: entry.id, name: entry.name, path: entry.path, ownerId: owner.id, ownerName: owner.name, latestAbilityPath: level ? level.path + '/能力.md' : null });
  }
  return { players, characters, issues };
}

export function materializePlayerMembers(data, state, archive) {
  validatePlayerMemberships(state);
  const memberships = state.playerMemberships || [], detached = state.detachedLegacyMembers || [];
  for (const module of data.modules) for (const run of module.runs) {
    const original = [...run.characters];
    Object.defineProperty(run, '_storedCharacters', { value: original, configurable: true });
    const matching = memberships.filter(item => item.moduleId === module.id && item.runId === run.id);
    const hiddenLegacy = new Set([...matching, ...detached.filter(item => item.moduleId === module.id && item.runId === run.id)].map(item => item.legacyCharacterId).filter(Boolean));
    run.characters = original.filter(character => !hiddenLegacy.has(character.id));
    for (const membership of matching) {
      const character = archive.characters.find(character => character.id === membership.characterId);
      if (!character) { data.issues.push({ reason: '团内关联档案已移出或身份重复，成员暂不可用。', moduleId: module.id, runId: run.id }); continue; }
      run.characters.push({ id: memberIdentity(membership, character.ownerId), name: character.name,
        playerId: archivePlayerIdentity(character.ownerId), playerName: character.ownerName, archiveCharacterId: character.id,
        archivePlayerId: character.ownerId, membershipId: membership.id, managed: true });
    }
  }
  data.archive = archive;
  return data;
}

// Runtime members are projections. Saving a run never copies them into its original roster.
export function storedRun(run) {
  const { path, ...record } = run;
  return { ...record, characters: run._storedCharacters || run.characters.filter(character => !character.managed).map(({ managed, ...character }) => character) };
}

export function playerRelationRevision(tree, data) {
  return hash([tree.revision, data.modules.map(module => [module.id, module.name, module.path,
    module.runs.map(run => [run.id, run.name, run.path, run._storedCharacters || run.characters])])]);
}

export function playerRelationOverview(tree, data, state) {
  const archive = data.archive || archiveDirectory(tree), memberships = state.playerMemberships || [];
  const runs = data.modules.flatMap(module => module.runs.map(run => ({ moduleId: module.id, moduleName: module.name, runId: run.id, runName: run.name,
    characters: run.characters.map(character => ({ ...character, managed: !!character.managed })), unlinkedCharacters: run.characters.filter(character => !character.managed).map(character => ({ ...character, managed: false })) })));
  return { revision: state.revision, playerRevision: playerRelationRevision(tree, data), players: archive.players,
    characters: archive.characters.map(character => ({ ...character, memberships: memberships.filter(item => item.characterId === character.id).map(item => ({ moduleId: item.moduleId, runId: item.runId,
      ...(item.legacyCharacterId ? { legacyCharacterId: item.legacyCharacterId } : {}), available: runs.some(run => key(run) === key(item)) })) })), runs, issues: [...data.issues, ...archive.issues] };
}

export function setPlayerMemberships(state, data, archive, { characterId, runRefs }) {
  if (!validId(characterId) || !archive.characters.some(character => character.id === characterId)) fail('角色档案不存在或身份无效，请刷新。', 404);
  if (!Array.isArray(runRefs) || runRefs.length > 100 || runRefs.some(item => !item || ![item.moduleId, item.runId].every(validId))) fail('请选择有效游玩团，最多100个。');
  if (new Set(runRefs.map(key)).size !== runRefs.length) fail('游玩团重复。');
  const before = state.playerMemberships || [], retained = before.filter(item => item.characterId !== characterId), next = [];
  const detached = [...(state.detachedLegacyMembers || [])];
  for (const reference of runRefs) {
    const run = data.modules.find(module => module.id === reference.moduleId)?.runs.find(run => run.id === reference.runId);
    if (!run) fail('所选团已移动或删除，请刷新。', 409);
    const existing = before.find(item => item.characterId === characterId && key(item) === key(reference));
    const legacyCharacterId = reference.legacyCharacterId === null ? undefined : reference.legacyCharacterId ?? existing?.legacyCharacterId;
    if (legacyCharacterId !== undefined) {
      if (!validId(legacyCharacterId) || !(run._storedCharacters || run.characters).some(character => character.id === legacyCharacterId)) fail('旧团成员不存在。', 409);
      if (retained.some(item => key(item) === key(reference) && item.legacyCharacterId === legacyCharacterId)) fail('这名团成员已关联其他角色档案。', 409);
    }
    if (!existing && run.characters.length >= 100 && !legacyCharacterId) fail('此团已有100名角色，请先整理成员。');
    const changedLegacy = existing && existing.legacyCharacterId !== legacyCharacterId;
    next.push({ id: existing && !changedLegacy ? existing.id : randomUUID(), characterId, moduleId: reference.moduleId, runId: reference.runId,
      ...(legacyCharacterId ? { legacyCharacterId } : {}) });
  }
  for (const old of before.filter(item => item.characterId === characterId)) {
    if (old.legacyCharacterId && !next.some(item => key(item) === key(old) && item.legacyCharacterId === old.legacyCharacterId)) {
      if (!detached.some(item => legacyKey(item) === legacyKey(old))) detached.push({ moduleId: old.moduleId, runId: old.runId, legacyCharacterId: old.legacyCharacterId });
    }
  }
  // Invitations carry their managed-member cohort and are revalidated against the projection.
  // Unrelated players keep their invitations when another character joins or leaves.
  state.playerMemberships = [...retained, ...next]; state.detachedLegacyMembers = detached;
  validatePlayerMemberships(state);
  return { characterId, runRefs: next.map(({ moduleId, runId, legacyCharacterId }) => ({ moduleId, runId, ...(legacyCharacterId ? { legacyCharacterId } : {}) })) };
}

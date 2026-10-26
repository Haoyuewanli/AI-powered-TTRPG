import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson, openStore, acquireLock } from './store.mjs';
import { initializeCampaign } from './campaign.mjs';
import { RuleError, requireRule, validateState } from './rules.mjs';

const freshCombat = () => ({ phase: 'preparing', round: 0, order: [], index: 0, moved: 0, attacksUsed: 0, action: 'none' });
const validId = id => typeof id === 'string' && /^[\w-]{1,100}$/.test(id);
const name = value => { requireRule(typeof value === 'string' && value.trim().length > 0 && value.length <= 80, '名称须为1～80字'); return value.trim(); };
const isWithin = (root, path) => { const rel = relative(root, path); return !rel.startsWith('..') && !isAbsolute(rel); };
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }

export function upgradeBattle(state, campaignId, battleId) {
  if (state.formatVersion === 2) {
    requireRule(state.campaignId === campaignId && state.battleId === battleId, '战斗文件与团目录不匹配');
    return { ...state, board: { extended: true, baseEnabled: true, ...state.board } };
  }
  validateState(state);
  return { ...state, board: { extended: true, baseEnabled: true, ...state.board }, formatVersion: 2, campaignId, battleId, undoStack: [], objects: [], diceMode: 'program' };
}

function blankActor() {
  return { id: `pc-${randomUUID()}`, name: '待填写的玩家角色', kind: 'pc', ownerId: 'player-1',
    ac: 10, maxHp: 10, hp: 10, tempHp: 0, speed: 30, initiativeBonus: 0, attackLimit: 1, tiePriority: 0,
    body: { width: 2, depth: 1, height: 6 }, space: { width: 5, depth: 5 }, position: { x: 12.5, y: 0, z: 12.5 },
    facing: 0, immunities: [], resistances: [], vulnerabilities: [], attacks: [],
    notes: '新建占位角色，数值和资源须由DM填写核对。', resources: '', hidden: false, confirmed: false };
}

export function newBattleState(campaignId, battleId, title, template) {
  return {
    formatVersion: 2, rulesVersion: 'dnd2024-basic-v1', campaignId, battleId, revision: 0, title,
    board: template ? structuredClone(template.board) : { width: 100, depth: 80, major: 5, minor: 1, terrain: 'open-flat', extended: true, baseEnabled: true },
    actors: template ? structuredClone(template.actors) : [blankActor()],
    objects: structuredClone(template?.objects || []), diceMode: template?.diceMode || 'program',
    combat: freshCombat(), events: [], appliedIds: [], undoStack: []
  };
}

export async function openWorkspace({ seedDirectory, workspaceDirectory, initial, persist }) {
  const root = resolve(workspaceDirectory), seed = resolve(seedDirectory);
  await mkdir(root, { recursive: true });
  const release = await acquireLock(join(root, '.workspace.lock'));
  const indexPath = join(root, '工作区.json');
  let registry, selectedStore, selectedCampaign, selectedBattle, seedInitial;
  let queue = Promise.resolve();
  const directoryOf = record => {
    requireRule(record && validId(record.id) && typeof record.path === 'string', '团目录索引无效');
    const directory = resolve(root, record.path);
    requireRule(directory === seed || isWithin(root, directory), '团目录超出本地工作区');
    return directory;
  };
  const battleDirectory = (campaign, battle) => {
    requireRule(validId(battle.id) && (battle.path === '.' || battle.path === `战斗/${battle.id}`), '战斗目录索引无效');
    return resolve(directoryOf(campaign), battle.path);
  };
  const readCampaign = async record => {
    const meta = await json(join(directoryOf(record), '团资料.json'));
    requireRule(meta.formatVersion === 1 && meta.id === record.id && Array.isArray(meta.battles) && meta.battles.length > 0 &&
      new Set(meta.battles.map(b => b.id)).size === meta.battles.length, '团资料文件无效');
    for (const battle of meta.battles) battleDirectory(record, battle);
    return meta;
  };
  async function saveIndex(next) {
    if (registry) await atomicJson(join(root, '工作区.previous.json'), registry);
    await atomicJson(indexPath, next); registry = next;
  }
  async function selectInternal(campaignId, battleId, updateIndex = true) {
    const record = registry.campaigns.find(c => c.id === campaignId); requireRule(record, '找不到该团', 404);
    const meta = await readCampaign(record);
    const battle = meta.battles.find(b => b.id === battleId); requireRule(battle, '找不到该战斗', 404);
    if (selectedCampaign?.id === campaignId && selectedBattle?.id === battleId) return;
    const nextStore = await openStore(battleDirectory(record, battle), () => {
      if (seedInitial && directoryOf(record) === seed) return seedInitial;
      throw new Error('战斗主文件及备份均不存在；请恢复备份，程序不会以其他角色资料重建这场战斗。');
    }, {
      persist, migrate: state => upgradeBattle(state, campaignId, battleId)
    });
    try {
      if (updateIndex) await saveIndex({ ...registry, activeCampaignId: campaignId, activeBattleId: battleId });
    } catch (error) { await nextStore.close(); throw error; }
    await selectedStore?.close();
    selectedStore = nextStore; selectedCampaign = { ...record, name: meta.name }; selectedBattle = battle;
  }
  try {
    try { registry = await json(indexPath); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('工作区索引无法读取，已保留原件；请检查工作区文件和备份。');
      let state;
      try { state = await json(join(seed, '战斗状态.json')); validateState(state); }
      catch (failure) { if (failure.code !== 'ENOENT') throw failure; state = await (initial || (() => initializeCampaign(seed)))(); seedInitial = state; }
      const campaignId = state.campaignId, battleId = state.battleId || randomUUID();
      let meta;
      try { meta = await json(join(seed, '团资料.json')); }
      catch (failure) {
        if (failure.code !== 'ENOENT') throw failure;
        meta = { formatVersion: 1, id: campaignId, name: state.title || '我的团', battles: [{ id: battleId, name: state.title || '首次战斗', path: '.' }] };
        await atomicJson(join(seed, '团资料.json'), meta);
      }
      registry = { formatVersion: 1, campaigns: [{ id: meta.id, path: relative(root, seed) || '.' }],
        activeCampaignId: meta.id, activeBattleId: meta.battles[0].id };
      await atomicJson(indexPath, registry);
    }
    requireRule(registry.formatVersion === 1 && Array.isArray(registry.campaigns) && registry.campaigns.length > 0 &&
      new Set(registry.campaigns.map(c => c.id)).size === registry.campaigns.length, '工作区索引格式无效');
    for (const record of registry.campaigns) directoryOf(record);
    await selectInternal(registry.activeCampaignId, registry.activeBattleId, false);
  } catch (error) { await selectedStore?.close(); await release(); throw error; }

  const transact = task => { const next = queue.then(task); queue = next.catch(() => {}); return next; };
  const dm = principal => requireRule(principal.role === 'dm', '需要DM权限', 403);
  const context = principal => {
    if (principal.role !== 'dm' && (principal.campaignId !== selectedCampaign.id || principal.battleId !== selectedBattle.id)) {
      const error = new RuleError('主持已切换战斗，请重新选择玩家身份', 409); error.code = 'CONTEXT_CHANGED'; throw error;
    }
  };
  return {
    get store() { return selectedStore; },
    get selection() { return { campaignId: selectedCampaign.id, campaignName: selectedCampaign.name, battleId: selectedBattle.id, battleName: selectedBattle.name }; },
    context,
    async catalog(principal) {
      dm(principal);
      return { ...this.selection, campaigns: await Promise.all(registry.campaigns.map(async record => {
        const meta = await readCampaign(record); return { id: meta.id, name: meta.name, battles: meta.battles.map(b => ({ id: b.id, name: b.name })) };
      })) };
    },
    dispatch(command, principal, options) { return transact(() => { context(principal); return selectedStore.dispatch(command, principal, options); }); },
    select(payload, principal) { return transact(async () => { dm(principal); await selectInternal(payload.campaignId, payload.battleId); return this.selection; }); },
    createCampaign(payload, principal) { return transact(async () => {
      dm(principal); const title = name(payload.name), campaignId = randomUUID(), battleId = randomUUID();
      const folder = join(root, `团-${campaignId}`); await mkdir(folder);
      const template = payload.copyCurrent ? selectedStore.state : null;
      const state = newBattleState(campaignId, battleId, '第一场战斗', template);
      await atomicJson(join(folder, '战斗状态.json'), state);
      await atomicJson(join(folder, '团资料.json'), { formatVersion: 1, id: campaignId, name: title,
        battles: [{ id: battleId, name: state.title, path: '.' }] });
      const record = { id: campaignId, path: relative(root, folder) };
      await saveIndex({ ...registry, campaigns: [...registry.campaigns, record] });
      await selectInternal(campaignId, battleId); return this.selection;
    }); },
    createBattle(payload, principal) { return transact(async () => {
      dm(principal); const title = name(payload.name), battleId = randomUUID();
      const record = registry.campaigns.find(c => c.id === selectedCampaign.id), meta = await readCampaign(record);
      let template;
      if (payload.templateBattleId) {
        const source = meta.battles.find(b => b.id === payload.templateBattleId); requireRule(source, '找不到初始状态来源');
        template = source.id === selectedBattle.id ? selectedStore.state : await json(join(battleDirectory(record, source), '战斗状态.json'));
        validateState(template);
      }
      const battle = { id: battleId, name: title, path: `战斗/${battleId}` }, folder = battleDirectory(record, battle);
      await mkdir(folder, { recursive: true });
      await atomicJson(join(folder, '战斗状态.json'), newBattleState(meta.id, battleId, title, template));
      await atomicJson(join(directoryOf(record), '团资料.previous.json'), meta);
      await atomicJson(join(directoryOf(record), '团资料.json'), { ...meta, battles: [...meta.battles, battle] });
      await selectInternal(meta.id, battleId); return this.selection;
    }); },
    async close() { await queue; await selectedStore.close(); await release(); }
  };
}

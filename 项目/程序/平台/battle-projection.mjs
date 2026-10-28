import { lstat, realpath } from 'node:fs/promises';
import { resolve, relative, join, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ProjectFileError, projectRelativePath, archiveInitial } from './project-files.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const encode = value => JSON.stringify(value);
const equal = isDeepStrictEqual;
const check = (condition, message, status = 409) => { if (!condition) throw new ProjectFileError(message, status, 'BATTLE_PROJECTION_INVALID'); };
const readable = name => {
  let value = String(name || '未命名').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 60) || '未命名';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) value = '_' + value;
  return value;
};
const stable = (...parts) => hash(encode(parts)).slice(0, 40);
const actorResourceId = (campaignId, actorId) => 'battle-actor-' + stable(campaignId, actorId);
const actorInstanceId = (campaignId, battleId, actorId) => 'battle-instance-' + stable(campaignId, battleId, actorId);

function snapshotData(value) {
  const inspect = (item, depth = 0) => {
    check(depth <= 32, '战斗快照嵌套过深');
    if (Array.isArray(item)) item.forEach(next => inspect(next, depth + 1));
    else if (item !== null && typeof item === 'object') for (const [key, next] of Object.entries(item)) { check(!['__proto__', 'constructor', 'prototype'].includes(key), '战斗快照字段无效'); inspect(next, depth + 1); }
    else check(item === null || ['string', 'boolean'].includes(typeof item) || typeof item === 'number' && Number.isFinite(item), '战斗快照包含非JSON值');
  };
  inspect(value); const text = encode(value); check(Buffer.byteLength(text) <= 16 * 1024 * 1024, '战斗快照超过16MB投影限制', 413); return structuredClone(value);
}

function overrides(base, current, ignored = []) {
  const set = {}, remove = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(current)])) {
    if (ignored.includes(key)) continue;
    if (!Object.hasOwn(current, key)) remove.push(key);
    else if (!equal(base[key], current[key])) set[key] = current[key];
  }
  return { mode: 'absolute-overrides', set, remove };
}

function baselineActor(actor) {
  const baseline = structuredClone(actor);
  baseline.hp = actor.maxHp;
  baseline.tempHp = 0;
  baseline.resourcePools = (actor.resourcePools || []).map(pool => ({ ...pool, current: pool.kind === 'rolls' ? pool.current : pool.max }));
  return baseline;
}

function actorDelta(base, actor) {
  check(Number.isFinite(base.hp) && Number.isFinite(base.maxHp) && Number.isFinite(base.tempHp), '共享角色基准中的生命值无效');
  const before = new Map((base.resourcePools || []).map(pool => [pool.id, pool]));
  const after = new Map((actor.resourcePools || []).map(pool => [pool.id, pool]));
  const pools = [];
  for (const pool of actor.resourcePools || []) {
    const baseline = before.get(pool.id);
    if (baseline) {
      check(Number.isFinite(baseline.current) && Number.isFinite(baseline.max), '共享资源池基准数值无效');
      pools.push({ id: pool.id, mode: 'delta', current: pool.current - baseline.current, max: pool.max - baseline.max,
        overrides: overrides(baseline, pool, ['id', 'current', 'max']) });
    } else pools.push({ id: pool.id, mode: 'added-absolute', value: pool });
  }
  for (const pool of base.resourcePools || []) if (!after.has(pool.id)) pools.push({ id: pool.id, mode: 'removed' });
  return { hp: actor.hp - base.hp, maxHp: actor.maxHp - base.maxHp, tempHp: (actor.tempHp || 0) - base.tempHp,
    resourcePools: pools, otherState: overrides(base, actor, ['hp', 'maxHp', 'tempHp', 'resourcePools']) };
}

function eventLog(state) {
  check(Array.isArray(state.events || []), '战斗事件须为数组');
  const text = (state.events || []).map(event => {
    check(event && typeof event === 'object', '战斗日志条目无效');
    const at = event.at ?? event.timestamp ?? event.time ?? '时间未记录';
    const content = event.dmText ?? event.text ?? '';
    check(typeof content === 'string', '战斗日志正文须为文本');
    return `${at} | v${event.revision ?? '?'}${event.undoneBy ? ' | 已撤销' : ''}\n${content}\n`;
  }).join('\n');
  check(text.length <= 1000000 && Buffer.byteLength(text) <= 4 * 1024 * 1024, '战斗日志超出投影限制；未截断，原文件保留', 413);
  return text;
}

export function createBattleProjection({ root, files } = {}) {
  check(typeof root === 'string' && files && typeof files.saveCurrent === 'function', '须提供项目根目录和文件管理器');
  const directory = resolve(root);
  let queue = Promise.resolve();

  async function verifySource(path) {
    projectRelativePath(path); check(path.startsWith('资源/'), '战斗权威快照必须位于资源目录');
    const rootInfo = await lstat(directory); check(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), '项目根目录不能为链接');
    const canonicalRoot = await realpath(directory); let current = directory;
    for (const part of path.split('/')) {
      current = join(current, part); const info = await lstat(current);
      check(!info.isSymbolicLink(), '权威快照路径包含链接，投影已拒绝');
      const checked = relative(canonicalRoot, await realpath(current));
      check(!isAbsolute(checked) && checked !== '..' && !checked.startsWith('..' + sep), '权威快照不能越过项目根目录');
    }
    const info = await lstat(current); check(info.isFile() && info.nlink <= 1, '权威快照须为普通非硬链接文件');
  }

  function ensureResource({ id, name, kind, origin, data, known, definitions }) {
    const existing = known.get(id);
    if (existing) {
      let value;
      try { value = JSON.parse(existing.bytes.toString('utf8')); } catch { throw new ProjectFileError('投影资源基准JSON损坏，原件已保留', 409); }
      check(value.id === id && value.formatVersion === 1 && value.projection?.format === 'battle-resource-v1' && equal(value.projection.origin, origin), '资源ID与已有定义来源冲突，原件已保留');
      check(value.data && typeof value.data === 'object', '资源基准缺少数据，原件已保留');
      return { resource: existing.resource, value };
    }
    const value = { formatVersion: 1, id, name, projection: { format: 'battle-resource-v1', origin, baseline: 'full-capacity-counts; rolled-values-preserved' }, data };
    const filename = readable(name) + '--' + hash(id).slice(0, 12) + '.json';
    definitions.push({ kind, name: filename, initial: archiveInitial(name).letter, resource: value });
    return { value };
  }

  async function syncInternal({ state, selection = {}, sourcePath } = {}) {
    const snapshot = snapshotData(state);
    check(snapshot && typeof snapshot === 'object' && typeof snapshot.campaignId === 'string' && typeof snapshot.battleId === 'string' &&
      Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0 && Array.isArray(snapshot.actors) && snapshot.actors.length <= 2000, '战斗快照身份、版本或角色清单无效');
    check(!selection.campaignId || selection.campaignId === snapshot.campaignId, '战斗选择与快照所属团不一致');
    check(!selection.battleId || selection.battleId === snapshot.battleId, '战斗选择与快照所属场次不一致');
    check(/^[\w-]{1,100}$/.test(snapshot.battleId), '战斗ID不能用作安全目录名');
    const actorIds = new Set();
    for (const actor of snapshot.actors) {
      check(actor && typeof actor.id === 'string' && actor.id && !actorIds.has(actor.id) && typeof actor.name === 'string' && actor.name.length > 0 &&
        ['pc', 'npc'].includes(actor.kind) && Number.isFinite(actor.hp) && Number.isFinite(actor.maxHp) && (!actor.resourcePools || Array.isArray(actor.resourcePools)), '战斗角色身份或资源基准无效');
      actorIds.add(actor.id);
      for (const pool of actor.resourcePools || []) check(pool && typeof pool.id === 'string' && Number.isFinite(pool.current) && Number.isFinite(pool.max), '战斗资源池数值无效');
    }
    const logText = eventLog(snapshot);
    await verifySource(sourcePath);
    const moduleId = 'campaign:' + snapshot.campaignId, moduleName = selection.campaignName || '团-' + snapshot.campaignId;
    const location = await files.moduleLocation({ moduleId, moduleName });
    const callPath = `战斗/${location.folder}/${snapshot.battleId}/战斗调用.json`, logPath = `战斗/${location.folder}/${snapshot.battleId}/战斗日志.txt`;
    const fingerprint = hash(encode(snapshot));
    const previousBytes = await files.readManagedFile(callPath);
    if (previousBytes) {
      let previous;
      try { previous = JSON.parse(previousBytes.toString('utf8')); } catch { throw new ProjectFileError('战斗调用JSON损坏，原件已保留', 409); }
      const projection = previous.payload?.projection;
      if (projection?.version === 1 && projection.campaignId === snapshot.campaignId && projection.battleId === snapshot.battleId && projection.sourceRevision === snapshot.revision) {
        check(projection.stateFingerprint === fingerprint, '同一战斗版本出现不同快照，投影未覆盖；请先核对权威进度');
      }
      if (projection?.version === 1 && projection.campaignId === snapshot.campaignId && projection.battleId === snapshot.battleId &&
        projection.sourceRevision === snapshot.revision && projection.stateFingerprint === fingerprint && projection.sourcePath === sourcePath) {
        await files.readManagedFile(location.currentPath); await files.readManagedFile(logPath);
        return { changed: false, revision: (await files.manifest()).revision, moduleId, moduleName, sourceRevision: snapshot.revision, callPath, logPath };
      }
    }
    const mapId = 'battle-map-' + stable(snapshot.campaignId, snapshot.battleId), mapInstance = 'battle-map-instance-' + stable(snapshot.campaignId, snapshot.battleId);
    const catalog = await files.resourceDefinitions([...snapshot.actors.map(actor => actorResourceId(snapshot.campaignId, actor.id)), mapId]);
    const known = new Map(catalog.found.map(entry => [entry.resource.id, entry])), definitions = [], instances = [];
    for (const actor of snapshot.actors) {
      const resourceId = actorResourceId(snapshot.campaignId, actor.id), instanceId = actorInstanceId(snapshot.campaignId, snapshot.battleId, actor.id);
      const baseline = ensureResource({ id: resourceId, name: actor.name, kind: actor.kind === 'pc' ? '角色' : 'NPC',
        origin: { campaignId: snapshot.campaignId, actorId: actor.id }, data: { actor: baselineActor(actor) }, known, definitions });
      check(baseline.value.data.actor && baseline.value.data.actor.id === actor.id, '共享角色基准身份不一致，原件已保留');
      instances.push({ id: instanceId, resourceId, delta: actorDelta(baseline.value.data.actor, actor) });
    }
    const map = { board: snapshot.board || {}, objects: snapshot.objects || [] };
    const baselineMap = ensureResource({ id: mapId, name: (selection.battleName || snapshot.title || snapshot.battleId) + '·地图', kind: '地图',
      origin: { campaignId: snapshot.campaignId, battleId: snapshot.battleId }, data: { map }, known, definitions });
    check(baselineMap.value.data.map && typeof baselineMap.value.data.map === 'object', '共享地图基准无效，原件已保留');
    instances.push({ id: mapInstance, resourceId: mapId, delta: { mapState: overrides(baselineMap.value.data.map, map) } });
    const result = await files.saveProjection({ expectedRevision: catalog.revision, moduleId, moduleName, battleId: snapshot.battleId, name: selection.battleName || snapshot.title || snapshot.battleId,
      definitions, instances, expectedResources: catalog.found.map(entry => ({ id: entry.resource.id, fingerprint: entry.resource.fingerprint })), logText,
      payload: { projection: { version: 1, campaignId: snapshot.campaignId, battleId: snapshot.battleId,
        sourceRevision: snapshot.revision, stateFingerprint: fingerprint, sourcePath, authoritative: false }, combat: snapshot.combat || {} } });
    return { changed: true, revision: result.revision, moduleId, moduleName, sourceRevision: snapshot.revision, callPath: result.callPath, logPath: result.logPath };
  }

  return {
    sync(input) { const next = queue.then(() => syncInternal(input)); queue = next.catch(() => {}); return next; },
    async settled() { await queue; }
  };
}

import { mkdir, readFile, readdir, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import { resolve, relative, dirname, join, isAbsolute, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const RESOURCE_KINDS = Object.freeze(['角色', 'NPC', '怪物', '地图', '故事']);
export const ARCHIVE_LETTERS = Object.freeze(Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index)));
export const INTERNAL_RESOURCE_TREES = Object.freeze(['资源/故事/Z/战役存档']);
const INDEX = '资源/故事/G/管理索引.json';
const RELEASES = '资源/故事/F/发放记录.json';
const JOURNAL = '资源/故事/G/待完成事务.json';
const LOCK = '资源/故事/G/.管理.lock';
const PRIVATE_FILES = new Set([INDEX, RELEASES, JOURNAL, LOCK]);
const MAX_FILE = 16 * 1024 * 1024;
const sha = value => createHash('sha256').update(value).digest('hex');
const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { usage: 'sort', sensitivity: 'base' });
const pinyinBoundaries = [['A', '阿'], ['B', '八'], ['C', '嚓'], ['D', '咑'], ['E', '妸'], ['F', '发'], ['G', '旮'], ['H', '哈'], ['J', '讥'], ['K', '咔'], ['L', '垃'], ['M', '妈'], ['N', '拿'], ['O', '噢'], ['P', '妑'], ['Q', '七'], ['R', '呥'], ['S', '撒'], ['T', '他'], ['W', '哇'], ['X', '夕'], ['Y', '丫'], ['Z', '帀']];

export class ProjectFileError extends Error {
  constructor(message, status = 400, code = 'PROJECT_FILES_INVALID') { super(message); this.name = 'ProjectFileError'; this.status = status; this.code = code; }
}
const requireValue = (value, message, status = 400, code) => { if (!value) throw new ProjectFileError(message, status, code); };
const conflict = message => new ProjectFileError(message, 409, 'PROJECT_FILES_CONFLICT');
const json = value => JSON.stringify(value, null, 2) + '\n';
const missing = error => error.code === 'ENOENT';
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const managedPath = path => path === RELEASES ||
  /^资源\/(角色|NPC|怪物|地图|故事)\/[A-Z]\/[^/]+\.json$/i.test(path) && !PRIVATE_FILES.has(path) ||
  /^当前\/[^/]+\/当前\.json$/.test(path) ||
  /^战斗\/[^/]+\/[^/]+\/(战斗调用\.json|战斗日志\.txt)$/.test(path) ||
  /^对话\/[^/]+\/(群聊\.json|对话\.md)$/.test(path);

function identifier(value, label = 'ID') {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\x00-\x1f]/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value), `${label}无效`);
  return value;
}

function segment(value, label = '名称') {
  requireValue(typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 100 &&
    !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !/[. ]$/.test(value) && value !== '.' && value !== '..' &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value), `${label}不能用作文件夹名称`);
  return value;
}

export function projectRelativePath(value) {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 1000 && !isAbsolute(value) &&
    !/[\\:\x00-\x1f]/.test(value) && !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..'), '引用必须是项目根目录内的相对路径');
  return value;
}

export function archiveInitial(name, override) {
  if (override !== undefined) { requireValue(/^[A-Z]$/.test(override), '归档首字母须为A～Z'); return { letter: override, method: 'explicit', needsReview: false }; }
  const first = [...String(name).trim()][0] || '';
  if (/^[a-z]$/i.test(first)) return { letter: first.toUpperCase(), method: 'latin', needsReview: false };
  if (/\p{Script=Han}/u.test(first)) {
    let letter = 'A';
    for (const [candidate, boundary] of pinyinBoundaries) { if (collator.compare(first, boundary) >= 0) letter = candidate; else break; }
    return { letter, method: 'pinyin-collator', needsReview: true };
  }
  return { letter: 'Z', method: 'fallback', needsReview: true };
}

export function resourceProjectPath(kind, name, initial) {
  requireValue(RESOURCE_KINDS.includes(kind), '资源类型须为角色、NPC、怪物、地图或故事');
  return `资源/${kind}/${archiveInitial(name, initial).letter}/${segment(name, '资源文件名')}`;
}

function safeData(value, limit = 65536) {
  const inspect = (item, depth = 0) => {
    requireValue(depth <= 24, '数据嵌套过深');
    if (typeof item === 'number') requireValue(Number.isFinite(item), '数据不能含无效数字');
    else if (Array.isArray(item)) { requireValue(item.length <= 2000, '数据数组过长'); item.forEach(next => inspect(next, depth + 1)); }
    else if (plain(item)) for (const [key, next] of Object.entries(item)) { requireValue(!['__proto__', 'prototype', 'constructor'].includes(key), '数据字段无效'); inspect(next, depth + 1); }
    else requireValue(item === null || ['boolean', 'string'].includes(typeof item), '数据须为JSON值');
  };
  inspect(value); requireValue(Buffer.byteLength(json(value)) <= limit, '数据过大'); return structuredClone(value);
}

function validateIndex(value) {
  requireValue(plain(value) && value.formatVersion === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    Array.isArray(value.files) && plain(value.documents), '管理索引格式无效，原件已保留', 409);
  const ids = new Set(), paths = new Set();
  for (const record of value.files) {
    identifier(record.id); projectRelativePath(record.path);
    requireValue(record.path.startsWith('资源/') && typeof record.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(record.fingerprint) &&
      !ids.has(record.id) && !paths.has(record.path), '管理索引存在重复或无效引用，原件已保留', 409);
    ids.add(record.id); paths.add(record.path);
  }
  for (const [path, fingerprint] of Object.entries(value.documents)) { projectRelativePath(path); requireValue(managedPath(path) && /^[a-f0-9]{64}$/.test(fingerprint), '管理索引摘要或写入范围无效，原件已保留', 409); }
  for (const collection of ['moduleFolders', 'groupFolders']) if (value[collection] !== undefined) {
    requireValue(plain(value[collection]), '目录索引无效，原件已保留', 409);
    const folders = new Set();
    for (const [id, folder] of Object.entries(value[collection])) { identifier(id); segment(folder, '目录名称'); requireValue(!folders.has(folder.toLowerCase()), '目录被重复占用，原件已保留', 409); folders.add(folder.toLowerCase()); }
  }
  return value;
}

export async function openProjectFiles({ root } = {}) {
  requireValue(typeof root === 'string' && root.length > 0, '须明确指定项目根目录');
  const directory = resolve(root);
  let queue = Promise.resolve();
  const serial = operation => { const next = queue.then(operation); queue = next.catch(() => {}); return next; };
  let initialized = false;

  async function checked(path, { createParents = false } = {}) {
    projectRelativePath(path);
    let current = directory;
    const rootInfo = await lstat(directory);
    requireValue(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), '项目根目录不能是文件或链接', 409);
    const canonicalRoot = await realpath(directory);
    const parts = path.split('/');
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]);
      let info;
      try { info = await lstat(current); }
      catch (error) {
        if (!missing(error)) throw error;
        if (createParents && index < parts.length - 1) { await mkdir(current); info = await lstat(current); }
        else continue;
      }
      requireValue(!info.isSymbolicLink(), '路径包含符号链接或junction，已拒绝访问', 409);
      requireValue(index === parts.length - 1 || info.isDirectory(), '引用路径中的上级不是文件夹', 409);
      const canonical = await realpath(current);
      const inside = relative(canonicalRoot, canonical);
      requireValue(!isAbsolute(inside) && inside !== '..' && !inside.startsWith('..' + sep), '引用不能越过项目根目录', 409);
      if (info.isFile()) requireValue(info.nlink <= 1, '不读取或覆盖多重硬链接文件', 409);
    }
    return current;
  }

  async function bytes(path, optional = false) {
    const target = await checked(path);
    try {
      const info = await lstat(target); requireValue(info.isFile() && info.size <= MAX_FILE, '文件不是普通文件或超过16MB限制', 413);
      return await readFile(target);
    } catch (error) { if (optional && missing(error)) return null; throw error; }
  }

  async function readJson(path, optional = false) {
    const content = await bytes(path, optional); if (content === null) return null;
    try { return JSON.parse(content.toString('utf8').replace(/^\uFEFF/, '')); }
    catch { throw new ProjectFileError(`${path}不是有效JSON，原件已保留`, 409, 'PROJECT_FILE_DAMAGED'); }
  }

  async function atomic(path, content) {
    const target = await checked(path, { createParents: true });
    const temp = target + '.' + randomUUID() + '.tmp'; let handle;
    try {
      handle = await open(temp, 'wx', 0o600); await handle.writeFile(content); await handle.sync(); await handle.close(); handle = undefined;
      await checked(path); await rename(temp, target);
    } catch (error) { await handle?.close().catch(() => {}); await unlink(temp).catch(() => {}); throw error; }
  }

  async function withLock(operation) {
    const target = await checked(LOCK, { createParents: true }); let handle;
    try { handle = await open(target, 'wx', 0o600); await handle.writeFile(String(process.pid)); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await bytes(LOCK), pid = Number(owner.toString('utf8')); let alive = true;
      if (Number.isInteger(pid) && pid > 0 && pid <= 2147483647) {
        try { process.kill(pid, 0); } catch (failure) { alive = failure.code !== 'ESRCH'; }
      }
      if (alive) throw conflict('文件管理正被另一进程使用或锁归属不明；原锁和原文件已保留');
      requireValue((await bytes(LOCK)).equals(owner), '文件管理锁已变化，请重试', 409);
      await checked(LOCK); await unlink(target); return withLock(operation);
    }
    try { return await operation(); }
    finally { await handle.close(); await unlink(target); }
  }

  async function recover() {
    const pending = await readJson(JOURNAL, true); if (!pending) return;
    requireValue(pending.formatVersion === 1 && Number.isSafeInteger(pending.baseRevision) && Array.isArray(pending.writes) && pending.writes.length <= 2100,
      '待完成事务无效，现场已保留', 409);
    const next = validateIndex(pending.nextIndex);
    requireValue(next.revision === pending.baseRevision + 1, '待完成事务版本无效，现场已保留', 409);
    const index = validateIndex(await readJson(INDEX));
    requireValue([pending.baseRevision, next.revision].includes(index.revision), '待完成事务与当前索引冲突，现场已保留', 409);
    const seen = new Set();
    for (const entry of pending.writes) {
      projectRelativePath(entry.path);
      requireValue(managedPath(entry.path) && !seen.has(entry.path) && typeof entry.after === 'string' &&
        next.documents[entry.path] === sha(entry.after), '待完成事务写入清单无效，现场已保留', 409);
      seen.add(entry.path);
      const current = await bytes(entry.path, true), fingerprint = current === null ? null : sha(current);
      requireValue(fingerprint === entry.before || fingerprint === sha(entry.after), '事务中断后文件被另行修改，现场已保留', 409);
    }
    for (const entry of pending.writes) await atomic(entry.path, entry.after);
    await atomic(INDEX, json(next)); await unlink(await checked(JOURNAL));
  }

  async function initialize() {
    return serial(async () => {
      await mkdir(directory, { recursive: true });
      for (const path of ['模组', '资源', '当前', '战斗', '对话']) {
        const target = await checked(path); await mkdir(target, { recursive: true });
      }
      for (const category of ['单人短团', '多人短团', '长期团']) await mkdir(await checked('模组/' + category), { recursive: true });
      for (const kind of RESOURCE_KINDS) for (const letter of ARCHIVE_LETTERS) {
        const target = await checked(`资源/${kind}/${letter}/.归档占位`, { createParents: true });
        void target;
      }
      await withLock(async () => {
        const existing = await readJson(INDEX, true);
        if (existing) validateIndex(existing);
        else await atomic(INDEX, json({ formatVersion: 1, revision: 0, files: [], documents: {} }));
        await recover();
      });
      initialized = true;
      return { root: directory, revision: (await readJson(INDEX)).revision, kinds: [...RESOURCE_KINDS] };
    });
  }

  async function ensureInitialized() { if (!initialized) await initialize(); }
  async function currentIndex() { await ensureInitialized(); return validateIndex(await readJson(INDEX)); }

  async function commit(index, writes = [], changes = {}) {
    const next = { ...index, ...changes, revision: index.revision + 1, documents: { ...index.documents } };
    const prepared = [];
    for (const entry of writes) {
      projectRelativePath(entry.path); requireValue(managedPath(entry.path), '不能写入管理范围以外的文件');
      const before = await bytes(entry.path, true), fingerprint = before === null ? null : sha(before);
      if (fingerprint !== (index.documents[entry.path] || null)) throw conflict(`${entry.path}已由其他程序修改，原件已保留`);
      requireValue(typeof entry.text === 'string' && Buffer.byteLength(entry.text) <= MAX_FILE, '写入数据过大');
      prepared.push({ path: entry.path, before: fingerprint, after: entry.text }); next.documents[entry.path] = sha(entry.text);
    }
    validateIndex(next);
    const transaction = json({ formatVersion: 1, baseRevision: index.revision, nextIndex: next, writes: prepared });
    requireValue(Buffer.byteLength(transaction) <= MAX_FILE, '事务数据超过16MB，请拆分后保存', 413);
    await atomic(JOURNAL, transaction);
    try {
      for (const entry of prepared) await atomic(entry.path, entry.after);
      await atomic(INDEX, json(next)); await unlink(await checked(JOURNAL));
    } catch (error) { throw new ProjectFileError('文件事务未完成，现场已保留；重开文件管理将检查恢复。' + error.message, 503, 'PROJECT_WRITE_INTERRUPTED'); }
    return next;
  }

  async function mutation(expectedRevision, operation) {
    await ensureInitialized();
    return serial(() => withLock(async () => {
      await recover(); const index = validateIndex(await readJson(INDEX));
      requireValue(Number.isSafeInteger(expectedRevision) && expectedRevision === index.revision, '文件管理版本已变化，请刷新后重试', 409, 'PROJECT_FILES_CONFLICT');
      return operation(index);
    }));
  }

  async function inventory(index) {
    const resources = [], issues = [], foundIds = new Map(), indexedPaths = new Map(index.files.map(entry => [entry.path, entry]));
    const candidates = [];
    async function walk(path, kind) {
      const absolute = await checked(path);
      for (const entry of await readdir(absolute, { withFileTypes: true })) {
        const child = path + '/' + entry.name;
        if (PRIVATE_FILES.has(child) || entry.name.startsWith('.') || entry.name.endsWith('.tmp')) continue;
        if (INTERNAL_RESOURCE_TREES.some(path => child === path || child.startsWith(path + '/'))) continue;
        if (entry.isSymbolicLink()) { issues.push({ path: child, error: '链接资源已拒绝' }); continue; }
        if (entry.isDirectory()) { await walk(child, kind); continue; }
        if (!entry.isFile()) continue;
        try {
          const raw = await bytes(child), fingerprint = sha(raw);
          let value, id;
          if (/\.json$/i.test(entry.name)) {
            try { value = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')); } catch { throw new ProjectFileError('资源JSON损坏，原件已保留'); }
            requireValue(plain(value), '资源JSON须为对象'); id = identifier(value.id, '资源JSON显式id');
          }
          candidates.push({ path: child, kind, name: value?.name && typeof value.name === 'string' ? value.name : entry.name.replace(/\.[^.]+$/, ''), id, fingerprint, bytes: raw.length,
            archive: archiveInitial(value?.name || entry.name, value?.initial) });
        } catch (error) { issues.push({ path: child, error: error.message }); }
      }
    }
    for (const kind of RESOURCE_KINDS) for (const letter of ARCHIVE_LETTERS) await walk(`资源/${kind}/${letter}`, kind);
    const presentPaths = new Set(candidates.map(entry => entry.path));
    const nextFiles = [];
    for (const entry of candidates) {
      if (!entry.id) {
        const samePath = indexedPaths.get(entry.path);
        const relocated = index.files.filter(record => !presentPaths.has(record.path) && record.fingerprint === entry.fingerprint);
        if (!samePath && relocated.length > 1) { issues.push({ path: entry.path, error: '相同内容对应多个历史资源，不能自动认定移动关系' }); continue; }
        entry.id = samePath?.id || relocated[0]?.id || 'file-' + randomUUID();
        nextFiles.push({ id: entry.id, path: entry.path, fingerprint: entry.fingerprint });
      }
      const previous = foundIds.get(entry.id);
      if (previous) { issues.push({ path: entry.path, error: `资源ID重复：${entry.id}`, relatedPath: previous }); continue; }
      foundIds.set(entry.id, entry.path); resources.push(entry);
    }
    const duplicates = new Set(issues.filter(entry => entry.error.startsWith('资源ID重复')).map(entry => candidates.find(candidate => candidate.path === entry.path)?.id));
    return { resources: resources.filter(entry => !duplicates.has(entry.id)), issues, files: nextFiles };
  }

  async function scanResources({ expectedRevision } = {}) {
    return mutation(expectedRevision, async index => {
      const result = await inventory(index);
      if (result.issues.length) { const error = new ProjectFileError('资源扫描发现损坏、重复ID或链接；原文件未修改', 409, 'RESOURCE_SCAN_ISSUES'); error.issues = result.issues; throw error; }
      const ids = new Set(result.files.map(entry => entry.id)), paths = new Set(result.files.map(entry => entry.path));
      const retained = index.files.filter(entry => !ids.has(entry.id) && !paths.has(entry.path));
      const next = await commit(index, [], { files: [...result.files, ...retained] });
      return { revision: next.revision, resources: result.resources, issues: [] };
    });
  }

  async function releases() {
    const value = await readJson(RELEASES, true);
    if (!value) return { formatVersion: 1, releases: [] };
    requireValue(value.formatVersion === 1 && Array.isArray(value.releases), '发放记录格式无效，原件已保留', 409);
    for (const entry of value.releases) { identifier(entry.playerId, '玩家ID'); identifier(entry.resourceId, '资源ID'); projectRelativePath(entry.path); }
    return value;
  }

  async function listResources({ playerId } = {}) {
    const index = await currentIndex(), result = await inventory(index);
    const indexed = new Map(index.files.map(entry => [entry.path, entry.id]));
    let resources = result.resources.filter(entry => /\.json$/i.test(entry.path) || indexed.get(entry.path) === entry.id);
    if (playerId !== undefined) {
      identifier(playerId, '玩家ID'); const grants = (await releases()).releases;
      resources = resources.filter(entry => grants.some(grant => grant.playerId === playerId && grant.resourceId === entry.id));
    }
    return { revision: index.revision, resources, issues: playerId === undefined ? result.issues : [] };
  }

  async function resourceById(index, id) {
    identifier(id, '资源ID'); const result = await inventory(index);
    requireValue(!result.issues.length, '资源目录有错误，请先修复扫描问题', 409);
    const resource = result.resources.find(entry => entry.id === id);
    requireValue(resource && (/\.json$/i.test(resource.path) || index.files.some(entry => entry.id === id && entry.path === resource.path)), '找不到资源，请先刷新归档索引', 404);
    return resource;
  }

  async function readResource(resourceId, { playerId } = {}) {
    const index = await currentIndex();
    if (playerId !== undefined) {
      identifier(playerId, '玩家ID');
      requireValue((await releases()).releases.some(entry => entry.playerId === playerId && entry.resourceId === resourceId), '此资源尚未发放给该玩家', 403);
    }
    const resource = await resourceById(index, resourceId);
    return { resource, bytes: await bytes(resource.path) };
  }

  async function revealTarget(resourceId) { const index = await currentIndex(), resource = await resourceById(index, resourceId); return { path: await checked(resource.path), directory: dirname(await checked(resource.path)), projectPath: resource.path }; }
  async function contextFolder(index, { collection, id, name, area, metadataFile, idField }) {
    identifier(id); requireValue(typeof name === 'string' && name.trim().length > 0 && name.length <= 200, '名称无效');
    const folders = { ...index[collection] };
    let folder = folders[id], existing;
    if (!folder) {
      let candidate = name.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 70) || '未命名';
      if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(candidate)) candidate = '_' + candidate;
      const suffix = '--' + sha(id).slice(0, 12);
      if (candidate !== name) candidate += suffix;
      const occupied = Object.values(folders).some(value => value.toLowerCase() === candidate.toLowerCase());
      existing = await readJson(`${area}/${candidate}/${metadataFile}`, true);
      folder = occupied || existing && existing[idField] !== id ? candidate.slice(0, 70) + suffix : candidate;
      folders[id] = folder;
    }
    return { folder: segment(folder, '目录名称'), folders };
  }
  async function currentDocument(index, moduleId, moduleName) {
    const { folder, folders: moduleFolders } = await contextFolder(index, { collection: 'moduleFolders', id: moduleId, name: moduleName, area: '当前', metadataFile: '当前.json', idField: 'moduleId' });
    const path = `当前/${segment(folder, '模组目录')}/当前.json`;
    const existing = await readJson(path, true);
    if (!existing) return { path, folder, moduleFolders, value: { formatVersion: 1, moduleId, moduleName, instances: [] } };
    requireValue(existing.formatVersion === 1 && existing.moduleId === moduleId && Array.isArray(existing.instances), '当前文件属于另一模组或格式无效，原件已保留', 409);
    existing.moduleName = moduleName;
    return { path, folder, moduleFolders, value: existing };
  }

  async function referenceInternal(index, { resourceId, moduleId, moduleName, playerId, delta, instanceId }) {
    const resource = await resourceById(index, resourceId), current = await currentDocument(index, moduleId, moduleName);
    let instance = instanceId ? current.value.instances.find(entry => entry.id === instanceId) : current.value.instances.find(entry => entry.resourceId === resourceId);
    if (instanceId) identifier(instanceId, '实例ID');
    if (instance) requireValue(instance.resourceId === resourceId, '实例已引用另一资源', 409);
    else { instance = { id: instanceId || randomUUID(), resourceId, base: resource.path, delta: {} }; current.value.instances.push(instance); }
    instance.base = resource.path;
    if (delta !== undefined) { requireValue(plain(delta), '当前变化量须为JSON对象'); instance.delta = safeData(delta); }
    const writes = [{ path: current.path, text: json(current.value) }];
    if (playerId !== undefined) {
      identifier(playerId, '玩家ID'); const granted = await releases();
      const existing = granted.releases.find(entry => entry.playerId === playerId && entry.resourceId === resourceId);
      if (existing) existing.path = resource.path;
      else granted.releases.push({ playerId, resourceId, path: resource.path, releasedAt: new Date().toISOString() });
      writes.push({ path: RELEASES, text: json(granted) });
    }
    const next = await commit(index, writes, { moduleFolders: current.moduleFolders });
    return { revision: next.revision, reference: { resourceId, path: resource.path, current: current.path, instanceId: instance.id }, instance: structuredClone(instance) };
  }

  async function reference(payload) { return mutation(payload?.expectedRevision, index => referenceInternal(index, payload)); }
  async function releaseAndReference(payload) { identifier(payload?.playerId, '玩家ID'); return reference(payload); }
  async function saveCurrent(payload) { requireValue(payload?.delta !== undefined, '须给出变化量'); return reference(payload); }

  async function writeResource({ kind, name, resource, initial, expectedRevision } = {}) {
    identifier(resource?.id, '资源JSON显式id'); requireValue(plain(resource) && /\.json$/i.test(name), '本接口仅保存带显式id的JSON资源');
    const path = resourceProjectPath(kind, name, initial);
    return mutation(expectedRevision, async index => {
      const found = await inventory(index);
      requireValue(!found.resources.some(entry => entry.id === resource.id && entry.path !== path), '已有另一资源使用同一ID', 409);
      const next = await commit(index, [{ path, text: json(safeData(resource, MAX_FILE)) }]);
      return { revision: next.revision, resourceId: resource.id, path };
    });
  }

  async function saveBattle({ expectedRevision, battleId, moduleId, moduleName, name, resourceIds = [], currentIds = [], payload = {}, logText = '' } = {}) {
    identifier(battleId, '战斗ID'); segment(battleId, '战斗ID'); segment(name || battleId, '战斗名称');
    requireValue(Array.isArray(resourceIds) && resourceIds.length <= 200 && Array.isArray(currentIds) && currentIds.length <= 200 && typeof logText === 'string' && logText.length <= 1000000, '战斗调用参数无效');
    return mutation(expectedRevision, async index => {
      const current = await currentDocument(index, moduleId, moduleName);
      const resources = await Promise.all(resourceIds.map(async id => { const entry = await resourceById(index, id); return { resourceId: id, path: entry.path }; }));
      for (const id of currentIds) requireValue(current.value.instances.some(entry => entry.id === id), '战斗引用了不存在的当前实例');
      const folder = `战斗/${current.folder}/${battleId}`, callPath = folder + '/战斗调用.json', logPath = folder + '/战斗日志.txt';
      const value = { formatVersion: 1, id: battleId, moduleId, name: name || battleId, resources, current: { path: current.path, instanceIds: [...currentIds] }, payload: safeData(payload) };
      const next = await commit(index, [{ path: current.path, text: json(current.value) }, { path: callPath, text: json(value) }, { path: logPath, text: logText }], { moduleFolders: current.moduleFolders });
      return { revision: next.revision, callPath, logPath };
    });
  }

  async function appendDialogue({ expectedRevision, groupId, groupName, content, resourceIds = [], timestamp = new Date().toISOString() } = {}) {
    identifier(groupId, '群聊ID');
    requireValue(typeof content === 'string' && content.trim().length > 0 && content.length <= 64000 && Array.isArray(resourceIds) && resourceIds.length <= 32 &&
      typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(timestamp) && Number.isFinite(Date.parse(timestamp)), '聊天消息、时间戳或引用无效');
    return mutation(expectedRevision, async index => {
      const resolved = await contextFolder(index, { collection: 'groupFolders', id: groupId, name: groupName, area: '对话', metadataFile: '群聊.json', idField: 'id' });
      const folder = `对话/${resolved.folder}`, path = folder + '/对话.md', callPath = folder + '/群聊.json';
      const metadata = await readJson(callPath, true) || { formatVersion: 1, id: groupId, name: groupName, referenceBase: 'project', references: [], messages: 0 };
      requireValue(metadata.formatVersion === 1 && metadata.id === groupId && (!metadata.referenceBase || metadata.referenceBase === 'project') && Array.isArray(metadata.references) && Number.isSafeInteger(metadata.messages), '群聊已存在且归属不同或格式无效，原件已保留', 409);
      metadata.referenceBase = 'project'; metadata.name = groupName;
      const references = await Promise.all(resourceIds.map(async id => { const resource = await resourceById(index, id); return { resourceId: id, path: resource.path, name: resource.name }; }));
      for (const entry of references) if (!metadata.references.some(old => old.resourceId === entry.resourceId)) metadata.references.push({ resourceId: entry.resourceId, path: entry.path });
      metadata.messages++;
      const previous = await bytes(path, true), text = (previous?.toString('utf8') || `# 群聊：${groupName}\n\n引用路径相对于项目根目录。\n\n`) +
        `## ${new Date(timestamp).toISOString()}\n\n${content}\n\n` + references.map(entry => `- [${entry.name.replace(/[\[\]\r\n]/g, '')}](<${entry.path}>)\n`).join('') + '\n';
      const next = await commit(index, [{ path, text }, { path: callPath, text: json(metadata) }], { groupFolders: resolved.folders });
      return { revision: next.revision, path, callPath, references: references.map(({ resourceId, path }) => ({ resourceId, path })) };
    });
  }

  async function readDialogue({ groupId, groupName } = {}) {
    const index = await currentIndex();
    const resolved = await contextFolder(index, { collection: 'groupFolders', id: groupId, name: groupName, area: '对话', metadataFile: '群聊.json', idField: 'id' });
    const path = `对话/${resolved.folder}/对话.md`, callPath = `对话/${resolved.folder}/群聊.json`;
    const metadata = await readJson(callPath, true);
    requireValue(!metadata || metadata.formatVersion === 1 && metadata.id === groupId && Array.isArray(metadata.references), '群聊归属或格式无效，原件已保留', 409);
    return { path, content: (await bytes(path, true))?.toString('utf8') || '', metadata };
  }

  async function readManagedFile(path) {
    projectRelativePath(path); requireValue(managedPath(path), '文件不属于管理范围');
    const index = await currentIndex(), content = await bytes(path, true);
    requireValue((content === null ? null : sha(content)) === (index.documents[path] || null), '管理文件已由其他程序修改，原件已保留', 409, 'PROJECT_FILES_CONFLICT');
    return content;
  }

  async function resourceDefinitions(ids) {
    requireValue(Array.isArray(ids) && ids.length <= 2001 && new Set(ids).size === ids.length, '资源基准ID清单无效'); ids.forEach(id => identifier(id));
    const index = await currentIndex(), result = await inventory(index);
    requireValue(!result.issues.length, '资源目录有错误，请先修复扫描问题', 409);
    const found = [], missing = [];
    for (const id of ids) {
      const resource = result.resources.find(entry => entry.id === id);
      if (resource) found.push({ resource, bytes: await bytes(resource.path) }); else missing.push(id);
    }
    return { revision: index.revision, found, missing };
  }

  async function saveProjection({ expectedRevision, moduleId, moduleName, battleId, name, definitions = [], instances = [], expectedResources = [], payload = {}, logText = '' } = {}) {
    identifier(battleId, '战斗ID'); segment(battleId, '战斗ID');
    requireValue(Array.isArray(definitions) && definitions.length <= 2001 && Array.isArray(instances) && instances.length <= 2001 &&
      Array.isArray(expectedResources) && expectedResources.length <= 2001 && typeof logText === 'string' && logText.length <= 1000000, '批量投影超过数量或日志限制', 413);
    return mutation(expectedRevision, async index => {
      const listing = await inventory(index); requireValue(!listing.issues.length, '资源目录有错误，投影未写入', 409);
      const resources = new Map(listing.resources.map(entry => [entry.id, entry]));
      for (const expected of expectedResources) requireValue(resources.get(expected.id)?.fingerprint === expected.fingerprint, '资源基准在投影准备后发生变化，请重试；原件已保留', 409);
      const current = await currentDocument(index, moduleId, moduleName), writes = [], newPaths = new Set();
      for (const definition of definitions) {
        identifier(definition.resource?.id, '资源JSON显式id');
        requireValue(!resources.has(definition.resource.id), '资源基准ID已被占用，未覆盖', 409);
        const path = resourceProjectPath(definition.kind, definition.name, definition.initial);
        requireValue(!newPaths.has(path), '投影中的基准文件名重复', 409); newPaths.add(path);
        writes.push({ path, text: json(safeData(definition.resource, MAX_FILE)) });
        resources.set(definition.resource.id, { id: definition.resource.id, path });
      }
      const instanceIds = [], resourceIds = [], references = [];
      for (const item of instances) {
        identifier(item.id, '当前实例ID'); identifier(item.resourceId, '资源ID'); requireValue(plain(item.delta), '变化量须为JSON对象');
        requireValue(!instanceIds.includes(item.id), '同次投影存在重复实例ID');
        const resource = resources.get(item.resourceId); requireValue(resource, '投影找不到资源基准', 404);
        let instance = current.value.instances.find(entry => entry.id === item.id);
        if (instance) requireValue(instance.resourceId === item.resourceId, '当前实例所属资源发生冲突，原件已保留', 409);
        else { instance = { id: item.id, resourceId: item.resourceId }; current.value.instances.push(instance); }
        instance.base = resource.path; instance.delta = safeData(item.delta); instanceIds.push(item.id);
        if (!resourceIds.includes(item.resourceId)) { resourceIds.push(item.resourceId); references.push({ resourceId: item.resourceId, path: resource.path }); }
      }
      const folder = `战斗/${current.folder}/${battleId}`, callPath = folder + '/战斗调用.json', logPath = folder + '/战斗日志.txt';
      const call = { formatVersion: 1, id: battleId, moduleId, name: name || battleId, resources: references,
        current: { path: current.path, instanceIds }, payload: safeData(payload) };
      writes.push({ path: current.path, text: json(current.value) }, { path: callPath, text: json(call) }, { path: logPath, text: logText });
      const next = await commit(index, writes, { moduleFolders: current.moduleFolders });
      return { revision: next.revision, currentPath: current.path, callPath, logPath, resourceIds, instanceIds };
    });
  }

  return { initialize, scanResources, listResources, readResource, revealTarget, reference, releaseAndReference, saveCurrent, writeResource, saveBattle, appendDialogue, readDialogue, readManagedFile, resourceDefinitions, saveProjection,
    async moduleLocation({ moduleId, moduleName }) { const index = await currentIndex(), current = await currentDocument(index, moduleId, moduleName); return { folder: current.folder, currentPath: current.path }; },
    async manifest() { const index = await currentIndex(); return { formatVersion: 1, revision: index.revision }; },
    async settled() { await queue; } };
}

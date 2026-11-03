import { createPlayerStore } from './player-store.mjs';
import { archiveInitial } from './project-files.mjs';
import { moduleImageIndex } from './module-image-index.mjs';
import { discoverModules } from './module-discovery.mjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const excluded = new Set(['Code', '程序', '资料', '.runtime', '游玩团', '预处理']);
const statePath = '模组/资料库工作区.json';
const imageTypes = new Map([['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp'], ['gif', 'image/gif'], ['avif', 'image/avif']]);
const sha = value => createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\\/\x00-\x1f]/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const label = (value, fallback = '') => typeof value === 'string' ? value.trim().slice(0, 200) : fallback;
const fail = (message, status = 400, code = 'invalid_request') => { throw Object.assign(new Error(message), { status, code }); };
const list = value => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []).filter(item => typeof item === 'string' && item.length);
const freshState = () => ({ schemaVersion: 1, revision: 0, selected: null, shares: {}, notifications: [], invites: {} });
const runKey = ({ moduleId, runId }) => JSON.stringify([moduleId, runId]);
const normalize = path => path.split(sep).join('/');
const imageMarkdown = text => [...text.matchAll(/!\[[^\]]*\]\(\s*(?:<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g)].map(match => match[0]).join('\n\n');
const pictureKinds = new Set(['地图', '地图图片', '人物', '角色', '预设角色', 'NPC', '怪物', '人物图片', '怪物图片']);

export function parseLibraryMarkdown(text) {
  const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) fail('Markdown缺少JSON前置信息。');
  let meta;
  try { meta = JSON.parse(match[1]); } catch { fail('Markdown前置信息不是有效JSON。'); }
  if (!meta || Array.isArray(meta) || !validId(meta.id) || !label(meta.name) || !label(meta.kind)) fail('Markdown需要有效id、name和kind。');
  return { meta, text: match[2] };
}

export function createLibraryStore({ root }) {
  root = resolve(root);
  const players = createPlayerStore({ root });
  let queue = Promise.resolve();
  const markdownCache = new Map();

  async function safe(path, missing = false) {
    if (typeof path !== 'string' || isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.includes('\0')) fail('文件路径无效。');
    const target = resolve(root, path), inside = relative(root, target);
    if (inside.startsWith('..' + sep) || inside === '..' || isAbsolute(inside)) fail('文件路径越界。', 403);
    const rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail('资料根必须是普通目录。', 403);
    let cursor = root;
    for (const part of inside.split(sep).filter(Boolean)) {
      cursor = join(cursor, part);
      const info = await lstat(cursor).catch(error => error.code === 'ENOENT' && missing ? null : Promise.reject(error));
      if (!info) break;
      if (info.isSymbolicLink()) fail('资料路径不能经过符号链接或目录联接。', 403);
    }
    return target;
  }
  async function read(path, limit = 8 * 1024 * 1024) {
    const target = await safe(path), info = await lstat(target);
    if (!info.isFile() || info.size > limit || info.nlink > 1) fail('资料必须是大小合理的独立文件。');
    return readFile(target);
  }
  async function markdown(path) {
    const target = await safe(path), info = await lstat(target);
    if (!info.isFile() || info.size > 8 * 1024 * 1024 || info.nlink > 1) fail('资料必须是大小合理的独立文件。');
    const version = [info.mtimeMs, info.ctimeMs, info.size, info.ino].join(':');
    if (markdownCache.get(path)?.version === version) return markdownCache.get(path).value;
    const value = parseLibraryMarkdown((await readFile(target)).toString('utf8'));
    markdownCache.set(path, { version, value }); return value;
  }
  async function json(path) { try { return JSON.parse((await read(path)).toString('utf8').replace(/^\uFEFF/, '')); } catch (error) { if (error.code === 'ENOENT') throw error; fail('JSON文件无效：' + path); } }
  async function dirs(path) {
    try {
      const target = await safe(path);
      return (await readdir(target, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !excluded.has(entry.name) && !entry.name.startsWith('.')).map(entry => entry.name).sort();
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function loadState() {
    let value;
    try { value = await json(statePath); } catch (error) { if (error.code === 'ENOENT') return freshState(); throw error; }
    if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.shares || !value.invites || !Array.isArray(value.notifications)) fail('资料库状态格式无效，已保留原文件。', 409);
    return value;
  }
  async function atomic(path, value) {
    const target = await safe(path, true);
    await mkdir(dirname(target), { recursive: true }); await safe(path, true);
    const temporary = target + '.' + randomUUID() + '.tmp';
    let handle;
    try {
      handle = await open(temporary, 'wx'); await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); await handle.close(); handle = null;
      await safe(path, true); await rename(temporary, target);
    } finally { await handle?.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async function transaction(operation) {
    const next = queue.catch(() => {}).then(async () => {
      const lockPath = statePath + '.lock', target = await safe(lockPath, true);
      await mkdir(dirname(target), { recursive: true }); await safe(lockPath, true);
      let lock;
      try { lock = await open(target, 'wx'); } catch (error) { if (error.code === 'EEXIST') fail('资料库正在由另一进程保存，请稍后重试。', 409, 'save_conflict'); throw error; }
      try {
        const state = await loadState(), result = await operation(state);
        state.revision++; await atomic(statePath, state);
        return { ...result, revision: state.revision };
      } finally { await lock.close(); await unlink(target); }
    });
    queue = next; return next;
  }
  function expected(state, revision) {
    if (!Number.isSafeInteger(revision) || revision !== state.revision) fail('资料库已变化，请重新核对当前团与开放对象。', 409, 'revision_conflict');
  }
  async function inventory(includeResources = true) {
    const discovery = await discoverModules({ directories: dirs, readManifest: json });
    const modules = [], issues = [...discovery.issues], resources = [], kinds = new Set();
    const categories = discovery.categories;
    for (const { path, category, meta } of discovery.modules) {
      try {
        if (!validId(meta.id) || !label(meta.name)) fail('模组需要有效id和name。');
        const runs = [];
        const runRoot = path + '/游玩团';
        let runDirs = [];
        try { runDirs = (await readdir(await safe(runRoot), { withFileTypes: true })).filter(item => item.isDirectory() && !item.isSymbolicLink() && !item.name.startsWith('.')).map(item => item.name); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        for (const runFolder of runDirs) {
          try {
            const run = await json(runRoot + '/' + runFolder + '/团.json');
            if (!validId(run.id) || run.id !== runFolder || run.moduleId !== meta.id || !label(run.name) || !Array.isArray(run.characters)) fail('游玩团身份或角色列表无效。');
            const seen = new Set();
            for (const character of run.characters) {
              if (!validId(character.id) || !validId(character.playerId) || !label(character.name) || seen.has(character.id)) fail('游玩团有无效或重复角色。');
              seen.add(character.id);
            }
            runs.push({ ...run, path: runRoot + '/' + runFolder });
          } catch (error) { issues.push({ path: runRoot + '/' + runFolder, reason: error.message }); }
        }
        modules.push({ id: meta.id, name: meta.name, category, path, runs });
      } catch (error) { if (error.code !== 'ENOENT') issues.push({ path, reason: error.message }); }
    }
    const duplicateModules = new Set(modules.filter((item, index) => modules.findIndex(other => other.id === item.id) !== index).map(item => item.id));
    for (const id of duplicateModules) issues.push({ id, reason: '模组ID重复，相关模组与资源不可引用。' });
    const usableModules = modules.filter(module => !duplicateModules.has(module.id));
    if (!includeResources) return { categories, modules: usableModules, resources: [], issues, kinds: [] };
    const jobs = [], livePaths = new Set();
    async function scan(path, scope, module) {
      let entries;
      try { entries = await readdir(await safe(path), { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; issues.push({ path, reason: error.message }); return; }
      for (const entry of entries) {
        const child = path + '/' + entry.name;
        if (child === '资源/玩家' || entry.isSymbolicLink() || excluded.has(entry.name) || entry.isDirectory() && entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) { await scan(child, scope, module); continue; }
        if (!entry.isFile() || !/\.md$/i.test(entry.name) || entry.name === '示例模版.md' || entry.name === '示例模板.md' || entry.name.toLowerCase() === 'readme.md') continue;
        livePaths.add(child); jobs.push(async () => { try {
          const { meta, text } = await markdown(child);
          const scopeRoot = module ? module.path + '/资源' : '资源';
          const category = child.slice(scopeRoot.length + 1).split('/')[0];
          if (meta.kind !== category) fail('前置信息kind与实际分类目录不符。');
          if (module && meta.moduleId && meta.moduleId !== module.id) fail('资源moduleId与所属模组不符。');
          const item = { ...meta, name: label(meta.name), kind: category, initial: /^[A-Z]$/.test(meta.initial || '') ? meta.initial : null, scope, ...(module ? { moduleId: module.id, moduleName: module.name } : {}), path: child, scopeRoot };
          item.shareable = scope === 'module' && pictureKinds.has(category) && !!imageMarkdown(text); resources.push({ resource: item, text }); kinds.add(category);
        } catch (error) { issues.push({ path: child, reason: error.message }); } });
      }
    }
    await scan('资源', 'world');
    for (const module of usableModules) await scan(module.path + '/资源', 'module', module);
    for (const module of usableModules) {
      for (const picture of moduleImageIndex[module.id] || []) {
        const path = module.path + '/资源/' + picture.path;
        try { await safe(path); } catch (error) { issues.push({ path, reason: '配图文件缺失，已跳过。' }); continue; }
        resources.push({ resource: { id: module.id + ':' + picture.id, name: picture.name, kind: picture.type, initial: picture.initial, scope: 'module', moduleId: module.id, moduleName: module.name, shareable: true, path: module.path + '/资源/图片索引.md', scopeRoot: module.path + '/资源' }, text: '![' + picture.name + '](<' + picture.path + '>)' }); kinds.add(picture.type);
      }
      try {
        const pack = await json(module.path + '/地图/地图包.json');
        if (pack.schemaVersion !== 1 || pack.moduleData?.id !== module.id) continue;
        const assets = pack.assets || pack.assetFiles || pack.assetsMap || {};
        for (const node of pack.moduleData.nodes || []) for (const variant of node.variants || []) {
          const asset = assets[variant.url], path = typeof asset === 'string' ? asset : asset?.path;
          if (typeof path !== 'string' || !validId(node.id) || !validId(variant.id) || /[<>\r\n]/.test(path)) continue;
          const name = node.name + ' · ' + variant.label;
          resources.push({ resource: { id: module.id + ':map:' + node.id + ':' + variant.id, name, kind: '地图', initial: /^[A-Z]$/.test(node.initial || '') ? node.initial : archiveInitial(node.name).letter, scope: 'module', moduleId: module.id, moduleName: module.name, shareable: true, path: module.path + '/地图/图片索引.md', scopeRoot: module.path + '/地图' }, text: '![' + name.replace(/[\[\]]/g, '') + '](<' + path + '>)' }); kinds.add('地图');
        }
      } catch (error) { if (error.code !== 'ENOENT') issues.push({ path: module.path + '/地图/地图包.json', reason: error.message }); }
    }
    let nextJob = 0;
    await Promise.all(Array.from({ length: Math.min(12, jobs.length) }, async () => { while (nextJob < jobs.length) await jobs[nextJob++](); }));
    for (const path of markdownCache.keys()) if (!livePaths.has(path)) markdownCache.delete(path);
    const playerData = await players.records(); resources.push(...playerData.resources); issues.push(...playerData.issues); if (playerData.resources.length) kinds.add('角色');
    const counts = new Map(); for (const item of resources) counts.set(item.resource.id, (counts.get(item.resource.id) || 0) + 1);
    const duplicateIds = new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
    for (const id of duplicateIds) issues.push({ id, reason: '资源ID重复，禁止读取或分享。' });
    return { categories, modules: usableModules, resources: resources.filter(item => !duplicateIds.has(item.resource.id)), issues, kinds: [...kinds].sort() };
  }
  function selectedRun(data, selected) {
    const module = data.modules.find(item => item.id === selected?.moduleId), run = module?.runs.find(item => item.id === selected?.runId);
    return run ? { module, run, selection: { moduleId: module.id, runId: run.id, moduleName: module.name, runName: run.name } } : null;
  }
  async function actorSession(actor, state, data) {
    if (actor?.role === 'dm') return { role: 'dm', current: selectedRun(data, state.selected) };
    if (!actor?.token || typeof actor.token !== 'string' || actor.token.length > 300) fail('需要有效身份。', 401, 'session_invalid');
    const invite = state.invites[sha(actor.token)];
    const current = selectedRun(data, invite);
    if (!invite || invite.revoked || !current || !current.run.characters.some(character => character.playerId === invite.playerId)) fail('邀请或玩家会话已失效。', 401, 'session_invalid');
    return { role: 'player', current, playerId: invite.playerId, inviteId: invite.id };
  }
  function permitted(item, session, state) {
    if (session.role === 'dm') return true;
    if (item.scope === 'player') return item.ownerPlayerIds?.includes(session.playerId) || false;
    if (item.scope === 'world') return true;
    if (!item.shareable) return false;
    const current = session.current;
    if (item.scope === 'module' && item.moduleId !== current.module.id) return false;
    const granted = state.shares[runKey(current.selection)]?.[item.id] || [];
    return current.run.characters.some(character => character.playerId === session.playerId && granted.includes(character.id));
  }
  const publicResource = (resource, full = false) => {
    const { scopeRoot, ownerPlayerIds, ownerId, ...value } = resource; if (full) return value;
    const source = resource.source || {}, edition = resource.edition || {};
    return { id: resource.id, name: resource.name, kind: resource.kind, initial: resource.initial, scope: resource.scope, ownerName: resource.ownerName, path: resource.path, shareable: !!resource.shareable,
      ...(resource.moduleId ? { moduleId: resource.moduleId, moduleName: resource.moduleName } : {}),
      aliases: Array.isArray(resource.aliases) ? resource.aliases.slice(0, 30).map(item => label(item)) : [], tags: Array.isArray(resource.tags) ? resource.tags.slice(0, 30).map(item => label(item)) : [],
      sourceBook: label(resource.sourceBook || source.book || source.title || source.name), sourceLabel: label(resource.sourceLabel || source.label || source.book || source.title),
      edition: typeof edition === 'object' ? { rulesFamily: edition.rulesFamily, publicationYear: edition.publicationYear, year: edition.year } : label(edition) };
  };
  const publicModules = data => data.modules.map(({ id, name, category, runs }) => ({ id, name, category, runs: runs.map(({ path, ...run }) => run) }));
  async function snapshot(actor, includeResources = true) { const [state, data] = await Promise.all([loadState(), inventory(includeResources)]); return { state, data, session: await actorSession(actor, state, data) }; }
  function requireDm(session) { if (session.role !== 'dm') fail('只有DM可以操作。', 403); }
  function requireCurrent(session) { if (!session.current) fail('请先选择当前模组与游玩团。', 409, 'run_required'); return session.current; }
  function findResource(data, id) { const found = data.resources.find(item => item.resource.id === id); if (!found) fail('资源不存在、无效或身份重复。', 404, 'resource_missing'); return found; }

  return {
    async playerTree(actor) { const {session}=await snapshot(actor,false); requireDm(session); return players.tree(); },
    async playerRead(actor,path) { const {session}=await snapshot(actor,false); requireDm(session); return players.read(path); },
    async playerOperation(actor,body) { const {session}=await snapshot(actor,false); requireDm(session); return players.operation({...body,allowedPlayerIds:(session.current?.run.characters||[]).map(item=>item.playerId)}); },
    async revealTarget(actor, id) {
      const { data, session } = await snapshot(actor); requireDm(session);
      const found = findResource(data, id);
      return { directory: dirname(await safe(found.resource.path)), projectPath: found.resource.path };
    },
    async moduleCover(actor, moduleId) {
      const { data, session } = await snapshot(actor, false); requireDm(session);
      const module = data.modules.find(item => item.id === moduleId); if (!module) fail('模组不存在。',404);
      const raw = await read(module.path + '/封面.jpg');
      return { mime:'image/jpeg', base64:raw.toString('base64') };
    },
    async context(actor) {
      const { state, data, session } = await snapshot(actor, false), current = session.current;
      return { role: session.role, playerId: session.playerId, selected: current?.selection || null, characters: (current?.run.characters || []).filter(character => session.role === 'dm' || character.playerId === session.playerId),
        modules: session.role === 'dm' ? publicModules(data) : [{ id: current.module.id, name: current.module.name, runs: [{ id: current.run.id, name: current.run.name }] }], revision: state.revision, ...(session.role === 'dm' ? { issues: data.issues, categories: data.categories } : {}) };
    },
    async catalog(actor, query = {}) {
      const { state, data, session } = await snapshot(actor), initials = list(query.initials || query.initial).map(value => value.toUpperCase()), moduleIds = list(query.modules), q = String(query.q || '').trim().toLocaleLowerCase();
      const visible = data.resources.filter(item => permitted(item.resource, session, state) && (query.media !== 'maps' || ['地图', '地图图片', '世界地图'].includes(item.resource.kind)));
      const filtered = visible.filter(({ resource, text }) => (!query.kind || (query.kind === '模组' ? resource.scope === 'module' : resource.scope !== 'module' && resource.kind === query.kind))
        && (!initials.length || initials.includes(resource.initial)) && (!moduleIds.length || resource.scope !== 'module' || moduleIds.includes(resource.moduleId))
        && (!q || JSON.stringify(session.role === 'player' && resource.scope === 'module' ? [resource.name, imageMarkdown(text)] : [resource.name, resource.aliases, resource.tags, resource.source, text]).toLocaleLowerCase().includes(q)));
      return { resources: filtered.map(({ resource }) => publicResource(resource)), cardKinds: [...new Set(visible.filter(item => item.resource.scope !== 'module').map(item => item.resource.kind)), ...(data.modules.length ? ['模组'] : [])].sort(), total: filtered.length, kinds: [...new Set(visible.map(item => item.resource.kind))].sort(),
        modules: session.role === 'dm' ? publicModules(data) : [{ id: session.current.module.id, name: session.current.module.name }], revision: state.revision, ...(session.role === 'dm' ? { issues: data.issues, categories: data.categories } : {}) };
    },
    async read(actor, id) {
      const { state, data, session } = await snapshot(actor), found = findResource(data, id);
      if (!permitted(found.resource, session, state)) fail('此资源尚未向你的受控角色开放，或分享已撤回。', 403, 'resource_forbidden');
      const images = [], imageIssues = [];
      for (const match of found.text.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g)) {
        const source = match[1] || match[2];
        if (images.some(item => item.source === source)) continue;
        try {
          let imagePath;
          try { imagePath = decodeURIComponent(source); } catch { fail('图片路径编码无效。'); }
          if (/^[a-z]+:|^[/\\]/i.test(imagePath) || imagePath.includes('?') || imagePath.includes('#')) fail('只读取同资料目录内的本地图片。');
          const path = normalize(relative(root, resolve(root, dirname(found.resource.path), imagePath.replace(/\\/g, '/'))));
          if (!path.startsWith(found.resource.scopeRoot + '/')) fail('图片路径越出所属资料范围。', 403);
          const mime = imageTypes.get(path.split('.').pop().toLowerCase()); if (!mime) fail('图片格式不受支持。');
          const bytes = await read(path, 12 * 1024 * 1024);
          if (images.reduce((total, item) => total + item.base64.length, 0) + bytes.length * 1.34 > 32 * 1024 * 1024) fail('单条资料图片总量过大。');
          images.push({ source, path, mime, base64: bytes.toString('base64') });
        } catch (error) { imageIssues.push({ source, reason: error.code === 'ENOENT' ? '图片文件缺失。' : error.message }); }
      }
      const projected = session.role === 'player' && found.resource.scope === 'module';
      return { resource: publicResource(found.resource, !projected), text: projected ? imageMarkdown(found.text) : found.text, images, issues: imageIssues, imageIssues };
    },
    async select(actor, { moduleId, runId, expectedRevision }) {
      return transaction(async state => {
        const data = await inventory(false), session = await actorSession(actor, state, data); requireDm(session);
        if (expectedRevision !== undefined) expected(state, expectedRevision);
        const current = selectedRun(data, { moduleId, runId }); if (!current) fail('所选模组或游玩团不存在。', 404);
        const { path, ...record } = current.run; await atomic(path + '/团.json', { ...record, lastPlayedAt: new Date().toISOString() });
        state.selected = { moduleId, runId }; return { selected: current.selection, characters: current.run.characters };
      });
    },
    async createRun(actor, { moduleId, name, characters = [], expectedRevision }) {
      return transaction(async state => {
        const data = await inventory(false), session = await actorSession(actor, state, data); requireDm(session);
        if (expectedRevision !== undefined) expected(state, expectedRevision);
        const module = data.modules.find(item => item.id === moduleId); if (!module) fail('模组不存在。', 404);
        if (!label(name) || !Array.isArray(characters) || characters.length > 100) fail('需要团名和有效角色列表。');
        const id = 'run-' + randomUUID(), run = { id, name: label(name), moduleId, createdAt: new Date().toISOString(), status: 'preparing', characters: characters.map(character => {
          if (!label(character.name)) fail('角色需要名称。');
          return { id: 'character-' + randomUUID(), name: label(character.name), playerId: 'player-' + randomUUID(), ...(label(character.playerName) ? { playerName: label(character.playerName) } : {}) };
        }) };
        await atomic(module.path + '/游玩团/' + id + '/团.json', run);
        state.selected = { moduleId, runId: id }; return { run, selected: { moduleId, runId: id, moduleName: module.name, runName: run.name } };
      });
    },
    async manageRun(actor, { moduleId, runId, action, name, expectedRevision }) {
      return transaction(async state => {
        const data = await inventory(false), session = await actorSession(actor, state, data); requireDm(session);
        expected(state, expectedRevision);
        const current = selectedRun(data, { moduleId, runId }); if (!current) fail('团已移动或删除，请刷新目录。', 404);
        const { path, ...record } = current.run;
        if (action === 'rename') {
          if (!label(name)) fail('请输入团名。');
          await atomic(path + '/团.json', { ...record, name: label(name) });
        } else if (action === 'copy') {
          const id = 'run-' + randomUUID(), destination = current.module.path + '/游玩团/' + id;
          const pending = current.module.path + '/游玩团/.copy-' + id;
          // Read every copied record before publishing the new run directory.
          const files = [];
          for (const filename of ['画布.json', '群聊.json']) {
            try { files.push([filename, await json(path + '/' + filename)]); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
          }
          await atomic(pending + '/团.json', { ...record, id, name: label(name, record.name + ' · 副本'), copiedFrom: record.id });
          for (const [filename, value] of files) await atomic(pending + '/' + filename, filename === '画布.json' ? { ...value, runId: id, revision: 1 } : value);
          await rename(await safe(pending), await safe(destination, true));
        } else if (action === 'archive') {
          // Keep every file intact; archived runs can be restored in the file manager.
          const target = current.module.path + '/已归档团/' + runId + '-' + randomUUID();
          await mkdir(dirname(await safe(target, true)), { recursive: true });
          await rename(await safe(path), await safe(target, true));
          if (state.selected?.moduleId === moduleId && state.selected?.runId === runId) state.selected = null;
          for (const invite of Object.values(state.invites)) if (invite.moduleId === moduleId && invite.runId === runId) invite.revoked = true;
        } else fail('团操作无效。');
        return { action };
      });
    },
    async changeCover(actor, { moduleId, base64, expectedRevision }) {
      return transaction(async state => {
        const data = await inventory(false), session = await actorSession(actor, state, data); requireDm(session); expected(state, expectedRevision);
        const module = data.modules.find(item => item.id === moduleId); if (!module) fail('模组不存在。', 404);
        if (typeof base64 !== 'string' || base64.length > 240000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail('请使用小于180KB的JPEG封面。');
        const bytes = Buffer.from(base64, 'base64'); if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) fail('封面必须是JPEG图片。');
        const target = await safe(module.path + '/封面.jpg', true), temporary = target + '.' + randomUUID() + '.tmp';
        const handle = await open(temporary, 'wx');
        try {
          await handle.writeFile(bytes); await handle.sync(); await handle.close();
          try { const old = await read(module.path + '/封面.jpg'); const backup = await open(await safe(module.path + '/封面备份-' + randomUUID() + '.jpg', true), 'wx'); try { await backup.writeFile(old); } finally { await backup.close(); } } catch (error) { if (error.code !== 'ENOENT') throw error; }
          await safe(module.path + '/封面.jpg', true); await rename(temporary, target);
        } finally { await handle.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
        return { moduleId };
      });
    },
    async chat(actor, body) {
      const operation = async state => {
        const data = await inventory(false), session = await actorSession(actor, state, data), current = requireCurrent(session);
        const path = current.run.path + '/群聊.json'; let messages = [];
        try { messages = await json(path); if (!Array.isArray(messages)) fail('群聊文件格式无效，原件保留。', 409); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (body) {
          if (body.moduleId !== current.module.id || body.runId !== current.run.id) fail('当前团已变化，请重新打开群聊。', 409);
          if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 10000) fail('消息需为1至10000字。');
          messages.push({ id: randomUUID(), speaker: session.role === 'dm' ? 'DM' : current.run.characters.filter(item => item.playerId === session.playerId).map(item => item.name).join('、'), text: body.text.trim(), createdAt: new Date().toISOString() });
          await atomic(path, messages);
        }
        return { messages, selected: current.selection };
      };
      return body ? transaction(operation) : operation(await loadState());
    },
    async addCharacter(actor, { name, playerName, playerId, expectedRevision }) {
      return transaction(async state => {
        const data = await inventory(false), session = await actorSession(actor, state, data); requireDm(session); const current = requireCurrent(session);
        if (expectedRevision !== undefined) expected(state, expectedRevision);
        if (!label(name) || current.run.characters.length >= 100) fail('需要角色名，且每团最多100个角色。');
        if (playerId && !current.run.characters.some(character => character.playerId === playerId)) fail('该玩家不属于当前团。');
        const character = { id: 'character-' + randomUUID(), name: label(name), playerId: playerId || 'player-' + randomUUID(), ...(label(playerName) ? { playerName: label(playerName) } : {}) };
        const { path, ...run } = current.run; run.characters.push(character); await atomic(path + '/团.json', run); return { character, characters: run.characters };
      });
    },
    async shares(actor, resourceId) {
      const { state, data, session } = await snapshot(actor); requireDm(session); const current = requireCurrent(session), { resource } = findResource(data, resourceId);
      if (resource.scope === 'module' && resource.moduleId !== current.module.id) fail('不能把其他模组资料开放到当前团。', 403);
      if (!resource.shareable) fail(resource.scope === 'world' ? '世界资源默认开放，无需逐角色授权。' : '模组仅可开放地图、人物和怪物图片。', 400);
      return { resourceId, characterIds: state.shares[runKey(current.selection)]?.[resourceId] || [], revision: state.revision, selected: current.selection };
    },
    async setShares(actor, { resourceId, characterIds, expectedRevision, moduleId, runId }) {
      return transaction(async state => {
        const data = await inventory(), session = await actorSession(actor, state, data); requireDm(session); const current = requireCurrent(session); expected(state, expectedRevision);
        if (moduleId && moduleId !== current.module.id || runId && runId !== current.run.id) fail('当前团已切换，请重新核对开放对象。', 409);
        const { resource } = findResource(data, resourceId);
        if (resource.scope === 'module' && resource.moduleId !== current.module.id) fail('不能把其他模组资料开放到当前团。', 403);
        if (!resource.shareable) fail(resource.scope === 'world' ? '世界资源默认开放，无需逐角色授权。' : '模组仅可开放地图、人物和怪物图片。', 400);
        if (!Array.isArray(characterIds) || characterIds.length > 100 || characterIds.some(id => !current.run.characters.some(character => character.id === id))) fail('开放对象必须是当前团的角色。');
        const next = [...new Set(characterIds)].sort(), key = runKey(current.selection), before = state.shares[key]?.[resourceId] || [], created = [];
        state.shares[key] ||= {}; state.shares[key][resourceId] = next;
        for (const characterId of new Set([...before, ...next])) {
          if (before.includes(characterId) === next.includes(characterId)) continue;
          const character = current.run.characters.find(item => item.id === characterId); if (!character) continue;
          const type = next.includes(characterId) ? 'share' : 'revoke';
          const notification = { id: randomUUID(), moduleId: current.module.id, runId: current.run.id, playerId: character.playerId, characterId, resourceId, type,
            content: type === 'share' ? `DM向你分享了【${resource.name}】` : `DM撤回了给你的分享【${resource.name}】`, createdAt: new Date().toISOString() };
          state.notifications.push(notification); created.push(notification.id);
        }
        return { resourceId, characterIds: next, selected: current.selection, notificationsCreated: created.length };
      });
    },
    async createInvite(actor, { playerId, expectedRevision }) {
      const token = randomBytes(32).toString('base64url');
      return transaction(async state => {
        const data = await inventory(false), session = await actorSession(actor, state, data); requireDm(session); const current = requireCurrent(session);
        if (expectedRevision !== undefined) expected(state, expectedRevision);
        if (!current.run.characters.some(character => character.playerId === playerId)) fail('玩家不属于当前团。');
        const id = randomUUID(); state.invites[sha(token)] = { id, moduleId: current.module.id, runId: current.run.id, playerId, createdAt: new Date().toISOString() };
        return { inviteId: id, token, ...current.selection, playerId };
      });
    },
    async join(token) {
      const { session } = await snapshot({ token }, false);
      return { token, role: 'player', playerId: session.playerId, selected: session.current.selection, inviteId: session.inviteId };
    },
    async revokeInvite(actor, { inviteId, expectedRevision }) {
      return transaction(async state => {
        const data = await inventory(false), session = await actorSession(actor, state, data); requireDm(session); const current = requireCurrent(session);
        if (expectedRevision !== undefined) expected(state, expectedRevision);
        const invite = Object.values(state.invites).find(item => item.id === inviteId);
        if (!invite || invite.moduleId !== current.module.id || invite.runId !== current.run.id) fail('邀请不存在于当前团。', 404);
        invite.revoked = true; return { inviteId, revoked: true };
      });
    },
    async notifications(actor) {
      const { state, session } = await snapshot(actor, false);
      const playerRevision = (await players.tree()).revision;
      if (!session.current) return { notifications: [], revision: state.revision, playerRevision };
      const rows = state.notifications.filter(item => item.moduleId === session.current.module.id && item.runId === session.current.run.id && (session.role === 'dm' || item.playerId === session.playerId));
      return { notifications: rows.map(item => {
        const currentGrants = state.shares[runKey(session.current.selection)]?.[item.resourceId] || [];
        return { ...item, canOpen: item.type === 'share' && currentGrants.includes(item.characterId) && (session.role === 'dm' || permitted({ id: item.resourceId, scope: 'world' }, session, state)) };
      }), revision: state.revision, playerRevision };
    }
  };
}

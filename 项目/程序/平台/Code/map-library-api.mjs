import { lstat, readdir, readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, dirname, extname, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createDocument, validateDocument } from '../../../预处理/1. 处理地图/Code/工作台/model.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\\/\x00-\x1f]/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const segment = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !/[. ]$/.test(value) && !['.', '..'].includes(value) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
const relativePath = value => typeof value === 'string' && value.length < 1000 && !isAbsolute(value) && value.split('/').every(segment);
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function createMapLibraryApi({ root, authorize = () => null }) {
  root = resolve(root); let queue = Promise.resolve();
  async function safe(path, missing = false) {
    if (!relativePath(path)) fail('地图文件路径无效。', 403);
    const target = resolve(root, path), inside = relative(root, target);
    if (isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep)) fail('地图文件路径越界。', 403);
    const rootInfo = await lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) fail('资料根必须是普通目录。', 403);
    let current = root;
    for (const part of inside.split(sep)) {
      current = join(current, part);
      let info; try { info = await lstat(current); } catch (error) { if (error.code === 'ENOENT' && missing) break; throw error; }
      if (info.isSymbolicLink()) fail('地图路径不能经过链接或目录联接。', 403);
      if (info.isFile() && info.nlink > 1) fail('地图文件不能是硬链接。', 403);
    }
    return target;
  }
  async function bytes(path, limit = 16 * 1024 * 1024) {
    const target = await safe(path), info = await lstat(target);
    if (!info.isFile() || info.nlink > 1 || info.size > limit) fail('地图文件不是大小合理的独立文件。', 409);
    const value = await readFile(target); if (value.length > limit) fail('地图文件超过大小限制。', 413); return value;
  }
  async function json(path, limit) {
    const raw = await bytes(path, limit);
    try { return JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')); } catch { fail('地图JSON损坏，原文件保持：' + path, 409); }
  }
  async function catalog() {
    let entries; try { entries = await readdir(await safe('模组'), { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return { packages: [], issues: [] }; throw error; }
    const packages = [], issues = [], counts = new Map();
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.') || ['预处理', '程序', 'Code', '资料'].includes(entry.name)) continue;
      const folder = '模组/' + entry.name;
      try {
        const meta = await json(folder + '/模组.json'); if (!id(meta.id) || typeof meta.name !== 'string') fail('模组身份无效。', 409);
        counts.set(meta.id, (counts.get(meta.id) || 0) + 1);
        let pack, packageBytes;
        try { packageBytes = await bytes(folder + '/地图/地图包.json'); pack = JSON.parse(packageBytes.toString('utf8').replace(/^\uFEFF/, '')); }
        catch (error) { if (error.code === 'ENOENT') continue; if (error instanceof SyntaxError) fail('地图包JSON损坏，原件保留。', 409); throw error; }
        if (pack.schemaVersion !== 1 || !plain(pack.moduleData) || pack.moduleData.id !== meta.id) fail('地图包与模组身份不符。', 409);
        createDocument(pack.moduleData);
        const assets = pack.assets || pack.assetFiles || pack.assetsMap || {};
        if (!plain(assets)) fail('地图图片清单无效。', 409);
        for (const [key, value] of Object.entries(assets)) {
          const path = typeof value === 'string' ? value : value?.path;
          if (typeof key !== 'string' || !relativePath(path) || !imageTypes[extname(path).toLowerCase()]) fail('地图图片清单含无效路径。', 409);
        }
        const known = url => Object.hasOwn(assets, url) || Object.values(assets).some(asset => (typeof asset === 'string' ? asset : asset.path) === url);
        for (const node of pack.moduleData.nodes) {
          if (node.imageUrl && !known(node.imageUrl)) fail('地图主图未登记在图片清单。', 409);
          for (const variant of node.variants || []) if (!known(variant.url)) fail('地图版本未登记在图片清单。', 409);
        }
        packages.push({ ...pack, assets, moduleId: meta.id, title: meta.name, mapPackageSha256: sha(packageBytes), folder });
      } catch (error) { if (error.code !== 'ENOENT') issues.push({ path: folder, error: error.status ? error.message : '地图包读取失败，原件保留。' }); }
    }
    const duplicates = new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
    for (const moduleId of duplicates) issues.push({ moduleId, error: '模组ID重复，相关地图不可引用。' });
    return { packages: packages.filter(item => !duplicates.has(item.moduleId)), issues };
  }
  async function moduleById(moduleId) {
    if (!id(moduleId)) fail('模组ID无效。');
    const entry = (await catalog()).packages.find(item => item.moduleId === moduleId);
    if (!entry) fail('找不到唯一有效的模组地图包。', 404); return entry;
  }
  async function canvasTarget(module, runId) {
    if (runId === 'preparation') return module.folder + '/画布.json';
    if (!segment(runId)) fail('游玩团ID无效。');
    const folder = module.folder + '/游玩团/' + runId, run = await json(folder + '/团.json');
    if (run.id !== runId || run.moduleId !== module.moduleId) fail('游玩团与模组归属不符。', 409);
    return folder + '/画布.json';
  }
  async function canvasEnvelope(module, runId, path) {
    let saved; try { saved = await json(path, 4 * 1024 * 1024); } catch (error) { if (error.code === 'ENOENT') return { revision: 0, document: null }; throw error; }
    if (!plain(saved) || saved.schemaVersion !== 1 || saved.moduleId !== module.moduleId || saved.runId !== runId || !Number.isSafeInteger(saved.revision) || saved.revision < 1) fail('画布文件身份或版本无效，原件保持。', 409);
    return saved;
  }
  async function loadCanvas(module, runId, path) {
    const saved = await canvasEnvelope(module, runId, path);
    if (saved.document === null && saved.revision === 0) return saved;
    if (saved.mapPackageSha256 !== module.mapPackageSha256) throw Object.assign(new Error('地图包已变化或旧画布缺少来源基准；未自动绑定新图，旧画布保留。'), {
      status: 409, code: 'MAP_PACKAGE_CHANGED', revision: saved.revision, currentMapPackageSha256: module.mapPackageSha256,
      previousMapPackageSha256: saved.mapPackageSha256 || null, canResetPreparation: runId === 'preparation'
    });
    try { return { revision: saved.revision, document: validateDocument(saved.document, module.moduleData) }; }
    catch (error) { fail(error.message + '；旧画布保留，请核对地图包版本。', 409); }
  }
  async function atomic(path, value) {
    const target = await safe(path, true); await mkdir(dirname(target), { recursive: true }); await safe(path, true);
    const temporary = target + '.' + randomUUID() + '.tmp'; let handle;
    try { handle = await open(temporary, 'wx'); await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); await handle.close(); handle = null; await safe(path, true); await rename(temporary, target); }
    finally { await handle?.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async function saveCanvas(body) {
    const next = queue.catch(() => {}).then(async () => {
      const module = await moduleById(body.moduleId), path = await canvasTarget(module, body.runId), lockPath = path + '.lock', target = await safe(lockPath, true);
      let lock;
      try { lock = await open(target, 'wx'); } catch (error) { if (error.code === 'EEXIST') fail('画布正在由另一个进程保存，请稍后重试。', 409); throw error; }
      try {
        if (body.resetPreparation === true && body.runId !== 'preparation') fail('不能通过准备画布重置覆盖旧团布局。', 409);
        if (body.expectedMapPackageSha256 !== module.mapPackageSha256) fail('地图包已变化或保存缺少来源基准，请刷新核对；本次未写入。', 409);
        const current = body.resetPreparation === true ? await canvasEnvelope(module, body.runId, path) : await loadCanvas(module, body.runId, path);
        if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision !== current.revision) fail('画布版本冲突，请保留草稿并重新核对文件。', 409);
        let document; try { document = body.resetPreparation === true ? createDocument(module.moduleData) : validateDocument(body.document, module.moduleData); } catch (error) { fail(error.message, 400); }
        const revision = current.revision + 1; if (!Number.isSafeInteger(revision)) fail('画布版本超出范围。', 409);
        let backupPath;
        if (body.resetPreparation === true && current.revision > 0) {
          backupPath = path.replace(/\.json$/, '.旧包备份-' + randomUUID() + '.json');
          const backup = await safe(backupPath, true), handle = await open(backup, 'wx');
          try { await handle.writeFile(await bytes(path, 4 * 1024 * 1024)); await handle.sync(); } finally { await handle.close(); }
        }
        await atomic(path, { schemaVersion: 1, moduleId: module.moduleId, runId: body.runId, mapPackageSha256: module.mapPackageSha256, revision, document });
        return { revision, document, ...(backupPath ? { backupPath } : {}) };
      } finally { await lock.close(); await unlink(target); }
    });
    queue = next; return next;
  }
  async function body(request) {
    if (!String(request.headers['content-type']).startsWith('application/json')) fail('地图保存需要JSON请求。', 415);
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 4 * 1024 * 1024) fail('画布请求超过4MB。', 413); chunks.push(chunk); }
    let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('画布请求不是有效JSON。'); }
    if (!plain(value)) fail('画布请求须为对象。'); return value;
  }
  return { async handle(request, url, send) {
    if (!['/api/library/maps', '/api/library/map-asset', '/api/library/canvas'].includes(url.pathname)) return false;
    try {
      if (request.headers.origin && request.headers.origin !== 'http://' + request.headers.host && request.headers.origin !== 'https://' + request.headers.host) fail('拒绝跨来源地图请求。', 403);
      const session = await authorize(request); if (session?.role !== 'dm') fail('地图资料仅对本机DM开放；玩家地图共享尚未启用。', 403);
      if (request.method === 'GET' && url.pathname === '/api/library/maps') {
        const data = await catalog(), filter = url.searchParams.get('modules')?.split(',').filter(Boolean);
        if (filter?.some(value => !id(value))) fail('模组筛选无效。');
        send(200, { ...data, packages: data.packages.filter(item => !filter?.length || filter.includes(item.moduleId)).map(({ folder, ...item }) => item) });
      } else if (request.method === 'GET' && url.pathname === '/api/library/map-asset') {
        const module = await moduleById(url.searchParams.get('moduleId')), key = url.searchParams.get('path');
        const asset = Object.hasOwn(module.assets, key) ? module.assets[key] : Object.values(module.assets).find(item => (typeof item === 'string' ? item : item.path) === key);
        if (!asset) fail('地图图片未获此模组清单授权。', 404);
        const path = typeof asset === 'string' ? asset : asset.path, mime = imageTypes[extname(path).toLowerCase()];
        const raw = await bytes(module.folder + '/地图/' + path, 32 * 1024 * 1024);
        if (asset.sha256 && asset.sha256 !== sha(raw)) fail('地图图片已变化，未沿用原清单。', 409);
        send(200, { mime, base64: raw.toString('base64') });
      } else if (request.method === 'GET' && url.pathname === '/api/library/canvas') {
        const module = await moduleById(url.searchParams.get('moduleId')), runId = url.searchParams.get('runId'), path = await canvasTarget(module, runId);
        send(200, await loadCanvas(module, runId, path));
      } else if (request.method === 'POST' && url.pathname === '/api/library/canvas') send(200, await saveCanvas(await body(request)));
      else send(405, { error: '不支持此地图请求方法。' });
    } catch (error) { send(error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.status ? error.message : error.code === 'ENOENT' ? '地图文件或游玩团不存在，原资料保持。' : '地图读取或保存失败，当前草稿请保留。',
      ...(error.code === 'MAP_PACKAGE_CHANGED' ? { code: error.code, revision: error.revision, currentMapPackageSha256: error.currentMapPackageSha256, previousMapPackageSha256: error.previousMapPackageSha256, canResetPreparation: error.canResetPreparation } : {}) }); }
    return true;
  } };
}

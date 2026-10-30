import {readdir, lstat, realpath, open, readFile, unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, join, relative, isAbsolute} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {atomicJson} from '../../战斗/src/store.mjs';

const CONFIG_NAME = 'cover-crops.json';
const LOCK_NAME = '.cover-crops.lock';
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_DIMENSION = 16384;
const MAX_PIXELS = 100_000_000;
const COVER_FILES = ['模组封面.png', '模组封面.jpg'];
const queues = new Map();
const digest = value => createHash('sha256').update(value).digest('hex');
const emptyRevision = digest(Buffer.alloc(0));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const normalized = path => process.platform === 'win32' ? path.toLowerCase() : path;
const moduleId = directory => digest(directory).slice(0, 32);

export class ModuleLibraryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ModuleLibraryError';
    this.status = status;
    this.code = 'MODULE_LIBRARY';
  }
}

function requireValue(condition, message, status = 400) {
  if (!condition) throw new ModuleLibraryError(message, status);
}

function contains(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'));
}

function validSize(value) {
  return record(value) && Object.keys(value).every(key => ['width', 'height'].includes(key)) &&
    ['width', 'height'].every(key => Number.isInteger(value[key]) && value[key] > 0 && value[key] <= MAX_DIMENSION) &&
    value.width * value.height <= MAX_PIXELS;
}

function validRelativeDirectory(value) {
  return typeof value === 'string' && value.length <= 512 && !/[\\:\u0000-\u001f]/.test(value) &&
    [1, 2].includes(value.split('/').length) && value.split('/').every(part => part && !['.', '..', '__proto__', 'prototype', 'constructor'].includes(part));
}

function validateCrop(crop, size) {
  requireValue(record(crop) && Object.keys(crop).length === 4 &&
    Object.keys(crop).every(key => ['x', 'y', 'width', 'height'].includes(key)), '裁切区域字段无效');
  requireValue(['x', 'y', 'width', 'height'].every(key => Number.isFinite(crop[key])) &&
    crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 &&
    crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001,
  '裁切区域必须位于原图内，坐标范围为0～1');
  requireValue(Math.abs(crop.width * size.width / (crop.height * size.height) - .75) <= .001,
    '裁切区域须保持3:4比例');
}

function validateEntry(entry) {
  requireValue(record(entry) && Object.keys(entry).every(key => ['file', 'sourceSize', 'mode', 'crop'].includes(key)),
    '封面裁切条目字段无效');
  requireValue(typeof entry.file === 'string' && COVER_FILES.includes(entry.file.toLowerCase()), '封面文件名无效');
  requireValue(validSize(entry.sourceSize), '封面原图尺寸无效');
  requireValue(['contain', 'crop'].includes(entry.mode), '封面显示方式无效');
  if (entry.mode === 'crop') validateCrop(entry.crop, entry.sourceSize);
  else requireValue(entry.crop === undefined, '完整显示模式不应包含裁切区域');
}

function validateConfig(value) {
  requireValue(record(value), '封面配置须为JSON对象');
  requireValue(value.schemaVersion === 1, '不支持的封面配置版本；原文件已保留');
  requireValue(Object.keys(value).every(key => ['schemaVersion', 'frameAspectRatio', 'covers'].includes(key)),
    '封面配置字段无效；原文件已保留');
  requireValue(Array.isArray(value.frameAspectRatio) && value.frameAspectRatio.length === 2 &&
    value.frameAspectRatio[0] === 3 && value.frameAspectRatio[1] === 4, '封面框比例须为3:4');
  requireValue(record(value.covers) && Object.keys(value.covers).length <= 4000, '封面配置条目无效或过多');
  for (const [directory, entry] of Object.entries(value.covers)) {
    requireValue(validRelativeDirectory(directory), '封面配置包含无效模组目录');
    validateEntry(entry);
  }
}

function imageInfo(bytes, file) {
  const extension = file.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  let width, height;
  if (extension === 'png') {
    requireValue(bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      '封面不是有效PNG图片');
    requireValue(bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR', 'PNG封面头部无效');
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
    let offset = 8, foundData = false, ended = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      requireValue(length <= MAX_IMAGE_BYTES && offset + 12 + length <= bytes.length, 'PNG封面已截断或损坏');
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') foundData = true;
      if (type === 'IEND') {
        requireValue(length === 0 && offset + 12 === bytes.length, 'PNG封面结束标记无效');
        ended = true; break;
      }
      offset += 12 + length;
    }
    requireValue(foundData && ended, 'PNG封面缺少图像或结束数据');
  } else {
    requireValue(bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9, '封面不是有效JPEG图片');
    let offset = 2, foundScan = false;
    while (offset + 1 < bytes.length) {
      requireValue(bytes[offset] === 0xff, 'JPEG封面标记无效');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      requireValue(marker !== undefined && marker !== 0x00 && marker !== 0xd8 && marker !== 0xd9, 'JPEG封面标记无效');
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      requireValue(offset + 2 <= bytes.length, 'JPEG封面已截断');
      const length = bytes.readUInt16BE(offset);
      requireValue(length >= 2 && offset + length <= bytes.length, 'JPEG封面已截断');
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        requireValue(length >= 8, 'JPEG封面尺寸段无效');
        height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5);
      }
      if (marker === 0xda) {
        requireValue(offset + length < bytes.length - 2, 'JPEG封面缺少图像数据');
        foundScan = true; break;
      }
      offset += length;
    }
    requireValue(width && height && foundScan, 'JPEG封面缺少尺寸或图像数据');
  }
  requireValue(validSize({width, height}), '封面尺寸过大或无效');
  return {width, height, mime: extension === 'png' ? 'image/png' : 'image/jpeg'};
}

async function directoryInfo(path, root) {
  const info = await lstat(path);
  requireValue(info.isDirectory() && !info.isSymbolicLink(), '模组目录不能是符号链接或非目录', 403);
  const actual = await realpath(path);
  requireValue(!root || contains(root, actual), '模组目录超出素材库范围', 403);
  return {path: actual, info};
}

async function readSafeFile(path, root, limit) {
  const before = await lstat(path);
  requireValue(before.isFile() && !before.isSymbolicLink(), '封面或配置必须是本目录中的普通文件', 403);
  const actual = await realpath(path);
  requireValue(contains(root, actual), '封面或配置超出素材库范围', 403);
  const handle = await open(actual, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    requireValue(info.isFile() && sameFile(before, info), '文件在读取时已变化，请刷新', 409);
    requireValue(info.size <= limit, limit === MAX_IMAGE_BYTES ? '封面超过16MB，请缩小图片' : '封面配置超过1MB', 413);
    const chunks = []; let count = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(65536, limit + 1 - count));
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      count += bytesRead; requireValue(count <= limit, '文件在读取时超过大小限制', 413);
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await lstat(path);
    requireValue(!after.isSymbolicLink() && sameFile(info, after) && after.size === count &&
      info.mtimeMs === after.mtimeMs, '文件在读取时已变化，请刷新', 409);
    return {bytes: Buffer.concat(chunks), info};
  } finally { await handle.close(); }
}

async function loadConfig(base) {
  const path = join(base, CONFIG_NAME);
  try {
    const {bytes} = await readSafeFile(path, base, MAX_CONFIG_BYTES);
    const revision = digest(bytes);
    try {
      const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      validateConfig(value); return {value, revision, issue: null};
    } catch (error) {
      return {value: null, revision, issue: error instanceof ModuleLibraryError ? error.message : '封面配置JSON损坏；原文件已保留'};
    }
  } catch (error) {
    if (error.code === 'ENOENT') return {value: {schemaVersion: 1, frameAspectRatio: [3, 4], covers: {}}, revision: emptyRevision, issue: null};
    return {value: null, revision: null, issue: error instanceof ModuleLibraryError ? error.message : '封面配置暂不可读取；原文件未改动'};
  }
}

async function collectDirectories(base) {
  const groups = [], modules = new Map();
  const categories = (await readdir(base, {withFileTypes: true})).filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.') && !['__proto__', 'prototype', 'constructor'].includes(entry.name));
  requireValue(categories.length <= 500, '模组分类过多，请拆分素材库', 413);
  categories.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  let prepared;
  for (const category of categories) {
    let groupDirectory;
    try { groupDirectory = await directoryInfo(join(base, category.name), base); }
    catch (error) { if (error.code === 'ENOENT' || error instanceof ModuleLibraryError) continue; throw error; }
    const contents = await readdir(groupDirectory.path, {withFileTypes: true});
    if (contents.some(entry => entry.isFile() && (entry.name === '预处理.json' || COVER_FILES.includes(entry.name.toLowerCase())))) {
      prepared ||= {id: digest('group:prepared').slice(0, 16), name: '预处理模组', modules: []};
      let name = category.name;
      try {
        const data = JSON.parse((await readSafeFile(join(groupDirectory.path, '预处理.json'), base, MAX_CONFIG_BYTES)).bytes.toString('utf8'));
        if (typeof data.title === 'string' && data.title.length <= 200) name = data.title;
      } catch { /* A missing title does not prevent safe cover management. */ }
      const item = {id: moduleId(category.name), name, relativeDirectory: category.name};
      prepared.modules.push(item); modules.set(item.id, {...item, path: groupDirectory.path, info: groupDirectory.info});
      continue;
    }
    const group = {id: digest('group:' + category.name).slice(0, 16), name: category.name, modules: []};
    const entries = (await readdir(groupDirectory.path, {withFileTypes: true})).filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.'));
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    for (const entry of entries) {
      requireValue(modules.size < 4000, '模组数量过多，请拆分素材库', 413);
      let directory;
      try { directory = await directoryInfo(join(groupDirectory.path, entry.name), base); }
      catch (error) { if (error.code === 'ENOENT' || error instanceof ModuleLibraryError) continue; throw error; }
      const rel = category.name + '/' + entry.name;
      const item = {id: moduleId(rel), name: entry.name, relativeDirectory: rel};
      group.modules.push(item); modules.set(item.id, {...item, path: directory.path, info: directory.info});
    }
    groups.push(group);
  }
  if (prepared) groups.unshift(prepared);
  return {groups, modules};
}

async function loadCover(base, module, config) {
  await directoryInfo(module.path, base);
  const files = await readdir(module.path, {withFileTypes: true});
  const candidates = files.filter(entry => COVER_FILES.includes(entry.name.toLowerCase()));
  const preferred = config.value?.covers[module.relativeDirectory]?.file;
  const ordered = [...COVER_FILES];
  if (preferred) ordered.unshift(preferred.toLowerCase());
  let chosen;
  for (const name of ordered) {
    const matching = candidates.filter(entry => entry.name.toLowerCase() === name);
    requireValue(matching.length <= 1, '封面文件存在大小写重名，请保留一个', 409);
    if (matching.length) { chosen = matching[0]; break; }
  }
  requireValue(chosen, '没有找到模组封面.png或模组封面.jpg', 404);
  requireValue(chosen.isFile() && !chosen.isSymbolicLink(), '封面不能是符号链接或非普通文件', 403);
  const path = join(module.path, chosen.name);
  const {bytes} = await readSafeFile(path, base, MAX_IMAGE_BYTES);
  const info = imageInfo(bytes, chosen.name);
  return {bytes, file: chosen.name, path, revision: digest(bytes), ...info};
}

function matchingCrop(config, module, cover) {
  const entry = config.value?.covers[module.relativeDirectory];
  return entry && entry.file.toLowerCase() === cover.file.toLowerCase() &&
    entry.sourceSize.width === cover.width && entry.sourceSize.height === cover.height ? structuredClone(entry) : null;
}

async function ownedLock(base) {
  const path = join(base, LOCK_NAME), token = `${process.pid}:${randomUUID()}`;
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new ModuleLibraryError('另一个进程正在保存封面配置，或保留了未清理的锁；请稍后刷新，未改动配置', 423);
    throw error;
  }
  const info = await handle.stat();
  try { await handle.writeFile(token, 'utf8'); await handle.sync(); }
  catch (error) {
    await handle.close();
    const current = await lstat(path).catch(() => null);
    if (current?.isFile() && !current.isSymbolicLink() && sameFile(current, info)) await unlink(path).catch(() => {});
    throw error;
  }
  await handle.close();
  return async () => {
    try {
      const current = await lstat(path);
      if (current.isFile() && !current.isSymbolicLink() && sameFile(current, info) && await readFile(path, 'utf8') === token) await unlink(path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
}

export function createModuleLibrary({root} = {}) {
  requireValue(typeof root === 'string' && root.trim().length > 0, '请指定模组根目录');
  const directory = resolve(root), configFile = join(directory, CONFIG_NAME), queueKey = normalized(directory);
  async function rootInfo() {
    try { return await directoryInfo(directory); }
    catch (error) {
      if (error.code === 'ENOENT') throw new ModuleLibraryError('模组根目录不存在，请先建立分类与模组文件夹', 404);
      if (error instanceof ModuleLibraryError) throw error;
      throw new ModuleLibraryError('模组根目录暂不可读取', 503);
    }
  }
  async function scan() {
    const base = await rootInfo(), config = await loadConfig(base.path), directories = await collectDirectories(base.path);
    return {base, config, ...directories};
  }
  async function catalog() {
    let data;
    try { data = await scan(); }
    catch (error) {
      if (error instanceof ModuleLibraryError && [403, 404].includes(error.status)) return {root: directory, configFile, configRevision: null, configIssue: error.message, groups: []};
      if (error instanceof ModuleLibraryError) throw error;
      throw new ModuleLibraryError('模组目录暂不可读取，请刷新', 503);
    }
    for (const group of data.groups) for (const module of group.modules) {
      try {
        const cover = await loadCover(data.base.path, data.modules.get(module.id), data.config);
        module.cover = {file: cover.file, width: cover.width, height: cover.height, revision: cover.revision, mime: cover.mime};
        module.crop = matchingCrop(data.config, module, cover);
        const saved = data.config.value?.covers[module.relativeDirectory];
        if (saved && !module.crop) module.issue = '封面来源或尺寸已变化，暂按完整显示；请重新确认裁切';
      } catch (error) {
        module.cover = null; module.crop = null;
        module.issue = error instanceof ModuleLibraryError ? error.message : '封面暂不可读取，请刷新';
      }
    }
    return {root: directory, configFile, configRevision: data.config.revision, configIssue: data.config.issue, groups: data.groups};
  }
  async function readCover(id) {
    requireValue(typeof id === 'string' && /^[a-f\d]{32}$/.test(id), '模组标识无效', 404);
    try {
      const data = await scan(), module = data.modules.get(id);
      requireValue(module, '模组不存在，请刷新目录', 404);
      const cover = await loadCover(data.base.path, module, data.config);
      return {bytes: cover.bytes, mime: cover.mime, revision: cover.revision, width: cover.width, height: cover.height};
    } catch (error) {
      if (error instanceof ModuleLibraryError) throw error;
      if (error.code === 'ENOENT') throw new ModuleLibraryError('封面在读取时已变化，请刷新', 409);
      throw new ModuleLibraryError('封面暂不可读取，请刷新', 503);
    }
  }
  function saveCrop(payload) {
    const task = (queues.get(queueKey) || Promise.resolve()).then(async () => {
      requireValue(record(payload) && Object.keys(payload).every(key => ['moduleId', 'expectedConfigRevision', 'expectedCoverRevision', 'mode', 'crop'].includes(key)), '裁切保存字段无效');
      requireValue(typeof payload.moduleId === 'string' && /^[a-f\d]{32}$/.test(payload.moduleId), '模组标识无效', 404);
      requireValue([payload.expectedConfigRevision, payload.expectedCoverRevision].every(value => typeof value === 'string' && /^[a-f\d]{64}$/.test(value)), '请先读取当前配置与封面版本', 409);
      requireValue(['contain', 'crop'].includes(payload.mode), '封面显示方式无效');
      requireValue(payload.mode === 'crop' || payload.crop === undefined, '完整显示模式不应包含裁切区域');
      const base = await rootInfo();
      const release = await ownedLock(base.path);
      try {
        const config = await loadConfig(base.path);
        requireValue(!config.issue, `无法保存：${config.issue || '封面配置无效'}；原文件未覆盖`, 409);
        requireValue(config.revision === payload.expectedConfigRevision, '封面裁切配置已变化，请刷新后重试', 409);
        const directories = await collectDirectories(base.path), module = directories.modules.get(payload.moduleId);
        requireValue(module, '模组不存在，请刷新目录', 404);
        const cover = await loadCover(base.path, module, config);
        requireValue(cover.revision === payload.expectedCoverRevision, '封面在预览后已变化，请刷新并重新裁切', 409);
        const size = {width: cover.width, height: cover.height};
        if (payload.mode === 'crop') validateCrop(payload.crop, size);
        const next = structuredClone(config.value);
        next.covers[module.relativeDirectory] = {file: cover.file, sourceSize: size, mode: payload.mode,
          ...(payload.mode === 'crop' ? {crop: Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, payload.crop[key]]))} : {})};
        requireValue(Buffer.byteLength(JSON.stringify(next)) <= MAX_CONFIG_BYTES, '封面配置超过1MB，请拆分素材库', 413);
        validateConfig(next);
        await atomicJson(join(base.path, CONFIG_NAME), next, {beforeReplace: async () => {
          const currentBase = await rootInfo();
          requireValue(normalized(currentBase.path) === normalized(base.path) && sameFile(currentBase.info, base.info), '模组根目录在保存时已变化，请刷新', 409);
          const currentConfig = await loadConfig(base.path);
          requireValue(!currentConfig.issue && currentConfig.revision === config.revision, '封面配置在保存时已变化，原文件未覆盖', 409);
          const currentDirectory = await directoryInfo(module.path, base.path);
          requireValue(sameFile(currentDirectory.info, module.info), '模组目录在保存时已变化，请刷新', 409);
          const currentCover = await loadCover(base.path, module, config);
          requireValue(currentCover.revision === cover.revision && currentCover.file === cover.file, '封面在保存时已变化，请重新裁切', 409);
        }});
      } finally { await release(); }
      return catalog();
    }).catch(error => {
      if (error instanceof ModuleLibraryError) throw error;
      throw new ModuleLibraryError('封面配置保存失败，请检查目录和磁盘后刷新', 503);
    });
    queues.set(queueKey, task.catch(() => {}));
    return task;
  }
  return {catalog, readCover, saveCrop};
}

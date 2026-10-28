import { readFile, mkdir, writeFile, rename, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const displayPresets = ['2560x1600', '2560x1440', '2048x1536', '1920x1440'];
export const defaultProfile = () => ({ preset: 'violet', ground: '#F5F6FA', light: '#D9F6FF', shadow: '#9A9CC5', accent: '#E9B5D5', lift: 7, strength: 85, floorPercent: 15, gradient: { start: '#FFFFFF', end: '#E9B5D5' } });
export const defaultAppearance = () => ({ schemaVersion: 1, revision: 0, displayPreset: displayPresets[0], appearanceProfiles: Object.fromEntries(displayPresets.map(key => [key, defaultProfile()])) });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function keys(value, expected) { return object(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }

export function validateAppearance(value) {
  if (!keys(value, ['schemaVersion', 'revision', 'displayPreset', 'appearanceProfiles']) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !displayPresets.includes(value.displayPreset) || !keys(value.appearanceProfiles, displayPresets)) throw fail(422, '外观文件格式或版本无效，原文件已保留');
  for (const profile of Object.values(value.appearanceProfiles)) {
    if (!keys(profile, ['preset', 'ground', 'light', 'shadow', 'accent', 'lift', 'strength', 'floorPercent', 'gradient']) || !['sunlit', 'mint', 'violet', 'peach', 'custom'].includes(profile.preset)) throw fail(422, '外观预设字段无效');
    for (const name of ['ground', 'light', 'shadow', 'accent']) if (!/^#[\da-f]{6}$/i.test(profile[name])) throw fail(422, '外观颜色无效');
    if (!keys(profile.gradient, ['start', 'end']) || Object.values(profile.gradient).some(color => !/^#[\da-f]{6}$/i.test(color))) throw fail(422, '渐变颜色无效');
    for (const [name, min, max] of [['lift', 2, 13], ['strength', 60, 100], ['floorPercent', 0, 20]]) if (!Number.isInteger(profile[name]) || profile[name] < min || profile[name] > max) throw fail(422, '外观数值超出范围');
  }
  return structuredClone(value);
}

export function createAppearanceStore(path) {
  let queue = Promise.resolve();
  async function read() {
    let bytes;
    try { bytes = await readFile(path); } catch (error) { if (error.code === 'ENOENT') return { value: defaultAppearance(), etag: 'new' }; throw error; }
    let value;
    try { value = JSON.parse(bytes); } catch { throw fail(422, '外观JSON损坏，原文件已保留'); }
    return { value: validateAppearance(value), etag: digest(bytes) };
  }
  function save(value, expectedTag) {
    const task = queue.then(async () => {
      const next = validateAppearance(value), current = await read();
      if (current.value.revision !== next.revision || expectedTag !== current.etag) throw fail(409, '外观已被另一窗口或文件编辑修改，请重新读取；当前草稿已保留');
      next.revision++;
      if (!Number.isSafeInteger(next.revision)) throw fail(422, '外观版本超出范围');
      await mkdir(dirname(path), { recursive: true });
      if (current.etag !== 'new') await copyFile(path, path + '.bak');
      const temporary = path + '.' + randomUUID() + '.tmp';
      const bytes = JSON.stringify(next, null, 2) + '\n';
      await writeFile(temporary, bytes, { flag: 'wx' });
      if ((await read()).etag !== current.etag) throw fail(409, '外观文件在保存期间发生变化，原件和草稿均已保留');
      await rename(temporary, path);
      return { value: next, etag: digest(bytes) };
    });
    queue = task.catch(() => {});
    return task;
  }
  return { read, save };
}

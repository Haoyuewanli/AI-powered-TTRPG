import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { readFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const battleRoot = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(battleRoot, '../../..');
export const defaultArchiveRoot = join(projectRoot, '模组');
export const threeRoot = resolve(battleRoot, '../骰盘/node_modules/three');

export async function defaultCampaign() {
  let value;
  try { value = JSON.parse((await readFile(join(defaultArchiveRoot, '工作区.json'), 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('尚未创建游玩模组，请先从平台模组窗口新建团。'); throw error; }
  const entry = value.campaigns?.find(record => record.id === value.activeCampaignId);
  if (!entry || typeof entry.path !== 'string') throw new Error('没有有效的活动团，请在平台模组窗口重新选择。');
  const target = resolve(defaultArchiveRoot, entry.path), inside = relative(defaultArchiveRoot, target);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('团存档路径超出模组根目录');
  let current = defaultArchiveRoot;
  for (const part of inside.split(/[\\/]/)) { current = join(current, part); if ((await lstat(current)).isSymbolicLink()) throw new Error('团存档路径不能是链接'); }
  return target;
}

export function normalizeEmbedOrigin(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/.test(value)) throw new Error('嵌入来源须为精确的 http://127.0.0.1:端口');
  const target = new URL(value), port = Number(target.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('嵌入来源端口无效');
  if (target.origin !== value) throw new Error('嵌入来源须为浏览器规范的精确来源');
  return value;
}

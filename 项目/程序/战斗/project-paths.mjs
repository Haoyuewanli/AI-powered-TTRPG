import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const battleRoot = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(battleRoot, '../..');
export const defaultArchiveRoot = join(projectRoot, '资源', '故事', 'Z', '战役存档');
export const threeRoot = join(projectRoot, '骰盘', 'node_modules', 'three');

export function normalizeEmbedOrigin(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/.test(value)) throw new Error('嵌入来源须为精确的 http://127.0.0.1:端口');
  const target = new URL(value), port = Number(target.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('嵌入来源端口无效');
  if (target.origin !== value) throw new Error('嵌入来源须为浏览器规范的精确来源');
  return value;
}

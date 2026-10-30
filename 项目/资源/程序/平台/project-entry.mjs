import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
export function resolveBattleArgs(args, projectRoot = resolve(ROOT, '../../..')) {
  const result = [...args], oldRoots = [join(projectRoot, '存档'), join(projectRoot, '资源/故事/Z/战役存档')];
  let mappings = [];
  try {
    const value = JSON.parse(readFileSync(join(projectRoot, '资源/故事/G/目录迁移.json'), 'utf8').replace(/^\uFEFF/, ''));
    if (value.version !== 2 || !Array.isArray(value.mappings)) throw new Error('目录迁移别名格式无效');
    mappings = value.mappings.map(item => {
      if (typeof item.from !== 'string' || typeof item.to !== 'string' || !/^模组(?:\/|$)/.test(item.to) || [item.from, item.to].some(path => isAbsolute(path) || /[:\x00-\x1f]/.test(path) || path.split(/[\\/]/).some(part => part === '..'))) throw new Error('目录迁移别名路径无效');
      return { from: resolve(projectRoot, item.from), to: resolve(projectRoot, item.to) };
    }).sort((a, b) => b.from.length - a.from.length);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const flag of ['--campaign', '--workspace']) {
    const index = result.indexOf(flag);
    if (index < 0) continue;
    if (!result[index + 1] || result[index + 1].startsWith('--')) throw new Error(flag + '需要目录参数');
    const path = resolve(result[index + 1]), inside = (root, path) => { const local = relative(root, path); return !isAbsolute(local) && local !== '..' && !local.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')); };
    if (!oldRoots.some(root => inside(root, path))) continue;
    const alias = mappings.find(item => inside(item.from, path) && (flag === '--workspace' || !oldRoots.some(root => root.toLowerCase() === item.from.toLowerCase())));
    if (!alias) throw new Error('此旧存档入口尚未迁移，请先核对迁移报告或从平台主入口打开；未启动旧进度副本。');
    const mapped = resolve(alias.to, relative(alias.from, path));
    if (!existsSync(mapped)) throw new Error('此旧存档入口尚未迁移，请先核对迁移报告或从平台主入口打开；未启动旧进度副本。');
    result[index + 1] = mapped;
  }
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2), battle = args.some(value => ['--campaign', '--workspace'].includes(value));
    const entry = battle ? join(ROOT, '../战斗/launcher.mjs') : join(ROOT, 'launcher.mjs');
    const result = spawnSync(process.execPath, [entry, ...(battle ? resolveBattleArgs(args) : args)], { stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

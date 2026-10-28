import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
export function resolveBattleArgs(args, projectRoot = resolve(ROOT, '../..')) {
  const result = [...args], oldRoot = join(projectRoot, '存档'), newRoot = join(projectRoot, '资源/故事/Z/战役存档');
  for (const flag of ['--campaign', '--workspace']) {
    const index = result.indexOf(flag);
    if (index < 0) continue;
    if (!result[index + 1] || result[index + 1].startsWith('--')) throw new Error(flag + '需要目录参数');
    const path = resolve(result[index + 1]), local = relative(oldRoot, path);
    if (local === '..' || local.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(local)) continue;
    const mapped = resolve(newRoot, local);
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

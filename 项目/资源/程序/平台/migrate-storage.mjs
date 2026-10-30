import { createHash } from 'node:crypto';
import { lstat, realpath, readdir, mkdir, mkdtemp, open, writeFile, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const defaultProjectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const lockNames = new Set(['.workspace.lock', '.battle.lock']);
const runtimeDirectories = new Set(['.runtime', 'node_modules', '.cache', '.git', '.tools', 'cache', 'code cache', 'gpucache', 'shadercache', 'grshadercache', 'dawncache', 'crashpad', 'browsermetrics', 'browser', 'browser-profile', 'browser-profiles', '战斗窗口', '浏览器配置', '浏览器缓存', '缓存']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const pathKey = value => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
const portable = value => value.split(sep).join('/');
const absent = error => error.code === 'ENOENT';
const execute = promisify(execFile);
const knownNonNodeExecutables = new Set(['svchost.exe', 'services.exe', 'lsass.exe', 'wininit.exe', 'winlogon.exe', 'csrss.exe',
  'smss.exe', 'dwm.exe', 'conhost.exe', 'fontdrvhost.exe', 'sihost.exe', 'taskhostw.exe', 'explorer.exe',
  'powershell.exe', 'pwsh.exe', 'cmd.exe', 'tasklist.exe', 'notepad.exe', 'msedge.exe', 'chrome.exe', 'firefox.exe']);

export async function readProcessIdentity(pid) {
  if (process.platform !== 'win32') return { kind: 'unknown' };
  try {
    const { stdout } = await execute('tasklist.exe', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
      windowsHide: true, timeout: 3000, maxBuffer: 65536, encoding: 'utf8'
    });
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.trim().match(/^"((?:[^"]|"")*)","(\d+)"(?:,|$)/);
      if (!match || Number(match[2]) !== pid) continue;
      const executable = match[1].replaceAll('""', '"').toLowerCase();
      if (!executable || !/^[^\\/:\x00-\x1f]+\.exe$/i.test(executable)) return { kind: 'unknown' };
      // Unknown executable names can be renamed runtimes, so keep their locks protected.
      const kind = executable.includes('node') ? 'node' : knownNonNodeExecutables.has(executable) ? 'non-node' : 'unknown';
      return { kind, executable };
    }
  } catch { /* Unknown identity keeps the lock protected. */ }
  return { kind: 'unknown' };
}

function inside(root, candidate) {
  const suffix = relative(root, candidate);
  if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith('..' + sep)) throw new Error('迁移路径超出指定根目录');
  return candidate;
}

async function statOrNull(path) {
  try { return await lstat(path); } catch (error) { if (absent(error)) return null; throw error; }
}

async function plainRoot(path) {
  const status = await lstat(path);
  if (!status.isDirectory() || status.isSymbolicLink() || pathKey(await realpath(path)) !== pathKey(path)) throw new Error('根目录必须是实际目录，不能经符号链接或目录联接访问');
}

// Check every existing component, including a not-yet-created destination's parents.
async function guardedPath(root, candidate) {
  inside(root, candidate);
  await plainRoot(root);
  const parts = relative(root, candidate).split(sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    const status = await statOrNull(current);
    if (!status) break;
    if (status.isSymbolicLink() || pathKey(await realpath(current)) !== pathKey(current)) throw new Error('迁移路径含符号链接或目录联接，已拒绝');
    if (current !== candidate && !status.isDirectory()) throw new Error('迁移路径的父级不是目录');
  }
}

async function readPlain(root, path) {
  await guardedPath(root, path);
  const named = await lstat(path);
  if (!named.isFile()) throw new Error('迁移仅接受常规文件');
  const handle = await open(path, 'r');
  try {
    await guardedPath(root, path);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== named.ino || opened.dev !== named.dev) throw new Error('文件在读取前发生变化，已停止迁移');
    const bytes = await handle.readFile(), after = await handle.stat();
    await guardedPath(root, path);
    const latest = await lstat(path);
    if (opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || opened.ctimeMs !== after.ctimeMs || latest.ino !== opened.ino || latest.dev !== opened.dev) throw new Error('文件在读取期间发生变化，已停止迁移');
    return bytes;
  } finally { await handle.close(); }
}

async function livePid(pid, processIdentity) {
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return false; if (error.code !== 'EPERM' && error.code !== 'EACCES') throw new Error('无法确认存档锁的进程状态，已停止迁移'); }
  try { return (await processIdentity(pid))?.kind !== 'non-node'; }
  catch { return true; }
}

async function inspectLocks(projectRoot, treeRoot, processIdentity) {
  let staleLocks = 0;
  async function walk(directory) {
    await guardedPath(projectRoot, directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('存档树含符号链接或目录联接，已拒绝');
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!lockNames.has(entry.name.toLowerCase())) continue;
      const item = await lstat(path);
      if (!item.isFile() || item.size > 64) throw new Error('存档锁格式无效，无法确认是否正在使用');
      const raw = (await readPlain(projectRoot, path)).toString('utf8').trim();
      if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('存档锁格式无效，无法确认是否正在使用');
      if (await livePid(Number(raw), processIdentity)) throw new Error('检测到仍在使用或身份未明的存档锁；未停止任何进程，未开始复制');
      staleLocks++;
    }
  }
  await walk(treeRoot);
  return staleLocks;
}

async function inspectTree(projectRoot, treeRoot, processIdentity) {
  await guardedPath(projectRoot, treeRoot);
  const status = await statOrNull(treeRoot);
  const tree = { exists: !!status, files: [], directories: [], excluded: 0, staleLocks: 0 };
  if (!status) return tree;
  if (!status.isDirectory()) throw new Error('存档源或目标必须是目录');
  tree.staleLocks = await inspectLocks(projectRoot, treeRoot, processIdentity);
  async function walk(directory, suffix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name), local = join(suffix, entry.name), lower = entry.name.toLowerCase();
      // Excluded trees are never followed, so a runtime cache cannot lead outside the project.
      if (entry.isDirectory() && runtimeDirectories.has(lower)) { tree.excluded++; continue; }
      await guardedPath(projectRoot, path);
      const item = await lstat(path);
      if (item.isDirectory()) { tree.directories.push(local); await walk(path, local); continue; }
      if (!item.isFile()) throw new Error('存档树含非常规文件，已停止迁移');
      if (lockNames.has(lower)) {
        tree.excluded++; continue;
      }
      if (/\.(?:log|tmp|lock)$/i.test(entry.name)) { tree.excluded++; continue; }
      tree.files.push({ local, bytes: item.size });
    }
  }
  await walk(treeRoot);
  return tree;
}

async function hashedTree(projectRoot, treeRoot, tree) {
  for (const item of tree.files) {
    const bytes = await readPlain(projectRoot, join(treeRoot, item.local));
    item.bytes = bytes.length; item.sha256 = digest(bytes);
  }
  return tree;
}

function sameFiles(first, second) {
  const records = list => list.map(item => [portable(item.local), item.bytes, item.sha256]).sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(records(first.files)) === JSON.stringify(records(second.files));
}

async function exclusiveWrite(root, path, bytes) {
  await guardedPath(root, path);
  await mkdir(dirname(path), { recursive: true });
  await guardedPath(root, path);
  const handle = await open(path, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  await guardedPath(root, path);
}

export async function migrateStorage({ projectRoot = defaultProjectRoot, apply = false, processIdentity = readProcessIdentity } = {}) {
  projectRoot = resolve(projectRoot);
  await plainRoot(projectRoot);
  if (apply) {
    let marker;
    try { marker = JSON.parse(await readFile(join(projectRoot, '资源/故事/G/目录迁移.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (marker?.version === 2) throw new Error('项目已使用新版两目录布局；拒绝旧迁移器重新建立过时存档树。请使用开发记录中的目录重整工具。');
  }
  const workspaceRoot = dirname(projectRoot), source = inside(projectRoot, join(projectRoot, '存档'));
  const target = inside(projectRoot, join(projectRoot, '资源', '故事', 'Z', '战役存档'));
  // Both trees are fully checked for active locks before any content is hashed or copied.
  const sourceTree = await inspectTree(projectRoot, source, processIdentity), targetTree = await inspectTree(projectRoot, target, processIdentity);
  await hashedTree(projectRoot, source, sourceTree); await hashedTree(projectRoot, target, targetTree);
  const sourceFiles = new Map(sourceTree.files.map(item => [portable(item.local), item]));
  const targetFiles = new Map(targetTree.files.map(item => [portable(item.local), item]));
  const sourceDirectories = new Set(sourceTree.directories.map(portable));
  for (const local of targetTree.directories) if (!sourceDirectories.has(portable(local))) throw new Error('目标已有不同或额外目录；未覆盖任何内容');
  for (const [key, item] of targetFiles) {
    const original = sourceFiles.get(key);
    if (!original || item.sha256 !== original.sha256 || item.bytes !== original.bytes) throw new Error('目标已有不同或额外文件；未覆盖任何内容');
  }
  const toCopy = sourceTree.files.filter(item => !targetFiles.has(portable(item.local)));
  const summary = { schemaVersion: 1, mode: apply ? 'apply' : 'dry-run', status: sourceTree.exists ? 'planned' : 'source-missing',
    source: '存档', target: '资源/故事/Z/战役存档', counts: { files: sourceTree.files.length, directories: sourceTree.directories.length,
      bytes: sourceTree.files.reduce((sum, item) => sum + item.bytes, 0), toCopy: toCopy.length, alreadyPresent: sourceTree.files.length - toCopy.length,
      excluded: sourceTree.excluded, staleLocks: sourceTree.staleLocks + targetTree.staleLocks }, backupDirectory: null, reportPath: null };
  if (!apply || !sourceTree.exists) return summary;
  if (!sourceTree.files.length && !sourceTree.directories.length) return { ...summary, status: 'empty-source' };
  if (!toCopy.length && sourceTree.directories.every(local => targetTree.directories.includes(local))) return { ...summary, status: 'already-migrated' };
  const backupBase = join(workspaceRoot, '开发记录', '临时', '迁移备份');
  await guardedPath(workspaceRoot, backupBase); await mkdir(backupBase, { recursive: true }); await guardedPath(workspaceRoot, backupBase);
  const backupDirectory = await mkdtemp(join(backupBase, 'storage-'));
  summary.backupDirectory = backupDirectory; summary.reportPath = join(backupDirectory, 'migration-report.json');
  const manifestPath = join(backupDirectory, 'manifest.json');
  const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), status: 'planned', source: summary.source, target: summary.target,
    files: toCopy.map(item => ({ source: portable(join('存档', item.local)), target: portable(join('资源/故事/Z/战役存档', item.local)),
      backup: portable(join('source', item.local)), bytes: item.bytes, sha256: item.sha256 })) };
  await exclusiveWrite(backupDirectory, manifestPath, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  try {
    for (const item of toCopy) {
      const bytes = await readPlain(projectRoot, join(source, item.local));
      if (digest(bytes) !== item.sha256) throw new Error('源文件已变化，原件及备份保留，未继续迁移');
      const backupPath = join(backupDirectory, 'source', item.local);
      await exclusiveWrite(backupDirectory, backupPath, bytes);
      if (digest(await readPlain(backupDirectory, backupPath)) !== item.sha256) throw new Error('迁移备份校验失败');
    }
    manifest.status = 'backed-up';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    const latestSource = await inspectTree(projectRoot, source, processIdentity), latestTarget = await inspectTree(projectRoot, target, processIdentity);
    await hashedTree(projectRoot, source, latestSource); await hashedTree(projectRoot, target, latestTarget);
    if (!sameFiles(sourceTree, latestSource) || !sameFiles(targetTree, latestTarget)) throw new Error('源或目标在备份期间变化，备份保留，未继续迁移');
    await guardedPath(projectRoot, target); await mkdir(target, { recursive: true });
    for (const local of sourceTree.directories) { const path = join(target, local); await guardedPath(projectRoot, path); await mkdir(path, { recursive: true }); }
    for (const item of toCopy) {
      const bytes = await readPlain(backupDirectory, join(backupDirectory, 'source', item.local));
      if (digest(bytes) !== item.sha256) throw new Error('备份在复制前变化，已停止迁移');
      await exclusiveWrite(projectRoot, join(target, item.local), bytes);
      if (digest(await readPlain(projectRoot, join(target, item.local))) !== item.sha256) throw new Error('目标文件复制后校验失败');
    }
    const verified = await hashedTree(projectRoot, target, await inspectTree(projectRoot, target, processIdentity));
    if (!sameFiles(sourceTree, verified)) throw new Error('目标整树校验失败，原件和备份保留');
    const finalSource = await hashedTree(projectRoot, source, await inspectTree(projectRoot, source, processIdentity));
    if (!sameFiles(sourceTree, finalSource)) throw new Error('源在复制期间发生变化，已保留备份和目标副本，未认定迁移完成');
    summary.status = 'migrated'; manifest.status = 'verified';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(summary.reportPath, JSON.stringify({ ...summary, verifiedFiles: manifest.files, completedAt: new Date().toISOString() }, null, 2) + '\n');
    return summary;
  } catch (error) {
    summary.status = 'failed';
    await writeFile(summary.reportPath, JSON.stringify({ ...summary, error: error.message, completedAt: new Date().toISOString() }, null, 2) + '\n').catch(() => {});
    error.report = summary; throw error;
  }
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  try {
    const args = process.argv.slice(2), rootIndex = args.indexOf('--project-root');
    if (args.includes('--help')) console.log('node migrate-storage.mjs [--project-root 项目目录] [--apply]\n默认仅核对和计数；--apply备份后复制，不删除旧存档。');
    else {
      if (rootIndex >= 0 && (!args[rootIndex + 1] || args[rootIndex + 1].startsWith('--'))) throw new Error('--project-root需要目录');
      const known = new Set(['--apply', '--project-root']);
      for (let index = 0; index < args.length; index++) { if (!known.has(args[index])) throw new Error('未知迁移参数'); if (args[index] === '--project-root') index++; }
      const report = await migrateStorage({ projectRoot: rootIndex < 0 ? defaultProjectRoot : args[rootIndex + 1], apply: args.includes('--apply') });
      console.log(JSON.stringify(report, null, 2));
    }
  } catch (error) { console.error(JSON.stringify({ status: 'refused-or-failed', error: error.message, ...(error.report ? { report: error.report } : {}) }, null, 2)); process.exitCode = 1; }
}

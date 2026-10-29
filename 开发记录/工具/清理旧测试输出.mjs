import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const categories = new Set(['本地窗口恢复检查','玻璃球菜单检查','操作格检查','存档迁移检查','单人试玩检查','地形检查',
  '独立平台检查','多团检查','方块地图检查','界面联机检查','局域网与触摸检查','库存界面检查','平台文件系统检查',
  '人工记录检查','设置测试','双右栏检查','文件刷新检查','物品结算检查','先攻检查','原生F11检查','战斗测试',
  '战斗浏览器检查','战斗流程检查','战斗平台桥检查','战斗启动检查','战斗投影检查','职业测试角色界面检查',
  '主持记录检查','资源界面检查','封面视角缓存检查','模组封面HTTP检查','平台对话检查','平台模组测试','平台首页检查','正式模组封面界面检查']);
const protectedName = name => name === '工作树' || name === '.git' || /^迭代-/.test(name) || /备份|核对|核验|来源|资料|对照/.test(name);
const keyPath = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
const within = (root, path) => {
  const rel = relative(keyPath(root), keyPath(path));
  return rel !== '' && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel);
};
const json = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/,''));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function generatedKind(name) {
  const profile = name.match(/^profile-\d{10,17}-(first|second)$/);
  if (profile) return `browser-profile-${profile[1]}`;
  return name.match(/^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)-[A-Za-z0-9]{6}$/)?.[1] || null;
}
async function verifiedRoot(value) {
  const root = resolve(value), stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || keyPath(await realpath(root)) !== keyPath(root))
    throw new Error('临时根必须为实际目录，不能经过链接：' + root);
  return root;
}
function validateCandidate(root, path) {
  const absolute = resolve(path);
  if (!within(root, absolute)) throw new Error('目标越过指定临时根。');
  const segments = relative(root, absolute).split(sep);
  if (segments.length !== 2 || !categories.has(segments[0]) || segments.some(protectedName) || !generatedKind(segments[1]))
    throw new Error('目标不是许可测试分类下的生成叶子目录。');
  return absolute;
}

async function snapshot(root, target) {
  const path = validateCandidate(root, target);
  if (keyPath(await realpath(path)) !== keyPath(path)) throw new Error('目录解析到链接或其他位置。');
  const entries = [], evidence = [];
  let files = 0, bytes = 0, directories = 0, newest = 0;
  async function walk(current, depth) {
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error('目录内含文件或目录链接，保留整棵目录。');
    if (!within(root, current)) throw new Error('子路径越界。');
    if (current !== path && stat.isDirectory() && protectedName(basename(current))) throw new Error('生成副本内含受保护目录，保留。');
    const rel = relative(path, current).split(sep).join('/');
    entries.push([rel, stat.isDirectory() ? 'directory' : 'file', stat.size, stat.mtimeMs]);
    newest = Math.max(newest, stat.mtimeMs);
    if (stat.isDirectory()) {
      directories++;
      const names = (await readdir(current)).sort();
      for (const name of names) await walk(join(current, name), depth + 1);
    } else if (stat.isFile()) {
      files++; bytes += stat.size;
      if (depth <= 3 && /^(?:result[^/]*|结果[^/]*|failure[^/]*|失败[^/]*|处理状态)\.json$/i.test(basename(current)) && stat.size < 4 * 1024 * 1024)
        evidence.push(current);
    } else throw new Error('含非普通文件，保留。');
  }
  await walk(path, 0);
  let verdict = 'unknown';
  for (const report of evidence) {
    try {
      const value = await json(report);
      const errors = ['errors','pageErrors','outside','failures'].some(key => Array.isArray(value[key]) && value[key].length > 0);
      if (errors || value.error || value.status === 'failed' || /failure|失败/.test(basename(report))) verdict = 'failed';
      else if (verdict !== 'failed' && (value.ok === true || value.status === 'passed' ||
        (Array.isArray(value.checks) && value.checks.length > 0 && (!value.errors || value.errors.length === 0)))) verdict = 'passed';
    } catch { /* Unreadable verdicts do not become proof of success. */ }
  }
  return { files, bytes, directories, newestMtimeMs: newest, fingerprint: digest(entries), verdict,
    evidence: evidence.map(item => relative(path, item).split(sep).join('/')) };
}

/** Read-only inventory. Only duplicated, old, generated leaves are proposed. */
export async function planCleanup({ roots, minAgeMinutes = 60, now = Date.now() } = {}) {
  if (!Array.isArray(roots) || !roots.length) throw new Error('请明确指定临时根。');
  if (!Number.isFinite(minAgeMinutes) || minAgeMinutes < 0) throw new Error('最小保留时间无效。');
  const result = { schemaVersion: 1, kind: 'generated-test-cleanup', createdAt: new Date(now).toISOString(),
    roots: [], minAgeMinutes, candidates: [], retained: [], skipped: [] };
  for (const requested of roots) {
    const root = await verifiedRoot(requested); result.roots.push(root);
    for (const top of (await readdir(root, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
      const categoryPath = join(root, top.name);
      if (!top.isDirectory() || protectedName(top.name) || !categories.has(top.name)) {
        result.skipped.push({ path: categoryPath, reason: '非许可测试分类或受保护内容；不递归。' }); continue;
      }
      const categoryStat = await lstat(categoryPath);
      if (categoryStat.isSymbolicLink() || keyPath(await realpath(categoryPath)) !== keyPath(categoryPath)) {
        result.skipped.push({ path: categoryPath, reason: '分类目录含链接；不递归。' }); continue;
      }
      const groups = new Map();
      for (const leaf of await readdir(categoryPath, { withFileTypes: true })) {
        const path = join(categoryPath, leaf.name), group = generatedKind(leaf.name);
        if (!leaf.isDirectory() || !group || protectedName(leaf.name)) {
          result.skipped.push({ path, reason: '保留独立报告、截图、工具、人工文件和不确定目录。' }); continue;
        }
        try {
          const detail = { root, path, category: top.name, group, ...await snapshot(root, path) };
          if (!groups.has(group)) groups.set(group, []); groups.get(group).push(detail);
        } catch (error) { result.skipped.push({ path, reason: error.message }); }
      }
      for (const values of groups.values()) {
        values.sort((a,b)=>b.newestMtimeMs-a.newestMtimeMs || b.path.localeCompare(a.path));
        const protectedSet = new Set([values[0]?.path, values.find(item=>item.verdict === 'passed')?.path,
          values.find(item=>item.verdict === 'failed')?.path]);
        for (const item of values) {
          if (protectedSet.has(item.path)) result.retained.push({ ...item, reason: '保留此类最新样本、最新成功或最近失败证据。' });
          else if (now - item.newestMtimeMs < minAgeMinutes * 60000) result.retained.push({ ...item, reason: '近期仍可能使用，保留。' });
          else result.candidates.push({ ...item, reason: '同类已有更新保留样本的旧生成副本。' });
        }
      }
    }
  }
  result.summary = { candidateDirectories: result.candidates.length, candidateFiles: sum(result.candidates, 'files'),
    candidateBytes: sum(result.candidates, 'bytes'), retainedDirectories: result.retained.length, skipped: result.skipped.length };
  return result;
}
const sum = (values, key) => values.reduce((total, value) => total + value[key], 0);

/** Applies an existing manifest after checking each absolute path, link, and metadata fingerprint again. */
export async function applyCleanup(plan) {
  if (plan?.schemaVersion !== 1 || plan?.kind !== 'generated-test-cleanup' || !Array.isArray(plan.candidates) || !Array.isArray(plan.roots))
    throw new Error('清理清单格式无效。');
  const roots = await Promise.all(plan.roots.map(verifiedRoot));
  const result = { schemaVersion: 1, kind: 'generated-test-cleanup-result', startedAt: new Date().toISOString(),
    sourceCreatedAt: plan.createdAt, deleted: [], partialDeletions: [], skipped: [] };
  for (const item of plan.candidates) {
    let checkedRoot, checkedTarget, checkedSnapshot;
    try {
      const root = roots.find(root => keyPath(root) === keyPath(item.root));
      if (!root) throw new Error('目标临时根未在本次清单中。');
      const target = validateCandidate(root, item.path), current = await snapshot(root, target);
      if (current.fingerprint !== item.fingerprint || current.files !== item.files || current.bytes !== item.bytes)
        throw new Error('清单后内容已变化，保留该目录。');
      checkedRoot = root; checkedTarget = target; checkedSnapshot = current;
      // target is an absolute, contained generated leaf; snapshot refused all descendant links.
      await rm(target, { recursive: true, force: false, maxRetries: 0 });
      result.deleted.push({ path: target, files: current.files, directories: current.directories, bytes: current.bytes });
    } catch (error) {
      result.skipped.push({ path: item.path, reason: error.message });
      if (checkedSnapshot) {
        try {
          const remaining = await snapshot(checkedRoot, checkedTarget);
          result.partialDeletions.push({ path: checkedTarget, files: Math.max(0,checkedSnapshot.files-remaining.files),
            bytes: Math.max(0,checkedSnapshot.bytes-remaining.bytes), directories: Math.max(0,checkedSnapshot.directories-remaining.directories) });
        } catch (remainingError) {
          if (remainingError.code === 'ENOENT') result.partialDeletions.push({ path: checkedTarget,
            files: checkedSnapshot.files, bytes: checkedSnapshot.bytes, directories: checkedSnapshot.directories });
        }
      }
    }
  }
  result.finishedAt = new Date().toISOString();
  result.summary = { deletedLeaves: result.deleted.length, deletedDirectories: sum([...result.deleted,...result.partialDeletions], 'directories'),
    deletedFiles: sum([...result.deleted,...result.partialDeletions], 'files'),
    deletedBytes: sum([...result.deleted,...result.partialDeletions], 'bytes'),
    partialLeaves: result.partialDeletions.filter(item=>item.files>0||item.directories>0).length, skipped: result.skipped.length };
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), roots = [];
  let apply = false, manifestPath, reportDirectory, minAgeMinutes = 60;
  for (let i=0;i<args.length;i++) {
    if (args[i] === '--root') roots.push(args[++i]);
    else if (args[i] === '--manifest') manifestPath = args[++i];
    else if (args[i] === '--report-dir') reportDirectory = args[++i];
    else if (args[i] === '--min-age-minutes') minAgeMinutes = Number(args[++i]);
    else if (args[i] === '--apply') apply = true;
    else throw new Error('未知参数：' + args[i]);
  }
  const defaultRoot = fileURLToPath(new URL('../临时/', import.meta.url));
  const runDate = new Date().toISOString().slice(0,10).replaceAll('-','');
  reportDirectory = resolve(reportDirectory || join(defaultRoot, '迭代-' + runDate, '开发记录清理'));
  await mkdir(reportDirectory, { recursive: true });
  if (apply) {
    if (!manifestPath) throw new Error('--apply必须读取已保存的--manifest；请先预览。');
    const result = await applyCleanup(await json(resolve(manifestPath)));
    const output = join(reportDirectory, '清理结果-' + Date.now() + '.json');
    await writeFile(output, JSON.stringify(result, null, 2)+'\n','utf8');
    process.stdout.write(JSON.stringify({ mode: 'apply', output, ...result.summary })+'\n');
  } else {
    const plan = await planCleanup({ roots: roots.length ? roots : [defaultRoot], minAgeMinutes });
    const output = join(reportDirectory, '清理清单-' + Date.now() + '.json');
    await writeFile(output, JSON.stringify(plan, null, 2)+'\n','utf8');
    process.stdout.write(JSON.stringify({ mode: 'dry-run', output, ...plan.summary })+'\n');
  }
}

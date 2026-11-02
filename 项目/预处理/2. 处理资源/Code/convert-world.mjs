import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, link, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceKinds = ['角色', 'NPC', '怪物', '地图', '故事', '规则', '物品'];
const additionalKinds = ['世界观', '世界地图'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = path => path.split(sep).join('/');
const safeName = text => String(text).normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').replace(/[. ]+$/, '').slice(0, 82) || '未命名';
const safeBody = text => String(text || '').replace(/\r\n?/g, '\n');
const encode = (meta, body) => '---\n' + JSON.stringify(meta, null, 2) + '\n---\n\n' + body.trim() + '\n';

export function worldCategory(ruleCategory) {
  if (/^monster(?:-|$)/.test(ruleCategory)) return '怪物图鉴';
  if (/^npc(?:-|$)/.test(ruleCategory)) return '人物';
  if (/^spell(?:-|$)/.test(ruleCategory)) return '法术';
  if (/^(?:class|subclass)(?:-|$)/.test(ruleCategory)) return '职业';
  if (/^species(?:-|$)/.test(ruleCategory)) return '种族';
  if (/^feat(?:-|$)/.test(ruleCategory)) return '专长';
  if (/^background(?:-|$)/.test(ruleCategory)) return '背景';
  if (/^(?:equipment|magic-item)(?:-|$)/.test(ruleCategory)) return '物品';
  return '规则';
}

export function worldTemplate(kind) {
  return encode({ id: 'example-replace-with-stable-id', name: '示例资源名称', kind, initial: 'A', aliases: [], tags: [], edition: { rulesFamily: 'unclassified', year: null },
    source: { collection: '自定义', path: '填写可核对来源', version: '待核对' }, data: {}, enabled: false, reviewStatus: 'candidate' },
  '# 示例资源名称\n\n将本文件复制为新的资源名称.md，再填写正文。平台会跳过名为“示例模版.md”的文件。\n\n## 填写方法\n\n- 将id改为独立且稳定的ID，不与其他资源重复。\n- name填写显示名称；kind须与当前分类目录名一致。\n- initial填写A到Z中的一个大写字母，供多选筛选。\n- source记录来源和版本；edition区分规则家族与出版年份。\n- data只放结构化补充字段，正文写在这份Markdown中。\n- 图片保存为本地文件，用相对路径引用，例如 ![图片说明](<图片/示例.png>)。\n\n## 来源和使用边界\n\n示例不代表规则已启用。enabled保持false，内容待核对；不要在此写入API密钥、玩家真实身份或私人进度。' +
  (kind === '世界观' ? '\n\n## 世界设定\n\n填写已经确认的世界事实。未知或建议内容单独标注。' : kind === '世界地图' ? '\n\n## 地图说明\n\n填写地图范围、地点与图片来源。地点编号和坐标须可核对，不猜测隐藏内容。' : ''));
}

export function worldDocument(value, { sourcePath, sourceSha256 }) {
  if (typeof value.id !== 'string' || !value.id || value.id.length > 160 || /[\\/\x00-\x1f]/.test(value.id) || ['__proto__', 'constructor', 'prototype'].includes(value.id)) throw new Error('来源资源ID无效：' + sourcePath);
  if (typeof value.name !== 'string' || !value.name.trim() || typeof value.content?.text !== 'string') throw new Error('来源缺少name或content.text：' + sourcePath);
  const kind = worldCategory(value.ruleCategory || ''), archive = sourcePath.replace(/\\/g, '/').split('/').at(-2);
  const initial = /^[A-Z]$/.test(value.initial || '') ? value.initial : /^[A-Z]$/.test(archive) ? archive : 'Z';
  const { id, name, edition, source, content, ...other } = value;
  const meta = { id, name, kind, initial, aliases: Array.isArray(value.aliases) ? value.aliases : [], tags: Array.isArray(value.tags) ? value.tags : [], edition: edition || { rulesFamily: 'unclassified', year: null }, source,
    data: { ...other, content: { ...content, text: undefined, context: undefined }, sidecar: { path: sourcePath, sha256: sourceSha256 }, mechanicalAutomation: false }, enabled: false, reviewStatus: 'candidate' };
  if (meta.data.availability) meta.data.availability = { ...meta.data.availability, enabled: false };
  const body = '# ' + safeBody(name) + '\n\n' + (content.context ? '## 背景描述\n\n' + safeBody(content.context) + '\n\n' : '') + '## 资料正文\n\n' + safeBody(content.text)
    + '\n\n## 来源与使用边界\n\n来源：' + safeBody(source.book || source.collection) + (source.entryTitle ? ' · ' + safeBody(source.entryTitle) : '')
    + '\n\n规则家族：' + safeBody(edition?.rulesFamily || '待核对') + '；出版年份：' + (edition?.year ?? '待核对')
    + '。本条为本机参考资料，仍待内容核对；收录不代表启用，不自动换算旧版规则或执行机械效果。\n\n原JSON机械侧车保持原样；本MD不保存某个团的受伤、状态、消耗或故事进度。';
  const path = '资源/' + kind + '/' + safeName(name) + '--' + hash(id).slice(0, 12) + '.md';
  return { id, kind, path, content: encode(meta, body) };
}

async function checked(root, path, { missing = false } = {}) {
  const target = resolve(root, path), inside = relative(root, target);
  if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) throw new Error('路径越出项目：' + path);
  let cursor = root;
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('项目根须为普通目录。');
  for (const part of inside.split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    const info = await lstat(cursor).catch(error => { if (missing && error.code === 'ENOENT') return null; throw error; });
    if (!info) break;
    if (info.isSymbolicLink() || info.isFile() && info.nlink > 1) throw new Error('拒绝链接路径：' + path);
  }
  return target;
}

async function existing(root, path) {
  const target = await checked(root, path, { missing: true });
  try {
    const info = await lstat(target);
    if (!info.isFile()) throw new Error('目标被非文件占用：' + path);
    return await readFile(target);
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function planWorldConversion({ projectRoot, expectedCount } = {}) {
  const root = resolve(projectRoot), sources = [], outputs = [], conflicts = [], seenIds = new Map(), seenTargets = new Map(), counts = {};
  async function scan(path) {
    let entries;
    try { entries = await readdir(await checked(root, path), { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new Error('来源目录包含链接：' + child);
      if (entry.isDirectory()) { await scan(child); continue; }
      if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
      const bytes = await readFile(await checked(root, child)), sourceSha256 = hash(bytes);
      let value;
      try { value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { throw new Error('来源JSON损坏，未写入任何结果：' + child); }
      if (value.source?.collection !== '5E不全书') continue;
      if (seenIds.has(value.id)) { conflicts.push({ path: child, reason: '来源ID重复', relatedPath: seenIds.get(value.id) }); continue; }
      seenIds.set(value.id, child);
      const output = worldDocument(value, { sourcePath: child, sourceSha256 });
      sources.push({ path: child, sha256: sourceSha256 }); outputs.push(output); counts[output.kind] = (counts[output.kind] || 0) + 1;
    }
  }
  for (const kind of sourceKinds) await scan('资源/' + kind);
  if (expectedCount !== undefined && sources.length !== expectedCount) throw new Error('来源数量与预期不符：' + sources.length + '，预期' + expectedCount + '。');
  for (const kind of [...new Set([...Object.keys(counts), ...additionalKinds])].sort()) outputs.push({ kind, path: '资源/' + kind + '/示例模版.md', content: worldTemplate(kind), template: true });
  for (const output of outputs) {
    const key = output.path.normalize('NFC').toLocaleLowerCase();
    if (seenTargets.has(key)) { conflicts.push({ path: output.path, reason: '目标路径重名', relatedId: seenTargets.get(key) }); continue; }
    seenTargets.set(key, output.id || 'template');
    const bytes = await existing(root, output.path);
    output.sha256 = hash(output.content); output.status = bytes ? hash(bytes) === output.sha256 ? 'skip' : 'conflict' : 'create';
    if (output.status === 'conflict') conflicts.push({ path: output.path, reason: '目标已有不同内容；保留原文件，不覆盖用户修改' });
  }
  const sourceDigest = hash(sources.map(entry => entry.path + '\0' + entry.sha256).join('\n'));
  return { schemaVersion: 1, root, sourceCount: sources.length, counts, sourceDigest, sources, outputs, conflicts, canApply: conflicts.length === 0 };
}

export function conversionReport(plan) {
  return { schemaVersion: plan.schemaVersion, sourceCount: plan.sourceCount, counts: plan.counts, sourceDigest: plan.sourceDigest, canApply: plan.canApply, conflicts: plan.conflicts,
    createCount: plan.outputs.filter(entry => entry.status === 'create').length, skipCount: plan.outputs.filter(entry => entry.status === 'skip').length, templateCount: plan.outputs.filter(entry => entry.template).length,
    sources: plan.sources, outputs: plan.outputs.map(({ content, ...entry }) => entry) };
}

export async function applyWorldConversion(plan) {
  if (!plan.canApply || plan.conflicts.length) throw new Error('预检发现冲突，未写入任何结果。');
  async function verifySources() {
    for (const source of plan.sources) if (hash(await readFile(await checked(plan.root, source.path))) !== source.sha256) throw new Error('来源在预检后发生变化，已停止：' + source.path);
  }
  await verifySources();
  for (const output of plan.outputs) {
    const bytes = await existing(plan.root, output.path);
    if (bytes && hash(bytes) !== output.sha256) throw new Error('目标在预检后发生变化，未覆盖：' + output.path);
  }
  let created = 0, skipped = 0;
  for (const output of plan.outputs) {
    const bytes = await existing(plan.root, output.path);
    if (bytes) { skipped++; continue; }
    const target = await checked(plan.root, output.path, { missing: true });
    await mkdir(dirname(target), { recursive: true }); await checked(plan.root, output.path, { missing: true });
    const temporary = target + '.' + randomUUID() + '.tmp';
    let handle;
    try {
      handle = await open(temporary, 'wx'); await handle.writeFile(output.content); await handle.sync(); await handle.close(); handle = null;
      await checked(plan.root, output.path, { missing: true });
      try { await link(temporary, target); created++; } catch (error) {
        if (error.code !== 'EEXIST' || hash(await readFile(await checked(plan.root, output.path))) !== output.sha256) throw error;
        skipped++;
      }
    } finally { await handle?.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  await verifySources();
  for (const output of plan.outputs) if (hash(await readFile(await checked(plan.root, output.path))) !== output.sha256) throw new Error('派生文件摘要核对失败：' + output.path);
  return { ...conversionReport(plan), created, skipped, verifiedSourceCount: plan.sources.length, verifiedOutputCount: plan.outputs.length };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), option = key => { const index = args.indexOf(key); return index >= 0 ? args[index + 1] : undefined; };
  const projectRoot = option('--project') || fileURLToPath(new URL('../../../', import.meta.url));
  const expected = option('--expect-count'), expectedCount = expected === undefined ? undefined : Number(expected);
  if (expected !== undefined && (!Number.isSafeInteger(expectedCount) || expectedCount < 0)) throw new Error('--expect-count须为非负整数。');
  const plan = await planWorldConversion({ projectRoot, expectedCount }), report = args.includes('--apply') ? await applyWorldConversion(plan) : conversionReport(plan);
  const reportPath = option('--report');
  if (reportPath) { const target = resolve(reportPath); await mkdir(dirname(target), { recursive: true }); await writeFile(target, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
  console.log(JSON.stringify({ ...report, sources: undefined, outputs: undefined }, null, 2));
  if (!report.canApply) process.exitCode = 1;
}

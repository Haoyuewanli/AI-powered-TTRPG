import { readFile, writeFile, mkdir, lstat, copyFile } from 'node:fs/promises';
import { resolve, relative, dirname, join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const name = text => String(text).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 100);
export const encodeResource = (metadata, body) => `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${body.trim()}\n`;
export function template(kind, moduleId = undefined) {
  return encodeResource({ id: 'example-replace-with-stable-id', name: '示例资源名称', kind, initial: 'A', ...(moduleId ? { moduleId } : {}), aliases: [], tags: [], source: { path: '原始资料相对路径', lines: [1, 2], version: 'unknown' }, reviewStatus: 'candidate', enabled: false }, '# 示例资源名称\n\n在这里填写可阅读的Markdown正文。\n\n## 来源和边界\n\n填写来源、规则年份及待核对事项。图片使用本地相对路径。');
}
export async function buildResources({ inputDirectory, mdPath, planPath, outputDirectory }) {
  const input = resolve(inputDirectory), output = resolve(outputDirectory);
  if (output === input || !relative(input, output).startsWith('..') && !isAbsolute(relative(input, output))) throw new Error('输出必须在输入目录以外');
  try { await lstat(output); throw new Error('输出已存在，请使用新批次，原结果保持'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const sourcePath = resolve(input, mdPath), within = relative(input, sourcePath);
  if (isAbsolute(within) || within.startsWith('..') || !/\.md$/i.test(sourcePath)) throw new Error('只读取输入目录内的MD');
  const original = await readFile(sourcePath), lines = original.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  if (plan.sourceSha256 !== digest(original) || !plan.moduleId || !Array.isArray(plan.resources)) throw new Error('计划身份或原文摘要不匹配');
  const ids = new Set(), covered = new Set(), imageCopies = new Map(), records = [], missing = [];
  for (const entry of plan.resources) {
    if (!entry.id || ids.has(entry.id) || !entry.name || !entry.kind || !Number.isInteger(entry.start) || !Number.isInteger(entry.end) || entry.start < 1 || entry.end < entry.start || entry.end > lines.length) throw new Error('资源身份或行范围无效');
    ids.add(entry.id);
    for (let line = entry.start; line <= entry.end; line++) { if (covered.has(line)) throw new Error('资源来源行范围重叠'); covered.add(line); }
    const body = lines.slice(entry.start - 1, entry.end).join('\n').replace(/!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))\)/g, (whole, alt, angle, plain) => {
      const source = angle || plain;
      if ((plan.mapImages || []).includes(source)) return `〔地图图片由第一轮地图包提供：${alt}〕`;
      if (/^[a-z]+:|^[/\\]/i.test(source)) { missing.push({ id: entry.id, image: source, reason: '外部图片不自动下载' }); return whole; }
      const absolute = resolve(input, decodeURIComponent(source)), local = relative(input, absolute);
      if (isAbsolute(local) || local.startsWith('..')) throw new Error('图片越过输入目录');
      const target = '图片/' + digest(source).slice(0, 8) + '-' + name(source.split('/').pop()); imageCopies.set(absolute, target);
      return `![${alt}](<../${target}>)`;
    });
    const path = `资源/${name(entry.kind)}/${name(entry.name)}--${digest(entry.id).slice(0, 8)}.md`;
    const metadata = { id: entry.id, name: entry.name, kind: entry.kind, initial: entry.initial || 'Z', moduleId: plan.moduleId, aliases: entry.aliases || [], tags: entry.tags || [], source: { path: mdPath, lines: [entry.start, entry.end], sha256: plan.sourceSha256, version: plan.version }, edition: { rulesFamily: plan.rulesFamily || 'unclassified', year: plan.year || null }, reviewStatus: 'candidate', enabled: false, ...(entry.mapNodeIds?.length ? { mapNodeIds: entry.mapNodeIds } : {}) };
    records.push({ path, metadata, body });
  }
  await mkdir(output, { recursive: true });
  for (const record of records) { await mkdir(dirname(join(output, record.path)), { recursive: true }); await writeFile(join(output, record.path), encodeResource(record.metadata, record.body)); }
  let copiedImages = 0;
  for (const [source, path] of imageCopies) {
    try { const info = await lstat(source); if (!info.isFile() || info.isSymbolicLink()) throw new Error('图片不是普通文件'); await mkdir(dirname(join(output, '资源', path)), { recursive: true }); await copyFile(source, join(output, '资源', path)); copiedImages++; }
    catch (e) { missing.push({ image: relative(input, source), reason: e.code === 'ENOENT' ? '原始图片缺失' : e.message }); }
  }
  for (const kind of new Set(records.map(entry => entry.metadata.kind))) await writeFile(join(output, '资源', name(kind), '示例模版.md'), template(kind, plan.moduleId));
  const report = { schemaVersion: 1, moduleId: plan.moduleId, sourceSha256: plan.sourceSha256, resourceCount: records.length, imageCount: copiedImages, imageCandidates: imageCopies.size, coveredLines: covered.size, issues: missing, reviewStatus: 'candidate', resources: records.map(({ path, metadata }) => ({ id: metadata.id, path, source: metadata.source })) };
  await writeFile(join(output, '资源清单.json'), JSON.stringify(report, null, 2));
  await copyFile(planPath, join(output, '资源计划.json'));
  if (digest(await readFile(sourcePath)) !== plan.sourceSha256) throw new Error('构建期间原件发生变化');
  return report;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, key, index, all) => index % 2 === 0 ? [...pairs, [key.replace(/^--/, ''), all[index + 1]]] : pairs, []));
  const result = await buildResources({ inputDirectory: args.input, mdPath: args.md, planPath: args.plan, outputDirectory: args.out });
  console.log(JSON.stringify({ resources: result.resourceCount, images: result.imageCount, issues: result.issues.length }));
}

// 模组预处理包生成器：读取中间数据模型与输入盘点，生成最终包结构到阶段区。
// 只写本批新文件；所有包内项目相对路径按最终位置（由module-rel指定）计算。
// 语义内容全部来自中间数据；本脚本不做语义判断。
//
// 用法：
//   node 开发记录/工具/模组预处理/build-package.mjs \
//     --project-root <工作区/项目> --input-dir <输入目录绝对路径> \
//     --inventory <输入盘点.json> --model-dir <中间数据目录> \
//     --stage-dir <阶段区绝对路径> \
//     --module-rel <最终模组目录项目相对路径> --cover-name <封面文件名>

import { parseArgs } from 'node:util';
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { matchingSummary, validateReview } from './lib/review-contract.mjs';
import { sha256OfFile, sha256OfString, toProjectRel } from './lib/common.mjs';

const { values } = parseArgs({
  options: {
    'project-root': { type: 'string' },
    'input-dir': { type: 'string' },
    inventory: { type: 'string' },
    'model-dir': { type: 'string' },
    'stage-dir': { type: 'string' },
    'module-rel': { type: 'string' },
    'cover-name': { type: 'string' },
  },
});
for (const k of ['project-root', 'input-dir', 'inventory', 'model-dir', 'stage-dir', 'module-rel', 'cover-name']) {
  if (!values[k]) { console.error(`缺少参数 --${k}`); process.exit(2); }
}

const projectRoot = resolve(values['project-root']);
const inputDir = resolve(values['input-dir']);
const stageDir = resolve(values['stage-dir']);
const modelDir = resolve(values['model-dir']);
const moduleRel = values['module-rel'].replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const coverName = values['cover-name'];

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const inventory = readJson(resolve(values.inventory));
const meta = readJson(join(modelDir, 'model-meta.json'));
const chapters = meta.chapters;
const mdPath = meta.meta.inputMd;
const nodes = meta.nodeFiles.flatMap(file => readJson(join(modelDir, file)).nodes);
const mapsModel = readJson(join(modelDir, 'model-maps.json'));
const maps = mapsModel.maps;
const locationCandidates = mapsModel.locationCandidates;
const encModel = readJson(join(modelDir, 'model-encounters.json'));
const encounters = encModel.encounters;
const dialogues = encModel.dialogues;
const resModel = readJson(join(modelDir, 'model-resources.json'));
const newResources = resModel.newResources;
const matching = resModel.resourceMatching;
const resourceCandidates = resModel.resourceCandidates ?? [];
const coverageModel = readJson(join(modelDir, 'model-coverage.json'));
const imagesModel = readJson(join(modelDir, 'model-images.json'));

const pkgRel = (rel) => `${moduleRel}/${rel}`;
const stagePkg = join(stageDir, '包');
const stageRes = join(stageDir, '新资源');
const w = (rel, text) => {
  const abs = join(stagePkg, ...moduleRel.split('/'), ...rel.split('/'));
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, text, 'utf8');
  return abs;
};
const c = (srcAbs, rel) => {
  const abs = join(stagePkg, ...moduleRel.split('/'), ...rel.split('/'));
  mkdirSync(join(abs, '..'), { recursive: true });
  copyFileSync(srcAbs, abs);
  return abs;
};

for (const r of newResources) {
  if (typeof resModel.resourceBodies?.[r.id] !== 'string') throw new Error(`缺少资源正文: ${r.id}`);
}
const existingReview = join(stagePkg, moduleRel, '校验/人工审核.json');
if (existsSync(existingReview) && readJson(existingReview).entries?.length) {
  throw new Error('阶段区已有人工审核；请保留原目录，使用新阶段区生成后另行复核');
}

// ---------- 原始资料逐字节复制 ----------
const mdAbs = join(inputDir, basename(mdPath));
const imgAbsFromRel = (rel) => join(projectRoot, ...rel.split('/'));
c(mdAbs, '故事/原始资料/原文.md');
for (const img of inventory.images) {
  c(imgAbsFromRel(img.relativePath), `故事/原始资料/images/${img.name}`);
}

// ---------- 封面 ----------
const coverSrc = inventory.images.find((i) => i.name === meta.coverSourceName);
if (!coverSrc) { console.error('配置的封面候选图不存在'); process.exit(2); }
const coverAbs = c(imgAbsFromRel(coverSrc.relativePath), coverName);
const coverInfo = { name: coverName, sourceImage: coverSrc.name, sourceSha256: coverSrc.sha256, copySha256: sha256OfFile(coverAbs).sha256, note: '无用户现有封面，取首张MD图片作封面候选；JPG保留真实格式，未改后缀。' };

// ---------- 校验辅助数据 ----------
const chapterById = new Map(chapters.map((ch) => [ch.id, ch]));
const nodeById = new Map(nodes.map((n) => [n.id, n]));
const mapById = new Map(maps.map((m) => [m.id, m]));

const usedResourceIds = new Set();
for (const n of nodes) for (const r of n.resourceIds) usedResourceIds.add(r);
for (const m of maps) { if (m.resourceId) usedResourceIds.add(m.resourceId); for (const l of m.locations) for (const r of l.resourceIds) usedResourceIds.add(r); }
for (const e of encounters) { for (const p of e.participants) usedResourceIds.add(p.resourceId); for (const a of e.alternatives) usedResourceIds.add(a.resourceId); }
for (const d of dialogues) usedResourceIds.add(d.speakerResourceId);

const newResourceIds = new Set(newResources.map((r) => r.id));
const reusedIds = [...usedResourceIds].filter((id) => !newResourceIds.has(id));
const confirmedIds = new Set(matching.filter(e => e.contentStatus === 'confirmed').map(e => e.resourceId));
const resourceIds = [...new Set([...usedResourceIds])].filter(id => confirmedIds.has(id));
resourceIds.sort();

const warnings = meta.warnings ?? [];

// ---------- 预处理.json ----------
const preprocess = {
  schemaVersion: 1,
  kind: 'module-preprocess',
  preprocessContract: 'module-md-package-v1',
  promptVersion: 'r3',
  moduleId: meta.meta.moduleId,
  batchId: meta.meta.batchId,
  title: meta.meta.title,
  category: meta.meta.category,
  sourceVersion: meta.meta.sourceVersion,
  referenceBase: 'project',
  reviewStatus: 'candidate',
  source: {
    kind: 'markdown',
    relativePath: mdPath,
    referenceBase: 'project',
    sha256: inventory.md.sha256,
    pdfPath: null,
    pdfSha256: null,
    pageCount: null,
    pdfCompared: false,
  },
  cover: { path: pkgRel(coverName), referenceBase: 'project', reviewStatus: 'candidate' },
  chapters,
  maps,
  storyNodes: nodes,
  resourceIds,
  resourceCandidates,
  encounterTemplates: encounters,
  dialogueTemplatesPath: pkgRel('对话/模板.json'),
  encounterTemplatesPath: pkgRel('战斗/遭遇.json'),
  warnings,
  integration: { requiresDirectoryAdapter: true, liveImportTested: false },
  capabilities: meta.meta.capabilities,
  externalEvidence: meta.meta.externalEvidence,
  locationCandidates,
  rulesVersionIssues: meta.rulesVersionIssues ?? [],
};
const preprocessText = JSON.stringify(preprocess, null, 2);
const preprocessAbs = w('预处理.json', preprocessText);
const preprocessSha = sha256OfString(preprocessText);

// ---------- 对话/模板.json ----------
const dialogueTpl = {
  schemaVersion: 1,
  moduleId: meta.meta.moduleId,
  batchId: meta.meta.batchId,
  templates: dialogues,
};
w('对话/模板.json', JSON.stringify(dialogueTpl, null, 2));

// ---------- 战斗/遭遇.json ----------
const encounterTpl = {
  schemaVersion: 1,
  moduleId: meta.meta.moduleId,
  batchId: meta.meta.batchId,
  encounters,
};
w('战斗/遭遇.json', JSON.stringify(encounterTpl, null, 2));

// ---------- 故事/节点/*.md ----------
for (const n of nodes) {
  const ch = chapterById.get(n.chapterId);
  const lines = [];
  lines.push(`# ${n.title}`);
  lines.push('');
  lines.push(`> 节点ID：\`${n.id}\`　所属章节：${ch ? ch.title : n.chapterId}　类型：${n.type}${n.optional ? '　可选' : ''}`);
  lines.push(`> 来源：[原文.md](../原始资料/原文.md) 第 ${n.source.lines[0]}–${n.source.lines[1]} 行（标题：${n.source.heading}）　核对状态：${n.source.verification}`);
  lines.push('');
  lines.push('## 描述');
  lines.push('');
  lines.push(n.description);
  if (n.conditions.length) {
    lines.push('');
    lines.push('## 触发条件');
    for (const cnd of n.conditions) lines.push(`- ${cnd}`);
  }
  if (n.readAloud) {
    lines.push('');
    lines.push('## 朗读文本');
    lines.push('');
    lines.push('> ' + n.readAloud.text.split('\n').join('\n> '));
    lines.push('');
    lines.push(`（${n.readAloud.mode === 'quote' ? '原文引述' : '忠实改写'}，来源行 ${n.readAloud.source.lines[0]}–${n.readAloud.source.lines[1]}）`);
  }
  if (n.dmNotes) {
    lines.push('');
    lines.push('## 主持提示');
    lines.push('');
    lines.push(n.dmNotes);
  }
  if (n.mechanicsReferences.length) {
    lines.push('');
    lines.push('## 规则与检定参考');
    for (const m of n.mechanicsReferences) {
      lines.push(`- ${m.text}（来源行 ${m.source.lines[0]}–${m.source.lines[1]}）`);
    }
  }
  if (n.mapIds.length) {
    lines.push('');
    lines.push('## 关联地图');
    for (const mid of n.mapIds) {
      const mp = mapById.get(mid);
      lines.push(`- ${mid}${mp ? `（${mp.name}）` : ''}`);
    }
  }
  if (n.resourceIds.length) {
    lines.push('');
    lines.push('## 关联资源');
    for (const rid of n.resourceIds) lines.push(`- ${rid}`);
  }
  if (n.next.length) {
    lines.push('');
    lines.push('## 后续节点');
    for (const nx of n.next) {
      lines.push(`- ${nx.nodeId}${nx.condition ? `（条件：${nx.condition}）` : ''}`);
    }
  }
  w(`故事/节点/${n.id}.md`, lines.join('\n') + '\n');
}

// ---------- 故事/主持提示/*.md ----------
for (const m of maps) {
  for (const loc of m.locations) {
    const lines = [];
    lines.push(`# ${loc.label}`);
    lines.push('');
    lines.push(`> 地点ID：\`${loc.id}\`　所属地图：${m.id}（${m.name}）`);
    lines.push(`> 来源：第 ${loc.source.lines[0]}–${loc.source.lines[1]} 行（标题：${loc.source.heading}）`);
    lines.push('');
    lines.push('## 地点说明');
    lines.push('');
    lines.push(loc.description);
    if (loc.readAloud) {
      lines.push('');
      lines.push('## 朗读文本');
      lines.push('');
      lines.push('> ' + loc.readAloud.text.split('\n').join('\n> '));
    }
    if (loc.links.length) {
      lines.push('');
      lines.push('## 关联地点');
      for (const lk of loc.links) {
        lines.push(`- ${lk.mapId} / ${lk.locationId}（来源行 ${lk.source.lines[0]}–${lk.source.lines[1]}）`);
      }
    }
    if (loc.resourceIds.length) {
      lines.push('');
      lines.push('## 关联资源');
      for (const rid of loc.resourceIds) lines.push(`- ${rid}`);
    }
    w(`故事/主持提示/${loc.id}.md`, lines.join('\n') + '\n');
  }
}

// ---------- 故事/模组概览.md ----------
{
  const lines = [];
  lines.push(`# 模组概览：${meta.meta.title}`);
  lines.push('');
  lines.push(`- 模组ID：${meta.meta.moduleId}　来源版本：${meta.meta.sourceVersion}　分类：${meta.meta.category}　目标规则：${meta.meta.targetRules ?? '未指定'}（来源内容真实版本单独记录）`);
  lines.push('- 预处理提示词：r3　包契约：module-md-package-v1　审核状态：candidate（待人工审核）');
  lines.push(`- 输入：${mdPath}（SHA256 ${inventory.md.sha256.slice(0, 16)}…，${inventory.md.lineCount} 行基准，图片 ${inventory.imageCount} 张）`);
  lines.push('- PDF：未提供，pdfCompared=false，未与原书逐页核对');
  lines.push('');
  lines.push('## 能力与核对状态');
  lines.push('');
  lines.push(`- 文本读取记录：${JSON.stringify(meta.meta.capabilities ?? {})}`);
  lines.push('- 图像尺寸：取自输入盘点；内容核对状态见本批能力记录。');
  lines.push(...(meta.overviewCapabilityLines ?? []));
  lines.push('');
  lines.push('## 章节');
  for (const ch of chapters) {
    lines.push(`- ${ch.id}：${ch.title}（第 ${ch.source.lines[0]}–${ch.source.lines[1]} 行）`);
  }
  lines.push('');
  lines.push(`## 故事节点 ${nodes.length} 个`);
  for (const n of nodes) {
    lines.push(`- ${n.id}　${n.title}${n.optional ? '（可选）' : ''}`);
  }
  lines.push('');
  lines.push(`## 地图 ${maps.length} 项`);
  for (const m of maps) {
    lines.push(`- ${m.id}　${m.name}　状态：${m.mappingStatus}　受众：${m.audience}　${m.width}×${m.height}`);
  }
  lines.push('');
  lines.push('## 未确定归属的地点候选');
  for (const lc of locationCandidates) {
    lines.push(`- ${lc.id}　${lc.label}：${lc.reason}`);
  }
  lines.push('');
  lines.push(`## 遭遇模板 ${encounters.length} 项`);
  for (const e of encounters) {
    lines.push(`- ${e.id}　${e.name}${e.optional ? '（可选）' : ''}　地图：${e.mapId ?? 'null（待核对）'}`);
  }
  lines.push('');
  lines.push(`## 资源匹配：${JSON.stringify(matchingSummary(matching))}`);
  lines.push('');
  lines.push('## 使用提示');
  lines.push('');
  lines.push(...(meta.overviewUsageLines ?? []));
  w('故事/模组概览.md', lines.join('\n') + '\n');
}

// ---------- 校验/输入清单.json ----------
w('校验/输入清单.json', JSON.stringify({
  schemaVersion: 1,
  moduleId: meta.meta.moduleId,
  batchId: meta.meta.batchId,
  batchId: meta.meta.batchId,
  generatedAt: new Date().toISOString(),
  md: {
    relativePath: inventory.md.relativePath,
    bytes: inventory.md.bytes,
    sha256: inventory.md.sha256,
    lineCount: inventory.md.lineCount,
    nonEmptyLineCount: inventory.md.nonEmptyLineCount,
    encoding: 'UTF-8',
  },
  images: inventory.images.map((i) => ({
    name: i.name,
    relativePath: i.relativePath,
    bytes: i.bytes,
    sha256: i.sha256,
    width: i.width,
    height: i.height,
    format: i.format,
  })),
  imageCount: inventory.imageCount,
  unreferencedImages: inventory.unreferencedImages,
  missingReferences: inventory.missingReferences,
  pdf: { provided: false, pdfCompared: false },
}, null, 2));

// ---------- 校验/图像清单.json ----------
const imageEntries = imagesModel.images.map((im) => {
  const inv = inventory.images.find((i) => i.name === im.name);
  if (!inv) throw new Error(`图像清单引用未知图片 ${im.name}`);
  return {
    name: im.name,
    refLine: im.refLine,
    usage: im.usage,
    note: im.note,
    mapId: im.mapId,
    originalPath: inv.relativePath,
    packagePath: pkgRel(`故事/原始资料/images/${im.name}`),
    width: inv.width,
    height: inv.height,
    bytes: inv.bytes,
    sha256: inv.sha256,
    reviewStatus: 'candidate',
  };
});
w('校验/图像清单.json', JSON.stringify({
  schemaVersion: 1,
  moduleId: meta.meta.moduleId,
  batchId: meta.meta.batchId,
  generatedAt: new Date().toISOString(),
  totalImages: imageEntries.length,
  cover: coverInfo,
  images: imageEntries,
}, null, 2));

// ---------- 校验/覆盖清单.json ----------
{
  const nonEmpty = inventory.md.nonEmptyLines.map((l) => l.n);
  const coveredSet = new Set();
  for (const ce of coverageModel.coverage) {
    for (let i = ce.start; i <= ce.end; i++) coveredSet.add(i);
  }
  const covered = nonEmpty.filter((n) => coveredSet.has(n));
  const uncovered = nonEmpty.filter((n) => !coveredSet.has(n));
  const coveredCount = covered.length;
  w('校验/覆盖清单.json', JSON.stringify({
    schemaVersion: 1,
    moduleId: meta.meta.moduleId,
  batchId: meta.meta.batchId,
    generatedAt: new Date().toISOString(),
    totalNonEmptyLines: nonEmpty.length,
    coveredLines: coveredCount,
    coveragePercent: nonEmpty.length ? Math.round((coveredCount / nonEmpty.length) * 10000) / 100 : 0,
    uncoveredLines: uncovered,
    entries: coverageModel.coverage,
    note: '100%行覆盖只表明登记完整，不等于语义完全正确。',
  }, null, 2));
}

// ---------- 校验/资源匹配.json ----------
{
  const counts = {};
  for (const m of matching) counts[m.decision] = (counts[m.decision] ?? 0) + 1;
  w('校验/资源匹配.json', JSON.stringify({
    schemaVersion: 1,
    moduleId: meta.meta.moduleId,
  batchId: meta.meta.batchId,
    generatedAt: new Date().toISOString(),
    summary: matchingSummary(matching),
    entries: matching,
  }, null, 2));
}

// ---------- 校验/人工审核.json（初始为空） ----------
const reviewPath = join(stagePkg, moduleRel, '校验/人工审核.json');
if (existsSync(reviewPath)) {
  validateReview(readJson(reviewPath), preprocess, preprocessSha);
} else {
  w('校验/人工审核.json', JSON.stringify({ schemaVersion: 1, moduleId: preprocess.moduleId,
    batchId: preprocess.batchId, packageSha256: preprocessSha, entries: [] }, null, 2));
}

// ---------- 新资源 ----------
for (const r of newResources) {
  const dirRel = r.bodyPath.replace(/\/正文\.md$/, '');
  const dirAbs = join(stageRes, ...dirRel.split('/'));
  mkdirSync(dirAbs, { recursive: true });
  writeFileSync(join(dirAbs, '资源.json'), JSON.stringify(r, null, 2), 'utf8');
  const body = resModel.resourceBodies[r.id];
  if (typeof body !== 'string' || !body.trim()) throw new Error(`资源缺少本地正文: ${r.id}`);
  writeFileSync(join(dirAbs, '正文.md'), body, 'utf8');
}

// ---------- 输出统计 ----------
console.log(JSON.stringify({
  preprocessSha,
  nodeCount: nodes.length,
  mapCount: maps.length,
  locationCount: maps.reduce((s, m) => s + m.locations.length, 0),
  encounterCount: encounters.length,
  dialogueCount: dialogues.length,
  newResourceCount: newResources.length,
  resourceIdsCount: resourceIds.length,
  matching: matching.reduce((acc, m) => { acc[m.decision] = (acc[m.decision] ?? 0) + 1; return acc; }, {}),
  stagePkg,
  stageRes,
  cover: coverInfo,
}, null, 2));

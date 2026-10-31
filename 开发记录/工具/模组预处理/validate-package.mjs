// 模组预处理包独立校验器。
// 校验规则独立于生成器定义；接收参数化路径，不硬编码模组名称、内容或输出数量。
// 提供合成夹具自测：一个最小有效包必须通过；各负例必须被拒绝或正确列为待审核。
//
// 用法：
//   node 开发记录/工具/模组预处理/validate-package.mjs \
//     --project-root <工作区/项目> \
//     --package-dir <包根（阶段区包目录或最终包目录）绝对路径> \
//     --module-rel <最终模组目录项目相对路径> \
//     --inventory <输入盘点.json> --resources-index <资源索引.json> \
//     --stage-root <阶段区根（新资源与状态文件所在）绝对路径> \
//     --mode staging|final \
//     --write-results   （可选：写入 校验/检查结果.json 与 校验/检查报告.md）
//     --write-manifest  （可选：写入 校验/输出清单.json）
//   node ... validate-package.mjs --self-test   （运行合成夹具自测，不触碰真实文件）

import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fromProjectRel, imageSize, readJson, sha256OfFile, toProjectRel } from './lib/common.mjs';

import { packageDigest, validateReview, validateMatching, consoleData, consoleLinks, localLinkTarget, fileLink, cacheKey } from './lib/review-contract.mjs';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------- 常量 ----------------
const ALLOWED_NODE_TYPES = ['scene', 'information', 'choice', 'encounter', 'outcome'];
const ALLOWED_MAP_STATUS = ['confirmed', 'context-only', 'unresolved'];
const ALLOWED_AUDIENCE = ['dm', 'player', 'unreviewed'];
const ALLOWED_RULES_FAMILY = ['dnd-2014', 'dnd-2024', 'custom', 'unclassified'];
const ALLOWED_EVIDENCE_METHOD = ['direct-visual', 'external-visual', 'byte-identical-to-confirmed', 'context-only'];
const REQUIRED_RESOURCE_TYPES = ['角色', 'NPC', '怪物', '地图', '故事', '规则', '物品'];
const PLACEHOLDER_RE = /<[^<>\n]{1,40}>/;

function fail(checks, id, evidence) {
  checks.push({ id, status: 'fail', evidence });
  return false;
}
function pass(checks, id, evidence) {
  checks.push({ id, status: 'pass', evidence });
  return true;
}
function skip(checks, id, evidence) {
  checks.push({ id, status: 'skipped', evidence });
  return true;
}

// ---------------- 覆盖层路径解析 ----------------
// staging 模式：本批候选覆盖层（packageDir）+ 已有项目只读层（projectRoot）。
// final 模式：文件必须在 projectRoot 最终位置。
function makeResolver(projectRoot, packageDir, mode, stageResRoot) {
  return function resolvePkg(rel) {
    if (typeof rel !== 'string' || rel === '') return { abs: null, layer: null };
    if (mode === 'final') {
      const abs = fromProjectRel(projectRoot, rel);
      if (abs && existsSync(abs)) return { abs, layer: 'final' };
      return { abs, layer: null };
    }
    const abs = fromProjectRel(projectRoot, rel);
    if (!abs) return { abs: null, layer: null };
    // 包内相对文件：优先本批候选层
    const relPosix = rel.replace(/\\/g, '/');
    const staged = join(packageDir, ...relPosix.split('/'));
    if (existsSync(staged)) return { abs: staged, layer: 'staged' };
    // 新资源候选层（阶段区/新资源 下的资源/...）
    if (stageResRoot && relPosix.startsWith('资源/')) {
      const stagedRes = join(stageResRoot, ...relPosix.split('/'));
      if (existsSync(stagedRes)) return { abs: stagedRes, layer: 'staged-resource' };
    }
    if (existsSync(abs)) return { abs, layer: 'project' };
    return { abs, layer: null };
  };
}

function resolveOverlay(resolver, projectRoot, rel) {
  const r = resolver(rel);
  return r.abs && existsSync(r.abs) ? r.abs : null;
}

function isProjectRel(rel) {
  if (typeof rel !== 'string' || rel === '') return false;
  if (/^[A-Za-z]:/.test(rel) || rel.startsWith('/')) return false;
  const parts = rel.split('/');
  if (parts.some((p) => p === '..' || p === '')) return false;
  return true;
}

// ---------------- 检查函数 ----------------
function checkJsonStructure(ctx, pkg, checks) {
  const reqTop = ['schemaVersion', 'kind', 'preprocessContract', 'promptVersion', 'moduleId', 'title', 'category', 'sourceVersion', 'referenceBase', 'reviewStatus', 'source', 'cover', 'chapters', 'maps', 'storyNodes', 'resourceIds', 'resourceCandidates', 'encounterTemplates', 'dialogueTemplatesPath', 'encounterTemplatesPath', 'warnings', 'integration'];
  for (const k of reqTop) {
    if (!(k in pkg)) return fail(checks, 'json-top-fields', `预处理.json 缺少顶层字段 ${k}`);
  }
  if (pkg.schemaVersion !== 1) return fail(checks, 'json-top-fields', 'schemaVersion 必须为 1');
  if (pkg.kind !== 'module-preprocess') return fail(checks, 'json-top-fields', 'kind 必须为 module-preprocess');
  if (pkg.preprocessContract !== 'module-md-package-v1') return fail(checks, 'json-top-fields', 'preprocessContract 必须为 module-md-package-v1');
  if (pkg.promptVersion !== 'r3') return fail(checks, 'json-top-fields', 'promptVersion 必须为 r3');
  if (pkg.referenceBase !== 'project') return fail(checks, 'json-top-fields', 'referenceBase 必须为 project');
  if (pkg.reviewStatus !== 'candidate') return fail(checks, 'json-top-fields', 'reviewStatus 必须为 candidate');
  if (!pkg.title || !pkg.category || !pkg.sourceVersion) return fail(checks, 'json-top-fields', 'title/category/sourceVersion 不得为空');
  const allJson = ctx.jsonTexts.join('\n');
  if (PLACEHOLDER_RE.test(allJson)) {
    const m = PLACEHOLDER_RE.exec(allJson);
    return fail(checks, 'json-no-placeholders', `产物中存在占位模板文本: ${m[0]}`);
  }
  // source
  const s = pkg.source;
  if (!s || s.kind !== 'markdown' || !s.relativePath || s.referenceBase !== 'project' || typeof s.sha256 !== 'string' || s.sha256.length !== 64) {
    return fail(checks, 'json-source', 'source 字段不符合契约（kind=markdown、project相对路径、64位sha256）');
  }
  if (s.pdfCompared !== false) return fail(checks, 'json-source', '未提供PDF时 pdfCompared 必须为 false');
  // cover
  if (!pkg.cover || !pkg.cover.path || pkg.cover.referenceBase !== 'project') return fail(checks, 'json-cover', 'cover 字段不符合契约');
  if (!isProjectRel(pkg.cover.path)) return fail(checks, 'json-cover', `cover.path 不是合法的project相对路径: ${pkg.cover.path}`);
  // chapters
  if (!Array.isArray(pkg.chapters) || pkg.chapters.length === 0) return fail(checks, 'json-chapters', 'chapters 为空');
  const chapterIds = new Set(pkg.chapters.map((c) => c.id));
  if (chapterIds.size !== pkg.chapters.length) return fail(checks, 'json-chapters', 'chapters 存在重复ID');
  for (const c of pkg.chapters) {
    if (!c.id || !c.title || !c.source || !Array.isArray(c.source.lines) || c.source.lines.length !== 2) {
      return fail(checks, 'json-chapters', `chapter ${c.id} 缺 id/title/source.lines`);
    }
  }
  // storyNodes
  if (!Array.isArray(pkg.storyNodes) || pkg.storyNodes.length === 0) return fail(checks, 'json-story-nodes', 'storyNodes 为空');
  const nodeIds = new Set();
  for (const n of pkg.storyNodes) {
    if (!n.id || !n.title || !n.type || !n.description || !n.source || !Array.isArray(n.source.lines) || n.source.lines.length !== 2) {
      return fail(checks, 'json-story-nodes', `节点 ${n.id ?? '?'} 缺必填字段`);
    }
    if (nodeIds.has(n.id)) return fail(checks, 'json-id-unique', `节点ID重复: ${n.id}`);
    nodeIds.add(n.id);
    if (!ALLOWED_NODE_TYPES.includes(n.type)) return fail(checks, 'json-enums', `节点 ${n.id} 的 type 非法: ${n.type}`);
    if (!chapterIds.has(n.chapterId)) return fail(checks, 'json-chapter-refs', `节点 ${n.id} 引用不存在的 chapterId: ${n.chapterId}`);
    if (!('optional' in n) || !('conditions' in n) || !Array.isArray(n.next) || !('dmNotes' in n) || !('mechanicsReferences' in n)) {
      return fail(checks, 'json-story-nodes', `节点 ${n.id} 缺 optional/conditions/next/dmNotes/mechanicsReferences 字段`);
    }
    if (n.readAloud !== null) {
      if (!n.readAloud.text || !['quote', 'paraphrase'].includes(n.readAloud.mode) || !n.readAloud.source) {
        return fail(checks, 'json-story-nodes', `节点 ${n.id} 的 readAloud 格式不符`);
      }
    }
    for (const nx of n.next) {
      if (!nx.nodeId || !nodeIds.has(nx.nodeId) && !pkg.storyNodes.some((x) => x.id === nx.nodeId)) {
        // next 指向本包内节点；允许前置引用，后续统一检查
      }
    }
    for (const m of n.mechanicsReferences) {
      if (!m.text || !m.source) return fail(checks, 'json-story-nodes', `节点 ${n.id} 的 mechanicsReferences 缺 text/source`);
    }
  }
  for (const n of pkg.storyNodes) {
    for (const nx of n.next) {
      if (!nodeIds.has(nx.nodeId)) return fail(checks, 'json-refs', `节点 ${n.id} 的 next 引用不存在的节点: ${nx.nodeId}`);
      if (!nx.source) return fail(checks, 'json-refs', `节点 ${n.id} 的 next 项缺 source`);
    }
    for (const mid of n.mapIds) {
      if (!pkg.maps.some((m) => m.id === mid)) return fail(checks, 'json-refs', `节点 ${n.id} 引用不存在的 mapId: ${mid}`);
    }
    for (const rid of n.resourceIds) {
      if (!pkg.resourceIds.includes(rid)) return fail(checks, 'json-refs', `节点 ${n.id} 引用不在 resourceIds 中的资源: ${rid}`);
    }
  }
  // maps
  if (!Array.isArray(pkg.maps)) return fail(checks, 'json-maps', 'maps 不是数组');
  const mapIds = new Set();
  for (const m of pkg.maps) {
    if (!m.id || !('resourceId' in m) || !m.name || !('proposedName' in m) || !m.mappingStatus || !Array.isArray(m.mappingEvidence) || !m.path || !m.originalPath || !m.referenceBase || !m.audience || !('width' in m) || !('height' in m) || !m.source || !m.reviewStatus || !Array.isArray(m.locations)) {
      return fail(checks, 'json-maps', `地图 ${m.id ?? '?'} 缺必填字段`);
    }
    if (mapIds.has(m.id)) return fail(checks, 'json-id-unique', `地图ID重复: ${m.id}`);
    mapIds.add(m.id);
    if (!ALLOWED_MAP_STATUS.includes(m.mappingStatus)) return fail(checks, 'json-enums', `地图 ${m.id} 的 mappingStatus 非法: ${m.mappingStatus}`);
    if (!ALLOWED_AUDIENCE.includes(m.audience)) return fail(checks, 'json-enums', `地图 ${m.id} 的 audience 非法: ${m.audience}`);
    if (m.referenceBase !== 'project') return fail(checks, 'json-maps', `地图 ${m.id} 的 referenceBase 必须为 project`);
    if (!isProjectRel(m.path) || !isProjectRel(m.originalPath)) return fail(checks, 'json-paths', `地图 ${m.id} 的 path/originalPath 不是合法project相对路径`);
    if (m.resourceId !== null && !pkg.resourceIds.includes(m.resourceId)) {
      return fail(checks, 'json-refs', `地图 ${m.id} 引用不在 resourceIds 中的资源: ${m.resourceId}`);
    }
    for (const l of m.locations) {
      if (!l.id || !l.label || !l.description || !l.source || !('position' in l) || !Array.isArray(l.links) || !Array.isArray(l.resourceIds) || !('readAloud' in l)) {
        return fail(checks, 'json-maps', `地图 ${m.id} 的地点 ${l.id ?? '?'} 缺必填字段`);
      }
      for (const lk of l.links) {
        if (!lk.mapId || !lk.locationId || !lk.source) return fail(checks, 'json-maps', `地点 ${l.id} 的 links 项缺字段`);
      }
    }
  }
  // resourceIds 引用存在性（旧库或本批新资源，由 ctx 提供）
  for (const rid of pkg.resourceIds) {
    if (!ctx.knownResourceIds.has(rid)) return fail(checks, 'json-resource-refs', `resourceIds 中的 ${rid} 不在已有资源索引或本批新资源中`);
  }
  for (const rc of pkg.resourceCandidates) {
    if (!rc.resourceId || !ctx.knownResourceIds.has(rc.resourceId)) return fail(checks, 'json-resource-refs', `resourceCandidates 中的 ${rc.resourceId} 不是真实存在的资源`);
  }
  // encounterTemplates
  if (!Array.isArray(pkg.encounterTemplates)) return fail(checks, 'json-encounters', 'encounterTemplates 不是数组');
  const encIds = new Set();
  for (const e of pkg.encounterTemplates) {
    if (!e.id || !e.name || !e.description || !e.trigger || !('optional' in e) || !('mapId' in e) || !Array.isArray(e.participants) || !Array.isArray(e.alternatives) || !e.source || !e.reviewStatus) {
      return fail(checks, 'json-encounters', `遭遇 ${e.id ?? '?'} 缺必填字段`);
    }
    if (encIds.has(e.id)) return fail(checks, 'json-id-unique', `遭遇ID重复: ${e.id}`);
    encIds.add(e.id);
    if (e.mapId !== null && !mapIds.has(e.mapId)) return fail(checks, 'json-refs', `遭遇 ${e.id} 引用不存在的 mapId: ${e.mapId}`);
    for (const p of e.participants) {
      if (!p.resourceId || !('count' in p) || !('countCondition' in p) || !('note' in p)) return fail(checks, 'json-encounters', `遭遇 ${e.id} 的 participants 缺字段`);
      if (!ctx.knownResourceIds.has(p.resourceId)) return fail(checks, 'json-resource-refs', `遭遇 ${e.id} 引用不存在的资源: ${p.resourceId}`);
    }
    for (const a of e.alternatives) {
      if (!a.resourceId || !ctx.knownResourceIds.has(a.resourceId)) return fail(checks, 'json-resource-refs', `遭遇 ${e.id} 的 alternatives 引用不存在的资源: ${a.resourceId}`);
    }
  }
  return true;
}

function checkPathsAndFiles(ctx, pkg, checks) {
  const resolver = ctx.resolver;
  const missing = [];
  // source MD
  if (!resolveOverlay(resolver, ctx.projectRoot, pkg.source.relativePath)) {
    return fail(checks, 'paths-source', `源MD不存在: ${pkg.source.relativePath}`);
  }
  // cover
  if (!resolveOverlay(resolver, ctx.projectRoot, pkg.cover.path)) {
    missing.push(pkg.cover.path);
  }
  // dialogue/encounter template paths
  for (const p of [pkg.dialogueTemplatesPath, pkg.encounterTemplatesPath]) {
    if (!isProjectRel(p)) return fail(checks, 'json-paths', `模板路径非法: ${p}`);
    if (!resolveOverlay(resolver, ctx.projectRoot, p)) missing.push(p);
  }
  // maps images
  for (const m of pkg.maps) {
    if (!resolveOverlay(resolver, ctx.projectRoot, m.path)) missing.push(m.path);
    if (!resolveOverlay(resolver, ctx.projectRoot, m.originalPath)) missing.push(m.originalPath);
  }
  if (missing.length) return fail(checks, 'paths-files', `文件缺失: ${missing.join('; ')}`);
  return pass(checks, 'paths-files', `源MD、封面、模板与地图图像均存在（${ctx.mode} 模式覆盖层解析）`);
}

function checkJsonMirror(ctx, pkg, checks) {
  const resolver = ctx.resolver;
  const encAbs = resolveOverlay(resolver, ctx.projectRoot, pkg.encounterTemplatesPath);
  if (!encAbs) return fail(checks, 'encounter-mirror', '遭遇模板文件不存在');
  const encFile = readJson(encAbs);
  if (!encFile || !Array.isArray(encFile.encounters)) return fail(checks, 'encounter-mirror', '战斗/遭遇.json 结构不符（{schemaVersion,moduleId,encounters[]}）');
  const a = JSON.stringify(pkg.encounterTemplates);
  const b = JSON.stringify(encFile.encounters);
  if (a !== b) return fail(checks, 'encounter-mirror', '预处理.json 的 encounterTemplates 与 战斗/遭遇.json 的 encounters 不一致');
  const dlgAbs = resolveOverlay(resolver, ctx.projectRoot, pkg.dialogueTemplatesPath);
  if (!dlgAbs) return fail(checks, 'dialogue-file', '对话模板文件不存在');
  const dlgFile = readJson(dlgAbs);
  if (!dlgFile || !Array.isArray(dlgFile.templates)) return fail(checks, 'dialogue-file', '对话/模板.json 结构不符');
  return pass(checks, 'encounter-mirror', '遭遇镜像一致、对话模板结构合法');
}

function checkCoverage(ctx, pkg, checks) {
  const resolver = ctx.resolver;
  // 覆盖清单按包内固定位置：<module>/校验/覆盖清单.json
  const moduleDir = pkg.dialogueTemplatesPath.replace(/\/对话\/模板\.json$/, '');
  const covPath = `${moduleDir}/校验/覆盖清单.json`;
  const covAbs2 = resolveOverlay(resolver, ctx.projectRoot, covPath);
  if (!covAbs2) return fail(checks, 'coverage-file', `覆盖清单不存在: ${covPath}`);
  const cov = readJson(covAbs2);
  if (!cov || !Array.isArray(cov.entries)) return fail(checks, 'coverage-file', '覆盖清单结构不符');
  const nonEmpty = ctx.inventory.md.nonEmptyLines.map((l) => l.n);
  const covered = new Set();
  for (const ce of cov.entries) {
    if (!Number.isInteger(ce.start) || !Number.isInteger(ce.end) || ce.start > ce.end || ce.start < 1 || ce.end > ctx.inventory.md.lineCount) {
      return fail(checks, 'coverage-ranges', `覆盖区间非法: ${ce.start}-${ce.end}`);
    }
    for (let i = ce.start; i <= ce.end; i++) covered.add(i);
    // 目标真实存在
    const targetExists =
      (ce.destType === 'node' && pkg.storyNodes.some((n) => n.id === ce.destId)) ||
      (ce.destType === 'resource' && ctx.knownResourceIds.has(ce.destId)) ||
      (ce.destType === 'rules-reference' && (pkg.chapters.some((c) => c.id === ce.destId) || pkg.storyNodes.some((n) => n.id === ce.destId))) ||
      (ce.destType === 'toc-credits' && pkg.chapters.some((c) => c.id === ce.destId));
    if (!targetExists) return fail(checks, 'coverage-targets', `覆盖项目标不存在: ${ce.destType}/${ce.destId}（行 ${ce.start}-${ce.end}）`);
  }
  const uncovered = nonEmpty.filter((n) => !covered.has(n));
  if (uncovered.length) return fail(checks, 'coverage-full', `存在未登记的非空行: ${uncovered.slice(0, 30).join(',')}${uncovered.length > 30 ? '…' : ''} 共${uncovered.length}行`);
  const coveredNonEmpty = nonEmpty.filter((n) => covered.has(n)).length;
  if (cov.totalNonEmptyLines !== nonEmpty.length) return fail(checks, 'coverage-full', '覆盖清单 totalNonEmptyLines 与实际不符');
  if (cov.coveredLines !== coveredNonEmpty) return fail(checks, 'coverage-full', '覆盖清单 coveredLines 与实际不符');
  return pass(checks, 'coverage-full', `非空行 ${nonEmpty.length} 行全部登记（去重覆盖 ${coveredNonEmpty} 行），目标均存在`);
}

function checkChapterProducts(ctx, pkg, checks) {
  const resolver = ctx.resolver;
  const moduleDir = pkg.dialogueTemplatesPath.replace(/\/对话\/模板\.json$/, '');
  for (const ch of pkg.chapters) {
    const nodes = pkg.storyNodes.filter((n) => n.chapterId === ch.id);
    const nodeFiles = nodes.map((n) => `${moduleDir}/故事/节点/${n.id}.md`);
    for (const f of nodeFiles) {
      if (!resolveOverlay(resolver, ctx.projectRoot, f)) return fail(checks, 'chapter-products', `章节 ${ch.id} 的节点文件缺失: ${f}`);
    }
    // 每章抽查集合：首尾节点
    if (nodes.length) {
      for (const nid of [nodes[0].id, nodes[nodes.length - 1].id]) {
        if (!resolveOverlay(resolver, ctx.projectRoot, `${moduleDir}/故事/节点/${nid}.md`)) {
          return fail(checks, 'chapter-products', `章节 ${ch.id} 首尾节点文件缺失: ${nid}`);
        }
      }
    }
  }
  // 主持提示文件
  for (const m of pkg.maps) {
    for (const l of m.locations) {
      const f = `${moduleDir}/故事/主持提示/${l.id}.md`;
      if (!resolveOverlay(resolver, ctx.projectRoot, f)) return fail(checks, 'chapter-products', `主持提示文件缺失: ${f}`);
    }
  }
  const overviewAbs = resolveOverlay(resolver, ctx.projectRoot, `${moduleDir}/故事/模组概览.md`);
  if (!overviewAbs) return fail(checks, 'chapter-products', '模组概览.md 缺失');
  return pass(checks, 'chapter-products', `每章节点文件、主持提示与概览均存在（${pkg.chapters.length} 章）`);
}

function checkSampling(ctx, pkg, checks) {
  // 抽样集合：每章首尾节点 + 固定seed抽取≥10% + 全部分支/遭遇/跨图连接/版本疑点节点
  const seed = 20261030;
  const rnd = (n) => { let x = seed + n * 2654435761 % 4294967296; x = (x ^ (x >> 13)) * 1274126177 % 4294967296; return ((x ^ (x >> 16)) >>> 0) / 4294967296; };
  const byChapter = new Map();
  for (const n of pkg.storyNodes) {
    if (!byChapter.has(n.chapterId)) byChapter.set(n.chapterId, []);
    byChapter.get(n.chapterId).push(n);
  }
  const sample = new Set();
  for (const [chId, nodes] of byChapter) {
    sample.add(nodes[0].id);
    sample.add(nodes[nodes.length - 1].id);
  }
  const total = pkg.storyNodes.length;
  const want = Math.max(1, Math.ceil(total * 0.1));
  const ordered = [...pkg.storyNodes].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < ordered.length && sample.size < byChapter.size * 2 + want; i++) {
    if (rnd(i) < (want + 5) / total) sample.add(ordered[i].id);
  }
  for (const n of pkg.storyNodes) {
    if (n.next.length) sample.add(n.id);
    if (n.type === 'encounter') sample.add(n.id);
    if (n.mechanicsReferences.some((m) => /版本|2024|2014|校/.test(m.text + (n.dmNotes ?? '')))) sample.add(n.id);
  }
  for (const m of pkg.maps) {
    if (m.locations.some((l) => l.links.length)) sample.add(`__map__${m.id}`);
  }
  const chapterSampled = new Set();
  for (const id of sample) {
    const n = pkg.storyNodes.find((x) => x.id === id);
    if (n) chapterSampled.add(n.chapterId);
  }
  for (const chId of byChapter.keys()) {
    if (!chapterSampled.has(chId)) return fail(checks, 'sampling', `章节 ${chId} 没有任何节点入选抽查集合`);
  }
  const pct = sample.size / total;
  if (pct < 0.1 && total >= 10) return fail(checks, 'sampling', `抽查比例不足10%: ${sample.size}/${total}`);
  ctx.sampleNodeIds = [...sample].filter((id) => !id.startsWith('__map__'));
  ctx.sampleMapIds = [...sample].filter((id) => id.startsWith('__map__')).map((id) => id.replace(/^__map__/, ''));
  return pass(checks, 'sampling', `抽查集合 ${sample.size} 项（每章首尾+分支+遭遇+跨图连接+版本疑点），每章均有入选`);
}

function checkMapEvidence(ctx, pkg, checks) {
  const resolver = ctx.resolver;
  for (const m of pkg.maps) {
    // 尺寸来自实际文件
    const abs = resolveOverlay(resolver, ctx.projectRoot, m.path);
    if (abs) {
      const sz = imageSize(abs);
      if (!sz.width || !sz.height) return fail(checks, 'map-dims', `地图 ${m.id} 无法读取尺寸`);
      if (sz.width !== m.width || sz.height !== m.height) {
        return fail(checks, 'map-dims', `地图 ${m.id} 尺寸与文件不符: 声明 ${m.width}x${m.height} 实际 ${sz.width}x${sz.height}`);
      }
    }
    if (m.width <= 0 || m.height <= 0) return fail(checks, 'map-dims', `地图 ${m.id} 的 width/height 必须为正整数`);
    // confirmed 必须有合格证据
    if (m.mappingStatus === 'confirmed') {
      const okEvidence = m.mappingEvidence.filter((e) => ['direct-visual', 'external-visual', 'byte-identical-to-confirmed'].includes(e.method));
      if (!okEvidence.length) {
        return fail(checks, 'map-evidence', `地图 ${m.id} 为 confirmed 但没有合格证据方法（direct-visual/external-visual/byte-identical-to-confirmed）`);
      }
      // external-visual 证据必须能核实摘要
      for (const e of okEvidence) {
        if (e.method === 'external-visual') {
          const ext = ctx.externalEvidence;
          if (!ext || ext.shaMatch !== true) return fail(checks, 'map-evidence', `地图 ${m.id} 使用 external-visual 证据但参数中的外部证据摘要未匹配`);
          const fileAbs = resolveOverlay(resolver, ctx.projectRoot, m.path);
          if (!fileAbs) return fail(checks, 'map-evidence', `地图 ${m.id} 图像文件不存在，无法核实外部证据`);
          const { sha256 } = sha256OfFile(fileAbs);
          if (sha256 !== ext.verifiedSha256) return fail(checks, 'map-evidence', `地图 ${m.id} 的图像摘要与外部证据摘要不一致`);
        }
      }
    }
    for (const e of m.mappingEvidence) {
      if (!e.method || !e.note || !e.source) return fail(checks, 'map-evidence', `地图 ${m.id} 的证据项缺 method/note/source`);
    }
    // 未确认地图不得带确定坐标：position 全 null（无视觉证据）
    for (const l of m.locations) {
      if (l.position !== null) {
        return fail(checks, 'map-coords', `地图 ${m.id} 的地点 ${l.id} 带有坐标但没有视觉证据`);
      }
    }
  }
  return pass(checks, 'map-evidence', `地图证据与尺寸检查通过（${pkg.maps.length} 项；无视觉证据不产生坐标）`);
}

function checkNewResources(ctx, pkg, checks) {
  const resolver = ctx.resolver;
  for (const rid of pkg.resourceIds) {
    if (!ctx.newResourcesById.has(rid)) continue;
    const r = ctx.newResourcesById.get(rid);
    const fileAbs = resolveOverlay(resolver, ctx.projectRoot, r.bodyPath);
    if (!fileAbs) return fail(checks, 'new-resources', `新资源 ${rid} 的正文文件不存在: ${r.bodyPath}`);
    const jsonRel = r.bodyPath.replace(/\/正文\.md$/, '/资源.json');
    const jsonAbs = resolveOverlay(resolver, ctx.projectRoot, jsonRel);
    if (!jsonAbs) return fail(checks, 'new-resources', `新资源 ${rid} 的 资源.json 不存在: ${jsonRel}`);
    const resJson = readJson(jsonAbs);
    if (!resJson || resJson.id !== rid) return fail(checks, 'new-resources', `新资源 ${rid} 的 资源.json 与实体不符`);
    if (!REQUIRED_RESOURCE_TYPES.includes(r.resourceType)) return fail(checks, 'new-resources', `新资源 ${rid} 的 resourceType 非法: ${r.resourceType}`);
    if (!ALLOWED_RULES_FAMILY.includes(r.edition.rulesFamily)) return fail(checks, 'json-enums', `新资源 ${rid} 的 rulesFamily 非法: ${r.edition.rulesFamily}`);
    if (!r.edition.evidence) return fail(checks, 'new-resources', `新资源 ${rid} 的 edition.evidence 为空`);
    if (r.availability.enabled !== false) return fail(checks, 'new-resources', `新资源 ${rid} 必须未启用 (enabled=false)`);
    if (r.availability.requiresDmApproval !== true) return fail(checks, 'new-resources', `新资源 ${rid} 必须待DM批准 (requiresDmApproval=true)`);
    if (r.reviewStatus !== 'candidate') return fail(checks, 'new-resources', `新资源 ${rid} 的 reviewStatus 必须为 candidate`);
    if (!Array.isArray(r.moduleIds) || !r.moduleIds.includes(pkg.moduleId)) return fail(checks, 'new-resources', `新资源 ${rid} 的 moduleIds 必须包含 ${pkg.moduleId}`);
    if (!r.source || !Array.isArray(r.source.lines)) return fail(checks, 'new-resources', `新资源 ${rid} 缺 source.lines`);
  }
  return pass(checks, 'new-resources', `新资源 ${ctx.newResourcesById.size} 项均未启用、待DM批准、字段合法`);
}

function checkManifests(ctx, pkg, checks) {
  const resolver = ctx.resolver;
  const moduleDir = pkg.dialogueTemplatesPath.replace(/\/对话\/模板\.json$/, '');
  for (const f of ['输入清单.json', '图像清单.json', '覆盖清单.json', '资源匹配.json', '人工审核.json']) {
    const p = `${moduleDir}/校验/${f}`;
    if (!resolveOverlay(resolver, ctx.projectRoot, p)) return fail(checks, 'manifests', `校验清单缺失: ${p}`);
  }
  // 输入清单与盘点一致
  const inputManifest = readJson(resolveOverlay(resolver, ctx.projectRoot, `${moduleDir}/校验/输入清单.json`));
  if (!inputManifest || inputManifest.md.sha256 !== ctx.inventory.md.sha256 || inputManifest.imageCount !== ctx.inventory.imageCount) {
    return fail(checks, 'manifests', '输入清单与盘点摘要不一致');
  }
  // 图像清单覆盖全部图片
  const imgManifest = readJson(resolveOverlay(resolver, ctx.projectRoot, `${moduleDir}/校验/图像清单.json`));
  if (!imgManifest || !Array.isArray(imgManifest.images) || imgManifest.images.length !== ctx.inventory.imageCount) {
    return fail(checks, 'manifests', '图像清单未覆盖全部输入图片');
  }
  for (const im of imgManifest.images) {
    const inv = ctx.inventory.images.find((i) => i.name === im.name);
    if (!inv || inv.sha256 !== im.sha256) return fail(checks, 'manifests', `图像清单中 ${im.name} 与盘点摘要不一致`);
    const abs = resolveOverlay(resolver, ctx.projectRoot, im.packagePath);
    if (!abs) return fail(checks, 'manifests', `图像清单中 ${im.name} 的包内副本缺失: ${im.packagePath}`);
    const { sha256 } = sha256OfFile(abs);
    if (sha256 !== inv.sha256) return fail(checks, 'manifests', `图像清单中 ${im.name} 的包内副本摘要与原图不一致（未逐字节复制）`);
  }
  // 资源匹配清单
  const matchManifest = readJson(resolveOverlay(resolver, ctx.projectRoot, `${moduleDir}/校验/资源匹配.json`));
  if (!matchManifest || !Array.isArray(matchManifest.entries)) return fail(checks, 'manifests', '资源匹配清单结构不符');
  try {
    ctx.matchingSummary = validateMatching(matchManifest, pkg, ctx.knownResourceIds);
    const pkgAbs = resolveOverlay(resolver, ctx.projectRoot, `${moduleDir}/预处理.json`);
    ctx.reviewSummary = validateReview(readJson(resolveOverlay(resolver, ctx.projectRoot, `${moduleDir}/校验/人工审核.json`)), pkg, packageDigest(readFileSync(pkgAbs)));
  } catch (e) { return fail(checks, 'manifests', e.message); }
  return pass(checks, 'manifests', `清单、复制图摘要、资源匹配统计与人工审核有效；已审核 ${ctx.reviewSummary.reviewed} 项`);
}

function checkReuseIntegrity(ctx, pkg, checks) {
  const resolver = ctx.resolver;
  // 输入前后摘要：盘点值与实际文件
  const mdAbs = resolveOverlay(resolver, ctx.projectRoot, ctx.inventory.md.relativePath);
  if (!mdAbs) return fail(checks, 'input-sha', '源MD文件不存在');
  const mdNow = sha256OfFile(mdAbs);
  if (mdNow.sha256 !== ctx.inventory.md.sha256) return fail(checks, 'input-sha', '源MD摘要与盘点不一致（输入被改动）');
  if (mdNow.bytes !== ctx.inventory.md.bytes) return fail(checks, 'input-sha', '源MD字节数与盘点不一致');
  for (const im of ctx.inventory.images) {
    const abs = resolveOverlay(resolver, ctx.projectRoot, im.relativePath);
    if (!abs) return fail(checks, 'input-sha', `源图不存在: ${im.name}`);
    const now = sha256OfFile(abs);
    if (now.sha256 !== im.sha256) return fail(checks, 'input-sha', `源图摘要与盘点不一致: ${im.name}`);
  }
  // 复用资源前后摘要：索引值与实际文件（JSON及附件）
  const mismatches = [];
  for (const rid of ctx.reusedIds) {
    const idx = ctx.resourceIndex.entries.find((e) => e.id === rid);
    if (!idx) { mismatches.push(`${rid}: 索引缺失`); continue; }
    const jsonAbs = resolveOverlay(resolver, ctx.projectRoot, idx.jsonPath);
    if (!jsonAbs) { mismatches.push(`${rid}: JSON不存在`); continue; }
    const now = sha256OfFile(jsonAbs);
    if (now.sha256 !== idx.jsonSha256) mismatches.push(`${rid}: JSON摘要变化`);
    for (const k of ['assetPath', 'originalAssetPath', 'bodyPath']) {
      const ap = idx[k];
      if (ap && typeof ap === 'string') {
        const aAbs = resolveOverlay(resolver, ctx.projectRoot, ap);
        if (!aAbs) { mismatches.push(`${rid}: 附件不存在 ${ap}`); continue; }
        const { sha256: aSha } = sha256OfFile(aAbs);
        const baseline = ctx.reuseAttachmentBaseline[ap];
        if (baseline === undefined) {
          ctx.reuseAttachmentBaseline[ap] = aSha; // 首次记录基线
        } else if (baseline !== aSha) {
          mismatches.push(`${rid}: 附件摘要变化 ${ap}`);
        }
      }
    }
  }
  if (mismatches.length) return fail(checks, 'reuse-sha', `复用资源前后摘要不一致: ${mismatches.join('; ')}`);
  return pass(checks, 'reuse-sha', `输入与 ${ctx.reusedIds.size} 项复用资源（JSON及附件）前后摘要一致`);
}

function computePendingHuman(pkg) {
  const pending = [];
  for (const m of pkg.maps) {
    if (m.mappingStatus === 'unresolved') pending.push({ kind: 'map', id: m.id, reason: `地图身份未确认（${m.name}），需人工视觉核对原图` });
    else if (m.mappingStatus === 'context-only' && m.audience === 'unreviewed') pending.push({ kind: 'map', id: m.id, reason: `地图仅上下文证据且受众未定（${m.name}），需人工核对图像与用途` });
    else if (m.mappingStatus === 'context-only') pending.push({ kind: 'map', id: m.id, reason: `地图身份仅上下文证据（${m.name}），图像内容未经视觉核对` });
    if (m.resourceId === null) pending.push({ kind: 'map-resource', id: m.id, reason: `地图无已确认的资源实体（${m.name}）` });
    for (const e of m.mappingEvidence) {
      if (e.method === 'external-visual') pending.push({ kind: 'map-evidence', id: m.id, reason: 'external-visual证据不确认玩家版/坐标/连通性，需人工复核' });
    }
  }
  for (const lc of pkg.locationCandidates ?? []) {
    pending.push({ kind: 'location', id: lc.id, reason: `地点未确定地图归属：${lc.label}（${lc.reason}）` });
  }
  for (const rc of pkg.resourceCandidates ?? []) {
    pending.push({ kind: 'resource', id: rc.resourceId, reason: `资源候选未绑定：${rc.name}（${rc.reason}）` });
  }
  for (const e of pkg.encounterTemplates) {
    if (e.mapId === null) pending.push({ kind: 'encounter', id: e.id, reason: `遭遇 ${e.name} 的 mapId 为 null（未证实对应地图）` });
  }
  for (const rv of pkg.rulesVersionIssues ?? []) {
    pending.push({ kind: 'rules-version', id: rv.id, reason: rv.note });
  }
  return pending;
}

function checkPendingAndConsole(ctx, pkg, checks) {
  const pending = computePendingHuman(pkg);
  const hasCandidates = pkg.maps.some((m) => m.mappingStatus !== 'confirmed') || (pkg.resourceCandidates ?? []).length > 0 || (pkg.locationCandidates ?? []).length > 0;
  if (hasCandidates && pending.length === 0) {
    return fail(checks, 'pending-human', '存在候选（未确认地图/资源候选/地点候选）但待人工项为0');
  }
  ctx.pendingHuman = pending;
  // 审核台
  const moduleDir = pkg.dialogueTemplatesPath.replace(/\/对话\/模板\.json$/, '');
  const consoleAbs = resolveOverlay(ctx.resolver, ctx.projectRoot, `${moduleDir}/校验/审核台.html`);
  if (!consoleAbs) return fail(checks, 'review-console', '审核台.html 不存在');
  const html = readFileSync(consoleAbs, 'utf8');
  if (html.length < 1000) return fail(checks, 'review-console', '审核台.html 内容异常短');
  if (/(?:href|src)\s*=\s*["'](?:https?:)?\/\//i.test(html)) return fail(checks, 'review-console', '审核台.html 含外部资源链接');
  if (/<script[^>]*src=/.test(html) || /<link[^>]*href=/.test(html)) return fail(checks, 'review-console', '审核台.html 含外部脚本/样式表引用（禁止CDN与fetch）');
  // 链接存在性（相对 校验/ 位置）
  const baseDir = dirname(consoleAbs);
  const links = [];
  const hrefRe = /(?:href|src)="([^"]+)"/g;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const t = m[1];
    if (t.startsWith('#') || t.startsWith('data:') || t.startsWith('http') || t.startsWith('mailto:')) continue;
    if (/['+\`]/.test(t)) continue; // 内嵌JS模板拼接产生的伪匹配，不作为静态链接
    links.push(t);
  }
  try {
    const data = consoleData(html);
    const pkgAbs = resolveOverlay(ctx.resolver, ctx.projectRoot, `${moduleDir}/预处理.json`);
    const digest = packageDigest(readFileSync(pkgAbs));
    if (data.moduleId !== pkg.moduleId || data.batchId !== pkg.batchId || data.packageSha256 !== digest || data.cacheKey !== cacheKey(pkg.moduleId, pkg.batchId, digest)) throw new Error('审核台身份、包摘要或缓存命名不符');
    const expected = pkg.maps.map(m => ({ id: m.id, imageLink: fileLink(ctx.projectRoot, `${moduleDir}/校验/审核台.html`, m.path) }));
    if (data.maps.length !== expected.length || expected.some(m => data.maps.find(d => d.id === m.id)?.imageLink !== m.imageLink)) throw new Error('审核台地图链接与资料包不一致');
    if (data.originalMdLink !== fileLink(ctx.projectRoot, `${moduleDir}/校验/审核台.html`, `${moduleDir}/故事/原始资料/原文.md`)) throw new Error('审核台原文链接与资料包不一致');
    if (data.nodes.length !== pkg.storyNodes.length || pkg.storyNodes.some(n => data.nodes.find(d => d.id === n.id)?.description !== n.description)) throw new Error('审核台节点缺失或描述不完整');
    const matching = readJson(resolveOverlay(ctx.resolver, ctx.projectRoot, `${moduleDir}/校验/资源匹配.json`));
    if (JSON.stringify(data.matchingSummary) !== JSON.stringify(ctx.matchingSummary) || data.matching.length !== matching.entries.length || matching.entries.some(e => data.matching.find(d => d.resourceId === e.resourceId)?.decision !== e.decision)) throw new Error('审核台资源统计或条目过期');
    links.push(...consoleLinks(data));
    for (const lk of links) localLinkTarget(ctx.projectRoot, `${moduleDir}/校验/审核台.html`, lk, rel => resolveOverlay(ctx.resolver, ctx.projectRoot, rel));
  } catch (e) { return fail(checks, 'review-console', e.message); }
  ctx.consoleChecked = true;
  return pass(checks, 'review-console', `审核台存在且 ${links.length} 个本地链接全部有效（浏览器交互未测）`);
}

function checkSensitive(ctx, pkg, checks) {
  const allJson = ctx.jsonTexts.join('\n');
  const badPatterns = [/sk-[A-Za-z0-9]{16,}/, /api[_-]?key\s*[:=]\s*["'][^"']+["']/, /BEGIN (RSA|OPENSSH|EC) PRIVATE KEY/, /password\s*[:=]\s*["'][^"']+["']/i];
  for (const p of badPatterns) {
    if (p.test(allJson)) return fail(checks, 'sensitive', `产物中疑似密钥/密码文本: ${String(p)}`);
  }
  return pass(checks, 'sensitive', '未发现密钥、令牌或密码类文本');
}

// ---------------- 主流程 ----------------
function runAll(ctx, pkg) {
  const checks = [];
  checkJsonStructure(ctx, pkg, checks);
  checkPathsAndFiles(ctx, pkg, checks);
  checkJsonMirror(ctx, pkg, checks);
  checkCoverage(ctx, pkg, checks);
  checkChapterProducts(ctx, pkg, checks);
  checkSampling(ctx, pkg, checks);
  checkMapEvidence(ctx, pkg, checks);
  checkNewResources(ctx, pkg, checks);
  checkManifests(ctx, pkg, checks);
  checkReuseIntegrity(ctx, pkg, checks);
  checkPendingAndConsole(ctx, pkg, checks);
  checkSensitive(ctx, pkg, checks);
  return checks;
}

function writeResults(ctx, pkg, checks, mode) {
  const moduleDir = pkg.dialogueTemplatesPath.replace(/\/对话\/模板\.json$/, '');
  const blocking = checks.filter((c) => c.status === 'fail');
  const pending = ctx.pendingHuman ?? [];
  const warnings = [
    ...(pkg.warnings ?? []),
    mode === 'staging' ? '阶段区校验：文件位于本批候选覆盖层，最终位置校验将在落盘后执行。' : '最终位置校验。',
    '本校验器检查文件与内嵌数据；浏览器交互证据另行记录。',
  ];
  const result = {
    schemaVersion: 1,
    moduleId: pkg.moduleId,
    mode,
    generatedAt: new Date().toISOString(),
    blockingErrors: blocking.map((c) => ({ id: c.id, evidence: c.evidence })),
    pendingHuman: pending,
    matchingSummary: ctx.matchingSummary,
    reviewSummary: ctx.reviewSummary,
    mapSummary: pkg.maps.reduce((a, m) => { a[m.mappingStatus] = (a[m.mappingStatus] ?? 0) + 1; return a; }, {}),
    warnings,
    checks: checks.map((c) => ({ id: c.id, status: c.status, evidence: c.evidence })),
    chapterReview: (pkg.chapters ?? []).map((ch) => {
      const nodes = (pkg.storyNodes ?? []).filter((n) => n.chapterId === ch.id);
      return {
        chapterId: ch.id,
        title: ch.title,
        sourceLines: ch.source.lines,
        nodeCount: nodes.length,
        firstNode: nodes[0]?.id ?? null,
        lastNode: nodes[nodes.length - 1]?.id ?? null,
        nodeIds: nodes.map((n) => n.id),
        encounters: (pkg.encounterTemplates ?? []).filter((e) => nodes.some((n) => n.id === e.id) || (e.source && e.source.lines[0] >= ch.source.lines[0] && e.source.lines[1] <= ch.source.lines[1])).map((e) => e.id),
        reviewStatus: 'candidate',
        note: '源文复核由模型逐节对照原文完成并落为节点；100%行覆盖表示登记完整，不等于语义完全正确。',
      };
    }),
  };
  return result;
}

async function main() {
  const { values } = parseArgs({
    options: {
      'project-root': { type: 'string' },
      'package-dir': { type: 'string' },
      'module-rel': { type: 'string' },
      inventory: { type: 'string' },
      'resources-index': { type: 'string' },
      'stage-root': { type: 'string' },
      mode: { type: 'string' },
      'write-results': { type: 'boolean' },
      'write-manifest': { type: 'boolean' },
      'self-test': { type: 'boolean' },
    },
  });

  if (values['self-test']) {
    await selfTest();
    return;
  }

  for (const k of ['project-root', 'package-dir', 'module-rel', 'inventory', 'resources-index', 'stage-root', 'mode']) {
    if (!values[k]) { console.error(`缺少参数 --${k}`); process.exit(2); }
  }
  const projectRoot = resolve(values['project-root']);
  const packageDir = resolve(values['package-dir']);
  const stageRoot = resolve(values['stage-root']);
  const mode = values.mode;
  if (!['staging', 'final'].includes(mode)) { console.error('mode 必须为 staging 或 final'); process.exit(2); }

  const inventory = readJson(resolve(values.inventory));
  const resourceIndex = readJson(resolve(values['resources-index']));

  const preprocessAbs = join(packageDir, ...values['module-rel'].split('/'), '预处理.json');
  if (!existsSync(preprocessAbs)) { console.error(`预处理.json 不存在: ${preprocessAbs}`); process.exit(2); }
  const pkg = readJson(preprocessAbs);
  if (!pkg) { console.error('预处理.json 解析失败'); process.exit(2); }
  const matchingEntries = readJson(join(dirname(preprocessAbs), '校验/资源匹配.json'))?.entries ?? [];
  const declaredNewIds = new Set(matchingEntries.filter(e => e.decision === 'new').map(e => e.resourceId));

  const resolver = makeResolver(projectRoot, packageDir, mode, mode === 'staging' ? join(stageRoot, '新资源') : null);
  const knownResourceIds = new Set(resourceIndex.entries.map((e) => e.id));
  const newResourcesById = new Map();
  // 新资源位于 阶段区/新资源/<相对路径>/资源.json（final 模式下在 projectRoot 下）
  const stageNewRoot = mode === 'final' ? projectRoot : join(stageRoot, '新资源');
  const { listFilesSync } = await import('./lib/common.mjs').then((m) => ({ listFilesSync: m.listFilesSync }));
  for (const f of listFilesSync(stageNewRoot)) {
    if (!f.endsWith('资源.json')) continue;
    const j = readJson(f);
    if (j && j.id && j.formatVersion === 1) {
      // 目录命名须为 <名称>__<id>，避免把同名旧资源JSON误当本批新资源
      const dirName = basename(dirname(f));
      if (dirName === `${j.name}__${j.id}` && declaredNewIds.has(j.id)) newResourcesById.set(j.id, j);
    }
  }
  for (const id of newResourcesById.keys()) knownResourceIds.add(id);
  const reusedIds = new Set([...pkg.resourceIds, ...matchingEntries.filter(e => e.decision !== 'new').map(e => e.resourceId)].filter((id) => !newResourcesById.has(id)));

  // 附件基线状态文件
  const baselinePath = join(stageRoot, '复用附件基线.json');
  let reuseAttachmentBaseline = {};
  if (existsSync(baselinePath)) {
    try { reuseAttachmentBaseline = JSON.parse(readFileSync(baselinePath, 'utf8')); } catch { /* 重建 */ }
  }

  const jsonTexts = [];
  const moduleDir = pkg.dialogueTemplatesPath.replace(/\/对话\/模板\.json$/, '');
  const collectJson = (rel) => {
    const abs = resolveOverlay(resolver, projectRoot, rel);
    if (abs) jsonTexts.push(readFileSync(abs, 'utf8'));
  };
  collectJson(`${values['module-rel']}/预处理.json`);
  collectJson(pkg.dialogueTemplatesPath);
  collectJson(pkg.encounterTemplatesPath);
  for (const f of ['输入清单.json', '图像清单.json', '覆盖清单.json', '资源匹配.json', '人工审核.json']) collectJson(`${moduleDir}/校验/${f}`);
  for (const rid of newResourcesById.keys()) {
    const r = newResourcesById.get(rid);
    collectJson(r.bodyPath.replace(/\/正文\.md$/, '/资源.json'));
  }

  const ctx = {
    projectRoot, packageDir, mode, resolver, inventory, resourceIndex,
    knownResourceIds, newResourcesById, reusedIds,
    reuseAttachmentBaseline,
    jsonTexts,
    externalEvidence: (pkg.externalEvidence ?? null),
  };

  const checks = runAll(ctx, pkg);
  const blocking = checks.filter((c) => c.status === 'fail');
  const result = writeResults(ctx, pkg, checks, mode);

  if (mode === 'staging') {
    mkdirSync(dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(ctx.reuseAttachmentBaseline, null, 2), 'utf8');
  }

  if (values['write-results']) {
    const outDir = resolveOverlay(resolver, projectRoot, `${moduleDir}/校验`);
    if (outDir) {
      writeFileSync(join(outDir, '检查结果.json'), JSON.stringify(result, null, 2), 'utf8');
      const reportLines = [
        '# 检查报告',
        '',
        `- 模式：${mode}　时间：${result.generatedAt}　模块：${pkg.moduleId}`,
        `- 检查项 ${checks.length} 个：通过 ${checks.filter((c) => c.status === 'pass').length}、跳过 ${checks.filter((c) => c.status === 'skipped').length}、失败 ${blocking.length}`,
        `- 待人工项 ${result.pendingHuman.length} 个`,
        `- 资源匹配：${JSON.stringify(result.matchingSummary)}`,
        `- 地图状态：${JSON.stringify(result.mapSummary)}`,
        `- 人工审核：${JSON.stringify(result.reviewSummary)}`,
        '',
        '## 失败项',
        ...(blocking.length ? blocking.map((c) => `- [${c.id}] ${c.evidence}`) : ['无']),
        '',
        '## 待人工项',
        ...(result.pendingHuman.length ? result.pendingHuman.map((p) => `- [${p.kind}] ${p.id}：${p.reason}`) : ['无']),
        '',
        '## 检查明细',
        ...checks.map((c) => `- ${c.status === 'pass' ? '通过' : c.status === 'fail' ? '失败' : '跳过'} [${c.id}] ${c.evidence}`),
        '',
      ];
      writeFileSync(join(outDir, '检查报告.md'), reportLines.join('\n'), 'utf8');
    } else {
      console.error('无法定位校验目录以写入结果');
    }
  }

  if (values['write-manifest']) {
    const outDir = resolveOverlay(resolver, projectRoot, `${moduleDir}/校验`);
    if (outDir) {
      const excluded = ['输出清单.json', '检查报告.md', '人工审核.json', '检查结果.json'];
      const files = [];
      const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else {
            const within = relative(packageDir, p).replace(/\\/g, '/');
            if (!within.startsWith('../') && !/^[A-Za-z]:/.test(within)) {
              if (within.startsWith(values['module-rel'] + '/') && !excluded.some((x) => within.endsWith('/' + x))) {
                const { sha256, bytes } = sha256OfFile(p);
                files.push({ relativePath: within, bytes, sha256 });
              }
            }
          }
        }
      };
      walk(join(packageDir, ...values['module-rel'].split('/')));
      files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      const manifest = {
        schemaVersion: 1,
        moduleId: pkg.moduleId,
        mode,
        generatedAt: new Date().toISOString(),
        excluded: excluded.map((x) => `${moduleDir}/校验/${x}`),
        note: '输出清单记录包内实际文件与摘要；排除自身与后写的检查报告、人工审核文件，排除项如上。',
        fileCount: files.length,
        files,
      };
      writeFileSync(join(outDir, '输出清单.json'), JSON.stringify(manifest, null, 2), 'utf8');
    }
  }

  console.log(JSON.stringify({
    mode,
    checks: checks.length,
    pass: checks.filter((c) => c.status === 'pass').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    skipped: checks.filter((c) => c.status === 'skipped').length,
    blockingErrors: blocking.map((c) => ({ id: c.id, evidence: c.evidence })),
    pendingHumanCount: result.pendingHuman.length,
    sampleNodeIds: ctx.sampleNodeIds ?? [],
    sampleMapIds: ctx.sampleMapIds ?? [],
  }, null, 2));
  if (blocking.length) process.exitCode = 1;
}

// ---------------- 合成夹具自测 ----------------
async function selfTest() {
  const os = await import('node:os');
  const tmpRoot = join(os.tmpdir(), `module-validator-fixtures-${Date.now()}`);
  mkdirSync(tmpRoot, { recursive: true });
  const results = [];
  const record = (name, ok, detail) => results.push({ name, ok, detail });

  const lib = await import('./lib/common.mjs');

  function makeFixture(name) {
    const root = join(tmpRoot, name);
    mkdirSync(join(root, '项目', '模组', '预处理', '输入', 'images'), { recursive: true });
    mkdirSync(join(root, '项目', '资源', '怪物', 'X'), { recursive: true });
    mkdirSync(join(root, '阶段区', '新资源'), { recursive: true });
    return root;
  }

  // 构造一个最小有效包
  function buildValidPackage(root, mutate = null) {
    const projectRoot = join(root, '项目');
    const moduleRel = '模组/预处理/多人短团/测试模组';
    const mdRel = '模组/预处理/输入/测试.md';
    const mdText = '# 标题\n\n第一行内容。\n\n第二行内容。\n\n第三行内容。\n';
    const mdLines = mdText.split('\n');
    mkdirSync(join(projectRoot, '模组', '预处理', '输入'), { recursive: true });
    writeFileSync(join(projectRoot, ...mdRel.split('/')), mdText, 'utf8');
    // 1x1 PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    writeFileSync(join(projectRoot, '模组', '预处理', '输入', 'images', 'img1.png'), png);
    const png2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    writeFileSync(join(projectRoot, '模组', '预处理', '输入', 'images', 'img2.png'), png2);
    const mdSha = sha(Buffer.from(mdText, 'utf8'));
    const img1Sha = sha(png);
    const img2Sha = sha(png2);
    const inventory = {
      md: { relativePath: mdRel, bytes: Buffer.byteLength(mdText, 'utf8'), sha256: mdSha, lineCount: mdLines.length, nonEmptyLineCount: mdLines.filter((l) => l.trim()).length, nonEmptyLines: mdLines.map((t, i) => ({ n: i + 1, text: t })).filter((l) => l.text.trim()) },
      images: [
        { name: 'img1.png', relativePath: '模组/预处理/输入/images/img1.png', bytes: png.length, sha256: img1Sha, width: 1, height: 1, format: 'png' },
        { name: 'img2.png', relativePath: '模组/预处理/输入/images/img2.png', bytes: png2.length, sha256: img2Sha, width: 2, height: 1, format: 'png' },
      ],
      imageCount: 2, unreferencedImages: [], missingReferences: [],
    };
    const pkgRel = `${moduleRel}/预处理.json`;
    const chapters = [{ id: 't-ch-1', title: '第一章', kind: 'scene', source: { mdPath: mdRel, heading: '标题', lines: [1, 5], verification: 'candidate' } }];
    const nodes = [{
      id: 't-node-1', chapterId: 't-ch-1', title: '节点一', type: 'scene', description: '描述一', conditions: [], optional: null,
      source: { mdPath: mdRel, heading: '标题', lines: [1, 5], verification: 'candidate' },
      mapIds: ['t-map-1'], resourceIds: ['t-res-npc-1'], next: [],
      dmNotes: '', readAloud: null, mechanicsReferences: [],
    }];
    const maps = [{
      id: 't-map-1', resourceId: null, name: '测试地图候选', proposedName: '测试地图', mappingStatus: 'unresolved',
      mappingEvidence: [{ method: 'context-only', note: '上下文线索。', source: { mdPath: mdRel, heading: '标题', lines: [3, 3] } }],
      path: `${moduleRel}/故事/原始资料/images/img1.png`,
      originalPath: '模组/预处理/输入/images/img1.png',
      referenceBase: 'project', audience: 'unreviewed', width: 1, height: 1,
      source: { mdPath: mdRel, heading: '标题', lines: [3, 3], verification: 'candidate' }, reviewStatus: 'candidate', locations: [],
    }];
    const resourceIds = ['t-res-npc-1'];
    const resourceCandidates = [];
    const encounterTemplates = [{
      id: 't-enc-1', name: '遭遇一', description: '遭遇描述', trigger: '触发', optional: null, mapId: null,
      participants: [{ resourceId: 't-res-npc-1', count: 1, countCondition: null, note: null }], alternatives: [],
      source: { mdPath: mdRel, heading: '标题', lines: [4, 4], verification: 'candidate' }, reviewStatus: 'candidate',
    }];
    const pkg = {
      schemaVersion: 1, kind: 'module-preprocess', preprocessContract: 'module-md-package-v1', promptVersion: 'r3',
      moduleId: 'test-module-1', batchId: 'test-batch', title: '测试模组', category: '单人短团', sourceVersion: 'v1',
      referenceBase: 'project', reviewStatus: 'candidate',
      source: { kind: 'markdown', relativePath: mdRel, referenceBase: 'project', sha256: mdSha, pdfPath: null, pdfSha256: null, pageCount: null, pdfCompared: false },
      cover: { path: `${moduleRel}/封面.jpg`, referenceBase: 'project', reviewStatus: 'candidate' },
      chapters, maps, storyNodes: nodes, resourceIds, resourceCandidates,
      encounterTemplates,
      dialogueTemplatesPath: `${moduleRel}/对话/模板.json`,
      encounterTemplatesPath: `${moduleRel}/战斗/遭遇.json`,
      warnings: [], integration: { requiresDirectoryAdapter: true, liveImportTested: false },
      locationCandidates: [],
    };
    if (mutate) mutate(pkg, { moduleRel, mdRel, projectRoot, inventory });
    return { pkg, projectRoot, moduleRel, mdRel, inventory, root };
  }

  function writePackageFiles(root, pkg, moduleRel, mdRel, inventory) {
    const projectRoot = join(root, '项目');
    const pkgRoot = join(root, '包');
    const w = (rel, text) => { const p = join(pkgRoot, ...rel.split('/')); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text, 'utf8'); };
    const c = (srcRel, dstRel) => { const p = join(pkgRoot, ...dstRel.split('/')); mkdirSync(dirname(p), { recursive: true }); copyFileSync(join(projectRoot, ...srcRel.split('/')), p); };
    w(`${moduleRel}/预处理.json`, JSON.stringify(pkg, null, 2));
    w(`${moduleRel}/对话/模板.json`, JSON.stringify({ schemaVersion: 1, moduleId: pkg.moduleId, templates: [] }, null, 2));
    w(`${moduleRel}/战斗/遭遇.json`, JSON.stringify({ schemaVersion: 1, moduleId: pkg.moduleId, encounters: pkg.encounterTemplates }, null, 2));
    w(`${moduleRel}/封面.jpg`, 'cover');
    c(mdRel, `${moduleRel}/故事/原始资料/原文.md`);
    for (const im of inventory.images) c(im.relativePath, `${moduleRel}/故事/原始资料/images/${im.name}`);
    for (const n of pkg.storyNodes) w(`${moduleRel}/故事/节点/${n.id}.md`, `# ${n.title}\n\n${n.description}\n`);
    w(`${moduleRel}/故事/模组概览.md`, '# 概览\n');
    for (const m of pkg.maps) for (const l of m.locations) w(`${moduleRel}/故事/主持提示/${l.id}.md`, `# ${l.label}\n`);
    const moduleDir = `${moduleRel}`;
    w(`${moduleDir}/校验/输入清单.json`, JSON.stringify({ md: { sha256: inventory.md.sha256 }, imageCount: inventory.imageCount }, null, 2));
    w(`${moduleDir}/校验/图像清单.json`, JSON.stringify({ images: inventory.images.map((i) => ({ name: i.name, packagePath: `${moduleRel}/故事/原始资料/images/${i.name}`, sha256: i.sha256 })) }, null, 2));
    const nonEmpty = inventory.md.nonEmptyLines.map((l) => l.n);
    const coverage = [{ start: 1, end: inventory.md.lineCount, destType: 'node', destId: 't-node-1', reason: '全部' }];
    w(`${moduleDir}/校验/覆盖清单.json`, JSON.stringify({ totalNonEmptyLines: nonEmpty.length, coveredLines: nonEmpty.length, entries: coverage }, null, 2));
    w(`${moduleDir}/校验/资源匹配.json`, JSON.stringify({ moduleId: pkg.moduleId, summary: {confirmedReuse:0,new:1,pending:0,conflict:0}, entries: [{ resourceId: 't-res-npc-1', name: '测试NPC', decision: 'new', evidence: 'x', idExists:true, contentStatus:'confirmed', versionStatus:'none' }] }, null, 2));
    w(`${moduleDir}/校验/人工审核.json`, JSON.stringify({ entries: [] }, null, 2));
    const digest = packageDigest(JSON.stringify(pkg, null, 2));
    const data = { moduleId:pkg.moduleId, batchId:pkg.batchId, packageSha256:digest, cacheKey:cacheKey(pkg.moduleId,pkg.batchId,digest),
      originalMdLink:fileLink(projectRoot,`${moduleRel}/校验/审核台.html`,`${moduleRel}/故事/原始资料/原文.md`), maps:pkg.maps.map(m=>({id:m.id,imageLink:fileLink(projectRoot,`${moduleRel}/校验/审核台.html`,m.path)})),
      nodes:pkg.storyNodes, matchingSummary:{confirmedReuse:0,new:1,pending:0,conflict:0}, matching:[{resourceId:'t-res-npc-1',decision:'new'}] };
    w(`${moduleDir}/校验/审核台.html`, '<!DOCTYPE html><script>\nconst DATA = '+JSON.stringify(data)+';\n</script><!-- '+ 'x'.repeat(1500)+' -->');
    // 新资源
    const newResDir = join(root, '阶段区', '新资源', '资源', 'NPC', 'X', '测试NPC__t-res-npc-1');
    mkdirSync(newResDir, { recursive: true });
    writeFileSync(join(newResDir, '资源.json'), JSON.stringify({
      formatVersion: 1, id: 't-res-npc-1', name: '测试NPC', resourceType: 'NPC', moduleIds: ['test-module-1'],
      referenceBase: 'project', bodyPath: '资源/NPC/X/测试NPC__t-res-npc-1/正文.md',
      source: { mdPath: mdRel, heading: '标题', lines: [2, 2], verification: 'candidate' },
      edition: { rulesFamily: 'custom', year: null, evidence: '叙事' },
      availability: { enabled: false, status: 'reference-only', requiresDmApproval: true },
      reviewStatus: 'candidate', publicCandidate: {}, dmOnly: {}, imagePaths: [],
    }, null, 2));
    writeFileSync(join(newResDir, '正文.md'), '# 测试NPC\n', 'utf8');
    // 资源索引
    const resourceIndex = { entries: [{ id: 't-res-npc-1', name: '测试NPC', resourceType: 'NPC', jsonPath: '资源/NPC/X/测试NPC__t-res-npc-1/资源.json', assetPath: null, originalAssetPath: null, bodyPath: '资源/NPC/X/测试NPC__t-res-npc-1/正文.md', jsonSha256: null }] };
    return { pkgRoot, resourceIndex };
  }

  function runChecksForFixture(root, fixture, postWrite) {
    const { pkg, projectRoot, moduleRel, inventory } = fixture;
    const { pkgRoot, resourceIndex } = writePackageFiles(root, pkg, moduleRel, fixture.mdRel, inventory);
    if (postWrite) postWrite({ pkgRoot, resourceIndex, root });
    // 更新索引摘要（JSON实际值）
    const idxJsonAbs = join(root, '阶段区', '新资源', ...resourceIndex.entries[0].jsonPath.split('/'));
    resourceIndex.entries[0].jsonSha256 = sha(readFileSync(idxJsonAbs));
    const resolver = makeResolver(projectRoot, pkgRoot, 'staging', join(root, '阶段区', '新资源'));
    const knownResourceIds = new Set(resourceIndex.entries.map((e) => e.id));
    const newResourcesById = new Map();
    for (const f of lib.listFilesSync(join(root, '阶段区', '新资源'))) {
      if (!f.endsWith('资源.json')) continue;
      const j = JSON.parse(readFileSync(f, 'utf8'));
      if (j && j.id) newResourcesById.set(j.id, j);
    }
    const ctx = {
      projectRoot, packageDir: pkgRoot, mode: 'staging', resolver, inventory, resourceIndex,
      knownResourceIds, newResourcesById, reusedIds: new Set(),
      reuseAttachmentBaseline: {}, jsonTexts: [JSON.stringify(pkg)],
      externalEvidence: pkg.externalEvidence ?? null,
    };
    const checks = runAll(ctx, pkg);
    return { checks, ctx };
  }

  const failures = [];
  function assert(cond, msg) { if (!cond) failures.push(msg); }

  try {
    // 1. 最小有效包必须通过
    {
      const root = makeFixture('valid');
      const fx = buildValidPackage(root);
      const { checks } = runChecksForFixture(root, fx);
      const failed = checks.filter((c) => c.status === 'fail');
      if (process.env.VALIDATOR_DEBUG) {
        for (const f of failed) console.error(`[debug] ${f.id}: ${f.evidence}`);
      }
      record('正例：最小有效包通过', failed.length === 0, failed.map((f) => `${f.id}: ${f.evidence}`).join(' | '));
      assert(failed.length === 0, '正例不应有失败项');
    }
    const cases = [
      ['动态地图链接失效', 'review-console', ({ data }) => { data.maps[0].imageLink = 'missing.png'; }],
      ['动态原文链接失效', 'review-console', ({ data }) => { data.originalMdLink = 'missing.md'; }],
      ['动态链接越界', 'review-console', ({ data }) => { data.originalMdLink = '../../../../../../outside.md'; }],
      ['节点描述截断', 'review-console', ({ data }) => { data.nodes[0].description = '截断'; }],
      ['缓存跨批次', 'review-console', ({ data }) => { data.cacheKey = cacheKey(data.moduleId, 'another-batch', data.packageSha256); }],
      ['合法非空人工审核', null, ({ review }) => { review.entries = [{kind:'map',id:'t-map-1',choice:'needfix',note:'合成审核'}]; }],
      ['错误模组审核', 'manifests', ({ review }) => { review.moduleId = 'other'; }],
      ['过期资料包审核', 'manifests', ({ review }) => { review.packageSha256 = '0'.repeat(64); }],
      ['错误批次审核', 'manifests', ({ review }) => { review.batchId = 'other'; }],
      ['未知审核条目', 'manifests', ({ review }) => { review.entries = [{kind:'node',id:'ghost',choice:'pass'}]; }],
      ['错误审核选择', 'manifests', ({ review }) => { review.entries = [{kind:'map',id:'t-map-1',choice:'approve'}]; }],
      ['重复审核条目', 'manifests', ({ review }) => { const e={kind:'map',id:'t-map-1',choice:'pass'};review.entries=[e,e]; }],
      ['非文本审核备注', 'manifests', ({ review }) => { review.entries=[{kind:'map',id:'t-map-1',choice:'pass',note:3}]; }],
      ['错误匹配统计', 'manifests', ({ matching }) => { matching.summary.new = 9; }],
      ['确认匹配与候选矛盾', 'manifests', ({ matching }) => { matching.entries[0].contentStatus = 'pending'; }],
      ['冲突统计遗漏', 'manifests', ({ matching }) => { matching.entries[0].versionStatus = 'conflict'; }],
      ['资源ID不存在', 'manifests', ({ matching }) => { matching.entries[0].resourceId = 'ghost'; }],
    ];
    let caseNo = 0;
    for (const [name, expectedFailure, mutate] of cases) {
      const root = makeFixture('regression-' + caseNo++);
      const fx = buildValidPackage(root);
      const { checks } = runChecksForFixture(root, fx, ({ pkgRoot }) => {
        const dir = join(pkgRoot, fx.moduleRel, '校验');
        const htmlPath = join(dir, '审核台.html');
        const html = readFileSync(htmlPath, 'utf8');
        const data = consoleData(html);
        const review = { schemaVersion:1, moduleId:fx.pkg.moduleId, batchId:fx.pkg.batchId, packageSha256:data.packageSha256, entries:[] };
        const matching = readJson(join(dir, '资源匹配.json'));
        mutate({ data, review, matching });
        writeFileSync(htmlPath, html.replace(/^const DATA = .+;$/m, 'const DATA = ' + JSON.stringify(data) + ';'));
        writeFileSync(join(dir, '人工审核.json'), JSON.stringify(review));
        writeFileSync(join(dir, '资源匹配.json'), JSON.stringify(matching));
      });
      const ok = expectedFailure ? checks.some(c => c.id === expectedFailure && c.status === 'fail') : checks.every(c => c.status !== 'fail');
      record(name, ok, checks.filter(c=>c.status==='fail').map(c=>c.id+': '+c.evidence).join(' | '));
      assert(ok, name);
    }
    {
      const root = makeFixture('cli-failure');
      const fx = buildValidPackage(root);
      const { pkgRoot, resourceIndex } = writePackageFiles(root, fx.pkg, fx.moduleRel, fx.mdRel, fx.inventory);
      writeFileSync(join(root, 'inventory.json'), JSON.stringify(fx.inventory));
      writeFileSync(join(root, 'index.json'), JSON.stringify(resourceIndex));
      writeFileSync(join(pkgRoot, fx.moduleRel, '校验/审核台.html'), 'broken');
      const { spawnSync } = await import('node:child_process');
      const { fileURLToPath } = await import('node:url');
      const args = [fileURLToPath(import.meta.url), '--project-root',fx.projectRoot,'--package-dir',pkgRoot,'--module-rel',fx.moduleRel,
        '--inventory',join(root,'inventory.json'),'--resources-index',join(root,'index.json'),'--stage-root',join(root,'阶段区'),'--mode','staging'];
      const run = spawnSync(process.execPath,args,{encoding:'utf8'});
      const ok = run.status === 1 && JSON.parse(run.stdout).fail > 0;
      record('CLI校验失败返回退出码1',ok,`exit=${run.status}`);assert(ok,'CLI失败退出码');
    }
    record('缓存按模组/批次/摘要隔离',new Set([cacheKey('a','1','x'),cacheKey('a','2','x'),cacheKey('b','1','x'),cacheKey('a','1','y')]).size===4,'');
    // 2. 缺图
    {
      const root = makeFixture('neg-missing-image');
      const fx = buildValidPackage(root, (pkg) => { pkg.cover.path = '模组/预处理/多人短团/测试模组/不存在.jpg'; });
      const { checks } = runChecksForFixture(root, fx);
      const hit = checks.some((c) => c.status === 'fail' && c.id === 'paths-files');
      record('负例：缺图被拒绝', hit, '');
      assert(hit, '缺图负例应失败');
    }
    // 3. 重复ID
    {
      const root = makeFixture('neg-dup-id');
      const fx = buildValidPackage(root, (pkg) => { pkg.storyNodes.push({ ...pkg.storyNodes[0] }); });
      const { checks } = runChecksForFixture(root, fx);
      const hit = checks.some((c) => c.status === 'fail' && c.id === 'json-id-unique');
      record('负例：重复节点ID被拒绝', hit, '');
      assert(hit, '重复ID负例应失败');
    }
    // 4. 悬空引用
    {
      const root = makeFixture('neg-dangling');
      const fx = buildValidPackage(root, (pkg) => { pkg.storyNodes[0].next = [{ nodeId: 't-node-ghost', condition: null, source: { mdPath: 'x', heading: 'x', lines: [1, 1] } }]; });
      const { checks } = runChecksForFixture(root, fx);
      const hit = checks.some((c) => c.status === 'fail' && c.id === 'json-refs');
      record('负例：悬空节点引用被拒绝', hit, '');
      assert(hit, '悬空引用负例应失败');
    }
    // 5. project基准短封面路径
    {
      const root = makeFixture('neg-short-cover');
      const fx = buildValidPackage(root, (pkg) => { pkg.cover.path = '封面.jpg'; });
      const { checks } = runChecksForFixture(root, fx);
      const hit = checks.some((c) => c.status === 'fail' && (c.id === 'paths-files' || c.id === 'json-cover'));
      record('负例：短封面路径（project基准）被拒绝', hit, '');
      assert(hit, '短封面路径负例应失败');
    }
    // 6. 缺chapterId
    {
      const root = makeFixture('neg-no-chapter');
      const fx = buildValidPackage(root, (pkg) => { pkg.storyNodes[0].chapterId = 't-ch-ghost'; });
      const { checks } = runChecksForFixture(root, fx);
      const hit = checks.some((c) => c.status === 'fail' && c.id === 'json-chapter-refs');
      record('负例：缺失chapterId被拒绝', hit, '');
      assert(hit, '缺chapterId负例应失败');
    }
    // 7. 错误规则枚举
    {
      const root = makeFixture('neg-rules-enum');
      const fx = buildValidPackage(root, (pkg) => { pkg.storyNodes[0].type = 'bogus-type'; });
      const { checks } = runChecksForFixture(root, fx);
      const hit = checks.some((c) => c.status === 'fail' && c.id === 'json-enums');
      record('负例：错误枚举被拒绝', hit, '');
      assert(hit, '错误枚举负例应失败');
    }
    // 8. 审核台坏链接
    {
      const root = makeFixture('neg-bad-link');
      const fx = buildValidPackage(root);
      const { checks } = runChecksForFixture(root, fx, ({ pkgRoot }) => {
        const p = join(pkgRoot, ...fx.moduleRel.split('/'), '校验', '审核台.html');
        writeFileSync(p, '<!DOCTYPE html><html><body><a href="../故事/不存在的文件.md">x</a></body></html><!-- ' + 'x'.repeat(1500) + ' -->');
      });
      const hit = checks.some((c) => c.status === 'fail' && c.id === 'review-console');
      record('负例：审核台坏链接被拒绝', hit, '');
      assert(hit, '审核台坏链接负例应失败');
    }
    // 9. 有候选却pendingHuman为0（机制验证：computePendingHuman 必须非空）
    {
      const root = makeFixture('neg-pending');
      const fx = buildValidPackage(root);
      const pending = computePendingHuman(fx.pkg);
      const ok = pending.length > 0;
      record('机制验证：有未确认地图/地点候选时 pendingHuman 非空', ok, `pending=${pending.length}`);
      assert(ok, 'pendingHuman机制应产生待人工项');
      // 干净包（无任何候选）应产生空
      const pkg2 = JSON.parse(JSON.stringify(fx.pkg));
      pkg2.maps = [];
      pkg2.storyNodes[0].mapIds = [];
      pkg2.encounterTemplates = [];
      pkg2.resourceCandidates = [];
      pkg2.locationCandidates = [];
      delete pkg2.rulesVersionIssues;
      const pending2 = computePendingHuman(pkg2);
      record('机制验证：无候选的包 pendingHuman 为空', pending2.length === 0, pending2.map((p) => p.kind).join(','));
      assert(pending2.length === 0, '无候选包不应有待人工项');
    }
    // 10. 复用文件改一个字节
    {
      const root = makeFixture('neg-reuse-byte');
      const fx = buildValidPackage(root, (pkg) => {
        pkg.resourceIds = ['t-res-npc-1', 't-reused-1'];
        pkg.storyNodes[0].resourceIds = ['t-res-npc-1', 't-reused-1'];
        pkg.encounterTemplates[0].participants[0].resourceId = 't-reused-1';
      });
      // 放置一个复用资源（旧库）
      const reusedJson = join(root, '项目', '资源', 'NPC', 'X', '复用NPC__t-reused-1.json');
      mkdirSync(dirname(reusedJson), { recursive: true });
      writeFileSync(reusedJson, JSON.stringify({ id: 't-reused-1', name: '复用NPC', resourceType: 'NPC' }), 'utf8');
      const { pkgRoot, resourceIndex } = writePackageFiles(root, fx.pkg, fx.moduleRel, fx.mdRel, fx.inventory);
      resourceIndex.entries.push({ id: 't-reused-1', name: '复用NPC', jsonPath: '资源/NPC/X/复用NPC__t-reused-1.json', assetPath: null, originalAssetPath: null, bodyPath: null, jsonSha256: sha(readFileSync(reusedJson)) });
      // 改一个字节
      const cur = readFileSync(reusedJson, 'utf8');
      writeFileSync(reusedJson, cur.replace('复用NPC', '复用NPC!'), 'utf8');
      const resolver = makeResolver(join(root, '项目'), pkgRoot, 'staging', join(root, '阶段区', '新资源'));
      const ctx = {
        projectRoot: join(root, '项目'), packageDir: pkgRoot, mode: 'staging', resolver,
        inventory: fx.inventory, resourceIndex,
        knownResourceIds: new Set(resourceIndex.entries.map((e) => e.id)),
        newResourcesById: new Map([['t-res-npc-1', { bodyPath: '资源/NPC/X/测试NPC__t-res-npc-1/正文.md' }]]),
        reusedIds: new Set(['t-reused-1']), reuseAttachmentBaseline: {}, jsonTexts: [JSON.stringify(fx.pkg)],
        externalEvidence: null,
      };
      const checks = runAll(ctx, fx.pkg);
      const hit = checks.some((c) => c.status === 'fail' && c.id === 'reuse-sha');
      record('负例：复用文件被改一个字节被检出', hit, '');
      assert(hit, '复用文件改字节负例应失败');
    }
    // 11. 路径越界
    {
      const root = makeFixture('neg-path-escape');
      const fx = buildValidPackage(root, (pkg) => { pkg.cover.path = '../秘密文件.txt'; });
      const { checks } = runChecksForFixture(root, fx);
      const hit = checks.some((c) => c.status === 'fail' && (c.id === 'json-cover' || c.id === 'paths-files'));
      record('负例：路径越界被拒绝', hit, '');
      assert(hit, '路径越界负例应失败');
    }
    // 12. 无证据确定图片身份（confirmed 但证据方法不合格）
    {
      const root = makeFixture('neg-no-evidence');
      const fx = buildValidPackage(root, (pkg) => {
        pkg.maps[0].mappingStatus = 'confirmed';
        pkg.maps[0].mappingEvidence = [{ method: 'context-only', note: 'x', source: { mdPath: 'x', heading: 'x', lines: [1, 1] } }];
      });
      const { checks } = runChecksForFixture(root, fx);
      const hit = checks.some((c) => c.status === 'fail' && c.id === 'map-evidence');
      record('负例：无合格证据的confirmed地图被拒绝', hit, '');
      assert(hit, '无证据confirmed负例应失败');
    }
  } catch (e) {
    record('夹具运行异常', false, String(e && e.stack || e));
  } finally {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }

  console.log(JSON.stringify({ selfTest: true, total: results.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results, assertionFailures: failures }, null, 2));
  if (failures.length || results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

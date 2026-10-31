// 审核台生成器：单文件HTML，内嵌CSS/JS与必要索引，无CDN、无fetch、无外发请求。
// 所有源文本经JSON转义（< → <）嵌入，浏览器按纯文本渲染，不执行源MD中的HTML/脚本。
// 链接以 校验/ 目录位置为基准用相对路径计算。
// 依赖校验器先运行（读取 检查结果.json 的待人工项与检查明细）。
//
// 用法：
//   node 开发记录/工具/模组预处理/build-review-console.mjs \
//     --project-root <工作区/项目> \
//     --package-dir <包根绝对路径（阶段区包目录或最终包目录）> \
//     --module-rel <最终模组目录项目相对路径> \
//     --inventory <输入盘点.json> \
//     --out-dir <审核台输出目录（包内 校验/）绝对路径>

import { parseArgs } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { fileLink, packageDigest, cacheKey, validateReview, matchingSummary } from './lib/review-contract.mjs';

const { values } = parseArgs({
  options: {
    'project-root': { type: 'string' },
    'package-dir': { type: 'string' },
    'module-rel': { type: 'string' },
    inventory: { type: 'string' },
    'out-dir': { type: 'string' },
  },
});
for (const k of ['project-root', 'package-dir', 'module-rel', 'inventory', 'out-dir']) {
  if (!values[k]) { console.error(`缺少参数 --${k}`); process.exit(2); }
}

const packageDir = resolve(values['package-dir']);
const moduleRel = values['module-rel'].replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const outDir = resolve(values['out-dir']);
const inventory = JSON.parse(readFileSync(resolve(values.inventory), 'utf8'));

const read = (rel) => readFileSync(join(packageDir, ...rel.split('/')), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

const pkg = readJson(`${moduleRel}/预处理.json`);
const checkResult = readJson(`${moduleRel}/校验/检查结果.json`);
const coverage = readJson(`${moduleRel}/校验/覆盖清单.json`);
const imageManifest = readJson(`${moduleRel}/校验/图像清单.json`);
const matching = readJson(`${moduleRel}/校验/资源匹配.json`);

// ---------- 源文行内容（用于证据片段） ----------
const originalMdRel = pkg.source.relativePath;
const originalText = read(`${moduleRel}/故事/原始资料/原文.md`).split('\n');
const excerpt = (start, end) => {
  const from = Math.max(1, start);
  const to = Math.min(originalText.length, end);
  const lines = [];
  for (let i = from; i <= to; i++) lines.push(`${i}\t${originalText[i - 1] ?? ''}`);
  return lines.join('\n');
};

// ---------- 抽查集合（与校验器同一算法） ----------
const seed = 20261030;
const rnd = (n) => {
  let x = (seed + (n * 2654435761) % 4294967296) >>> 0;
  x = ((x ^ (x >> 13)) * 1274126177) >>> 0;
  return ((x ^ (x >> 16)) >>> 0) / 4294967296;
};
const byChapter = new Map();
for (const n of pkg.storyNodes) {
  if (!byChapter.has(n.chapterId)) byChapter.set(n.chapterId, []);
  byChapter.get(n.chapterId).push(n);
}
const sample = new Map(); // id -> reasons[]
for (const [chId, nodes] of byChapter) {
  const reasons = `每章首节点（${chId}）`;
  sample.set(nodes[0].id, [...(sample.get(nodes[0].id) ?? []), reasons]);
  if (nodes.length > 1) sample.set(nodes[nodes.length - 1].id, [...(sample.get(nodes[nodes.length - 1].id) ?? []), `每章尾节点（${chId}）`]);
}
const total = pkg.storyNodes.length;
const want = Math.max(1, Math.ceil(total * 0.1));
const ordered = [...pkg.storyNodes].sort((a, b) => a.id.localeCompare(b.id));
let seedCount = 0;
for (let i = 0; i < ordered.length; i++) {
  if (seedCount >= want + 5) break;
  if (rnd(i) < (want + 5) / total) {
    sample.set(ordered[i].id, [...(sample.get(ordered[i].id) ?? []), '固定seed≥10%抽取']);
    seedCount++;
  }
}
for (const n of pkg.storyNodes) {
  if (n.next.length) sample.set(n.id, [...(sample.get(n.id) ?? []), '含明示分支/后续关系']);
  if (n.type === 'encounter') sample.set(n.id, [...(sample.get(n.id) ?? []), '遭遇节点（触发核对）']);
  const hasVersionDoubt = n.mechanicsReferences.some((m) => /版本|2024|2014|校/.test(m.text)) || /版本|2024|2014|校/.test(n.dmNotes ?? '');
  if (hasVersionDoubt) sample.set(n.id, [...(sample.get(n.id) ?? []), '版本疑点节点']);
}
const mapSample = [];
for (const m of pkg.maps) {
  if (m.locations.some((l) => l.links.length)) mapSample.push({ id: m.id, reason: '含跨图/跨地点连接' });
}
const sampleNodeIds = [...sample.keys()];

// ---------- 转义 ----------
const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const embed = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

const consoleProjectPath = `${moduleRel}/校验/审核台.html`;
const rel = target => fileLink(resolve(values['project-root']), consoleProjectPath, target);
const digest = packageDigest(read(`${moduleRel}/预处理.json`));
const review = readJson(`${moduleRel}/校验/人工审核.json`);
validateReview(review, pkg, digest);

const data = {
  moduleId: pkg.moduleId,
  batchId: pkg.batchId,
  packageSha256: digest,
  cacheKey: cacheKey(pkg.moduleId, pkg.batchId, digest),
  initialReview: review.entries,
  title: pkg.title,
  sourceVersion: pkg.sourceVersion,
  promptVersion: pkg.promptVersion,
  checkResult: { ...checkResult, generatedAt: undefined, mode: undefined, note: '本页面内嵌检查结果快照；权威文件为 校验/检查结果.json 与 校验/检查报告.md。' },
  inventorySummary: {
    mdPath: inventory.md.relativePath,
    mdSha256: inventory.md.sha256,
    lineCount: inventory.md.lineCount,
    nonEmptyLineCount: inventory.md.nonEmptyLineCount,
    imageCount: inventory.imageCount,
    unreferencedImages: inventory.unreferencedImages,
    missingReferences: inventory.missingReferences,
  },
  coverageSummary: {
    totalNonEmptyLines: coverage.totalNonEmptyLines,
    coveredLines: coverage.coveredLines,
    coveragePercent: coverage.coveragePercent,
  },
  chapters: pkg.chapters.map((c) => ({ id: c.id, title: c.title, lines: c.source.lines, nodeCount: pkg.storyNodes.filter((n) => n.chapterId === c.id).length })),
  maps: pkg.maps.map((m) => ({
    id: m.id, name: m.name, proposedName: m.proposedName, mappingStatus: m.mappingStatus,
    audience: m.audience, width: m.width, height: m.height, resourceId: m.resourceId, resourceBindingStatus: m.resourceBindingStatus,
    evidence: m.mappingEvidence,
    imageName: m.path.split('/').pop(),
    imageLink: rel(m.path),
    locations: m.locations.map((l) => ({ id: l.id, label: l.label, description: l.description, links: l.links.map((lk) => `${lk.mapId} / ${lk.locationId}`) })),
  })),
  locationCandidates: pkg.locationCandidates ?? [],
  nodes: pkg.storyNodes.map((n) => ({
    id: n.id, chapterId: n.chapterId, title: n.title, type: n.type, optional: n.optional,
    description: n.description, conditions: n.conditions, dmNotes: n.dmNotes,
    readAloud: n.readAloud, mechanicsReferences: n.mechanicsReferences,
    source: n.source, sourceExcerpt: excerpt(n.source.lines[0], n.source.lines[1]),
    mapIds: n.mapIds, resourceIds: n.resourceIds,
    next: n.next.map((x) => `${x.nodeId}${x.condition ? `（${x.condition}）` : ''}`),
  })),
  sample: sampleNodeIds.map((id) => ({ id, reasons: sample.get(id) ?? [] })),
  sampleMap: mapSample,
  encounters: pkg.encounterTemplates.map((e) => ({ id: e.id, name: e.name, optional: e.optional, mapId: e.mapId, trigger: e.trigger })),
  matching: matching.entries.map((e) => ({ resourceId: e.resourceId, name: e.name, decision: e.decision, evidence: e.evidence, note: e.note ?? null, idExists: e.idExists, contentStatus: e.contentStatus, versionStatus: e.versionStatus, imageBindingStatus: e.imageBindingStatus })),
  matchingSummary: matchingSummary(matching.entries),
  resourceCandidates: pkg.resourceCandidates ?? [],
  rulesVersionIssues: pkg.rulesVersionIssues ?? [],
  originalMdLink: rel(`${moduleRel}/故事/原始资料/原文.md`),
  capabilities: pkg.capabilities ?? {},
};

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>审核台 · ${escapeHtml(pkg.title)}</title>
<style>
:root{--bg:#f4f2ec;--card:#ffffff;--ink:#2a2a28;--muted:#6b6a66;--line:#d8d4c8;--accent:#3a6ea5;--warn:#a05a2c;--ok:#2f7d4f;--bad:#a03a2a}
*{box-sizing:border-box}
body{margin:0;font:14px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;color:var(--ink);background:var(--bg)}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;z-index:5}
header h1{font-size:17px;margin:0 0 6px}
nav button{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:6px 12px;margin-right:6px;cursor:pointer;font-size:13px}
nav button.active{background:var(--accent);color:#fff;border-color:var(--accent)}
main{padding:16px;max-width:1100px;margin:0 auto}
section.panel{display:none}
section.panel.active{display:block}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:12px}
h2{font-size:15px;margin:16px 0 8px;border-left:4px solid var(--accent);padding-left:8px}
h3{font-size:14px;margin:10px 0 6px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}
th{background:#eee9de}
.muted{color:var(--muted);font-size:12px}
.tag{display:inline-block;border-radius:4px;padding:0 6px;font-size:12px;border:1px solid var(--line);background:#eee9de;margin-right:4px}
.tag.unresolved{border-color:#c08457;background:#f3e5d5}
.tag.confirmed{border-color:#5d926f;background:#e2efe6}
.tag.context{border-color:#8aa7c4;background:#e3ebf3}
.tag.fail{background:#f4dcd5;border-color:#c96}
button.mark{border:1px solid var(--line);background:var(--card);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:12px;margin:2px}
button.mark[data-v="pass"]{background:var(--ok);color:#fff}
button.mark[data-v="needfix"]{background:var(--warn);color:#fff}
button.mark[data-v="unknown"]{background:var(--bad);color:#fff}
pre{background:#f7f4ec;border:1px solid var(--line);border-radius:6px;padding:8px;font-size:12px;overflow:auto;white-space:pre-wrap}
img.mapthumb{max-width:220px;max-height:160px;border:1px solid var(--line);border-radius:4px}
select,button{font:inherit}
details summary{cursor:pointer;font-weight:600}
.row{display:flex;gap:12px;flex-wrap:wrap}
.row>div{flex:1;min-width:280px}
.export-btn{background:var(--accent);color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:14px}
</style>
</head>
<body>
<header>
<h1>审核台 · ${escapeHtml(pkg.title)}（${escapeHtml(pkg.sourceVersion)} / ${escapeHtml(pkg.moduleId)}）</h1>
<nav>
<button data-t="overview" class="active">概览</button>
<button data-t="maps">地图核对</button>
<button data-t="nodes">节点核对</button>
<button data-t="sample">抽查集合</button>
<button data-t="resources">资源匹配</button>
<button data-t="export">导出人工审核</button>
</nav>
</header>
<main>
<section id="overview" class="panel active"></section>
<section id="maps" class="panel"></section>
<section id="nodes" class="panel"></section>
<section id="sample" class="panel"></section>
<section id="resources" class="panel"></section>
<section id="export" class="panel"></section>
</main>
<script>
const DATA = ${embed(data)};
const marks = {}; // id -> 'pass'|'needfix'|'unknown'
let notes = {};
for (const e of DATA.initialReview) { marks[e.kind + ':' + e.id] = e.choice; notes[e.kind + ':' + e.id] = e.note || ''; }
const validMark = id => DATA.maps.some(m => 'map:' + m.id === id) || DATA.nodes.some(n => 'node:' + n.id === id);
try {
  const saved = JSON.parse(localStorage.getItem(DATA.cacheKey) || 'null');
  if (saved) for (const [id, choice] of Object.entries(saved.marks || {})) {
    if (validMark(id) && ['pass', 'needfix', 'unknown'].includes(choice)) { marks[id] = choice; notes[id] = typeof saved.notes?.[id] === 'string' ? saved.notes[id] : ''; }
  }
} catch (e) {}
function saveMarks() { try { localStorage.setItem(DATA.cacheKey, JSON.stringify({ marks, notes })); } catch (e) {} }
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML.replace(/"/g, '&quot;'); }

const navBtns = document.querySelectorAll('nav button');
function showPanel(name) {
  for (const b of navBtns) b.classList.toggle('active', b.dataset.t === name);
  for (const p of document.querySelectorAll('section.panel')) p.classList.toggle('active', p.id === name);
}
for (const b of navBtns) b.addEventListener('click', () => showPanel(b.dataset.t));

function markBtn(id) {
  const v = marks[id] || '';
  return '<button class="mark" data-v="pass" data-id="' + esc(id) + '">通过</button>' +
    '<button class="mark" data-v="needfix" data-id="' + esc(id) + '">需改</button>' +
    '<button class="mark" data-v="unknown" data-id="' + esc(id) + '">无法判断</button>' +
    '<input class="review-note" aria-label="审核备注" data-id="' + esc(id) + '" value="' + esc(notes[id] || '') + '" placeholder="审核备注">' +
    (v ? ' <span class="tag">当前：' + ({ pass: '通过', needfix: '需改', unknown: '无法判断' })[v] + '</span>' : '');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button.mark');
  if (!b) return;
  const id = b.dataset.id;
  marks[id] = b.dataset.v;
  saveMarks();
  renderAll();
});

document.addEventListener('input', e => {
  if (!e.target.matches('.review-note')) return;
  notes[e.target.dataset.id] = e.target.value;
  saveMarks();
  renderExport();
});

// ---------- 概览 ----------
function renderOverview() {
  const cr = DATA.checkResult;
  const pass = cr.checks.filter(c => c.status === 'pass').length;
  const fail = cr.checks.filter(c => c.status === 'fail').length;
  const skip = cr.checks.filter(c => c.status === 'skipped').length;
  const byKind = {};
  for (const p of cr.pendingHuman) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  const cap = DATA.capabilities || {};
  const el = document.getElementById('overview');
  el.innerHTML =
    '<div class="card"><h3>输入状态</h3><p><a href="' + esc(DATA.originalMdLink) + '">打开完整原文</a></p><table>' +
    '<tr><th>源MD</th><td>' + esc(DATA.inventorySummary.mdPath) + '</td></tr>' +
    '<tr><th>MD SHA256</th><td class="muted">' + esc(DATA.inventorySummary.mdSha256) + '</td></tr>' +
    '<tr><th>行数 / 非空行</th><td>' + DATA.inventorySummary.lineCount + ' / ' + DATA.inventorySummary.nonEmptyLineCount + '</td></tr>' +
    '<tr><th>图片</th><td>' + DATA.inventorySummary.imageCount + ' 张；未引用 ' + DATA.inventorySummary.unreferencedImages.length + '；缺失引用 ' + DATA.inventorySummary.missingReferences.length + '</td></tr>' +
    '</table></div>' +
    '<div class="card"><h3>文本登记覆盖率</h3><table><tr><th>非空行</th><th>已登记</th><th>覆盖率</th></tr>' +
    '<tr><td>' + DATA.coverageSummary.totalNonEmptyLines + '</td><td>' + DATA.coverageSummary.coveredLines + '</td><td>' + DATA.coverageSummary.coveragePercent + '%</td></tr></table>' +
    '<p class="muted">100%行覆盖只表明登记完整，不等于语义完全正确。</p></div>' +
    '<div class="card"><h3>结构检查</h3><table><tr><th>通过</th><th>失败</th><th>跳过</th></tr>' +
    '<tr><td>' + pass + '</td><td class="' + (fail ? 'tag fail' : '') + '">' + fail + '</td><td>' + skip + '</td></tr></table>' +
    (fail ? '<h3>失败项</h3><ul>' + cr.blockingErrors.map(b => '<li>' + esc(b.id) + '：' + esc(b.evidence) + '</li>').join('') + '</ul>' : '') +
    '</div>' +
    '<div class="card"><h3>待人工项（共 ' + cr.pendingHuman.length + ' 项）</h3><table><tr><th>类别</th><th>数量</th></tr>' +
    Object.entries(byKind).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + v + '</td></tr>').join('') +
    '</table><details><summary>明细</summary><ul>' +
    cr.pendingHuman.map(p => '<li><b>' + esc(p.id) + '</b>（' + esc(p.kind) + '）：' + esc(p.reason) + '</li>').join('') +
    '</ul></details></div>' +
    '<div class="card"><h3>本批次能力与限制</h3><ul>' +
    '<li>视觉理解：' + (cap.visualUnderstanding ? '可用' : '不可用（未做direct-visual核对）') + '</li>' +
    '<li>浏览器验证：' + esc(cap.browserVerification || '未运行') + '</li>' +
    '<li>PDF核对：' + (cap.pdfCheck ? '已核对' : '未提供PDF，未逐页核对') + '</li>' +
    '</ul></div>';
}

// ---------- 地图核对 ----------
function renderMaps() {
  const el = document.getElementById('maps');
  const cards = DATA.maps.map(m => {
    const statusTag = m.mappingStatus === 'confirmed'
      ? '<span class="tag confirmed">confirmed</span>'
      : m.mappingStatus === 'context-only' ? '<span class="tag context">context-only</span>'
      : '<span class="tag unresolved">unresolved</span>';
    const ev = m.evidence.map(e => '<li><b>' + esc(e.method) + '</b>：' + esc(e.note) + '（来源行 ' + e.source.lines[0] + '-' + e.source.lines[1] + '）</li>').join('');
    const locs = m.locations.map(l => '<li><b>' + esc(l.label) + '</b>：' + esc(l.description) + (l.links.length ? '<br><span class="muted">关联：' + esc(l.links.join('；')) + '</span>' : '') + '</li>').join('');
    return '<div class="card"><div class="row"><div>' +
      '<a href="' + esc(m.imageLink) + '"><img class="mapthumb" src="' + esc(m.imageLink) + '" alt="' + esc(m.name) + '"></a></div>' +
      '<div><h3>' + esc(m.name) + ' ' + statusTag + '</h3>' +
      '<p class="muted">ID：' + esc(m.id) + '；候选名：' + esc(m.proposedName ?? '—') + '；受众：' + esc(m.audience) + '；尺寸：' + m.width + '×' + m.height + '；资源：' + esc(m.resourceId ?? '未绑定') + '；图像绑定：' + esc(m.resourceBindingStatus || '未确认') + '</p>' +
      '<p><b>证据：</b></p><ul>' + ev + '</ul>' +
      '<p><b>地点说明：</b></p><ul>' + (locs || '<li class="muted">无地点登记</li>') + '</ul>' +
      '<p>' + markBtn('map:' + m.id) + '</p></div></div></div>';
  }).join('');
  const locCand = DATA.locationCandidates.map(l =>
    '<li><b>' + esc(l.label) + '</b>（' + esc(l.id) + '）：' + esc(l.description) + '<br><span class="muted">' + esc(l.reason) + '</span></li>').join('');
  el.innerHTML = '<h2>地图候选与原图（' + DATA.maps.length + ' 项）</h2>' +
    '<p>' + ['confirmed','context-only','unresolved'].map(s => esc(s) + '：' + DATA.maps.filter(m => m.mappingStatus === s).length).join(' · ') + '</p>' +
    '<p class="muted">点击缩略图打开原图；标“通过/需改/无法判断”后到“导出人工审核”保存。坐标未核对的不生成热点；unreviewed 不代表玩家已获授权。</p>' +
    cards +
    '<h2>未确定归属的地点候选</h2><div class="card"><ul>' + (locCand || '<li class="muted">无</li>') + '</ul></div>';
}

// ---------- 节点核对 ----------
let chapterFilter = null;
function renderNodes() {
  const el = document.getElementById('nodes');
  const sel = '<select id="chapterSel"><option value="">全部章节</option>' +
    DATA.chapters.map(c => '<option value="' + esc(c.id) + '">' + esc(c.title) + '</option>').join('') + '</select>';
  el.innerHTML = '<h2>故事节点（' + DATA.nodes.length + ' 个）</h2><p>' + sel + '</p><div id="nodeList"></div>';
  document.getElementById('chapterSel').value = chapterFilter || '';
  document.getElementById('chapterSel').addEventListener('change', (e) => { chapterFilter = e.target.value || null; renderNodeList(); });
  renderNodeList();
}
function renderNodeList() {
  const box = document.getElementById('nodeList');
  const nodes = DATA.nodes.filter(n => !chapterFilter || n.chapterId === chapterFilter);
  box.innerHTML = nodes.map(n => {
    const ch = DATA.chapters.find(c => c.id === n.chapterId);
    const ra = n.readAloud ? '<h3>朗读文本</h3><pre>' + esc(n.readAloud.text) + '</pre><p class="muted">' + (n.readAloud.mode === 'quote' ? '原文引述' : '忠实改写') + '（来源行 ' + n.readAloud.source.lines[0] + '-' + n.readAloud.source.lines[1] + '）</p>' : '';
    const mech = n.mechanicsReferences.length ? '<h3>规则与检定参考</h3><ul>' + n.mechanicsReferences.map(m => '<li>' + esc(m.text) + '（行 ' + m.source.lines[0] + '-' + m.source.lines[1] + '）</li>').join('') + '</ul>' : '';
    return '<div class="card"><details><summary><b>' + esc(n.title) + '</b> <span class="muted">' + esc(n.id) + ' · ' + esc(ch ? ch.title : n.chapterId) + ' · ' + esc(n.type) + (n.optional ? ' · 可选' : '') + '</span></summary>' +
      '<p>' + esc(n.description) + '</p>' +
      (n.conditions.length ? '<p><b>条件：</b>' + esc(n.conditions.join('；')) + '</p>' : '') +
      ra +
      (n.dmNotes ? '<h3>主持提示</h3><p>' + esc(n.dmNotes) + '</p>' : '') +
      mech +
      '<div class="row"><div><h3>原文片段与行号</h3><pre>' + esc(n.sourceExcerpt) + '</pre></div>' +
      '<div><h3>后续节点</h3><ul>' + (n.next.length ? n.next.map(x => '<li>' + esc(x) + '</li>').join('') : '<li class="muted">无明示后续</li>') + '</ul></div></div>' +
      '<p>' + markBtn('node:' + n.id) + '</p>' +
      '</details></div>';
  }).join('');
}

// ---------- 抽查集合 ----------
function renderSample() {
  const el = document.getElementById('sample');
  const rows = DATA.sample.map(s => {
    const n = DATA.nodes.find(x => x.id === s.id);
    return '<tr><td>' + esc(s.id) + '</td><td>' + esc(n ? n.title : '?') + '</td><td>' + esc(s.reasons.join('；')) + '</td></tr>';
  }).join('');
  const mapRows = DATA.sampleMap.map(m => '<tr><td>' + esc(m.id) + '</td><td>' + esc(m.reason) + '</td></tr>').join('');
  const perChapter = {};
  for (const s of DATA.sample) {
    const n = DATA.nodes.find(x => x.id === s.id);
    if (n) perChapter[n.chapterId] = (perChapter[n.chapterId] || 0) + 1;
  }
  const chRows = DATA.chapters.map(c => '<tr><td>' + esc(c.title) + '</td><td>' + c.nodeCount + '</td><td>' + (perChapter[c.id] || 0) + (c.nodeCount === 0 ? '（无故事节点，原文保留型章节）' : '') + '</td></tr>').join('');
  el.innerHTML = '<h2>默认抽查集合（' + DATA.sample.length + ' 个节点 + ' + DATA.sampleMap.length + ' 张地图）</h2>' +
    '<p class="muted">组成：每章首尾节点 + 固定seed抽取全体节点至少10% + 全部分支、遭遇触发、跨图连接和版本疑点节点；取并集去重。少于10个节点则全查。</p>' +
    '<table><tr><th>节点ID</th><th>标题</th><th>入选原因</th></tr>' + rows + '</table>' +
    '<h3>地图抽查</h3><table><tr><th>地图ID</th><th>入选原因</th></tr>' + (mapRows || '<tr><td colspan=2 class="muted">无跨图连接地图</td></tr>') + '</table>' +
    '<h3>每章入选情况</h3><table><tr><th>章节</th><th>节点数</th><th>入选数</th></tr>' + chRows + '</table>';
}

// ---------- 资源匹配 ----------
function renderResources() {
  const el = document.getElementById('resources');
  const groups = { 'confirmed-reuse': '复用（已确认）', new: '新建', pending: '待匹配', conflict: '冲突' };
  const parts = [];
  for (const [key, label] of Object.entries(groups)) {
    const list = DATA.matching.filter(e => e.decision === key);
    parts.push('<h3>' + label + '（' + list.length + '）</h3><div class="card"><ul>' +
      list.map(e => '<li><b>' + esc(e.name) + '</b>（' + esc(e.resourceId) + '）<br><span class="muted">ID存在：' + esc(e.idExists) + '；内容：' + esc(e.contentStatus) + '；版本：' + esc(e.versionStatus) + '；图像绑定：' + esc(e.imageBindingStatus || '不适用') + '<br>' + esc(e.evidence) + (e.note ? '<br>注意：' + esc(e.note) : '') + '</span></li>').join('') +
      (list.length ? '' : '<li class="muted">无</li>') + '</ul></div>');
  }
  const rc = DATA.resourceCandidates.map(r => '<li><b>' + esc(r.name) + '</b>（' + esc(r.resourceId) + '）：' + esc(r.reason) + '</li>').join('');
  const rv = DATA.rulesVersionIssues.map(r => '<li><b>' + esc(r.id) + '</b>：' + esc(r.note) + '</li>').join('');
  el.innerHTML = '<h2>资源匹配（复用 ' + DATA.matchingSummary.confirmedReuse + ' · 新建 ' + DATA.matchingSummary.new + ' · 待匹配 ' + DATA.matchingSummary.pending + ' · 冲突 ' + DATA.matchingSummary.conflict + '）</h2>' +
    parts.join('') +
    '<h2>未绑定资源候选</h2><div class="card"><ul>' + (rc || '<li class="muted">无</li>') + '</ul></div>' +
    '<h2>规则版本疑点</h2><div class="card"><ul>' + (rv || '<li class="muted">无</li>') + '</ul></div>';
}

// ---------- 导出 ----------
function renderExport() {
  const el = document.getElementById('export');
  const marked = Object.keys(marks).map(id => {
    const [kind, eid] = id.split(/:(.*)/s);
    const label = kind === 'map' ? (DATA.maps.find(m => m.id === eid) || {}).name
      : kind === 'node' ? (DATA.nodes.find(n => n.id === eid) || {}).title : eid;
    return { kind, id: eid, label: label || eid, choice: marks[id], note: notes[id] || '' };
  }).filter(m => m.choice);
  el.innerHTML = '<h2>导出人工审核</h2>' +
    '<p>在“地图核对”和“节点核对”中标记的条目汇总如下。点击导出下载 人工审核.json。</p>' +
    '<p><b>导出后请把文件保存为模组目录下的 校验/人工审核.json</b>（覆盖初始空文件）。只有你在审核台上的操作才能记为人工审核；模型或自动测试不填写该文件。</p>' +
    '<table><tr><th>类别</th><th>条目</th><th>选择</th><th>备注</th></tr>' +
    marked.map(m => '<tr><td>' + esc(m.kind) + '</td><td>' + esc(m.label) + '（' + esc(m.id) + '）</td><td>' + esc({ pass: '通过', needfix: '需改', unknown: '无法判断' }[m.choice]) + '</td><td>' + esc(m.note) + '</td></tr>').join('') +
    (marked.length ? '' : '<tr><td colspan="4" class="muted">尚未标记任何条目</td></tr>') +
    '</table>' +
    '<p style="margin-top:12px"><button class="export-btn" id="doExport">导出 人工审核.json</button></p>';
  document.getElementById('doExport').addEventListener('click', () => {
    const payload = {
      schemaVersion: 1,
      moduleId: DATA.moduleId,
      batchId: DATA.batchId,
      packageSha256: DATA.packageSha256,
      generatedAt: new Date().toISOString(),
      source: 'review-console',
      note: '由审核台导出的人工审核结果；条目选择与备注来自用户操作。',
      summary: { reviewed: marked.length },
      entries: marked,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '人工审核.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
}

function renderAll() {
  renderOverview();
  renderMaps();
  if (document.getElementById('nodeList')) renderNodeList();
  renderSample();
  renderResources();
  renderExport();
}
renderAll();
renderNodes();
</script>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
const out = join(outDir, '审核台.html');
writeFileSync(out, html, 'utf8');
console.log(JSON.stringify({
  written: out,
  bytes: html.length,
  nodes: pkg.storyNodes.length,
  maps: pkg.maps.length,
  sampleNodes: sampleNodeIds.length,
  sampleMaps: mapSample.length,
  pendingHuman: checkResult.pendingHuman.length,
}, null, 2));

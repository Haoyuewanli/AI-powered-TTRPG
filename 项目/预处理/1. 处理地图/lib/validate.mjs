import { createHash } from 'node:crypto';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const blockedKeys = new Set(['__proto__', 'prototype', 'constructor']);
const digest = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = (value, limit = 300) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const identifier = value => text(value, 160) && !blockedKeys.has(value) && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value);
const localPath = value => text(value, 1000) && !/[\\?#\u0000-\u001f]/.test(value) && !/^(?:\/|[a-z]:)/i.test(value) && !value.split('/').some(part => !part || part === '.' || part === '..') && !/%(?:2e|2f|5c)/i.test(value);
const lower = value => typeof value === 'string' ? value.toLowerCase() : '';

export function validatePlan(plan, index, sourceText) {
  const errors = [], pending = [], warnings = [];
  const add = (target, message) => { if (!target.includes(message)) target.push(message); };
  const error = message => add(errors, message);
  const wait = message => add(pending, message);
  const warn = message => add(warnings, message);
  const result = () => ({ ok: errors.length === 0, errors, pending, warnings });

  function inspect(value, label = '计划', ancestors = new WeakSet(), depth = 0, count = { n: 0 }) {
    if (++count.n > 100000) { error('计划内容超过允许的结构大小。'); return; }
    if (depth > 32) { error('计划嵌套超过32层。'); return; }
    if (value === null || typeof value !== 'object') return;
    if (!Array.isArray(value) && !record(value)) { error(label + '不是普通数据对象。'); return; }
    if (ancestors.has(value)) { error(label + '包含循环数据引用。'); return; }
    ancestors.add(value);
    for (const key of Object.keys(value)) {
      if (blockedKeys.has(key)) error(label + '包含禁止的属性名：' + key);
      inspect(value[key], label + '.' + key, ancestors, depth + 1, count);
      if (count.n > 100000) break;
    }
    ancestors.delete(value);
  }
  inspect(plan);
  if (!record(plan)) { error('计划必须是普通对象。'); return result(); }
  if (!record(index) || !record(index.md) || !Array.isArray(index.images)) { error('输入索引缺少MD或图片清单。'); return result(); }
  if (plan.schemaVersion !== 1) error('计划schemaVersion须为1。');
  if (!record(plan.module)) error('缺少模组身份。');
  else {
    if (!identifier(plan.module.id)) error('模组ID无效。');
    if (!text(plan.module.title, 300)) error('模组名称为空或无效。');
    if (!text(plan.module.version, 160)) error('来源版本为空；未知时明确填写未知。');
  }
  if (own(plan, 'players') || own(plan, 'shares')) error('地图第一轮不生成玩家或共享授权数据。');
  if (plan.reviewStatus !== undefined && !['candidate', 'pending'].includes(plan.reviewStatus)) error('程序校验不能把计划标为人工审核通过。');
  if (!digest(index.md.sha256)) error('输入索引的MD摘要无效。');
  if (!record(plan.source) || !digest(plan.source.mdSha256) || lower(plan.source.mdSha256) !== lower(index.md.sha256)) error('计划来源MD摘要与当前输入不一致。');
  if (typeof sourceText !== 'string') error('必须提供未改写的原文MD文本以核对来源。');
  const lines = typeof sourceText === 'string' ? sourceText.split(/\r?\n/) : [];
  if (!Number.isInteger(index.md.lineCount) || index.md.lineCount < 1 || index.md.lineCount !== lines.length) error('原文行数与输入索引不一致。');
  if (typeof sourceText === 'string' && createHash('sha256').update(sourceText).digest('hex') !== lower(index.md.sha256)) error('原文文本与输入索引摘要不一致，需重新盘点。');

  function evidence(value, label) {
    if (!record(value)) { wait(label + '缺少核对证据。'); return 'unknown'; }
    if (!['direct-visual', 'context', 'unknown'].includes(value.method)) { error(label + '的证据方法无效。'); return 'unknown'; }
    if (value.method === 'direct-visual' && !text(value.note, 3000)) error(label + '的直接视觉证据需说明实际所见。');
    if (value.method !== 'direct-visual') wait(label + '尚待实际视觉核对。');
    return value.method;
  }
  function ranges(value, label) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 100) { error(label + '需包含1～100段来源行号。'); return; }
    for (const range of value) {
      if (!record(range) || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 1 || range.end < range.start || range.end > lines.length) { error(label + '来源行号超出原文或顺序无效。'); continue; }
      if (!lines.slice(range.start - 1, range.end).some(line => line.trim())) error(label + '引用的是空白行。');
      if (range.end - range.start > 120) warn(label + '引用范围较长，请核对是否已定位具体事实。');
    }
  }

  const indexed = new Map();
  for (const image of index.images) {
    if (!record(image) || !localPath(image.path) || !digest(image.sha256)) { error('输入索引中存在无效的图片路径或摘要。'); continue; }
    if (indexed.has(image.path)) error('输入索引重复图片路径：' + image.path);
    indexed.set(image.path, image);
  }
  const decisions = new Map();
  if (!Array.isArray(plan.images) || plan.images.length > 10000) error('计划图片决策清单无效或超过10000项。');
  else for (const image of plan.images) {
    if (!record(image) || !localPath(image.path)) { error('图片决策路径无效。'); continue; }
    if (decisions.has(image.path)) error('图片决策重复：' + image.path);
    decisions.set(image.path, image);
    const input = indexed.get(image.path);
    if (!input) error('图片决策引用了输入外的文件：' + image.path);
    else {
      if (!digest(image.sha256) || lower(image.sha256) !== lower(input.sha256)) error('图片摘要与输入不一致：' + image.path);
      if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1) wait('图片尺寸尚未可靠读取：' + image.path);
    }
    if (!['map', 'illustration', 'pending'].includes(image.decision)) error('图片决策类型无效：' + image.path);
    if (!['dm', 'player', 'unknown'].includes(image.audience)) error('图片用途标记无效：' + image.path);
    evidence(image.evidence, '图片“' + image.path + '”');
    if (image.decision === 'pending') wait('图片身份待定：' + image.path);
    if (image.decision === 'map' && image.audience === 'unknown') wait('地图受众用途待核对：' + image.path);
  }
  for (const path of indexed.keys()) if (!decisions.has(path)) error('缺少图片决策：' + path);

  if (!Array.isArray(plan.nodes) || plan.nodes.length === 0 || plan.nodes.length > 500) { error('地图节点清单须包含1～500项。'); return result(); }
  const nodes = new Map(), usedImages = new Set();
  let roots = 0;
  for (const node of plan.nodes) {
    if (!record(node) || !identifier(node.id)) { error('地图节点ID无效。'); continue; }
    if (nodes.has(node.id)) error('地图节点ID重复：' + node.id);
    nodes.set(node.id, node);
    if (node.parentId === null) roots++;
    else if (!identifier(node.parentId)) error('地图上级ID无效：' + node.id);
    if (!text(node.name, 400)) error('地图节点名称无效：' + node.id);
    if (!['image', 'text'].includes(node.kind)) error('地图节点类型无效：' + node.id);
    if (own(node, 'shares') || own(node, 'share') || own(node, 'players')) error('节点不得存放玩家或共享授权：' + node.id);
    ranges(node.source, '地点“' + node.id + '”基础描述');
    if (!record(node.sensory) || !text(node.sensory.text, 50000)) error('地点“' + node.id + '”移步换景文字为空或无效。');
    else ranges(node.sensory.sources, '地点“' + node.id + '”移步换景');
    if (node.kind === 'text') {
      if (node.variants !== undefined && (!Array.isArray(node.variants) || node.variants.length)) error('文本地图不得绑定图片版本：' + node.id);
      if (own(node, 'primaryVariantId')) error('文本地图没有主图片版本：' + node.id);
      if (own(node, 'image') || own(node, 'imageUrl')) error('文本地图不得直接引用图片：' + node.id);
      if (node.hotspots !== undefined && (!Array.isArray(node.hotspots) || node.hotspots.length)) error('文本地图没有原图热点：' + node.id);
      continue;
    }
    if (node.kind !== 'image') continue;
    if (!Array.isArray(node.variants) || node.variants.length === 0 || node.variants.length > 100) { error('图片地图缺少有效图片版本：' + node.id); continue; }
    const variantIds = new Set();
    for (const variant of node.variants) {
      if (!record(variant) || !identifier(variant.id)) { error('图片版本ID无效：' + node.id); continue; }
      if (variantIds.has(variant.id)) error('图片版本ID重复：' + node.id + '/' + variant.id);
      variantIds.add(variant.id);
      if (!localPath(variant.image)) { error('图片版本路径无效：' + node.id + '/' + variant.id); continue; }
      usedImages.add(variant.image);
      const input = indexed.get(variant.image), decision = decisions.get(variant.image);
      const method = evidence(variant.evidence, '地图“' + node.id + '”版本“' + variant.id + '”');
      if (!input || !decision) { error('图片版本引用未登记的输入：' + variant.image); continue; }
      if (decision.decision === 'illustration') error('插画不能作为地图版本：' + variant.image);
      if (['dm', 'player'].includes(variant.id) && ['dm', 'player'].includes(decision.audience) && variant.id !== decision.audience) error('图片版本用途与已核对的受众不一致：' + node.id + '/' + variant.id);
      if (decision.decision === 'pending') {
        if (method === 'direct-visual') error('待定图片不能登记为已确认地图版本：' + variant.image);
        else wait('候选版本尚不能显示为已确认地图：' + node.id + '/' + variant.id);
      }
      if (method !== 'direct-visual' || decision.evidence?.method !== 'direct-visual') wait('图片绑定或版本配对待核对：' + node.id + '/' + variant.id);
      if (decision.audience === 'unknown') wait('图片版本用途尚未确认：' + node.id + '/' + variant.id);
      if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1) error('引用图片没有有效实测尺寸：' + variant.image);
      if (variant.crop !== undefined) {
        const crop = variant.crop;
        if (!record(crop) || !['x', 'y', 'w', 'h'].every(key => Number.isInteger(crop[key])) || crop.x < 0 || crop.y < 0 || crop.w < 1 || crop.h < 1 || crop.x + crop.w > input.width || crop.y + crop.h > input.height) error('裁剪区域超出原图或尺寸无效：' + node.id + '/' + variant.id);
      }
    }
    const primaryId = node.primaryVariantId ?? node.variants[0]?.id;
    if (!identifier(primaryId) || !variantIds.has(primaryId)) error('主图片版本不存在：' + node.id + '/' + String(primaryId));
    else {
      const primary = node.variants.find(variant => variant.id === primaryId), decision = decisions.get(primary.image);
      if (decision?.decision !== 'map' || decision.evidence?.method !== 'direct-visual' || primary.evidence?.method !== 'direct-visual') wait('主图片版本尚未确认，换图时不得沿用其热点坐标：' + node.id + '/' + primaryId);
    }
  }
  if (roots !== 1) error('地图目录必须恰有一个根节点。');
  for (const [id, node] of nodes) {
    if (node.parentId !== null && !nodes.has(node.parentId)) error('地图上级不存在：' + id + ' → ' + String(node.parentId));
    const visited = new Set([id]); let cursor = node.parentId;
    while (cursor !== null && nodes.has(cursor)) {
      if (visited.has(cursor)) { error('地图目录存在循环：' + id); break; }
      visited.add(cursor); cursor = nodes.get(cursor).parentId;
    }
    if (node.hotspots === undefined) continue;
    if (!Array.isArray(node.hotspots) || node.hotspots.length > 10000) { error('地图热点清单无效或过大：' + id); continue; }
    for (const hotspot of node.hotspots) {
      if (!record(hotspot)) { error('热点不是对象：' + id); continue; }
      if (!identifier(hotspot.targetId) || !nodes.has(hotspot.targetId)) error('热点目标不存在：' + id + ' → ' + String(hotspot.targetId));
      if (!text(hotspot.label, 300)) error('热点标签无效：' + id);
      if (node.kind === 'image') {
        const basis = hotspot.variantId ?? node.primaryVariantId ?? node.variants?.[0]?.id;
        if (!identifier(basis) || !node.variants?.some(variant => record(variant) && variant.id === basis)) error('热点坐标基准图片版本不存在：' + id + '/' + String(basis));
      }
      const method = evidence(hotspot.evidence, '地图“' + id + '”热点“' + String(hotspot.label) + '”');
      if (hotspot.x === null && hotspot.y === null) { wait('热点坐标未核对：' + id + '/' + String(hotspot.label)); continue; }
      if (!finite(hotspot.x) || !finite(hotspot.y) || hotspot.x < 0 || hotspot.x > 1 || hotspot.y < 0 || hotspot.y > 1) error('热点坐标须同时为空，或为0～1实测坐标：' + id + '/' + String(hotspot.label));
      if (method !== 'direct-visual') error('未实际视觉核对的热点不得填写猜测坐标：' + id + '/' + String(hotspot.label));
    }
  }
  for (const [path, decision] of decisions) if (decision.decision === 'map' && !usedImages.has(path)) {
    warn('已识别地图尚未关联目录节点：' + path);
    wait('尚未关联的地图需要安排或说明：' + path);
  }
  return result();
}

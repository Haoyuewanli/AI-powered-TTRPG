import { createHash } from 'node:crypto';
import { relative, resolve, dirname } from 'node:path';
import { realpathSync, statSync } from 'node:fs';

export function cacheKey(moduleId, batchId, digest) {
  return 'module-review:' + JSON.stringify([moduleId, batchId, digest]);
}

export function fileLink(projectRoot, consoleProjectPath, targetProjectPath) {
  const rel = relative(dirname(resolve(projectRoot, consoleProjectPath)), resolve(projectRoot, targetProjectPath));
  return rel.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
}

export function localLinkTarget(projectRoot, consoleProjectPath, link, resolver) {
  if (typeof link !== 'string' || !link || /^(?:[a-z][a-z0-9+.-]*:|[\\/])/i.test(link)) throw new Error('非本地相对链接');
  const decoded = decodeURIComponent(link.split(/[?#]/)[0]);
  const target = resolve(dirname(resolve(projectRoot, consoleProjectPath)), decoded);
  const rel = relative(resolve(projectRoot), target).replace(/\\/g, '/');
  if (rel === '..' || rel.startsWith('../') || /^[A-Za-z]:/.test(rel)) throw new Error('链接越过项目边界');
  const abs = resolver(rel);
  if (!abs || !statSync(abs).isFile()) throw new Error('链接目标文件不存在');
  // 覆盖层可在另一个根下，真实目标仍必须留在所选覆盖层根内。
  const layerRoot = resolve(abs, ...rel.split('/').map(() => '..'));
  const realRel = relative(realpathSync(layerRoot), realpathSync(abs));
  if (realRel === '..' || realRel.startsWith('..\\') || realRel.startsWith('../') || /^[A-Za-z]:/.test(realRel)) throw new Error('链接经符号链接越界');
  return abs;
}

export function packageDigest(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function matchingSummary(entries) {
  const result = { confirmedReuse: 0, new: 0, pending: 0, conflict: 0 };
  const keys = { 'confirmed-reuse': 'confirmedReuse', new: 'new', pending: 'pending', conflict: 'conflict' };
  const seen = new Set();
  for (const entry of entries) {
    if (!entry.resourceId || seen.has(entry.resourceId) || !keys[entry.decision]) throw new Error('资源匹配ID重复、缺失或decision非法');
    seen.add(entry.resourceId);
    result[keys[entry.decision]]++;
  }
  return result;
}

export function validateReview(review, pkg, digest) {
  if (!review || !Array.isArray(review.entries)) throw new Error('人工审核缺少entries数组');
  if (review.schemaVersion !== undefined && review.schemaVersion !== 1) throw new Error('人工审核schemaVersion必须为1');
  if (review.moduleId && review.moduleId !== pkg.moduleId) throw new Error('人工审核属于其他模组');
  if (review.packageSha256 && review.packageSha256 !== digest) throw new Error('人工审核对应旧资料包，请保留原记录并重新核对');
  if (review.batchId && review.batchId !== pkg.batchId) throw new Error('人工审核属于其他批次');
  if (!review.entries.length) return { reviewed: 0, pass: 0, needfix: 0, unknown: 0 };
  if (review.schemaVersion !== 1 || review.moduleId !== pkg.moduleId || review.packageSha256 !== digest || !pkg.batchId || review.batchId !== pkg.batchId) throw new Error('非空审核记录必须包含schemaVersion、moduleId、batchId和当前packageSha256');
  const ids = { map: new Set(pkg.maps.map(x => x.id)), node: new Set(pkg.storyNodes.map(x => x.id)) };
  const count = { reviewed: 0, pass: 0, needfix: 0, unknown: 0 };
  const seen = new Set();
  for (const entry of review.entries) {
    const key = `${entry.kind}:${entry.id}`;
    if (!ids[entry.kind]?.has(entry.id) || seen.has(key)) throw new Error(`审核条目不存在或重复: ${key}`);
    if (!['pass', 'needfix', 'unknown'].includes(entry.choice) || (entry.note !== undefined && typeof entry.note !== 'string')) throw new Error(`审核选择或备注格式不符: ${key}`);
    seen.add(key);
    count.reviewed++;
    count[entry.choice]++;
  }
  return count;
}

export function validateMatching(manifest, pkg, knownIds) {
  if (manifest.moduleId !== pkg.moduleId) throw new Error('资源匹配模组标识不符');
  const summary = matchingSummary(manifest.entries);
  for (const [key, count] of Object.entries(summary)) if (manifest.summary?.[key] !== count) throw new Error(`资源匹配统计不符: ${key}`);
  const byId = new Map(manifest.entries.map(e => [e.resourceId, e]));
  for (const e of manifest.entries) {
    if (!knownIds.has(e.resourceId) || e.idExists !== true) throw new Error(`资源ID不存在或存在性未记录: ${e.resourceId}`);
    if (!['confirmed', 'pending'].includes(e.contentStatus) || !['none', 'conflict'].includes(e.versionStatus)) throw new Error(`资源状态非法: ${e.resourceId}`);
    if (['confirmed-reuse', 'new'].includes(e.decision) && (e.contentStatus !== 'confirmed' || e.versionStatus !== 'none')) throw new Error(`确认复用/新增与内容或版本状态矛盾: ${e.resourceId}`);
    if (e.decision === 'pending' && e.contentStatus !== 'pending') throw new Error(`待匹配状态矛盾: ${e.resourceId}`);
    if ((e.decision === 'conflict') !== (e.versionStatus === 'conflict')) throw new Error(`版本冲突状态矛盾: ${e.resourceId}`);
    if (e.contentStatus === 'confirmed' && !e.evidence) throw new Error(`内容确认缺少依据: ${e.resourceId}`);
  }
  for (const id of pkg.resourceIds) if (byId.get(id)?.contentStatus !== 'confirmed') throw new Error(`resourceIds包含未确认内容: ${id}`);
  for (const c of pkg.resourceCandidates) {
    if (c.scope === 'image-binding') continue;
    if (byId.get(c.resourceId)?.decision !== 'pending') throw new Error(`资源候选被误报为确认复用: ${c.resourceId}`);
  }
  for (const m of pkg.maps) {
    if (m.resourceId && byId.get(m.resourceId)?.contentStatus !== 'confirmed') throw new Error(`地图绑定了未确认资源: ${m.id}`);
    if (m.resourceBindingStatus === 'confirmed' && m.mappingStatus !== 'confirmed') throw new Error(`图片绑定确认与地图身份矛盾: ${m.id}`);
  }
  return summary;
}

// 只解析JSON，不执行审核页面中的脚本。
export function consoleData(html) {
  const match = html.match(/^const DATA = (.+);$/m);
  if (!match) throw new Error('审核台缺少可验证的DATA数据');
  return JSON.parse(match[1]);
}

export function consoleLinks(data) {
  if (typeof data.originalMdLink !== 'string' || !Array.isArray(data.maps)) throw new Error('审核台缺少原文或地图索引');
  const links = [data.originalMdLink];
  for (const map of data.maps) {
    if (typeof map.imageLink !== 'string') throw new Error(`审核台地图缺少imageLink: ${map.id}`);
    links.push(map.imageLink);
  }
  return links;
}

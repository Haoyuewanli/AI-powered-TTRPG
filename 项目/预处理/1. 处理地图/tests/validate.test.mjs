import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validatePlan } from '../lib/validate.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const direct = () => ({ method: 'direct-visual', note: '合成图明确显示对应编号与房间轮廓。' });
function fixture(prefix = 'island') {
  const source = '# 合成模组\n基础景象。\n\n# 末级房间\n房间描述。\n人物和剧情条件。';
  const index = { md: { sha256: sha(source), lineCount: 6 }, images: [{ path: 'images/map.png', sha256: sha('map'), width: 100, height: 80 }, { path: 'images/portrait.jpg', sha256: sha('portrait'), width: 60, height: 90 }] };
  const plan = {
    schemaVersion: 1, module: { id: prefix, title: '合成模组', version: 'v1' }, source: { mdSha256: index.md.sha256 },
    images: index.images.map((image, n) => ({ path: image.path, sha256: image.sha256, decision: n ? 'illustration' : 'map', audience: n ? 'unknown' : 'dm', evidence: direct() })),
    nodes: [
      { id: prefix, parentId: null, name: '合成总图', kind: 'image', source: [{ start: 2, end: 2 }], sensory: { text: '可能有人停留。', sources: [{ start: 6, end: 6 }] }, variants: [{ id: 'dm', image: 'images/map.png', evidence: direct() }], hotspots: [{ x: .5, y: .5, targetId: prefix + '-room', label: 'R1', evidence: direct() }] },
      { id: prefix + '-room', parentId: prefix, name: 'R1 末级房间', kind: 'text', source: [{ start: 5, end: 5 }], sensory: { text: '进入前先判断人物是否仍在。', sources: [{ start: 6, end: 6 }] } }
    ]
  };
  return { source, index, plan };
}
const validate = value => validatePlan(value.plan, value.index, value.source);
const hasError = (value, expression) => { const result = validate(value); assert.equal(result.ok, false); assert(result.errors.some(message => expression.test(message)), result.errors.join('\n')); };

test('缺图及外部引用必须进入最终待核对，不能只藏在索引中',()=>{
  const value=fixture();value.index.warnings=[{code:'missing-image-reference',line:2,path:'images/missing.png'},{code:'external-image-reference',line:3,target:'https://example.invalid/map.png'},{code:'duplicate-image-reference',line:4,path:'images/map.png'}];
  const result=validate(value);assert.equal(result.ok,true);assert.equal(result.pending.length,2);assert.equal(result.warnings.length,3);
});
test('地图数量上限与通用工作台保持一致',()=>{
  const value=fixture();value.plan.nodes=Array.from({length:501},()=>structuredClone(value.plan.nodes[0]));hasError(value,/500/);
});

test('两部不同合成模组使用同一规范，不改变原始计划', () => {
  for (const id of ['island', 'castle']) {
    const value = fixture(id), before = structuredClone(value);
    assert.deepEqual(validate(value), { ok: true, errors: [], pending: [], warnings: [] });
    assert.deepEqual(value, before);
  }
});

test('图片决策须覆盖每一张输入并保持摘要身份', () => {
  const missing = fixture(); missing.plan.images.pop(); hasError(missing, /缺少图片决策/);
  const duplicate = fixture(); duplicate.plan.images.push(structuredClone(duplicate.plan.images[0])); hasError(duplicate, /图片决策重复/);
  const stale = fixture(); stale.plan.images[0].sha256 = sha('changed'); hasError(stale, /图片摘要/);
  const outside = fixture(); outside.plan.images[0].path = '../secret.png'; hasError(outside, /路径无效/);
});

test('目录拒绝重复ID、未知父节点和循环', () => {
  const duplicate = fixture(); duplicate.plan.nodes.push(structuredClone(duplicate.plan.nodes[1])); hasError(duplicate, /节点ID重复/);
  const missing = fixture(); missing.plan.nodes[1].parentId = 'absent'; hasError(missing, /上级不存在/);
  const cycle = fixture(); cycle.plan.nodes[0].parentId = cycle.plan.nodes[1].id; hasError(cycle, /目录存在循环/);
  const roots = fixture(); roots.plan.nodes[1].parentId = null; hasError(roots, /恰有一个根节点/);
});

test('文本上级可以连接图片子节点，文本本身不能冒充图片或授权', () => {
  const value = fixture();
  value.plan.nodes[0].kind = 'text'; delete value.plan.nodes[0].variants; delete value.plan.nodes[0].hotspots;
  value.plan.nodes[1].kind = 'image'; value.plan.nodes[1].variants = [{ id: 'dm', image: 'images/map.png', evidence: direct() }];
  assert.equal(validate(value).ok, true);
  const invalid = fixture(); invalid.plan.nodes[1].variants = [{ id: 'dm', image: 'images/map.png', evidence: direct() }]; hasError(invalid, /文本地图不得绑定/);
  const shares = fixture(); shares.plan.nodes[1].shares = {}; hasError(shares, /不得存放玩家或共享授权/);
});

test('来源摘要、行号和空白引用全部核对，不能只信计划声称', () => {
  const hash = fixture(); hash.plan.source.mdSha256 = sha('other'); hasError(hash, /来源MD摘要/);
  const staleText = fixture(); staleText.source += '\nchanged'; hasError(staleText, /原文文本与输入索引摘要/);
  const outside = fixture(); outside.plan.nodes[0].source = [{ start: 1, end: 100 }]; hasError(outside, /来源行号超出/);
  const blank = fixture(); blank.plan.nodes[0].source = [{ start: 3, end: 3 }]; hasError(blank, /空白行/);
  const noSensory = fixture(); noSensory.plan.nodes[0].sensory.sources = []; hasError(noSensory, /移步换景需包含/);
});

test('裁剪严格限制为源图内整数像素，并拒绝损坏图和插画绑定', () => {
  const valid = fixture(); valid.plan.nodes[0].variants[0].crop = { x: 10, y: 5, w: 30, h: 40 }; assert.equal(validate(valid).ok, true);
  for (const crop of [{ x: -1, y: 0, w: 30, h: 30 }, { x: 90, y: 0, w: 30, h: 30 }, { x: 0, y: 0, w: 2.5, h: 20 }]) {
    const value = fixture(); value.plan.nodes[0].variants[0].crop = crop; hasError(value, /裁剪区域/);
  }
  const bad = fixture(); bad.index.images[0].width = 0; hasError(bad, /实测尺寸/);
  const illustration = fixture(); illustration.plan.nodes[0].variants[0].image = 'images/portrait.jpg'; hasError(illustration, /插画不能/);
  const audience = fixture(); audience.plan.nodes[0].variants[0].id = 'player'; hasError(audience, /受众不一致/);
});

test('纯候选信息保留待核对状态，数字热点不可用上下文伪装视觉证据', () => {
  const context = fixture(); context.plan.images[0].evidence = { method: 'context', note: '附近文字提到此图。' };
  let result = validate(context); assert.equal(result.ok, true); assert(result.pending.some(message => /图片绑定/.test(message)));
  const unknownPoint = fixture(); unknownPoint.plan.nodes[0].hotspots[0] = { x: null, y: null, targetId: 'island-room', label: 'R1', evidence: { method: 'unknown', note: '没有视觉能力。' } };
  result = validate(unknownPoint); assert.equal(result.ok, true); assert(result.pending.some(message => /热点坐标未核对/.test(message)));
  const guessed = fixture(); guessed.plan.nodes[0].hotspots[0].evidence = { method: 'context', note: '从目录顺序推算。' }; hasError(guessed, /猜测坐标/);
  const oneNull = fixture(); oneNull.plan.nodes[0].hotspots[0].x = null; hasError(oneNull, /须同时为空/);
  const dangling = fixture(); dangling.plan.nodes[0].hotspots[0].targetId = 'absent'; hasError(dangling, /热点目标不存在/);
});

test('候选图片不可声称已确认，未挂目录的地图不能悄悄丢失', () => {
  const value = fixture(); value.plan.images[0].decision = 'pending'; hasError(value, /待定图片不能登记为已确认/);
  value.plan.nodes[0].variants[0].evidence = { method: 'unknown', note: '尚未匹配。' };
  assert.equal(validate(value).ok, true); assert(validate(value).pending.length > 0);
  const orphan = fixture(); orphan.plan.images[1].decision = 'map'; orphan.plan.images[1].audience = 'player';
  assert.equal(validate(orphan).ok, true); assert(validate(orphan).warnings.some(message => /尚未关联目录/.test(message)));
});

test('拒绝原型属性、非普通对象和自引用，证据不等于人工审核', () => {
  const proto = fixture(); proto.plan.nodes[0].extra = JSON.parse('{"__proto__":{"polluted":true}}'); hasError(proto, /禁止的属性名/); assert.equal(Object.prototype.polluted, undefined);
  const classed = fixture(); classed.plan.nodes[0].extra = new Date(); hasError(classed, /普通数据对象/);
  const cycle = fixture(); cycle.plan.extra = cycle.plan; hasError(cycle, /循环数据引用/);
  const status = fixture(); status.plan.reviewStatus = 'approved'; hasError(status, /人工审核通过/);
});

test('主图片及热点基准必须存在，候选主图替换保留待核对状态', () => {
  const twoVersions = () => {
    const value = fixture();
    value.plan.images[1].decision = 'map'; value.plan.images[1].audience = 'player';
    value.plan.nodes[0].variants.push({ id: 'player', image: 'images/portrait.jpg', evidence: direct() });
    return value;
  };
  const explicit = twoVersions(); explicit.plan.nodes[0].primaryVariantId = 'player';
  assert.equal(validate(explicit).ok, true);
  const alternate = twoVersions(); alternate.plan.nodes[0].hotspots[0].variantId = 'player';
  assert.equal(validate(alternate).ok, true);
  const missingMain = twoVersions(); missingMain.plan.nodes[0].primaryVariantId = 'missing'; hasError(missingMain, /主图片版本不存在/);
  const missingBasis = twoVersions(); missingBasis.plan.nodes[0].hotspots[0].variantId = 'missing'; hasError(missingBasis, /热点坐标基准图片版本不存在/);
  const candidate = twoVersions(); candidate.plan.nodes[0].variants[0].evidence = { method: 'context', note: '只有文字上下文，待看图核对。' };
  const before = structuredClone(candidate.plan), report = validate(candidate);
  assert.equal(report.ok, true); assert(report.pending.some(message => /主图片版本尚未确认/.test(message)));
  assert.deepEqual(candidate.plan, before);
  assert.equal(candidate.plan.nodes[0].hotspots[0].variantId, undefined);
  const textMain = fixture(); textMain.plan.nodes[1].primaryVariantId = 'dm'; hasError(textMain, /文本地图没有主图片版本/);
});

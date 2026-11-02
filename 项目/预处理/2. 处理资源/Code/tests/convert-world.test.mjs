import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyWorldConversion, planWorldConversion, worldCategory } from '../convert-world.mjs';

const temp = fileURLToPath(new URL('../../../../../开发记录/临时/世界资源转换测试/', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture() {
  await mkdir(temp, { recursive: true }); const root = await mkdtemp(join(temp, 'case-'));
  const source = (id, category, name = '合成怪物') => ({ id, name, ruleCategory: category, source: { collection: '5E不全书', book: '合成规则2024', path: '不读取原始网页' }, edition: { year: 2024, rulesFamily: 'dnd-2024' }, availability: { enabled: false }, content: { text: '# 特质\n\nA&B\n<script>window.no=true</script>', context: '合成背景', tables: [] }, statBlock: { hitPoints: 45, armorClass: 13 } });
  async function add(path, data) { const full = join(root, path); await mkdir(dirname(full), { recursive: true }); const bytes = JSON.stringify(data, null, 2) + '\n'; await writeFile(full, bytes); return { path, hash: sha(bytes) }; }
  return { root, source, add };
}

test('转换分类覆盖旧导入的细类，不把所有规则放进同一分类', () => {
  const pairs = { 'monster-statblock': '怪物图鉴', 'npc-statblock': '人物', spell: '法术', 'class-reference': '职业', subclass: '职业', species: '种族', feat: '专长', background: '背景', equipment: '物品', 'magic-item-reference': '物品', rule: '规则', unknown: '规则' };
  for (const [category, expected] of Object.entries(pairs)) assert.equal(worldCategory(category), expected);
});

test('转换保留来源ID、数值和原文，派生MD可重跑且源JSON字节不变', async () => {
  const { root, source, add } = await fixture();
  const original = await add('资源/怪物/A/合成原件.json', source('world-one', 'monster-statblock'));
  await add('资源/怪物/A/不相关.json', { id: 'other', name: '不转换', source: { collection: '其他来源' } });
  const plan = await planWorldConversion({ projectRoot: root, expectedCount: 1 });
  assert.equal(plan.canApply, true); assert.equal(plan.sourceCount, 1);
  const output = plan.outputs.find(entry => !entry.template);
  assert(output.path.startsWith('资源/怪物图鉴/'));
  const report = await applyWorldConversion(plan); assert.equal(report.verifiedSourceCount, 1);
  const md = await readFile(join(root, output.path), 'utf8'), parts = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/), meta = JSON.parse(parts[1]);
  assert.equal(meta.id, 'world-one'); assert.equal(meta.kind, '怪物图鉴'); assert.equal(meta.initial, 'A');
  assert.equal(meta.data.statBlock.hitPoints, 45); assert.equal(meta.edition.rulesFamily, 'dnd-2024');
  assert.equal(meta.data.sidecar.sha256, original.hash); assert.equal(meta.enabled, false); assert.equal(meta.reviewStatus, 'candidate');
  assert(parts[2].includes('# 特质\n\nA&B\n<script>window.no=true</script>')); assert(parts[2].includes('合成背景'));
  assert.equal(sha(await readFile(join(root, original.path))), original.hash);
  const repeated = await applyWorldConversion(await planWorldConversion({ projectRoot: root }));
  assert.equal(repeated.created, 0); assert.equal(repeated.skipped, report.verifiedOutputCount);
  for (const kind of ['怪物图鉴', '世界观', '世界地图']) assert((await readFile(join(root, '资源', kind, '示例模版.md'), 'utf8')).includes('kind'));
});

test('不同来源同名保留两个稳定文件，重复ID先拒绝，不写任何目标', async () => {
  const { root, source, add } = await fixture();
  await add('资源/怪物/A/甲.json', source('world-a', 'monster-statblock', '同名怪物'));
  await add('资源/怪物/A/乙.json', source('world-b', 'monster-statblock', '同名怪物'));
  const first = await planWorldConversion({ projectRoot: root });
  assert.equal(first.canApply, true); assert.equal(new Set(first.outputs.filter(item => !item.template).map(item => item.path)).size, 2);
  await add('资源/怪物/A/重复.json', source('world-a', 'monster-statblock', '第三个名称'));
  const duplicate = await planWorldConversion({ projectRoot: root });
  assert.equal(duplicate.canApply, false); assert(duplicate.conflicts.some(item => item.reason === '来源ID重复'));
  await assert.rejects(applyWorldConversion(duplicate), /未写入任何结果/);
  await assert.rejects(access(join(root, '资源/怪物图鉴')), { code: 'ENOENT' });
});

test('任何目标用户编辑导致全批预检失败，其他新目标也不创建', async () => {
  const { root, source, add } = await fixture();
  await add('资源/怪物/A/甲.json', source('world-one', 'monster-statblock'));
  const first = await planWorldConversion({ projectRoot: root }), target = first.outputs.find(entry => !entry.template).path;
  await add(target, { user: '本地编辑必须保留' });
  const plan = await planWorldConversion({ projectRoot: root });
  assert.equal(plan.canApply, false); await assert.rejects(applyWorldConversion(plan), /未写入任何结果/);
  assert.equal(JSON.parse(await readFile(join(root, target), 'utf8')).user, '本地编辑必须保留');
  await assert.rejects(access(join(root, '资源/世界地图')), { code: 'ENOENT' });
});

test('预检后的来源变化会阻止写入，数量不符也拒绝', async () => {
  const { root, source, add } = await fixture();
  const path = '资源/怪物/A/甲.json'; await add(path, source('world-one', 'monster-statblock'));
  await assert.rejects(planWorldConversion({ projectRoot: root, expectedCount: 2 }), /数量与预期不符/);
  const plan = await planWorldConversion({ projectRoot: root });
  await add(path, { ...source('world-one', 'monster-statblock'), note: '预检后外部变化' });
  await assert.rejects(applyWorldConversion(plan), /来源在预检后发生变化/);
  await assert.rejects(access(join(root, '资源/怪物图鉴')), { code: 'ENOENT' });
});

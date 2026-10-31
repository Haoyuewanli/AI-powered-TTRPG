import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createModuleRuntime } from '../module-runtime.mjs';
import { openProjectFiles } from '../project-files.mjs';
import { executeAction } from '../../战斗/src/operations.mjs';

let repo = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(repo, 'AGENTS.md'))) repo = dirname(repo);
async function setup() {
  const out = join(repo, '开发记录/临时/模组流程检查'); await mkdir(out, { recursive: true });
  const root = join(await mkdtemp(join(out, 'runtime-')), '项目'), prepared = join(root, '模组/预处理/故事/sample');
  await mkdir(prepared, { recursive: true });
  await writeFile(join(prepared, '预处理.json'), JSON.stringify({ schemaVersion: 1, moduleId: 'sample', title: '合成模组',
    reviewStatus: 'verified', source: { kind: 'synthetic' }, maps: [], storyNodes: [{ id: 'arrival', title: '抵达', description: '由玩家选择路线。' }],
    encounterTemplates: [{ id: 'voyage-merrow', name: '合成登船准备', board: { width: 80, depth: 60, major: 5, minor: 1, terrain: 'open-flat', schematic: true } }] }));
  return { root, runtime: createModuleRuntime({ root }) };
}
const monster = { id: 'synthetic-merrow', name: 'Synthetic Merrow', edition: { rulesFamily: 'dnd-2024' }, source: { path: 'synthetic/怪物图鉴2025/Merrow', book: 'synthetic' },
  statBlock: { armorClass: 13, hitPoints: 45, speedsFeet: { walk: 10 }, initiativeBonus: 2, multiattackCount: 2,
    attacks: [{ name: 'Synthetic A', attackBonus: 6, damageFormula: '1d4+4', damageTypeText: '穿刺伤害', reachFeet: 5 },
      { name: 'Synthetic B', attackBonus: 6, damageFormula: '2d4+4', damageTypeText: '挥砍伤害', reachFeet: 5 },
      { name: 'Synthetic C', attackBonus: 6, damageFormula: '2d6+4', damageTypeText: '穿刺伤害', reachFeet: 5, rangeFeet: { normal: 20, long: 60 } }] } };

test('a prepared module creates an isolated run and a reviewed encounter without starting combat', async () => {
  const { root, runtime } = await setup();
  const result = await runtime.createRun({ templateId: 'sample', name: '合成团', monsterResource: monster });
  const state = JSON.parse(await readFile(join(root, '模组', result.folder, '战斗/存档/战斗状态.json'), 'utf8'));
  assert.equal(state.combat.phase, 'preparing'); assert.equal(state.combat.round, 0); assert(state.actors.every(actor => !actor.confirmed));
  assert.equal(state.actors.length, 2); assert.equal(state.actors[1].hp, 45); assert.equal(state.actors[1].attacks.length, 4);
  assert.equal((await runtime.listRuns()).modules[0].id, result.moduleId);
  assert.equal((await runtime.readRun(result.moduleId)).storyNodes[0].id, 'arrival');
  assert.deepEqual((await readdir(join(root, '模组', result.folder))).sort(), ['对话', '战斗', '故事'].sort());
  const second = await runtime.createRun({ templateId: 'sample', name: '合成团', monsterResource: monster });
  assert.notEqual(second.folder, result.folder); assert.notEqual(second.campaignId, result.campaignId);
});

test('run notes and current deltas bind to the real campaign folder and cannot create a second namesake tree', async () => {
  const { root, runtime } = await setup(), result = await runtime.createRun({ templateId: 'sample', name: '合成团' });
  const files = await openProjectFiles({ root }); await files.initialize();
  const where = await files.moduleLocation(result);
  assert.equal(where.folder, result.folder); assert.equal(where.currentPath, `模组/${result.folder}/故事/当前.json`);
  const saved = await files.saveModuleState({ ...result, kind: '地图状态', state: { selectedMapId: 'map-1', locations: { room: { explored: true, notes: '合成笔记' } } }, expectedRevision: 0 });
  assert.equal(saved.revision, 1);
  assert.equal((await files.readModuleState({ ...result, kind: '地图状态' })).state.locations.room.notes, '合成笔记');
  await assert.rejects(files.saveModuleState({ ...result, kind: '地图状态', state: {}, expectedRevision: 0 }), /版本/);
  const chat = await files.appendDialogue({ ...result, groupId: result.moduleId, groupName: result.moduleName, content: '合成消息', expectedRevision: 1 });
  assert(chat.path.startsWith(`模组/${result.folder}/对话/`));
  assert.deepEqual((await readdir(root)).sort(), ['模组', '资源'].sort());
});

test('module creation refuses an active workspace owner and an unreviewed rules family without changing the registry', async () => {
  const { root, runtime } = await setup();
  await assert.rejects(runtime.createRun({ templateId: 'sample', name: '合成团', monsterResource: { ...monster, edition: { rulesFamily: 'dnd-2014' } } }), /2024/);
  const lock = join(root, '模组/.workspace.lock'); await writeFile(lock, String(process.pid));
  await assert.rejects(runtime.createRun({ templateId: 'sample', name: '合成团' }), /另一个进程/);
  assert.equal(await readFile(lock, 'utf8'), String(process.pid));
  assert.deepEqual((await readdir(join(root, '模组'))).sort(), ['.workspace.lock', '预处理'].sort());
});

test('a reviewed PDF source must retain its exact bytes before a run can use the verified manifest', async () => {
  const { root, runtime } = await setup(), directory = join(root, '模组/预处理/故事/sample');
  const source = join(directory, '原PDF/synthetic.pdf'); await mkdir(dirname(source), { recursive: true });
  const original = Buffer.from('Synthetic source bytes for integrity checks'); await writeFile(source, original);
  const manifestPath = join(directory, '预处理.json'), value = JSON.parse(await readFile(manifestPath, 'utf8'));
  value.source = { kind: 'pdf', relativePath: '原PDF/synthetic.pdf', sha256: createHash('sha256').update(original).digest('hex') };
  await writeFile(manifestPath, JSON.stringify(value));
  const first = await runtime.createRun({ templateId: 'sample', name: '合成核对团' });
  assert.equal((await runtime.readRun(first.moduleId)).source.sha256, value.source.sha256);
  const before = await readFile(join(root, '模组/工作区.json'));
  await writeFile(source, Buffer.from('Changed synthetic source'));
  await assert.rejects(runtime.createRun({ templateId: 'sample', name: '不应创建的团' }), /原始资料已改变/);
  assert.deepEqual(await readFile(join(root, '模组/工作区.json')), before);
});

async function markdownPackage(root, patch = {}) {
  const relativePath = '模组/预处理/多人短团/合成资料包', directory = join(root, relativePath);
  const sourcePath = '模组/预处理/合成输入/source.md', sourceBytes = Buffer.from('# 合成序幕\n供离线接线检查使用。\n');
  await mkdir(directory, { recursive: true }); await mkdir(dirname(join(root, sourcePath)), { recursive: true });
  await writeFile(join(root, sourcePath), sourceBytes);
  const value = { schemaVersion: 1, moduleId: 'markdown-sample', title: '合成资料包', preprocessContract: 'module-md-package-v1', batchId: 'synthetic-b', reviewStatus: 'candidate',
    source: { kind: 'markdown', relativePath: sourcePath, referenceBase: 'project', sha256: createHash('sha256').update(sourceBytes).digest('hex') },
    maps: [], storyNodes: [{ id: 'synthetic-node-voyage-arrival', title: '合成登船场景', description: '供真实流程检查。', source: { mdPath: sourcePath, lines: [1, 2], verification: 'candidate' } },
      { id: 'synthetic-node-appendix', title: '梅洛附录', description: '不属于试玩场景。' }],
    encounterTemplates: [{ id: 'synthetic-enc-voyage-merrow', name: '合成序幕', source: { mdPath: sourcePath, lines: [1, 2] }, board: { width: 80, depth: 60 } }], ...patch };
  const path = join(directory, '预处理.json'); await writeFile(path, JSON.stringify(value));
  return { value, path, directory, relativePath, sourcePath: join(root, sourcePath) };
}

test('categorized Markdown packages retain exact identity and candidate status in independent runs', async () => {
  const { root, runtime } = await setup(), fixture = await markdownPackage(root);
  await writeFile(join(root, '模组/预处理/多人短团/README.md'), '分类说明不应隐藏已准备模组。');
  const before = await readFile(fixture.path), sourceBefore = await readFile(fixture.sourcePath);
  const catalog = await runtime.templates(), prepared = catalog.templates.find(entry => entry.id === 'markdown-sample');
  assert.equal(catalog.issues.length, 0); assert.equal(prepared.category, '多人短团'); assert.equal(prepared.relativePath, fixture.relativePath);
  assert.equal(prepared.batchId, 'synthetic-b'); assert.equal(prepared.packageSha256, createHash('sha256').update(before).digest('hex'));
  assert.equal(catalog.templates.find(entry => entry.id === 'sample').category, null);
  const created = await runtime.createRun({ templateId: prepared.id, name: '候选包测试', expectedPackageSha256: prepared.packageSha256 });
  const saved = await runtime.readRun(created.moduleId);
  assert.deepEqual(saved.templateIdentity, { moduleId: prepared.id, batchId: 'synthetic-b', packageSha256: prepared.packageSha256, path: fixture.relativePath + '/预处理.json' });
  assert.equal(saved.reviewStatus, 'candidate'); assert.equal(saved.training, undefined);
  assert.deepEqual(await readFile(fixture.path), before); assert.deepEqual(await readFile(fixture.sourcePath), sourceBefore);
});

test('changed Markdown sources and stale package selections cannot create or register a run', async () => {
  const { root, runtime } = await setup(), fixture = await markdownPackage(root);
  const prepared = (await runtime.templates()).templates.find(entry => entry.id === 'markdown-sample');
  await writeFile(fixture.path, JSON.stringify({ ...fixture.value, title: '已改变的候选包' }));
  await assert.rejects(runtime.createRun({ templateId: prepared.id, name: '拒绝旧选择', expectedPackageSha256: prepared.packageSha256 }), /模组包已变化/);
  await writeFile(fixture.sourcePath, '外部修改的来源');
  const catalog = await runtime.templates();
  assert(!catalog.templates.some(entry => entry.id === prepared.id)); assert(catalog.issues.some(entry => entry.id === prepared.id && /原始资料已改变/.test(entry.error)));
  await assert.rejects(runtime.createRun({ templateId: prepared.id, name: '拒绝变化来源' }), /原始资料已改变/);
  assert.deepEqual((await readdir(join(root, '模组'))).sort(), ['预处理']);
});

test('duplicate IDs, missing manifests and bad package JSON remain visible without an ambiguous selectable package', async () => {
  const { root, runtime } = await setup(), fixture = await markdownPackage(root);
  const duplicate = join(root, '模组/预处理/另一分类/副本'); await mkdir(duplicate, { recursive: true });
  await writeFile(join(duplicate, '预处理.json'), await readFile(fixture.path));
  const missing = join(root, '模组/预处理/另一分类/缺失包'); await mkdir(missing);
  const broken = join(root, '模组/预处理/另一分类/损坏包'); await mkdir(broken); await writeFile(join(broken, '预处理.json'), '{');
  const catalog = await runtime.templates();
  assert(!catalog.templates.some(entry => entry.id === 'markdown-sample'));
  assert(catalog.issues.some(entry => entry.id === 'markdown-sample' && /重复/.test(entry.error)));
  assert(catalog.issues.some(entry => entry.folder.endsWith('/缺失包') && /缺少预处理/.test(entry.error)));
  assert(catalog.issues.some(entry => entry.folder.endsWith('/损坏包')));
  await assert.rejects(runtime.createRun({ templateId: 'markdown-sample', name: '重复拒绝' }), /重复/);
  assert.deepEqual((await readdir(join(root, '模组'))).sort(), ['预处理']);
});

test('unsupported, unsafe and missing Markdown sources do not bypass package checks', async () => {
  for (const [patch, expected] of [
    [{ kind: 'unknown' }, /类型不受支持/], [{ kind: 'synthetic' }, /不能使用合成来源/],
    [{ relativePath: '../outside.md' }, /引用或摘要无效/], [{ relativePath: '资源/private.md' }, /来源范围/],
    [{ relativePath: '模组/预处理/合成输入/missing.md' }, /原始资料缺失/]
  ]) {
    const { root, runtime } = await setup(), fixture = await markdownPackage(root);
    await writeFile(fixture.path, JSON.stringify({ ...fixture.value, source: { ...fixture.value.source, ...patch } }));
    const catalog = await runtime.templates(); assert(!catalog.templates.some(entry => entry.id === 'markdown-sample'));
    assert(catalog.issues.some(entry => entry.id === 'markdown-sample' && expected.test(entry.error)));
    await assert.rejects(runtime.createRun({ templateId: 'markdown-sample', name: '无效来源拒绝' }), expected);
  }
});

test('voyage training binds source nodes and 2024 monster identity while ordinary movement uses the existing rule engine', async () => {
  const { root, runtime } = await setup(); await markdownPackage(root);
  await assert.rejects(runtime.createRun({ templateId: 'markdown-sample', name: '缺敌人训练', training: true }), /2024梅洛资源/);
  const result = await runtime.createRun({ templateId: 'markdown-sample', name: '序幕训练', monsterResource: monster, training: true });
  const saved = await runtime.readRun(result.moduleId);
  assert.equal(saved.training.kind, 'voyage-training-v1'); assert.equal(saved.training.encounterId, 'synthetic-enc-voyage-merrow');
  assert.equal(saved.training.monsterResourceId, monster.id); assert.equal(saved.reviewStatus, 'candidate');
  assert.deepEqual(saved.training.sceneNodes.map(node => node.id), ['synthetic-node-voyage-arrival']);
  const state = JSON.parse(await readFile(join(root, '模组', result.folder, '战斗/存档/战斗状态.json'), 'utf8'));
  assert.equal(state.combat.phase, 'preparing'); assert(state.actors.every(actor => !actor.confirmed));
  assert.equal(state.objects[0].type, 'tile'); assert.equal(state.objects[0].position.y, 0); assert(state.actors.every(actor => actor.position.y === 0));
  const pc = state.actors[0], enemy = state.actors[1];
  assert.equal(enemy.hp, 45); assert.equal(enemy.reference.resourceId, monster.id);
  state.actors.forEach(actor => { actor.confirmed = true; });
  state.combat = { ...state.combat, phase: 'active', round: 1, order: [pc.id, enemy.id], index: 0, initiative: [{ actorId: pc.id, total: 20 }, { actorId: enemy.id, total: 10 }] };
  const position = { ...pc.position, x: pc.position.x + 5 };
  const moved = executeAction(state, { campaignId: state.campaignId, battleId: state.battleId, actionId: 'training-move-five', expectedRevision: state.revision, type: 'move', payload: { actorId: pc.id, position } }, { role: 'dm', id: 'DM' });
  assert.equal(moved.actors[0].position.x, position.x); assert.equal(moved.combat.moved, 5);
});

test('training without source scene nodes fails before creating a partial campaign directory', async () => {
  const { root, runtime } = await setup(); await markdownPackage(root, { storyNodes: [] });
  await assert.rejects(runtime.createRun({ templateId: 'markdown-sample', name: '拒绝空白训练', training: true, monsterResource: monster }), /缺少可追溯故事节点/);
  assert.deepEqual((await readdir(join(root, '模组'))).sort(), ['预处理']);
});

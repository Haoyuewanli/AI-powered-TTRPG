import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createModuleRuntime } from '../module-runtime.mjs';
import { openProjectFiles } from '../project-files.mjs';

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

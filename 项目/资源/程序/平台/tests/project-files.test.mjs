import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rename, readdir, symlink, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { openProjectFiles, archiveInitial, resourceProjectPath, projectRelativePath, RESOURCE_KINDS } from '../project-files.mjs';

let repository = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(repository, 'AGENTS.md'))) {
  const parent = dirname(repository); if (parent === repository) throw new Error('Run these checks inside the project workspace'); repository = parent;
}
const output = join(repository, '开发记录', '临时', '平台文件系统检查');
const INDEX = '资源/故事/G/管理索引.json';
const RELEASES = '资源/故事/F/发放记录.json';
const hash = value => createHash('sha256').update(value).digest('hex');
const stringify = value => JSON.stringify(value, null, 2) + '\n';

async function fixture(prefix = 'case-') {
  await mkdir(output, { recursive: true }); const directory = await mkdtemp(join(output, prefix));
  const root = join(directory, '项目'); const files = await openProjectFiles({ root }); await files.initialize();
  return { directory, root, files, async put(path, value) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), typeof value === 'string' ? value : stringify(value)); } };
}
async function seed(fixture) {
  await fixture.put('资源/NPC/L/旅人.json', { id: 'npc-traveller', name: '旅人', hp: 12, resourcePools: { spells: 3 } });
  await fixture.put('资源/地图/S/石桥.svg', '<svg xmlns="http://www.w3.org/2000/svg"><title>Public synthetic bridge</title></svg>');
}
const reference = { moduleId: 'module-one', moduleName: '合成短团', resourceId: 'npc-traveller' };

test('initialize creates two project roots, the preprocessing subtrees and seven A-Z archives', async () => {
  const { root, files } = await fixture('layout-');
  assert.deepEqual((await readdir(root)).sort(), ['模组', '资源'].sort());
  assert.deepEqual((await readdir(join(root, '模组/预处理'))).sort(), ['故事', '对话', '战斗'].sort());
  assert.equal(RESOURCE_KINDS.length, 7);
  assert.deepEqual((await readdir(join(root, '资源'))).sort(), [...RESOURCE_KINDS].sort());
  for (const kind of RESOURCE_KINDS) assert.equal((await readdir(join(root, '资源', kind))).length, 26);
  assert.deepEqual(await files.manifest(), { formatVersion: 1, revision: 0 });
  assert.deepEqual((await files.listResources()).resources, []);
  assert.deepEqual((await files.listResources()).issues, []);
});

test('archive initials support Latin, Chinese pinyin boundaries, explicit polyphonic correction and a visible fallback', () => {
  assert.deepEqual(archiveInitial('Alice'), { letter: 'A', method: 'latin', needsReview: false });
  for (const [word, letter] of [['阿林', 'A'], ['白塔', 'B'], ['地图', 'D'], ['法师', 'F'], ['怪物', 'G'], ['角色', 'J'], ['旅人', 'L'], ['模组', 'M'], ['石桥', 'S']]) assert.equal(archiveInitial(word).letter, letter, word);
  assert.deepEqual(archiveInitial('重庆', 'C'), { letter: 'C', method: 'explicit', needsReview: false });
  assert.equal(archiveInitial('旅人').needsReview, true);
  assert.equal(archiveInitial('123').method, 'fallback');
  assert.equal(resourceProjectPath('角色', 'Alice.json'), '资源/角色/A/Alice.json');
  assert.equal(resourceProjectPath('物品', 'item.json'), '资源/物品/I/item.json');
  assert.throws(() => resourceProjectPath('未知类型', 'item.json'), /资源类型/);
  for (const path of ['../outside', '/absolute', 'D:/outside', '资源\\NPC\\a.json', '资源/../README.md', '资源//a.json']) assert.throws(() => projectRelativePath(path), /相对路径/);
});

test('JSON resources keep explicit IDs and duplicate IDs or damaged documents are reported without rewriting', async () => {
  const fixtureValue = await fixture('json-'); const { root, files } = fixtureValue;
  await fixtureValue.put('资源/NPC/L/旅人.json', { id: 'file-explicit-json', name: '旅人' });
  const first = await files.listResources(); assert.equal(first.resources[0].id, 'file-explicit-json');
  await fixtureValue.put('资源/怪物/L/旅人.json', { id: 'file-explicit-json', name: '另一旅人' });
  await fixtureValue.put('资源/故事/H/坏文件.json', '{bad');
  const before = await readFile(join(root, '资源/故事/H/坏文件.json'));
  const listed = await files.listResources();
  assert.equal(listed.resources.length, 0); assert.equal(listed.issues.length, 2);
  await assert.rejects(files.scanResources({ expectedRevision: 0 }), error => error.code === 'RESOURCE_SCAN_ISSUES' && error.issues.length === 2);
  assert.deepEqual(await readFile(join(root, '资源/故事/H/坏文件.json')), before);
  assert.equal((await files.manifest()).revision, 0);
});

test('non-JSON IDs survive content edits, renaming, reclassification and a service reopen', async () => {
  const fixtureValue = await fixture('stable-'); const { root, files } = fixtureValue; await seed(fixtureValue);
  assert.equal((await files.listResources()).resources.length, 1, 'unindexed binary resources need an explicit refresh');
  let result = await files.scanResources({ expectedRevision: 0 });
  const id = result.resources.find(entry => entry.kind === '地图').id;
  await fixtureValue.put('资源/地图/S/石桥.svg', '<svg>edited</svg>');
  result = await files.scanResources({ expectedRevision: result.revision });
  assert.equal(result.resources.find(entry => entry.kind === '地图').id, id);
  await rename(join(root, '资源/地图/S/石桥.svg'), join(root, '资源/地图/B/Bridge.svg'));
  result = await files.scanResources({ expectedRevision: result.revision });
  assert.equal(result.resources.find(entry => entry.kind === '地图').id, id);
  const reopened = await openProjectFiles({ root }); await reopened.initialize();
  assert.equal((await reopened.readResource(id)).resource.path, '资源/地图/B/Bridge.svg');
  assert.equal((await reopened.listResources()).issues.length, 0, 'management files do not become resources');
});

test('a temporarily missing non-JSON resource retains its index and only the registered legacy subtree is excluded', async () => {
  const fixtureValue = await fixture('internal-'); const { directory, root, files } = fixtureValue; await seed(fixtureValue);
  let result = await files.scanResources({ expectedRevision: 0 }); const id = result.resources.find(entry => entry.kind === '地图').id;
  await rename(join(root, '资源/地图/S/石桥.svg'), join(directory, 'held.svg'));
  result = await files.scanResources({ expectedRevision: result.revision });
  await rename(join(directory, 'held.svg'), join(root, '资源/地图/B/Bridge.svg'));
  result = await files.scanResources({ expectedRevision: result.revision });
  assert.equal(result.resources.find(entry => entry.kind === '地图').id, id);
  await fixtureValue.put('资源/故事/Z/战役存档/旧团/战斗状态.json', { campaignId: 'legacy-state-without-resource-id' });
  await fixtureValue.put('资源/故事/Z/正常故事.json', { id: 'story-z', name: '正常故事' });
  const listed = await files.listResources();
  assert.equal(listed.issues.length, 0); assert(listed.resources.some(entry => entry.id === 'story-z'));
  assert(!listed.resources.some(entry => entry.path.includes('战役存档')));
});

test('reference and explicit release persist project-relative paths while player reads enforce the grant', async () => {
  const fixtureValue = await fixture('release-'); const { root, files } = fixtureValue; await seed(fixtureValue);
  let result = await files.reference({ ...reference, expectedRevision: 0 });
  assert.equal(result.reference.path, '资源/NPC/L/旅人.json'); assert.equal(result.reference.current, '模组/合成短团/故事/当前.json');
  assert.deepEqual(result.instance.delta, {});
  assert.equal((await files.listResources({ playerId: 'player-one' })).resources.length, 0);
  await assert.rejects(files.readResource('npc-traveller', { playerId: 'player-one' }), error => error.status === 403);
  result = await files.releaseAndReference({ ...reference, playerId: 'player-one', expectedRevision: result.revision });
  assert.equal((await files.listResources({ playerId: 'player-one' })).resources.length, 1);
  assert.equal((await files.readResource('npc-traveller', { playerId: 'player-one' })).resource.id, 'npc-traveller');
  await assert.rejects(files.readResource('npc-traveller', { playerId: 'player-two' }), error => error.status === 403);
  const grants = JSON.parse(await readFile(join(root, RELEASES), 'utf8'));
  assert.equal(grants.releases[0].path, '资源/NPC/L/旅人.json');
  const target = await files.revealTarget('npc-traveller'); assert.equal(target.directory, join(root, '资源/NPC/L'));
  const reopened = await openProjectFiles({ root }); await reopened.initialize();
  assert.equal((await reopened.listResources({ playerId: 'player-one' })).resources.length, 1);
});

test('current stores resource baselines and negative deltas without changing shared definitions', async () => {
  const fixtureValue = await fixture('current-'); const { root, files } = fixtureValue; await seed(fixtureValue);
  const before = await readFile(join(root, '资源/NPC/L/旅人.json'));
  const result = await files.saveCurrent({ ...reference, delta: { hp: -7, spellSlots: { one: -1 } }, expectedRevision: 0 });
  assert.deepEqual(result.instance.delta, { hp: -7, spellSlots: { one: -1 } });
  assert.equal(result.instance.base, '资源/NPC/L/旅人.json');
  assert.deepEqual(await readFile(join(root, '资源/NPC/L/旅人.json')), before);
  await assert.rejects(files.saveCurrent({ ...reference, delta: { hp: NaN }, expectedRevision: result.revision }), /无效数字/);
  const another = await files.reference({ ...reference, moduleId: 'different-module', expectedRevision: result.revision });
  assert.notEqual(another.reference.current, result.reference.current);
});

test('module folders retain readable names while duplicate, illegal and renamed names remain bound to stable IDs', async () => {
  const fixtureValue = await fixture('module-names-'); const { files } = fixtureValue; await seed(fixtureValue);
  const first = await files.reference({ ...reference, expectedRevision: 0 });
  const duplicate = await files.reference({ ...reference, moduleId: 'second-module', expectedRevision: first.revision });
  assert.equal(first.reference.current, '模组/合成短团/故事/当前.json'); assert.notEqual(duplicate.reference.current, first.reference.current);
  const illegal = await files.reference({ ...reference, moduleId: 'third-module', moduleName: '名称/含:非法字符', expectedRevision: duplicate.revision });
  assert(!illegal.reference.current.includes('名称/含:')); assert(illegal.reference.current.includes('--'));
  const renamed = await files.reference({ ...reference, moduleName: '改名后的团', expectedRevision: illegal.revision });
  assert.equal(renamed.reference.current, first.reference.current);
  const battle = await files.saveBattle({ moduleId: reference.moduleId, moduleName: '再改名', battleId: 'battle-name', resourceIds: ['npc-traveller'], expectedRevision: renamed.revision });
  assert(battle.callPath.startsWith('模组/合成短团/战斗/'));
});

test('battle call JSON references resource/current files and writes a separate TXT log', async () => {
  const fixtureValue = await fixture('battle-'); const { root, files } = fixtureValue; await seed(fixtureValue);
  const current = await files.saveCurrent({ ...reference, delta: { hp: -2 }, expectedRevision: 0 });
  const result = await files.saveBattle({ moduleId: reference.moduleId, moduleName: reference.moduleName, battleId: 'battle-one', name: '石桥战斗',
    resourceIds: ['npc-traveller'], currentIds: [current.instance.id], payload: { phase: 'preparing' }, logText: '合成日志\n', expectedRevision: current.revision });
  const call = JSON.parse(await readFile(join(root, result.callPath), 'utf8'));
  assert.deepEqual(call.resources, [{ resourceId: 'npc-traveller', path: '资源/NPC/L/旅人.json' }]);
  assert.equal(call.current.path, '模组/合成短团/故事/当前.json'); assert.equal(call.current.instanceIds[0], current.instance.id);
  assert.equal(await readFile(join(root, result.logPath), 'utf8'), '合成日志\n');
});

test('dialogue Markdown preserves timestamps, content and project-relative resource references', async () => {
  const fixtureValue = await fixture('dialogue-'); const { root, files } = fixtureValue; await seed(fixtureValue);
  const result = await files.appendDialogue({ groupId: 'chat-one', groupName: '合成群聊', content: '旅人在桥边。<script>作为游戏数据</script>',
    resourceIds: ['npc-traveller'], timestamp: '2026-10-28T00:00:00.000Z', expectedRevision: 0 });
  const text = await readFile(join(root, result.path), 'utf8');
  assert(text.includes('2026-10-28T00:00:00.000Z')); assert(text.includes('<script>作为游戏数据</script>'));
  assert(text.includes('(<资源/NPC/L/旅人.json>)')); assert(!text.includes(root)); assert(!text.includes('..'));
  assert.equal(JSON.parse(await readFile(join(root, result.callPath), 'utf8')).referenceBase, 'project');
  const appended = await files.appendDialogue({ groupId: 'chat-one', groupName: '合成群聊', content: '第二条合成消息', expectedRevision: result.revision });
  assert((await readFile(join(root, appended.path), 'utf8')).startsWith(text));
  const another = await files.appendDialogue({ groupId: 'different-chat', groupName: '合成群聊', content: '另一群的消息', expectedRevision: appended.revision });
  assert.notEqual(another.path, result.path);
  const restored = await files.readDialogue({ groupId: 'chat-one', groupName: '改名后的群聊' });
  assert.equal(restored.path, result.path); assert(restored.content.includes('第二条合成消息'));
  const absent = await files.readDialogue({ groupId: 'missing-chat', groupName: '不存在的群聊' }); assert.equal(absent.content, '');
  const illegal = await files.appendDialogue({ groupId: 'third-chat', groupName: '名字/含:斜杠', content: '安全目录', expectedRevision: another.revision });
  assert(!illegal.path.includes('名字/含:')); assert((await files.readDialogue({ groupId: 'third-chat', groupName: '名字/含:斜杠' })).content.includes('安全目录'));
});

test('concurrent writes use revisions and external edits are preserved instead of overwritten', async () => {
  const fixtureValue = await fixture('conflict-'); const { root, files } = fixtureValue; await seed(fixtureValue);
  const results = await Promise.allSettled([files.reference({ ...reference, expectedRevision: 0 }), files.reference({ ...reference, expectedRevision: 0 })]);
  assert.equal(results.filter(entry => entry.status === 'fulfilled').length, 1);
  assert.equal(results.find(entry => entry.status === 'rejected').reason.status, 409);
  const current = '模组/合成短团/故事/当前.json'; const edited = JSON.parse(await readFile(join(root, current), 'utf8'));
  edited.instances[0].delta = { hp: -11 }; await fixtureValue.put(current, edited);
  const before = await readFile(join(root, current));
  await assert.rejects(files.reference({ ...reference, expectedRevision: 1 }), /其他程序修改/);
  assert.deepEqual(await readFile(join(root, current)), before);
});

test('junctions and symlinks cannot redirect reads or writes outside the project', async t => {
  const fixtureValue = await fixture('links-'); const { directory, root, files } = fixtureValue; await seed(fixtureValue);
  const outside = join(directory, 'outside'); await mkdir(outside);
  try { await symlink(outside, join(root, '模组', '链接模组'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('Environment cannot create a test directory link'); throw error; }
  await assert.rejects(files.reference({ ...reference, moduleName: '链接模组', expectedRevision: 0 }), /链接|junction/);
  assert.deepEqual(await readdir(outside), []);
  await symlink(outside, join(root, '资源/NPC/L/外链'), process.platform === 'win32' ? 'junction' : 'dir');
  assert((await files.listResources()).issues.some(entry => entry.error.includes('链接')));
  await assert.rejects(files.scanResources({ expectedRevision: 0 }), error => error.code === 'RESOURCE_SCAN_ISSUES');
});

test('damaged management JSON and releases remain untouched and cannot reset permissions', async () => {
  const fixtureValue = await fixture('damaged-'); const { root, files } = fixtureValue; await seed(fixtureValue);
  await files.releaseAndReference({ ...reference, playerId: 'player-one', expectedRevision: 0 });
  await fixtureValue.put(RELEASES, '{broken');
  await assert.rejects(files.listResources({ playerId: 'player-one' }), /有效JSON/);
  await assert.rejects(files.releaseAndReference({ ...reference, playerId: 'player-two', expectedRevision: 1 }), /有效JSON/);
  assert.equal(await readFile(join(root, RELEASES), 'utf8'), '{broken');
  await fixtureValue.put(INDEX, '{also broken');
  const reopened = await openProjectFiles({ root }); await assert.rejects(reopened.initialize(), /有效JSON/);
  assert.equal(await readFile(join(root, INDEX), 'utf8'), '{also broken');
});

test('an interrupted managed transaction recovers consistently while an unsafe journal stays rejected', async () => {
  const fixtureValue = await fixture('recovery-'); const { root } = fixtureValue;
  const index = JSON.parse(await readFile(join(root, INDEX), 'utf8'));
  const text = '# 合成恢复\n', path = '模组/恢复模组/对话/恢复群聊/对话.md';
  const nextIndex = { ...index, revision: 1, documents: { [path]: hash(text) } };
  await fixtureValue.put('资源/故事/G/待完成事务.json', { formatVersion: 1, baseRevision: 0, nextIndex, writes: [{ path, before: null, after: text }] });
  const exited = spawnSync(process.execPath, ['-e', ''], { windowsHide: true }); assert.equal(exited.status, 0);
  await fixtureValue.put('资源/故事/G/.管理.lock', String(exited.pid));
  const recovered = await openProjectFiles({ root }); await recovered.initialize();
  assert.equal(await readFile(join(root, path), 'utf8'), text); assert.equal((await recovered.manifest()).revision, 1);
  await assert.rejects(access(join(root, '资源/故事/G/待完成事务.json')), { code: 'ENOENT' });
  const unsafe = { ...nextIndex, revision: 2, documents: { ...nextIndex.documents, 'README.md': hash('overwrite') } };
  await fixtureValue.put('README.md', 'keep');
  await fixtureValue.put('资源/故事/G/待完成事务.json', { formatVersion: 1, baseRevision: 1, nextIndex: unsafe, writes: [{ path: 'README.md', before: hash('keep'), after: 'overwrite' }] });
  const rejected = await openProjectFiles({ root }); await assert.rejects(rejected.initialize(), /范围无效/);
  assert.equal(await readFile(join(root, 'README.md'), 'utf8'), 'keep');
});

test('live and unknown lock ownership are preserved instead of being cleared', async () => {
  const fixtureValue = await fixture('locks-'); const { root } = fixtureValue;
  for (const owner of [String(process.pid), 'unknown-owner']) {
    await fixtureValue.put('资源/故事/G/.管理.lock', owner);
    const reopened = await openProjectFiles({ root }); await assert.rejects(reopened.initialize(), /归属不明|另一进程/);
    assert.equal(await readFile(join(root, '资源/故事/G/.管理.lock'), 'utf8'), owner);
  }
});

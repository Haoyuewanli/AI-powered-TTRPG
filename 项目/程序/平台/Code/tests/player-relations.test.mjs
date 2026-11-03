import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createLibraryStore } from '../library-store.mjs';
import { createPlayerStore } from '../player-store.mjs';
import { outputDirectory } from './check-helpers.mjs';

const dm = { role: 'dm' };
async function setup() {
  await mkdir(outputDirectory, { recursive: true });
  const root = await mkdtemp(join(outputDirectory, 'player-relations-')), library = createLibraryStore({ root }), players = createPlayerStore({ root });
  async function operate(body) { return library.playerOperation(dm, { ...body, expectedRevision: (await players.tree()).revision }); }
  for (const name of ['玩家甲', '玩家乙']) await operate({ action: 'create', name });
  await operate({ action: 'create', parent: '玩家甲', name: '角色档案-测试' });
  await operate({ action: 'create', parent: '玩家甲/角色档案-测试', name: '01级' });
  const module = join(root, '模组/测试'); await mkdir(module, { recursive: true });
  await writeFile(join(module, '模组.json'), JSON.stringify({ id: 'module', name: '测试模组' }));
  for (const runId of ['run-a', 'run-b']) {
    const path = join(module, '游玩团', runId); await mkdir(path, { recursive: true });
    await writeFile(join(path, '团.json'), JSON.stringify({ id: runId, moduleId: 'module', name: runId, characters: [{ id: 'old-' + runId, name: '旧角色', playerId: 'old-player', playerName: '旧玩家' }] }));
    await writeFile(join(path, '群聊.json'), '[]'); await writeFile(join(path, '画布.json'), '{"marker":"preserve"}');
  }
  const pictures = join(module, '资源/人物'); await mkdir(pictures, { recursive: true });
  await writeFile(join(pictures, '角色.md'), '---\n' + JSON.stringify({ id: 'portrait', name: '合成配图', kind: '人物' }) + '\n---\n# 主持秘密\n![配图](image.png)');
  await writeFile(join(pictures, 'image.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
  await library.select(dm, { moduleId: 'module', runId: 'run-a' });
  const characterId = (await library.playerRelations(dm)).characters[0].id;
  const resourceId = (await players.records()).resources[0].resource.id;
  async function relate(runRefs, overrides = {}) {
    const context = await library.playerRelations(dm);
    return library.setPlayerRelations(dm, { characterId, runRefs, expectedRevision: context.revision, expectedPlayerRevision: context.playerRevision, ...overrides });
  }
  const references = ['run-a', 'run-b'].map(runId => ({ moduleId: 'module', runId }));
  return { root, module, library, players, operate, characterId, resourceId, relate, references };
}

test('角色多团关联不切当前团、不修改原团名单及群聊画布，稳定身份随档案目录移动', async () => {
  const { module, library, relate, references, operate, characterId } = await setup();
  const before = await readFile(join(module, '游玩团/run-b/团.json'), 'utf8');
  await relate(references);
  let overview = await library.playerRelations(dm);
  assert.equal(overview.characters[0].memberships.length, 2);
  assert.equal(overview.runs.filter(run => run.characters.some(character => character.archiveCharacterId === characterId)).length, 2);
  assert.equal((await library.context(dm)).selected.runId, 'run-a');
  assert.equal(await readFile(join(module, '游玩团/run-b/团.json'), 'utf8'), before);
  await operate({ action: 'move', path: '玩家甲/角色档案-测试', parent: '玩家乙' });
  overview = await library.playerRelations(dm);
  assert.equal(overview.characters[0].ownerName, '玩家乙'); assert.equal(overview.characters[0].memberships.length, 2);
  await operate({ action: 'rename', path: '玩家乙/角色档案-测试', name: '改名角色-测试' });
  assert.equal((await library.playerRelations(dm)).characters[0].id, characterId);
  await relate([]);
  for (const runId of ['run-a', 'run-b']) {
    assert.equal(await readFile(join(module, '游玩团', runId, '群聊.json'), 'utf8'), '[]');
    assert.equal(await readFile(join(module, '游玩团', runId, '画布.json'), 'utf8'), '{"marker":"preserve"}');
  }
});

test('显式关联旧成员不会重复，移出或重新加入不恢复旧名单、邀请与授权', async () => {
  const { library, characterId, resourceId, relate, references } = await setup();
  const ref = { ...references[0], legacyCharacterId: 'old-run-a' };
  await relate([ref]);
  let overview = await library.playerRelations(dm), member = overview.runs[0].characters.find(character => character.archiveCharacterId === characterId);
  assert.equal(overview.runs[0].characters.length, 1); assert.equal(overview.characters[0].memberships[0].legacyCharacterId, 'old-run-a');
  const invite = await library.createInvite(dm, { ...ref, playerId: member.playerId });
  assert.equal((await library.read({ token: invite.token }, resourceId)).resource.id, resourceId);
  await library.setShares(dm, { resourceId: 'portrait', characterIds: [member.id], expectedRevision: (await library.context(dm)).revision });
  assert.match((await library.read({ token: invite.token }, 'portrait')).text, /配图/);
  assert.equal((await library.notifications({ token: invite.token })).notifications[0].canOpen, true);
  await relate([]);
  await assert.rejects(library.join(invite.token), error => error.status === 401);
  assert.equal((await library.playerRelations(dm)).runs[0].characters.length, 0);
  await relate([references[0]]);
  overview = await library.playerRelations(dm); const newMember = overview.runs[0].characters[0];
  assert.notEqual(newMember.id, member.id);
  await assert.rejects(library.join(invite.token), error => error.status === 401);
  const newInvite = await library.createInvite(dm, { ...references[0], playerId: newMember.playerId });
  await assert.rejects(library.read({ token: newInvite.token }, 'portrait'), error => error.status === 403);
  assert.equal((await library.notifications({ token: newInvite.token })).notifications[0].canOpen, false);
});

test('角色更换玩家后旧身份失效，新玩家不继承之前开放的模组图片', async () => {
  const { library, characterId, resourceId, relate, references, operate } = await setup();
  await relate(references);
  const before = await library.playerRelations(dm), member = before.runs[0].characters.find(character => character.archiveCharacterId === characterId);
  const oldInvite = await library.createInvite(dm, { ...references[0], playerId: member.playerId });
  await library.setShares(dm, { resourceId: 'portrait', characterIds: [member.id], expectedRevision: (await library.context(dm)).revision });
  await operate({ action: 'move', path: '玩家甲/角色档案-测试', parent: '玩家乙' });
  await assert.rejects(library.join(oldInvite.token), error => error.status === 401);
  const next = (await library.playerRelations(dm)).runs[0].characters.find(character => character.archiveCharacterId === characterId);
  assert.notEqual(next.id, member.id); assert.notEqual(next.playerId, member.playerId);
  const invite = await library.createInvite(dm, { ...references[0], playerId: next.playerId });
  assert.equal((await library.read({ token: invite.token }, resourceId)).resource.ownerName, '玩家乙');
  await assert.rejects(library.read({ token: invite.token }, 'portrait'), error => error.status === 403);
  assert.equal((await library.notifications(dm)).notifications[0].canOpen, false);
  await operate({ action: 'move', path: '玩家乙/角色档案-测试', parent: '玩家甲' });
  await assert.rejects(library.join(oldInvite.token), error => error.status === 401);
  const returned = (await library.playerRelations(dm)).runs[0].characters.find(character => character.archiveCharacterId === characterId);
  assert.notEqual(returned.id, member.id);
});

test('旧版本和外部名单修改拒绝保存；Player不能改关联或代生成邀请', async () => {
  const { module, library, characterId, relate, references } = await setup();
  let before = await library.playerRelations(dm);
  await relate([references[0]]);
  await assert.rejects(library.setPlayerRelations(dm, { characterId, runRefs: references, expectedRevision: before.revision, expectedPlayerRevision: before.playerRevision }), error => error.status === 409);
  before = await library.playerRelations(dm);
  const path = join(module, '游玩团/run-b/团.json'), run = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...run, name: '外部修改' }));
  await assert.rejects(library.setPlayerRelations(dm, { characterId, runRefs: references, expectedRevision: before.revision, expectedPlayerRevision: before.playerRevision }), error => error.status === 409);
  const member = before.runs[0].characters.find(character => character.archiveCharacterId === characterId);
  const invite = await library.createInvite(dm, { ...references[0], playerId: member.playerId });
  await assert.rejects(library.playerRelations({ token: invite.token }), error => error.status === 403);
  await assert.rejects(library.setPlayerRelations({ token: invite.token }, {}), error => error.status === 403);
  await assert.rejects(library.createInvite({ token: invite.token }, { ...references[1], playerId: 'old-player' }), error => error.status === 403);
  await library.revokeInvite(dm, { ...references[0], inviteId: invite.inviteId });
  await assert.rejects(library.join(invite.token), error => error.status === 401);
});

test('正常选择、改名、添加角色不物化派生成员；团副本获得新关联且不继承授权', async () => {
  const { module, library, characterId, relate, references } = await setup();
  await relate([{ ...references[0], legacyCharacterId: 'old-run-a' }]);
  await library.select(dm, references[0]);
  await library.addCharacter(dm, { name: '额外旧式成员' });
  await library.manageRun(dm, { ...references[0], action: 'rename', name: '改名团', expectedRevision: (await library.context(dm)).revision });
  const stored = JSON.parse(await readFile(join(module, '游玩团/run-a/团.json'), 'utf8'));
  assert.equal(stored.characters.length, 2); assert.equal(stored.characters.some(character => character.archiveCharacterId), false);
  await library.manageRun(dm, { ...references[0], action: 'copy', name: '副本团', expectedRevision: (await library.context(dm)).revision });
  const overview = await library.playerRelations(dm), original = overview.runs.find(run => run.runId === 'run-a'), copy = overview.runs.find(run => run.runName === '副本团');
  assert.equal(copy.characters.length, original.characters.length);
  assert.notEqual(copy.characters.find(character => character.archiveCharacterId === characterId).id, original.characters.find(character => character.archiveCharacterId === characterId).id);
  assert.equal((await library.context(dm)).selected.runId, 'run-a');
});

test('一团关系变更不使未变团或其他玩家的邀请失效', async () => {
  const { library, relate, references, operate, characterId } = await setup();
  await operate({ action: 'create', parent: '玩家乙', name: '第二角色-测试' });
  const secondId = (await library.playerRelations(dm)).characters.find(character => character.ownerName === '玩家乙').id;
  await relate(references); await relate([references[0]], { characterId: secondId });
  const overview = await library.playerRelations(dm);
  const invites = [];
  for (const [character, reference] of [[characterId, references[0]], [characterId, references[1]], [secondId, references[0]]]) {
    const member = overview.runs.find(run => run.runId === reference.runId).characters.find(item => item.archiveCharacterId === character);
    invites.push(await library.createInvite(dm, { ...reference, playerId: member.playerId }));
  }
  await relate([references[0]]);
  assert.equal((await library.join(invites[0].token)).selected.runId, 'run-a');
  await assert.rejects(library.join(invites[1].token), error => error.status === 401);
  assert.equal((await library.join(invites[2].token)).selected.runId, 'run-a');
});

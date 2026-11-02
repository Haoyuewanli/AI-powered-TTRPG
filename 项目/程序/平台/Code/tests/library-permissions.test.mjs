import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createLibraryStore, parseLibraryMarkdown } from '../library-store.mjs';
import { createLibraryApi } from '../library-api.mjs';
import { outputDirectory } from './check-helpers.mjs';

const dm = { role: 'dm' };
const markdown = (meta, text = '# 正文\n可读资料') => '---\n' + JSON.stringify(meta, null, 2) + '\n---\n' + text;
async function fixture() {
  await mkdir(outputDirectory, { recursive: true }); const root = await mkdtemp(join(outputDirectory, 'library-access-'));
  async function put(path, value) { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), value); }
  for (const [folder, id] of [['甲模组', 'module-a'], ['乙模组', 'module-b']]) await put(`模组/${folder}/模组.json`, JSON.stringify({ id, name: folder }));
  await put('模组/甲模组/游玩团/run-a/团.json', JSON.stringify({ id: 'run-a', moduleId: 'module-a', name: '甲团', characters: [{ id: 'alice-role', name: '艾莉', playerId: 'alice' }, { id: 'bob-role', name: '波布', playerId: 'bob' }] }));
  await put('模组/乙模组/游玩团/run-b/团.json', JSON.stringify({ id: 'run-b', moduleId: 'module-b', name: '乙团', characters: [{ id: 'other-role', name: '另一个人', playerId: 'other' }] }));
  await put('资源/怪物/M/梅洛.md', markdown({ id: 'merrow', name: '梅洛', kind: '怪物', initial: 'M', aliases: ['Merrow'], source: { book: '2025' }, data: { hp: 45 } }, '# 梅洛\n![头像](图片/头像.png)\n![拒绝外网](https://example.invalid/a.png)\n![越界](../../../../secret.png)'));
  await put('资源/怪物/M/图片/头像.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  await put('资源/怪物/M/旧机械.json', JSON.stringify({ id: 'old-only', name: '不列出旧JSON' }));
  await put('资源/怪物/M/示例模版.md', markdown({ id: 'template', name: '不列出示例', kind: '怪物' }));
  await put('模组/甲模组/资源/故事/A/秘密.md', markdown({ id: 'secret-a', name: '甲模组秘密', kind: '故事', initial: 'A', moduleId: 'module-a' }));
  await put('模组/乙模组/资源/故事/B/秘密.md', markdown({ id: 'secret-b', name: '乙模组秘密', kind: '故事', initial: 'B', moduleId: 'module-b' }));
  return { root, put, store: createLibraryStore({ root }) };
}

test('固定MD前置格式、真实目录与本地图片读取', async () => {
  const { store, put } = await fixture();
  assert.throws(() => parseLibraryMarkdown('---\nid: x\n---\ntext'), /JSON/);
  assert.throws(() => parseLibraryMarkdown(markdown({ id: '__proto__', name: '无效ID', kind: '怪物' })), /id/);
  const catalog = await store.catalog(dm); assert.equal(catalog.total, 3); assert.deepEqual(catalog.kinds, ['怪物', '故事']);
  assert.equal(catalog.resources.find(item => item.id === 'merrow').data, undefined);
  assert.equal((await store.catalog(dm, { initials: 'M', q: 'merrow' })).total, 1);
  assert.equal((await store.catalog(dm, { kind: '模组', modules: 'module-a' })).resources[0].id, 'secret-a');
  assert.equal((await store.revealTarget(dm, 'merrow')).projectPath, '资源/怪物/M/梅洛.md');
  const value = await store.read(dm, 'merrow'); assert.equal(value.resource.data.hp, 45); assert.equal(value.images.length, 1); assert.equal(value.issues.length, 2);
  assert.equal(value.images[0].source, '图片/头像.png'); assert.match(value.text, /# 梅洛/);
  await put('资源/怪物/M/梅洛.md', markdown({ id: 'merrow', name: '更新后的梅洛', kind: '怪物', initial: 'M' }));
  assert.equal((await store.read(dm, 'merrow')).resource.name, '更新后的梅洛');
});

test('邀请固定玩家身份，分享和撤回逐请求过滤且通知只给接收者', async () => {
  const { store, root } = await fixture(); await store.select(dm, { moduleId: 'module-a', runId: 'run-a' });
  const alice = await store.createInvite(dm, { playerId: 'alice' }), bob = await store.createInvite(dm, { playerId: 'bob' });
  const pa = { token: alice.token }, pb = { token: bob.token };
  assert.equal((await store.join(alice.token)).playerId, 'alice');
  assert.equal((await store.context(pa)).modules.length, 1); assert.equal((await store.catalog(pa)).total, 0);
  await assert.rejects(store.read(pa, 'merrow'), error => error.status === 403);
  await assert.rejects(store.revealTarget(pa, 'merrow'), error => error.status === 403);
  await assert.rejects(store.context({ role: 'player', playerId: 'alice' }), error => error.status === 401);
  let revision = (await store.context(dm)).revision;
  await store.setShares(dm, { resourceId: 'merrow', characterIds: ['alice-role'], expectedRevision: revision });
  assert.equal((await store.catalog(pa)).total, 1); assert.equal((await store.catalog(pb)).total, 0);
  assert.equal((await store.read(pa, 'merrow')).images.length, 1);
  assert.equal((await store.notifications(pb)).notifications.length, 0);
  let notifications = (await store.notifications(pa)).notifications;
  assert.equal(notifications[0].content, 'DM向你分享了【梅洛】'); assert.equal(notifications[0].canOpen, true);
  const second = await store.addCharacter(dm, { name: '艾莉第二角色', playerId: 'alice' });
  await store.setShares(dm, { resourceId: 'merrow', characterIds: ['alice-role', second.character.id], expectedRevision: second.revision });
  await store.setShares(dm, { resourceId: 'merrow', characterIds: [second.character.id], expectedRevision: (await store.context(dm)).revision });
  assert.equal((await store.read(pa, 'merrow')).resource.id, 'merrow');
  assert.equal((await store.notifications(pa)).notifications.filter(item => item.canOpen).length, 1);
  revision = (await store.shares(dm, 'merrow')).revision;
  await store.setShares(dm, { resourceId: 'merrow', characterIds: [], expectedRevision: revision });
  await assert.rejects(store.read(pa, 'merrow'), error => error.status === 403);
  notifications = (await store.notifications(pa)).notifications;
  assert(notifications.every(item => item.canOpen === false)); assert.equal(notifications.at(-1).content, 'DM撤回了给你的分享【梅洛】');
  assert.equal((await store.notifications(dm)).notifications.length, 4);
  const persisted = await readFile(join(root, '模组/资料库工作区.json'), 'utf8'); assert(!persisted.includes(alice.token));
  const reopened = createLibraryStore({ root }); assert.equal((await reopened.catalog(pa)).total, 0);
});

test('跨团、跨模组、过期revision与Player写入均拒绝', async () => {
  const { store } = await fixture(); await store.select(dm, { moduleId: 'module-a', runId: 'run-a' });
  const alice = await store.createInvite(dm, { playerId: 'alice' });
  let revision = (await store.context(dm)).revision;
  await assert.rejects(store.setShares(dm, { resourceId: 'secret-b', characterIds: ['alice-role'], expectedRevision: revision }), error => error.status === 403);
  await assert.rejects(store.setShares(dm, { resourceId: 'merrow', characterIds: ['other-role'], expectedRevision: revision }), error => error.status === 400);
  await assert.rejects(store.select({ token: alice.token }, { moduleId: 'module-b', runId: 'run-b' }), error => error.status === 403);
  const results = await Promise.allSettled([
    store.setShares(dm, { resourceId: 'merrow', characterIds: ['alice-role'], expectedRevision: revision }),
    store.setShares(dm, { resourceId: 'secret-a', characterIds: ['alice-role'], expectedRevision: revision })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  await store.select(dm, { moduleId: 'module-b', runId: 'run-b' });
  revision = (await store.context(dm)).revision;
  await assert.rejects(store.setShares(dm, { resourceId: 'merrow', characterIds: [], moduleId: 'module-a', runId: 'run-a', expectedRevision: revision }), error => error.status === 409);
  assert.equal((await store.context({ token: alice.token })).selected.runId, 'run-a');
});

test('新团与角色在指定目录落盘，邀请撤销立即使会话失效', async () => {
  const { store, root } = await fixture();
  const result = await store.createRun(dm, { moduleId: 'module-a', name: '新团' });
  const role = await store.addCharacter(dm, { name: '新角色', playerName: '本机玩家' });
  assert.match(role.character.playerId, /^player-/);
  const invite = await store.createInvite(dm, { playerId: role.character.playerId });
  assert.equal((await store.context({ token: invite.token })).characters[0].name, '新角色');
  const written = JSON.parse(await readFile(join(root, '模组/甲模组/游玩团', result.run.id, '团.json'), 'utf8'));
  assert.equal(written.characters.length, 1);
  await store.revokeInvite(dm, { inviteId: invite.inviteId });
  await assert.rejects(store.catalog({ token: invite.token }), error => error.status === 401);
});

test('重复ID保留问题并禁止读取，格式坏条目不阻断正常资料', async () => {
  const { store, put } = await fixture();
  await put('资源/怪物/M/重复.md', markdown({ id: 'merrow', name: '重复梅洛', kind: '怪物', initial: 'M' }));
  await put('资源/怪物/M/坏文件.md', '没有前置信息');
  const result = await store.catalog(dm); assert.equal(result.total, 2); assert(result.issues.some(item => item.id === 'merrow'));
  await assert.rejects(store.read(dm, 'merrow'), error => error.status === 404);
});

test('HTTP不接受伪造Player身份、跨站写入或失效邀请', async () => {
  const { root } = await fixture(), api = createLibraryApi({ root, sessionResolver: request => request.headers['x-dm-token'] === 'synthetic-dm' ? dm : { role: 'player', playerId: 'alice' } });
  const server = createServer(async (request, response) => {
    await api.handle(request, new URL(request.url, 'http://' + request.headers.host), (status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = 'http://127.0.0.1:' + server.address().port;
  const call = (path, body, headers = {}) => fetch(origin + '/api/library/' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await call('catalog')).status, 401);
    assert.equal((await call('context', undefined, { 'x-library-token': 'guessed' })).status, 401);
    assert.equal((await call('select', { moduleId: 'module-a', runId: 'run-a' }, { 'x-dm-token': 'synthetic-dm', origin: 'https://elsewhere.invalid' })).status, 403);
    assert.equal((await call('select', { moduleId: 'module-a', runId: 'run-a' }, { 'x-dm-token': 'synthetic-dm' })).status, 200);
    const invite = await (await call('invites', { playerId: 'alice' }, { 'x-dm-token': 'synthetic-dm' })).json();
    assert.equal((await call('join', { token: invite.token })).status, 200);
    assert.equal((await call('shares', { resourceId: 'merrow', characterIds: ['alice-role'], expectedRevision: 2 }, { 'x-library-token': invite.token })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});


test('以点开头的正式MD仍可发现，模组筛选不筛掉世界分类，README不作为坏资源', async () => {
  const { store, put } = await fixture();
  await put('资源/README.md', '# 阅读说明');
  await put('资源/怪物/M/......）.md', markdown({ id: 'dot-name', name: '点开头的原件名称', kind: '怪物', initial: 'M' }));
  const value = await store.catalog(dm, { kind: '怪物', modules: 'module-a' });
  assert.equal(value.total, 2); assert(value.resources.some(item => item.id === 'dot-name'));
  assert.equal(value.issues.length, 0);
});

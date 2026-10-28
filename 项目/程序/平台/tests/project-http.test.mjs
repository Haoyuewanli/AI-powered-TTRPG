import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { startPlatform } from '../server.mjs';
import { outputDirectory } from './check-helpers.mjs';

async function fixture() {
  await mkdir(outputDirectory, { recursive: true });
  const directory = await mkdtemp(join(outputDirectory, 'project-http-'));
  const root = join(directory, '项目');
  for (const path of ['模组/多人短团/样本', '资源/NPC/A', '资源/角色/A']) await mkdir(join(root, path), { recursive: true });
  await writeFile(join(root, '模组/多人短团/样本/模组调用.json'), JSON.stringify({ id: 'module-1', name: '样本' }));
  await writeFile(join(root, '资源/NPC/A/阿德.json'), JSON.stringify({ id: 'npc-1', name: '阿德', note: '合成DM资料', hp: 20 }));
  await writeFile(join(root, '资源/角色/A/安娜.json'), JSON.stringify({ id: 'pc-1', name: '安娜', hp: 12 }));
  return { directory, root };
}

function client(app) {
  return async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const response = await fetch(app.url + path, { method, headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'X-Platform-Session': token } : {}), ...headers
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, value: await response.json() };
  };
}

async function session(request, role, previous) {
  const response = await request('/api/local-view', { method: 'POST', body: { role, ...(previous ? { previous } : {}) } });
  assert.equal(response.status, 200); assert.equal(response.value.role, role);
  if (role) assert.equal(typeof response.value.token, 'string');
  return response.value.token;
}

test('project HTTP routes require a live local DM session and revoke the previous preview on identity switch', async () => {
  const { root } = await fixture(); const app = await startPlatform({ port: 0, projectRoot: root, appearanceFile: join(root, '外观.json') });
  const request = client(app);
  try {
    assert.equal((await request('/api/project/resources')).status, 403);
    assert.equal((await request('/api/project/resources?role=dm', { headers: { 'X-Platform-Session': 'forged-dm' } })).status, 403);
    const player = await session(request, 'player');
    assert.equal((await request('/api/project/resources', { token: player })).status, 403);
    assert.equal((await request('/api/project/modules', { token: player })).status, 403);
    const dm = await session(request, 'dm', player);
    assert.equal((await request('/api/project/status', { token: dm })).status, 200);
    const list = await request('/api/project/resources', { token: dm });
    assert.equal(list.status, 200); assert(list.value.resources.some(resource => resource.id === 'npc-1'));
    const read = await request('/api/project/read?resourceId=npc-1', { token: dm });
    assert.equal(read.status, 200); assert(JSON.stringify(read.value).includes('合成DM资料'));
    assert.equal((await request('/api/project/read?resourceId=npc-1', { token: player })).status, 403);
    assert.equal((await request('/api/project/resources', { token: dm, headers: { Origin: 'https://foreign.example' } })).status, 403);
    const revision = (await request('/api/project/status', { token: dm })).value.revision;
    await mkdir(join(root, '模组/多人短团/重复'), { recursive: true });
    await writeFile(join(root, '模组/多人短团/重复/模组调用.json'), JSON.stringify({ id: 'module-1', name: '重复ID副本' }));
    await mkdir(join(root, '模组/多人短团/保留前缀'), { recursive: true });
    await writeFile(join(root, '模组/多人短团/保留前缀/模组调用.json'), JSON.stringify({ id: 'campaign:forged', name: '不应冒充兼容团' }));
    const ambiguous = await request('/api/project/modules', { token: dm });
    assert.equal(ambiguous.status, 200); assert(!ambiguous.value.modules.some(module => module.id === 'module-1'));
    assert(!ambiguous.value.modules.some(module => module.id === 'campaign:forged'));
    assert(ambiguous.value.issues.some(message => message.includes('重复')));
    assert.equal((await request('/api/project/select-module', { method: 'POST', token: dm, body: { moduleId: 'module-1' } })).status, 404);
    assert.equal((await request('/api/project/status', { token: dm })).value.revision, revision);
    await session(request, 'player', dm);
    assert.equal((await request('/api/project/resources', { token: dm })).status, 403);
  } finally { await app.close(); }
});

test('HTTP references, deltas, battle calls and dialogue keep project-relative links and survive service restart', async () => {
  const { root } = await fixture(); let app = await startPlatform({ port: 0, projectRoot: root, appearanceFile: join(root, '外观.json') });
  let request = client(app);
  try {
    const token = await session(request, 'dm');
    const post = (route, body) => request('/api/project/' + route, { method: 'POST', token, body });
    let revision = (await request('/api/project/status', { token })).value.revision;
    const absent = await post('reference', { expectedRevision: revision, resourceId: 'npc-1', moduleId: 'module-1', moduleName: '样本' });
    assert(absent.status >= 400, 'References require explicit selection in the module window');
    const modules = await request('/api/project/modules', { token }); assert.equal(modules.status, 200);
    assert(JSON.stringify(modules.value).includes('module-1'));
    assert.equal((await post('select-module', { moduleId: 'module-1' })).status, 200);
    const wrongContext = await post('reference', { expectedRevision: revision, expectedModuleId: 'another-module', resourceId: 'npc-1' });
    assert.equal(wrongContext.status, 409);
    assert.equal((await request('/api/project/status', { token })).value.revision, revision);
    await assert.rejects(access(join(root, '当前/样本/当前.json')), { code: 'ENOENT' });
    const reference = await post('reference', { expectedRevision: revision, resourceId: 'npc-1', moduleId: 'injected-module', moduleName: '不应创建' });
    assert.equal(reference.status, 200); revision = reference.value.revision;
    assert.equal(reference.value.reference.current, '当前/样本/当前.json');
    const instanceId = reference.value.reference.instanceId;
    const delta = await post('current', { expectedRevision: revision, resourceId: 'npc-1', instanceId, delta: { hp: -8, spellSlots: { 1: -1 } } });
    assert.equal(delta.status, 200); revision = delta.value.revision;
    const released = await post('release', { expectedRevision: revision, resourceId: 'npc-1', playerId: 'player-one', instanceId });
    assert.equal(released.status, 200); revision = released.value.revision;
    const battle = await post('battle', { expectedRevision: revision, battleId: 'battle-one', name: '合成战斗', resourceIds: ['npc-1', 'pc-1'], currentIds: [instanceId], payload: { purpose: 'integration-only' }, logText: '合成战斗日志\n' });
    assert.equal(battle.status, 200); revision = battle.value.revision;
    const call = JSON.parse(await readFile(join(root, battle.value.callPath), 'utf8'));
    assert.equal(call.moduleId, 'module-1'); assert(call.resources.every(resource => resource.path.startsWith('资源/')));
    assert.equal(call.current.path, '当前/样本/当前.json');
    assert.equal(await readFile(join(root, battle.value.logPath), 'utf8'), '合成战斗日志\n');
    const dialogue = await post('dialogue', { expectedRevision: revision, groupId: 'chat-one', groupName: '合成群聊', content: '引用合成资料', resourceIds: ['npc-1'], timestamp: '2026-10-28T09:10:11.000Z' });
    assert.equal(dialogue.status, 200); revision = dialogue.value.revision;
    const md = await readFile(join(root, dialogue.value.path), 'utf8');
    assert(md.includes('2026-10-28T09:10:11.000Z')); assert(md.includes('引用合成资料'));
    assert(md.includes('(<资源/NPC/A/阿德.json>)')); assert(!md.includes(root));
    const current = JSON.parse(await readFile(join(root, '当前/样本/当前.json'), 'utf8'));
    assert.deepEqual(current.instances.find(instance => instance.id === instanceId).delta, { hp: -8, spellSlots: { 1: -1 } });
    assert.equal(JSON.parse(await readFile(join(root, '资源/NPC/A/阿德.json'), 'utf8')).hp, 20);
    const stale = await post('dialogue', { expectedRevision: revision - 1, groupId: 'chat-one', groupName: '合成群聊', content: '过期消息' });
    assert.equal(stale.status, 409); assert.equal(await readFile(join(root, dialogue.value.path), 'utf8'), md);
    const manifest = join(root, '模组/多人短团/样本/模组调用.json'), retainedManifest = join(root, '模组/多人短团/样本/保留原件.json');
    const beforeCurrent = await readFile(join(root, '当前/样本/当前.json'), 'utf8');
    const beforeCall = await readFile(join(root, battle.value.callPath), 'utf8');
    await rename(manifest, retainedManifest);
    for (const [route, body] of [
      ['reference', { resourceId: 'npc-1' }],
      ['release', { resourceId: 'npc-1', playerId: 'player-two' }],
      ['current', { resourceId: 'npc-1', instanceId, delta: { hp: -20 } }],
      ['battle', { battleId: 'must-not-be-created', logText: '不应写入' }],
      ['dialogue', { content: '模组失效后不应追加', resourceIds: ['npc-1'] }]
    ]) assert.equal((await post(route, { expectedRevision: revision, ...body })).status, 409, route + ' must revalidate the selected module');
    assert.equal((await request('/api/project/status', { token })).value.revision, revision);
    assert.equal(await readFile(join(root, dialogue.value.path), 'utf8'), md);
    assert.equal(await readFile(join(root, '当前/样本/当前.json'), 'utf8'), beforeCurrent);
    assert.equal(await readFile(join(root, battle.value.callPath), 'utf8'), beforeCall);
    await rename(retainedManifest, manifest);
    assert.equal((await post('select-module', { moduleId: 'module-1' })).status, 200);
    await mkdir(join(root, '模组/多人短团/冲突副本'), { recursive: true });
    await writeFile(join(root, '模组/多人短团/冲突副本/模组调用.json'), JSON.stringify({ id: 'module-1', name: '选取后出现的冲突' }));
    assert.equal((await post('reference', { expectedRevision: revision, resourceId: 'npc-1' })).status, 409);
    assert.equal((await request('/api/project/status', { token })).value.revision, revision);
    await app.close(); app = await startPlatform({ port: 0, projectRoot: root, appearanceFile: join(root, '外观.json') }); request = client(app);
    assert.equal((await request('/api/project/status', { token })).status, 403);
    const resumed = await session(request, 'dm');
    assert.equal((await request('/api/project/status', { token: resumed })).value.revision, revision);
    assert.equal((await request('/api/project/dialogue', { method: 'POST', token: resumed, body: { expectedRevision: revision, groupId: 'chat-one', groupName: '合成群聊', content: '未选模组不应写入' } })).status >= 400, true);
  } finally { await app.close(); }
});

test('file API refuses unsafe resource names and missing references without exposing host paths', async () => {
  const { root } = await fixture(); const app = await startPlatform({ port: 0, projectRoot: root, appearanceFile: join(root, '外观.json') }); const request = client(app);
  try {
    const token = await session(request, 'dm');
    const revision = (await request('/api/project/status', { token })).value.revision;
    for (const name of ['../outside.json', 'C:/outside.json', 'folder\\outside.json']) {
      const result = await request('/api/project/import', { method: 'POST', token, body: { kind: 'NPC', name, resource: { id: 'bad', name: '合成' }, expectedRevision: revision } });
      assert(result.status >= 400); assert(!JSON.stringify(result.value).includes(root));
    }
    const missing = await request('/api/project/read?resourceId=' + encodeURIComponent('../outside.json'), { token });
    assert(missing.status >= 400); assert(!JSON.stringify(missing.value).includes(root));
    assert.equal((await request('/api/project/status', { token })).value.revision, revision);
  } finally { await app.close(); }
});

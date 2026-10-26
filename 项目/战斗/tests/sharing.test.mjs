import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { startApp } from '../server.mjs';
import { fixture, active, command } from './fixture.mjs';

const testRoot = fileURLToPath(new URL('../../../开发记录/临时/战斗测试/', import.meta.url));
async function create(initial = fixture, options = {}) {
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(join(testRoot, 'sharing-'));
  return startApp({ campaignDir: directory, port: 0, initial,
    sharingOptions: { host: '127.0.0.1', interfaces: () => ({}), ...options } });
}
async function request(base, path, body, token, headers = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(base + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers
    } }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve(new Response(incoming.statusCode === 204 ? null : Buffer.concat(chunks), {
        status: incoming.statusCode, headers: incoming.headers
      })));
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const login = async app => (await (await request(app.url, '/api/login', { id: 'DM' })).json()).token;
const setting = async (app, dm, body) => {
  const response = await request(app.url, '/api/sharing', body, dm);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
};
const invite = (app, dm, actorId = 'pc-001') => setting(app, dm, { operation: 'invite', actorId });
const joinPlayer = async shared => (await (await request(shared.localUrl, '/api/join', { invite: shared.invite.token })).json()).token;

test('player gateway isolates DM credentials, binds invitations and filters all player reads', async () => {
  const app = await create(() => {
    const state = fixture();
    state.actors[1].hidden = true;
    state.actors.push({ ...structuredClone(state.actors[0]), id: 'pc-002', ownerId: 'player-2', name: '另一玩家',
      position: { x: 42.5, z: 42.5 }, resources: 'PLAYER_TWO_SECRET' });
    return state;
  });
  try {
    const dm = await login(app);
    assert.equal((await (await request(app.url, '/api/client-info')).json()).audience, 'local');
    assert.equal((await (await request(app.url, '/api/sharing', undefined, dm)).json()).enabled, false);
    const shared = await invite(app, dm);
    const player = await joinPlayer(shared);
    assert.equal((await (await request(shared.localUrl, '/api/client-info')).json()).audience, 'player');
    assert.equal((await request(shared.localUrl, '/api/state', undefined, dm)).status, 401);
    assert.equal((await request(app.url, '/api/state', undefined, player)).status, 401);
    for (const [path, body] of [
      ['/api/login', { id: 'DM' }], ['/api/catalog', undefined], ['/api/sharing', undefined],
      ['/api/shutdown', {}], ['/api/select', {}], ['/api/campaigns', {}], ['/api/battles', {}]
    ]) assert.equal((await request(shared.localUrl, path, body, dm)).status, 403, path);
    for (const path of ['/health', '/src/sharing.mjs', '/.tools/cloudflared.exe', '/战斗状态.json']) {
      assert.equal((await request(shared.localUrl, path)).status, 404, path);
    }
    const forged = await (await request(shared.localUrl, '/api/join', { invite: shared.invite.token, role: 'dm', id: 'player-2' })).json();
    assert.equal(forged.role, 'player'); assert.equal(forged.id, 'player-1');
    for (const path of ['/api/state', '/api/handoff']) {
      const data = await (await request(shared.localUrl, path, undefined, player)).text();
      for (const secret of ['npc-001', '仅DM读取', 'PLAYER_TWO_SECRET']) assert(!data.includes(secret), `${path}: ${secret}`);
    }
    const other = await invite(app, dm, 'pc-002');
    const otherToken = await joinPlayer(other);
    const view = await (await request(other.localUrl, '/api/state', undefined, otherToken)).json();
    assert.equal(view.state.actors.find(actor => actor.id === 'pc-001').hp, undefined);
    assert.equal(view.state.actors.find(actor => actor.id === 'pc-002').hp, 40);
    const forbidden = command(app.store.state, 'edit-actor', { actorId: 'pc-001', patch: { hp: 20 } });
    assert.equal((await request(shared.localUrl, '/api/action', forbidden, player)).status, 403);
    const ownOnly = command(app.store.state, 'move', { actorId: 'pc-002', position: { x: 42.5, z: 37.5 } });
    assert.equal((await request(shared.localUrl, '/api/action', ownOnly, player)).status, 403);
    const summary = await (await request(app.url, '/api/sharing', undefined, dm)).text();
    for (const secret of [shared.invite.token, other.invite.token, player]) assert(!summary.includes(secret));
    assert.equal((await request(shared.localUrl, '/api/state', undefined, player, { Origin: 'https://other.invalid' })).status, 403);
    assert.equal((await request(shared.localUrl, '/api/state', undefined, player, {
      Host: 'other.invalid', 'X-Forwarded-For': '127.0.0.1', 'X-Forwarded-Host': new URL(shared.localUrl).host
    })).status, 403);
    assert.equal((await request(shared.localUrl, '/api/join', null)).status, 400);
    assert.equal((await request(shared.localUrl, '/api/logout', {}, player)).status, 200);
    assert.equal((await request(shared.localUrl, '/api/state', undefined, player)).status, 401);
  } finally { await app.close(); }
});

test('reinvite, revoke, battle changes, disable and restart revoke old invitations and sessions', async () => {
  const app = await create();
  try {
    const dm = await login(app);
    const first = await invite(app, dm), firstPlayer = await joinPlayer(first);
    const next = await invite(app, dm), nextPlayer = await joinPlayer(next);
    assert.equal((await request(first.localUrl, '/api/join', { invite: first.invite.token })).status, 401);
    assert.equal((await request(first.localUrl, '/api/state', undefined, firstPlayer)).status, 401);
    await setting(app, dm, { operation: 'revoke', inviteId: next.invite.id });
    assert.equal((await request(next.localUrl, '/api/state', undefined, nextPlayer)).status, 401);
    const current = await invite(app, dm), currentPlayer = await joinPlayer(current);
    const originalSelection = app.workspace.selection;
    assert.equal((await request(app.url, '/api/battles', { name: '新的合成战斗' }, dm)).status, 200);
    assert.equal((await request(current.localUrl, '/api/state', undefined, currentPlayer)).status, 401);
    assert.equal((await request(app.url, '/api/select', originalSelection, dm)).status, 200);
    assert.equal((await request(current.localUrl, '/api/join', { invite: current.invite.token })).status, 401);
    const last = await invite(app, dm), lastPlayer = await joinPlayer(last);
    const disabled = await setting(app, dm, { operation: 'disable' });
    assert.equal(disabled.enabled, false); assert.equal(disabled.localUrl, null); assert.deepEqual(disabled.invites, []);
    const restarted = await setting(app, dm, { operation: 'enable' });
    assert.equal((await request(restarted.localUrl, '/api/state', undefined, lastPlayer)).status, 401);
    assert.equal((await request(restarted.localUrl, '/api/join', { invite: last.invite.token })).status, 401);
  } finally { await app.close(); }
});

test('two player devices share serial rule settlement and committed progress survives a host restart', async () => {
  let app = await create(active);
  const directory = app.directory;
  try {
    const dm = await login(app), shared = await invite(app, dm);
    const one = await joinPlayer(shared), two = await joinPlayer(shared);
    const commands = [
      command(app.store.state, 'move', { actorId: 'pc-001', position: { x: 17.5, z: 22.5 } }),
      command(app.store.state, 'move', { actorId: 'pc-001', position: { x: 22.5, z: 17.5 } })
    ];
    const result = await Promise.all(commands.map((body, index) => request(shared.localUrl, '/api/action', body, index ? two : one)));
    assert.deepEqual(result.map(response => response.status).sort(), [200, 409]);
    const winner = commands[result.findIndex(response => response.status === 200)];
    assert.equal((await request(shared.localUrl, '/api/action', winner, one)).status, 409);
    const committed = structuredClone(app.store.state);
    assert.equal(committed.revision, 1); assert.equal(committed.appliedIds.length, 1);
    const refreshed = await (await request(shared.localUrl, '/api/state', undefined, two)).json();
    assert.deepEqual(refreshed.state.actors.find(actor => actor.id === 'pc-001').position, committed.actors[0].position);
    await app.close();
    app = await startApp({ campaignDir: directory, port: 0, initial: () => { throw new Error('Must read existing progress'); },
      sharingOptions: { host: '127.0.0.1', interfaces: () => ({}) } });
    assert.equal(app.store.state.revision, 1);
    assert.deepEqual(app.store.state.actors[0].position, committed.actors[0].position);
    assert.equal(app.sharing.status().enabled, false);
  } finally { await app.close(); }
});

test('online bridge targets only the player gateway and accepts only its exact registered hostname', async () => {
  const calls = [];
  const tunnel = {
    state: { status: 'stopped', url: null, error: null },
    async start(url) { calls.push(url); this.state = { status: 'ready', url: 'https://synthetic-table.trycloudflare.com', error: null }; return this.state; },
    async stop() { calls.push('stop'); this.state = { status: 'stopped', url: null, error: null }; }
  };
  const app = await create(fixture, { tunnel, interfaces: () => ({ lan: [{ family: 'IPv4', address: '192.168.17.2', internal: false }] }) });
  try {
    const dm = await login(app);
    const ready = await setting(app, dm, { operation: 'start-online' });
    assert.notEqual(calls[0], app.url); assert.equal(calls[0], ready.localUrl);
    assert.equal(ready.online.status, 'ready'); assert.equal(ready.lanUrls.length, 1);
    const shared = await invite(app, dm), player = await joinPlayer(shared);
    assert.equal(shared.links.online, `https://synthetic-table.trycloudflare.com/#invite=${shared.invite.token}`);
    assert.equal((await request(shared.localUrl, '/api/state', undefined, player, {
      Host: 'synthetic-table.trycloudflare.com', Origin: 'https://synthetic-table.trycloudflare.com'
    })).status, 200);
    assert.equal((await request(shared.localUrl, '/api/state', undefined, player, {
      Host: 'wrong-table.trycloudflare.com', Origin: 'https://wrong-table.trycloudflare.com'
    })).status, 403);
    assert.equal((await request(shared.localUrl, '/api/login', { id: 'DM' }, undefined, {
      Host: 'synthetic-table.trycloudflare.com', Origin: 'https://synthetic-table.trycloudflare.com'
    })).status, 403);
    await setting(app, dm, { operation: 'stop-online' });
    assert.equal((await request(shared.localUrl, '/api/state', undefined, player)).status, 200);
    assert.equal((await request(shared.localUrl, '/api/state', undefined, player, { Host: 'synthetic-table.trycloudflare.com' })).status, 403);
    await setting(app, dm, { operation: 'disable' });
    assert.equal(calls.at(-1), 'stop');
  } finally { await app.close(); }
});

test('online count reflects recent requests and expired invites cannot keep sessions alive', async () => {
  let clock = Date.now();
  const app = await create(fixture, { now: () => clock });
  try {
    const dm = await login(app), shared = await invite(app, dm), player = await joinPlayer(shared);
    assert.equal(app.sharing.status().connectedPlayers, 1);
    clock += 31000;
    assert.equal(app.sharing.status().connectedPlayers, 0);
    assert.equal((await request(shared.localUrl, '/api/state', undefined, player)).status, 200);
    assert.equal(app.sharing.status().connectedPlayers, 1);
    clock += 8 * 60 * 60 * 1000;
    assert.equal(app.sharing.status().connectedPlayers, 0);
    assert.equal((await request(shared.localUrl, '/api/state', undefined, player)).status, 401);
    assert.equal((await request(shared.localUrl, '/api/join', { invite: shared.invite.token })).status, 401);
  } finally { await app.close(); }
});

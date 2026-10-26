import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { startApp } from '../server.mjs';
import { fixture } from './fixture.mjs';

test('HTTP permissions, filtered state, handoff, stale proposals, static allowlist and origin checks', async () => {
  const root = fileURLToPath(new URL('../../../开发记录/临时/战斗测试/', import.meta.url));
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'http-'));
  const app = await startApp({ campaignDir: dir, port: 0, initial: () => { const s = fixture(); s.actors[1].hidden = true; return s; } });
  try {
    const request = (path, body, token, origin) => fetch(app.url + path, {
      method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await request('/api/state')).status, 401);
    assert.equal((await request('/api/login', { id: 'unknown-player' })).status, 401);
    const player = await (await request('/api/login', { id: 'player-1' })).json();
    const visible = await (await request('/api/state', null, player.token)).text();
    for (const forbidden of ['npc-001', '仅DM读取', 'dmSecret']) assert(!visible.includes(forbidden));
    const action = { campaignId: 'test-campaign', actionId: 'http-action-001', expectedRevision: 0, type: 'edit-actor', payload: { actorId: 'pc-001', patch: { hp: 20 } } };
    assert.equal((await request('/api/action', action, player.token)).status, 403);
    assert.equal((await request('/api/shutdown', {}, player.token)).status, 403);
    await assert.rejects(access(join(dir, '本机身份.json')), { code: 'ENOENT' });
    const dm = await (await request('/api/login', { id: 'DM' })).json();
    assert.equal((await request('/api/action', action, dm.token)).status, 200);
    assert.equal((await request('/api/action', action, dm.token)).status, 409);
    assert((await (await request('/api/handoff', null, dm.token)).json()).state.actors.some(a => a.id === 'npc-001'));
    for (const path of ['/src/campaign.mjs', '/本机身份.json', '/存档/战斗状态.json', '/package.json']) assert.equal((await request(path)).status, 404);
    assert.equal((await request('/api/state', null, player.token, 'https://other.invalid')).status, 403);
    assert.equal((await request('/api/logout', {}, player.token)).status, 200);
    assert.equal((await request('/api/state', null, player.token)).status, 401);
  } finally { await app.close(); }
});

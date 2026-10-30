import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { createTunnel } from './tunnel.mjs';
import { RuleError } from './rules.mjs';

const lifetime = 8 * 60 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');
const roomKey = selection => `${selection.campaignId}/${selection.battleId}`;

export function createSharing({ workspace, createGateway, executable, port = 0, host = '0.0.0.0',
  interfaces = networkInterfaces, tunnel = createTunnel({ executable }), now = Date.now } = {}) {
  let gateway, enabled = false, currentRoom = roomKey(workspace.selection);
  let queue = Promise.resolve();
  let joinWindow = { start: now(), count: 0 };
  const invites = new Map(), sessions = new Map();
  const serialize = operation => { const next = queue.then(operation); queue = next.catch(() => {}); return next; };
  const clearRoom = () => { invites.clear(); sessions.clear(); };
  const sync = () => {
    const key = roomKey(workspace.selection);
    if (key !== currentRoom) { clearRoom(); currentRoom = key; }
    for (const [key, value] of invites) if (value.expires <= now()) invites.delete(key);
    for (const [key, value] of sessions) if (value.expires <= now() || ![...invites.values()].some(invite => invite.id === value.inviteId)) sessions.delete(key);
  };
  const localUrl = () => gateway ? `http://127.0.0.1:${gateway.address().port}` : null;
  const lanUrls = () => {
    if (!gateway) return [];
    const addresses = Object.values(interfaces()).flat().filter(entry => entry && !entry.internal &&
      (entry.family === 'IPv4' || entry.family === 4)).map(entry => entry.address);
    return [...new Set(addresses)].map(address => `http://${address}:${gateway.address().port}`);
  };
  const publicInvite = invite => ({ id: invite.id, actorId: invite.actorId, actorName: invite.actorName, expires: invite.expires });
  const status = () => {
    sync();
    return { enabled, localUrl: localUrl(), lanUrls: lanUrls(), online: tunnel.state, selection: workspace.selection,
      players: workspace.store.state.actors.filter(actor => actor.kind === 'pc' && actor.ownerId)
        .map(actor => ({ actorId: actor.id, actorName: actor.name })),
      invites: [...invites.values()].map(publicInvite),
      connectedPlayers: new Set([...sessions.values()].filter(value => now() - value.lastSeen <= 30000).map(value => value.id)).size };
  };
  const enable = async () => {
    sync();
    if (enabled) return;
    try { gateway = await createGateway({ port, host }); }
    catch { throw new RuleError('玩家连接入口未能开启，请关闭占用端口的程序后重试。', 503); }
    enabled = true;
  };
  const disable = async () => {
    enabled = false;
    clearRoom();
    const previous = gateway; gateway = undefined;
    await tunnel.stop();
    if (previous) await new Promise((resolve, reject) => {
      previous.close(error => error ? reject(error) : resolve());
      previous.closeIdleConnections?.();
    });
  };
  const revoke = id => {
    for (const [key, value] of invites) if (value.id === id) invites.delete(key);
    for (const [key, value] of sessions) if (value.inviteId === id) sessions.delete(key);
  };
  return {
    status,
    invalidate() { clearRoom(); currentRoom = roomKey(workspace.selection); },
    assertOrigin(request) {
      sync();
      if (!enabled) throw new RuleError('主持已关闭加入入口', 401);
      const origins = [localUrl(), ...lanUrls(), tunnel.state.url].filter(Boolean);
      const matching = origins.filter(origin => new URL(origin).host === request.headers.host);
      if (!matching.length || (request.headers.origin && !matching.includes(request.headers.origin))) {
        throw new RuleError('只接受当前加入地址的同源请求', 403);
      }
    },
    join(token) {
      sync();
      if (!enabled) throw new RuleError('主持已关闭加入入口', 401);
      if (now() - joinWindow.start >= 60000) joinWindow = { start: now(), count: 0 };
      if (++joinWindow.count > 60) throw new RuleError('加入尝试过多，请一分钟后再试', 429);
      if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) throw new RuleError('邀请无效或已失效，请向主持获取新的链接', 401);
      const invite = invites.get(digest(token));
      const actor = invite && workspace.store.state.actors.find(actor => actor.id === invite.actorId && actor.kind === 'pc' && actor.ownerId === invite.ownerId);
      if (!invite || !actor) throw new RuleError('邀请无效或已失效，请向主持获取新的链接', 401);
      if (sessions.size >= 100) throw new RuleError('加入设备过多，请主持重新邀请后再试', 429);
      const sessionToken = randomBytes(32).toString('base64url');
      sessions.set(digest(sessionToken), { role: 'player', id: invite.ownerId, actorId: actor.id, inviteId: invite.id,
        campaignId: workspace.selection.campaignId, battleId: workspace.selection.battleId, expires: now() + lifetime, lastSeen: now() });
      return { token: sessionToken, role: 'player', id: invite.ownerId };
    },
    principal(token) {
      sync();
      const principal = typeof token === 'string' && token.length <= 128 ? sessions.get(digest(token)) : undefined;
      if (!enabled || !principal) throw new RuleError('加入已结束，请向主持获取新的邀请链接', 401);
      const actor = workspace.store.state.actors.find(actor => actor.id === principal.actorId && actor.kind === 'pc' && actor.ownerId === principal.id);
      if (!actor) throw new RuleError('角色已变更，请向主持获取新的邀请链接', 401);
      principal.lastSeen = now();
      return principal;
    },
    logout(token) { if (typeof token === 'string') sessions.delete(digest(token)); },
    operate(body) {
      return serialize(async () => {
        sync();
        switch (body.operation) {
          case 'enable': await enable(); break;
          case 'disable': await disable(); break;
          case 'start-online':
            await enable();
            await tunnel.start(localUrl());
            break;
          case 'stop-online': await tunnel.stop(); break;
          case 'revoke':
            if (typeof body.inviteId !== 'string') throw new RuleError('请选择要收回的邀请');
            revoke(body.inviteId); break;
          case 'invite': {
            const selection = roomKey(workspace.selection);
            const actor = workspace.store.state.actors.find(actor => actor.id === body.actorId && actor.kind === 'pc' && actor.ownerId);
            if (!actor) throw new RuleError('请选择一个玩家角色');
            await enable();
            if (selection !== roomKey(workspace.selection)) { sync(); throw new RuleError('战斗已切换，请重新邀请', 409); }
            for (const invite of [...invites.values()]) if (invite.actorId === actor.id) revoke(invite.id);
            if (invites.size >= 100) throw new RuleError('邀请过多，请先收回不再使用的邀请', 429);
            const token = randomBytes(32).toString('base64url');
            const invite = { id: randomUUID(), actorId: actor.id, actorName: actor.name, ownerId: actor.ownerId, expires: now() + lifetime };
            invites.set(digest(token), invite);
            const link = url => url ? `${url}/#invite=${token}` : null;
            return { ...status(), invite: { ...publicInvite(invite), token },
              links: { lan: lanUrls().map(link), online: link(tunnel.state.url) } };
          }
          default: throw new RuleError('未知的加入设置');
        }
        return status();
      });
    },
    close() { return serialize(disable); }
  };
}

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { openWorkspace } from './src/workspace.mjs';
import { initializeCampaign, findCampaign } from './src/campaign.mjs';
import { projectState, handoff, RuleError, planAttack, parseDice } from './src/rules.mjs';
import { createSharing } from './src/sharing.mjs';
import { openPreferences } from './src/preferences.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest();

async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new RuleError('请求须为JSON', 415);
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65536) throw new RuleError('操作超过64KB', 413);
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RuleError('JSON格式无效'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RuleError('请求须为JSON对象');
  return body;
}

export async function startApp({ campaignDir, workspaceDir, port = 4182, initial, persist, sharingOptions = {} } = {}) {
  const directory = resolve(campaignDir || await findCampaign(resolve(ROOT, '../存档')));
  const workspaceDirectory = resolve(workspaceDir || (campaignDir ? resolve(directory, '.工作区') : resolve(ROOT, '../存档')));
  const workspace = await openWorkspace({ seedDirectory: directory, workspaceDirectory,
    initial: initial || (() => initializeCampaign(directory)), persist });
  const sessions = new Map();
  const preferences = await openPreferences(join(workspaceDirectory,'界面设置.json')).catch(async e=>{await workspace.close();throw e;});
  const staticFiles = new Map([
    ...['workspace-panel', 'dice-panel', 'terrain-panel', 'terrain-view', 'shell', 'sharing-panel', 'client-utils', 'voxel-model', 'files-panel', 'value-bars', 'resource-panel', 'resource-icons', 'action-panel','action-icons','resource-orbit','manual-record-panel'].map(name => [`/${name}.mjs`, [join(ROOT, `web/${name}.mjs`), 'text/javascript; charset=utf-8']]),
    ...['resources','rule-errors','action-catalog'].map(name => [`/${name}.mjs`, [join(ROOT,`src/${name}.mjs`),'text/javascript; charset=utf-8']]),
    ['/', [join(ROOT, 'web/index.html'), 'text/html; charset=utf-8']],
    ['/style.css', [join(ROOT, 'web/style.css'), 'text/css; charset=utf-8']],
    ['/app.mjs', [join(ROOT, 'web/app.mjs'), 'text/javascript; charset=utf-8']],
    ['/board.mjs', [join(ROOT, 'web/board.mjs'), 'text/javascript; charset=utf-8']],
    ['/map-placement.mjs', [join(ROOT, 'src/map-placement.mjs'), 'text/javascript; charset=utf-8']],
    ['/geometry.mjs', [join(ROOT, 'src/geometry.mjs'), 'text/javascript; charset=utf-8']],
    ['/vendor/three.module.js', [resolve(ROOT, '../骰盘/node_modules/three/build/three.module.js'), 'text/javascript; charset=utf-8']],
    ['/vendor/LICENSE', [resolve(ROOT, '../骰盘/node_modules/three/LICENSE'), 'text/plain; charset=utf-8']]
  ]);
  let loginWindow = { start: Date.now(), count: 0 };
  let closeApp, sharing;
  const playerRoutes = new Set(['GET /api/state', 'GET /api/handoff', 'POST /api/action', 'POST /api/attack-plan', 'POST /api/logout', 'GET /api/preferences','POST /api/preferences']);
  const handle = audience => async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (audience === 'player') sharing.assertOrigin(request);
      else if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) throw new RuleError('只接受本机同源请求', 403);
      const path = new URL(request.url, origin).pathname;
      if (request.method === 'GET' && path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      if (request.method === 'GET' && path === '/api/client-info') return send(200, { audience });
      if (audience === 'local' && request.method === 'GET' && path === '/health') return send(200, {
        app: 'local-battle-v1', coreVersion: 'manual-operations-v6', campaignKey: hash(directory.toLowerCase()).toString('hex'), workspaceKey: hash(workspaceDirectory.toLowerCase()).toString('hex') });
      if (audience === 'player' && request.method === 'POST' && path === '/api/join') {
        const body = await readBody(request);
        return send(200, sharing.join(body.invite));
      }
      if (audience === 'local' && request.method === 'POST' && path === '/api/login') {
        if (Date.now() - loginWindow.start > 60000) loginWindow = { start: Date.now(), count: 0 };
        if (++loginWindow.count > 30) throw new RuleError('尝试次数过多，请一分钟后再试', 429);
        const body = await readBody(request);
        if (typeof body.id !== 'string' || body.id.length > 100) throw new RuleError('身份格式无效');
        const identifier = body.id.trim();
        let principal;
        if (identifier.toUpperCase() === 'DM') {
          principal = { role: 'dm', id: 'DM' };
        } else {
          const actor = workspace.store.state.actors.find(a => a.kind === 'pc' && [a.ownerId, a.id, a.name].includes(identifier));
          if (!actor) throw new RuleError('找不到这个玩家身份', 401);
          principal = { role: 'player', id: actor.ownerId, campaignId: workspace.selection.campaignId, battleId: workspace.selection.battleId };
        }
        for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
        if (sessions.size >= 100) throw new RuleError('本机会话过多，请重启服务', 429);
        const token = randomBytes(32).toString('base64url');
        sessions.set(token, { ...principal, expires: Date.now() + 8 * 60 * 60 * 1000 });
        return send(200, { token, role: principal.role, id: principal.id });
      }
      if (path.startsWith('/api/')) {
        if (audience === 'player' && !playerRoutes.has(`${request.method} ${path}`)) throw new RuleError('玩家入口不提供此操作', 403);
        const token = request.headers.authorization?.replace(/^Bearer /, '');
        const principal = audience === 'player' ? sharing.principal(token) : sessions.get(token);
        if (!principal || principal.expires < Date.now()) throw new RuleError('请重新登录', 401);
        workspace.context(principal);
        if (path === '/api/preferences') {
          if (request.method === 'GET') return send(200,preferences.get(principal,workspace.selection.campaignId));
          if (request.method === 'POST') return send(200,await preferences.save(principal,workspace.selection.campaignId,await readBody(request)));
        }
        const reply = () => ({ state: projectState(workspace.store.state, principal),
          recoveryNote: audience === 'local' ? [workspace.store.recoveryNote,preferences.recoveryNote].filter(Boolean).join(' ') : null, selection: workspace.selection });
        if (path === '/api/files' && request.method === 'POST') {
          const result=await workspace.files(await readBody(request),principal);
          return send(200,{...result,...reply()});
        }
        if (path === '/api/sharing') {
          if (principal.role !== 'dm') throw new RuleError('需要DM权限', 403);
          if (request.method === 'GET') return send(200, sharing.status());
          if (request.method === 'POST') return send(200, await sharing.operate(await readBody(request)));
        }
        if (request.method === 'GET' && path === '/api/state') return send(200, {...reply(), ...(principal.role === 'dm' ? {externalFileChanged:await workspace.store.fileStatus().then(s=>s.changed).catch(()=>true)} : {})});
        if (request.method === 'GET' && path === '/api/handoff') return send(200, handoff(workspace.store.state, principal));
        if (request.method === 'GET' && path === '/api/catalog') return send(200, await workspace.catalog(principal));
        if (request.method === 'POST' && path === '/api/select') {
          const previous = workspace.selection;
          await workspace.select(await readBody(request), principal);
          if (previous.campaignId !== workspace.selection.campaignId || previous.battleId !== workspace.selection.battleId) sharing.invalidate();
          return send(200, reply());
        }
        if (request.method === 'POST' && path === '/api/campaigns') { await workspace.createCampaign(await readBody(request), principal); sharing.invalidate(); return send(200, reply()); }
        if (request.method === 'POST' && path === '/api/battles') { await workspace.createBattle(await readBody(request), principal); sharing.invalidate(); return send(200, reply()); }
        if (request.method === 'POST' && path === '/api/attack-plan') {
          const plan = planAttack(workspace.store.state, await readBody(request), principal);
          return send(200, { mode: plan.mode, d20Count: plan.mode === 'normal' ? 1 : 2,
            damage: plan.attack.damage.map(item => ({ ...parseDice(item.formula), type: item.type, formula: item.formula })) });
        }
        if (request.method === 'POST' && path === '/api/logout') {
          if (audience === 'player') sharing.logout(token); else sessions.delete(token);
          return send(200, { ok: true });
        }
        if (request.method === 'POST' && path === '/api/shutdown') {
          if (principal.role !== 'dm') throw new RuleError('需要DM权限', 403);
          response.once('finish', () => { closeApp().catch(() => {}); });
          return send(200, { stopped: true });
        }
        if (request.method === 'POST' && path === '/api/action') {
          await workspace.dispatch(await readBody(request), principal);
          return send(200, reply());
        }
        throw new RuleError('接口不存在', 404);
      }
      const entry = staticFiles.get(path);
      if (request.method !== 'GET' || !entry) throw new RuleError('页面不存在', 404);
      const content = await readFile(entry[0]);
      response.writeHead(200, { 'Content-Type': entry[1] }); response.end(content);
    } catch (error) {
      send(error.status || 500, { error: error instanceof RuleError ? error.message : '本地读取或保存失败；正式进度未确认，请刷新并检查磁盘。', code: error.code });
    }
  };
  const server = createServer(handle('local'));
  sharing = createSharing({ executable: join(ROOT, '.tools/cloudflared.exe'), ...sharingOptions, workspace,
    createGateway: async ({ port, host }) => {
      const gateway = createServer(handle('player'));
      await new Promise((accept, reject) => { gateway.once('error', reject); gateway.listen(port, host, accept); });
      return gateway;
    }
  });
  try {
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  } catch (error) { await workspace.close(); throw error; }
  let closePromise;
  closeApp = () => closePromise ||= (async () => {
    await sharing.close();
    await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
    await workspace.close();
  })();
  return { server, get store() { return workspace.store; }, workspace, sharing,
    url: `http://127.0.0.1:${server.address().port}`, directory, close: closeApp };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--campaign');
  const workspaceIndex = process.argv.indexOf('--workspace');
  const requestedPort = Number(process.env.BATTLE_PORT || 4182);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error('BATTLE_PORT无效');
  try {
    const app = await startApp({ campaignDir: index >= 0 ? process.argv[index + 1] : undefined,
      workspaceDir: workspaceIndex >= 0 ? process.argv[workspaceIndex + 1] : undefined, port: requestedPort });
    console.log(`本地战斗已启动：${app.url}\n本机直接选择DM，无需凭据。`);
    let closing = false;
    const stop = async () => { if (closing) return; closing = true; await app.close(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch (error) { console.error(error.code === 'EADDRINUSE' ? '端口被占用；请用启动脚本检查已有服务或设置BATTLE_PORT。' : error.message); process.exitCode = 1; }
}

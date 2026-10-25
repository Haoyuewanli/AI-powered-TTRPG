import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { openStore } from './src/store.mjs';
import { initializeCampaign, findCampaign } from './src/campaign.mjs';
import { projectState, handoff, RuleError } from './src/rules.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest();
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(hash(a), hash(b));

async function readBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new RuleError('请求须为JSON', 415);
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 65536) throw new RuleError('操作超过64KB', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RuleError('JSON格式无效'); }
}

export async function startApp({ campaignDir, port = 4182, initial, persist } = {}) {
  const directory = resolve(campaignDir || await findCampaign(resolve(ROOT, '../存档')));
  const store = await openStore(directory, initial || (() => initializeCampaign(directory)), { persist });
  const sessions = new Map();
  let credentials;
  const authPath = join(directory, '本机身份.json');
  try {
    try { credentials = JSON.parse(await readFile(authPath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('本机身份文件无法读取，未覆盖原文件。');
      credentials = { dmId: 'DM', dmSecret: randomBytes(24).toString('base64url') };
      await writeFile(authPath, JSON.stringify(credentials, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    }
    if (typeof credentials.dmId !== 'string' || typeof credentials.dmSecret !== 'string' || credentials.dmSecret.length < 16) throw new Error('本机身份文件无效；DM凭据至少16位。');
  } catch (error) { await store.close(); throw error; }
  const staticFiles = new Map([
    ['/', [join(ROOT, 'web/index.html'), 'text/html; charset=utf-8']],
    ['/style.css', [join(ROOT, 'web/style.css'), 'text/css; charset=utf-8']],
    ['/app.mjs', [join(ROOT, 'web/app.mjs'), 'text/javascript; charset=utf-8']],
    ['/board.mjs', [join(ROOT, 'web/board.mjs'), 'text/javascript; charset=utf-8']],
    ['/geometry.mjs', [join(ROOT, 'src/geometry.mjs'), 'text/javascript; charset=utf-8']],
    ['/vendor/three.module.js', [resolve(ROOT, '../骰盘/node_modules/three/build/three.module.js'), 'text/javascript; charset=utf-8']],
    ['/vendor/LICENSE', [resolve(ROOT, '../骰盘/node_modules/three/LICENSE'), 'text/plain; charset=utf-8']]
  ]);
  let loginWindow = { start: Date.now(), count: 0 };
  const server = createServer(async (request, response) => {
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
      if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) throw new RuleError('只接受本机同源请求', 403);
      const path = new URL(request.url, origin).pathname;
      if (request.method === 'GET' && path === '/health') return send(200, {
        app: 'local-battle-v1', campaignKey: hash(directory.toLowerCase()).toString('hex') });
      if (request.method === 'POST' && path === '/api/login') {
        if (Date.now() - loginWindow.start > 60000) loginWindow = { start: Date.now(), count: 0 };
        if (++loginWindow.count > 30) throw new RuleError('尝试次数过多，请一分钟后再试', 429);
        const body = await readBody(request);
        if (typeof body.id !== 'string' || body.id.length > 100) throw new RuleError('身份格式无效');
        const identifier = body.id.trim();
        let principal;
        if (identifier === credentials.dmId) {
          if (!equal(body.secret, credentials.dmSecret)) throw new RuleError('身份或DM凭据不正确', 401);
          principal = { role: 'dm', id: credentials.dmId };
        } else {
          const actor = store.state.actors.find(a => a.kind === 'pc' && [a.ownerId, a.id, a.name].includes(identifier));
          if (!actor) throw new RuleError('身份或DM凭据不正确', 401);
          principal = { role: 'player', id: actor.ownerId };
        }
        for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
        if (sessions.size >= 100) throw new RuleError('本机会话过多，请重启服务', 429);
        const token = randomBytes(32).toString('base64url');
        sessions.set(token, { ...principal, expires: Date.now() + 8 * 60 * 60 * 1000 });
        return send(200, { token, role: principal.role, id: principal.id });
      }
      if (path.startsWith('/api/')) {
        const token = request.headers.authorization?.replace(/^Bearer /, '');
        const principal = sessions.get(token);
        if (!principal || principal.expires < Date.now()) throw new RuleError('请重新登录', 401);
        if (request.method === 'GET' && path === '/api/state') return send(200, { state: projectState(store.state, principal), recoveryNote: store.recoveryNote });
        if (request.method === 'GET' && path === '/api/handoff') return send(200, handoff(store.state, principal));
        if (request.method === 'POST' && path === '/api/logout') { sessions.delete(token); return send(200, { ok: true }); }
        if (request.method === 'POST' && path === '/api/action') {
          const next = await store.dispatch(await readBody(request), principal);
          return send(200, { state: projectState(next, principal), recoveryNote: store.recoveryNote });
        }
        throw new RuleError('接口不存在', 404);
      }
      const entry = staticFiles.get(path);
      if (request.method !== 'GET' || !entry) throw new RuleError('页面不存在', 404);
      const content = await readFile(entry[0]);
      response.writeHead(200, { 'Content-Type': entry[1] }); response.end(content);
    } catch (error) {
      send(error.status || 500, { error: error instanceof RuleError ? error.message : '本地读取或保存失败；正式进度未确认，请刷新并检查磁盘。' });
    }
  });
  try {
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  } catch (error) { await store.close(); throw error; }
  return { server, store, url: `http://127.0.0.1:${server.address().port}`, directory,
    async close() { await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())); await store.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--campaign');
  const requestedPort = Number(process.env.BATTLE_PORT || 4182);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) throw new Error('BATTLE_PORT无效');
  try {
    const app = await startApp({ campaignDir: index >= 0 ? process.argv[index + 1] : undefined, port: requestedPort });
    console.log(`本地战斗已启动：${app.url}\nDM凭据在战役目录的“本机身份.json”，请在本机查看。`);
    let closing = false;
    const stop = async () => { if (closing) return; closing = true; await app.close(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch (error) { console.error(error.code === 'EADDRINUSE' ? '端口被占用；请用启动脚本检查已有服务或设置BATTLE_PORT。' : error.message); process.exitCode = 1; }
}

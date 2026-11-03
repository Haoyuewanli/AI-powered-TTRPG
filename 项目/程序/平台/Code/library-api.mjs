import { execFile } from 'node:child_process';
import { createLibraryStore } from './library-store.mjs';

async function readBody(request) {
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (Buffer.byteLength(text) > 256 * 1024) throw Object.assign(new Error('请求内容过大。'), { status: 413 });
  }
  try { const value = JSON.parse(text || '{}'); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
  catch { throw Object.assign(new Error('请求必须是JSON对象。'), { status: 400 }); }
}

export function createLibraryApi({ root, sessionResolver = () => null }) {
  const store = createLibraryStore({ root });
  async function actor(request) {
    const token = request.headers['x-library-token'] || request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token) return { token };
    const session = await sessionResolver(request);
    if (session?.role === 'dm') return { role: 'dm' };
    throw Object.assign(new Error('需要有效DM身份或玩家邀请。'), { status: 401, code: 'session_invalid' });
  }
  return { store, async handle(request, url, send) {
    if (!url.pathname.startsWith('/api/library/')) return false;
    try {
      if (request.headers.origin && request.headers.origin !== 'http://' + request.headers.host && request.headers.origin !== 'https://' + request.headers.host) throw Object.assign(new Error('拒绝跨来源请求。'), { status: 403 });
      const route = url.pathname.slice('/api/library/'.length), method = request.method;
      if (route === 'join' && method === 'POST') { const body = await readBody(request); send(200, await store.join(body.token)); return true; }
      const session = await actor(request);
      if (method === 'GET') {
        const query = Object.fromEntries(url.searchParams);
        if (route === 'players') send(200, await store.playerTree(session));
        else if (route === 'player-file') send(200, await store.playerRead(session, query.path));
        else if (route === 'cover') send(200, await store.moduleCover(session,query.moduleId));
        else if (route === 'chat') send(200, await store.chat(session));
        else if (route === 'context') send(200, await store.context(session));
        else if (route === 'catalog') send(200, await store.catalog(session, query));
        else if (route === 'read') send(200, await store.read(session, query.resourceId || query.id));
        else if (route === 'shares') send(200, await store.shares(session, query.resourceId));
        else if (route === 'notifications') send(200, await store.notifications(session));
        else send(404, { error: '接口不存在。' });
      } else if (method === 'POST') {
        const body = await readBody(request);
        if (route === 'reveal') {
          const target = await store.revealTarget(session, body.resourceId);
          if (process.platform === 'win32') await new Promise((resolve, reject) => execFile('explorer.exe', [target.directory], { windowsHide: true }, error => error && error.code !== 1 ? reject(error) : resolve()));
          send(200, { opened: process.platform === 'win32', projectPath: target.projectPath });
        }
        else if (route === 'players') send(200, await store.playerOperation(session, body));
        else if (route === 'select') send(200, await store.select(session, body));
        else if (route === 'manage-run') send(200, await store.manageRun(session, body));
        else if (route === 'cover') send(200, await store.changeCover(session, body));
        else if (route === 'chat') send(200, await store.chat(session, body));
        else if (route === 'runs') send(201, await store.createRun(session, body));
        else if (route === 'characters') send(201, await store.addCharacter(session, body));
        else if (route === 'shares') send(200, await store.setShares(session, body));
        else if (route === 'invites') send(201, await store.createInvite(session, body));
        else if (route === 'invites/revoke') send(200, await store.revokeInvite(session, body));
        else send(404, { error: '接口不存在。' });
      } else send(405, { error: '不支持此请求方法。' });
    } catch (error) { send(error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.status ? error.message : '资料库读取或保存失败，请核对本地文件。', ...(error.code ? { code: error.code } : {}) }); }
    return true;
  } };
}

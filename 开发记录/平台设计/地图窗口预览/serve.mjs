import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const directory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(directory, '../../..');
const MAX_BODY = 256 * 1024;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const secret = () => randomBytes(32).toString('base64url');
const knownTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const error = (status, message) => Object.assign(new Error(message), { status });
const json = (res, status, value, head = false) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(head ? undefined : JSON.stringify(value));
};

function headers(res, player = false) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'${player ? '' : ' data: blob:'}; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'`);
}

function checkedUrl(req, origin) {
  if (req.headers.host !== new URL(origin).host) throw error(403, '请求来源不匹配');
  if (req.headers.origin && req.headers.origin !== origin) throw error(403, '请求来源不匹配');
  const rawPath = String(req.url || '/').split('?')[0];
  if (rawPath.includes('\\') || /%2e|%2f|%5c|(?:^|\/)\.\.(?:\/|$)/i.test(rawPath)) throw error(400, '无效路径');
  let url;
  try { url = new URL(req.url, origin); decodeURIComponent(url.pathname); }
  catch { throw error(400, '无效路径'); }
  if (url.origin !== origin) throw error(403, '请求来源不匹配');
  return url;
}

function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw error(415, '需要JSON请求');
  if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); throw error(413, '请求内容过大'); }
  return new Promise((accept, reject) => {
    const chunks = []; let length = 0, rejected = false;
    req.on('data', chunk => {
      length += chunk.length;
      if (length > MAX_BODY) { if (!rejected) reject(error(413, '请求内容过大')); rejected = true; return; }
      if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      try { accept(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(error(400, 'JSON内容无效')); }
    });
    req.on('error', () => reject(error(400, '请求未完成')));
    req.on('aborted', () => reject(error(400, '请求未完成')));
  });
}

const listen = (server, port) => new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); accept('http://127.0.0.1:' + server.address().port); });
});
const stop = server => new Promise(accept => {
  if (!server.listening) { accept(); return; }
  server.close(() => accept()); server.closeAllConnections();
});

export async function startPreview({ projectRoot = join(workspace, '项目'), port = 0, data } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('演示端口无效');
  const loaded = data || await (await import('./data.mjs')).loadModuleData({ projectRoot: resolve(projectRoot) });
  const { moduleData, assets, sources } = loaded;
  if (!record(moduleData) || !Array.isArray(moduleData.nodes) || !Array.isArray(moduleData.players) || !(assets instanceof Map) || !(sources instanceof Map)) throw Error('演示资料格式无效');
  const nodes = new Map(moduleData.nodes.map(node => [node.id, node]));
  const players = new Map(moduleData.players.map(player => [player.id, player]));
  const playerTokens = new Map([...players].map(([id]) => [id, secret()]));
  const tokens = new Map([...playerTokens].map(([id, token]) => [token, id]));
  let grants = new Map([...players].map(([id]) => [id, new Set()]));
  const caps = new Map(), pairs = new Map();
  let playerOrigin, dmOrigin, closed = false;

  function variantAsset(node, variantId) {
    const variant = (node.variants || [{ id: node.id, url: node.imageUrl }]).find(item => item.id === variantId);
    if (!variant || typeof variant.url !== 'string') throw error(400, '共享图片版本无效');
    const match = /^\/assets\/([A-Za-z0-9_-]+)$/.exec(variant.url);
    if (!match || !assets.has(match[1])) throw error(400, '共享图片不可用');
    return match[1];
  }

  function updateShares(value) {
    if (!record(value) || Object.keys(value).some(key => key !== 'shares') || !record(value.shares)) throw error(400, '共享清单无效');
    if (Object.keys(value.shares).length > moduleData.nodes.length) throw error(400, '共享清单过大');
    const next = new Map([...players].map(([id]) => [id, new Set()]));
    for (const [id, share] of Object.entries(value.shares)) {
      const node = nodes.get(id);
      if (!node || node.kind !== 'image' || !record(share) || Object.keys(share).some(key => !['variantId', 'players'].includes(key)) || !Array.isArray(share.players)) throw error(400, '仅图片地图可以共享');
      if (share.players.length > players.size || new Set(share.players).size !== share.players.length || share.players.some(player => !players.has(player))) throw error(400, '共享玩家无效');
      const asset = variantAsset(node, share.variantId);
      for (const player of share.players) next.get(player).add(asset);
    }
    const nextPairs = new Set();
    for (const [player, images] of next) for (const asset of images) nextPairs.add(JSON.stringify([player, asset]));
    for (const [pair, cap] of pairs) if (!nextPairs.has(pair)) { pairs.delete(pair); caps.delete(cap); }
    for (const pair of nextPairs) if (!pairs.has(pair)) {
      const cap = secret(); pairs.set(pair, cap); caps.set(cap, JSON.parse(pair));
    }
    grants = next;
  }

  async function sendAsset(res, key, head) {
    const asset = assets.get(key);
    if (!asset || !knownTypes.has(asset.mime)) throw error(404, '图片不存在');
    const bytes = asset.bytes === undefined ? await readFile(asset.path) : Buffer.from(asset.bytes);
    res.writeHead(200, { 'Content-Type': asset.mime, 'Content-Length': bytes.length }); res.end(head ? undefined : bytes);
  }

  async function sendStatic(req, res, filename) {
    const bytes = await readFile(join(directory, filename));
    const mime = filename.endsWith('.html') ? 'text/html; charset=utf-8' : filename.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': bytes.length }); res.end(req.method === 'HEAD' ? undefined : bytes);
  }

  const playerServer = createServer(async (req, res) => {
    headers(res, true);
    try {
      const url = checkedUrl(req, playerOrigin), path = url.pathname, head = req.method === 'HEAD';
      if (!['GET', 'HEAD'].includes(req.method)) throw error(405, '此入口只接收读取请求');
      if (path === '/' || path === '/player.html') { await sendStatic(req, res, 'player.html'); return; }
      if (path === '/player.mjs') { await sendStatic(req, res, 'player.mjs'); return; }
      if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
      if (path === '/api/images') {
        const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
        const player = bearer && tokens.get(bearer[1]);
        if (!player) throw error(401, '接收链接无效');
        const images = [...grants.get(player)].map(asset => '/image/' + pairs.get(JSON.stringify([player, asset])));
        json(res, 200, { images }, head); return;
      }
      const image = /^\/image\/([A-Za-z0-9_-]{43})$/.exec(path);
      if (image) {
        const pair = caps.get(image[1]);
        if (!pair || !grants.get(pair[0])?.has(pair[1])) throw error(404, '图片未获准');
        await sendAsset(res, pair[1], head); return;
      }
      throw error(404, '此入口没有该内容');
    } catch (failure) { if (!res.headersSent) json(res, failure.status || (failure.code === 'ENOENT' ? 404 : 500), { error: failure.status ? failure.message : '内容不可用' }); else res.end(); }
  });

  const staticPages = new Map([['/', 'index.html'], ...['index.html', 'app.mjs', 'style.css', 'model.mjs'].map(name => ['/' + name, name])]);
  const server = createServer(async (req, res) => {
    headers(res);
    try {
      const url = checkedUrl(req, dmOrigin), path = url.pathname, head = req.method === 'HEAD';
      if (path === '/api/shares') {
        if (req.method !== 'POST') throw error(405, '共享设置需要提交');
        updateShares(await readJson(req));
        json(res, 200, { previews: [...players].map(([id, player]) => ({ id, name: player.name, url: playerOrigin + '/#' + playerTokens.get(id) })) }); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw error(405, '此请求不支持');
      if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
      if (path === '/health') { json(res, 200, { app: 'map-canvas-preview', version: 1 }, head); return; }
      if (path === '/api/module') { json(res, 200, moduleData, head); return; }
      if (path === '/api/source') {
        const id = url.searchParams.get('node'); if (!sources.has(id)) throw error(404, '来源不存在');
        json(res, 200, { text: sources.get(id) }, head); return;
      }
      const asset = /^\/assets\/([A-Za-z0-9_-]+)$/.exec(path);
      if (asset) { await sendAsset(res, asset[1], head); return; }
      if (staticPages.has(path)) { await sendStatic(req, res, staticPages.get(path)); return; }
      throw error(404, '此演示没有该内容');
    } catch (failure) { if (!res.headersSent) json(res, failure.status || (failure.code === 'ENOENT' ? 404 : 500), { error: failure.status ? failure.message : '内容不可用' }); else res.end(); }
  });

  try { playerOrigin = await listen(playerServer, 0); dmOrigin = await listen(server, port); }
  catch (failure) { await Promise.all([stop(server), stop(playerServer)]); throw failure; }
  return {
    server, url: dmOrigin,
    close: async () => { if (closed) return; closed = true; tokens.clear(); caps.clear(); pairs.clear(); await Promise.all([stop(server), stop(playerServer)]); }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const value = option('--port'), port = value === undefined ? 0 : Number(value);
  const app = await startPreview({ projectRoot: option('--project-root'), port });
  console.log('地图演示：' + app.url);
  console.log('关闭此窗口可结束演示；画布请通过页面保存到本地文件。');
  if (args.includes('--open')) {
    const child = process.platform === 'win32'
      ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', app.url], { detached: true, stdio: 'ignore', windowsHide: true })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [app.url], { detached: true, stdio: 'ignore' });
    child.on('error', () => console.log('请将上方地址复制到浏览器打开。')); child.unref();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit(0)));
}

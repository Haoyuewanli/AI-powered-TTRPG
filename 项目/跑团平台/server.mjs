import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAppearanceStore } from './appearance-store.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const PLATFORM_APP = 'standalone-ttrpg-platform';
export const PLATFORM_VERSION = 'platform-design-v2';
export const platformRootKey = createHash('sha256').update(process.platform === 'win32' ? ROOT.toLowerCase() : ROOT).digest('hex');

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/base.css', ['base.css', 'text/css; charset=utf-8']],
  ['/platform-shell.mjs', ['platform-shell.mjs', 'text/javascript; charset=utf-8']],
  ['/platform-shell.css', ['platform-shell.css', 'text/css; charset=utf-8']],
  ['/dialogue-workspace.mjs', ['dialogue-workspace.mjs', 'text/javascript; charset=utf-8']],
  ['/dialogue-workspace.css', ['dialogue-workspace.css', 'text/css; charset=utf-8']],
  ['/design-workspace.mjs', ['design-workspace.mjs', 'text/javascript; charset=utf-8']],
  ['/design-workspace.css', ['design-workspace.css', 'text/css; charset=utf-8']]
]);

export function parsePort(value, fallback = 4198) {
  const source = value ?? fallback;
  if ((typeof source !== 'number' && typeof source !== 'string') || !/^\d+$/.test(String(source))) throw new Error('端口须为0～65535的整数');
  const port = Number(source);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('端口须为0～65535的整数');
  return port;
}

export async function startPlatform({ port = 0, host, appearanceFile = join(ROOT, '.runtime', '外观.json') } = {}) {
  if (host !== undefined && host !== '127.0.0.1') throw new Error('平台首版仅监听127.0.0.1');
  port = parsePort(port);
  const appearance = createAppearanceStore(appearanceFile);
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const send = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) return send(403, { error: '只接受本机同源请求' });
      const path = new URL(request.url, origin).pathname;
      if (path === '/api/appearance' && ['GET', 'POST'].includes(request.method)) {
        let result;
        if (request.method === 'GET') result = await appearance.read();
        else {
          if (!String(request.headers['content-type']).startsWith('application/json')) return send(415, { error: '需要JSON请求' });
          const chunks = []; let size = 0;
          for await (const chunk of request) { size += chunk.length; if (size > 16384) return send(413, { error: '外观请求过大' }); chunks.push(chunk); }
          let value; try { value = JSON.parse(Buffer.concat(chunks)); } catch { return send(400, { error: 'JSON无效' }); }
          result = await appearance.save(value, request.headers['if-match']);
        }
        response.setHeader('ETag', result.etag); return send(200, result.value);
      }
      if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return send(405, { error: '此入口不提供业务写入' }); }
      if (path === '/health') return send(200, { app: PLATFORM_APP, version: PLATFORM_VERSION,
        capabilities: { standalone: 1, dialogueDemo: 1, design: 1, appearance: 1 }, rootKey: platformRootKey, pid: process.pid });
      if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      const entry = staticFiles.get(path);
      if (!entry) return send(404, { error: '页面不存在' });
      const content = await readFile(join(ROOT, 'web', entry[0]));
      response.writeHead(200, { 'Content-Type': entry[1], 'Content-Length': content.length }); response.end(content);
    } catch (error) {
      if (!response.headersSent) send(error.status || 500, { error: error.status ? error.message : '平台读取失败，请核对平台文件夹是否完整' });
      else response.end();
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); accept(); });
  });
  let closing;
  return { url: `http://127.0.0.1:${server.address().port}`, server,
    close() { return closing ??= new Promise((accept, reject) => { server.close(error => error ? reject(error) : accept()); server.closeIdleConnections?.(); }); } };
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  try {
    const index = process.argv.indexOf('--port');
    if (index >= 0 && process.argv[index + 1] === undefined) throw new Error('--port需要端口参数');
    const port = parsePort(index < 0 ? process.env.RPG_PLATFORM_PORT : process.argv[index + 1]);
    const app = await startPlatform({ port });
    for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
    process.send?.({ type: 'platform-ready', url: app.url, rootKey: platformRootKey });
    console.log(`独立跑团平台已启动：${app.url}`);
  } catch (error) { console.error(error.code === 'EADDRINUSE' ? '平台端口已被占用，请使用其他--port端口。' : error.message); process.exitCode = 1; }
}

import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

export function makeServer() {
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const name = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!(name === 'index.html' || name === 'style.css' || name.startsWith('src/') ||
          name.startsWith('node_modules/')) || name.split(/[\\/]/).some(part => part.startsWith('.'))) {
        response.writeHead(404).end();
        return;
      }
      const dependency = name.startsWith('node_modules/');
      const allowedRoot = dependency ? resolve(root, '../node_modules') : root;
      const path = await realpath(resolve(allowedRoot, dependency ? name.slice('node_modules/'.length) : name));
      const rel = relative(allowedRoot, path);
      if (rel.startsWith('..') || isAbsolute(rel) || !mime[extname(path)]) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(path);
      response.writeHead(200, { 'Content-Type': mime[extname(path)],
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.DICE_PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DICE_PORT 须为有效端口号。');
  const server = makeServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? '端口已被占用。请先检查已有骰盘窗口，或设置其他 DICE_PORT。' : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`骰盘已启动：${url}\n关闭此窗口或按 Ctrl+C 停止。`);
    if (process.argv.includes('--open') && process.platform === 'win32') {
      execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, error => {
        if (error) console.error('浏览器未能自动打开，请使用上面的地址。');
      });
    }
  });
}

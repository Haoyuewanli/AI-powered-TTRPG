import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(directory, '../../..');
const official = join(workspace, '项目/资源/程序/平台/web');
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

export async function startPreview({ projectRoot = join(workspace, '项目'), port = 0 } = {}) {
  const pages = new Map(['index.html', 'preview.mjs', 'preview.css', 'preview-workspace.mjs', 'original.html', 'original.mjs'].map(name => ['/' + name, join(directory, name)]));
  pages.set('/', join(directory, 'index.html'));
  pages.set('/base.css', join(official, 'base.css'));
  pages.set('/official/design-workspace.mjs', join(official, 'design-workspace.mjs'));
  pages.set('/official/design-workspace.css', join(official, 'design-workspace.css'));
  const cover = join(resolve(projectRoot), '模组/预处理/故事/stormwreck-isle-v1436/模组封面.png');
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('Read-only preview'); return; }
    let path;
    try { path = new URL(req.url, 'http://127.0.0.1').pathname; } catch { res.writeHead(400).end(); return; }
    if (path === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ app: 'platform-questionnaire-preview', version: 1, readOnly: true })); return; }
    if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
    const filename = path === '/asset/stormwreck-cover' ? cover : pages.get(path);
    if (!filename) { res.writeHead(404).end('Not part of this preview'); return; }
    try {
      const body = await readFile(filename);
      const extension = filename.slice(filename.lastIndexOf('.'));
      res.setHeader('Content-Type', path === '/asset/stormwreck-cover' ? 'image/png' : mime[extension] || 'application/octet-stream');
      res.writeHead(200);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Preview file unavailable');
    }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  return { server, url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const readOption = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const portValue = readOption('--port');
  const port = portValue === undefined ? 0 : Number(portValue);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid preview port');
  const app = await startPreview({ projectRoot: readOption('--project-root'), port });
  console.log(app.url);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit(0)));
}

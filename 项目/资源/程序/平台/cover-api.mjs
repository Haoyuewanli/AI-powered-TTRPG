import { resolve } from 'node:path';

const problem = (status, message) => Object.assign(new Error(message), { status });
async function readBody(request) {
  if (!String(request.headers['content-type']).startsWith('application/json')) throw problem(415, '封面保存请求须为JSON');
  const chunks = []; let count = 0;
  for await (const chunk of request) { count += chunk.length; if (count > 65536) throw problem(413, '封面请求超过64KB'); chunks.push(chunk); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw problem(400, '封面请求JSON无效'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw problem(400, '封面请求须为JSON对象');
  return body;
}

export function createCoverApi({ modulesRoot } = {}) {
  if (typeof modulesRoot !== 'string' || !modulesRoot) throw problem(400, '须明确指定模组根目录');
  let library;
  async function getLibrary() {
    if (!library) {
      const { createModuleLibrary } = await import('../封面工具/src/module-library.mjs');
      library = createModuleLibrary({ root: resolve(modulesRoot) });
    }
    return library;
  }
  return {
    async handle(request, url, send, sendImage) {
      if (!['/api/module-covers', '/api/module-covers/image'].includes(url.pathname)) return false;
      const tool = await getLibrary();
      if (request.method === 'GET' && url.pathname === '/api/module-covers') { send(200, await tool.catalog()); return true; }
      if (request.method === 'POST' && url.pathname === '/api/module-covers') { send(200, await tool.saveCrop(await readBody(request))); return true; }
      if (request.method === 'GET' && url.pathname === '/api/module-covers/image') {
        const image = await tool.readCover(url.searchParams.get('moduleId'));
        sendImage(200, image.bytes, image.mime); return true;
      }
      throw problem(405, '封面接口不支持此请求');
    }
  };
}

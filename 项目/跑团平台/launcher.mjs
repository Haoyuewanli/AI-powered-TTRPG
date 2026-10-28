import { spawn, execFile } from 'node:child_process';
import { mkdir, open, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createConnection } from 'node:net';
import { PLATFORM_APP, PLATFORM_VERSION, platformRootKey, parsePort } from './server.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

async function readHealth(url) {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(700), redirect: 'error' });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

function assertCompatible(status) {
  if (status.app !== PLATFORM_APP) throw new Error('此端口运行的是其他服务，请用--port指定其他端口。');
  if (status.rootKey !== platformRootKey) throw new Error('此端口属于另一个平台文件夹，请用--port指定其他端口。');
  if (status.version !== PLATFORM_VERSION || status.capabilities?.standalone !== 1 || status.capabilities?.dialogueDemo !== 1) throw new Error('此端口的平台版本不同。请先停止对应的旧平台服务后重开，或用--port指定其他端口。');
}

async function occupied(port) {
  return new Promise(accept => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    let done = false;
    const finish = value => { if (!done) { done = true; socket.destroy(); accept(value); } };
    socket.setTimeout(600); socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.once('timeout', () => finish(false));
  });
}

function localUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('平台启动返回了无效的本机地址');
  return url.origin;
}

async function startChild(port) {
  const runtime = join(ROOT, '.runtime'); await mkdir(runtime, { recursive: true });
  const output = await open(join(runtime, 'server-output.log'), 'a');
  const errors = await open(join(runtime, 'server-error.log'), 'a');
  let child, accepted = false;
  try {
    child = spawn(process.execPath, [join(ROOT, 'server.mjs'), '--port', String(port)], {
      cwd: ROOT, detached: true, windowsHide: true, stdio: ['ignore', output.fd, errors.fd, 'ipc']
    });
    const ready = await new Promise((accept, reject) => {
      const cleanup = () => { clearTimeout(timer); child.removeListener('message', onMessage); child.removeListener('error', onError); child.removeListener('exit', onExit); };
      const onError = error => { cleanup(); reject(error); };
      const onExit = () => { cleanup(); reject(new Error('平台启动未完成，请查看平台文件夹.runtime/server-error.log。')); };
      const onMessage = message => {
        if (message?.type !== 'platform-ready') return;
        cleanup();
        try {
          if (message.rootKey !== platformRootKey) throw new Error('启动结果不属于当前平台文件夹');
          accept(localUrl(message.url));
        } catch (error) { reject(error); }
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('平台启动超时，请查看平台文件夹.runtime/server-error.log。')); }, 10000);
      child.once('error', onError); child.once('exit', onExit); child.on('message', onMessage);
    });
    const status = await readHealth(ready);
    if (!status) throw new Error('平台尚未就绪，请查看平台文件夹.runtime/server-error.log。');
    assertCompatible(status); accepted = true; return { url: ready, pid: child.pid };
  } finally {
    await output.close(); await errors.close();
    if (child) {
      if (!accepted && child.exitCode === null) child.kill();
      if (child.connected) child.disconnect();
      child.unref();
    }
  }
}

async function openBrowser(url) {
  if (process.platform !== 'win32') return;
  const candidates = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA]
    .filter(Boolean).map(base => join(base, 'Microsoft/Edge/Application/msedge.exe'));
  for (const executable of candidates) {
    try { await access(executable); } catch { continue; }
    const child = spawn(executable, [`--app=${localUrl(url)}`, `--user-data-dir=${join(ROOT, '.runtime/browser')}`, '--no-first-run', '--disable-sync', '--disable-background-networking', '--no-default-browser-check'],
      { detached: true, windowsHide: true, stdio: 'ignore' });
    try { await new Promise((accept, reject) => { child.once('spawn', accept); child.once('error', reject); }); child.unref(); return; }
    catch { /* Try the system browser when Edge cannot start. */ }
  }
  await new Promise((accept, reject) => execFile('rundll32.exe', ['url.dll,FileProtocolHandler', localUrl(url)], { windowsHide: true }, error => error ? reject(error) : accept()));
}

export async function launchPlatform({ port = parsePort(process.env.RPG_PLATFORM_PORT), noBrowser = false } = {}) {
  port = parsePort(port);
  let url = port ? `http://127.0.0.1:${port}` : '', pid, reused = false;
  const status = port ? await readHealth(url) : null;
  if (status) { assertCompatible(status); reused = true; pid = status.pid; }
  else {
    if (port && await occupied(port)) throw new Error('端口被其他程序占用，未启动或停止任何既有服务；请用--port指定其他端口。');
    try { ({ url, pid } = await startChild(port)); }
    catch (error) {
      const concurrent = port ? await readHealth(url) : null;
      if (!concurrent) throw error;
      assertCompatible(concurrent); reused = true; pid = concurrent.pid;
    }
  }
  if (!noBrowser) await openBrowser(url);
  return { url, reused, pid };
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  try {
    const index = process.argv.indexOf('--port');
    if (index >= 0 && process.argv[index + 1] === undefined) throw new Error('--port需要端口参数');
    const port = parsePort(index < 0 ? process.env.RPG_PLATFORM_PORT : process.argv[index + 1]);
    const result = await launchPlatform({ port, noBrowser: process.argv.includes('--no-browser') });
    console.log(`独立跑团平台${result.reused ? '已复用' : '已就绪'}：${result.url}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

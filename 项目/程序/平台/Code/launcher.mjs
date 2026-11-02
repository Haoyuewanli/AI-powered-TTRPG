import { spawn, execFile } from 'node:child_process';
import { mkdir, open, access, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createConnection } from 'node:net';
import { createAppearanceStore, defaultAppearance } from './appearance-store.mjs';
import { createNativeWindow, platformAppUrl, platformWindowProfile } from './native-window.mjs';
import { PLATFORM_APP, PLATFORM_VERSION, platformRootKey, parsePort, projectKey, defaultProjectRoot } from './server.mjs';

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
  if (status.projectRootKey !== projectKey(defaultProjectRoot())) throw new Error('此端口属于另一个项目资料根目录，请用--port指定其他端口。');
  if (status.version !== PLATFORM_VERSION || status.capabilities?.standalone !== 1 || status.capabilities?.dialogueDemo !== 1 || status.capabilities?.nativeWindow !== 1) throw new Error('此端口的平台版本不同。请先停止对应的旧平台服务后重开，或用--port指定其他端口。');
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
  if (process.platform !== 'win32') return { status: 'unsupported' };
  const candidates = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA]
    .filter(Boolean).map(base => join(base, 'Microsoft/Edge/Application/msedge.exe'));
  for (const executable of candidates) {
    try { await access(executable); } catch { continue; }
    const projectRoot = defaultProjectRoot(), profile = platformWindowProfile(ROOT, projectRoot, url);
    const controller = createNativeWindow({ codeRoot: ROOT, projectRoot, getUrl: () => url, browser: async () => executable });
    let preset = defaultAppearance().displayPreset;
    try { preset = (await createAppearanceStore(join(ROOT, '.runtime/外观.json')).read()).value.displayPreset; } catch { /* The page reports the preserved damaged appearance file. */ }
    const current = await controller.inspect();
    if (current.status === 'ambiguous') return current;
    if (current.status === 'found') return { ...await controller.resize(preset, { activate: true }), reusedWindow: true };
    if (current.status !== 'unmanaged') return current;
    await mkdir(profile, { recursive: true });
    const child = spawn(executable, [`--app=${platformAppUrl(url)}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-sync', '--disable-background-networking', '--no-default-browser-check'],
      { detached: true, windowsHide: true, stdio: 'ignore' });
    try { await new Promise((accept, reject) => { child.once('spawn', accept); child.once('error', reject); }); child.unref(); return { ...await controller.resize(preset, { waitMs: 5000, activate: true }), reusedWindow: false }; }
    catch { /* Try the system browser when Edge cannot start. */ }
  }
  await new Promise((accept, reject) => execFile('rundll32.exe', ['url.dll,FileProtocolHandler', localUrl(url)], { windowsHide: true }, error => error ? reject(error) : accept()));
  return { status: 'browser' };
}

async function launchAt(port, autoPort) {
  port = parsePort(port);
  let url = port ? `http://127.0.0.1:${port}` : '', pid, reused = false;
  const status = port ? await readHealth(url) : null;
  if (status) {
    try { assertCompatible(status); }
    catch (error) { if (autoPort) return null; throw error; }
    reused = true; pid = status.pid;
  }
  else {
    if (port && await occupied(port)) {
      if (autoPort) return null;
      throw new Error('端口被其他程序占用，未启动或停止任何既有服务；请用--port指定其他端口。');
    }
    try { ({ url, pid } = await startChild(port)); }
    catch (error) {
      const concurrent = port ? await readHealth(url) : null;
      if (!concurrent) {
        if (autoPort && port && await occupied(port)) return null;
        throw error;
      }
      try { assertCompatible(concurrent); }
      catch (mismatch) { if (autoPort) return null; throw mismatch; }
      reused = true; pid = concurrent.pid;
    }
  }
  return { url, reused, pid };
}

async function rememberedEndpoint(file) {
  try {
    const bytes = await readFile(file); if (bytes.length > 4096) return null;
    const url = localUrl(JSON.parse(bytes.toString('utf8')).url);
    const status = await readHealth(url); if (!status) return null;
    assertCompatible(status);
    return { url, reused: true, pid: status.pid };
  } catch { return null; }
}

async function rememberEndpoint(file, url) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temporary, JSON.stringify({ url }) + '\n', { flag: 'wx' });
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}

export async function launchPlatform({ port, noBrowser = false, autoPort = port === undefined && process.env.RPG_PLATFORM_PORT === undefined } = {}) {
  port = parsePort(port ?? process.env.RPG_PLATFORM_PORT);
  const endpointFile = join(ROOT, '.runtime', 'launch-' + projectKey(defaultProjectRoot()) + '.json');
  let result = autoPort ? await rememberedEndpoint(endpointFile) : null;
  result ||= await launchAt(port, autoPort);
  result ||= await launchAt(0, false);
  if (autoPort) {
    try { await rememberEndpoint(endpointFile, result.url); }
    catch { result.warning = '平台已启动，但重开地址未能保存。请保留当前地址，核对程序目录的写入权限。'; }
  }
  const { url } = result;
  if (!noBrowser) {
    result.window = await openBrowser(url);
    if (result.window?.status !== 'resized') result.warning = [result.warning, '平台已就绪，但未能调整独立窗口尺寸；请仅保留一个平台窗口后重开。'].filter(Boolean).join(' ');
  }
  return result;
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  try {
    const index = process.argv.indexOf('--port');
    if (index >= 0 && process.argv[index + 1] === undefined) throw new Error('--port需要端口参数');
    const port = index < 0 ? undefined : parsePort(process.argv[index + 1]);
    const result = await launchPlatform({ port, noBrowser: process.argv.includes('--no-browser') });
    if (result.warning) console.warn(result.warning);
    console.log(`独立跑团平台${result.reused ? '已复用' : '已就绪'}：${result.url}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

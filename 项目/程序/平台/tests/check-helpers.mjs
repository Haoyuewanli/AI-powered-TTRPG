import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, mkdtemp } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const platformDirectory = fileURLToPath(new URL('..', import.meta.url));
export const outputDirectory = fileURLToPath(new URL('../../../../开发记录/临时/独立平台检查/', import.meta.url));

export async function isolatePlatform(prefix = 'case-') {
  await mkdir(outputDirectory, { recursive: true });
  const directory = await mkdtemp(join(outputDirectory, prefix));
  const isolated = join(directory, 'isolated');
  await cp(platformDirectory, isolated, {
    recursive: true,
    filter: source => !['.runtime', 'node_modules', '模组', '资源', '当前', '战斗', '对话', '进度'].includes(relative(platformDirectory, source).split(sep)[0])
  });
  await assert.rejects(access(join(directory, '战斗')), { code: 'ENOENT' });
  await assert.rejects(access(join(directory, 'node_modules')), { code: 'ENOENT' });
  return { directory, isolated };
}

export async function startIsolated(isolated, { projectRoot = join(isolated, '.runtime', 'project') } = {}) {
  await mkdir(projectRoot, { recursive: true });
  const child = spawn(process.execPath, [join(isolated, 'server.mjs'), '--port', '0'], {
    cwd: isolated, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, RPG_PROJECT_ROOT: projectRoot }
  });
  let output = '';
  child.stdout.on('data', value => { output += value; });
  child.stderr.on('data', value => { output += value; });
  const ready = await new Promise((accept, reject) => {
    const cleanup = () => { clearTimeout(timer); child.removeListener('error', failed); child.removeListener('exit', ended); child.removeListener('message', message); };
    const failed = error => { cleanup(); reject(error); };
    const ended = code => failed(new Error('Isolated platform exited before ready: ' + code + '\n' + output));
    const message = value => {
      if (value?.type !== 'platform-ready') return;
      cleanup(); accept(value);
    };
    const timer = setTimeout(() => { child.kill(); failed(new Error('Isolated platform timed out\n' + output)); }, 10000);
    child.once('error', failed); child.once('exit', ended); child.on('message', message);
  });
  assert.match(ready.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  return {
    ...ready, child,
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise(accept => { child.once('exit', accept); child.kill(); });
    }
  };
}

export async function stopOwnedPlatform(pid, url) {
  const health = await fetch(url + '/health').then(response => response.json()).catch(() => null);
  if (!health) return;
  assert.equal(health.pid, pid, 'Only the process created by this check may be stopped');
  assert.equal(health.app, 'standalone-ttrpg-platform');
  process.kill(pid);
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(accept => setTimeout(accept, 50));
    if (!await fetch(url + '/health').then(() => true).catch(() => false)) return;
  }
  throw new Error('Owned platform did not stop');
}

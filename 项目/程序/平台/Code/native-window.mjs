import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const executeFile = promisify(execFile);
const presets = new Map([['2560x1600', [2560, 1600]], ['2560x1440', [2560, 1440]], ['2048x1536', [2048, 1536]], ['1920x1440', [1920, 1440]]]);
const statuses = new Set(['found', 'resized', 'unmanaged', 'ambiguous', 'unsupported', 'failed']);
const pathKey = path => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);

export function platformAppUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.username || url.password || url.hash && url.hash !== '#platform-window=1') throw new Error('平台独立窗口只接受完整本机平台地址');
  return url.origin + '/#platform-window=1';
}

export function platformWindowProfile(codeRoot, projectRoot, url) {
  const origin = new URL(platformAppUrl(url)).origin;
  const hash = createHash('sha256').update(pathKey(projectRoot) + '\0' + origin).digest('hex').slice(0, 24);
  return join(resolve(codeRoot), '.runtime', 'browser-' + hash);
}

async function installedBrowser() {
  const candidates = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA]
    .filter(Boolean).map(root => join(root, 'Microsoft/Edge/Application/msedge.exe'));
  for (const executable of candidates) {
    try { await access(executable); return executable; } catch { /* Continue through installed locations. */ }
  }
  return null;
}

function outcome(status, requested = [0, 0], reason) {
  return { status, width: 0, height: 0, requestedWidth: requested[0], requestedHeight: requested[1], scale: 1, scaled: false, windowCount: 0, ...(reason ? { reason } : {}) };
}

function checkedResult(value, mode, requested) {
  if (!value || !statuses.has(value.status) || !Number.isInteger(value.windowCount) || value.windowCount < 0 || value.windowCount > 1000) throw new Error('Invalid native-window result');
  for (const key of ['width', 'height', 'requestedWidth', 'requestedHeight']) if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 65536) throw new Error('Invalid native-window dimensions');
  if (!Number.isFinite(value.scale) || value.scale <= 0 || value.scale > 1 || typeof value.scaled !== 'boolean') throw new Error('Invalid native-window scale');
  if (value.requestedWidth !== requested[0] || value.requestedHeight !== requested[1]) throw new Error('Native-window preset mismatch');
  if (value.status === 'resized' && mode !== 'resize' || ['found', 'resized'].includes(value.status) && (value.windowCount !== 1 || value.width === 0 || value.height === 0)) throw new Error('Unconfirmed native window');
  if (value.status === 'resized' && (value.width !== Math.floor(requested[0] * value.scale) || value.height !== Math.floor(requested[1] * value.scale) || value.scaled !== (value.scale < 1))) throw new Error('Unconfirmed native-window dimensions');
  const result = { status: value.status, width: value.width, height: value.height, requestedWidth: value.requestedWidth, requestedHeight: value.requestedHeight, scale: value.scale, scaled: value.scaled, windowCount: value.windowCount };
  if (typeof value.reason === 'string' && /^[a-z-]{1,80}$/.test(value.reason)) result.reason = value.reason;
  if (Number.isSafeInteger(value.pid) && value.pid > 0) result.pid = value.pid;
  if (typeof value.windowId === 'string' && /^\d{1,20}$/.test(value.windowId)) result.windowId = value.windowId;
  return result;
}

export function createNativeWindow({ codeRoot, projectRoot, getUrl, browser = installedBrowser, execute = executeFile }) {
  if (typeof codeRoot !== 'string' || typeof projectRoot !== 'string' || typeof getUrl !== 'function') throw new Error('原生窗口需要明确的平台程序和资料根');
  const helper = join(resolve(codeRoot), 'native-window.ps1');
  let queue = Promise.resolve();
  function operation(mode, preset, { waitMs = 0, activate = false } = {}) {
    if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 5000 || typeof activate !== 'boolean') return Promise.reject(new Error('原生窗口等待参数无效'));
    const requested = mode === 'resize' ? presets.get(preset) : [0, 0];
    if (!requested) return Promise.reject(new Error('不支持此窗口尺寸预设'));
    const task = queue.then(async () => {
      if (process.platform !== 'win32') return outcome('unsupported', requested, 'windows-required');
      let appUrl, profile;
      try { appUrl = platformAppUrl(getUrl()); profile = platformWindowProfile(codeRoot, projectRoot, appUrl); }
      catch { return outcome('failed', requested, 'invalid-platform-origin'); }
      try {
        const info = await lstat(profile);
        if (!info.isDirectory() || info.isSymbolicLink()) return outcome('failed', requested, 'unsafe-browser-profile');
      } catch (error) {
        if (error.code !== 'ENOENT') return outcome('failed', requested, 'profile-unavailable');
        if (!waitMs) return outcome('unmanaged', requested, 'profile-not-created');
      }
      let executable;
      try { executable = typeof browser === 'function' ? await browser() : browser; }
      catch { return outcome('unsupported', requested, 'edge-unavailable'); }
      if (typeof executable !== 'string' || !executable) return outcome('unsupported', requested, 'edge-unavailable');
      const args = ['-NoProfile', '-NonInteractive', '-File', helper, '-Mode', mode, '-EdgePath', executable, '-Profile', profile, '-AppUrl', appUrl, '-WaitMs', String(waitMs)];
      if (mode === 'resize') args.push('-Preset', preset);
      if (activate) args.push('-Activate');
      try {
        const { stdout } = await execute('powershell.exe', args, { windowsHide: true, shell: false, timeout: 10000 + waitMs, maxBuffer: 65536, encoding: 'utf8' });
        return checkedResult(JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim()), mode, requested);
      } catch { return outcome('failed', requested, 'native-helper-failed'); }
    });
    queue = task.catch(() => {}); return task;
  }
  return { inspect(options) { return operation('inspect', null, options); }, resize(preset, options) { return operation('resize', preset, options); } };
}

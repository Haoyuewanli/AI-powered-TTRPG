import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { RuleError } from './rules.mjs';

export function createTunnel({ executable, spawnProcess = spawn, checkExecutable = access, timeoutMs = 30000 } = {}) {
  let child, timer, generation = 0;
  let state = { status: 'stopped', url: null, error: null };
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const snapshot = () => ({ ...state });
  const stopChild = process => {
    if (!process || process.exitCode !== null || process.signalCode) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => { clearTimeout(limit); resolve(); };
      const limit = setTimeout(done, 3000);
      process.once('exit', done);
      try { process.kill(); } catch { done(); }
    });
  };
  return {
    get state() { return snapshot(); },
    async start(target) {
      if (state.status === 'starting' || state.status === 'ready') return snapshot();
      const current = ++generation;
      clearTimer();
      const previous = child; child = undefined;
      state = { status: 'starting', url: null, error: null };
      await stopChild(previous);
      if (generation !== current) return snapshot();
      try { await checkExecutable(executable); }
      catch {
        if (generation !== current) return snapshot();
        const message = '线上连接工具尚未准备好，请先完成 cloudflared 下载；同一 Wi-Fi 仍可加入。';
        state = { status: 'error', url: null, error: message };
        throw new RuleError(message, 503);
      }
      if (generation !== current) return snapshot();
      let connected = false;
      let pending = '';
      const fail = message => {
        if (generation !== current || state.status === 'error') return;
        clearTimer();
        state = { status: 'error', url: null, error: message };
      };
      try {
        child = spawnProcess(executable, ['tunnel', '--no-autoupdate', '--url', target, '--protocol', 'auto',
          '--edge-ip-version', '4', '--metrics', '127.0.0.1:0', '--loglevel', 'info'], {
          cwd: dirname(executable), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch { fail('线上连接工具无法启动，请检查工具文件是否完整。'); return snapshot(); }
      const process = child;
      const consume = chunk => {
        if (generation !== current || state.status === 'error') return;
        pending = (pending + chunk.toString('utf8')).slice(-16384);
        const match = pending.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i);
        if (match) state.url = match[0].toLowerCase();
        if (/Registered tunnel connection|"event"\s*:\s*"registered"/i.test(pending)) connected = true;
        if (state.url && connected) { state.status = 'ready'; clearTimer(); }
      };
      process.stdout?.on('data', consume);
      process.stderr?.on('data', consume);
      process.once('error', () => fail('线上连接工具无法启动，请检查工具文件是否完整。'));
      process.once('exit', () => {
        if (generation !== current) return;
        child = undefined;
        fail('线上连接已中断，可点“重新连接”；本地保存的进度不受影响。');
      });
      timer = setTimeout(() => {
        fail('线上连接暂时未成功，请检查互联网连接后重试；也可继续使用同一 Wi-Fi 加入。');
        void stopChild(process);
      }, timeoutMs);
      timer.unref?.();
      return snapshot();
    },
    async stop() {
      ++generation;
      clearTimer();
      const previous = child; child = undefined;
      state = { status: 'stopped', url: null, error: null };
      await stopChild(previous);
      return snapshot();
    }
  };
}

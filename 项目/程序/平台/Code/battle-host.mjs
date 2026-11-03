import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export function createBattleHost({ projectRoot, getOrigin }) {
  let child, connection, starting, activeKey = '', projection = { state: 'idle' };
  const pending = new Map();
  function request(operation, payload) {
    if (!child?.connected) throw Object.assign(new Error('请先从模组窗口载入已有战斗团'), { status: 409 });
    const id = randomUUID();
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('战斗模块响应超时')); }, 15000);
      pending.set(id, { accept, reject, timer }); child.send({ type: 'request', id, operation, payload });
    });
  }
  async function start(options = {}) {
    const key = options.library ? options.library.moduleId + '/' + options.library.runId : 'legacy';
    if (starting && !connection && activeKey !== key) throw Object.assign(new Error('上一场战斗仍在启动，请稍后再切换。'), { status: 409 });
    if (connection && activeKey !== key) { await close(); }
    if (connection) return { ...connection, projection };
    activeKey = key;
    return starting ||= new Promise((accept, reject) => {
      child = spawn(process.execPath, [fileURLToPath(new URL('./battle-process.mjs', import.meta.url)), projectRoot, getOrigin()], { windowsHide: true,
        env: { ...process.env, RPG_LIBRARY_BATTLE: options.library ? JSON.stringify(options.library) : '' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      const owned = child;
      const timer = setTimeout(() => { owned.kill(); reject(new Error('战斗启动超时；原资料已保留')); }, 20000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('message', message => {
        if (child !== owned) return;
        if (message.type === 'ready') { clearTimeout(timer); connection = { url: message.url, coreVersion: message.coreVersion,
          ...(options.library ? { context: { kind: 'library', moduleId: options.library.moduleId, runId: options.library.runId, runName: options.library.name } } : {}) }; accept({ ...connection, projection }); }
        else if (message.type === 'startup-error') { clearTimeout(timer); reject(Object.assign(new Error(message.error), { status: 409 })); }
        else if (message.type === 'projection') projection = message.status;
        else if (message.type === 'reply') {
          const entry = pending.get(message.id); if (!entry) return; clearTimeout(entry.timer); pending.delete(message.id);
          if (message.error) entry.reject(Object.assign(new Error(message.error), { status: 409 })); else entry.accept(message.value);
        }
      });
      child.on('exit', () => {
        if (child !== owned) return;
        clearTimeout(timer); connection = null; starting = null;
        for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('战斗服务已停止')); } pending.clear();
        reject(new Error('战斗服务已退出，请检查资源中的战役存档；平台仍可独立使用'));
      });
    }).catch(error => { starting = null; throw error; });
  }
  async function close() {
    if (!child || child.exitCode !== null) return;
    const owned = child;
    await new Promise(accept => { const timer = setTimeout(() => { owned.kill(); accept(); }, 10000); owned.once('exit', () => { clearTimeout(timer); accept(); }); if (owned.connected) owned.send({ type: 'close' }); else owned.kill(); });
  }
  return { start, status: () => ({ ...connection, running: !!connection, projection }),
    catalog: () => connection ? request('catalog') : null,
    select: (campaignId, battleId) => request('select', { campaignId, battleId }),
    logout: () => connection ? request('logout') : Promise.resolve(),
    close };
}

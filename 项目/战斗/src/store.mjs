import { readFile, writeFile, mkdir, rename, open, unlink, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { executeAction, validateState } from './rules.mjs';

export async function atomicJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temp, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8');
    await handle.sync(); await handle.close(); handle = undefined;
    await rename(temp, path);
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temp).catch(() => {});
    throw error;
  }
}

async function readValid(path) {
  const state = JSON.parse(await readFile(path, 'utf8'));
  validateState(state);
  return state;
}

export async function openStore(directory, initial, { persist = atomicJson } = {}) {
  const dir = resolve(directory);
  await mkdir(dir, { recursive: true });
  const lock = join(dir, '.battle.lock');
  try {
    const handle = await open(lock, 'wx');
    await handle.writeFile(String(process.pid)); await handle.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lock, 'utf8'));
    let alive = true;
    try { process.kill(pid, 0); } catch (failure) { alive = failure.code !== 'ESRCH'; }
    if (alive || !Number.isInteger(pid) || pid <= 0) throw new Error('该战役已由另一个进程打开；请先关闭原战斗服务。');
    await unlink(lock);
    return openStore(directory, initial, { persist });
  }
  const path = join(dir, '战斗状态.json'), backup = join(dir, '战斗状态.previous.json');
  let state, recoveryNote = '';
  try {
    try { state = await readValid(path); }
    catch (primaryError) {
      try {
        state = await readValid(backup);
        if (primaryError.code !== 'ENOENT') await copyFile(path, join(dir, `损坏存档-${Date.now()}.json`));
        await atomicJson(path, state);
        recoveryNote = '当前存档不可用，已恢复上一完整保存点。请DM核对最近一次操作。';
      } catch (backupError) {
        if (primaryError.code !== 'ENOENT' || backupError.code !== 'ENOENT') throw new Error('存档无法读取或版本不支持；原件已保留，请检查战役目录。');
        state = await initial(); validateState(state); await atomicJson(path, state);
      }
    }
  } catch (error) { await unlink(lock); throw error; }
  let queue = Promise.resolve();
  return {
    get state() { return structuredClone(state); },
    recoveryNote,
    dispatch(command, principal, options) {
      const task = queue.then(async () => {
        const next = executeAction(state, command, principal, options);
        // The backup is the last verified in-memory state, never an unread corrupt file.
        await persist(backup, state);
        await persist(path, next);
        state = next;
        return structuredClone(state);
      });
      queue = task.catch(() => {});
      return task;
    },
    async close() { await queue; await unlink(lock); }
  };
}

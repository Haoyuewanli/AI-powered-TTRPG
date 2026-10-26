import { readFile, writeFile, mkdir, rename, open, unlink, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { executeAction, validateState, RuleError } from './rules.mjs';

const replaceDelays = [20, 40, 80, 160, 200];
const windowsBusyCodes = new Set(['EPERM', 'EBUSY', 'EACCES']);

export async function atomicJson(path, value, { renameFile = rename, platform = process.platform, wait = delay, beforeReplace } = {}) {
  const temp = `${path}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temp, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8');
    await handle.sync(); await handle.close(); handle = undefined;
    // Windows scanners can briefly hold the destination. Retry only this replacement.
    for (let attempt = 0; ; attempt++) {
      try { await beforeReplace?.(); await renameFile(temp, path); break; }
      catch (error) {
        if (platform !== 'win32' || !windowsBusyCodes.has(error.code) || attempt >= replaceDelays.length) throw error;
        await wait(replaceDelays[attempt]);
      }
    }
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

export async function acquireLock(lock) {
  try {
    const handle = await open(lock, 'wx');
    await handle.writeFile(String(process.pid)); await handle.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lock, 'utf8'));
    let alive = true;
    try { process.kill(pid, 0); } catch (failure) { alive = failure.code !== 'ESRCH'; }
    if (alive || !Number.isInteger(pid) || pid <= 0) throw new Error('该战役已由另一个进程打开；请先关闭原战斗服务。');
    await unlink(lock); return acquireLock(lock);
  }
  return () => unlink(lock);
}

export async function openStore(directory, initial, { persist = atomicJson, migrate } = {}) {
  const dir = resolve(directory);
  await mkdir(dir, { recursive: true });
  const lock = join(dir, '.battle.lock');
  const release = await acquireLock(lock);
  const path = join(dir, '战斗状态.json'), backup = join(dir, '战斗状态.previous.json');
  let state, recoveryNote = '';
  try {
    try { state = await readValid(path); }
    catch (primaryError) {
      if (primaryError.code === 'UNSUPPORTED_FORMAT') throw primaryError;
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
    if (migrate) {
      const upgraded = migrate(structuredClone(state));
      validateState(upgraded);
      if (JSON.stringify(upgraded) !== JSON.stringify(state)) {
        await copyFile(path, join(dir, `格式迁移前-${randomUUID()}.json`));
        await atomicJson(path, upgraded); state = upgraded;
      }
    }
  } catch (error) { await release(); throw error; }
  const digest = text => createHash('sha256').update(text).digest('hex');
  const disk = async () => { const raw=await readFile(path,'utf8'); return {raw,fingerprint:digest(raw)}; };
  let savedFingerprint=(await disk()).fingerprint;
  const assertUnchanged=async(expected=savedFingerprint)=>{ if((await disk()).fingerprint!==expected) throw new RuleError('战斗JSON在外部已修改。请先打开“本地文件”，核对并刷新；本次未覆盖文件。',409); };
  let queue = Promise.resolve();
  const transact=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
  return {
    path,
    async fileStatus() {const current=await disk();return {fingerprint:current.fingerprint,changed:current.fingerprint!==savedFingerprint};},
    async previewFile() {
      const current=await disk();let candidate;
      try{candidate=JSON.parse(current.raw.replace(/^\uFEFF/,''));}catch{throw new RuleError('战斗状态.json不是有效JSON；原文件已保留，请修正格式后刷新。');}
      const checked=executeAction(state,{campaignId:state.campaignId,battleId:state.battleId,actionId:randomUUID(),expectedRevision:state.revision,type:'reload-file',payload:{state:candidate}},{role:'dm',id:'DM'});
      return {fingerprint:current.fingerprint,revision:state.revision,changed:current.fingerprint!==savedFingerprint,
        changes:['title','actors','board','combat','objects','diceMode','initiativeCollection'].filter(k=>JSON.stringify(state[k])!==JSON.stringify(checked[k])).map(key=>({field:key,before:state[key],after:checked[key]}))};
    },
    reloadFile({fingerprint,expectedRevision}) {return transact(async()=>{
      if(expectedRevision!==state.revision) throw new RuleError('局面已更新，请重新预览文件差异',409);
      const current=await disk();if(current.fingerprint!==fingerprint)throw new RuleError('文件在预览后又变了，请重新刷新预览',409);
      let candidate;try{candidate=JSON.parse(current.raw.replace(/^\uFEFF/,''));}catch{throw new RuleError('战斗文件JSON无效');}
      const next=executeAction(state,{campaignId:state.campaignId,battleId:state.battleId,actionId:randomUUID(),expectedRevision:state.revision,type:'reload-file',payload:{state:candidate}},{role:'dm',id:'DM'});
      await writeFile(join(dir,`外部编辑-${randomUUID()}.json`),current.raw,{encoding:'utf8',flag:'wx'});
      await persist(backup,state);await assertUnchanged(fingerprint);
      await persist(path,next,{beforeReplace:()=>assertUnchanged(fingerprint)});state=next;savedFingerprint=digest(JSON.stringify(next,null,2)+'\n');return structuredClone(state);
    });},
    get state() { return structuredClone(state); },
    recoveryNote,
    dispatch(command, principal, options) {
      const task = queue.then(async () => {
        await assertUnchanged();
        const next = executeAction(state, command, principal, options);
        // The backup is the last verified in-memory state, never an unread corrupt file.
        await persist(backup, state);
        await assertUnchanged();
        await persist(path, next, {beforeReplace:()=>assertUnchanged()});
        state = next; savedFingerprint=digest(JSON.stringify(next,null,2)+'\n');
        return structuredClone(state);
      });
      queue = task.catch(() => {});
      return task;
    },
    async close() { await queue; await release(); }
  };
}

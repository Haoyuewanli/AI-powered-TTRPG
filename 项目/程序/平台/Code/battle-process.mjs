import { readFile } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { openProjectFiles } from './project-files.mjs';
import { createBattleProjection } from './battle-projection.mjs';
import { createLibraryStore } from './library-store.mjs';
import { access, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

let app, timer, syncing = false, last = '', closing = false;
const root = resolve(process.argv[2]), embedOrigin = process.argv[3];
async function stop() {
  if (closing) return; closing = true; clearInterval(timer);
  while (syncing) await new Promise(accept => setTimeout(accept, 20));
  await app?.close(); process.exit(0);
}
try {
  const library = createLibraryStore({ root });
  const requested = process.env.RPG_LIBRARY_BATTLE ? JSON.parse(process.env.RPG_LIBRARY_BATTLE) : null;
  const target = requested ? await library.battleTarget({ role: 'dm' }) : null;
  if (requested && (target.moduleId !== requested.moduleId || target.runId !== requested.runId)) throw new Error('当前团已变化，请重新打开战斗');
  const storage = target?.workspaceDirectory || join(root, '模组');
  let seed, initial;
  if (target) {
    seed = target.campaignDirectory;
    if (!requested.create) { try { await access(join(storage, '工作区.json')); } catch { throw new Error('本团还没有战斗，请点击建立本团战斗。'); } }
    else { await mkdir(seed, { recursive: true }); await library.battleTarget({ role: 'dm' }); }
    const { newBattleState } = await import(new URL('../../战斗/Code/src/workspace.mjs', import.meta.url));
    initial = () => ({ ...newBattleState('campaign-' + createHash('sha256').update(target.moduleId + '/' + target.runId).digest('hex').slice(0, 24), 'battle-initial', target.name.slice(0, 64) + ' · 战斗'), actors: [] });
  } else {
    const registry = JSON.parse((await readFile(join(storage, '工作区.json'), 'utf8')).replace(/^\uFEFF/, ''));
    const campaign = registry.campaigns.find(entry => entry.id === registry.activeCampaignId);
    if (!campaign) throw new Error('战役索引没有有效的活动团');
    seed = resolve(storage, campaign.path);
  }
  const inside = relative(storage, seed);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('战役索引超出资源存档根目录');
  const { startApp } = await import(new URL('../../战斗/Code/server.mjs', import.meta.url));
  app = await startApp({ campaignDir: seed, workspaceDir: storage, port: 0, embedOrigin, initial,
    resourceProvider: { catalog: async query => { const data = await library.catalog({ role: 'dm' }, query); return { resources: data.resources.filter(item => /角色|人物|NPC|怪物/.test(item.kind)).slice(0, 200), total: data.total }; },
      read: id => library.read({ role: 'dm' }, id) } });
  const health = await (await fetch(app.url + '/health')).json();
  if (health.capabilities?.platformBridge !== 1 || health.embedOrigin !== embedOrigin) throw new Error('战斗版本缺少平台桥接能力');
  const files = target ? null : await openProjectFiles({ root }), projection = target ? null : createBattleProjection({ root, files });
  async function sync() {
    if (syncing || closing) return;
    const state = app.store.state, signature = state.campaignId + ':' + state.battleId + ':' + state.revision;
    if (signature === last) return;
    syncing = true;
    try { if (projection) await projection.sync({ state, selection: app.workspace.selection, sourcePath: relative(root, app.store.path).replaceAll('\\', '/') }); last = signature; process.send?.({ type: 'projection', status: { state: 'saved', revision: state.revision } }); }
    catch (error) { process.send?.({ type: 'projection', status: { state: 'error', error: error.message } }); }
    finally { syncing = false; }
  }
  process.on('message', async message => {
    if (message.type === 'close') return stop();
    if (message.type !== 'request') return;
    try {
      let value;
      if (message.operation === 'catalog') value = await app.workspace.catalog({ role: 'dm', id: 'DM' });
      else if (message.operation === 'logout') { app.revokeLocalSessions(); value = true; }
      else if (message.operation === 'select') { while (syncing && !closing) await new Promise(accept => setTimeout(accept, 20)); if (closing) throw new Error('战斗正在关闭'); await sync(); value = await app.workspace.select(message.payload, { role: 'dm', id: 'DM' }); await sync(); }
      else throw new Error('未知战斗适配请求');
      process.send?.({ type: 'reply', id: message.id, value });
    } catch (error) { process.send?.({ type: 'reply', id: message.id, error: error.message }); }
  });
  process.on('disconnect', stop); process.on('SIGINT', stop); process.on('SIGTERM', stop);
  process.send?.({ type: 'ready', url: app.url, coreVersion: health.coreVersion });
  timer = setInterval(sync, 2000); await sync();
} catch (error) {
  const message = error.code === 'ENOENT' ? '缺少战斗文件，请从当前团明确建立战斗，或恢复其已有文件。' : error.message.replaceAll(root, '项目');
  process.send?.({ type: 'startup-error', error: '无法启动战斗：' + message });
  await app?.close(); process.exit(1);
}

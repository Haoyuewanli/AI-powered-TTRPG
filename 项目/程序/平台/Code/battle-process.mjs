import { readFile } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { openProjectFiles } from './project-files.mjs';
import { createBattleProjection } from './battle-projection.mjs';

let app, timer, syncing = false, last = '', closing = false;
const root = resolve(process.argv[2]), embedOrigin = process.argv[3];
async function stop() {
  if (closing) return; closing = true; clearInterval(timer);
  while (syncing) await new Promise(accept => setTimeout(accept, 20));
  await app?.close(); process.exit(0);
}
try {
  const storage = join(root, '模组');
  const registry = JSON.parse((await readFile(join(storage, '工作区.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const campaign = registry.campaigns.find(entry => entry.id === registry.activeCampaignId);
  if (!campaign) throw new Error('战役索引没有有效的活动团');
  const seed = resolve(storage, campaign.path), inside = relative(storage, seed);
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('战役索引超出资源存档根目录');
  const { startApp } = await import(new URL('../../战斗/Code/server.mjs', import.meta.url));
  app = await startApp({ campaignDir: seed, workspaceDir: storage, port: 0, embedOrigin });
  const health = await (await fetch(app.url + '/health')).json();
  if (health.capabilities?.platformBridge !== 1 || health.embedOrigin !== embedOrigin) throw new Error('战斗版本缺少平台桥接能力');
  const files = await openProjectFiles({ root }), projection = createBattleProjection({ root, files });
  async function sync() {
    if (syncing || closing) return;
    const state = app.store.state, signature = state.campaignId + ':' + state.battleId + ':' + state.revision;
    if (signature === last) return;
    syncing = true;
    try { await projection.sync({ state, selection: app.workspace.selection, sourcePath: relative(root, app.store.path).replaceAll('\\', '/') }); last = signature; process.send?.({ type: 'projection', status: { state: 'saved', revision: state.revision } }); }
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
  process.send?.({ type: 'startup-error', error: '无法启动战斗：' + error.message });
  await app?.close(); process.exit(1);
}

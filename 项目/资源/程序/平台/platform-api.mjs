import { randomBytes } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { openProjectFiles } from './project-files.mjs';
import { createCoverApi } from './cover-api.mjs';
import { createModuleRuntime } from './module-runtime.mjs';

const problem = (status, message) => Object.assign(new Error(message), { status });
export async function readJsonBody(request) {
  if (!String(request.headers['content-type']).startsWith('application/json')) throw problem(415, '需要JSON请求');
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 1024 * 1024) throw problem(413, '请求过大'); chunks.push(chunk); }
  let value; try { value = JSON.parse(Buffer.concat(chunks)); } catch { throw problem(400, 'JSON无效'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw problem(400, '需要JSON对象');
  return value;
}

export async function createProjectApi({ root, battle }) {
  const files = await openProjectFiles({ root });
  const runtime = createModuleRuntime({ root });
  const sessions = new Map();
  const covers = createCoverApi({ modulesRoot: process.env.RPG_MODULES_ROOT || join(root, '模组/预处理/故事') });
  async function modules() {
    const result = [], issues = [], used = new Set(), duplicates = new Set();
    async function walk(path, depth = 0) {
      try { if ((await lstat(path)).isSymbolicLink()) throw problem(409, '模组根目录不能是链接'); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
      let entries; try { entries = await readdir(path, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
      for (const entry of entries) {
        const absolute = join(path, entry.name);
        if ((await lstat(absolute)).isSymbolicLink()) { issues.push('模组目录含链接，已跳过'); continue; }
        if (entry.isDirectory() && entry.name !== '预处理' && depth < 3) await walk(absolute, depth + 1);
        else if (entry.isFile() && ['模组调用.json', 'module.json'].includes(entry.name)) {
          let data; try { const bytes = await readFile(absolute); if (bytes.length > 1024 * 1024) throw new Error(); data = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { issues.push('模组清单无法解析，原文件保留'); continue; }
          if (data.kind === 'module-run' && data.id === 'campaign:' + data.campaignId) continue;
          if (used.has(data.id)) duplicates.add(data.id);
          if (typeof data.id !== 'string' || !data.id || data.id.startsWith('campaign:') || data.id.length > 160 || typeof data.name !== 'string' || !data.name || used.has(data.id)) { issues.push('模组ID/名称无效或重复'); continue; }
          used.add(data.id); result.push({ id: data.id, name: data.name, source: 'module' });
        }
      }
    }
    await walk(join(root, '模组'));
    const runs = await runtime.listRuns();
    for (const run of runs.modules) { if (!result.some(item => item.id === run.id)) result.push(run); }
    issues.push(...runs.issues.map(item => item.error));
    const catalog = await battle?.catalog();
    for (const campaign of catalog?.campaigns || []) if (!result.some(item => item.id === 'campaign:' + campaign.id)) result.push({ id: 'campaign:' + campaign.id, name: campaign.name, source: 'legacy-campaign', campaignId: campaign.id, battles: campaign.battles });
    return { modules: result.filter(item => !duplicates.has(item.id)), issues };
  }
  async function handle(request, url, send, sendImage) {
    const path = url.pathname;
    if (path === '/api/local-view' && request.method === 'POST') {
      const body = await readJsonBody(request);
      if (sessions.get(body.previous)?.role === 'dm') await battle?.logout();
      if (body.previous) sessions.delete(body.previous);
      if (body.role === null) return send(200, { token: null, role: null });
      if (!['dm', 'player'].includes(body.role)) throw problem(400, '视角无效');
      const token = randomBytes(32).toString('hex'); sessions.set(token, { role: body.role, selected: null, created: Date.now() });
      for (const [key, session] of sessions) if (Date.now() - session.created > 8 * 3600000) sessions.delete(key);
      return send(200, { token, role: body.role });
    }
    if (!path.startsWith('/api/project/') && !path.startsWith('/api/battle/') && !path.startsWith('/api/module-covers')) return false;
    const session = sessions.get(request.headers['x-platform-session']);
    if (session?.role !== 'dm' || Date.now() - session.created > 8 * 3600000) throw problem(403, '真实文件与战斗管理只对本机DM开放；Player入口当前为公共预览');
    if (path.startsWith('/api/module-covers')) return covers.handle(request, url, send, sendImage);
    const body = request.method === 'POST' ? await readJsonBody(request) : {};
    if (path === '/api/battle/start' && request.method === 'POST') return send(200, await battle.start());
    if (path === '/api/battle/stop' && request.method === 'POST') { await battle.close(); return send(200, { stopped: true }); }
    if (path === '/api/battle/status' && request.method === 'GET') return send(200, battle.status());
    if (path === '/api/project/status' && request.method === 'GET') return send(200, { ...await files.manifest(), selected: session.selected });
    if (path === '/api/project/dialogue-read' && request.method === 'GET') {
      if (!session.selected) throw problem(409, '请先在模组窗口选择所属模组');
      return send(200, await files.readDialogue({ groupId: session.selected.moduleId, groupName: session.selected.moduleName }));
    }
    if (path === '/api/project/modules' && request.method === 'GET') return send(200, await modules());
    if (path === '/api/project/templates' && request.method === 'GET') {
      const result = await runtime.templates();
      return send(200, { templates: result.templates.map(({ id, name, reviewStatus, value, category, batchId, packageSha256, relativePath }) => ({
        id, name, reviewStatus, category, batchId, packageSha256, relativePath, maps: value.maps.length, nodes: value.storyNodes.length,
        canTrain: value.encounterTemplates?.some(entry => typeof entry.id === 'string' && entry.id.endsWith('voyage-merrow')) || false
      })), issues: result.issues });
    }
    if (path === '/api/project/preprocess-sources' && request.method === 'GET') return send(200, { sources: await runtime.sources() });
    if (path === '/api/project/preprocess' && request.method === 'POST') return send(200, await runtime.preprocessSource(body.sourceId));
    if (path === '/api/project/create-run' && request.method === 'POST') {
      if (battle.status().running) throw problem(409, '请先在模组窗口安全关闭当前战斗连接，再建立新团');
      let monsterResource;
      if (body.monsterResourceId) monsterResource = JSON.parse((await files.readResource(body.monsterResourceId)).bytes.toString('utf8'));
      if (body.training !== undefined && typeof body.training !== 'boolean') throw problem(400, '训练标记须为布尔值');
      return send(200, await runtime.createRun({ templateId: body.templateId, name: body.name, monsterResource, training: body.training === true, expectedPackageSha256: body.expectedPackageSha256 }));
    }
    if (path === '/api/project/module-content' && request.method === 'GET') {
      if (!session.selected) throw problem(409, '请先选择所属模组');
      return send(200, await runtime.readRun(session.selected.moduleId));
    }
    if (path === '/api/project/module-state' && request.method === 'GET') {
      if (!session.selected) throw problem(409, '请先选择所属模组');
      return send(200, await files.readModuleState({ ...session.selected, kind: url.searchParams.get('kind') }));
    }
    if (path === '/api/project/map-image' && request.method === 'GET') {
      if (!session.selected) throw problem(409, '请先选择所属模组');
      const id = url.searchParams.get('mapId'), manifest = await runtime.readRun(session.selected.moduleId);
      if (!manifest.maps?.some(entry => entry.resourceId === id || entry.id === id)) throw problem(403, '地图不属于当前模组');
      const value = await files.readMapAsset(id), mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' })[extname(value.path).toLowerCase()];
      return send(200, { mime, base64: value.bytes.toString('base64') });
    }
    if (path === '/api/project/select-module' && request.method === 'POST') {
      const selected = (await modules()).modules.find(entry => entry.id === body.moduleId);
      if (!selected) throw problem(404, '模组不存在，请刷新清单');
      if (selected.campaignId) { await battle.start(); await battle.select(selected.campaignId, body.battleId || selected.battles?.[0]?.id); }
      session.selected = { moduleId: selected.id, moduleName: selected.name, source: selected.source };
      return send(200, { selected: session.selected });
    }
    if (path === '/api/project/resources' && request.method === 'GET') return send(200, await files.listResources({ rulesFamily: url.searchParams.get('rulesFamily') || 'dnd-2024', kind: url.searchParams.get('kind') || undefined, query: url.searchParams.get('q') || '', offset: Number(url.searchParams.get('offset') || 0), limit: Number(url.searchParams.get('limit') || 100) }));
    if (path === '/api/project/read' && request.method === 'GET') {
      const { resource, bytes } = await files.readResource(url.searchParams.get('resourceId'));
      if (resource.kind === '地图' && /\.json$/i.test(resource.path)) {
        const descriptor = JSON.parse(bytes.toString('utf8'));
        if (descriptor.assetPath) {
          const asset = await files.readMapAsset(resource.id), mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' })[extname(asset.path).toLowerCase()];
          return send(200, { resource, mime, base64: asset.bytes.toString('base64') });
        }
      }
      const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' })[extname(resource.path).toLowerCase()];
      return send(200, mime ? { resource, mime, base64: bytes.toString('base64') } : { resource, mime: 'text/plain', text: bytes.toString('utf8') });
    }
    if (path === '/api/project/reveal' && request.method === 'POST') {
      const target = await files.revealTarget(body.resourceId);
      if (process.platform === 'win32') await new Promise((accept, reject) => execFile('explorer.exe', [target.directory], { windowsHide: true }, error => error && error.code !== 1 ? reject(error) : accept()));
      return send(200, { opened: process.platform === 'win32', projectPath: target.projectPath });
    }
    const operations = { refresh: 'scanResources', import: 'writeResource', reference: 'reference', release: 'releaseAndReference', current: 'saveCurrent', battle: 'saveBattle', dialogue: 'appendDialogue', 'module-state': 'saveModuleState' };
    const operation = operations[path.slice('/api/project/'.length)];
    if (operation && request.method === 'POST') {
      if (['reference', 'release', 'current', 'battle', 'dialogue', 'module-state'].includes(path.slice('/api/project/'.length))) {
        if (!session.selected) throw problem(409, '请先在模组窗口选择所属模组');
        if (body.expectedModuleId !== undefined && body.expectedModuleId !== session.selected.moduleId) throw problem(409, '所属模组已切换，本次未写入；请重新核对引用或草稿');
        if (!(await modules()).modules.some(item => item.id === session.selected.moduleId)) throw problem(409, '所属模组已失效或ID冲突，请在模组窗口重新选择；本次未写入');
        Object.assign(body, session.selected);
        if (operation === 'appendDialogue') { body.groupId = session.selected.moduleId; body.groupName = session.selected.moduleName; }
      }
      return send(200, await files[operation](body));
    }
    return send(404, { error: '接口不存在' });
  }
  return { handle, files, close: async () => { await runtime.settled(); await files.settled(); } };
}

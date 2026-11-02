import { createMapWorkspace } from '/map-editor/map-workspace.mjs';
import { createVoyageWorkspace } from '/voyage-workspace.mjs';
import { createModuleWorkspace } from '/module-workspace.mjs';
import { createResourceWorkspace, renderResourcePreview } from '/resource-workspace.mjs';
import { bindChatComposer } from '/chat-composer.mjs';
import { createShareNotifications } from '/party/share-notifications.mjs';
import { createPartyPanel } from '/party/party-panel.mjs';

const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const button = (text, action) => { const node = el('button', text, 'project-button'); node.type = 'button'; node.addEventListener('click', action); return node; };
const CHANNEL = 'ttrpg-platform-battle-v1';
function resetCoverViews() {
  if (typeof BroadcastChannel !== 'function') return;
  const channel = new BroadcastChannel('ttrpg-platform-view-reset-v1');
  channel.postMessage({ type: 'reset' }); channel.close();
}

export function createProjectPanel({ platform, dialogue }) {
  window.addEventListener('pagehide', resetCoverViews);
  let token = sessionStorage.getItem('platform-session') || null, role = null, epoch = 0, sessionQueue = Promise.resolve(), selected = null, resources = [], referenceIds = [], connection = null, frame = null, serial = 0, replay = false, changingModule = false;
  const waits = new Map(), tabIds = new Map();
  let libraryReady = false, resourcePageLoad = Promise.resolve();
  let libraryToken = sessionStorage.getItem('library-token') || '';
  let chatDraft = '', moduleLoad = 0, roleReady = false, chatComposer = null, chatLoading = false;
  const root = platform.root;
  const notice = el('p', '真实资料只在本机DM显式打开后读取。', 'project-notice'); notice.setAttribute('role', 'status');
  const blocks = new Map();
  for (const page of ['modules', 'resources', 'dialogue', 'maps']) {
    const details = el('details', undefined, 'project-tools'); details.dataset.projectPanel = page;
    details.append(el('summary', ({ modules: '本地模组与战斗接入', resources: '本地资源文件', dialogue: '当前模组群聊文件', maps: '当前模组地图与故事' })[page]));
    const body = el('div', undefined, 'project-tools-body'); details.append(body); root.querySelector(`[data-platform-view="${page}"]`).append(details);
    details.addEventListener('toggle', () => { if (details.open && role === 'dm' && roleReady) run(() => page === 'modules' ? loadModules() : page === 'resources' ? loadResources() : page === 'maps' ? loadMaps() : openChat()); });
    blocks.set(page, { details, body });
  }
  const modulesView = root.querySelector('[data-platform-view="modules"]');
  const moduleExamples = button('查看界面示例', () => {
    const showing = modulesView.classList.toggle('show-module-examples');
    moduleExamples.textContent = showing ? '返回本地模组' : '查看界面示例';
  });
  moduleExamples.dataset.projectModuleExamples = ''; moduleExamples.hidden = true;
  const moduleHost = el('div'); moduleHost.dataset.realModuleHost = '';
  modulesView.prepend(moduleExamples, moduleHost, blocks.get('modules').details);
  const moduleView = createModuleWorkspace({
    host: moduleHost, run, onContinue: continueModule, onCreate: createModule, onRefresh: loadModules,

    onPreprocess: async source => { const value = await api('/api/project/preprocess', { sourceId: source.id }); notice.textContent = value.notes || '预处理结果已存在。'; await loadModules(); },

    loadCover: template => api('/api/library/cover?moduleId=' + encodeURIComponent(template.id))
  });
  const resourceView = createResourceWorkspace({
    root: root.querySelector('[data-platform-view=resources]'), api,
    getRulesFamily: () => platform.rulesFamily || 'dnd-2024', getSelected: () => selected, getRole: () => role,
    onResources: value => { resources = value; }, onStatus: text => { notice.textContent = text; },
    onOpenContent: openResourceContent,
    onReference: async resource => { await preview(resource); notice.textContent = '已在对话标签中打开资源；按角色开放使用条目下方菜单。'; },
    onRelease: async (resource, playerId) => { await mutate('release', { resourceId: resource.id, playerId }); if (!referenceIds.includes(resource.id)) referenceIds.push(resource.id); notice.textContent = '发放记录已保存；正式Player权限接入仍待后续验收。'; },
    onReveal: async resource => { const result = await api('/api/library/reveal', { resourceId: resource.id }); notice.textContent = result.opened ? '已打开资源所在文件夹。' : '项目相对路径：' + result.projectPath; }
  });
  root.querySelector('.p-appearance-status').append(notice);
  const frameArea = el('section', undefined, 'project-battle-host'); frameArea.hidden = true;
  const frameStatus = el('p', '', 'project-notice'); frameArea.append(frameStatus); root.querySelector('[data-platform-view="battle"]').append(frameArea);
  const frameContext = el('p', '', 'project-notice'); frameContext.hidden = true; frameContext.dataset.projectBattleContext = ''; frameArea.append(frameContext);
  const mapView = createMapWorkspace({ platform, api, run, getContext: () => selected || {} });
  const dialoguePage = root.querySelector('[data-platform-view=dialogue]');
  const partyBox = el('details', undefined, 'library-party-box'); partyBox.append(el('summary', '本团角色与玩家邀请'));
  const partyHost = el('div'); partyBox.append(partyHost); dialoguePage.append(partyBox); partyBox.hidden = true;
  const party = createPartyPanel({ host: partyHost, api, onStatus: text => { notice.textContent = text; }, onChange: async () => { const info = await api('/api/library/context'); selected = info.selected; context(); } });
  const notificationContent = el('article', undefined, 'library-notification-content');
  const notifications = createShareNotifications({ host: notificationContent, api,
    onStatus: text => { notice.textContent = text; },
    onOpenResource: async id => { const generation = epoch; platform.show('resources'); await resourcePageLoad; if (generation === epoch && libraryReady) await resourceView.openResource(id); },
    onPermissionsChanged: async state => {
      if (role !== 'player') return;
      dialogue.invalidateContent([...tabIds.values()], '这项资料的授权已变化，请从分享通知重新打开。');
      resourceView.clear();
      if (state.invalid) { libraryReady = false; context(); return; }
      if (libraryReady) await loadResources();
    }
  }); notifications.setVisible(false);
  function showLibraryDialogue() {
    if (!libraryReady) return;
    partyBox.hidden = role !== 'dm'; if (role === 'dm') party.setVisible(true);
    notifications.setVisible(true); dialogue.openContent('sharing-notices', '本团分享通知', notificationContent);
  }

  const voyage = createVoyageWorkspace({
    host: frameArea.parentElement, api, mutate, run, report: text => { notice.textContent = text; },
    enterBattle: async () => { if (!await canLeave()) return false; platform.show('battle'); frame?.focus(); return true; }
  });
  const trainingEntry = button('风骸岛之龙 · 甲板试玩', () => run(async () => {
    if (!await canLeave()) return;
    platform.show('modules'); await loadModules();
  }));
  trainingEntry.dataset.projectTrainingEntry = ''; trainingEntry.hidden = true;
  trainingEntry.className = 'p-primary p-button cursor-interaction';
  root.querySelector('.p-home-actions').prepend(trainingEntry);
  window.addEventListener('beforeunload', event => {
    if (voyage.hasDraft() || chatDraft.trim() || !mapView.canLeave()) { event.preventDefault(); event.returnValue = ''; }
  });
  async function loadMaps() {
    const body = blocks.get('maps').body; body.replaceChildren();
    if (!selected) { body.append(el('p', '请先在模组窗口选择所属团；原公共地图示例继续保留。')); return; }
    const load = button('打开当前模组地图与故事', () => run(async () => { await mapView.load(); blocks.get('maps').details.open = false; })); load.dataset.projectLoadMaps = '';
    body.append(load, el('p', '图像、地点和笔记来自当前团；另一个团有独立进度。'));
  }
  async function api(path, body) {
    const generation = epoch;
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { 'X-Platform-Session': token } : {}), ...(libraryToken && role === 'player' ? { 'X-Library-Token': libraryToken } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); if (generation !== epoch) throw new Error('视角已切换');
    if (!response.ok) throw Object.assign(new Error(result.error || '本地操作失败'), result, { status: response.status }); return result;
  }
  async function run(operation) { const generation = epoch; try { return await operation(); } catch (error) { if (generation === epoch) notice.textContent = error.message; } }
  async function mutate(route, body) { const expectedModuleId = selected?.moduleId; const status = await api('/api/project/status'); return api('/api/project/' + route, { expectedRevision: status.revision, ...body, ...(expectedModuleId ? { expectedModuleId } : {}) }); }
  function context() {
    for (const node of root.querySelectorAll('[data-module-context]')) node.textContent = selected ? `当前团：${selected.runName || selected.moduleName} · 模组：${selected.moduleName}` : '未选择模组';
    for (const block of blocks.values()) block.details.hidden = role !== 'dm';
    modulesView.classList.toggle('has-local-modules', role === 'dm');
    modulesView.classList.toggle('has-real-modules', role === 'dm');
    moduleView.setVisible(role === 'dm');
    resourceView.setActive(libraryReady && !!role);
    blocks.get('modules').details.hidden = true; blocks.get('resources').details.hidden = true; blocks.get('maps').details.hidden = true; blocks.get('dialogue').details.hidden = true;
    moduleExamples.hidden = role !== 'dm';
    const homeStatus = root.querySelector('#platform-current-session');
    homeStatus.textContent = selected ? '当前团：' + (selected.runName || selected.moduleName) : role === 'dm'
      ? '从本地模组清单选择资料或继续游玩团。' : libraryReady ? '已按玩家邀请加载获准资料。' : '玩家请使用DM生成的专属邀请进入。';
  }
  async function loadModules() {
    const request = ++moduleLoad; moduleHost.setAttribute('aria-busy', 'true');
    try {
      const data = await api('/api/library/context');
      if (request !== moduleLoad) return;
      selected = data.selected; context();
      moduleView.render({ templates: data.modules.map(item => ({ id: item.id, name: item.name, category: '模组', reviewStatus: 'candidate', canTrain: false })),
        categories: ['模组'], modules: data.modules.flatMap(item => item.runs.map(record => ({ ...record, templateId: item.id, moduleId: item.id, moduleName: item.name, runId: record.id }))), sources: [], issues: data.issues || [] });
    } finally { if (request === moduleLoad) moduleHost.setAttribute('aria-busy', 'false'); }
  }
  async function resetSelected(chosen) {
    epoch++; selected = chosen; referenceIds = []; chatDraft = ''; tabIds.clear();
    notifications.clear(); party.clear();
    chatComposer?.dispose(); chatComposer = null; dialogue.clear(); mapView.clear(); voyage.clear(); resourceView.clear(); context();
    for (const page of ['resources', 'dialogue', 'maps']) { const block = blocks.get(page); block.details.open = false; block.body.replaceChildren(); }
  }
  async function continueModule(item) {
    if (changingModule || !await canLeave()) return;
    changingModule = true;
    try {
      const value = await api('/api/library/select', { moduleId: item.moduleId || item.templateId, runId: item.runId || item.id });
      await resetSelected(value.selected); await loadModules();
      notice.textContent = '已继续此团；角色授权和地图编辑使用此团的独立记录。';
    } finally { changingModule = false; }
  }
  async function createModule(template, { name }) {
    if (changingModule || !await canLeave()) return;
    changingModule = true;
    try {
      const value = await api('/api/library/runs', { moduleId: template.id, name });
      await resetSelected(value.selected); await loadModules();
      notice.textContent = '新团已建立。请到对话页的本团角色与邀请中添加角色。';
    } finally { changingModule = false; }
  }
  function openResourceContent(resource, content) {
    const key = tabIds.get(resource.id) || 'real-' + crypto.randomUUID(); tabIds.set(resource.id, key);
    platform.show('dialogue'); dialogue.openContent(key, resource.name, content);
  }
  async function preview(resource) {
    const value = await api('/api/library/read?resourceId=' + encodeURIComponent(resource.id));
    if (!changingModule) openResourceContent(value.resource, renderResourcePreview(value, { onOpenResource: id => run(() => preview({ id })) }));
  }
  async function loadResources() { return resourceView.load(); }
  async function openChat() {
    if (chatComposer?.pending || chatLoading) return;
    chatLoading = true;
    try {
    chatComposer?.dispose(); chatComposer = null;
    const body = blocks.get('dialogue').body; body.replaceChildren();
    if (!selected) { body.append(el('p', '请先在模组窗口选择所属模组。公共示例群聊继续可用。')); return; }
    const content = el('article', undefined, 'project-chat'); content.append(el('h3', selected.moduleName + ' · 本地群聊'));
    const log = el('div', '正在读取本地对话…', 'project-chat-log'); log.dataset.projectChatLog = ''; log.setAttribute('role', 'log');
    const input = el('textarea'); input.rows = 3; input.placeholder = '保存一条当前模组消息'; input.dataset.projectChatInput = '';
    input.value = chatDraft; input.addEventListener('input', () => { chatDraft = input.value; });
    const refs = el('p', '已选引用：' + (referenceIds.length ? referenceIds.map(id => resources.find(resource => resource.id === id)?.name || id).join('、') : '无'));
    const send = el('button', '发送到本地群聊', 'project-button'); send.type = 'button'; send.dataset.projectChatSend = '';
    const help = el('small', 'Enter发送 · Ctrl+Enter换行');
    chatComposer = bindChatComposer({ input, send, isEnabled: () => role === 'dm' && !!selected,
      onDraftChange: value => { chatDraft = value; }, onError: error => { notice.textContent = error.message; },
      onSubmit: async ({ content }) => {
        await mutate('dialogue', { content, resourceIds: [...referenceIds] });
        referenceIds = []; refs.textContent = '已选引用：无';
        notice.textContent = '群聊消息及引用已保存。';
        try { await refresh(); } catch (error) { notice.textContent = '消息已保存，读取列表失败：' + error.message; }
      }
    });
    async function refresh() {
      const value = await api('/api/project/dialogue-read'); log.replaceChildren();
      const chunks = value.content.split(/^## (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\r?$/m);
      const references = value.metadata?.references || [];
      for (let index = 1; index < chunks.length; index += 2) {
        const message = el('article', undefined, 'project-message'), time = el('time', new Date(chunks[index]).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })); time.dateTime = chunks[index];
        const text = chunks[index + 1].replace(/^- \[([^\]]*)\]\(<(资源\/[^>]+)>\)\r?$/gm, (line, name, path) => references.some(ref => ref.path === path) ? '' : line).trim();
        message.append(time, el('p', text));
        for (const match of chunks[index + 1].matchAll(/^- \[([^\]]*)\]\(<(资源\/[^>]+)>\)\r?$/gm)) {
          const ref = references.find(entry => entry.path === match[2]);
          if (ref) message.append(button(match[1], () => run(() => preview({ id: ref.resourceId }))));
        }
        log.append(message);
      }
      if (!log.childElementCount) log.append(el('p', value.content && chunks.length === 1 ? value.content : '还没有正式群聊消息。'));
      log.scrollTop = log.scrollHeight;
    }
    content.append(log, refs, input, help, send); body.append(button('打开当前模组群聊标签', () => { platform.show('dialogue'); dialogue.openContent('real-chat', selected.moduleName + ' · 群聊', content); }));
    await refresh(); dialogue.openContent('real-chat', selected.moduleName + ' · 群聊', content); blocks.get('dialogue').details.open = false;
    } finally { chatLoading = false; }
  }
  function bridge(type, payload = {}) {
    if (!frame?.contentWindow || !connection?.url) return Promise.resolve({ allowed: true });
    const id = 'platform-' + ++serial;
    return new Promise((accept, reject) => { const timer = setTimeout(() => { waits.delete(id); reject(new Error('战斗尚未就绪，请等待后再切换；已保留当前窗口。')); }, 6000); waits.set(id, { accept, timer }); frame.contentWindow.postMessage({ channel: CHANNEL, id, type, ...payload }, connection.url); });
  }
  window.addEventListener('message', event => {
    if (event.source !== frame?.contentWindow || event.origin !== connection?.url || event.data?.channel !== CHANNEL) return;
    if (event.data.type === 'ready') { frame.dataset.ready = 'true'; run(() => bridge('setVisible', { visible: platform.page === 'battle' })); return; }
    const pending = waits.get(event.data.id); if (!pending || event.data.type !== 'reply') return;
    clearTimeout(pending.timer); waits.delete(event.data.id); pending.accept(event.data);
  });
  async function canLeave() {
    if (!voyage.canLeave()) { notice.textContent = '试玩记录有未保存草稿或正在保存，请先保存或明确放弃草稿。'; return false; }
    if (chatComposer?.pending) { notice.textContent = '群聊正在保存，请稍候再切换。'; return false; }
    if (chatDraft.trim()) { notice.textContent = '群聊仍有未发送草稿，请先保存或清空后再切换。'; return false; }
    if (mapView.canLeave && !mapView.canLeave()) { notice.textContent = '地图或故事记录仍有草稿，请先保存或明确重新读取后再切换所属团或身份。'; return false; }
    if (!frame) return true;
    const result = await bridge('canLeave');
    if (!result.allowed) notice.textContent = '战斗正在保存或有未提交编辑，请先保存或放弃后再离开。';
    return !!result.allowed;
  }
  async function removeFrame() { if (frame?.dataset.ready) await bridge('logout'); frame?.remove(); frame = null; frameContext.textContent = ''; frameContext.hidden = true; frameArea.hidden = true; frameArea.parentElement.classList.remove('has-live-battle'); }
  async function mountBattle() {
    if (frame) return;
    const url = new URL(connection.url); if (url.origin !== connection.url || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) throw new Error('战斗返回了无效的本机地址');
    frame = el('iframe'); frame.title = '独立战斗模块'; frame.dataset.projectBattleFrame = ''; frame.src = connection.url; frameArea.append(frame); frameArea.hidden = false; frameArea.parentElement.classList.add('has-live-battle');
    frameArea.dataset.coreVersion = connection.coreVersion || '';
    frameStatus.textContent = '战斗已连接；请在战斗区域选择身份。';
    const content = await api('/api/project/module-content');
    frameContext.textContent = (content.warnings || []).filter(text => /示意|候选/.test(text)).join(' '); frameContext.hidden = !frameContext.textContent;
    await voyage.load(content);
    if (content.training?.kind === 'voyage-training-v1') platform.show('battle');
  }
  root.addEventListener('click', event => {
    if (replay) return;
    const target = event.target.closest('button[data-platform-page],button[data-page],button[data-home-identity],button[data-change-role],button[data-role]');
    const identityChange = target?.hasAttribute('data-change-role') || target?.hasAttribute('data-role');
    if (!target || target.dataset.platformPage === 'battle' || (platform.page !== 'battle' && !identityChange)) return;
    if (!frame && !voyage.hasDraft() && !chatDraft.trim() && mapView.canLeave()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    run(async () => { if (!await canLeave()) return; await bridge('setVisible', { visible: false }); if (target.hasAttribute('data-change-role')) await bridge('logout'); replay = true; target.click(); replay = false; });
  }, true);
  async function setRole(value) {
    resetCoverViews();
    notifications.setVisible(false); notifications.clear(); party.clear(); partyBox.hidden = true;
    chatComposer?.dispose(); chatComposer = null; moduleView.clear(); resourceView.clear();
    mapView.clear();
    voyage.clear(); trainingEntry.hidden = true; roleReady = false; libraryReady = false;
    role = value; const generation = ++epoch; selected = null; referenceIds = []; chatDraft = ''; resources = []; tabIds.clear();
    sessionStorage.removeItem('platform-session');
    frame?.remove(); frame = null; frameContext.textContent = ''; frameContext.hidden = true; frameArea.hidden = true; frameArea.parentElement.classList.remove('has-live-battle');
    for (const block of blocks.values()) { block.details.open = false; block.body.replaceChildren(); } context();
    sessionQueue = sessionQueue.catch(() => {}).then(async () => {
      const response = await fetch('/api/local-view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: value, previous: token }) });
      const result = await response.json(); token = result.token;
      if (generation !== epoch) return;
      roleReady = true;
      if (value === 'dm' && token) sessionStorage.setItem('platform-session', token); else sessionStorage.removeItem('platform-session');
      trainingEntry.hidden = true;
      if (value === 'dm') {
        const info = await api('/api/library/context'); selected = info.selected; libraryReady = true;
      } else if (value === 'player') {
        const invite = new URLSearchParams(location.hash.slice(1)).get('invite') || libraryToken;
        if (invite) {
          try { const info = await api('/api/library/join', { token: invite }); libraryToken = invite; sessionStorage.setItem('library-token', invite); selected = info.selected; libraryReady = true; }
          catch (error) { libraryToken = ''; sessionStorage.removeItem('library-token'); notice.textContent = error.message; }
        }
      }
      context();
      notice.textContent = value === 'dm' ? '模组资料与团内进度分开保存；从正常入口继续。' : libraryReady ? '已验证专属邀请，只加载获准资料和定向提示。' : '尚无有效玩家邀请，真实资料保持关闭。';
      if (value === 'player' && libraryReady) platform.show('dialogue');
      setPage(platform.page);
    });
    return sessionQueue;
  }
  function setPage(page) {
    if (frame?.dataset.ready) run(() => bridge('setVisible', { visible: page === 'battle' }));
    if (page === 'modules' && role === 'dm' && roleReady && token) {
      modulesView.classList.remove('show-module-examples'); moduleExamples.textContent = '查看界面示例';
      run(loadModules);
    }
    if (page === 'resources' && libraryReady && roleReady) resourcePageLoad = run(loadResources);
    if (page === 'dialogue' && libraryReady && roleReady) showLibraryDialogue(); else notifications.setVisible(false);
    if (page === 'maps' && role === 'dm' && libraryReady && roleReady) { mapView.setVisible(true); run(() => mapView.load()); } else mapView.setVisible(false);
  }
  setInterval(async () => {
    if (!frame || role !== 'dm' || platform.page !== 'battle') return;
    try { const status = await api('/api/battle/status'); frameStatus.textContent = status.projection?.state === 'error' ? '文件同步待处理：' + status.projection.error : status.projection?.state === 'saved' ? '当前资源与战斗进度已同步' : '正在同步资源与进度'; } catch { /* Navigation may revoke this view while a read is pending. */ }
  }, 3000);
  context();
  root.addEventListener('platform-rule-version', () => { if (role === 'dm' && platform.page === 'resources') run(loadResources); });
  run(() => setRole(null));
  return { setRole, setPage, canLeave };
}

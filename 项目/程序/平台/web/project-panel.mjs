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
  let chatDraft = '';
  const root = platform.root;
  const notice = el('p', '真实资料只在本机DM显式打开后读取。', 'project-notice'); notice.setAttribute('role', 'status');
  const blocks = new Map();
  for (const page of ['modules', 'resources', 'dialogue']) {
    const details = el('details', undefined, 'project-tools'); details.dataset.projectPanel = page;
    details.append(el('summary', ({ modules: '本地模组与战斗接入', resources: '本地资源文件', dialogue: '当前模组群聊文件' })[page]));
    const body = el('div', undefined, 'project-tools-body'); details.append(body); root.querySelector(`[data-platform-view="${page}"]`).append(details);
    details.addEventListener('toggle', () => { if (details.open && role === 'dm') run(() => page === 'modules' ? loadModules() : page === 'resources' ? loadResources() : openChat()); });
    blocks.set(page, { details, body });
  }
  root.querySelector('.p-appearance-status').append(notice);
  const frameArea = el('section', undefined, 'project-battle-host'); frameArea.hidden = true;
  const frameStatus = el('p', '', 'project-notice'); frameArea.append(frameStatus); root.querySelector('[data-platform-view="battle"]').append(frameArea);
  async function api(path, body) {
    const generation = epoch;
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { 'X-Platform-Session': token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); if (generation !== epoch) throw new Error('视角已切换');
    if (!response.ok) throw new Error(result.error || '本地操作失败'); return result;
  }
  async function run(operation) { const generation = epoch; try { return await operation(); } catch (error) { if (generation === epoch) notice.textContent = error.message; } }
  async function mutate(route, body) { const expectedModuleId = selected?.moduleId; const status = await api('/api/project/status'); return api('/api/project/' + route, { expectedRevision: status.revision, ...body, ...(expectedModuleId ? { expectedModuleId } : {}) }); }
  function context() {
    for (const node of root.querySelectorAll('[data-module-context]')) node.textContent = selected ? `当前模组：${selected.moduleName}` : '未选择模组';
    for (const block of blocks.values()) block.details.hidden = role !== 'dm';
  }
  async function loadModules() {
    const body = blocks.get('modules').body; body.replaceChildren();
    const start = button('载入已有战斗团', () => run(async () => { connection = await api('/api/battle/start', {}); await loadModules(); notice.textContent = '已载入独立战斗模块，请在此确认所属团。'; })); start.dataset.projectStartBattle = '';
    const refresh = button('刷新模组清单', () => run(loadModules)); refresh.dataset.projectRefreshModules = '';
    const covers = el('a', '管理真实模组封面', 'project-button'); covers.id = 'platform-manage-covers'; covers.href = '/module-covers'; covers.target = 'platform-module-covers';
    body.append(el('p', '设计封面环继续演示；这里选择真实模组或已迁入的兼容战斗团。'), start, refresh, covers);
    const data = await api('/api/project/modules');
    for (const item of data.modules) {
      const row = el('div', undefined, 'project-row'), label = el('span', item.name + (item.source === 'legacy-campaign' ? ' · 已有战斗团' : ''));
      const battle = el('select'); battle.setAttribute('aria-label', '该团战斗');
      for (const entry of item.battles || []) { const option = el('option', entry.name); option.value = entry.id; battle.append(option); }
      const choose = button('确认所属模组', () => run(async () => {
        if (changingModule) return;
        changingModule = true;
        try {
        if (!await canLeave()) return;
        await removeFrame();
        const value = await api('/api/project/select-module', { moduleId: item.id, ...(battle.value ? { battleId: battle.value } : {}) });
        epoch++;
        selected = value.selected; referenceIds = []; chatDraft = ''; tabIds.clear(); dialogue.clear(); context();
        for (const page of ['resources', 'dialogue']) { const block = blocks.get(page); block.details.open = false; block.body.replaceChildren(); }
        if (item.source === 'legacy-campaign') { connection = await api('/api/battle/status'); await mountBattle(); } else await removeFrame();
        notice.textContent = '当前所属模组已切换；地图、对话、战斗共用此选择。';
        } finally { changingModule = false; }
      })); choose.dataset.projectSelectModule = item.id;
      row.append(label); if (item.battles?.length) row.append(battle); row.append(choose); body.append(row);
    }
    if (!data.modules.length) body.append(el('p', '没有可用的模组调用JSON。请在模组分类下放置带id和name的模组调用.json。'));
    if (data.issues.length) body.append(el('p', data.issues.join('；')));
  }
  async function preview(resource) {
    const value = await api('/api/project/read?resourceId=' + encodeURIComponent(resource.id));
    if (changingModule) return;
    resource = value.resource;
    const content = el('article', undefined, 'project-preview'); content.append(el('h3', resource.name), el('p', resource.path));
    if (value.mime?.startsWith('image/')) { const image = el('img'); image.alt = resource.name; image.src = 'data:' + value.mime + ';base64,' + value.base64; content.append(image); }
    else content.append(el('pre', value.text || '此文件可通过“打开文件夹位置”查看。'));
    const key = tabIds.get(resource.id) || 'real-' + crypto.randomUUID(); tabIds.set(resource.id, key);
    platform.show('dialogue'); dialogue.openContent(key, resource.name, content);
  }
  async function loadResources() {
    const body = blocks.get('resources').body; body.replaceChildren();
    const refresh = button('刷新本地资源', () => run(async () => { await mutate('refresh', {}); await loadResources(); })); refresh.dataset.projectRefreshResources = '';
    body.append(el('p', '下方为真实本地资源；右键或“更多”可引用、发放或打开文件夹。'), refresh);
    const data = await api('/api/project/resources'); resources = data.resources;
    for (const resource of resources) {
      const row = el('article', undefined, 'project-resource-row'); row.dataset.projectResource = resource.id;
      const open = button(`${resource.kind} · ${resource.name}`, () => run(() => preview(resource))); row.append(open, el('small', resource.path));
      const menu = el('div', undefined, 'project-resource-menu'); menu.hidden = true;
      const moduleHint = el('p', selected ? '引用到：' + selected.moduleName : '请先在模组窗口确认所属模组');
      const player = el('input'); player.placeholder = '玩家ID'; player.setAttribute('aria-label', '开放给玩家ID');
      const reference = button('引用', () => run(async () => { await mutate('reference', { resourceId: resource.id }); if (!referenceIds.includes(resource.id)) referenceIds.push(resource.id); notice.textContent = '已引用到当前模组，群聊发送时会保存项目相对路径。'; })); reference.dataset.projectReference = '';
      const release = button('开放给某玩家并引用', () => run(async () => { await mutate('release', { resourceId: resource.id, playerId: player.value.trim() }); if (!referenceIds.includes(resource.id)) referenceIds.push(resource.id); notice.textContent = '发放记录与当前引用已保存。真实Player身份接入后按此记录读取。'; })); release.dataset.projectRelease = '';
      const reveal = button('打开文件夹位置', () => run(async () => { await api('/api/project/reveal', { resourceId: resource.id }); notice.textContent = '已请求打开资源文件夹。'; })); reveal.dataset.projectReveal = '';
      menu.append(moduleHint, reference, player, release, reveal); row.append(button('更多', () => { menu.hidden = !menu.hidden; }), menu);
      row.addEventListener('contextmenu', event => { event.preventDefault(); menu.hidden = false; }); body.append(row);
    }
    if (!resources.length) body.append(el('p', '资源目录为空；原有设计卡片与示例仍保留。'));
    if (data.issues?.length) body.append(el('pre', JSON.stringify(data.issues, null, 2)));
  }
  async function openChat() {
    const body = blocks.get('dialogue').body; body.replaceChildren();
    if (!selected) { body.append(el('p', '请先在模组窗口选择所属模组。公共示例群聊继续可用。')); return; }
    const content = el('article', undefined, 'project-chat'); content.append(el('h3', selected.moduleName + ' · 本地群聊'));
    const log = el('div', '正在读取本地对话…', 'project-chat-log'); log.dataset.projectChatLog = ''; log.setAttribute('role', 'log');
    const input = el('textarea'); input.rows = 3; input.placeholder = '保存一条当前模组消息'; input.dataset.projectChatInput = '';
    input.value = chatDraft; input.addEventListener('input', () => { chatDraft = input.value; });
    const refs = el('p', '已选引用：' + (referenceIds.length ? referenceIds.map(id => resources.find(resource => resource.id === id)?.name || id).join('、') : '无'));
    const send = button('保存到本地群聊', () => run(async () => { if (!input.value.trim()) return; await mutate('dialogue', { content: input.value, resourceIds: [...referenceIds] }); input.value = ''; chatDraft = ''; referenceIds = []; refs.textContent = '已选引用：无'; await refresh(); notice.textContent = '群聊消息及引用已保存。'; })); send.dataset.projectChatSend = '';
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
    content.append(log, refs, input, send); body.append(button('打开当前模组群聊标签', () => { platform.show('dialogue'); dialogue.openContent('real-chat', selected.moduleName + ' · 群聊', content); }));
    await refresh(); dialogue.openContent('real-chat', selected.moduleName + ' · 群聊', content);
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
  async function canLeave() { if (!frame) return true; const result = await bridge('canLeave'); if (!result.allowed) notice.textContent = '战斗正在保存或有未提交编辑，请先保存或放弃后再离开。'; return !!result.allowed; }
  async function removeFrame() { if (frame?.dataset.ready) await bridge('logout'); frame?.remove(); frame = null; frameArea.hidden = true; frameArea.parentElement.classList.remove('has-live-battle'); }
  async function mountBattle() {
    if (frame) return;
    const url = new URL(connection.url); if (url.origin !== connection.url || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) throw new Error('战斗返回了无效的本机地址');
    frame = el('iframe'); frame.title = '独立战斗模块'; frame.dataset.projectBattleFrame = ''; frame.src = connection.url; frameArea.append(frame); frameArea.hidden = false; frameArea.parentElement.classList.add('has-live-battle');
    frameArea.dataset.coreVersion = connection.coreVersion || '';
    frameStatus.textContent = '战斗已连接；请在战斗区域选择身份。';
  }
  root.addEventListener('click', event => {
    if (replay || !frame) return;
    const target = event.target.closest('[data-platform-page],[data-page],[data-home-identity],[data-change-role]');
    if (!target || target.dataset.platformPage === 'battle' || (platform.page !== 'battle' && !target.hasAttribute('data-change-role'))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    run(async () => { if (!await canLeave()) return; await bridge('setVisible', { visible: false }); if (target.hasAttribute('data-change-role')) await bridge('logout'); replay = true; target.click(); replay = false; });
  }, true);
  async function setRole(value) {
    resetCoverViews();
    role = value; const generation = ++epoch; selected = null; referenceIds = []; chatDraft = ''; resources = []; tabIds.clear();
    sessionStorage.removeItem('platform-session');
    frame?.remove(); frame = null; frameArea.hidden = true; frameArea.parentElement.classList.remove('has-live-battle');
    for (const block of blocks.values()) { block.details.open = false; block.body.replaceChildren(); } context();
    sessionQueue = sessionQueue.catch(() => {}).then(async () => {
      const response = await fetch('/api/local-view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: value, previous: token }) });
      const result = await response.json(); token = result.token;
      if (generation !== epoch) return;
      if (value === 'dm' && token) sessionStorage.setItem('platform-session', token); else sessionStorage.removeItem('platform-session');
      notice.textContent = value === 'dm' ? '本机DM可在各窗口展开本地文件区；示例设计保持可用。' : 'Player当前为公共预览，真实文件不会加载。';
    });
    return sessionQueue;
  }
  function setPage(page) { if (frame?.dataset.ready) run(() => bridge('setVisible', { visible: page === 'battle' })); }
  setInterval(async () => {
    if (!frame || role !== 'dm' || platform.page !== 'battle') return;
    try { const status = await api('/api/battle/status'); frameStatus.textContent = status.projection?.state === 'error' ? '文件同步待处理：' + status.projection.error : status.projection?.state === 'saved' ? '当前资源与战斗进度已同步' : '正在同步资源与进度'; } catch { /* Navigation may revoke this view while a read is pending. */ }
  }, 3000);
  context();
  run(() => setRole(null));
  return { setRole, setPage, canLeave };
}

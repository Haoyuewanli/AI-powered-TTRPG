const CHANNEL = 'ttrpg-map-workbench-v1';
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
export function createMapWorkspace({ platform, api, run = operation => operation(), getContext = () => ({}) }) {
  const view = platform.root.querySelector('[data-platform-view=maps]');
  const workspace = el('section', undefined, 'formal-map-workspace'); workspace.dataset.formalMapWorkspace = '';
  const toolbar = el('div', undefined, 'formal-map-toolbar');
  const filter = el('details', undefined, 'formal-map-filter'), summary = el('summary', '模组筛选'), choices = el('div'); filter.append(summary, choices);
  const picker = el('select'); picker.setAttribute('aria-label', '当前地图画布');
  const label = el('label', '当前画布 '); label.append(picker);
  const refresh = el('button', '刷新地图资料'); refresh.type = 'button';
  const reread = el('button', '重新读取（放弃此画布草稿）'); reread.type = 'button';
  const status = el('p', '', 'formal-map-status'); status.setAttribute('role', 'status');
  const host = el('div', undefined, 'formal-map-host'); host.style.cssText = 'display:flex;flex:1;min-height:0;min-width:0';
  toolbar.append(filter, label, refresh, reread); workspace.append(toolbar, status, host); view.append(workspace); workspace.hidden = true;
  let generation = 0, packages = [], activeId = null, selectedModules = null, iframe = null, bridge = null, loading = false;
  const drafts = new Map();
  const contextFor = moduleId => { const context = getContext() || {}; return { moduleId, runId: context.moduleId === moduleId && context.runId ? context.runId : 'preparation' }; };
  const keyFor = context => JSON.stringify([context.moduleId, context.runId]);
  function notice(text) { status.textContent = text; }
  function perform(operation) { return run(async () => { try { return await operation(); } catch (error) { notice(error.message + '；已有草稿保留。'); throw error; } }); }
  function isLive(current, expectedBridge) { return current === generation && expectedBridge === bridge; }
  async function imageData(moduleId, entry) {
    const path = typeof entry === 'string' ? entry : entry.path;
    if (typeof path !== 'string') return null;
    const value = await api('/api/library/map-asset?' + new URLSearchParams({ moduleId, path }));
    if (!/^image\/(png|jpeg|webp|gif)$/.test(value.mime || '') || typeof value.base64 !== 'string') throw new Error('地图图片格式无效');
    return 'data:' + value.mime + ';base64,' + value.base64;
  }
  async function bootstrap(current, expectedBridge) {
    const selected = packages.find(item => item.moduleId === activeId); if (!selected) throw new Error('请先选择可用地图模组');
    const context = contextFor(activeId), key = keyFor(context);
    let state = drafts.get(key);
    if (!state) {
      const result = await api('/api/library/canvas?' + new URLSearchParams(context));
      state = { context, revision: result.revision, document: result.document || null, dirty: false }; if (isLive(current, expectedBridge)) drafts.set(key, state);
    }
    const moduleData = structuredClone(selected.moduleData || selected.package?.moduleData);
    if (!moduleData?.nodes?.length) throw new Error('此模组没有可用地图包');
    moduleData.capabilities = { ...moduleData.capabilities, sharing: false }; moduleData.players = [];
    const assets = selected.assets || selected.package?.assets || {}, resolved = new Map();
    async function resolve(url) {
      if (!url) return null;
      if (!resolved.has(url)) resolved.set(url, imageData(context.moduleId, assets[url] || url));
      return resolved.get(url);
    }
    await Promise.all(moduleData.nodes.map(async node => {
      if (node.imageUrl) node.imageUrl = await resolve(node.imageUrl);
      await Promise.all((node.variants || []).map(async variant => { variant.url = await resolve(variant.url); }));
    }));
    if (!isLive(current, expectedBridge)) throw new Error('地图视角已切换');
    notice((context.runId === 'preparation' ? '模组准备画布' : '当前团画布') + ' · ' + (selected.title || moduleData.title) + '；筛选与浏览不切换当前团。');
    return { moduleData, document: state.document, dirty: state.dirty, sources: selected.sources || selected.package?.sources || {}, contextLabel: context.runId === 'preparation' ? '模组准备画布' : '当前团独立画布' };
  }
  async function show(moduleId) {
    activeId = moduleId; picker.value = moduleId || ''; generation++; bridge = crypto.randomUUID(); host.replaceChildren(); iframe = null;
    if (!moduleId) { host.append(el('p', '请勾选至少一个模组，再选择要编辑的画布。', 'formal-map-empty')); return; }
    iframe = el('iframe', undefined, 'formal-map-frame'); iframe.title = '地图工作台'; iframe.dataset.mapEditor = ''; iframe.src = '/map-editor/index.html?bridge=' + encodeURIComponent(bridge); host.append(iframe);
  }
  function renderFilters() {
    choices.replaceChildren(); picker.replaceChildren();
    for (const item of packages) {
      const label = el('label'), check = el('input'); check.type = 'checkbox'; check.value = item.moduleId; check.checked = selectedModules.has(item.moduleId); label.append(check, document.createTextNode(item.title || item.moduleData?.title || item.moduleId)); choices.append(label);
      check.onchange = () => { check.checked ? selectedModules.add(item.moduleId) : selectedModules.delete(item.moduleId); renderFilters(); const allowed = packages.filter(item => selectedModules.has(item.moduleId)); if (!selectedModules.has(activeId)) perform(() => show(allowed[0]?.moduleId || null)); };
      if (selectedModules.has(item.moduleId)) { const option = el('option', item.title || item.moduleData?.title || item.moduleId); option.value = item.moduleId; picker.append(option); }
    }
    picker.value = activeId || ''; summary.textContent = `模组筛选 · ${selectedModules.size}项`;
  }
  async function load() {
    if (loading) return; loading = true; const current = ++generation;
    try {
      const result = await api('/api/library/maps'); if (current !== generation) return;
      packages = (result.packages || []).map(item => ({ ...item, moduleId: item.moduleId || item.moduleData?.id })).filter(item => item.moduleId && item.moduleData?.nodes?.length);
      selectedModules = new Set(selectedModules ? [...selectedModules].filter(id => packages.some(item => item.moduleId === id)) : packages.map(item => item.moduleId));
      const context = getContext() || {};
      activeId = selectedModules.has(activeId) ? activeId : selectedModules.has(context.moduleId) ? context.moduleId : packages.find(item => selectedModules.has(item.moduleId))?.moduleId || null;
      view.classList.add('has-map-editor'); workspace.hidden = false; renderFilters(); await show(activeId);
      if (!packages.length) notice('尚无已接入的地图包；原地图资料与团内记录保持。');
    } finally { loading = false; }
  }
  const receive = event => {
    if (event.origin !== location.origin || event.source !== iframe?.contentWindow || event.data?.channel !== CHANNEL || event.data.bridge !== bridge) return;
    const message = event.data, current = generation, expectedBridge = bridge, target = iframe.contentWindow;
    if (message.type === 'change') { const context = contextFor(activeId), state = drafts.get(keyFor(context)); if (state) { state.document = message.payload.document; state.dirty = message.payload.dirty; } return; }
    if (message.type === 'error') { notice(message.payload.message); return; }
    if (!message.id) return;
    const operation = message.type === 'bootstrap' ? () => bootstrap(current, expectedBridge) : message.type === 'save' ? async () => {
      const context = contextFor(activeId), state = drafts.get(keyFor(context)); if (!state) throw new Error('画布尚未就绪');
      if (state.pending) throw new Error('画布正在保存，请稍候');
      state.pending = true;
      const expectedMapPackageSha256 = packages.find(item => item.moduleId === context.moduleId)?.mapPackageSha256;
      try { const result = await api('/api/library/canvas', { ...context, expectedRevision: state.revision, expectedMapPackageSha256, document: message.payload.document }); state.revision = result.revision; return result; }
      finally { state.pending = false; }
    } : () => { throw new Error('未知地图请求'); };
    Promise.resolve().then(operation).then(value => { if (isLive(current, expectedBridge)) target.postMessage({ channel: CHANNEL, bridge: expectedBridge, id: message.id, value }, location.origin); }, error => { if (isLive(current, expectedBridge)) { notice(error.message + '；当前草稿保留。'); target.postMessage({ channel: CHANNEL, bridge: expectedBridge, id: message.id, error: error.message }, location.origin); } });
  };
  window.addEventListener('message', receive);
  picker.onchange = () => perform(() => show(picker.value)); refresh.onclick = () => perform(load);
  reread.onclick = () => perform(async () => { const key = keyFor(contextFor(activeId)); if (drafts.get(key)?.pending) throw new Error('画布正在保存，请稍候'); drafts.delete(key); await show(activeId); });
  return {
    dispose() { generation++; window.removeEventListener('message', receive); iframe?.remove(); iframe = null; drafts.clear(); workspace.remove(); },
    load, canLeave: () => ![...drafts.values()].some(state => state.dirty || state.pending),
    clear() { generation++; loading = false; packages = []; selectedModules = null; activeId = null; bridge = null; iframe?.remove(); iframe = null; drafts.clear(); host.replaceChildren(); workspace.hidden = true; view.classList.remove('has-map-editor'); },
    setVisible(value) { if (value && !iframe && !loading) return perform(load); }
  };
}

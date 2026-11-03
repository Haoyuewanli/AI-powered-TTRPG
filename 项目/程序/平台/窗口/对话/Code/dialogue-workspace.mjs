const node = (tag, className = '', text) => { const value = document.createElement(tag); value.className = className; if (text !== undefined) value.textContent = text; return value; };
const button = (text, action, className = '') => { const value = node('button', 'dialogue-button ' + className, text); value.type = 'button'; value.addEventListener('click', action); return value; };
const layouts = [['single', '单屏', 1], ['columns', '左右分屏', 2], ['rows', '上下分屏', 2], ['grid', '上下左右分屏', 4]];

export function createDialogueWorkspace(container) {
  const root = node('section', 'dialogue-workspace'); root.id = 'dialogue-workspace'; root.setAttribute('aria-label', '对话与资料分屏工作区');
  const sidebar = node('aside', 'dialogue-sources'); sidebar.hidden = true;
  const layoutSelect = node('select'); layoutSelect.setAttribute('aria-label', '窗口布局'); layoutSelect.id = 'dialogue-layout';
  for (const [value, label] of layouts) { const option = node('option', '', label); option.value = value; layoutSelect.append(option); }
  const partyHost = node('div', 'dialogue-party-host');
  sidebar.append(node('strong', '', '标签页与分屏'), layoutSelect, node('p', 'dialogue-source-note', '拖动标签到边缘可分屏，拖到角落可四分屏。'), partyHost);
  const panesHost = node('div', 'dialogue-panes');
  const status = node('p', 'dialogue-status'); status.setAttribute('role', 'status');
  const body = node('div', 'dialogue-body'); body.append(sidebar, panesHost); root.append(body, status); container.append(root);
  const tabs = new Map(); let panes = [], layout = 'single', selectedPane = 'pane-1', dragged = null, visible = true, serial = 0, config = {}, generation = 0;
  const paneFor = id => panes.find(pane => pane.tabs.includes(id));
  const paneById = id => panes.find(pane => pane.id === id);
  const announce = text => { status.textContent = text; };
  function cancelDrag() { dragged = null; root.querySelectorAll('.dialogue-split-preview').forEach(item => item.remove()); }
  function setLayout(value, draw = true) {
    const count = layouts.find(([id]) => id === value)?.[2]; if (!count) return;
    layout = value;
    if (panes.length > count) { for (const pane of panes.slice(count)) panes[0].tabs.push(...pane.tabs); panes = panes.slice(0, count); }
    while (panes.length < count) panes.push({ id: 'pane-' + (panes.length + 1), tabs: [], active: null });
    for (const pane of panes) if (!pane.tabs.includes(pane.active)) pane.active = pane.tabs[0] || null;
    if (!paneById(selectedPane)) selectedPane = panes[0].id;
    if (draw) render();
  }
  function closeTab(id) {
    const pane = paneFor(id); if (!pane) return;
    if (tabs.get(id)?.canClose?.() === false) { announce('此标签有未保存内容，请先保存或清空草稿。'); return; }
    const index = pane.tabs.indexOf(id); pane.tabs.splice(index, 1);
    if (pane.active === id) pane.active = pane.tabs[Math.min(index, pane.tabs.length - 1)] || null;
    tabs.get(id)?.dispose?.(); tabs.delete(id); render();
  }
  function openContent(id, title, content, options = {}) {
    if (!(content instanceof HTMLElement)) return;
    const old = tabs.get(id); if (old && old.content !== content) old.dispose?.();
    tabs.set(id, { title, content, ...options });
    let pane = paneFor(id) || paneById(selectedPane) || panes[0];
    if (!pane.tabs.includes(id)) pane.tabs.push(id);
    pane.active = id; selectedPane = pane.id; render(); return id;
  }
  function moveTab(id, targetId, at) {
    const source = paneFor(id), target = paneById(targetId); if (!source || !target) return;
    const old = source.tabs.indexOf(id); let index = at ?? target.tabs.length;
    if (source === target && index > old) index--;
    source.tabs.splice(old, 1); if (source.active === id) source.active = source.tabs[Math.min(old, source.tabs.length - 1)] || null;
    target.tabs.splice(Math.max(0, Math.min(index, target.tabs.length)), 0, id); target.active = id; selectedPane = target.id; render();
  }
  function newTab() {
    const id = 'new-' + ++serial, content = node('div', 'dialogue-launcher');
    const form = node('form', 'dialogue-search'), input = node('input'); input.type = 'search'; input.placeholder = '搜索你能访问的资源与地图'; input.setAttribute('aria-label', '搜索可访问资源');
    const submit = button('搜索', () => {}); submit.type = 'submit'; form.append(input, submit);
    const choices = node('div', 'dialogue-launcher-choices');
    for (const [kind, label] of [['chat', '群聊'], ['notifications', '共享通知'], ['resources', '资源'], ['maps', '地图']]) choices.append(button(label, () => { selectedPane = paneFor(id)?.id || selectedPane; config.open?.(kind); }, 'dialogue-launcher-choice'));
    const results = node('div', 'dialogue-search-results'); let searchSerial = 0;
    form.addEventListener('submit', async event => {
      event.preventDefault(); const request = ++searchSerial, current = generation; results.textContent = '正在搜索…';
      try {
        const rows = await config.search?.(input.value.trim()) || [];
        if (current !== generation || request !== searchSerial || !tabs.has(id)) return;
        results.replaceChildren(...rows.map(resource => button(resource.name + ' · ' + resource.kind, () => config.openResource?.(resource))));
        if (!rows.length) results.textContent = '没有可访问的匹配内容。';
      } catch (error) { if (current === generation && request === searchSerial && tabs.has(id)) results.textContent = error.message; }
    });
    content.append(node('h3', '', '开始一页新的冒险'), form, choices, results); openContent(id, '新标签页', content);
  }
  function zoneAt(event, section, header) {
    if (header.contains(event.target)) return null;
    const rect = section.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    if ((x < .25 || x > .75) && (y < .28 || y > .72)) return (y < .5 ? 'top-' : 'bottom-') + (x < .5 ? 'left' : 'right');
    if (x < .25) return 'left'; if (x > .75) return 'right'; if (y < .28) return 'top'; if (y > .72) return 'bottom'; return null;
  }
  function preview(section, zone) {
    root.querySelectorAll('.dialogue-split-preview').forEach(item => item.remove());
    if (!zone) return;
    const overlay = node('div', 'dialogue-split-preview', zone.includes('-') ? '松开以四分屏' : '松开以分屏'); overlay.dataset.splitZone = zone; section.append(overlay);
  }
  function splitDrop(id, pane, zone) {
    let index;
    if (zone.includes('-') || panes.length > 1) {
      setLayout('grid', false);
      const current = panes.indexOf(pane);
      index = zone.includes('-') ? (zone.startsWith('bottom') ? 2 : 0) + (zone.endsWith('right') ? 1 : 0) : zone === 'left' ? (current >= 2 ? 2 : 0) : zone === 'right' ? (current >= 2 ? 3 : 1) : zone === 'top' ? current % 2 : 2 + current % 2;
    } else { setLayout(zone === 'left' || zone === 'right' ? 'columns' : 'rows', false); index = zone === 'left' || zone === 'top' ? 0 : 1; }
    // Put the remaining contents opposite the new pane when splitting the only pane.
    if (panes[index] === pane && pane.tabs.length > 1) {
      const other = panes.find(item => item !== pane && !item.tabs.length) || panes[(index + 1) % panes.length];
      const remaining = pane.tabs.filter(value => value !== id); other.tabs.push(...remaining); other.active = remaining.includes(pane.active) ? pane.active : remaining[0]; pane.tabs = [id]; pane.active = id;
    }
    moveTab(id, panes[index].id); announce('分屏已完成。标签内容和筛选保持。');
  }
  function render() {
    cancelDrag(); root.dataset.dialogueLayout = layout; root.classList.toggle('has-sidebar', !sidebar.hidden); layoutSelect.value = layout;
    panesHost.replaceChildren(...panes.map((pane, index) => {
      const section = node('section', 'dialogue-pane'); section.dataset.dialoguePane = pane.id; section.dataset.dialogueActive = String(pane.id === selectedPane); section.style.gridArea = 'pane' + (index + 1);
      section.addEventListener('pointerdown', () => { selectedPane = pane.id; panesHost.querySelectorAll('.dialogue-pane').forEach(value => { value.dataset.dialogueActive = String(value === section); }); });
      const header = node('header', 'dialogue-pane-header');
      const menu = button('☰', () => { sidebar.hidden = !sidebar.hidden; root.classList.toggle('has-sidebar', !sidebar.hidden); }, 'dialogue-sidebar-toggle'); menu.setAttribute('aria-label', '标签页侧边栏');
      const tablist = node('div', 'dialogue-tabs'); tablist.setAttribute('role', 'tablist');
      for (const id of pane.tabs) {
        const data = tabs.get(id), item = node('div', 'dialogue-tab-item');
        const tab = button(data.title, () => { pane.active = id; selectedPane = pane.id; render(); }, 'dialogue-tab'); tab.dataset.dialogueTab = id; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(pane.active === id)); tab.draggable = true;
        tab.addEventListener('dragstart', event => { if (!visible) return event.preventDefault(); dragged = id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); });
        tab.addEventListener('dragend', cancelDrag);
        tab.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); pane.active = pane.tabs[(pane.tabs.indexOf(id) + (event.key === 'ArrowLeft' ? -1 : 1) + pane.tabs.length) % pane.tabs.length]; render(); root.querySelector('[data-dialogue-tab="' + CSS.escape(pane.active) + '"]')?.focus(); });
        const close = button('×', () => closeTab(id), 'dialogue-tab-close'); close.setAttribute('aria-label', '关闭' + data.title); item.append(tab, close); tablist.append(item);
      }
      const plus = button('+', () => { selectedPane = pane.id; newTab(); }, 'dialogue-new-tab'); plus.setAttribute('aria-label', '新建标签页'); tablist.append(plus); header.append(menu, tablist);
      const panel = node('div', 'dialogue-panel'); panel.setAttribute('role', 'tabpanel');
      if (pane.active) panel.append(tabs.get(pane.active).content); else panel.append(button('＋ 新建标签页', () => { selectedPane = pane.id; newTab(); }));
      section.append(header, panel);
      section.addEventListener('dragover', event => { if (!visible || !dragged) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; preview(section, zoneAt(event, section, header)); });
      section.addEventListener('dragleave', event => { if (!section.contains(event.relatedTarget)) section.querySelector('.dialogue-split-preview')?.remove(); });
      section.addEventListener('drop', event => {
        if (!visible || !dragged) return; event.preventDefault(); const id = dragged, zone = zoneAt(event, section, header);
        if (zone) splitDrop(id, pane, zone);
        else { const target = event.target.closest('[data-dialogue-tab]'); moveTab(id, pane.id, target ? pane.tabs.indexOf(target.dataset.dialogueTab) : undefined); }
      }); return section;
    }));
  }
  layoutSelect.addEventListener('change', () => setLayout(layoutSelect.value));
  function clear() { generation++; cancelDrag(); for (const tab of tabs.values()) tab.dispose?.(); tabs.clear(); panes = [{ id: 'pane-1', tabs: [], active: null }]; layout = 'single'; selectedPane = 'pane-1'; newTab(); announce('从加号新建标签；拖动标签到边缘或角落分屏。'); }
  clear();
  return { clear, openContent, newTab, canLeave: () => [...tabs.values()].every(tab => !tab.canClose || tab.canClose()),
    configure(value) { config = value; if (value.sidebar) partyHost.replaceChildren(value.sidebar); },
    invalidateContent(ids, message = '资料授权已变化，请重新打开。') { for (const id of ids) { const tab = tabs.get(id); if (tab) { tab.dispose?.(); tabs.set(id, { title: tab.title, content: node('p', '', message) }); } } render(); },
    setVisible(value) { visible = !!value; if (!visible) cancelDrag(); }
  };
}

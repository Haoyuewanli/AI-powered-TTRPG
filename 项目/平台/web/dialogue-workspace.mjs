const layouts = [
  ['single', '单屏', 1], ['columns', '左右分屏', 2], ['rows', '上下分屏', 2],
  ['grid', '四方格', 4], ['left-stack', '左二右一', 3], ['right-stack', '左一右二', 3]
];
const definitions = [
  { id: 'chat', kind: 'chat', title: '冒险群聊 · 示例', label: '群聊' },
  { id: 'resource-characters', kind: 'resource', title: '旅人资料 · 示例', label: '旅人资料' },
  { id: 'resource-creatures', kind: 'resource', title: '向导资料 · 示例', label: '向导资料' },
  { id: 'map-overland', kind: 'map', title: '地区地图 · 示例', label: '地区地图' },
  { id: 'map-building', kind: 'map', title: '建筑地图 · 示例', label: '建筑地图' }
];
const exampleMessages = () => [
  { speaker: 'DM · 示例', text: '队伍来到一座安静的石桥旁。桥边的向导停下脚步，指了指前方的路。' },
  { speaker: 'Player · 示例', text: '我想先看看周围，再问问向导两条路分别通往哪里。' },
  { speaker: '向导 · 示例', text: '沿河可以到达营地，穿过树林则会看到旧驿站。' },
  { speaker: 'DM · 示例', text: '可以从左侧打开资料和地图标签，放在聊天旁边对照查看。' },
  { speaker: 'Player · 示例', text: '我先把地区地图放在右边，群聊留在左边。' }
];
const node = (tag, className, value) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
};
const button = (label, className = '') => {
  const element = node('button', `dialogue-button ${className}`.trim(), label);
  element.type = 'button'; return element;
};
const describe = id => definitions.find(item => item.id === id);

export function createDialogueWorkspace(container) {
  const root = node('section', 'dialogue-workspace'); root.id = 'dialogue-workspace';
  root.setAttribute('aria-label', '对话与资料分屏工作区');
  const toolbar = node('header', 'dialogue-toolbar');
  const heading = node('div', 'dialogue-heading');
  heading.append(node('strong', '', '对话'), node('span', 'dialogue-demo-label', '本地示例'));
  const layoutLabel = node('label', 'dialogue-field', '窗口布局');
  const layoutSelect = node('select'); layoutSelect.id = 'dialogue-layout';
  for (const [value, label] of layouts) { const option = node('option', '', label); option.value = value; layoutSelect.append(option); }
  layoutLabel.append(layoutSelect);
  const regionLabel = node('label', 'dialogue-field dialogue-region-picker', '查看区域');
  const regionSelect = node('select'); regionSelect.id = 'dialogue-region'; regionLabel.append(regionSelect);
  toolbar.append(heading, layoutLabel, regionLabel);
  const body = node('div', 'dialogue-body');
  const sources = node('aside', 'dialogue-sources'); sources.setAttribute('aria-label', '打开示例标签');
  sources.append(node('strong', 'dialogue-source-title', '打开标签'));
  for (const definition of definitions) {
    const opener = button(definition.label, 'dialogue-source');
    opener.dataset.dialogueOpen = definition.kind; opener.dataset.dialogueSource = definition.id;
    opener.setAttribute('aria-label', `打开${definition.title}`);
    opener.addEventListener('click', () => openTab(definition.id));
    sources.append(opener);
  }
  sources.append(node('p', 'dialogue-source-note', '资源与地图均为示例。新标签在选中区域打开。'));
  const panesHost = node('div', 'dialogue-panes');
  const status = node('p', 'dialogue-status', '本页消息与布局仅保留在当前页面，未写入正式进度。');
  status.setAttribute('role', 'status');
  body.append(sources, panesHost); root.append(toolbar, body, status); container.append(root);

  let panes, layout, selectedPane, messages, draft, dragged = null, visible = true;
  const content = new Map();
  const paneForTab = id => panes.find(pane => pane.tabs.includes(id));
  const paneById = id => panes.find(pane => pane.id === id);
  const announce = value => { status.textContent = value; };
  function cancelDrag() {
    dragged = null;
    root.querySelectorAll('.dialogue-dragging,.dialogue-drop-target').forEach(element => element.classList.remove('dialogue-dragging', 'dialogue-drop-target'));
  }
  function selectPane(id) {
    if (!paneById(id)) return;
    selectedPane = id; regionSelect.value = id;
    for (const element of panesHost.children) element.dataset.dialogueActive = String(element.dataset.dialoguePane === id);
  }
  function focusTab(id) {
    if (visible) root.querySelector(`[role="tab"][data-dialogue-tab="${id}"]`)?.focus({ preventScroll: true });
  }
  function renderMessages() {
    const log = content.get('chat')?.querySelector('.dialogue-messages');
    if (!log) return;
    log.replaceChildren(...messages.map(message => {
      const row = node('article', `dialogue-message${message.self ? ' dialogue-message-self' : ''}`);
      row.append(node('strong', 'dialogue-speaker', message.speaker), node('p', '', message.text)); return row;
    }));
    log.scrollTop = log.scrollHeight;
  }
  function chatContent() {
    const area = node('div', 'dialogue-chat');
    const log = node('div', 'dialogue-messages'); log.setAttribute('role', 'log'); log.setAttribute('aria-label', '示例群聊消息'); log.setAttribute('aria-live', 'polite');
    const form = node('form', 'dialogue-chat-form'); form.id = 'dialogue-chat-form';
    const label = node('label', 'dialogue-composer-label', '本页消息'); label.htmlFor = 'dialogue-message';
    const input = node('textarea'); input.id = 'dialogue-message'; input.rows = 2; input.value = draft;
    input.placeholder = '输入一条本地演示消息…'; input.setAttribute('aria-describedby', 'dialogue-message-note');
    input.addEventListener('input', () => { draft = input.value; });
    const actions = node('div', 'dialogue-compose-actions');
    const note = node('span', '', '仅本页可见'); note.id = 'dialogue-message-note';
    const send = button('发送', 'dialogue-send'); send.type = 'submit'; actions.append(note, send);
    form.append(label, input, actions);
    form.addEventListener('submit', event => {
      event.preventDefault(); if (!visible || !input.value.trim()) return;
      messages.push({ speaker: '你 · 本页', text: input.value.trim(), self: true }); draft = ''; input.value = '';
      renderMessages(); input.focus({ preventScroll: true }); announce('消息已添加到本页演示，未发送到其他设备或保存为正式进度。');
    });
    area.append(log, form); return area;
  }
  function resourceContent(id) {
    const area = node('div', 'dialogue-resource');
    area.append(node('span', 'dialogue-demo-label', '示例资料 · 尚未连接资源库'));
    const isCharacter = id === 'resource-characters';
    area.append(node('h3', '', isCharacter ? '桥边的旅人' : '石桥向导'));
    area.append(node('p', 'dialogue-resource-intro', isCharacter ? '用于对照群聊与角色资料的虚构卡片。' : '用于对照群聊与NPC资料的虚构卡片。'));
    const rows = isCharacter ? [['身份', '旅人 · 示例角色'], ['描述', '披着浅色斗篷，随身携带一本空白笔记。'], ['关联', '可与地区地图并排查看。']] : [['身份', '向导 · 示例NPC'], ['描述', '熟悉河岸小路，正在向队伍介绍两条路线。'], ['关联', '可与建筑地图并排查看。']];
    const list = node('dl');
    for (const [key, value] of rows) list.append(node('dt', '', key), node('dd', '', value));
    area.append(list, node('p', 'dialogue-resource-footnote', '以上为界面演示资料，不授予能力、修改角色或影响战斗结算。'));
    return area;
  }
  function mapContent(id) {
    const area = node('figure', 'dialogue-map');
    const canvas = node('canvas'); canvas.width = 600; canvas.height = 400;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', id === 'map-overland' ? '自绘地区地图示例：石桥、河流、树林和营地' : '自绘建筑地图示例：旧驿站的大厅、庭院和侧室');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#edf0e9'; ctx.fillRect(0, 0, 600, 400);
    ctx.strokeStyle = '#b6c2b7'; ctx.lineWidth = 1;
    for (let x = 0; x <= 600; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 400); ctx.stroke(); }
    for (let y = 0; y <= 400; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(600, y); ctx.stroke(); }
    ctx.font = '18px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
    if (id === 'map-overland') {
      ctx.strokeStyle = '#a8c9d1'; ctx.lineWidth = 64; ctx.beginPath(); ctx.moveTo(280, -20); ctx.bezierCurveTo(160, 125, 390, 245, 305, 420); ctx.stroke();
      ctx.strokeStyle = '#c6b78f'; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(40, 315); ctx.lineTo(260, 205); ctx.lineTo(525, 90); ctx.stroke();
      ctx.fillStyle = '#a2acb2'; ctx.fillRect(236, 180, 93, 36); ctx.strokeStyle = '#65727a'; ctx.lineWidth = 3; ctx.strokeRect(236, 180, 93, 36);
      ctx.fillStyle = '#93aa91';
      for (const [x, y] of [[60, 60], [108, 88], [75, 125], [125, 40], [155, 130]]) { ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#d2b498'; ctx.beginPath(); ctx.moveTo(450, 285); ctx.lineTo(490, 225); ctx.lineTo(530, 285); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#384d51'; ctx.fillText('树林', 105, 180); ctx.fillText('石桥', 285, 164); ctx.fillText('营地', 492, 320);
    } else {
      ctx.fillStyle = '#e0d6bf'; ctx.fillRect(80, 55, 440, 290);
      ctx.strokeStyle = '#7f8b92'; ctx.lineWidth = 10; ctx.strokeRect(80, 55, 440, 290);
      ctx.beginPath(); ctx.moveTo(260, 55); ctx.lineTo(260, 345); ctx.moveTo(260, 185); ctx.lineTo(520, 185); ctx.stroke();
      ctx.fillStyle = '#e0d6bf'; ctx.fillRect(252, 235, 16, 52); ctx.fillRect(365, 177, 52, 16); ctx.fillRect(150, 337, 60, 16);
      ctx.fillStyle = '#aeb9a2'; ctx.fillRect(285, 215, 205, 104);
      ctx.fillStyle = '#46515b'; ctx.fillText('大厅', 169, 193); ctx.fillText('侧室', 388, 125); ctx.fillText('庭院', 388, 274);
    }
    area.append(canvas, node('figcaption', '', `${id === 'map-overland' ? '地区' : '建筑'}地图 · 自绘占位示例，未读取真实文件或关联战斗棋盘。`)); return area;
  }
  function getContent(id) {
    if (!content.has(id)) {
      content.set(id, id === 'chat' ? chatContent() : describe(id).kind === 'map' ? mapContent(id) : resourceContent(id));
      if (id === 'chat') renderMessages();
    }
    return content.get(id);
  }
  function moveTab(id, targetId, at) {
    const source = paneForTab(id), target = paneById(targetId);
    if (!source || !target) return;
    const oldIndex = source.tabs.indexOf(id);
    let index = at === undefined ? target.tabs.length : at;
    if (source === target && index > oldIndex) index--;
    source.tabs.splice(oldIndex, 1);
    if (source.active === id) source.active = source.tabs[Math.min(oldIndex, source.tabs.length - 1)] || null;
    target.tabs.splice(Math.max(0, Math.min(index, target.tabs.length)), 0, id); target.active = id;
    selectedPane = target.id; cancelDrag(); render(id);
    announce(`${describe(id).title}已移至区域 ${panes.indexOf(target) + 1}。`);
  }
  function closeTab(id) {
    const pane = paneForTab(id); if (!pane) return;
    const index = pane.tabs.indexOf(id); pane.tabs.splice(index, 1);
    if (pane.active === id) pane.active = pane.tabs[Math.min(index, pane.tabs.length - 1)] || null;
    render(pane.active);
    if (!pane.active && visible) sources.querySelector(`[data-dialogue-source="${id}"]`)?.focus({ preventScroll: true });
    announce('标签已关闭；本页聊天内容仍保留，可从左侧重新打开。');
  }
  function openTab(id) {
    let pane = paneForTab(id);
    if (!pane) { pane = paneById(selectedPane) || panes[0]; pane.tabs.push(id); }
    pane.active = id; selectedPane = pane.id; render(id);
    announce(`${describe(id).title}已在区域 ${panes.indexOf(pane) + 1}打开。`);
  }
  function render(focusId) {
    cancelDrag();
    root.dataset.dialogueLayout = layout;
    layoutSelect.value = layout;
    regionSelect.replaceChildren(...panes.map((pane, index) => { const option = node('option', '', `区域 ${index + 1}`); option.value = pane.id; return option; }));
    panesHost.replaceChildren(...panes.map((pane, index) => {
      const section = node('section', 'dialogue-pane'); section.dataset.dialoguePane = pane.id; section.style.gridArea = `pane${index + 1}`;
      section.setAttribute('aria-label', `区域 ${index + 1}`);
      section.addEventListener('pointerdown', () => selectPane(pane.id));
      const header = node('header', 'dialogue-pane-header'); header.append(node('span', 'dialogue-pane-number', `${index + 1}`));
      const tablist = node('div', 'dialogue-tabs'); tablist.setAttribute('role', 'tablist'); tablist.setAttribute('aria-label', `区域 ${index + 1}标签`);
      for (const id of pane.tabs) {
        const item = node('div', 'dialogue-tab-item');
        const tab = button(describe(id).title, 'dialogue-tab'); tab.dataset.dialogueTab = id;
        tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(pane.active === id)); tab.tabIndex = pane.active === id ? 0 : -1;
        tab.id = `dialogue-tab-${id}`; tab.setAttribute('aria-controls', `dialogue-panel-${pane.id}`); tab.draggable = true;
        tab.addEventListener('click', () => { pane.active = id; selectedPane = pane.id; render(id); });
        tab.addEventListener('keydown', event => {
          const key = event.key, offset = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
          if (!offset && key !== 'Home' && key !== 'End') return;
          event.preventDefault(); const position = key === 'Home' ? 0 : key === 'End' ? pane.tabs.length - 1 : (pane.tabs.indexOf(id) + offset + pane.tabs.length) % pane.tabs.length;
          pane.active = pane.tabs[position]; selectedPane = pane.id; render(pane.active);
        });
        tab.addEventListener('dragstart', event => {
          if (!visible) { event.preventDefault(); return; }
          dragged = id; tab.classList.add('dialogue-dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id);
        });
        tab.addEventListener('dragend', cancelDrag);
        const close = button('×', 'dialogue-tab-close'); close.setAttribute('aria-label', `关闭${describe(id).title}`); close.addEventListener('click', () => closeTab(id));
        item.append(tab, close); tablist.append(item);
      }
      if (!pane.tabs.length) tablist.append(node('span', 'dialogue-empty-tab', '从左侧打开标签'));
      header.append(tablist);
      const panel = node('div', 'dialogue-panel'); panel.id = `dialogue-panel-${pane.id}`;
      if (pane.active) { panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', `dialogue-tab-${pane.active}`); panel.append(getContent(pane.active)); }
      else panel.append(node('p', 'dialogue-empty', '选中此区域，再打开标签；也可把其他区域的标签拖到这里。'));
      const controls = node('div', 'dialogue-pane-controls');
      const previous = button('前移', 'dialogue-reorder'), next = button('后移', 'dialogue-reorder');
      previous.setAttribute('aria-label', `区域 ${index + 1}当前标签前移`); next.setAttribute('aria-label', `区域 ${index + 1}当前标签后移`);
      previous.disabled = !pane.active || pane.tabs.indexOf(pane.active) === 0; next.disabled = !pane.active || pane.tabs.indexOf(pane.active) === pane.tabs.length - 1;
      previous.addEventListener('click', () => moveTab(pane.active, pane.id, pane.tabs.indexOf(pane.active) - 1));
      next.addEventListener('click', () => moveTab(pane.active, pane.id, pane.tabs.indexOf(pane.active) + 2));
      const destination = node('select', 'dialogue-destination'); destination.setAttribute('aria-label', `区域 ${index + 1}当前标签的目标区域`);
      for (const [targetIndex, target] of panes.entries()) if (target.id !== pane.id) { const option = node('option', '', `区域 ${targetIndex + 1}`); option.value = target.id; destination.append(option); }
      destination.disabled = !pane.active || panes.length === 1;
      const move = button('移至', 'dialogue-move'); move.disabled = destination.disabled; move.setAttribute('aria-label', `移动区域 ${index + 1}当前标签至所选区域`);
      move.addEventListener('click', () => moveTab(pane.active, destination.value));
      controls.append(previous, next, destination, move); section.append(header, panel, controls);
      section.addEventListener('dragover', event => { if (!visible || !dragged) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; section.classList.add('dialogue-drop-target'); });
      section.addEventListener('dragleave', event => { if (!section.contains(event.relatedTarget)) section.classList.remove('dialogue-drop-target'); });
      section.addEventListener('drop', event => {
        if (!visible || !dragged) return; event.preventDefault();
        const tab = event.target.closest('[role="tab"][data-dialogue-tab]'); const at = tab ? pane.tabs.indexOf(tab.dataset.dialogueTab) : pane.tabs.length;
        moveTab(dragged, pane.id, at);
      });
      return section;
    }));
    selectPane(selectedPane);
    if (focusId) focusTab(focusId);
  }
  layoutSelect.addEventListener('change', () => {
    const count = layouts.find(([id]) => id === layoutSelect.value)?.[2]; if (!count) return;
    layout = layoutSelect.value;
    if (count < panes.length) {
      const merged = panes[0];
      for (const pane of panes.slice(count)) { merged.tabs.push(...pane.tabs); if (!merged.active) merged.active = pane.active; }
      panes = panes.slice(0, count);
    }
    while (panes.length < count) panes.push({ id: `pane-${panes.length + 1}`, tabs: [], active: null });
    if (!paneById(selectedPane)) selectedPane = panes[0].id;
    render(); announce('布局已切换，已有标签、消息和未发送文字均保留。');
  });
  regionSelect.addEventListener('change', () => selectPane(regionSelect.value));
  function clear() {
    cancelDrag(); content.clear(); messages = exampleMessages(); draft = ''; layout = 'single'; selectedPane = 'pane-1';
    panes = [{ id: 'pane-1', tabs: ['chat'], active: 'chat' }]; render();
    announce('本页消息与布局仅保留在当前页面，未写入正式进度。');
  }
  clear();
  return { clear, setVisible(value) { visible = !!value; if (!visible) cancelDrag(); } };
}

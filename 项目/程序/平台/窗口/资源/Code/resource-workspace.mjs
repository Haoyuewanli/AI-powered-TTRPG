const node = (tag, text, className) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
};
const button = (text, action, className = 'p-secondary p-button') => {
  const value = node('button', text, className); value.type = 'button'; value.addEventListener('click', action); return value;
};

export function categoryIcon(kind) {
  const paths = {
    all: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    book: 'M12 6v15 M12 6C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2Z',
    person: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
    monster: 'M9 18H7a2 2 0 0 1-2-2v-2a8 8 0 1 1 14 0v2a2 2 0 0 1-2 2h-2v3H9z M8 10h1 M15 10h1 M12 14v1',
    map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16',
    magic: 'm4 20 12-12 4 4L8 24 M14 3v4 M12 5h4 M4 3v4 M2 5h4 M19 19v4 M17 21h4',
    shield: 'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7Z M9 12l2 2 4-4',
    globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
    item: 'm12 3 9 5v9l-9 5-9-5V8Z M3 8l9 5 9-5 M12 13v9',
  };
  const key = !kind ? 'all' : kind === '模组' || /规则|背景|故事/.test(kind) ? 'book' : /怪物/.test(kind) ? 'monster' : /地图/.test(kind) ? 'map' : /人物|角色|NPC|种族/.test(kind) ? 'person' : /法术/.test(kind) ? 'magic' : /世界|位面/.test(kind) ? 'globe' : /职业|专长/.test(kind) ? 'shield' : 'item';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS(svg.namespaceURI, 'path');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('resource-category-icon'); path.setAttribute('d', paths[key]); svg.append(path); return svg;
}

function inline(target, text, images) {
  const pattern = /!\[([^\]]*)\]\(([^\n)]+)\)|\[([^\]]+)\]\(([^\n)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*/g;
  let previous = 0;
  for (const match of text.matchAll(pattern)) {
    target.append(document.createTextNode(text.slice(previous, match.index))); previous = match.index + match[0].length;
    if (match[2]) {
      const source = match[2].trim().replace(/\s+["'][^"']*["']$/, '').replace(/^<|>$/g, ''), found = images.find(image => image.source === source);
      if (found && /^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(found.mime)) {
        const image = node('img'); image.alt = match[1]; image.loading = 'lazy'; image.src = `data:${found.mime};base64,${found.base64}`; target.append(image);
      } else target.append(node('span', '〔图片未加载：' + (match[1] || source) + '〕', 'real-resource-image-note'));
    } else if (match[4]) {
      const label = node('span', match[3]); label.title = match[4]; label.className = 'real-resource-link'; target.append(label);
    } else target.append(node(match[5] ? 'strong' : match[6] ? 'code' : 'em', match[5] || match[6] || match[7]));
  }
  target.append(document.createTextNode(text.slice(previous)));
}

export function renderResourceMarkdown(text, images = []) {
  const content = node('div', undefined, 'real-resource-markdown');
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  let index = 0;
  const add = (tag, text) => { const element = node(tag); inline(element, text, images); content.append(element); return element; };
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^\s*```/.test(line)) {
      const code = []; index++;
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
      const pre = node('pre'); pre.append(node('code', code.join('\n'))); content.append(pre); index++; continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { add('h' + Math.min(6, heading[1].length + 1), heading[2]); index++; continue; }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { content.append(node('hr')); index++; continue; }
    if (line.includes('|') && /^\s*\|?\s*:?-+:?\s*\|/.test(lines[index + 1] || '')) {
      const table = node('table'), head = node('thead'), row = node('tr');
      const cells = value => value.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      for (const value of cells(line)) { const cell = node('th'); inline(cell, value, images); row.append(cell); }
      head.append(row); table.append(head); index += 2; const body = node('tbody');
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        const row = node('tr'); for (const value of cells(lines[index++])) { const cell = node('td'); inline(cell, value, images); row.append(cell); } body.append(row);
      }
      table.append(body); const scroll = node('div', undefined, 'real-resource-table'); scroll.append(table); content.append(scroll); continue;
    }
    const list = /^\s*(?:[-+*]|\d+[.)])\s+(.+)$/.exec(line);
    if (list) {
      const ordered = /^\s*\d/.test(line), listNode = node(ordered ? 'ol' : 'ul');
      while (index < lines.length) {
        const item = /^\s*(?:[-+*]|\d+[.)])\s+(.+)$/.exec(lines[index]);
        if (!item || /^\s*\d/.test(lines[index]) !== ordered) break;
        const li = node('li'); inline(li, item[1], images); listNode.append(li); index++;
      }
      content.append(listNode); continue;
    }
    if (/^>\s?/.test(line)) { add('blockquote', line.replace(/^>\s?/, '')); index++; continue; }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|\s*```|\s*[-+*]\s|\s*\d+[.)]\s|>\s)/.test(lines[index]) && !(lines[index].includes('|') && /^\s*\|?\s*:?-+:?\s*\|/.test(lines[index + 1] || ''))) paragraph.push(lines[index++]);
    add('p', paragraph.join('\n'));
  }
  return content;
}

export function renderResourcePreview(value, { onOpenResource } = {}) {
  const resource = value.resource || {}, content = node('article', undefined, 'real-resource-preview');
  content.dataset.realResourcePreview = resource.id || '';
  content.append(node('h3', resource.name || '本地资料'), node('p', resource.path || '', 'real-resource-path'));
  if (value.mime?.startsWith('image/')) {
    const image = node('img'); image.alt = resource.name || '本地图片'; image.src = `data:${value.mime};base64,${value.base64}`; content.append(image); return content;
  }
  let item;
  try { item = JSON.parse(String(value.text || '').replace(/^\uFEFF/, '')); } catch { /* Markdown and plain text share the safe reader. */ }
  const family = item?.edition?.rulesFamily || resource.rulesFamily;
  if (item?.source?.book || resource.sourceBook || family) content.append(node('p', [item?.source?.book || resource.sourceBook, family === 'dnd-2024' ? 'D&D 2024规则家族' : family === 'custom' ? '模组／自定义资料' : '规则版本待核对'].filter(Boolean).join(' · '), 'real-resource-source'));
  if (item?.statBlock) content.append(node('p', `AC ${item.statBlock.armorClass ?? '待核对'} · 默认HP ${item.statBlock.hitPoints ?? '待核对'}${item.statBlock.speedText ? ' · ' + item.statBlock.speedText : ''}`, 'real-resource-statblock'));
  const markdown = value.markdown ?? item?.content?.markdown ?? item?.content?.text ?? item?.description ?? item?.text ?? (!item ? value.text : '');
  if (markdown) content.append(renderResourceMarkdown(markdown, value.images || []));
  else if (item) {
    const facts = node('dl', undefined, 'real-resource-facts');
    for (const [key, detail] of Object.entries(item)) {
      if (['id', 'name', 'edition', 'source', 'projection', 'statBlock'].includes(key) || detail === null) continue;
      facts.append(node('dt', key), node('dd', typeof detail === 'object' ? JSON.stringify(detail, null, 2) : String(detail)));
    }
    content.append(facts);
  } else content.append(node('p', '此文件可通过“打开文件夹位置”查看。'));
  if (item?.availability?.status === 'module-reference-only') content.append(node('p', '模组剧情引用；不启用或换算旧版机械数值。', 'real-resource-note'));
  if (typeof item?.resolvedRuleResourceId === 'string' && onOpenResource) content.append(button('查看已核对的2024规则资料', () => onOpenResource(item.resolvedRuleResourceId)));
  if (value.imageIssues?.length) content.append(node('p', value.imageIssues.map(entry => '图片 ' + entry.source + '：' + (entry.reason || entry.error)).join('；'), 'real-resource-note'));
  content.append(node('p', resource.scope === 'player' ? '对应等级的档案快照；当前团的受伤、状态和消耗另行记录。' : '共享基础资料；团内受伤、状态和消耗不在此处显示。原书收录不代表已启用。', 'real-resource-note'));
  return content;
}

function multiSelect(label, values, onChange, { emptyLabel = '全部' } = {}) {
  const details = node('details', undefined, 'real-resource-multi'), summary = node('summary', label);
  const panel = node('div', undefined, 'real-resource-options'), choices = node('div', undefined, 'real-resource-choices');
  const clear = button('清除选择', () => { values.clear(); refresh(); onChange(); });
  panel.append(clear, choices); details.append(summary, panel);
  let options = [];
  function refresh() {
    summary.textContent = label + (values.size ? '（' + values.size + '）' : '（' + emptyLabel + '）');
    choices.replaceChildren();
    for (const option of options) {
      const row = node('label'), input = node('input'); input.type = 'checkbox'; input.value = option.id; input.checked = values.has(option.id);
      input.addEventListener('change', () => { if (input.checked) values.add(option.id); else values.delete(option.id); summary.textContent = label + (values.size ? '（' + values.size + '）' : '（' + emptyLabel + '）'); onChange(); });
      row.append(input, node('span', option.name)); choices.append(row);
    }
  }
  return { element: details, panel, summary, setOptions(next) { options = next; refresh(); }, refresh };
}

export function createResourceWorkspace({ root, api, onlyMaps = false, getRulesFamily = () => 'dnd-2024', getSelected = () => null, getRole = () => 'dm', onReveal = async () => {}, onOpenContent = () => {}, onResources = () => {}, onStatus = () => {} }) {
  const host = node('section', undefined, 'real-resource-workspace'); host.hidden = true; root.append(host);
  let active = false, kind = '', query = '', offset = 0, loadId = 0, previewId = 0, navigationId = 0, opening = 0, latest = [], drawerOpen = false, expandedId = null, context = null, cards = [], categoryIndex = 0;
  const initials = new Set(), moduleIds = new Set(), rowNodes = new Map(), knownWorldKinds = new Set();
  const pageSize = 100, isDM = () => getRole() !== 'player';
  const displayKind = resource => resource.scope === 'module' ? '模组' : resource.kind;
  const toolbar = node('form', undefined, 'real-resource-toolbar');
  const search = node('input'); search.type = 'search'; search.placeholder = '搜索资源名称、别名、标签或正文'; search.setAttribute('aria-label', '搜索本地资源'); search.dataset.realResourceSearch = '';
  const category = node('select'); category.setAttribute('aria-label', '本地资源类型');
  const searchButton = node('button', '搜索', 'p-primary p-button'); searchButton.type = 'submit';
  const refresh = button('刷新', () => run(load)); refresh.dataset.projectRefreshResources = '';
  const changedFilter = () => { offset = 0; run(load); };
  const letterSelect = multiSelect('A～Z', initials, changedFilter);
  letterSelect.element.dataset.resourceInitialFilter = '';
  letterSelect.setOptions(Array.from({ length: 26 }, (_, index) => ({ id: String.fromCharCode(65 + index), name: String.fromCharCode(65 + index) })));
  const moduleSelect = multiSelect('模组', moduleIds, changedFilter); moduleSelect.element.dataset.resourceModuleFilter = '';
  toolbar.append(search, category, letterSelect.element, moduleSelect.element, searchButton, refresh);
  const status = node('p', '搜索本地资源，或选择真实目录分类。', 'real-resource-status'); status.setAttribute('role', 'status');
  const body = node('div', undefined, 'real-resource-body');
  const browser = node('div', undefined, 'real-resource-browser');
  const layout = node('div', undefined, 'p-resource-layout real-resource-layout'); layout.dataset.realResourceLayout = ''; layout.dataset.phase = 'closed';
  const track = node('div', undefined, 'p-resource-track real-resource-track'); track.setAttribute('role', 'group'); track.setAttribute('aria-label', '真实资源分类');
  const drawer = node('section', undefined, 'p-drawer real-resource-drawer'); drawer.hidden = true; drawer.setAttribute('aria-label', '真实资源资料抽屉');
  const head = node('header', undefined, 'p-drawer-head'), title = node('strong', '全部资料');
  const close = button('收起分类', closeDrawer, 'p-close p-button'); head.append(title, close);
  const list = node('div', undefined, 'p-info-list real-resource-list'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', '真实资源信息卡');
  drawer.append(head, list); layout.append(track, drawer);
  const pager = node('div', undefined, 'real-resource-pager');
  const previous = button('上一页', () => { offset = Math.max(0, offset - pageSize); renderList(); });
  const next = button('下一页', () => { offset += pageSize; renderList(); }); pager.append(previous, next); pager.hidden = true;
  const reader = node('section', undefined, 'real-resource-reader'); reader.hidden = true; reader.setAttribute('aria-label', '资源正文阅读');
  const navigation = node('div', undefined, 'real-resource-navigation'), navigationLabel = node('span', '横向浏览目录分类');
  navigation.append(button('向左', () => step(-1)), navigationLabel, button('向右', () => step(1)));
  browser.append(layout, pager); body.append(browser, reader); host.append(toolbar, track, status, body); category.hidden = true; close.hidden = true;

  async function run(action) {
    try { await action(); } catch (error) {
      if (active) { status.textContent = error.message || '读取失败，请刷新重试。'; onStatus(status.textContent); }
    }
  }
  function step(direction) {
    if (!cards.length) return;
    categoryIndex = (categoryIndex + direction + cards.length) % cards.length;
    if (drawerOpen) { kind = cards[categoryIndex].dataset.realResourceKind; category.value = kind; offset = 0; run(load); }
    cards[categoryIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }
  function buildCards(available) {
    const unique = ['', ...new Set(available.filter(value => typeof value === 'string' && value))];
    const before = cards.map(card => card.dataset.realResourceKind).join('\0');
    if (before === unique.join('\0')) { category.value = kind; return; }
    track.replaceChildren(); category.replaceChildren(); cards = [];
    const all = node('option', '全部类型'); all.value = ''; category.append(all);
    for (const [index, value] of unique.entries()) {
      const option = node('option', value); option.value = value; category.append(option);
      const card = button('', () => { categoryIndex = index; kind = value; category.value = kind; offset = 0; run(() => openDrawer(true)); }, 'p-resource-card p-button cursor-interaction');
      card.dataset.realResourceKind = value; card.setAttribute('aria-expanded', String(drawerOpen && value === kind));
      const art = categoryIcon(value);
      card.append(art, node('span', value || '全部'));
 track.append(card); cards.push(card);
    }
    category.value = kind; categoryIndex = Math.max(0, unique.indexOf(kind));
    navigationLabel.textContent = unique.length + '类本地目录';
  }
  track.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || !cards.length) return;
    event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1); cards[categoryIndex].focus({ preventScroll: true });
  });
  let pointer;
  track.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button === 0) pointer = { x: event.clientX, scroll: track.scrollLeft, dragging: false };
  });
  track.addEventListener('pointermove', event => {
    if (!pointer) return;
    if (!(event.buttons & 1)) { pointer = null; return; }
    const distance = event.clientX - pointer.x;
    if (!pointer.dragging && Math.abs(distance) > 8) { pointer.dragging = true; track.setPointerCapture(event.pointerId); track.classList.add('is-dragging'); }
    if (pointer.dragging) { event.preventDefault(); track.scrollLeft = pointer.scroll - distance; }
  });
  const endPointer = event => {
    if (pointer?.dragging) { event.preventDefault(); track.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); }, { once: true, capture: true }); }
    pointer = null; track.classList.remove('is-dragging'); if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
  };
  track.addEventListener('pointerup', endPointer); track.addEventListener('pointercancel', endPointer);

  function collapse() {
    previewId++; expandedId = null; reader.hidden = true; reader.replaceChildren(); body.classList.remove('has-reader');
    for (const row of rowNodes.values()) {
      row.classList.remove('is-expanded'); row.querySelector('[data-resource-expand]').textContent = '展开';
      row.querySelector('[data-resource-expand]').setAttribute('aria-expanded', 'false');
    }
  }
  function closeDrawer() {
    navigationId++; opening++; drawerOpen = false; layout.classList.remove('is-open', 'is-moving'); layout.dataset.phase = 'closed'; drawer.hidden = true; drawer.classList.remove('is-visible');
    for (const card of cards) card.setAttribute('aria-expanded', 'false'); collapse();
  }
  async function openDrawer(reload = false) {
    if (!active) return;
    drawerOpen = true; drawer.hidden = false; drawer.classList.add('is-visible'); layout.dataset.phase = 'open';
    for (const card of cards) { card.setAttribute('aria-expanded', String(card.dataset.realResourceKind === kind)); card.setAttribute('aria-pressed', String(card.dataset.realResourceKind === kind)); }
    title.textContent = kind || '全部资料';
    if (reload) await load();
  }
  const selectedKey = selected => selected ? selected.moduleId + '/' + selected.runId : '';
  function shareControls(resource) {
    const wrapper = node('div', undefined, 'real-resource-share');
    const selected = context?.selected, eligible = !!selected?.runId && (resource.scope !== 'module' || resource.moduleId === selected.moduleId);
    const values = new Set();
    let revision = null, loaded = false, saving = false;
    const choice = multiSelect('开放给角色', values, () => { save.disabled = !eligible || !loaded || saving; }, { emptyLabel: '未开放' });
    choice.element.dataset.resourceCharacterSelect = resource.id;
    choice.summary.textContent = '开放给角色';
    const names = (context?.characters || []).map(character => ({ id: character.id, name: character.name }));
    choice.setOptions(names);
    const save = button('应用开放', () => run(async () => {
      if (!eligible || !loaded || saving) return;
      saving = true; save.disabled = true;
      const draft = [...values];
      try {
        const current = await api('/api/library/context');
        if (!active || selectedKey(current.selected) !== selectedKey(selected)) throw new Error('当前团已变化。角色选择已保留，请刷新资源后核对所属团。');
        const result = await api('/api/library/shares', { resourceId: resource.id, characterIds: draft, expectedRevision: revision, moduleId: selected.moduleId, runId: selected.runId });
        if (!active) return;
        revision = result.revision; status.textContent = draft.length ? '已更新当前团的角色开放范围。' : '已撤回当前团的角色开放。';
        onStatus(status.textContent);
      } catch (error) {
        loaded = false; throw new Error(error.message + '；勾选已保留，请重新打开角色菜单核对后再应用。');
      } finally { saving = false; save.disabled = !loaded; }
    })); save.dataset.resourceShareApply = resource.id; save.disabled = true;
    if (!eligible) {
      choice.summary.setAttribute('aria-disabled', 'true');
      choice.element.addEventListener('click', event => event.preventDefault());
      wrapper.title = !selected?.runId ? '请先在模组窗口继续一个团。' : '只能为当前模组当前团开放资料。';
      wrapper.append(node('small', wrapper.title));
    } else choice.element.addEventListener('toggle', () => {
      if (!choice.element.open || loaded || saving) return;
      run(async () => {
        choice.summary.textContent = '正在读取开放范围…';
        try {
          const result = await api('/api/library/shares?resourceId=' + encodeURIComponent(resource.id));
          if (!active || !wrapper.isConnected) return;
          revision = result.revision; values.clear(); for (const id of result.characterIds || []) values.add(id);
          loaded = true; choice.refresh(); save.disabled = false;
        } finally { if (!loaded) choice.summary.textContent = '重新读取开放范围'; }
      });
    });
    wrapper.append(choice.element, save);
    return wrapper;
  }
  function renderList() {
    list.replaceChildren(); rowNodes.clear();
    for (const resource of latest.slice(offset, offset + pageSize)) {
      const row = node('article', undefined, 'p-info-card real-resource-row'); row.dataset.projectResource = resource.id; rowNodes.set(resource.id, row);
      const text = node('div', undefined, 'p-info-text real-resource-name');
      text.append(node('strong', resource.name), node('small', [resource.kind, resource.ownerName ? '玩家：' + resource.ownerName : '', resource.moduleName || (resource.scope === 'player' ? '角色档案' : '世界通用资源'), resource.sourceBook].filter(Boolean).join(' · ')));
      const controls = node('div', undefined, 'real-resource-row-controls');
      const expand = button(resource.id === expandedId ? '收起' : '展开', () => run(() => open(resource)), 'p-secondary p-button real-resource-expand');
      expand.dataset.resourceExpand = resource.id; expand.setAttribute('aria-expanded', String(resource.id === expandedId)); expand.setAttribute('aria-label', (resource.id === expandedId ? '收起' : '展开') + resource.name);
      controls.append(expand);
      if (isDM()) {
        const reveal = button('打开文件夹位置', () => run(() => onReveal(resource))); reveal.dataset.projectReveal = '';
        controls.append(reveal);
        if (resource.shareable) controls.append(shareControls(resource));
        else controls.append(node('small', resource.scope === 'world' ? '默认开放' : resource.scope === 'player' ? '所属玩家与DM可见' : '仅DM可见'));
      }
      row.append(text, controls);
      if (expandedId === resource.id) row.classList.add('is-expanded');
      list.append(row);
    }
    if (!latest.length) list.append(node('p', '没有匹配资料。可更换分类、字母、模组或搜索词。'));
    previous.hidden = offset === 0; next.hidden = offset + pageSize >= latest.length; pager.hidden = previous.hidden && next.hidden;
  }
  async function load({ keepReader = false } = {}) {
    if (!active) return;
    if (!keepReader) navigationId++;
    const request = ++loadId; status.textContent = '正在读取本地资源…';
    const params = new URLSearchParams({ q: query, kind, media: onlyMaps ? 'maps' : '', initials: [...initials].join(','), modules: [...moduleIds].join(',') });
    const [data, current] = await Promise.all([api('/api/library/catalog?' + params), api('/api/library/context')]);
    if (!active || request !== loadId) return;
    if (selectedKey(context?.selected) !== selectedKey(current.selected)) collapse();
    context = current; latest = data.resources || []; onResources(latest);
    for (const resource of latest) if (resource.scope !== 'module' && resource.kind) knownWorldKinds.add(resource.kind);
    if (Array.isArray(data.kinds)) for (const value of knownWorldKinds) if (!data.kinds.includes(value)) knownWorldKinds.delete(value);
    const cardKinds = data.cardKinds || [...knownWorldKinds, ...((data.modules?.length || latest.some(resource => resource.scope === 'module')) ? ['模组'] : [])].sort();
    buildCards(cardKinds);
    moduleSelect.setOptions((data.modules || []).map(module => ({ id: module.id, name: module.name })));
    if (offset >= latest.length) offset = 0;
    if (!keepReader && expandedId && !latest.some(resource => resource.id === expandedId)) collapse();
    renderList();
    status.textContent = '共' + latest.length + '条' + (isDM() ? '本地资料；开放范围属于当前模组当前团。' : '已获准资料。');
    if (data.issues?.length) {
      const issues = node('details', undefined, 'real-resource-issues'); issues.append(node('summary', '部分文件需要核对（' + data.issues.length + '）'));
      for (const issue of data.issues) issues.append(node('p', typeof issue === 'string' ? issue : (issue.path || '') + '：' + (issue.error || issue.reason || '待核对'))); list.append(issues);
    }
    await openDrawer(false);
  }
  function markExpanded(resource) {
    expandedId = resource.id;
    for (const [id, row] of rowNodes) {
      const selected = id === expandedId, expand = row.querySelector('[data-resource-expand]');
      row.classList.toggle('is-expanded', selected); expand.textContent = selected ? '收起' : '展开'; expand.setAttribute('aria-expanded', String(selected)); expand.setAttribute('aria-label', (selected ? '收起' : '展开') + latest.find(value => value.id === id).name);
    }
    body.classList.add('has-reader'); reader.hidden = false;
  }
  async function showPreview(value) {
    if (!active) return;
    const resource = value.resource;
    markExpanded(resource);
    const content = renderResourcePreview(value, { onOpenResource: id => run(() => openResource(id)) });
    if (isDM()) {
      const controls = node('div', undefined, 'real-resource-reader-controls');
      controls.append(button('在对话标签中打开', () => onOpenContent(resource, renderResourcePreview(value, { onOpenResource: id => run(() => openResource(id)) }))));
      reader.replaceChildren(controls, content);
    } else reader.replaceChildren(content);
    reader.scrollTop = 0;
  }
  async function open(resource) {
    if (!active) return;
    const navigation = ++navigationId;
    if (expandedId === resource.id) { collapse(); return; }
    const request = ++previewId;
    markExpanded(resource); reader.setAttribute('aria-busy', 'true'); reader.replaceChildren(node('p', '正在读取…', 'resource-loading'));
    try {
      const value = await api('/api/library/read?resourceId=' + encodeURIComponent(resource.id));
      if (!active || request !== previewId || navigation !== navigationId) return;
      await showPreview(value);
    } catch (error) { if (active && request === previewId) reader.replaceChildren(node('p', error.message)); }
    finally { if (request === previewId) reader.removeAttribute('aria-busy'); }
  }
  async function openResource(id) {
    if (!active) return;
    const navigation = ++navigationId;
    const request = ++previewId;
    const value = await api('/api/library/read?resourceId=' + encodeURIComponent(id));
    if (!active || request !== previewId || navigation !== navigationId) return;
    kind = displayKind(value.resource); query = ''; search.value = ''; initials.clear(); moduleIds.clear(); letterSelect.refresh(); moduleSelect.refresh(); offset = 0;
    await load({ keepReader: true });
    if (!active || navigation !== navigationId) return;
    const index = latest.findIndex(resource => resource.id === id);
    if (index >= 0) { offset = Math.floor(index / pageSize) * pageSize; renderList(); }
    await openDrawer(false);
    if (!active || navigation !== navigationId) return;
    await showPreview(value);
    rowNodes.get(id)?.scrollIntoView({ block: 'nearest' });
  }
  toolbar.addEventListener('submit', event => { event.preventDefault(); query = search.value.trim(); kind = category.value; offset = 0; run(async () => { await openDrawer(false); await load(); }); });
  category.addEventListener('change', () => { kind = category.value; query = search.value.trim(); offset = 0; run(async () => { await openDrawer(false); await load(); }); });
  return {
    load, open, openResource,
    dispose() { active = false; loadId++; previewId++; navigationId++; opening++; host.remove(); },
    setActive(value) { active = !!value; host.hidden = !active; root.classList.toggle('has-real-resources', active); if (!active) { loadId++; previewId++; closeDrawer(); list.replaceChildren(); rowNodes.clear(); knownWorldKinds.clear(); latest = []; context = null; } },
    clear() { loadId++; previewId++; closeDrawer(); list.replaceChildren(); rowNodes.clear(); knownWorldKinds.clear(); latest = []; context = null; },
  };
}

const node = (tag, text, className) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
};
const button = (text, action, className = 'p-secondary p-button') => {
  const value = node('button', text, className); value.type = 'button'; value.addEventListener('click', action); return value;
};
const kinds = ['角色', 'NPC', '怪物', '地图', '故事', '规则', '物品'];
const englishKinds = ['CHARACTER', 'NPC', 'CREATURE', 'MAP', 'STORY', 'RULE', 'ITEM'];

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
  if (value.imageIssues?.length) content.append(node('p', value.imageIssues.map(entry => '图片 ' + entry.source + '：' + entry.error).join('；'), 'real-resource-note'));
  content.append(node('p', '共享基础资料；团内受伤、状态和消耗不在此处显示。原书收录不代表已启用。', 'real-resource-note'));
  return content;
}

export function createResourceWorkspace({ root, api, getRulesFamily = () => 'dnd-2024', getSelected = () => null, onReference = async () => {}, onRelease = async () => {}, onReveal = async () => {}, onOpenContent = () => {}, onResources = () => {}, onStatus = () => {} }) {
  const host = node('section', undefined, 'real-resource-workspace'); host.hidden = true; root.append(host);
  let active = false, kind = '', query = '', offset = 0, loadId = 0, previewId = 0, opening = 0, latest = [], drawerOpen = false;
  const toolbar = node('form', undefined, 'real-resource-toolbar');
  const search = node('input'); search.type = 'search'; search.placeholder = '搜索名称、中英文别名、标签或来源'; search.setAttribute('aria-label', '搜索本地资源'); search.dataset.realResourceSearch = '';
  const category = node('select'); category.setAttribute('aria-label', '本地资源类型');
  for (const value of ['', ...kinds]) { const option = node('option', value || '全部类型'); option.value = value; category.append(option); }
  const searchButton = node('button', '搜索', 'p-primary p-button'); searchButton.type = 'submit';
  const refresh = button('刷新', () => run(load)); refresh.dataset.projectRefreshResources = '';
  toolbar.append(search, category, searchButton, refresh);
  const status = node('p', '搜索全库，或选择分类展开真实资料。', 'real-resource-status'); status.setAttribute('role', 'status');
  const layout = node('div', undefined, 'p-resource-layout real-resource-layout'); layout.dataset.realResourceLayout = ''; layout.dataset.phase = 'closed';
  const track = node('div', undefined, 'p-resource-track real-resource-track'); track.setAttribute('role', 'group'); track.setAttribute('aria-label', '真实资源分类');
  const drawer = node('section', undefined, 'p-drawer real-resource-drawer'); drawer.hidden = true; drawer.setAttribute('aria-label', '真实资源资料抽屉');
  const head = node('header', undefined, 'p-drawer-head'), title = node('strong', '全部资料');
  const close = button('收起', closeDrawer, 'p-close p-button'); head.append(title, close);
  const list = node('div', undefined, 'p-info-list real-resource-list'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', '真实资源信息卡');
  drawer.append(head, list); layout.append(track, drawer);
  const pager = node('div', undefined, 'real-resource-pager');
  const previous = button('上一页', () => { offset = Math.max(0, offset - 100); run(load); });
  const next = button('下一页', () => { offset += 100; run(load); }); pager.append(previous, next); pager.hidden = true;
  const reader = node('section', undefined, 'real-resource-reader'); reader.hidden = true; reader.setAttribute('aria-label', '资源正文阅读');
  const navigation = node('div', undefined, 'real-resource-navigation');
  let categoryIndex = 0;
  const step = direction => {
    categoryIndex = (categoryIndex + direction + kinds.length) % kinds.length;
    if (drawerOpen) { kind = kinds[categoryIndex]; category.value = kind; offset = 0; run(() => openDrawer(true)); }
    cards[categoryIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  };
  navigation.append(button('向左', () => step(-1)), node('span', '横向浏览七类本地资源'), button('向右', () => step(1)));
  host.append(toolbar, status, layout, navigation, pager, reader);
  const cards = [];
  for (const [index, value] of kinds.entries()) {
    const card = button('', () => { categoryIndex = index; kind = value; category.value = kind; offset = 0; run(() => openDrawer(true)); }, 'p-resource-card p-button cursor-interaction');
    card.dataset.realResourceKind = value; card.setAttribute('aria-expanded', 'false');
    const art = node('span', undefined, 'p-cover-art ' + (index === 0 ? 'p-person' : index === 1 ? 'p-npc' : index === 2 ? 'p-monster' : 'real-resource-symbol'));
    art.setAttribute('aria-hidden', 'true');
    if (index < 2) art.append(node('span', undefined, 'p-drawn-head'), node('span', undefined, 'p-drawn-body'));
    else if (index === 2) art.append(node('span', undefined, 'p-drawn-beast'), node('span', undefined, 'p-drawn-eyes'));
    else art.append(node('span', ['◇', '▤', '§', '✧'][index - 3]));
    card.append(art, node('h3', value), node('small', englishKinds[index])); track.append(card); cards.push(card);
  }
  track.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
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
  async function run(action) { try { await action(); } catch (error) { if (active) { status.textContent = error.message || '读取失败，请刷新重试。'; onStatus(status.textContent); } } }
  function closeDrawer() {
    opening++; drawerOpen = false; layout.classList.remove('is-open', 'is-moving'); layout.dataset.phase = 'closed'; drawer.hidden = true; drawer.classList.remove('is-visible');
    for (const card of cards) card.setAttribute('aria-expanded', 'false');
    reader.hidden = true; previewId++;
  }
  async function openDrawer(reload = false) {
    const generation = ++opening, selected = cards.find(card => card.dataset.realResourceKind === kind);
    drawer.hidden = true; drawer.classList.remove('is-visible'); layout.dataset.phase = 'moving';
    let flight, animation;
    if (selected && !drawerOpen && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const origin = selected.getBoundingClientRect(), scene = layout.getBoundingClientRect();
      flight = selected.cloneNode(true); flight.removeAttribute('data-real-resource-kind'); flight.inert = true; flight.classList.add('p-resource-flight');
      Object.assign(flight.style, { left: origin.left - scene.left + 'px', top: origin.top - scene.top + 'px', width: origin.width + 'px', height: origin.height + 'px' }); layout.append(flight);
      layout.classList.add('is-moving', 'is-open');
      selected.scrollIntoView({ block: 'nearest', inline: 'start' });
      const destination = selected.getBoundingClientRect();
      animation = flight.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${destination.left - origin.left}px,${destination.top - origin.top}px) scale(${destination.width / origin.width},${destination.height / origin.height})` }], { duration: 380, easing: 'cubic-bezier(.15,.75,.2,1)', fill: 'forwards' });
      try { await animation.finished; } catch { /* Switching identity or page may cancel the transition. */ }
      flight.remove();
    }
    if (!active || generation !== opening) return;
    layout.classList.remove('is-moving'); layout.classList.add('is-open'); drawerOpen = true; drawer.hidden = false; layout.dataset.phase = 'open';
    requestAnimationFrame(() => { if (generation === opening) drawer.classList.add('is-visible'); });
    for (const card of cards) card.setAttribute('aria-expanded', String(card.dataset.realResourceKind === kind));
    title.textContent = kind || '全部资料';
    if (reload) await load();
  }
  function resourceMenu(resource) {
    const menu = node('div', undefined, 'real-resource-menu'); menu.hidden = true;
    menu.append(node('p', getSelected() ? '引用到：' + getSelected().moduleName : '请先在模组窗口继续一个团。'));
    const reference = button('引用', () => run(() => onReference(resource))); reference.dataset.projectReference = '';
    const player = node('input'); player.placeholder = '玩家ID'; player.setAttribute('aria-label', '开放给玩家ID');
    const release = button('开放给某玩家并引用', () => run(() => onRelease(resource, player.value.trim()))); release.dataset.projectRelease = '';
    const reveal = button('打开文件夹位置', () => run(() => onReveal(resource))); reveal.dataset.projectReveal = '';
    menu.append(reference, player, release, reveal, node('small', '本机发放记录；正式Player权限尚未接通。'));
    return menu;
  }
  async function load() {
    if (!active) return;
    const request = ++loadId; status.textContent = '正在读取本地资源…';
    const params = new URLSearchParams({ rulesFamily: getRulesFamily(), q: query, kind, offset, limit: 100 });
    const data = await api('/api/project/resources?' + params);
    if (!active || request !== loadId) return;
    latest = (data.resources || []).filter(resource => resource.sourceLabel !== '团内基准快照'); onResources(latest);
    const total = data.total ?? latest.length;
    status.textContent = `共${total}条共享基础资料${data.hiddenSnapshots ? `；${data.hiddenSnapshots}条团内快照保留在原处，不重复列入资源库` : ''}。原书收录不代表已启用。`;
    list.replaceChildren();
    for (const resource of latest) {
      const row = node('article', undefined, 'p-info-card real-resource-row'); row.dataset.projectResource = resource.id;
      const content = button('', () => run(() => open(resource)), 'real-resource-card-main p-button');
      const text = node('span', undefined, 'p-info-text'); text.append(node('strong', resource.name), node('small', [resource.kind, resource.sourceBook, resource.sourceLabel].filter(Boolean).join(' · ')), node('small', resource.path, 'real-resource-path'));
      content.append(text); const expand = button('展开', () => run(() => open(resource)), 'p-secondary p-button real-resource-expand'); expand.setAttribute('aria-label', '展开' + resource.name);
      const menu = resourceMenu(resource), more = button('更多', () => { menu.hidden = !menu.hidden; });
      row.append(content, expand, more, menu); row.addEventListener('contextmenu', event => { event.preventDefault(); menu.hidden = false; }); list.append(row);
    }
    if (!latest.length) list.append(node('p', '没有匹配的共享资料。可更换分类、搜索词或规则版本。'));
    if (data.issues?.length) {
      const issues = node('details', undefined, 'real-resource-issues'); issues.append(node('summary', '部分文件需要核对（' + data.issues.length + '）'));
      for (const issue of data.issues) issues.append(node('p', typeof issue === 'string' ? issue : `${issue.path || ''}：${issue.error || '待核对'}`)); list.append(issues);
    }
    previous.hidden = offset === 0; next.hidden = offset + 100 >= total; pager.hidden = previous.hidden && next.hidden;
    if (query || kind || drawerOpen) await openDrawer(false);
  }
  async function open(resource) {
    const request = ++previewId; reader.hidden = false; reader.replaceChildren(node('p', '正在打开资料…')); reader.scrollIntoView({ block: 'nearest' });
    const value = await api('/api/project/read?resourceId=' + encodeURIComponent(resource.id));
    if (!active || request !== previewId) return;
    const controls = node('div', undefined, 'real-resource-reader-controls');
    const openInDialogue = value => onOpenContent(value.resource, renderResourcePreview(value, { onOpenResource: id => run(async () => {
      const request = ++previewId, next = await api('/api/project/read?resourceId=' + encodeURIComponent(id));
      if (active && request === previewId) openInDialogue(next);
    }) }));
    controls.append(button('收起正文', () => { previewId++; reader.hidden = true; }), button('在对话标签中打开', () => openInDialogue(value)));
    reader.replaceChildren(controls, renderResourcePreview(value, { onOpenResource: id => run(() => open({ id })) })); reader.scrollIntoView({ block: 'nearest' });
  }
  toolbar.addEventListener('submit', event => { event.preventDefault(); query = search.value.trim(); kind = category.value; offset = 0; run(async () => { await openDrawer(false); await load(); }); });
  category.addEventListener('change', () => { kind = category.value; query = search.value.trim(); offset = 0; run(async () => { await openDrawer(false); await load(); }); });
  return {
    load, open,
    setActive(value) { active = !!value; host.hidden = !active; root.classList.toggle('has-real-resources', active); if (!active) { loadId++; previewId++; closeDrawer(); reader.replaceChildren(); list.replaceChildren(); latest = []; } },
    clear() { loadId++; previewId++; closeDrawer(); reader.replaceChildren(); list.replaceChildren(); latest = []; },
  };
}

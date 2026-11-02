const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const modulo = (value, length) => (value % length + length) % length;

export function groupModuleCatalog({ templates = [], modules = [], categories = [] } = {}) {
  const names = [...new Set([...categories.map(value => typeof value === 'string' ? value : value.name), ...templates.map(item => item.category || '未分类')].filter(Boolean))];
  return {
    groups: names.map(name => ({ name, templates: templates.filter(item => (item.category || '未分类') === name) })),
    runsFor: templateId => modules.filter(item => (item.templateId || item.templateIdentity?.moduleId) === templateId),
    unlinked: modules.filter(item => !templates.some(template => template.id === (item.templateId || item.templateIdentity?.moduleId)))
  };
}

export function createModuleWorkspace({ host, run = operation => operation(), onContinue, onCreate, onRefresh, onStartBattle, onPreprocess, onManageCovers, loadCover } = {}) {
  const root = element('section', undefined, 'module-workspace');
  root.setAttribute('aria-label', '本地模组浏览');
  root.dataset.realModuleWorkspace = '';
  host.append(root);
  const toolbar = element('div', undefined, 'module-toolbar');
  const note = element('p', '分类与封面来自本地目录；浏览资料不会切换当前团。', 'module-note');
  const segments = element('div', undefined, 'p-segments module-segments');
  segments.setAttribute('aria-label', '本地模组分类');
  const thumb = element('span', undefined, 'p-segment-thumb'); thumb.setAttribute('aria-hidden', 'true');
  const ring = element('div', undefined, 'p-ring module-ring');
  ring.dataset.realModuleRing = ''; ring.setAttribute('aria-label', '本地模组封面');
  const controls = element('div', undefined, 'p-ring-controls');
  const position = element('span', '', 'p-ring-position');
  const current = element('div', undefined, 'module-heading');
  const runsArea = element('section', undefined, 'module-runs');
  const extra = element('div', undefined, 'module-extra');
  const issuesArea = element('div', undefined, 'module-issues'); issuesArea.setAttribute('role', 'status');
  root.append(toolbar, note, segments, ring, controls, current, runsArea, extra, issuesArea);
  let catalog = { templates: [], modules: [] }, grouped = groupModuleCatalog(), category = '', selectedId = null, focusedRun = null;
  let angle = 0, targetAngle = 0, animation = 0, lastFrame = 0, generation = 0, visible = true, suppressClick = 0, pointer = null;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const templates = () => grouped.groups.find(group => group.name === category)?.templates || [];
  const selected = () => templates().find(item => item.id === selectedId) || null;
  function action(text, callback, className = 'p-secondary p-button cursor-interaction') {
    const node = element('button', text, className); node.type = 'button';
    node.addEventListener('click', () => run(async () => {
      if (node.disabled) return;
      node.disabled = true;
      try { await callback(); } finally { if (node.isConnected) node.disabled = false; }
    }));
    return node;
  }
  const refresh = action('刷新目录', () => onRefresh?.()); refresh.dataset.projectRefreshModules = '';
  toolbar.append(refresh);
  if (onManageCovers) toolbar.append(action('管理封面', () => onManageCovers()));
  const previous = action('向左', () => step(-1), 'p-step p-button cursor-interaction'); previous.setAttribute('aria-label', '上一个本地模组');
  const next = action('向右', () => step(1), 'p-step p-button cursor-interaction'); next.setAttribute('aria-label', '下一个本地模组');
  controls.append(previous, position, next);

  function draw() {
    if (!visible || !ring.clientWidth) return;
    const entries = templates(), width = ring.clientWidth, height = ring.clientHeight;
    const coverWidth = Math.max(84, Math.min(154, width * .24, (height * .86 - 27) / 1.333));
    const radius = entries.length === 1 ? 0 : Math.max(20, (width - coverWidth - 32) / 2);
    entries.forEach((item, index) => {
      const radians = angle + index * Math.PI * 2 / entries.length, z = Math.cos(radians), front = (z + 1) / 2, x = Math.sin(radians) * radius;
      const card = ring.children[index]; if (!card) return;
      card.style.width = coverWidth + 'px'; card.style.opacity = String(.43 + .57 * front);
      card.style.zIndex = String(Math.round(front * 100) + 1);
      card.style.transform = `translate(-50%,-50%) translate3d(${x}px,${z * Math.min(25, height * .1) - x * .07}px,0) rotateY(${-Math.sin(radians) * 25}deg) rotateZ(${-Math.sin(radians) * 4}deg) scale(${.65 + .35 * front})`;
      card.setAttribute('aria-pressed', String(item.id === selectedId));
    });
    ring.dataset.motion = Math.abs(targetAngle - angle) < .003 ? 'idle' : 'rotating';
  }
  function stop() { cancelAnimationFrame(animation); animation = 0; lastFrame = 0; }
  function animate() {
    if (reduced() || !visible) { stop(); angle = targetAngle; draw(); return; }
    if (animation) return;
    const tick = time => {
      animation = 0;
      if (!visible) { stop(); return; }
      const duration = lastFrame ? Math.min(40, time - lastFrame) : 16; lastFrame = time;
      angle += (targetAngle - angle) * (1 - Math.exp(-duration / 105));
      if (Math.abs(targetAngle - angle) < .003) angle = targetAngle;
      draw();
      if (angle !== targetAngle) animation = requestAnimationFrame(tick); else lastFrame = 0;
    };
    animation = requestAnimationFrame(tick);
  }
  function choose(index, focus = false) {
    const entries = templates(); if (!entries.length) return;
    index = modulo(index, entries.length);
    const oldIndex = Math.max(0, entries.findIndex(item => item.id === selectedId));
    let delta = modulo(index - oldIndex, entries.length); if (delta > entries.length / 2) delta -= entries.length;
    selectedId = entries[index].id; focusedRun = null; targetAngle -= delta * Math.PI * 2 / entries.length;
    renderSelection(); animate();
    if (focus) ring.children[index]?.focus({ preventScroll: true });
  }
  function step(delta) { choose(Math.max(0, templates().findIndex(item => item.id === selectedId)) + delta); }
  function alignThumb() {
    const node = [...segments.querySelectorAll('button')].find(item => item.getAttribute('aria-pressed') === 'true');
    if (node) { thumb.style.width = node.offsetWidth + 'px'; thumb.style.transform = `translateX(${node.offsetLeft}px)`; }
  }
  async function coverImage(template, image, version) {
    if (!loadCover || template.coverAvailable === false) return;
    try {
      const value = await loadCover(template);
      if (version !== generation || !image.isConnected || !value?.mime?.startsWith('image/') || !value.base64) return;
      image.src = 'data:' + value.mime + ';base64,' + value.base64;
      image.hidden = false;
      image.previousElementSibling.hidden = true;
    } catch { /* A missing cover keeps the named book cover available. */ }
  }
  function buildRing() {
    stop(); ring.replaceChildren();
    const entries = templates();
    if (!entries.some(item => item.id === selectedId)) selectedId = entries[0]?.id || null;
    const index = Math.max(0, entries.findIndex(item => item.id === selectedId)); angle = targetAngle = -index * Math.PI * 2 / Math.max(1, entries.length);
    for (const [index, template] of entries.entries()) {
      const card = element('button', undefined, 'p-cover cursor-interaction'); card.type = 'button'; card.dataset.realModuleTemplate = template.id;
      card.setAttribute('aria-label', template.name + '，查看已有团'); card.setAttribute('aria-pressed', String(template.id === selectedId));
      const imageBox = element('span', undefined, 'p-cover-image');
      const title = element('span', template.name, 'module-cover-fallback');
      const image = element('img'); image.alt = template.name + '封面'; image.draggable = false; image.hidden = true;
      image.addEventListener('error', () => { image.hidden = true; title.hidden = false; });
      imageBox.append(title, image);
      const caption = element('span', undefined, 'p-cover-caption'); caption.append(element('span', template.name));
      card.append(imageBox, caption); ring.append(card);
      card.addEventListener('click', () => { if (performance.now() >= suppressClick) choose(index); });
      coverImage(template, image, generation);
    }
    if (!entries.length) ring.append(element('p', '此分类还没有可用模组。', 'module-empty'));
    renderSelection(); requestAnimationFrame(() => { draw(); alignThumb(); });
  }
  function runOverview(item) {
    const overview = element('div', undefined, 'module-run-overview'); overview.dataset.realRunOverview = item.id;
    const status = { preparation: '准备中', preparing: '准备中', playing: '游玩中', active: '游玩中', ended: '已结束', finished: '已结束' }[item.status] || item.status || '状态未记录';
    overview.append(element('p', status + ' · ' + (item.progressSummary || '尚无进度摘要')));
    const time = item.lastPlayedAt ? new Date(item.lastPlayedAt) : null;
    overview.append(element('p', '最后游玩：' + (time && !Number.isNaN(time.getTime()) ? time.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未记录')));
    if (item.recentLocation) overview.append(element('p', '最近地点：' + item.recentLocation));
    if (item.characters?.length) overview.append(element('p', '角色：' + item.characters.map(value => typeof value === 'string' ? value : value.name || value.id).join('、')));
    const battle = element('select'); battle.setAttribute('aria-label', item.name + '的战斗');
    for (const entry of item.battles || []) { const option = element('option', entry.name); option.value = entry.id; battle.append(option); }
    if (battle.options.length > 1) overview.append(battle);
    const continueButton = action('继续此团', () => onContinue?.(item, battle.value || undefined), 'p-primary p-button cursor-interaction');
    continueButton.dataset.projectSelectModule = item.id; overview.append(continueButton);
    overview.append(element('small', '点击“继续此团”后，地图、对话和战斗才切换到这个团。'));
    return overview;
  }
  function appendRuns(area, items) {
    for (const item of items) {
      const row = element('article', undefined, 'module-run-row');
      const open = action(item.name, () => { focusedRun = focusedRun === item.id ? null : item.id; renderSelection(); });
      open.dataset.realRun = item.id; open.setAttribute('aria-expanded', String(focusedRun === item.id)); row.append(open);
      if (focusedRun === item.id) row.append(runOverview(item)); area.append(row);
    }
  }
  function renderSelection() {
    current.replaceChildren(); runsArea.replaceChildren(); extra.replaceChildren();
    const template = selected(), entries = templates();
    position.textContent = entries.length ? `${entries.findIndex(item => item.id === selectedId) + 1} / ${entries.length}` : '0 / 0';
    previous.disabled = next.disabled = entries.length < 2;
    if (template) {
      current.append(element('h3', template.name), element('small', template.category || '未分类'));
      const runs = grouped.runsFor(template.id);
      runsArea.append(element('h4', '已有游玩团' + (runs.length ? ` · ${runs.length}` : '')));
      if (!runs.length) runsArea.append(element('p', '这本模组还没有已关联的游玩团。', 'module-note'));
      appendRuns(runsArea, runs);
      const create = element('details', undefined, 'module-details'); create.append(element('summary', '新开一团'));
      const form = element('form', undefined, 'module-create');
      const name = element('input'); name.value = template.name + ' · 新团'; name.maxLength = 80; name.required = true; name.setAttribute('aria-label', '新团名称');
      const label = element('label', '团名'); label.append(name); form.append(label);
      const training = element('input'); training.type = 'checkbox'; training.checked = Boolean(template.canTrain);
      if (template.canTrain) { const choice = element('label', '甲板试玩（训练角色、示意棋盘）'); choice.prepend(training); form.append(choice); }
      const submit = element('button', '新建并继续', 'p-primary p-button cursor-interaction'); submit.type = 'submit'; submit.dataset.projectCreateRun = template.id;
      if (template.canTrain) submit.dataset.projectCreateTraining = template.id;
      form.append(submit);
      form.addEventListener('submit', event => { event.preventDefault(); if (!name.value.trim() || submit.disabled) return; run(async () => { submit.disabled = true; try { await onCreate?.(template, { name: name.value.trim(), training: template.canTrain && training.checked }); } finally { if (submit.isConnected) submit.disabled = false; } }); });
      create.append(form); extra.append(create);
      const info = element('details', undefined, 'module-details'); info.append(element('summary', '查看模组资料'));
      info.append(element('p', `${template.maps ?? 0}张地图 · ${template.nodes ?? 0}个故事节点 · ${template.reviewStatus === 'verified' ? '已核对' : '待核对候选'}`));
      if (template.batchId) info.append(element('p', '批次：' + template.batchId));
      if (template.relativePath) info.append(element('p', template.relativePath, 'module-path'));
      info.append(element('p', '资料信息不改变当前团；候选内容仍需核对。', 'module-note')); extra.append(info);
    } else current.append(element('h3', category || '本地模组'));
    if (grouped.unlinked.length) {
      const legacy = element('details', undefined, 'module-details'); legacy.append(element('summary', '其他已有团 · ' + grouped.unlinked.length));
      legacy.append(element('p', '这些团暂未与当前模组包建立可核对的关联，原进度保留。', 'module-note'));
      legacy.open = grouped.unlinked.some(item => item.id === focusedRun);
      appendRuns(legacy, grouped.unlinked); extra.append(legacy);
    }
    if (catalog.sources?.length || onStartBattle) {
      const tools = element('details', undefined, 'module-details'); tools.append(element('summary', '资料准备与兼容入口'));
      if (onStartBattle) { const start = action('载入已有战斗团', () => onStartBattle()); start.dataset.projectStartBattle = ''; tools.append(start); }
      for (const source of catalog.sources || []) {
        const row = element('div', undefined, 'module-source'); row.append(element('span', source.name));
        if (onPreprocess) row.append(action('提取预处理候选', () => onPreprocess(source))); tools.append(row);
      }
      extra.append(tools);
    }
  }
  ring.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = templates().findIndex(item => item.id === selectedId);
    choose(event.key === 'Home' ? 0 : event.key === 'End' ? templates().length - 1 : index + (event.key === 'ArrowLeft' ? -1 : 1), true);
  });
  ring.addEventListener('pointerdown', event => { if (event.button === 0 && templates().length > 1) pointer = { x: event.clientX, angle, dragging: false }; });
  ring.addEventListener('pointermove', event => {
    if (!pointer) return;
    const delta = event.clientX - pointer.x;
    if (!pointer.dragging && Math.abs(delta) > 8) { pointer.dragging = true; stop(); ring.setPointerCapture(event.pointerId); }
    if (pointer.dragging) { event.preventDefault(); angle = pointer.angle + delta * Math.PI * 2 / templates().length / 80; draw(); }
  });
  const endDrag = event => {
    if (!pointer) return;
    const dragged = pointer.dragging; pointer = null;
    if (ring.hasPointerCapture(event.pointerId)) ring.releasePointerCapture(event.pointerId);
    if (dragged) {
      suppressClick = performance.now() + 350;
      const step = Math.PI * 2 / templates().length; targetAngle = Math.round(angle / step) * step;
      selectedId = templates()[modulo(-Math.round(targetAngle / step), templates().length)].id;
      focusedRun = null; renderSelection(); animate();
    }
  };
  ring.addEventListener('pointerup', endDrag); ring.addEventListener('pointercancel', endDrag);
  const observer = new ResizeObserver(() => { draw(); alignThumb(); }); observer.observe(root);
  return {
    render(value) {
      generation++; catalog = value; grouped = groupModuleCatalog(value);
      if (!grouped.groups.some(group => group.name === category)) category = grouped.groups.find(group => group.templates.length)?.name || grouped.groups[0]?.name || '';
      const previousTemplate = grouped.groups.find(group => group.templates.some(item => item.id === selectedId)); if (previousTemplate) category = previousTemplate.name;
      segments.replaceChildren(thumb);
      for (const group of grouped.groups) {
        const tab = action(group.name, () => { category = group.name; selectedId = null; focusedRun = null; for (const node of segments.querySelectorAll('button')) node.setAttribute('aria-pressed', String(node === tab)); buildRing(); alignThumb(); }, 'p-segment p-button cursor-interaction');
        tab.setAttribute('aria-pressed', String(group.name === category)); tab.dataset.realModuleCategory = group.name; segments.append(tab);
      }
      segments.hidden = !grouped.groups.length;
      issuesArea.replaceChildren();
      for (const issue of value.issues || []) issuesArea.append(element('p', typeof issue === 'string' ? issue : [issue.folder, issue.error].filter(Boolean).join('：')));
      if (!grouped.groups.length) issuesArea.append(element('p', '尚无可用模组包。已有团可从下方兼容入口继续，真实目录与文件均保留。'));
      buildRing();
    },
    clear() { generation++; stop(); catalog = { templates: [], modules: [] }; grouped = groupModuleCatalog(); selectedId = focusedRun = null; root.querySelectorAll('img').forEach(image => image.removeAttribute('src')); segments.replaceChildren(); ring.replaceChildren(); current.replaceChildren(); runsArea.replaceChildren(); extra.replaceChildren(); issuesArea.replaceChildren(); },
    setVisible(value) { visible = value; if (!visible) stop(); else requestAnimationFrame(() => { angle = targetAngle; draw(); alignThumb(); }); }
  };
}

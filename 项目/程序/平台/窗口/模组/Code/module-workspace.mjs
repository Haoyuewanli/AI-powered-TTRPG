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

export function createModuleWorkspace({ host, run = operation => operation(), onContinue, onCreate, onRefresh, onStartBattle, onPreprocess, onManageCovers, onManageRun, onChangeCover, loadCover } = {}) {
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
  const stage = element('div', undefined, 'module-stage');
  const backdrop = element('div', undefined, 'module-backdrop'); backdrop.setAttribute('aria-hidden', 'true');
  const detail = element('div', undefined, 'module-detail');
  const smallCover = element('div', undefined, 'module-small-cover');
  const smallImage = element('img'); smallImage.alt = ''; smallImage.hidden = true;
  const smallTitle = element('h3');
  const coverActions = element('div', undefined, 'module-cover-actions');
  smallCover.append(smallImage, smallTitle, coverActions); detail.append(smallCover, runsArea);
  stage.append(backdrop, ring, controls, current, detail, extra);
  root.append(segments, toolbar, issuesArea, stage);
  let opened = false;
  function closeModule() { opened = false; stage.classList.remove('is-open'); draw(); }
  function openModule() {
    if (!selected()) return;
    const source = ring.querySelector('[aria-pressed=true] .p-cover-image');
    const from = source?.getBoundingClientRect(); opened = true; renderSelection();
    if (from?.width && !reduced()) {
      const to = smallCover.getBoundingClientRect();
      smallCover.animate([{ transform: `translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width})`, transformOrigin: 'top left', opacity: .7 }, { transform: 'none', opacity: 1 }], { duration: 1000, easing: 'cubic-bezier(.2,.75,.2,1)' });
    }
  }
  function modal(title, build) {
    const dialog = element('dialog', undefined, 'module-action-dialog'); const heading = element('h3', title);
    const cancel = element('button', '取消', 'p-secondary p-button'); cancel.type = 'button'; cancel.addEventListener('click', () => dialog.close());
    dialog.append(heading); build(dialog); dialog.append(cancel); root.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
  }
  function editName(title, value, accept) {
    modal(title, dialog => { const form = element('form'); const input = element('input'); input.value = value; input.maxLength = 80; input.required = true; input.setAttribute('aria-label', title);
      const save = element('button', '确认', 'p-primary p-button'); save.type = 'submit'; const message = element('p'); message.setAttribute('role', 'status'); form.append(input, save, message); dialog.append(form);
      form.addEventListener('submit', event => { event.preventDefault(); if (!input.value.trim() || save.disabled) return; run(async () => { save.disabled = true; try { await accept(input.value.trim()); dialog.close(); } catch(error) { message.textContent = error.message; } finally { save.disabled = false; } }); });
    });
  }
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
  controls.append(previous, position, next, action('确认选择', openModule, 'p-primary p-button'));
  toolbar.append(action('返回环状浏览', closeModule));

  function draw() {
    if (!visible || !ring.clientWidth) return;
    const entries = templates(), width = ring.clientWidth, height = ring.clientHeight;
    const coverWidth = Math.max(84, Math.min(210, width * .28, (height * .86 - 27) / 1.333));
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
      if (image.previousElementSibling) image.previousElementSibling.hidden = true;
      if (template.id === selectedId && opened) updateCover();
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
      card.addEventListener('click', () => { if (performance.now() >= suppressClick) { choose(index); openModule(); } });
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
    overview.append(element('p', '参与玩家：' + ([...new Set((item.characters || []).map(value => value.playerName || value.name))].join('、') || '尚未加入')));
    if (item.characters?.length) overview.append(element('p', '角色：' + item.characters.map(value => typeof value === 'string' ? value : value.name || value.id).join('、')));
    const battle = element('select'); battle.setAttribute('aria-label', item.name + '的战斗');
    for (const entry of item.battles || []) { const option = element('option', entry.name); option.value = entry.id; battle.append(option); }
    if (battle.options.length > 1) overview.append(battle);
    const continueButton = action('继续此团', () => onContinue?.(item, battle.value || undefined), 'p-primary p-button cursor-interaction');
    continueButton.dataset.projectSelectModule = item.id; overview.append(continueButton);
    overview.append(element('small', '点击“继续此团”后，地图、对话和战斗才切换到这个团。'));
    return overview;
  }
  function updateCover() {
    const template = selected(); if (!template) return;
    const image = [...ring.querySelectorAll('img')].find(item => item.alt === template.name + '封面');
    smallTitle.textContent = template.name;
    smallImage.hidden = !image?.getAttribute('src');
    if (image?.getAttribute('src')) { smallImage.src = image.src; smallImage.alt = template.name + '封面'; backdrop.style.backgroundImage = `url("${image.src}")`; }
    else { smallImage.removeAttribute('src'); backdrop.style.backgroundImage = ''; }
  }
  function appendRuns(area, items) {
    for (const item of items) {
      const row = element('article', undefined, 'module-run-row'); row.dataset.realRun = item.id;
      const content = element('div'); content.append(element('h4', item.name), runOverview(item));
      const actions = element('div', undefined, 'module-run-actions');
      if (onManageRun) {
        actions.append(action('重命名', () => editName('重命名团', item.name, name => onManageRun(item, 'rename', name))));
        actions.append(action('建立副本', () => editName('副本名称', item.name + ' · 副本', name => onManageRun(item, 'copy', name))));
        actions.append(action('删除团', () => modal('删除此团', dialog => { dialog.append(element('p', '此团会移入模组下的“已归档团”，完整文件保留，可通过文件管理器恢复。')); dialog.append(action('确认移入归档', async () => { await onManageRun(item, 'archive'); dialog.close(); })); })));
      }
      row.append(content, actions); area.append(row);
    }
  }
  function renderSelection() {
    current.replaceChildren(); runsArea.replaceChildren(); extra.replaceChildren();
    const template = selected(), entries = templates();
    if (!template) opened = false; stage.classList.toggle('is-open', opened);
    detail.hidden = !opened; current.hidden = true; extra.hidden = true;
    coverActions.replaceChildren(); updateCover();
    position.textContent = entries.length ? `${entries.findIndex(item => item.id === selectedId) + 1} / ${entries.length}` : '0 / 0';
    previous.disabled = next.disabled = entries.length < 2;
    if (template) {
      current.append(element('h3', template.name), element('small', template.category || '未分类'));
      coverActions.append(action('新建团', () => editName('新建团', template.name + ' · 新团', name => onCreate?.(template, { name }))));
      if (onChangeCover) coverActions.append(action('修改封面', () => modal('修改模组封面', dialog => {
        const file = element('input'); file.type = 'file'; file.accept = 'image/*'; file.setAttribute('aria-label', '选择封面图片');
        const preview = element('img'); preview.style.maxWidth = '220px'; const message = element('p'); let data = null;
        file.addEventListener('change', async () => { const chosen = file.files[0]; if (!chosen) return; data = null; try { const bitmap = await createImageBitmap(chosen); const canvas = document.createElement('canvas'); const scale = Math.min(1, 700 / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); preview.src = canvas.toDataURL('image/jpeg', .75); data = preview.src.split(',')[1]; message.textContent = ''; } catch { message.textContent = '图片无法读取，请重新选择。'; } });
        dialog.append(file, preview, message, action('保存封面', async () => { if (!data) { message.textContent = '请先选择图片。'; return; } await onChangeCover(template, data); dialog.close(); }));
      })));
      const runs = grouped.runsFor(template.id);
      runsArea.append(element('h4', '已有游玩团' + (runs.length ? ` · ${runs.length}` : '')));
      if (!runs.length) runsArea.append(element('p', '这本模组还没有已关联的游玩团。', 'module-note'));
      appendRuns(runsArea, runs);
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
  ring.addEventListener('wheel', event => { if (templates().length < 2 || opened) return; event.preventDefault(); if (!ring.wheelTimer) { step(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1); ring.wheelTimer = setTimeout(() => { ring.wheelTimer = null; }, 180); } }, { passive: false });
  const observer = new ResizeObserver(() => { draw(); alignThumb(); }); observer.observe(root);
  return {
    setStatus(text) { issuesArea.replaceChildren(element('p', text)); },
    render(value) {
      generation++; catalog = value; grouped = groupModuleCatalog(value);
      if (!grouped.groups.some(group => group.name === category)) category = grouped.groups.find(group => group.templates.length)?.name || grouped.groups[0]?.name || '';
      const previousTemplate = grouped.groups.find(group => group.templates.some(item => item.id === selectedId)); if (previousTemplate) category = previousTemplate.name;
      segments.replaceChildren(thumb);
      for (const group of grouped.groups) {
        const tab = action(group.name, () => { category = group.name; opened = false; selectedId = null; focusedRun = null; for (const node of segments.querySelectorAll('button')) node.setAttribute('aria-pressed', String(node === tab)); buildRing(); alignThumb(); }, 'p-segment p-button cursor-interaction');
        tab.setAttribute('aria-pressed', String(group.name === category)); tab.dataset.realModuleCategory = group.name; segments.append(tab);
      }
      segments.hidden = !grouped.groups.length;
      issuesArea.replaceChildren();
      for (const issue of value.issues || []) issuesArea.append(element('p', typeof issue === 'string' ? issue : [issue.path || issue.folder, issue.error || issue.reason].filter(Boolean).join('：')));
      if (!grouped.groups.length) issuesArea.append(element('p', '尚无可用模组。请在模组目录添加带有模组.json的模组文件夹，然后刷新。'));
      buildRing();
    },
    clear() { generation++; opened = false; detail.hidden = true; stage.classList.remove('is-open'); stop(); catalog = { templates: [], modules: [] }; grouped = groupModuleCatalog(); selectedId = focusedRun = null; root.querySelectorAll('img').forEach(image => image.removeAttribute('src')); segments.replaceChildren(); ring.replaceChildren(); current.replaceChildren(); runsArea.replaceChildren(); extra.replaceChildren(); issuesArea.replaceChildren(); },
    setVisible(value) { visible = value; if (!visible) stop(); else requestAnimationFrame(() => { angle = targetAngle; draw(); alignThumb(); }); }
  };
}

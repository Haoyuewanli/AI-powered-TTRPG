const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const button = (text, action) => {
  const node = element('button', text, 'p-button map-button');
  node.type = 'button'; node.addEventListener('click', action); return node;
};
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const cloneState = value => record(value) ? structuredClone(value) : {};
const pages = value => Array.isArray(value) && value.length ? 'PDF 第 ' + value.join('、') + ' 页' : '来源页待核对';

export function createMapWorkspace({ platform, api, mutate, run, openResource }) {
  const view = platform.root.querySelector('[data-platform-view="maps"]');
  const frame = view.querySelector('.p-map-frame'), tree = view.querySelector('[data-map-tree]');
  const demoImage = view.querySelector('[data-map-image]'), demoCaption = view.querySelector('[data-map-title]');
  const demoNote = view.querySelector('.p-demo-note'), demoText = demoNote?.textContent;
  const workspace = element('section', undefined, 'map-workspace'); workspace.hidden = true; workspace.dataset.realMapWorkspace = '';
  const toolbar = element('div', undefined, 'map-toolbar');
  const status = element('p', '', 'map-status'); status.setAttribute('role', 'status'); status.dataset.realMapStatus = '';
  const viewport = element('div', undefined, 'map-viewport'); viewport.tabIndex = 0; viewport.setAttribute('aria-label', '当前模组原图，可缩放与拖动平移');
  const stage = element('div', undefined, 'map-image-stage'), image = element('img'); image.draggable = false; image.dataset.realMapImage = '';
  const caption = element('p', '', 'map-caption'); caption.dataset.realMapCaption = '';
  const detail = element('section', undefined, 'map-location-detail'); detail.dataset.realMapLocation = '';
  stage.append(image); viewport.append(stage); workspace.append(toolbar, status, viewport, caption, detail); frame.prepend(workspace);
  const directory = element('section', undefined, 'map-real-directory'); directory.hidden = true; directory.dataset.realMapDirectory = ''; tree.prepend(directory);
  const restore = button('查看当前模组地图', () => showReal()); restore.hidden = true; restore.dataset.showRealMap = ''; frame.prepend(restore);
  let generation = 0, imageGeneration = 0, manifest = null, activeMap = null, activeLocation = null;
  let mapState = {}, storyState = {}, revision = null, mapDirty = false, storyDirty = false, zoom = 1, pan = { x: 0, y: 0 }, drag = null;
  let mapEdit = 0, storyEdit = 0;
  const drafts = new Set();

  function perform(operation) {
    const current = generation;
    return run(async () => {
      try { return await operation(); }
      catch (error) { if (current === generation) status.textContent = error.message + ' 本页草稿仍保留；重新读取会放弃草稿。'; throw error; }
    });
  }
  function live(current) { return current === generation && platform.role === 'dm'; }
  function showReal() {
    if (!manifest || platform.role !== 'dm') return;
    if (demoNote) demoNote.textContent = '当前团模组原图 · 主持人与玩家版本分别列出；笔记保存在当前团。';
    workspace.hidden = false; directory.hidden = false; demoImage.hidden = true; demoCaption.hidden = true; restore.hidden = true;
    frame.classList.add('has-real-map');
  }
  function showDemo() {
    if (demoNote) demoNote.textContent = demoText;
    workspace.hidden = true; demoImage.hidden = false; demoCaption.hidden = false; restore.hidden = !manifest; frame.classList.remove('has-real-map');
  }
  function transform() { stage.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`; }
  function fit() {
    const width = viewport.clientWidth, height = viewport.clientHeight, ratio = activeMap?.width / activeMap?.height || 7 / 5, imageHeight = width / ratio;
    zoom = width && height ? Math.min(1, height / imageHeight) : 1;
    pan = { x: 0, y: width && height ? (height - imageHeight) / 2 : 0 }; transform();
  }
  function changeZoom(value) { zoom = Math.max(.1, Math.min(5, value)); transform(); }
  function stopDrag(event) {
    if (!drag) return;
    const pointerId = event?.pointerId ?? drag.pointerId;
    if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
    drag = null; viewport.classList.remove('is-dragging');
  }
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !image.hasAttribute('src')) return;
    drag = { x: event.clientX, y: event.clientY, left: pan.x, top: pan.y, pointerId: event.pointerId };
    viewport.setPointerCapture(event.pointerId); viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove', event => { if (drag) { pan = { x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y }; transform(); } });
  viewport.addEventListener('pointerup', stopDrag); viewport.addEventListener('pointercancel', stopDrag); viewport.addEventListener('lostpointercapture', stopDrag);
  viewport.addEventListener('keydown', event => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(zoom * 1.2); }
    else if (event.key === '-') { event.preventDefault(); changeZoom(zoom / 1.2); }
    else if (event.key === '0') { event.preventDefault(); fit(); }
  });
  tree.addEventListener('click', event => { if (event.target.closest('[data-map-id]')) showDemo(); });
  toolbar.append(button('−', () => changeZoom(zoom / 1.2)), button('＋', () => changeZoom(zoom * 1.2)), button('适配原图', fit),
    button('公共占位示例', showDemo), button('重新读取（放弃本页草稿）', () => perform(() => load({ reload: true }))));
  toolbar.querySelectorAll('button')[0].setAttribute('aria-label', '缩小真实地图'); toolbar.querySelectorAll('button')[1].setAttribute('aria-label', '放大真实地图');
  toolbar.querySelectorAll('button')[2].dataset.fitRealMap = ''; toolbar.querySelectorAll('button')[3].dataset.showDemoMap = ''; toolbar.querySelectorAll('button')[4].dataset.reloadRealMap = '';

  async function save(kind) {
    const current = generation;
    const value = kind === '地图状态' ? mapState : storyState, edit = kind === '地图状态' ? mapEdit : storyEdit;
    const result = await mutate('module-state', { kind, state: structuredClone(value), expectedRevision: revision });
    if (!live(current)) return;
    revision = result.revision;
    if (kind === '地图状态') mapDirty = mapEdit !== edit; else storyDirty = storyEdit !== edit;
    status.textContent = mapDirty || storyDirty ? kind + '已保存，本页仍有较新的草稿。' : kind + '已保存到当前团。';
  }
  function locationKey(map, location) { return 'map:' + map.id + '|location:' + location.id; }
  function locationDraft(map, location) {
    const key = locationKey(map, location);
    if (!record(mapState.locations)) mapState.locations = {};
    if (!record(mapState.locations[key])) mapState.locations[key] = {};
    return mapState.locations[key];
  }
  function checkbox(label, checked, change) {
    const field = element('label', undefined, 'map-check'), input = element('input'); input.type = 'checkbox'; input.checked = !!checked;
    input.addEventListener('change', () => change(input.checked)); field.append(input, element('span', label)); return field;
  }
  function renderLocation(location) {
    detail.replaceChildren(); activeLocation = location || null;
    if (!activeMap) return;
    if (!location) {
      detail.append(element('p', activeMap.audience === 'player' ? '玩家原图保持未标注版；地点与主持提示请切到主持人图查看。' : '从右侧目录选择地点。未核对坐标时只提供地点列表，不在原图上添加猜测热点。'));
      return;
    }
    mapState.selectedLocationId = location.id;
    const data = locationDraft(activeMap, location), current = generation;
    detail.append(element('h3', location.label || location.id), element('p', pages(location.sourcePages), 'map-source'), element('p', location.description || '该地点描述尚待核对。'));
    if (location.dmNotes) { const secrets = element('details'); secrets.append(element('summary', '主持人提示'), element('p', location.dmNotes)); detail.append(secrets); }
    const flags = element('div', undefined, 'map-flags');
    for (const [key, label] of [['explored', '已探索'], ['enemiesHandled', '敌人已处理'], ['treasureTaken', '物品已取']]) {
      flags.append(checkbox(label, data[key], value => { if (!live(current)) return; data[key] = value; mapDirty = true; mapEdit++; status.textContent = '地点记录有未保存更改。'; }));
    }
    const notes = element('textarea'); notes.rows = 3; notes.value = typeof data.notes === 'string' ? data.notes : ''; notes.placeholder = '当前团在此地点的主持笔记'; notes.setAttribute('aria-label', '当前地点笔记'); notes.dataset.realMapNotes = '';
    notes.addEventListener('input', () => { if (!live(current)) return; data.notes = notes.value; mapDirty = true; mapEdit++; status.textContent = '地点笔记有未保存更改。'; }); drafts.add(notes);
    const saveButton = button('保存地点记录', () => perform(() => save('地图状态'))); saveButton.dataset.saveMapState = '';
    detail.append(flags, notes, saveButton, element('p', '这些勾选只保存探索记录，不扣角色资源、不自动移动敌人或结算战斗。', 'map-source'));
    if (Array.isArray(location.links) && location.links.length) {
      detail.append(element('p', '相关地点（原书引用，不代表已判定通道或门墙）：', 'map-source'));
      const links = element('div', undefined, 'map-links');
      for (const link of location.links) {
        const targetMap = manifest.maps.find(entry => entry.id === link.mapId), targetLocation = targetMap?.locations?.find(entry => entry.id === link.locationId);
        const jump = button((link.label || '相关地点') + (targetMap ? ' · ' + targetMap.name : ' · 待核对'), () => perform(() => selectMap(targetMap, targetLocation?.id)));
        jump.disabled = !targetMap; links.append(jump);
      }
      detail.append(links);
    }
    for (const id of Array.isArray(location.resourceIds) ? location.resourceIds : []) detail.append(button('查看相关资料', () => perform(() => openResource?.({ id }))));
  }
  async function selectMap(map, locationId) {
    if (!map || !manifest || !manifest.maps.includes(map)) return;
    const current = generation, request = ++imageGeneration; activeMap = map; activeLocation = null;
    mapState.selectedMapId = map.id; mapState.selectedLocationId = locationId || null;
    image.removeAttribute('src'); image.alt = map.name; caption.textContent = map.name + ' · ' + (map.audience === 'player' ? '玩家原图' : '主持人原图') + ' · ' + pages(map.source?.pdfPage ? [map.source.pdfPage] : map.sourcePages);
    stage.style.aspectRatio = Number.isFinite(map.width) && Number.isFinite(map.height) && map.width > 0 && map.height > 0 ? `${map.width}/${map.height}` : '7/5';
    fit(); showReal(); renderLocation(map.locations?.find(entry => entry.id === locationId));
    for (const choice of directory.querySelectorAll('[data-real-map-choice]')) {
      const selected = choice.dataset.realMapChoice === map.id; choice.setAttribute('aria-pressed', String(selected));
      if (selected) { const item = choice.closest('details'); item.open = true; const group = item.parentElement.closest('details'); if (group) group.open = true; }
    }
    status.textContent = '正在读取当前模组原图…';
    const value = await api('/api/project/map-image?mapId=' + encodeURIComponent(map.resourceId || map.id));
    if (!live(current) || request !== imageGeneration) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(value.mime) || typeof value.base64 !== 'string') throw new Error('地图图像格式无效');
    image.src = 'data:' + value.mime + ';base64,' + value.base64;
    status.textContent = mapDirty || storyDirty ? '图像已读取，本页仍有未保存记录。' : '原图已读取，可拖动平移；＋/−缩放，0适配。';
  }
  function renderStory() {
    const section = element('details', undefined, 'map-story-tree'); section.dataset.realStoryTree = '';
    section.append(element('summary', '故事节点（' + (manifest.storyNodes?.length || 0) + '）'));
    const list = element('div', undefined, 'map-story-list'), storyDetail = element('article', undefined, 'map-story-detail');
    section.append(list, storyDetail);
    for (const node of manifest.storyNodes || []) {
      const choose = button(node.title || node.id, () => {
        if (platform.role !== 'dm' || !manifest) return;
        storyDetail.replaceChildren();
        if (!record(storyState.nodes)) storyState.nodes = {};
        const key = 'node:' + node.id;
        if (!record(storyState.nodes[key])) storyState.nodes[key] = {};
        const data = storyState.nodes[key], current = generation;
        storyDetail.append(element('h4', node.title || node.id), element('p', node.description || '待核对'), element('p', pages(node.source?.pdfPages), 'map-source'));
        if (node.optional) storyDetail.append(element('p', '可选节点，由主持与玩家决定是否采用。', 'map-source'));
        for (const condition of node.conditions || []) storyDetail.append(element('p', '原书条件：' + condition, 'map-source'));
        for (const id of Array.isArray(node.resourceIds) ? node.resourceIds : []) storyDetail.append(button('查看相关资料', () => perform(() => openResource?.({ id }))));
        for (const [flag, label] of [['known', '团内已知记录'], ['completed', '已完成记录']]) storyDetail.append(checkbox(label, data[flag], value => { if (!live(current)) return; data[flag] = value; storyDirty = true; storyEdit++; status.textContent = '故事节点有未保存记录。'; }));
        const notes = element('textarea'); notes.rows = 2; notes.value = typeof data.notes === 'string' ? data.notes : ''; notes.placeholder = '节点笔记'; notes.setAttribute('aria-label', '故事节点笔记');
        notes.addEventListener('input', () => { if (!live(current)) return; data.notes = notes.value; storyDirty = true; storyEdit++; }); drafts.add(notes);
        const saveButton = button('保存故事记录', () => perform(() => save('故事进度'))); saveButton.dataset.saveStoryState = '';
        storyDetail.append(notes, saveButton, element('p', '记录不自动发放秘密、扣资源或更改战斗。', 'map-source'));
      });
      choose.dataset.realStoryChoice = node.id; list.append(choose);
    }
    return section;
  }
  function renderDirectory() {
    directory.replaceChildren(element('h3', '当前模组地图'));
    for (const [audience, label] of [['dm', '主持人图'], ['player', '玩家原图'], ['unreviewed', '用途待核对']]) {
      const maps = manifest.maps.filter(map => (map.audience || 'unreviewed') === audience); if (!maps.length) continue;
      const group = element('details'); group.open = audience === 'dm'; group.append(element('summary', label));
      for (const map of maps) {
        const item = element('details'); item.open = map.id === mapState.selectedMapId;
        const heading = element('summary'); heading.append(element('span', map.name)); item.append(heading);
        const choose = button('查看原图', () => perform(() => selectMap(map))); choose.dataset.realMapChoice = map.id; choose.setAttribute('aria-pressed', 'false'); item.append(choose);
        for (const location of map.locations || []) {
          const select = button(location.label || location.id, () => perform(() => selectMap(map, location.id))); select.dataset.realLocationChoice = location.id; select.dataset.realLocationMap = map.id; item.append(select);
        }
        group.append(item);
      }
      directory.append(group);
    }
    directory.append(renderStory(), element('p', '下方原有目录仍为公共占位示例。', 'map-source'));
  }
  async function load({ reload = false } = {}) {
    if (platform.role !== 'dm') throw new Error('当前模组地图仅可由本机DM显式读取。');
    if (manifest && !reload) { showReal(); return; }
    clear(); const current = generation;
    const [content, maps, story] = await Promise.all([api('/api/project/module-content'), api('/api/project/module-state?kind=' + encodeURIComponent('地图状态')), api('/api/project/module-state?kind=' + encodeURIComponent('故事进度'))]);
    if (!live(current)) return;
    manifest = { ...content, maps: Array.isArray(content.maps) ? content.maps : [], storyNodes: Array.isArray(content.storyNodes) ? content.storyNodes : [] };
    mapState = cloneState(maps.state); storyState = cloneState(story.state); revision = Math.min(maps.revision, story.revision);
    renderDirectory(); directory.hidden = false;
    if (!manifest.maps.length) {
      workspace.hidden = false; status.textContent = '当前模组尚无已核对地图；保留公共占位地图与目录。'; viewport.hidden = true; caption.textContent = ''; detail.replaceChildren();
      return;
    }
    viewport.hidden = false;
    await selectMap(manifest.maps.find(map => map.id === mapState.selectedMapId) || manifest.maps.find(map => map.audience === 'dm') || manifest.maps[0], mapState.selectedLocationId);
  }
  function clear() {
    if (demoNote) demoNote.textContent = demoText;
    generation++; imageGeneration++; stopDrag();
    manifest = null; activeMap = null; activeLocation = null; mapState = {}; storyState = {}; revision = null; mapDirty = false; storyDirty = false; mapEdit = 0; storyEdit = 0;
    for (const input of drafts) input.value = ''; drafts.clear();
    image.removeAttribute('src'); image.alt = ''; caption.textContent = ''; status.textContent = ''; detail.replaceChildren(); directory.replaceChildren();
    directory.hidden = true; workspace.hidden = true; viewport.hidden = false; restore.hidden = true; demoImage.hidden = false; demoCaption.hidden = false;
    frame.classList.remove('has-real-map'); fit();
  }
  let viewportSize = '';
  new ResizeObserver(() => {
    const next = viewport.clientWidth + ':' + viewport.clientHeight;
    if (next !== viewportSize && activeMap && !drag) fit();
    viewportSize = next;
  }).observe(viewport);
  clear();
  return { load, clear, canLeave: () => !mapDirty && !storyDirty };
}

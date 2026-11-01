import { createDocument, anchors, nearestAnchor, resolveEndpoint, validateDocument, fitBounds } from './model.mjs';

const $ = selector => document.querySelector(selector);
const offlineData = window.__MAP_OFFLINE__ || null;
async function request(path, options) {
  if (!offlineData) return fetch(path, options);
  let data;
  if (path === '/api/module') data = offlineData.moduleData;
  else if (path.startsWith('/api/source?')) {
    const id = new URLSearchParams(path.split('?')[1]).get('node');
    if (!Object.hasOwn(offlineData.sources, id)) return { ok: false, json: async () => ({}) };
    data = { text: offlineData.sources[id] };
  } else throw Error('本地文件不支持这项联网操作');
  return { ok: true, json: async () => structuredClone(data) };
}
const svgNS = 'http://www.w3.org/2000/svg';
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const svg = (tag, attributes = {}) => {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};
const button = (text, action, className) => {
  const node = element('button', className, text); node.type = 'button';
  node.addEventListener('click', action); return node;
};
const viewport = $('#viewport'), world = $('#world');
const overview = element('div', 'overview-labels'); viewport.append(overview);
let moduleData, doc, selection = null, tool = 'select', gesture = null, arrowStart = null, space = false;
let lastTap = null;
let undoStack = [], redoStack = [], dirty = false, shareGeneration = 0, shareQueue = Promise.resolve();
let palette = { color: '#467e91', fill: '#dcecf0', borderWidth: 3 };
const MAX_HISTORY = 60;
const status = message => { $('#status').textContent = message; };
const uid = prefix => prefix + '-' + crypto.randomUUID();
const snapshot = () => structuredClone(doc);
const editable = target => !!target?.closest('input,textarea,select,[contenteditable="true"]');

function remember(previous = snapshot()) {
  undoStack.push(previous); if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = []; dirty = true; updateHistory();
}
function updateHistory() {
  $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length;
  $('#save').textContent = dirty ? '保存画布 ●' : '保存画布';
}
function findEntity(id) { return doc.nodes.find(n => n.id === id) || doc.objects.find(n => n.id === id); }
function sourceNode(id) { return moduleData.nodes.find(n => n.id === id); }
function pointAt(event) {
  const box = viewport.getBoundingClientRect();
  return { x: (event.clientX - box.left - doc.camera.x) / doc.camera.zoom, y: (event.clientY - box.top - doc.camera.y) / doc.camera.zoom };
}
function camera() {
  const { x, y, zoom } = doc.camera;
  world.style.transform = `translate(${x}px,${y}px) scale(${zoom})`;
  $('#zoom-label').textContent = Math.round(zoom * 100) + '%';
  viewport.style.backgroundColor = doc.settings.background;
  let size = doc.settings.gridSize * zoom;
  while (size < 16) size *= 2;
  const color = doc.settings.gridColor;
  viewport.style.backgroundSize = `${size}px ${size}px`;
  viewport.style.backgroundPosition = `${x}px ${y}px`;
  viewport.style.backgroundImage = doc.settings.grid === 'dots'
    ? `radial-gradient(circle, ${color} 1px, transparent 1.4px)`
    : doc.settings.grid === 'grid' ? `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)` : 'none';
  const isOverview = zoom < .27; viewport.classList.toggle('overview-mode', isOverview); overview.hidden = !isOverview;
  overview.replaceChildren();
  if (isOverview) for (const node of doc.nodes) {
    const data = sourceNode(node.id), label = button(/^[A-D]\d+$/.test(data.id) ? data.id : data.name, () => focusNode(node.id), 'overview-label');
    label.title = data.name; label.setAttribute('aria-label', '定位' + data.name); label.dataset.overviewNode = node.id;
    label.style.left = x + (node.x + node.w / 2) * zoom + 'px'; label.style.top = y + node.y * zoom - 5 + 'px'; overview.append(label);
  }
}
function zoomAt(next, screenX = viewport.clientWidth / 2, screenY = viewport.clientHeight / 2) {
  const old = doc.camera.zoom; next = Math.max(.06, Math.min(3.5, next));
  const px = (screenX - doc.camera.x) / old, py = (screenY - doc.camera.y) / old;
  doc.camera = { x: screenX - px * next, y: screenY - py * next, zoom: next }; camera();
}
function focusNode(id) {
  const node = doc.nodes.find(n => n.id === id); if (!node) return;
  const width = node.w + 310, height = Math.max(node.h, 680);
  const zoom = Math.min(1.2, (viewport.clientWidth - 90) / width, (viewport.clientHeight - 90) / height);
  doc.camera = { x: viewport.clientWidth / 2 - (node.x + width / 2) * zoom, y: viewport.clientHeight / 2 - (node.y + height / 2) * zoom, zoom: Math.max(.06, zoom) };
  selection = id; renderSelection(); camera();
  const directoryButton = document.querySelector(`[data-focus-node="${CSS.escape(id)}"]`);
  for (let parent = directoryButton?.parentElement; parent && parent !== $('#directory'); parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  directoryButton?.scrollIntoView({ block: 'nearest' });
  status('已定位：' + sourceNode(id).name + '。玩家标记位置保持原处。');
}
function fitAll() {
  if (!doc.nodes.length) return;
  const bounds = fitBounds(doc);
  const left = bounds.x, top = bounds.y, right = left + bounds.w, bottom = top + bounds.h;
  const zoom = Math.max(.06, Math.min(1, (viewport.clientWidth - 100) / (right - left), (viewport.clientHeight - 100) / (bottom - top)));
  doc.camera = { x: viewport.clientWidth / 2 - (left + right) / 2 * zoom, y: viewport.clientHeight / 2 - (top + bottom) / 2 * zoom, zoom };
  camera(); status('已显示模组全部地图。点右侧目录可进入局部。');
}
function setTool(value) {
  tool = value; arrowStart = null; lastTap = null; $('#draft').replaceChildren();
  document.querySelectorAll('[data-tool]').forEach(node => { node.classList.toggle('active', node.dataset.tool === value); node.setAttribute('aria-pressed', String(node.dataset.tool === value)); });
  viewport.dataset.tool = value;
  const help = { select: '选择：拖动地图或对象；双击文本或标记可改名。', pan: '拖动画布，或随时按住空格拖动。', rect: '在画布上拖出矩形，可勾选“仅边框”。', ellipse: '在画布上拖出椭圆，可勾选“仅边框”。', text: '点击空白处添加文本框。', player: '点击画布放置玩家标记，然后修改名字与颜色。', arrow: '依次点击起点与终点；靠近地图或文本框的八个锚点时自动吸附。Esc取消。' };
  status(help[value]);
}
function renderDirectory() {
  const container = $('#directory'); container.replaceChildren();
  const append = (parentId, host) => {
    for (const node of moduleData.nodes.filter(n => (n.parentId || null) === parentId)) {
      const children = moduleData.nodes.some(n => n.parentId === node.id);
      const row = button(node.name, () => focusNode(node.id)); row.dataset.focusNode = node.id; row.className = 'directory-item';
      const icon = element('span', 'directory-kind', node.kind === 'image' ? '▧' : '▤'); icon.setAttribute('aria-hidden', 'true'); row.prepend(icon);
      if (children) {
        const details = element('details', 'directory-branch'); details.open = !node.parentId;
        const summary = element('summary'); summary.append(row); details.append(summary);
        const group = element('div', 'directory-children'); append(node.id, group); details.append(group); host.append(details);
      } else host.append(row);
    }
  }; append(null, container);
}
function panel(title, className, body) {
  const details = element('details', className); details.append(element('summary', '', title), body); return details;
}
function openReader(data) {
  let dialog = $('#map-reader');
  if (!dialog) { dialog = element('dialog', 'map-reader'); dialog.id = 'map-reader'; document.body.append(dialog); }
  dialog.replaceChildren();
  const heading = element('header'); heading.append(element('h2', '', data.name), button('关闭', () => dialog.close()));
  const content = element('div', 'reader-content');
  content.append(element('h3', '', '模组描述'), element('p', '', data.description || '此地点未提供独立基础描述。'));
  if (data.source) content.append(element('p', 'source-reference', data.source.label || `原文第${data.source.start}～${data.source.end}行`));
  content.append(element('h3', '', '移步换景'), element('p', '', data.sensory || '请结合对应基础描述主持。'), element('p', 'panel-hint', '主持提词中的可能人物和事件，需结合当前剧情判断。'));
  dialog.append(heading, content); dialog.showModal();
}
function descriptionPanel(data) {
  const body = element('div', 'panel-body'); body.append(element('p', '', data.description || '此地点未提供独立基础描述。'));
  const source = data.source;
  if (source) {
    body.append(element('p', 'source-reference', source.label || `原文第${source.start}～${source.end}行`));
    const read = button('查看对应原文', async () => {
      read.disabled = true;
      try {
        const response = await request('/api/source?node=' + encodeURIComponent(data.id));
        if (!response.ok) throw Error('原文读取失败');
        const value = await response.json();
        let pre = body.querySelector('pre'); if (!pre) { pre = element('pre', 'source-excerpt'); body.append(pre); }
        pre.textContent = value.text || value.excerpt || ''; read.hidden = true;
      } catch (error) { status(error.message); } finally { read.disabled = false; }
    }); body.append(read);
  }
  return panel('模组描述', 'description-panel', body);
}
function sharePanel(data) {
  const body = element('div', 'panel-body');
  if (moduleData.capabilities?.sharing === false) {
    const placeholder = button('玩家共享（暂未启用）', () => {}); placeholder.disabled = true;
    body.append(placeholder, element('p', 'panel-hint', '本地完整版只提供地图编辑，玩家共享暂作占位。'));
    return panel('共享情况 · 占位', 'share-panel', body);
  }
  const variants = data.variants || [{ id: data.id, label: '地图图片', url: data.imageUrl }];
  const existing = doc.shares[data.id];
  const picker = element('select'); picker.setAttribute('aria-label', data.name + '共享图片版本');
  for (const variant of variants) { const option = element('option', '', variant.label); option.value = variant.id; picker.append(option); }
  picker.value = existing?.variantId || (variants.some(v => v.id === 'player') ? 'player' : variants[0].id);
  const versionLabel = element('label', 'share-version', '发送图片'); versionLabel.append(picker); body.append(versionLabel);
  const count = existing?.players.length || 0;
  const details = panel(`共享情况 · ${count}人`, 'share-panel', body);
  const update = () => {
    remember();
    doc.shares[data.id] = { variantId: picker.value, players: [...body.querySelectorAll('input:checked')].map(n => n.value) };
    details.querySelector('summary').textContent = `共享情况 · ${doc.shares[data.id].players.length}人`;
    syncShares();
  };
  for (const player of moduleData.players) {
    const label = element('label', 'share-check'), input = element('input'); input.type = 'checkbox'; input.value = player.id; input.checked = existing?.players.includes(player.id) || false;
    input.addEventListener('change', update); label.append(input, document.createTextNode(player.name)); body.append(label);
  }
  picker.addEventListener('change', update);
  body.append(element('p', 'panel-hint', '接收端仅获得所选原图，画布与提词不发送。'));
  if (!variants.some(variant => variant.id === 'player')) body.append(element('p', 'panel-hint', '此地点仅有主持图，请确认图片本身可公开后勾选。'));
  return details;
}
function renderNodes() {
  const container = $('#nodes'); container.replaceChildren();
  for (const state of doc.nodes) {
    const data = sourceNode(state.id), node = element('article', 'map-node' + (data.kind === 'text' ? ' text-map' : ''));
    node.dataset.nodeId = state.id; node.style.cssText = `left:${state.x}px;top:${state.y}px;width:${state.w}px;height:${state.h}px;`;
    const visual = element('div', 'map-visual'); visual.style.borderColor = state.borderColor; visual.style.outlineColor = state.borderColor;
    const title = element('div', 'map-title', data.name); title.dataset.dragNode = state.id; visual.append(title);
    if (data.kind === 'image') {
      const wrap = element('div', 'map-image-wrap');
      const image = element('img'); image.src = data.imageUrl || data.variants?.[0]?.url; image.alt = data.name; image.draggable = false; image.loading = 'eager';
      image.addEventListener('error', () => { wrap.classList.add('image-missing'); status('地图图片未能载入：' + data.name); });
      wrap.append(image);
      for (const [index, hotspot] of (data.hotspots || []).entries()) {
        const marker = button(hotspot.label, event => { event.stopPropagation(); focusNode(hotspot.targetId); }, 'hotspot');
        marker.style.left = `${hotspot.x * 100}%`; marker.style.top = `${hotspot.y * 100}%`;
        marker.dataset.hotspotTarget = hotspot.targetId; marker.title = '前往 ' + (sourceNode(hotspot.targetId)?.name || hotspot.label); marker.setAttribute('aria-label', marker.title);
        marker.dataset.hotspotIndex = index;
        wrap.append(marker);
      }
      visual.append(wrap);
    } else {
      const name = element('div', 'map-text-name', data.name); name.dataset.dragNode = state.id; visual.append(name);
    }
    const cards = element('aside', 'node-panels'); cards.setAttribute('aria-label', data.name + '信息');
    cards.append(button('放大阅读', () => openReader(data), 'reader-button'));
    if (data.kind === 'image') cards.append(sharePanel(data));
    cards.append(descriptionPanel(data));
    const sensoryBody = element('div', 'panel-body'); sensoryBody.append(element('p', '', data.sensory || '请结合对应基础描述主持此地点。'), element('p', 'panel-hint', '主持提词 · 可能事项需结合当前剧情判断'));
    cards.append(panel('移步换景', 'sensory-panel', sensoryBody));
    node.append(visual, cards); container.append(node);
  }
}
function resizeHandle(entity) {
  const handle = element('button', 'resize-handle'); handle.type = 'button'; handle.dataset.resize = entity.id;
  handle.setAttribute('aria-label', '调整大小'); handle.title = '拖动调整大小'; return handle;
}
function renderObjects() {
  const container = $('#objects'); container.replaceChildren();
  for (const object of doc.objects.filter(o => o.type !== 'arrow')) {
    const node = element('div', `canvas-object ${object.type === 'rect' ? 'shape-rect' : object.type === 'ellipse' ? 'shape-ellipse' : object.type === 'player' ? 'player-object' : 'text-object'}`);
    node.dataset.objectId = object.id;
    node.style.cssText = `left:${object.x}px;top:${object.y}px;width:${object.w}px;height:${object.h}px;color:${object.color};border-color:${object.color};--object-color:${object.color};--object-fill:${object.fill || 'transparent'};border-width:${object.borderWidth || 2}px;background:${object.type === 'player' ? 'transparent' : object.fill || 'transparent'};font-size:${object.fontSize || 18}px;`;
    node.style.zIndex = doc.objects.indexOf(object);
    if (object.type === 'player') {
      node.append(element('span', 'player-name', object.name), element('span', 'player-marker'));
    } else if (object.type === 'text') node.append(element('span', 'object-copy', object.text));
    node.addEventListener('dblclick', () => { if (['player', 'text'].includes(object.type)) { selection = object.id; renderSelection(); const field = object.type === 'player' ? $('#selection-name') : $('#object-text'); field.focus(); field.select(); } });
    container.append(node);
  }
  renderArrows();
}
function arrowLine(object, layer, className = 'user-arrow') {
  const a = resolveEndpoint(object.a, doc), b = resolveEndpoint(object.b, doc); if (!a || !b) return;
  const line = svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: object.color || palette.color, 'stroke-width': object.borderWidth || 3, 'marker-end': 'url(#arrow-tip)', class: className, 'data-arrow-id': object.id || '' });
  line.style.pointerEvents = object.id ? 'stroke' : 'none'; layer.append(line);
  if (object.id === selection) for (const [key, point] of [['a', a], ['b', b]]) {
    const handle = svg('circle', { cx: point.x, cy: point.y, r: 8 / doc.camera.zoom, fill: '#fff', stroke: object.color, 'stroke-width': 2, class: 'arrow-handle', 'data-arrow-handle': object.id, 'data-endpoint': key });
    handle.style.pointerEvents = 'all'; layer.append(handle);
  }
}
function renderArrows() {
  const layer = $('#arrows'); layer.replaceChildren();
  $('#objects').querySelectorAll('.object-arrow-layer').forEach(node => node.remove());
  const defs = svg('defs'), marker = svg('marker', { id: 'arrow-tip', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' });
  marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' })); defs.append(marker); layer.append(defs);
  for (const arrow of doc.objects.filter(o => o.type === 'arrow')) {
    const objectLayer = svg('svg', { class: 'object-arrow-layer', 'aria-label': '箭头' });
    objectLayer.style.cssText = `position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;z-index:${doc.objects.indexOf(arrow)}`;
    arrowLine(arrow, objectLayer); $('#objects').append(objectLayer);
  }
}
function drawConnections() {
  const layer = $('#connections'); layer.replaceChildren();
  for (const child of doc.nodes) {
    const parentId = sourceNode(child.id).parentId, parent = doc.nodes.find(n => n.id === parentId); if (!parent) continue;
    const pa = anchors(parent), ca = anchors(child);
    let best = null;
    for (const a of pa.filter(p => ['n', 'e', 's', 'w'].includes(p.key))) for (const b of ca.filter(p => ['n', 'e', 's', 'w'].includes(p.key))) {
      const distance = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (!best || distance < best.distance) best = { a, b, distance };
    }
    layer.append(svg('line', { x1: best.a.x, y1: best.a.y, x2: best.b.x, y2: best.b.y, stroke: '#9aa9ad', 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke', 'data-parent': parentId, 'data-child': child.id }));
  }
}
function renderSelection() {
  document.querySelectorAll('.map-node,.canvas-object').forEach(node => {
    const id = node.dataset.nodeId || node.dataset.objectId;
    node.classList.toggle('selected', id === selection);
    if (node.classList.contains('map-node')) node.style.zIndex = id === selection ? 5 : 0;
    node.querySelectorAll('.anchor-point,.resize-handle').forEach(n => n.remove());
    if (id !== selection) return;
    const entity = findEntity(id);
    if (sourceNode(id) || entity.type === 'text') for (const anchor of anchors({ x: 0, y: 0, w: entity.w, h: entity.h })) {
      const dot = element('span', 'anchor-point'); dot.dataset.anchor = anchor.key; dot.style.left = anchor.x + 'px'; dot.style.top = anchor.y + 'px'; node.append(dot);
    }
    node.append(resizeHandle(entity));
  });
  document.querySelectorAll('[data-focus-node]').forEach(node => { const selected = node.dataset.focusNode === selection; node.classList.toggle('active', selected); if (selected) node.setAttribute('aria-current', 'location'); else node.removeAttribute('aria-current'); });
  renderArrows(); updateInspector();
}
function updateInspector() {
  const entity = findEntity(selection), data = sourceNode(selection);
  const isArrow = entity?.type === 'arrow';
  $('#inspector').dataset.selectionType = data ? 'map' : entity?.type || 'none';
  $('#read-map').disabled = !data;
  $('#selection-name').value = data?.name || entity?.name || (entity?.type === 'text' ? '文本框' : entity?.type === 'arrow' ? '箭头' : entity ? '几何形状' : '未选择对象');
  $('#selection-name').disabled = !entity || !!data || entity.type !== 'player';
  $('#object-color').value = entity?.borderColor || entity?.color || palette.color;
  $('#fill-color').value = /^#[a-f0-9]{6}$/i.test(entity?.fill || '') ? entity.fill : palette.fill;
  $('#fill-color').disabled = !!data || !!entity && !['text', 'rect', 'ellipse'].includes(entity.type);
  $('#border-width').value = entity?.borderWidth || palette.borderWidth;
  $('#border-width').disabled = !!data || entity?.type === 'player';
  $('#object-width').value = entity && !isArrow ? Math.round(entity.w) : '';
  $('#object-height').value = entity && !isArrow ? Math.round(entity.h) : '';
  $('#object-width').disabled = !entity || isArrow;
  $('#object-height').disabled = !entity || isArrow || data?.kind === 'image';
  $('#object-text').value = entity?.type === 'text' ? entity.text : '';
  $('#object-text').disabled = entity?.type !== 'text';
  $('#delete').disabled = !entity || !!data;
  $('#bring-front').disabled = !entity || !!data; $('#send-back').disabled = !entity || !!data;
}
function render() { renderNodes(); renderObjects(); drawConnections(); renderSelection(); camera(); updateHistory(); }
function updateGeometry() {
  for (const state of doc.nodes) {
    const node = document.querySelector(`[data-node-id="${CSS.escape(state.id)}"]`);
    if (node) Object.assign(node.style, { left: state.x + 'px', top: state.y + 'px', width: state.w + 'px', height: state.h + 'px' });
  }
  for (const object of doc.objects.filter(o => o.type !== 'arrow')) {
    const node = document.querySelector(`[data-object-id="${CSS.escape(object.id)}"]`);
    if (node) Object.assign(node.style, { left: object.x + 'px', top: object.y + 'px', width: object.w + 'px', height: object.h + 'px' });
  }
  drawConnections(); renderArrows();
}
function snap(point, excludeId) {
  const targets = [...doc.nodes, ...doc.objects.filter(o => o.type === 'text')].filter(n => n.id !== excludeId);
  const result = nearestAnchor(point, targets, 22 / doc.camera.zoom);
  return result ? { nodeId: result.nodeId, anchor: result.anchor } : point;
}
function showSnap(endpoint) {
  if (!endpoint?.nodeId) return;
  const point = resolveEndpoint(endpoint, doc);
  $('#draft').append(svg('circle', { cx: point.x, cy: point.y, r: 9 / doc.camera.zoom, fill: '#e2f8ed', stroke: '#287d66', 'stroke-width': 2 / doc.camera.zoom }));
}
function addObject(type, point) {
  remember();
  const object = { id: uid(type), type, x: point.x, y: point.y, w: type === 'player' ? 40 : 230, h: type === 'player' ? 40 : 100, color: palette.color, fill: type === 'player' ? 'transparent' : palette.fill, borderWidth: palette.borderWidth, fontSize: 18 };
  if (type === 'player') object.name = 'Player';
  if (type === 'text') object.text = '双击此处编辑文本';
  doc.objects.push(object); selection = object.id; renderObjects(); renderSelection();
  setTool('select');
  status(type === 'player' ? 'Player 已放置。左侧可改名和颜色；允许与其他标记同名。' : '已添加文本框。左侧可编辑文字。');
}
function pointerDown(event) {
  if (event.button !== 0 && event.button !== 1 || editable(event.target) || event.target.closest('.node-panels')) return;
  if (event.target.closest('.hotspot,.overview-label')) return;
  const point = pointAt(event);
  const isPan = tool === 'pan' || space || event.button === 1;
  if (isPan) {
    gesture = { type: 'pan', startX: event.clientX, startY: event.clientY, camera: { ...doc.camera }, pointerId: event.pointerId };
  } else if (tool === 'arrow') {
    const endpoint = snap(point);
    if (!arrowStart) { arrowStart = endpoint; showSnap(endpoint); status('起点已确定，点击终点；靠近八个锚点可吸附。'); }
    else {
      const a = resolveEndpoint(arrowStart, doc), b = resolveEndpoint(endpoint, doc);
      if (!a || !b) { arrowStart = null; $('#draft').replaceChildren(); status('吸附目标已变化，请重新选择箭头起点。'); return; }
      if (Math.hypot(a.x - b.x, a.y - b.y) < 4) return;
      remember(); const arrow = { id: uid('arrow'), type: 'arrow', a: arrowStart, b: endpoint, color: palette.color, borderWidth: palette.borderWidth };
      doc.objects.push(arrow); selection = arrow.id; arrowStart = null; $('#draft').replaceChildren(); renderObjects(); renderSelection(); status('箭头已放置。拖动端点可重新吸附。');
    }
    event.preventDefault(); return;
  } else if (['player', 'text'].includes(tool)) { addObject(tool, point); event.preventDefault(); return; }
  else if (['rect', 'ellipse'].includes(tool)) gesture = { type: 'draw', shape: tool, start: point, current: point, before: snapshot(), pointerId: event.pointerId };
  else {
    const arrowHandle = event.target.closest('[data-arrow-handle]');
    const arrow = event.target.closest('[data-arrow-id]');
    const resize = event.target.closest('[data-resize]');
    const object = event.target.closest('[data-object-id]');
    const map = event.target.closest('[data-node-id]');
    const id = resize?.dataset.resize || arrowHandle?.dataset.arrowHandle || object?.dataset.objectId || map?.dataset.nodeId || arrow?.dataset.arrowId;
    selection = id || null; renderSelection();
    if (id) {
      const entity = findEntity(id);
      if (['player', 'text'].includes(entity.type) && lastTap?.id === id && performance.now() - lastTap.time < 450 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 6) {
        lastTap = null; const field = entity.type === 'player' ? $('#selection-name') : $('#object-text');
        event.preventDefault(); field.focus(); field.select(); return;
      }
      if (arrowHandle) gesture = { type: 'endpoint', entity, endpoint: arrowHandle.dataset.endpoint, start: point, before: snapshot(), pointerId: event.pointerId };
      else if (resize) gesture = { type: 'resize', entity, start: point, w: entity.w, h: entity.h, before: snapshot(), pointerId: event.pointerId };
      else if (entity.type !== 'arrow') gesture = { type: 'move', entity, start: point, x: entity.x, y: entity.y, before: snapshot(), pointerId: event.pointerId };
      else return;
    } else gesture = { type: 'pan', startX: event.clientX, startY: event.clientY, camera: { ...doc.camera }, pointerId: event.pointerId };
  }
  event.preventDefault(); viewport.setPointerCapture(event.pointerId);
}
function pointerMove(event) {
  const point = pointAt(event);
  if (!gesture) {
    if (tool === 'arrow' && arrowStart) {
      $('#draft').replaceChildren(); const end = snap(point);
      arrowLine({ a: arrowStart, b: end, color: palette.color }, $('#draft'), 'draft-arrow'); showSnap(arrowStart); showSnap(end);
    }
    return;
  }
  if (gesture.type === 'pan') { doc.camera.x = gesture.camera.x + event.clientX - gesture.startX; doc.camera.y = gesture.camera.y + event.clientY - gesture.startY; camera(); return; }
  const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
  if (gesture.type === 'move') { gesture.entity.x = gesture.x + dx; gesture.entity.y = gesture.y + dy; updateGeometry(); }
  else if (gesture.type === 'resize') {
    const entity = gesture.entity, data = sourceNode(entity.id);
    entity.w = Math.max(data ? 130 : 24, Math.min(4000, gesture.w + dx));
    entity.h = data?.kind === 'image' ? entity.w * data.height / data.width + 32 : Math.max(24, Math.min(4000, gesture.h + dy));
    if (entity.type === 'player') entity.h = entity.w;
    updateGeometry();
  } else if (gesture.type === 'endpoint') {
    gesture.entity[gesture.endpoint] = snap(point); $('#draft').replaceChildren(); showSnap(gesture.entity[gesture.endpoint]); renderArrows();
  } else if (gesture.type === 'draw') {
    gesture.current = point; const x = Math.min(point.x, gesture.start.x), y = Math.min(point.y, gesture.start.y), w = Math.abs(dx), h = Math.abs(dy);
    $('#draft').replaceChildren();
    const attributes = { stroke: palette.color, fill: $('#outline-only').checked ? 'transparent' : palette.fill, 'stroke-width': palette.borderWidth };
    $('#draft').append(gesture.shape === 'rect' ? svg('rect', { x, y, width: w, height: h, ...attributes }) : svg('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, ...attributes }));
  }
}
function pointerUp(event) {
  if (!gesture) return;
  const previous = gesture; gesture = null;
  if (viewport.hasPointerCapture(previous.pointerId)) viewport.releasePointerCapture(previous.pointerId);
  $('#draft').replaceChildren();
  if (previous.type === 'pan') return;
  if (event.type === 'pointercancel') { doc = previous.before; render(); return; }
  if (previous.type === 'draw') {
    const end = previous.current, start = previous.start;
    if (Math.abs(end.x - start.x) < 16 || Math.abs(end.y - start.y) < 16) return;
    const object = { id: uid(previous.shape), type: previous.shape, x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.min(4000, Math.abs(end.x - start.x)), h: Math.min(4000, Math.abs(end.y - start.y)), color: palette.color, fill: $('#outline-only').checked ? 'transparent' : palette.fill, borderWidth: palette.borderWidth };
    doc.objects.push(object); selection = object.id;
  }
  const changed = JSON.stringify(previous.before.nodes) !== JSON.stringify(doc.nodes) || JSON.stringify(previous.before.objects) !== JSON.stringify(doc.objects);
  lastTap = !changed && previous.type === 'move' && ['player', 'text'].includes(previous.entity.type) ? { id: previous.entity.id, time: performance.now(), x: event.clientX, y: event.clientY } : null;
  if (changed) { remember(previous.before); renderObjects(); }
  renderSelection();
  if (changed) status('编辑已保留在当前草稿，保存画布可写入本地文件。');
}
function changeProperty(field, value) {
  const entity = findEntity(selection); if (!entity) return;
  const data = sourceNode(selection); remember();
  if (field === 'w' || field === 'h') {
    entity[field] = Math.max(24, Math.min(4000, Number(value) || 100));
    if (data?.kind === 'image') entity.h = entity.w * data.height / data.width + 32;
    if (entity.type === 'player') entity.h = entity.w;
  } else entity[field] = value;
  render(); status('对象已更新。');
}
async function syncShares() {
  if (moduleData.capabilities?.sharing === false) {
    $('#shares-summary').replaceChildren(element('p', 'panel-hint', '玩家共享暂未启用。此文件可独立离线使用。'));
    return;
  }
  const generation = ++shareGeneration;
  const shares = structuredClone(doc.shares);
  let release;
  const previous = shareQueue;
  shareQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    const response = await request('/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shares }) });
    if (!response.ok) throw Error('共享预览更新失败');
    const result = await response.json(); if (generation !== shareGeneration) return;
    const summary = $('#shares-summary'); summary.replaceChildren(element('p', 'panel-hint', '本机玩家接收预览，仅显示获准图片：'));
    for (const player of result.previews) { const link = element('a', 'player-preview-link', player.name); link.href = player.url; link.target = '_blank'; link.rel = 'noopener'; summary.append(link); }
  } catch (error) { status(error.message + '，共享选择仍保留在草稿。'); }
  finally { release(); }
}
function cancelGesture() {
  if (gesture?.before) doc = gesture.before;
  if (gesture && viewport.hasPointerCapture(gesture.pointerId)) viewport.releasePointerCapture(gesture.pointerId);
  gesture = null; arrowStart = null; $('#draft').replaceChildren();
}
function history(direction) {
  cancelGesture();
  const from = direction === 'undo' ? undoStack : redoStack, to = direction === 'undo' ? redoStack : undoStack;
  if (!from.length) return; to.push(snapshot()); doc = from.pop(); dirty = true;
  if (!findEntity(selection)) selection = null;
  render(); syncControls(); syncShares(); status(direction === 'undo' ? '已撤销。' : '已重做。');
}
function removeSelection() {
  const entity = findEntity(selection); if (!entity || sourceNode(entity.id)) return;
  remember();
  for (const arrow of doc.objects.filter(n => n.type === 'arrow')) for (const key of ['a', 'b']) if (arrow[key].nodeId === entity.id) arrow[key] = resolveEndpoint(arrow[key], doc);
  doc.objects = doc.objects.filter(n => n.id !== selection); selection = null; render(); status('已删除对象，可以撤销。');
}
function saveFile() {
  const validated = validateDocument(doc, moduleData);
  const blob = new Blob([JSON.stringify(validated, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = element('a'); link.href = url; link.download = '风骸岛-地图画布.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); dirty = false; updateHistory(); status('画布文件已交给浏览器下载。下次点“载入画布”恢复。');
}
async function loadFile(file) {
  if (!file) return;
  try {
    if (file.size > 4 * 1024 * 1024) throw Error('画布文件超过4MB');
    const incoming = validateDocument(JSON.parse(await file.text()), moduleData);
    cancelGesture();
    remember(); doc = incoming; selection = null; dirty = false; render(); syncControls(); await syncShares(); status('已从本地文件恢复画布，原模组资料未改变。');
  } catch (error) { status('未载入：' + error.message + '。当前画布保持原样。'); }
  finally { $('#import-file').value = ''; }
}
function syncControls() {
  $('#canvas-color').value = doc.settings.background; $('#grid-mode').value = doc.settings.grid;
  $('#grid-size').value = doc.settings.gridSize; $('#grid-color').value = doc.settings.gridColor;
}
function bind() {
  document.querySelectorAll('[data-tool]').forEach(node => node.addEventListener('click', () => setTool(node.dataset.tool)));
  $('#zoom-in').onclick = () => { zoomAt(doc.camera.zoom * 1.2); renderArrows(); };
  $('#zoom-out').onclick = () => { zoomAt(doc.camera.zoom / 1.2); renderArrows(); };
  $('#fit-all').onclick = fitAll;
  $('#read-map').onclick = () => { const data = sourceNode(selection); if (data) openReader(data); };
  $('#undo').onclick = () => history('undo'); $('#redo').onclick = () => history('redo');
  $('#delete').onclick = removeSelection; $('#save').onclick = () => { try { saveFile(); } catch (error) { status('保存失败：' + error.message); } };
  $('#load').onclick = () => $('#import-file').click(); $('#import-file').onchange = event => loadFile(event.target.files[0]);
  $('#selection-name').onchange = event => changeProperty('name', event.target.value.trim() || 'Player');
  $('#object-text').onchange = event => changeProperty('text', event.target.value);
  $('#object-color').onchange = event => { palette.color = event.target.value; if (selection) changeProperty(sourceNode(selection) ? 'borderColor' : 'color', event.target.value); };
  $('#fill-color').onchange = event => { palette.fill = event.target.value; if (selection) changeProperty('fill', event.target.value); };
  $('#border-width').onchange = event => { palette.borderWidth = Number(event.target.value); if (selection) changeProperty('borderWidth', palette.borderWidth); };
  $('#object-width').onchange = event => changeProperty('w', event.target.value); $('#object-height').onchange = event => changeProperty('h', event.target.value);
  $('#outline-only').onchange = event => { const selected = findEntity(selection); if (selected && ['rect', 'ellipse'].includes(selected.type)) changeProperty('fill', event.target.checked ? 'transparent' : palette.fill); };
  for (const [id, key] of [['canvas-color', 'background'], ['grid-mode', 'grid'], ['grid-size', 'gridSize'], ['grid-color', 'gridColor']]) {
    $('#' + id).addEventListener('change', event => { remember(); doc.settings[key] = key === 'gridSize' ? Number(event.target.value) : event.target.value; camera(); status('画布设置已更新。'); });
  }
  for (const [id, front] of [['bring-front', true], ['send-back', false]]) $('#' + id).onclick = () => {
    const object = doc.objects.find(n => n.id === selection); if (!object) return; remember(); doc.objects = doc.objects.filter(n => n !== object); front ? doc.objects.push(object) : doc.objects.unshift(object); renderObjects(); renderSelection();
  };
  viewport.addEventListener('pointerdown', pointerDown); viewport.addEventListener('pointermove', pointerMove);
  viewport.addEventListener('pointerup', pointerUp); viewport.addEventListener('pointercancel', pointerUp);
  viewport.addEventListener('wheel', event => {
    if (event.target.closest('.node-panels')) return;
    event.preventDefault(); const box = viewport.getBoundingClientRect(); zoomAt(doc.camera.zoom * Math.exp(-event.deltaY * .0015), event.clientX - box.left, event.clientY - box.top); renderArrows();
  }, { passive: false });
  window.addEventListener('keydown', event => {
    if (editable(event.target)) return;
    if (event.code === 'Space') { event.preventDefault(); space = true; viewport.classList.add('space-pan'); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveFile(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); history(event.shiftKey ? 'redo' : 'undo'); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); history('redo'); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelection(); }
    else if (event.key === 'Escape') {
      cancelGesture(); setTool('select'); render();
    } else if (event.key === '+' || event.key === '=') zoomAt(doc.camera.zoom * 1.2);
    else if (event.key === '-') zoomAt(doc.camera.zoom / 1.2);
    else if (event.key === '0') fitAll();
  });
  window.addEventListener('keyup', event => { if (event.code === 'Space') { space = false; viewport.classList.remove('space-pan'); } });
  window.addEventListener('blur', () => { space = false; });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  new ResizeObserver(camera).observe(viewport);
}

try {
  const response = await request('/api/module'); if (!response.ok) throw Error('风骸岛资料读取失败');
  moduleData = await response.json(); doc = createDocument(moduleData); doc.shares ||= {};
  renderDirectory(); bind(); render(); syncControls(); fitAll(); setTool('select'); await syncShares();
  window.mapPreview = {
    getDocument: () => snapshot(), getModule: () => structuredClone(moduleData), focusNode,
    validate: value => validateDocument(value, moduleData), importDocument: async value => { const incoming = validateDocument(value, moduleData); cancelGesture(); remember(); doc = incoming; selection = null; render(); syncControls(); await syncShares(); },
    ready: true
  };
  status(offlineData ? '本地完整版已就绪，无需服务或联网。编辑后请保存画布文件，下次载入恢复。' : '地图已就绪。右侧选地点进入，左侧工具编辑；保存画布后可离线恢复布局。');
} catch (error) { status('无法打开地图：' + error.message); console.error(error); }

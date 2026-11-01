const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 220;
const GAP = 140;
const MAX_POSITION = 100000;
const ANCHORS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const TYPES = new Set(['rect', 'ellipse', 'text', 'arrow', 'player']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const hex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const fail = message => { throw new Error('地图文件无效：' + message); };

function moduleNodes(moduleData) {
  if (!record(moduleData) || !Array.isArray(moduleData.nodes) || !moduleData.nodes.length || moduleData.nodes.length > 500) fail('模组地图目录为空或过大。');
  const moduleId = moduleData.id || moduleData.moduleId;
  if (typeof moduleId !== 'string' || !moduleId || moduleId.length > 160) fail('模组身份缺失或无效。');
  const ids = new Set();
  for (const node of moduleData.nodes) {
    if (!record(node) || typeof node.id !== 'string' || !node.id || ids.has(node.id)) fail('模组地图ID无效或重复。');
    if (!['image', 'text'].includes(node.kind)) fail('模组地图类型无效。');
    ids.add(node.id);
  }
  for (const node of moduleData.nodes) if (node.parentId != null && !ids.has(node.parentId)) fail('模组地图上级不存在。');
  for (const node of moduleData.nodes) {
    const seen = new Set([node.id]);
    let parent = node.parentId;
    while (parent != null) {
      if (seen.has(parent)) fail('模组地图目录包含循环。');
      seen.add(parent);
      parent = moduleData.nodes.find(item => item.id === parent).parentId;
    }
  }
  return moduleData.nodes;
}

function dimensions(node) {
  if (node.kind === 'text') return { w: 280, h: 120 };
  const ratio = finite(node.width) && node.width > 0 && finite(node.height) && node.height > 0 ? node.height / node.width : 0.7;
  const w = Math.min(740, Math.max(380, 600 / Math.max(ratio, 0.7)));
  return { w, h: w * ratio + 32 };
}

const visual = node => ({ w: node.w + PANEL_WIDTH, h: Math.max(node.h, PANEL_HEIGHT) });

function descendants(id, definitions) {
  const children = definitions.filter(node => node.parentId === id);
  return children.flatMap(node => [node, ...descendants(node.id, definitions)]);
}

function branchLayout(top, definitions, direction) {
  const make = definition => ({ id: definition.id, x: 0, y: 0, ...dimensions(definition), borderColor: '#708d99' });
  const root = make(top), descendantsNodes = descendants(top.id, definitions).map(make);
  const rootBox = visual(root);
  if (!descendantsNodes.length) return { nodes: [root], w: rootBox.w, h: rootBox.h };
  const vertical = direction === 'n' || direction === 's';
  const countAcross = Math.min(3, descendantsNodes.length);
  const cellW = Math.max(...descendantsNodes.map(node => visual(node).w)) + 90;
  const cellH = Math.max(...descendantsNodes.map(node => visual(node).h)) + 90;
  const columns = vertical ? countAcross : Math.ceil(descendantsNodes.length / countAcross);
  const rows = vertical ? Math.ceil(descendantsNodes.length / countAcross) : countAcross;
  const gridW = columns * cellW - 90, gridH = rows * cellH - 90;
  const w = vertical ? Math.max(rootBox.w, gridW) : rootBox.w + GAP + gridW;
  const h = vertical ? rootBox.h + GAP + gridH : Math.max(rootBox.h, gridH);
  root.x = vertical ? (w - rootBox.w) / 2 : direction === 'e' ? 0 : w - rootBox.w;
  root.y = vertical ? direction === 's' ? 0 : h - rootBox.h : (h - rootBox.h) / 2;
  descendantsNodes.forEach((node, index) => {
    const col = vertical ? index % columns : Math.floor(index / rows);
    const row = vertical ? Math.floor(index / columns) : index % rows;
    const offsetX = vertical ? (w - gridW) / 2 : direction === 'e' ? rootBox.w + GAP : 0;
    const offsetY = vertical ? direction === 's' ? rootBox.h + GAP : 0 : (h - gridH) / 2;
    node.x = offsetX + col * cellW;
    node.y = offsetY + row * cellH;
  });
  return { nodes: [root, ...descendantsNodes], w, h };
}

export function createDocument(moduleData) {
  const definitions = moduleNodes(moduleData);
  const roots = definitions.filter(node => node.parentId == null);
  if (roots.length !== 1) fail('目录须有一个根地图。');
  const definition = roots[0];
  const root = { id: definition.id, ...dimensions(definition), x: 0, y: 0, borderColor: '#708d99' };
  root.x = -root.w / 2;
  root.y = -root.h / 2;
  const rootBox = visual(root), groups = { e: [], w: [], n: [], s: [] };
  definitions.filter(node => node.parentId === root.id).forEach((node, index) => {
    const direction = ['e', 'w', 'n', 's'][index % 4];
    groups[direction].push(branchLayout(node, definitions, direction));
  });
  const totalHeight = direction => groups[direction].reduce((sum, group) => sum + group.h, 0) + Math.max(0, groups[direction].length - 1) * GAP;
  const sideHeight = Math.max(rootBox.h, totalHeight('e'), totalHeight('w'));
  const nodes = [root];
  for (const direction of ['e', 'w']) {
    let cursor = -totalHeight(direction) / 2;
    for (const group of groups[direction]) {
      const x = direction === 'e' ? root.x + rootBox.w + GAP : root.x - GAP - group.w;
      for (const node of group.nodes) nodes.push({ ...node, x: node.x + x, y: node.y + cursor });
      cursor += group.h + GAP;
    }
  }
  for (const direction of ['n', 's']) {
    const width = groups[direction].reduce((sum, group) => sum + group.w, 0) + Math.max(0, groups[direction].length - 1) * GAP;
    let cursor = root.x + rootBox.w / 2 - width / 2;
    for (const group of groups[direction]) {
      const y = direction === 's' ? sideHeight / 2 + GAP : -sideHeight / 2 - GAP - group.h;
      for (const node of group.nodes) nodes.push({ ...node, x: node.x + cursor, y: node.y + y });
      cursor += group.w + GAP;
    }
  }
  return {
    schemaVersion: 1, moduleId: moduleData.id || moduleData.moduleId,
    nodes, objects: [], shares: {},
    settings: { background: '#edf1f3', grid: 'dots', gridSize: 40, gridColor: '#b9c3c9' },
    camera: { x: 0, y: 0, zoom: 1 }
  };
}

export function anchors(rect) {
  const { x, y, w, h } = rect;
  return [
    { key: 'nw', x, y }, { key: 'n', x: x + w / 2, y }, { key: 'ne', x: x + w, y },
    { key: 'e', x: x + w, y: y + h / 2 }, { key: 'se', x: x + w, y: y + h },
    { key: 's', x: x + w / 2, y: y + h }, { key: 'sw', x, y: y + h }, { key: 'w', x, y: y + h / 2 }
  ];
}

export function nearestAnchor(point, targets, threshold) {
  if (!finite(point?.x) || !finite(point?.y) || !finite(threshold) || threshold < 0) return null;
  let closest = null, distance = threshold;
  for (const target of targets) {
    for (const candidate of anchors(target)) {
      const current = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (current <= distance) {
        closest = { nodeId: target.id, anchor: candidate.key, x: candidate.x, y: candidate.y };
        distance = current;
      }
    }
  }
  return closest;
}

export function resolveEndpoint(endpoint, doc) {
  if (!record(endpoint)) return null;
  if (typeof endpoint.nodeId === 'string') {
    const target = [...(doc.nodes || []), ...(doc.objects || []).filter(item => item.type !== 'arrow')].find(item => item.id === endpoint.nodeId);
    const point = target && anchors(target).find(item => item.key === endpoint.anchor);
    return point ? { x: point.x, y: point.y } : null;
  }
  return finite(endpoint.x) && finite(endpoint.y) ? { x: endpoint.x, y: endpoint.y } : null;
}

export function fitBounds(doc, ids = null) {
  const filter = ids == null ? null : new Set(typeof ids === 'string' ? [ids] : ids);
  const bounds = [];
  for (const node of doc.nodes || []) if (!filter || filter.has(node.id)) {
    const box = visual(node);
    bounds.push({ x: node.x, y: node.y, w: box.w, h: box.h });
  }
  for (const object of doc.objects || []) if (!filter || filter.has(object.id)) {
    if (object.type === 'arrow') {
      const a = resolveEndpoint(object.a, doc), b = resolveEndpoint(object.b, doc);
      if (a && b) bounds.push({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
    } else bounds.push(object);
  }
  if (!bounds.length) return { x: 0, y: 0, w: 1, h: 1 };
  const left = Math.min(...bounds.map(node => node.x));
  const top = Math.min(...bounds.map(node => node.y));
  return {
    x: left, y: top,
    w: Math.max(1, Math.max(...bounds.map(node => node.x + node.w)) - left),
    h: Math.max(1, Math.max(...bounds.map(node => node.y + node.h)) - top)
  };
}

function number(value, field, min = -MAX_POSITION, max = MAX_POSITION) {
  if (!finite(value) || value < min || value > max) fail(field + '超出允许范围。');
  return value;
}

function text(value, field, max, fallback = '') {
  const actual = value === undefined ? fallback : value;
  if (typeof actual !== 'string' || actual.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(actual)) fail(field + '文字无效或过长。');
  return actual;
}

function color(value, field, fallback) {
  const actual = value === undefined ? fallback : value;
  if (!hex(actual)) fail(field + '颜色须为六位十六进制。');
  return actual.toLowerCase();
}

function rectangle(input, label, player = false) {
  return {
    x: number(input.x, label + '横坐标'), y: number(input.y, label + '纵坐标'),
    w: number(input.w ?? (player ? 40 : NaN), label + '宽度', 16, 10000),
    h: number(input.h ?? (player ? 40 : NaN), label + '高度', 16, 10000)
  };
}

function cleanEndpoint(input) {
  if (!record(input)) fail('箭头端点无效。');
  if (Object.hasOwn(input, 'nodeId')) {
    if (typeof input.nodeId !== 'string' || !ANCHORS.includes(input.anchor)) fail('箭头吸附信息无效。');
    return { nodeId: input.nodeId, anchor: input.anchor };
  }
  return { x: number(input.x, '箭头端点横坐标'), y: number(input.y, '箭头端点纵坐标') };
}

export function validateDocument(input, moduleData) {
  const definitions = moduleNodes(moduleData);
  if (!record(input) || input.schemaVersion !== 1 || input.moduleId !== (moduleData.id || moduleData.moduleId)) fail('版本或模组身份不匹配。');
  if (!Array.isArray(input.nodes) || input.nodes.length !== definitions.length) fail('地图数量与模组目录不一致。');
  if (!Array.isArray(input.objects) || input.objects.length > 2000) fail('对象列表无效或超过2000个。');
  const ids = new Set(), moduleIds = new Set(definitions.map(node => node.id));
  const nodes = input.nodes.map(node => {
    if (!record(node) || !moduleIds.has(node.id) || ids.has(node.id)) fail('地图ID缺失、重复或不属于当前模组。');
    ids.add(node.id);
    return { id: node.id, ...rectangle(node, '地图'), borderColor: color(node.borderColor, '地图边框', '#708d99') };
  });
  const objects = input.objects.map(object => {
    if (!record(object) || !TYPES.has(object.type)) fail('对象类型无效。');
    const id = text(object.id, '对象ID', 120);
    if (!id || ids.has(id)) fail('对象ID为空或重复。');
    ids.add(id);
    const clean = { id, type: object.type, color: color(object.color, '对象', '#588ba3') };
    if (object.type === 'arrow') {
      clean.a = cleanEndpoint(object.a); clean.b = cleanEndpoint(object.b);
    } else Object.assign(clean, rectangle(object, '对象', object.type === 'player'));
    if (object.type === 'rect' || object.type === 'ellipse') {
      clean.fill = object.fill === 'transparent' ? 'transparent' : color(object.fill, '对象填充', '#b4d3df');
    }
    if (object.type === 'text') {
      clean.text = text(object.text, '文本框', 20000, '文本');
      clean.fontSize = number(object.fontSize ?? 22, '字号', 8, 200);
      clean.fill = object.fill === 'transparent' ? 'transparent' : color(object.fill, '文本底色', '#ffffff');
    }
    if (object.type === 'player') clean.name = text(object.name, '玩家名字', 200, 'Player');
    if (object.type !== 'player') clean.borderWidth = number(object.borderWidth ?? 2, '线宽', 0, 20);
    return clean;
  });
  const doc = { schemaVersion: 1, moduleId: input.moduleId, nodes, objects, shares: {} };
  for (const object of objects) if (object.type === 'arrow') {
    if (!resolveEndpoint(object.a, doc) || !resolveEndpoint(object.b, doc)) fail('箭头吸附对象不存在。');
  }
  if (!record(input.settings) || !['dots', 'grid', 'none'].includes(input.settings.grid)) fail('画布网格配置无效。');
  doc.settings = {
    background: color(input.settings.background, '画布背景', '#edf1f3'),
    grid: input.settings.grid, gridSize: number(input.settings.gridSize, '网格尺寸', 8, 500),
    gridColor: color(input.settings.gridColor, '网格', '#b9c3c9')
  };
  if (!record(input.camera)) fail('视角配置无效。');
  doc.camera = {
    x: number(input.camera.x, '视角横坐标', -1000000, 1000000),
    y: number(input.camera.y, '视角纵坐标', -1000000, 1000000),
    zoom: number(input.camera.zoom, '视角缩放', 0.01, 8)
  };
  if (input.shares !== undefined && !record(input.shares)) fail('共享清单无效。');
  const players = new Set((moduleData.players || []).map(player => typeof player === 'string' ? player : player.id));
  for (const [id, share] of Object.entries(input.shares || {})) {
    const definition = definitions.find(node => node.id === id);
    if (!definition || definition.kind !== 'image' || !record(share)) fail('共享目标不是图片地图。');
    const variants = new Set((definition.variants || [{ id }]).map(variant => typeof variant === 'string' ? variant : variant.id));
    if (typeof share.variantId !== 'string' || !variants.has(share.variantId)) fail('共享图片版本无效。');
    if (!Array.isArray(share.players) || share.players.length > 100 || new Set(share.players).size !== share.players.length) fail('共享玩家列表无效。');
    if (share.players.some(player => typeof player !== 'string' || !players.has(player))) fail('共享玩家不在测试名单中。');
    Object.defineProperty(doc.shares, id, { value: { variantId: share.variantId, players: [...share.players] }, enumerable: true, configurable: true, writable: true });
  }
  return doc;
}

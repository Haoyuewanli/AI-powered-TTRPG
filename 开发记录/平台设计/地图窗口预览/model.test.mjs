import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, anchors, nearestAnchor, resolveEndpoint, fitBounds, validateDocument } from './model.mjs';

const moduleData = {
  id: 'synthetic-map-module', players: [{ id: 'p1' }, { id: 'p2' }],
  nodes: [
    { id: 'island', name: '主地图', kind: 'image', width: 1000, height: 700, parentId: null, variants: [{ id: 'island-player' }] },
    ...['a', 'b', 'c', 'd', 'grave'].map((id, index) => ({ id, kind: index === 4 ? 'text' : 'image', width: 900, height: 700, parentId: 'island' })),
    ...['a', 'b', 'c', 'd'].flatMap(parentId => Array.from({ length: parentId === 'c' ? 9 : 6 }, (_, i) => ({ id: parentId + i, kind: 'text', parentId })))
  ]
};
const documentWithObjects = () => ({
  ...createDocument(moduleData),
  objects: [
    { id: 'p-1', type: 'player', x: 40, y: 50, w: 40, h: 40, name: 'Player', color: '#aa7733' },
    { id: 'p-2', type: 'player', x: 90, y: 50, w: 40, h: 40, name: 'Player', color: '#4477aa' },
    { id: 'note', type: 'text', x: 10, y: 20, w: 100, h: 100, text: '试验文字', color: '#224466', fontSize: 22 },
    { id: 'link', type: 'arrow', a: { nodeId: 'note', anchor: 'e' }, b: { nodeId: 'island', anchor: 'nw' }, color: '#445566' }
  ],
  shares: { island: { variantId: 'island-player', players: ['p1'] } }
});

test('初始四向布局保留图像比例，附属框预留区域互不覆盖', () => {
  const doc = createDocument(moduleData);
  assert.equal(doc.nodes.length, moduleData.nodes.length);
  assert.equal((doc.nodes[0].h - 32) / doc.nodes[0].w, 0.7);
  assert.deepEqual(validateDocument(doc, moduleData), doc);
  const boxes = doc.nodes.map(node => ({ ...node, w: node.w + 320, h: Math.max(node.h, 220) }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y), a.id + ' overlaps ' + b.id);
  }
  const root = doc.nodes[0];
  assert.equal(root.x + root.w / 2, 0);
  assert.equal(root.y + root.h / 2, 0);
});

test('八个吸附点、阈值及目标移动后端点重新求值', () => {
  const rect = { id: 'box', x: 10, y: 20, w: 100, h: 80 };
  const points = anchors(rect);
  assert.deepEqual(points.map(point => point.key), ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
  for (const point of points) assert.deepEqual(nearestAnchor({ x: point.x + 1, y: point.y }, [rect], 2), { nodeId: 'box', anchor: point.key, x: point.x, y: point.y });
  assert.equal(nearestAnchor({ x: -100, y: -100 }, [rect], 4), null);
  assert.equal(nearestAnchor({ x: 10, y: 20 }, [rect], -1), null);
  const endpoint = { nodeId: 'box', anchor: 's' }, doc = { nodes: [rect], objects: [] };
  assert.deepEqual(resolveEndpoint(endpoint, doc), { x: 60, y: 100 });
  rect.x += 200;
  assert.deepEqual(resolveEndpoint(endpoint, doc), { x: 260, y: 100 });
});

test('存档恢复保留同名标记及共享，丢弃导入的内容和图像字段', () => {
  const input = documentWithObjects();
  input.nodes[0].imageUrl = 'https://untrusted.invalid/secret';
  input.nodes[0].parentId = 'note';
  input.nodes[0].description = '不应覆盖原文';
  input.moduleContent = { fullText: '不应导入' };
  const doc = validateDocument(input, moduleData);
  assert.equal(doc.objects.filter(object => object.type === 'player' && object.name === 'Player').length, 2);
  assert.equal(doc.nodes[0].imageUrl, undefined);
  assert.equal(doc.nodes[0].parentId, undefined);
  assert.equal(doc.nodes[0].description, undefined);
  assert.equal(doc.moduleContent, undefined);
  assert.deepEqual(doc.shares, input.shares);
  assert.deepEqual(resolveEndpoint(doc.objects[3].a, doc), { x: 110, y: 70 });
  assert.equal(input.objects[2].fill, undefined);
});

test('存档拒绝身份错配、重复ID、非法数值和悬空连接', () => {
  const edits = [
    doc => { doc.moduleId = 'other'; },
    doc => { doc.nodes[0].id = doc.nodes[1].id; },
    doc => { doc.nodes.pop(); },
    doc => { doc.nodes[0].x = Infinity; },
    doc => { doc.nodes[0].w = -2; },
    doc => { doc.objects[0].id = doc.nodes[0].id; },
    doc => { doc.objects[3].a.nodeId = 'missing'; },
    doc => { doc.objects[3].a.nodeId = 'link'; },
    doc => { doc.objects[3].b.anchor = 'center'; },
    doc => { doc.objects[0].color = 'red'; },
    doc => { doc.camera.zoom = NaN; },
    doc => { doc.settings.gridSize = 0; },
    doc => { doc.shares.island.players = ['p1', 'p1']; },
    doc => { doc.shares.island.players = ['stranger']; },
    doc => { doc.shares.island.variantId = 'unknown'; },
    doc => { doc.shares.a0 = { variantId: 'a0', players: ['p1'] }; }
  ];
  for (const edit of edits) {
    const input = documentWithObjects(); edit(input);
    assert.throws(() => validateDocument(input, moduleData), /地图文件无效/);
  }
});

test('视野边界包含附属信息框、绘制对象与箭头', () => {
  const doc = documentWithObjects();
  const node = doc.nodes[0], bounds = fitBounds(doc, ['island']);
  assert.deepEqual(bounds, { x: node.x, y: node.y, w: node.w + 320, h: Math.max(node.h, 220) });
  const leaf = doc.nodes.find(item => item.id === 'a0');
  assert.deepEqual(fitBounds(doc, ['a0']), { x: leaf.x, y: leaf.y, w: leaf.w + 320, h: 220 });
  assert.deepEqual(fitBounds(doc, ['note']), { x: 10, y: 20, w: 100, h: 100 });
  assert.deepEqual(fitBounds(doc, ['missing']), { x: 0, y: 0, w: 1, h: 1 });
  doc.objects.push({ id: 'outer-arrow', type: 'arrow', a: { x: -50000, y: -20000 }, b: { x: 60000, y: 50000 }, color: '#445566' });
  assert.deepEqual(fitBounds(doc), { x: -50000, y: -20000, w: 110000, h: 70000 });
  assert.deepEqual(fitBounds(doc, 'outer-arrow'), { x: -50000, y: -20000, w: 110000, h: 70000 });
});

test('导入特殊属性不污染原型，特殊地图ID仍可安全共享', () => {
  const fixture = {
    id: 'prototype-fixture', players: [{ id: 'p1' }],
    nodes: [{ id: '__proto__', kind: 'image', width: 900, height: 700, variants: [{ id: 'player' }] }]
  };
  const input = createDocument(fixture);
  input.shares = JSON.parse('{"__proto__":{"variantId":"player","players":["p1"]}}');
  input.nodes[0] = JSON.parse(JSON.stringify(input.nodes[0]).slice(0, -1) + ',"__proto__":{"polluted":true}}');
  const clean = validateDocument(input, fixture);
  assert.equal(Object.getPrototypeOf(clean.shares), Object.prototype);
  assert.equal(Object.hasOwn(clean.shares, '__proto__'), true);
  assert.deepEqual(clean.shares.__proto__, { variantId: 'player', players: ['p1'] });
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(clean.nodes[0].polluted, undefined);
  assert.equal(Object.hasOwn(clean.nodes[0], '__proto__'), false);
});

test('移除附着文本后拒绝悬空箭头，并保持输入文件原样', () => {
  const input = documentWithObjects();
  input.objects = input.objects.filter(object => object.id !== 'note');
  const before = structuredClone(input);
  assert.throws(() => validateDocument(input, moduleData), /吸附对象不存在/);
  assert.deepEqual(input, before);
  assert.equal(resolveEndpoint({ nodeId: 'link', anchor: 'n' }, input), null);
});

test('模组目录拒绝循环或未知上级，避免布局无限递归', () => {
  const cyclic = structuredClone(moduleData);
  cyclic.nodes[1].parentId = 'a0';
  assert.throws(() => createDocument(cyclic), /循环/);
  const missing = structuredClone(moduleData);
  missing.nodes[1].parentId = 'missing';
  assert.throws(() => createDocument(missing), /上级不存在/);
  const unidentified = structuredClone(moduleData);
  delete unidentified.id;
  assert.throws(() => createDocument(unidentified), /模组身份缺失/);
});

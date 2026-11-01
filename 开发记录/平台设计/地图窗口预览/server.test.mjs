import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startPreview } from './serve.mjs';

const approvedBytes = Buffer.from('synthetic approved player image');
const dmBytes = Buffer.from('SYNTHETIC_DM_IMAGE_SECRET');
const otherBytes = Buffer.from('synthetic unshared second image');

function fixture() {
  return {
    moduleData: {
      id: 'synthetic-service-module', name: '合成地图模组',
      players: [{ id: 'p1', name: '测试甲' }, { id: 'p2', name: '测试乙' }],
      nodes: [
        {
          id: 'island', name: '合成岛屿', kind: 'image', parentId: null, width: 1000, height: 700,
          imageUrl: '/assets/island-dm', description: 'SYNTHETIC_DM_DESCRIPTION_SECRET', sensory: 'SYNTHETIC_DM_SENSORY_SECRET',
          source: { start: 1, end: 2, label: '合成原文' }, hotspots: [],
          variants: [{ id: 'dm', label: '主持图', url: '/assets/island-dm' }, { id: 'player', label: '玩家图', url: '/assets/island-player' }]
        },
        { id: 'room', name: '合成文本地图', kind: 'text', parentId: 'island', description: 'SYNTHETIC_ROOM_SECRET', sensory: '仅主持提词', hotspots: [] },
        {
          id: 'second', name: '合成第二地图', kind: 'image', parentId: 'island', width: 800, height: 500,
          imageUrl: '/assets/second-player', variants: [{ id: 'player', label: '玩家图', url: '/assets/second-player' }]
        }
      ]
    },
    assets: new Map([
      ['island-dm', { bytes: dmBytes, mime: 'image/png' }],
      ['island-player', { bytes: approvedBytes, mime: 'image/png' }],
      ['second-player', { bytes: otherBytes, mime: 'image/png' }]
    ]),
    sources: new Map([['island', 'SYNTHETIC_SOURCE_SECRET\n合成原文片段']])
  };
}

async function appFor(t) {
  const app = await startPreview({ data: fixture(), port: 0 });
  t.after(() => app.close());
  return app;
}

async function postShares(app, shares, extra = {}) {
  return fetch(app.url + '/api/shares', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ shares })
  });
}

async function grant(app) {
  const response = await postShares(app, { island: { variantId: 'player', players: ['p1'] } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert(Array.isArray(body.previews));
  const p1 = body.previews.find(player => player.id === 'p1'), p2 = body.previews.find(player => player.id === 'p2');
  assert(p1 && p2);
  const recipient = preview => {
    const url = new URL(preview.url);
    const token = decodeURIComponent(url.hash.slice(1));
    assert(token.length >= 32);
    assert.notEqual(url.origin, new URL(app.url).origin);
    assert.equal(url.hostname, '127.0.0.1');
    return { url: url.href, origin: url.origin, token };
  };
  return { p1: recipient(p1), p2: recipient(p2) };
}

async function images(recipient) {
  const response = await fetch(recipient.origin + '/api/images', { headers: { Authorization: 'Bearer ' + recipient.token } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(Object.keys(result), ['images']);
  assert(Array.isArray(result.images));
  return result.images.map(path => new URL(path, recipient.origin).href);
}

function requestWithHost(origin, path, host) {
  return new Promise((accept, reject) => {
    const req = request(new URL(path, origin), { headers: { Host: host } }, res => {
      res.resume(); res.on('end', () => accept(res.statusCode));
    });
    req.on('error', reject); req.end();
  });
}

test('主机按白名单读取合成地图、原文和图片，不开放任意本机路径', async t => {
  const app = await appFor(t);
  const response = await fetch(app.url + '/api/module');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
  const data = await response.json();
  assert.equal(data.id, 'synthetic-service-module');
  assert.equal(data.nodes.length, 3);
  const source = await fetch(app.url + '/api/source?node=island');
  assert.equal(source.status, 200);
  assert.match(JSON.stringify(await source.json()), /SYNTHETIC_SOURCE_SECRET/);
  const image = await fetch(app.url + '/assets/island-dm');
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), dmBytes);
  const head = await fetch(app.url + '/assets/island-player', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const path of ['/assets/missing', '/api/source?node=missing', '/AGENTS.md', '/%2e%2e%2fAGENTS.md', '/assets/..%2f..%2fAGENTS.md', '/.env']) {
    const result = await fetch(app.url + path);
    assert([400, 404].includes(result.status), path);
  }
});

test('按接收人提供纯图片清单，另一玩家和未共享地图保持不可见', async t => {
  const app = await appFor(t), recipients = await grant(app);
  const allowed = await images(recipients.p1), empty = await images(recipients.p2);
  assert.equal(allowed.length, 1);
  assert.deepEqual(empty, []);
  const image = await fetch(allowed[0]);
  assert.equal(image.status, 200);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), approvedBytes);
  const body = JSON.stringify(allowed);
  for (const secret of ['SYNTHETIC_', '/assets/', '测试']) assert(!body.includes(secret), secret);
  assert.match(new URL(allowed[0]).pathname, /^\/image\/[A-Za-z0-9_-]{32,}$/);
  assert.equal(new URL(allowed[0]).origin, recipients.p1.origin);
  const html = await fetch(recipients.p1.url);
  assert.equal(html.status, 200);
  assert(!/SYNTHETIC_.*SECRET/.test(await html.text()));
});

test('玩家服务拒绝主持资料、直接资源路径、无效凭据和猜测图片能力', async t => {
  const app = await appFor(t), { p1 } = await grant(app);
  for (const path of ['/api/module', '/api/source?node=island', '/api/shares', '/assets/island-dm', '/assets/island-player', '/app.mjs', '/data.mjs', '/sensory.mjs', '/model.mjs', '/README.md', '/image/not-a-real-capability']) {
    const response = await fetch(p1.origin + path, { headers: { Authorization: 'Bearer ' + p1.token } });
    assert.equal(response.status, 404, path);
    assert(!/SYNTHETIC_.*SECRET/.test(await response.text()), path);
  }
  for (const token of ['', 'forged-token', p1.token.slice(0, -1) + (p1.token.endsWith('a') ? 'b' : 'a')]) {
    const response = await fetch(p1.origin + '/api/images', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    assert([401, 403].includes(response.status));
  }
});

test('撤回后旧图片URL立即失效，原玩家链接的清单也清空', async t => {
  const app = await appFor(t), { p1 } = await grant(app);
  const [oldImage] = await images(p1);
  assert.equal((await fetch(oldImage)).status, 200);
  const response = await postShares(app, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await images(p1), []);
  assert.equal((await fetch(oldImage)).status, 404);
  const newGrant = await grant(app);
  const [newImage] = await images(newGrant.p1);
  assert.equal((await fetch(newImage)).status, 200);
  assert.notEqual(newImage, oldImage);
  assert.equal((await fetch(oldImage)).status, 404);
});

test('非法共享请求整批拒绝，不能分享文本地图或改变已有有效授权', async t => {
  const app = await appFor(t), { p1 } = await grant(app);
  const invalid = [
    { room: { variantId: 'player', players: ['p1'] } },
    { missing: { variantId: 'player', players: ['p1'] } },
    { island: { variantId: 'missing', players: ['p1'] } },
    { island: { variantId: 'player', players: ['stranger'] } },
    { island: { variantId: 'player', players: 'p1' } },
    { island: { variantId: 'player', players: ['p2'] }, second: { variantId: 'missing', players: ['p1'] } }
  ];
  for (const shares of invalid) {
    const response = await postShares(app, shares);
    assert.equal(response.status, 400);
    const allowed = await images(p1);
    assert.equal(allowed.length, 1);
    assert.deepEqual(Buffer.from(await (await fetch(allowed[0])).arrayBuffer()), approvedBytes);
  }
  const prototype = await fetch(app.url + '/api/shares', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: '{"shares":{"__proto__":{"variantId":"player","players":["p1"]}}}'
  });
  assert.equal(prototype.status, 400);
  assert.equal(Object.prototype.players, undefined);
});

test('主机和玩家服务限制Origin、Host及方法，共享请求限制类型和大小', async t => {
  const app = await appFor(t), { p1 } = await grant(app);
  for (const origin of ['https://external.invalid', 'null', p1.origin]) {
    const response = await fetch(app.url + '/api/module', { headers: { Origin: origin } });
    assert.equal(response.status, 403);
  }
  const crossPlayer = await fetch(p1.origin + '/api/images', { headers: { Origin: app.url, Authorization: 'Bearer ' + p1.token } });
  assert.equal(crossPlayer.status, 403);
  for (const origin of [app.url, p1.origin]) {
    const path = origin === app.url ? '/api/module' : '/api/images';
    const foreignHost = await requestWithHost(origin, path, 'external.invalid');
    assert([403, 421].includes(foreignHost));
  }
  assert.equal((await fetch(app.url + '/api/module', { method: 'POST' })).status, 405);
  assert.equal((await fetch(app.url + '/api/shares')).status, 405);
  assert.equal((await fetch(p1.origin + '/api/images', { method: 'POST' })).status, 405);
  const wrongType = await fetch(app.url + '/api/shares', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(wrongType.status, 415);
  const malformed = await fetch(app.url + '/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const tooLarge = await fetch(app.url + '/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shares: {}, padding: 'x'.repeat(270000) }) });
  assert.equal(tooLarge.status, 413);
});

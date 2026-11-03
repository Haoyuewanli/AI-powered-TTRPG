import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, symlink, readdir, rename } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createMapLibraryApi } from '../map-library-api.mjs';
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const { createDocument } = await import(pathToFileURL(join(workspace, '项目/预处理/1. 处理地图/Code/工作台/model.mjs')));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const temporary = join(workspace, '开发记录/临时/地图正式整合'); await mkdir(temporary, { recursive: true }); const root = await mkdtemp(join(temporary, 'http-'));
  const original = new Map(), image = Buffer.from('合成图片文件，不用于浏览器解码');
  const save = async (path, value) => { const target = join(root, path); await mkdir(dirname(target), { recursive: true }); const raw = Buffer.isBuffer(value) ? value : JSON.stringify(value); await writeFile(target, raw); original.set(target, digest(raw)); };
  const packages = new Map();
  for (const moduleId of ['a', 'b']) {
    const moduleData = { id: moduleId, title: '合成' + moduleId, players: [], nodes: [{ id: 'root', name: '根', kind: 'image', parentId: null, width: 100, height: 100, imageUrl: '/assets/image', variants: [{ id: 'dm', label: '原图', url: '/assets/image' }] }, { id: 'room', name: '房间', kind: 'text', parentId: 'root', hotspots: [] }] };
    const pack = { schemaVersion: 1, moduleData, assets: { '/assets/image': { path: '图片/图.png', sha256: digest(image) } } }; packages.set(moduleId, pack);
    await save('模组/' + moduleId + '/模组.json', { id: moduleId, name: '合成' + moduleId }); await save('模组/' + moduleId + '/地图/地图包.json', pack); await save('模组/' + moduleId + '/地图/图片/图.png', image);
    await save('模组/' + moduleId + '/游玩团/run-' + moduleId + '/团.json', { id: 'run-' + moduleId, moduleId, name: '团' + moduleId, characters: [] });
  }
  const options = { root, authorize: request => ({ role: request.headers['x-test-role'] }) }, api = createMapLibraryApi(options), second = createMapLibraryApi(options);
  const server = createServer(async (request, response) => { const send = (status, value) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); }; if (!await (request.headers['x-test-instance'] === '2' ? second : api).handle(request, new URL(request.url, 'http://127.0.0.1'), send)) send(404, {}); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  const request = async (path, body, role = 'dm', extra = {}) => {
    if (body?.moduleId && !Object.hasOwn(body, 'expectedMapPackageSha256') && packages.has(body.moduleId)) body = { ...body, expectedMapPackageSha256: digest(JSON.stringify(packages.get(body.moduleId))) };
    const response = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-test-role': role, ...(body ? { 'content-type': 'application/json' } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, value: await response.json() };
  };
  return { root, packages, save, request, async intact() { for (const [path, hash] of original) assert.equal(digest(await readFile(path)), hash); } };
}
test('地图HTTP目录按真实模组筛选，Player与跨来源请求不获主持资料', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/library/maps')).value.packages.length, 2);
  assert.deepEqual((await f.request('/api/library/maps?modules=b')).value.packages.map(item => item.moduleId), ['b']);
  assert.equal((await f.request('/api/library/maps', undefined, 'player')).status, 403);
  assert.equal((await f.request('/api/library/maps', undefined, 'dm', { origin: 'https://example.com' })).status, 403); await f.intact();
});
test('图片仅按当前模组白名单读取，核对摘要并拒绝路径遍历', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/library/map-asset?moduleId=a&path=/assets/image')).status, 200);
  assert.equal((await f.request('/api/library/map-asset?moduleId=a&path=' + encodeURIComponent('图片/图.png'))).status, 200);
  assert.equal((await f.request('/api/library/map-asset?moduleId=a&path=' + encodeURIComponent('../b/模组.json'))).status, 404);
  await writeFile(join(f.root, '模组/a/地图/图片/图.png'), '已更改');
  assert.equal((await f.request('/api/library/map-asset?moduleId=a&path=/assets/image')).status, 409);
});
test('准备画布和每团画布分别保存，重开HTTP读取恢复且原模组不变', async t => {
  const f = await fixture(t), doc = createDocument(f.packages.get('a').moduleData);
  assert.deepEqual((await f.request('/api/library/canvas?moduleId=a&runId=run-a')).value, { revision: 0, document: null });
  doc.objects.push({ id: 'p', type: 'player', x: 0, y: 0, w: 40, h: 40, name: '同名', color: '#123456' });
  assert.equal((await f.request('/api/library/canvas', { moduleId: 'a', runId: 'run-a', expectedRevision: 0, document: doc })).value.revision, 1);
  assert.equal((await f.request('/api/library/canvas?moduleId=a&runId=run-a')).value.document.objects[0].name, '同名');
  assert.equal((await f.request('/api/library/canvas?moduleId=a&runId=preparation')).value.document, null);
  assert.equal((await f.request('/api/library/canvas', { moduleId: 'a', runId: 'preparation', expectedRevision: 0, document: createDocument(f.packages.get('a').moduleData) })).status, 200);
  assert.equal((await f.request('/api/library/canvas?moduleId=b&runId=run-a')).status, 404); await f.intact();
});
test('乐观版本和跨实例文件锁避免并发覆盖，失败原件不变', async t => {
  const f = await fixture(t), document = createDocument(f.packages.get('a').moduleData), body = { moduleId: 'a', runId: 'run-a', expectedRevision: 0, document };
  const responses = await Promise.all([f.request('/api/library/canvas', body), f.request('/api/library/canvas', body, 'dm', { 'x-test-instance': '2' })]);
  assert.deepEqual(responses.map(item => item.status).sort(), [200, 409]);
  const before = await readFile(join(f.root, '模组/a/游玩团/run-a/画布.json'));
  assert.equal((await f.request('/api/library/canvas', body)).status, 409);
  assert.deepEqual(await readFile(join(f.root, '模组/a/游玩团/run-a/画布.json')), before);
  assert(!(await readdir(join(f.root, '模组/a/游玩团/run-a'))).some(name => name.endsWith('.tmp') || name.endsWith('.lock')));
});
test('画布校验拒绝异模组、缺失地点和悬空箭头，不能通过正文覆盖原图', async t => {
  const f = await fixture(t), base = createDocument(f.packages.get('a').moduleData), save = document => f.request('/api/library/canvas', { moduleId: 'a', runId: 'preparation', expectedRevision: 0, document });
  assert.equal((await save({ ...base, moduleId: 'b' })).status, 400);
  assert.equal((await save({ ...base, nodes: base.nodes.slice(1) })).status, 400);
  assert.equal((await save({ ...base, objects: [{ id: 'bad', type: 'arrow', color: '#123456', borderWidth: 2, a: { nodeId: 'missing', anchor: 'n' }, b: { x: 0, y: 0 } }] })).status, 400);
  const result = await save({ ...base, nodes: base.nodes.map(node => ({ ...node, imageUrl: 'https://example.com', description: '伪造描述' })) });
  assert.equal(result.status, 200); assert.equal(result.value.document.nodes[0].imageUrl, undefined); await f.intact();
});
test('损坏旧档、目录链接与重复模组ID被拒绝，其他正常模组继续显示', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, '模组/a/画布.json'), '坏JSON');
  assert.equal((await f.request('/api/library/canvas?moduleId=a&runId=preparation')).status, 409);
  await symlink(join(f.root, '模组/a'), join(f.root, '模组/linked'), 'junction');
  assert.equal((await f.request('/api/library/maps')).value.packages.length, 2);
  await f.save('模组/duplicate/模组.json', { id: 'a', name: '重复身份' });
  const catalog = (await f.request('/api/library/maps')).value;
  assert.deepEqual(catalog.packages.map(item => item.moduleId), ['b']); assert(catalog.issues.some(item => /重复/.test(item.error)));
});
test('地图包换版拒绝绑定旧团，准备画布须明确重置并保留旧文件备份', async t => {
  const f = await fixture(t), document = createDocument(f.packages.get('a').moduleData), save = runId => f.request('/api/library/canvas', { moduleId: 'a', runId, expectedRevision: 0, document });
  assert.equal((await save('run-a')).status, 200); assert.equal((await save('preparation')).status, 200);
  const runPath = join(f.root, '模组/a/游玩团/run-a/画布.json'), prepPath = join(f.root, '模组/a/画布.json'), oldRun = await readFile(runPath), oldPreparation = await readFile(prepPath);
  const pack = structuredClone(f.packages.get('a')); pack.moduleData.version = 'new-edition'; await f.save('模组/a/地图/地图包.json', pack);
  const changed = await f.request('/api/library/canvas?moduleId=a&runId=run-a'); assert.equal(changed.status, 409); assert.equal(changed.value.code, 'MAP_PACKAGE_CHANGED'); assert.equal(changed.value.canResetPreparation, false);
  assert.equal((await f.request('/api/library/canvas', { moduleId: 'a', runId: 'run-a', expectedRevision: 1, document })).status, 409);
  assert.equal((await f.request('/api/library/canvas', { moduleId: 'a', runId: 'run-a', expectedRevision: 1, resetPreparation: true, expectedMapPackageSha256: changed.value.currentMapPackageSha256 })).status, 409);
  const preparation = await f.request('/api/library/canvas?moduleId=a&runId=preparation'); assert.equal(preparation.status, 409); assert.equal(preparation.value.canResetPreparation, true);
  assert.deepEqual(await readFile(prepPath), oldPreparation); assert.deepEqual(await readFile(runPath), oldRun);
  const reset = await f.request('/api/library/canvas', { moduleId: 'a', runId: 'preparation', expectedRevision: preparation.value.revision, resetPreparation: true, expectedMapPackageSha256: preparation.value.currentMapPackageSha256 });
  assert.equal(reset.status, 200); assert.equal(reset.value.revision, 2); assert.deepEqual(await readFile(join(f.root, reset.value.backupPath)), oldPreparation); assert.deepEqual(await readFile(runPath), oldRun);
  assert.equal((await f.request('/api/library/canvas?moduleId=a&runId=preparation')).status, 200);
});
test('尚无旧画布时也按打开的地图包摘要保存，缺基准或换包首存被拒绝', async t => {
  const f = await fixture(t), document = createDocument(f.packages.get('a').moduleData), body = { moduleId: 'a', runId: 'run-a', expectedRevision: 0, document };
  assert.equal((await f.request('/api/library/canvas', { ...body, expectedMapPackageSha256: null })).status, 409);
  const changed = structuredClone(f.packages.get('a')); changed.moduleData.title = '已换版地图'; await f.save('模组/a/地图/地图包.json', changed);
  assert.equal((await f.request('/api/library/canvas', body)).status, 409);
  assert.equal((await f.request('/api/library/canvas?moduleId=a&runId=run-a')).value.document, null);
});


test('地图跟随模组跨分类移动，移出和损坏模组不会阻断其他地图', async t => {
  const f = await fixture(t);
  await mkdir(join(f.root, '模组/新分类/嵌套'), { recursive: true });
  await rename(join(f.root, '模组/a'), join(f.root, '模组/新分类/嵌套/搬家'));
  assert.equal((await f.request('/api/library/maps')).value.packages.length, 2);
  assert.equal((await f.request('/api/library/map-asset?moduleId=a&path=图片/图.png')).status, 200);
  assert.equal((await f.request('/api/library/canvas?moduleId=a&runId=run-a')).status, 200);
  await rename(join(f.root, '模组/新分类/嵌套/搬家'), join(f.root, '移出'));
  await f.save('模组/坏模组/模组.json', { id: null, name: '坏模组' });
  assert.deepEqual((await f.request('/api/library/maps')).value.packages.map(item => item.moduleId), ['b']);
  assert.equal((await f.request('/api/library/canvas?moduleId=a&runId=run-a')).status, 404);
});

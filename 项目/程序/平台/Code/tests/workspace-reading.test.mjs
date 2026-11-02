import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startPlatform } from '../server.mjs';
import { outputDirectory } from './check-helpers.mjs';

async function fixture() {
  await mkdir(outputDirectory, { recursive: true });
  const root = join(await mkdtemp(join(outputDirectory, 'reading-')), '项目');
  for (const path of ['资源/怪物/M', '模组/预处理/多人短团/合成包', '模组/预处理/空分类']) await mkdir(join(root, path), { recursive: true });
  const original = { id: 'merrow', name: '梅洛 Merrow', aliases: ['人鱼'], tags: ['水生'], edition: { rulesFamily: 'dnd-2024' }, content: { text: '# 梅洛\n\n**默认HP 45**\n\n![图](portrait.png)\n![缺图](absent.png)\n![外部](https://example.invalid/a.png)\n![越界](../../../../outside.png)' } };
  await writeFile(join(root, '资源/怪物/M/梅洛.json'), JSON.stringify(original));
  await writeFile(join(root, '资源/怪物/M/portrait.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLXkAAAAASUVORK5CYII=', 'base64'));
  const snapshot = { id: 'snapshot', name: '梅洛 Merrow', projection: { format: 'battle-resource-v1' }, data: { actor: { hp: 32 } } };
  await writeFile(join(root, '资源/怪物/M/快照.json'), JSON.stringify(snapshot));
  const manifest = { schemaVersion: 1, moduleId: 'synthetic', title: '合成包', source: { kind: 'synthetic' }, maps: [], storyNodes: [], cover: { path: '封面.png', referenceBase: 'package' } };
  const packagePath = join(root, '模组/预处理/多人短团/合成包');
  await writeFile(join(packagePath, '预处理.json'), JSON.stringify(manifest));
  await writeFile(join(packagePath, '封面.png'), await readFile(join(root, '资源/怪物/M/portrait.png')));
  const app = await startPlatform({ port: 0, projectRoot: root, appearanceFile: join(root, '外观.json') });
  const auth = await fetch(app.url + '/api/local-view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'dm' }) }).then(value => value.json());
  const get = async path => { const response = await fetch(app.url + path, { headers: { 'X-Platform-Session': auth.token } }); return { status: response.status, value: await response.json() }; };
  return { root, app, get, original, snapshot, packagePath };
}

test('resource browsing excludes campaign snapshots while direct references and source files stay intact', async () => {
  const { root, app, get, original, snapshot } = await fixture();
  try {
    const found = await get('/api/project/resources?q=Merrow');
    assert.deepEqual(found.value.resources.map(entry => entry.id), ['merrow']);
    assert.equal(found.value.hiddenSnapshots, 1);
    assert.equal((await get('/api/project/resources?q=' + encodeURIComponent('水生'))).value.total, 1);
    assert.equal((await get('/api/project/resources?q=' + encodeURIComponent('人鱼'))).value.total, 1);
    assert.equal((await get('/api/project/read?resourceId=snapshot')).status, 200);
    const read = await get('/api/project/read?resourceId=merrow');
    assert.equal(read.value.images.length, 1); assert.equal(read.value.images[0].source, 'portrait.png');
    assert.equal(read.value.imageIssues.length, 3);
    assert.deepEqual(JSON.parse(await readFile(join(root, '资源/怪物/M/梅洛.json'), 'utf8')), original);
    assert.deepEqual(JSON.parse(await readFile(join(root, '资源/怪物/M/快照.json'), 'utf8')), snapshot);
    const unauth = await fetch(app.url + '/api/project/read?resourceId=merrow'); assert.equal(unauth.status, 403);
  } finally { await app.close(); }
});

test('module catalog exposes actual empty categories and only the selected package cover', async () => {
  const { app, get, packagePath } = await fixture();
  try {
    const before = await readFile(join(packagePath, '预处理.json'));
    const catalog = await get('/api/project/templates');
    assert(catalog.value.categories.includes('空分类'));
    assert.equal(catalog.value.templates[0].category, '多人短团');
    const cover = await get('/api/project/template-cover?templateId=synthetic');
    assert.equal(cover.status, 200); assert.equal(cover.value.mime, 'image/png');
    assert.equal((await get('/api/project/template-cover?templateId=missing')).status, 409);
    const value = JSON.parse(before); value.cover.path = '../../../../outside.png';
    await writeFile(join(packagePath, '预处理.json'), JSON.stringify(value));
    assert.equal((await get('/api/project/template-cover?templateId=synthetic')).status, 409);
  } finally { await app.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, writeFile, stat, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../lib/build.mjs';
import { indexInput } from '../lib/inventory.mjs';
import { sha256 } from '../lib/io.mjs';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url)), workspace = resolve(here, '../../../..');
const temp = join(workspace, '开发记录/临时/地图第一轮'), cli = resolve(here, '../cli.mjs');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png() {
  const chunk = (name, data) => {
    const tag = Buffer.from(name), body = Buffer.concat([tag, data]), size = Buffer.alloc(4), crc = Buffer.alloc(4);
    size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body)); return Buffer.concat([size, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.from([0, 50, 100, 150, 255, 30, 70, 110, 255, 0, 20, 80, 130, 255, 90, 120, 160, 255]);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
async function fixture() {
  await mkdir(temp, { recursive: true });
  const root = await mkdtemp(join(temp, 'build-')), inputDir = join(root, '原始资料');
  await mkdir(join(inputDir, 'images'), { recursive: true });
  const sourceText = '# 灰港\n潮湿的码头，白色灯塔在远处。\n## R1 木屋\n木门闭合，屋里有一盏灯。\n';
  await writeFile(join(inputDir, '原文.md'), sourceText); await writeFile(join(inputDir, 'images/map.png'), png());
  const index = await indexInput({ inputDir, md: '原文.md' });
  const evidence = { method: 'direct-visual', note: '合成2×2地图像素，用于机械检查，不是实际模组审核。' };
  const plan = {
    schemaVersion: 1, module: { id: 'grey-harbor-fixture', title: '灰港合成模组', version: 'test-1' }, source: { mdSha256: index.md.sha256 },
    images: index.images.map(image => ({ path: image.path, sha256: image.sha256, decision: 'map', audience: 'dm', evidence })),
    nodes: [
      { id: 'harbor', parentId: null, name: '灰港', kind: 'image', source: [{ start: 2, end: 2 }], sensory: { text: '码头潮湿，远处可见白色灯塔。', sources: [{ start: 2, end: 2 }] }, variants: [{ id: 'dm', image: 'images/map.png', evidence }], hotspots: [{ label: 'R1', targetId: 'room', x: .5, y: .5, evidence }] },
      { id: 'room', parentId: 'harbor', name: 'R1 木屋', kind: 'text', source: [{ start: 4, end: 4 }], sensory: { text: '木门闭合，进入后可见一盏灯。', sources: [{ start: 4, end: 4 }] }, variants: [], hotspots: [] }
    ]
  };
  return { root, inputDir, md: '原文.md', plan, sourceText, outDir: join(root, '第一轮输出') };
}
async function treeFiles(root, prefix = '') {
  let result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await treeFiles(root, path));
    else result.push(path);
  }
  return result.sort();
}

test('另一部合成模组可生成可搬移地图包及单文件HTML，保留原文和图片', async () => {
  const f = await fixture(), beforeMd = sha256(await readFile(join(f.inputDir, f.md))), beforeImage = sha256(await readFile(join(f.inputDir, 'images/map.png')));
  const beforeNames = await treeFiles(f.inputDir), summary = await buildPackage(f);
  assert.equal(summary.nodes, 2); assert.equal(summary.images, 1); assert.equal(summary.hotspots, 1); assert.deepEqual(summary.pending, []);
  const output = JSON.parse(await readFile(join(f.outDir, '地图包.json'), 'utf8'));
  assert.equal(output.schemaVersion, 1); assert.equal(output.moduleData.id, f.plan.module.id);
  assert.deepEqual(output.moduleData.players, []); assert.equal(output.moduleData.capabilities.sharing, false);
  assert.equal(output.moduleData.nodes[0].description, '潮湿的码头，白色灯塔在远处。');
  assert.equal(output.moduleData.nodes[1].kind, 'text');
  const asset = Object.values(output.assetFiles)[0]; assert.equal(asset.mime, 'image/png');
  assert.equal(sha256(await readFile(join(f.outDir, asset.path))), beforeImage);
  const html = await readFile(join(f.outDir, '地图.html'), 'utf8');
  assert.match(html, /<title>灰港合成模组 · 地图<\/title>/);
  assert(!/<h1>[^<]*风骸/.test(html), '检查版静态品牌不得残留别的模组');
  assert(!/<(?:script|link|img)\b[^>]*(?:src|href)=["'](?:https?:|\/app\.mjs|\/style\.css)/i.test(html));
  assert.match(html, /connect-src 'none'/); assert.match(html, /data:image\/png;base64,/);
  assert.equal(JSON.parse(await readFile(join(f.outDir, '校验.json'), 'utf8')).reviewStatus, 'candidate');
  assert.equal(sha256(await readFile(join(f.inputDir, f.md))), beforeMd);
  assert.equal(sha256(await readFile(join(f.inputDir, 'images/map.png'))), beforeImage);
  assert.deepEqual(await treeFiles(f.inputDir), beforeNames);
});

test('构建拒绝覆盖旧结果，也拒绝写进原始目录或它的父目录', async () => {
  const f = await fixture(); await buildPackage(f);
  const original = sha256(await readFile(join(f.outDir, '地图.html')));
  await assert.rejects(buildPackage(f), /输出已存在/);
  assert.equal(sha256(await readFile(join(f.outDir, '地图.html'))), original);
  await assert.rejects(buildPackage({ ...f, outDir: join(f.inputDir, 'new-output') }), /输出不得位于原始/);
  await assert.rejects(buildPackage({ ...f, outDir: f.root }), /输出不得位于原始/);
  assert.equal(await stat(join(f.inputDir, 'new-output')).then(() => true, () => false), false);
});

test('原文或图片发生变化时拒绝沿用旧计划和来源坐标', async () => {
  const f = await fixture();
  await writeFile(join(f.inputDir, f.md), f.sourceText + '新一行。');
  await assert.rejects(buildPackage(f), /摘要/);
  assert.equal(await stat(f.outDir).then(() => true, () => false), false);
  await writeFile(join(f.inputDir, f.md), f.sourceText);
  const changed = Buffer.from(png()); changed[changed.length - 1] ^= 1;
  await writeFile(join(f.inputDir, 'images/map.png'), changed);
  await assert.rejects(buildPackage(f), /摘要/);
});

test('CLI盘点和模板生成拒绝覆盖原文，正常生成后不覆盖同名输出', async () => {
  const f = await fixture(), original = sha256(await readFile(join(f.inputDir, f.md)));
  const indexPath = join(f.root, 'index.json'), templatePath = join(f.root, 'template.json');
  await exec(process.execPath, [cli, 'index', '--input-dir', f.inputDir, '--md', f.md, '--out', indexPath]);
  await exec(process.execPath, [cli, 'template', '--input-dir', f.inputDir, '--index', indexPath, '--id', 'another-module', '--title', '另一部模组', '--version', 'test', '--out', templatePath]);
  const template = JSON.parse(await readFile(templatePath, 'utf8')); assert.equal(template.module.id, 'another-module'); assert.equal(template.nodes.length, 0); assert.equal(template.images[0].decision, 'pending');
  const templateArgs = [cli, 'template', '--input-dir', f.inputDir, '--index', indexPath, '--id', 'another-module', '--title', '另一部模组', '--version', 'test'];
  for (const target of [join(f.inputDir, f.md), templatePath]) await assert.rejects(exec(process.execPath, [...templateArgs, '--out', target]));
  await assert.rejects(exec(process.execPath, [cli, 'index', '--input-dir', f.inputDir, '--md', f.md, '--out', join(f.inputDir, f.md)]));
  await assert.rejects(exec(process.execPath, [cli, 'index', '--input-dir', f.inputDir, '--md', f.md, '--out', join(f.inputDir, 'new-index.json')]));
  await assert.rejects(exec(process.execPath, [...templateArgs, '--out', join(f.inputDir, 'new-plan.json')]));
  assert.equal(await stat(join(f.inputDir, 'new-index.json')).then(() => true, () => false), false);
  assert.equal(await stat(join(f.inputDir, 'new-plan.json')).then(() => true, () => false), false);
  assert.equal(sha256(await readFile(join(f.inputDir, f.md))), original);
});

test('输出通过junction指向原始目录时，在创建任何子目录之前拒绝', async () => {
  const f = await fixture();
  const alias = join(f.root, 'raw-alias');
  await symlink(f.inputDir, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(buildPackage({ ...f, outDir: join(alias, 'not-created', 'nested', '输出') }), /输入|输出|原始|链接/);
  assert.equal(await stat(join(f.inputDir, 'not-created')).then(() => true, () => false), false);
  await assert.rejects(exec(process.execPath, [cli, 'index', '--input-dir', f.inputDir, '--md', f.md, '--out', join(alias, 'not-created', 'index.json')]));
  assert.equal(await stat(join(f.inputDir, 'not-created')).then(() => true, () => false), false);
});

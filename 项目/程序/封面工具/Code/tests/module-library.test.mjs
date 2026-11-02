import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, access, symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';
import {createModuleLibrary, ModuleLibraryError} from '../src/module-library.mjs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width = 640, height = 360, shade = 120) {
  const chunk = (type, data) => {
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length); output.write(type, 4, 4, 'ascii'); data.copy(output, 8);
    output.writeUInt32BE(crc32(output.subarray(4, data.length + 8)), data.length + 8); return output;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const scan = Buffer.alloc((width * 3 + 1) * height, shade);
  for (let row = 0; row < height; row++) scan[row * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]);
}
function jpegHeader(width = 1280, height = 720) {
  // A small synthetic scan is sufficient for the header/dimension reader; pixel decoding belongs to the browser.
  const sof = Buffer.from([0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]);
  const sos = Buffer.from([0xff, 0xda, 0, 12, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0, 0x25, 0x55, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos]);
}
async function fixture() {
  const temp = fileURLToPath(new URL('../../../../../开发记录/临时/平台模组测试/', import.meta.url));
  await mkdir(temp, {recursive: true});
  const root = await mkdtemp(join(temp, 'covers-'));
  const add = async (group, name, file = '模组封面.png', bytes = png()) => {
    const directory = join(root, group, name); await mkdir(directory, {recursive: true});
    if (file) await writeFile(join(directory, file), bytes);
    return {directory, file, bytes};
  };
  return {root, add, library: createModuleLibrary({root})};
}
const modules = catalog => catalog.groups.flatMap(group => group.modules);
const savePayload = (catalog, module, patch = {}) => ({moduleId: module.id, expectedConfigRevision: catalog.configRevision,
  expectedCoverRevision: module.cover.revision, mode: 'contain', ...patch});
const normalizedCrop = {x: .2890625, y: 0, width: .421875, height: 1};
const isStatus = status => error => error instanceof ModuleLibraryError && error.status === status;

test('prepared modules keep flat cover keys and titles without changing source images', async () => {
  const f = await fixture(), directory = join(f.root, 'prepared-example');
  await mkdir(directory);
  await writeFile(join(directory, '预处理.json'), JSON.stringify({ title: '已核对的示例模组' }));
  await writeFile(join(directory, '模组封面.png'), png());
  let catalog = await f.library.catalog();
  const module = modules(catalog)[0];
  assert.equal(catalog.groups[0].name, '预处理模组');
  assert.equal(module.name, '已核对的示例模组');
  assert.equal(module.relativeDirectory, 'prepared-example');
  catalog = await f.library.saveCrop(savePayload(catalog, module, { mode: 'crop', crop: normalizedCrop }));
  const config = JSON.parse(await readFile(join(f.root, 'cover-crops.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.covers), ['prepared-example']);
  assert.deepEqual(modules(catalog)[0].crop.crop, normalizedCrop);
  assert((await f.library.readCover(module.id)).bytes.equals(png()));
});

test('catalog scans only two levels, reads PNG/JPEG dimensions, uses deterministic cover preference and returns stable IDs', async () => {
  const f = await fixture();
  await f.add('分类A', '横版'); await f.add('分类B', 'JPG', '模组封面.JPG', jpegHeader());
  await f.add('分类A', '缺封面', null);
  await mkdir(join(f.root, '分类A', '横版', '更深目录'), {recursive: true});
  await writeFile(join(f.root, '分类A', '横版', '更深目录', '模组封面.png'), png());
  await writeFile(join(f.root, '分类A', '横版', '模组封面.jpg'), jpegHeader(600, 800));
  await writeFile(join(f.root, '分类A', '横版', 'AGENTS.md'), 'not project instructions');
  const catalog = await f.library.catalog();
  assert.equal(catalog.configIssue, null); assert.equal(catalog.configRevision.length, 64); assert.equal(modules(catalog).length, 3);
  const wide = modules(catalog).find(module => module.name === '横版'), jpg = modules(catalog).find(module => module.name === 'JPG');
  assert.deepEqual(wide.cover, {...wide.cover, width: 640, height: 360, mime: 'image/png', file: '模组封面.png'});
  assert.equal(jpg.cover.width, 1280); assert.equal(jpg.cover.height, 720); assert.equal(jpg.cover.mime, 'image/jpeg');
  assert.equal(modules(catalog).find(module => module.name === '缺封面').cover, null);
  assert.match(modules(catalog).find(module => module.name === '缺封面').issue, /没有找到/);
  assert.equal((await createModuleLibrary({root: f.root}).catalog()).groups[0].modules.find(module => module.name === '横版').id, wide.id);
  await assert.rejects(access(join(f.root, 'cover-crops.json')), {code: 'ENOENT'});
  assert.equal((await f.library.readCover(wide.id)).bytes.equals(png()), true);
});

test('save creates one central JSON, preserves other modules and original image bytes, and honors a configured JPG choice', async () => {
  const f = await fixture();
  const first = await f.add('分类A', '一'), second = await f.add('分类A', '二', '模组封面.jpg', jpegHeader(640, 360));
  let catalog = await f.library.catalog();
  const one = modules(catalog).find(module => module.name === '一'), two = modules(catalog).find(module => module.name === '二');
  catalog = await f.library.saveCrop(savePayload(catalog, one, {mode: 'crop', crop: normalizedCrop}));
  assert.deepEqual(modules(catalog).find(module => module.id === one.id).crop.crop, normalizedCrop);
  catalog = await f.library.saveCrop(savePayload(catalog, modules(catalog).find(module => module.id === two.id)));
  const config = JSON.parse(await readFile(join(f.root, 'cover-crops.json'), 'utf8'));
  assert.equal(config.schemaVersion, 1); assert.deepEqual(config.frameAspectRatio, [3, 4]);
  assert.deepEqual(Object.keys(config.covers).sort(), ['分类A/一', '分类A/二']);
  assert.deepEqual(config.covers['分类A/一'].crop, normalizedCrop); assert.equal(config.covers['分类A/二'].mode, 'contain');
  assert((await readFile(join(first.directory, first.file))).equals(first.bytes));
  assert((await readFile(join(second.directory, second.file))).equals(second.bytes));
  assert.deepEqual((await readdir(f.root)).sort(), ['cover-crops.json', '分类A']);
  await writeFile(join(second.directory, '模组封面.png'), png(600, 800));
  const selected = modules(await f.library.catalog()).find(module => module.id === two.id);
  assert.equal(selected.cover.file, '模组封面.jpg'); assert.equal(selected.cover.width, 640);
});

test('stale configuration and replaced source covers reject writes without changing existing JSON', async () => {
  const f = await fixture(), source = await f.add('组', '模组');
  const before = await f.library.catalog(), module = modules(before)[0];
  await f.library.saveCrop(savePayload(before, module));
  const saved = await readFile(join(f.root, 'cover-crops.json'));
  await assert.rejects(f.library.saveCrop(savePayload(before, module, {mode: 'crop', crop: normalizedCrop})), isStatus(409));
  assert((await readFile(join(f.root, 'cover-crops.json'))).equals(saved));
  const latest = await f.library.catalog();
  await writeFile(join(source.directory, source.file), png(640, 360, 70));
  await assert.rejects(f.library.saveCrop(savePayload(latest, modules(latest)[0])), isStatus(409));
  assert((await readFile(join(f.root, 'cover-crops.json'))).equals(saved));
  const changedSize = await f.library.catalog();
  await writeFile(join(source.directory, source.file), png(300, 400));
  const next = modules(await f.library.catalog())[0];
  assert.equal(next.crop, null); assert.match(next.issue, /尺寸已变化/);
  await assert.rejects(f.library.saveCrop(savePayload(changedSize, modules(changedSize)[0])), isStatus(409));
});

test('malformed, unsupported and unsafe configuration remains byte-for-byte unchanged and blocks saves', async () => {
  const f = await fixture(); await f.add('组', '模组');
  const invalid = ['broken json', JSON.stringify({schemaVersion: 2, frameAspectRatio: [3, 4], covers: {}}),
    JSON.stringify({schemaVersion: 1, frameAspectRatio: [3, 4], covers: {'../outside': {file: '模组封面.png', sourceSize: {width: 640, height: 360}, mode: 'contain'}}}),
    JSON.stringify({schemaVersion: 1, frameAspectRatio: [3, 4], covers: {'组/模组': {file: '../secret.png', sourceSize: {width: 640, height: 360}, mode: 'contain'}}})];
  for (const raw of invalid) {
    await writeFile(join(f.root, 'cover-crops.json'), raw);
    const catalog = await f.library.catalog(); assert(catalog.configIssue); assert(modules(catalog)[0].cover);
    await assert.rejects(f.library.saveCrop(savePayload(catalog, modules(catalog)[0])), isStatus(409));
    assert.equal(await readFile(join(f.root, 'cover-crops.json'), 'utf8'), raw);
  }
});

test('invalid crop, forged file fields and traversal IDs cannot write outside the central configuration', async () => {
  const f = await fixture(); await f.add('组', '模组');
  const catalog = await f.library.catalog(), module = modules(catalog)[0];
  for (const crop of [{...normalizedCrop, x: -.1}, {...normalizedCrop, x: .9}, {x: 0, y: 0, width: 1, height: 1}, {...normalizedCrop, width: NaN}, {...normalizedCrop, extra: 1}]) {
    await assert.rejects(f.library.saveCrop(savePayload(catalog, module, {mode: 'crop', crop})), isStatus(400));
  }
  await assert.rejects(f.library.saveCrop(savePayload(catalog, module, {file: '../outside.json'})), isStatus(400));
  await assert.rejects(f.library.readCover('../outside.png'), isStatus(404));
  await assert.rejects(f.library.readCover('0'.repeat(32)), isStatus(404));
  await assert.rejects(access(join(f.root, 'cover-crops.json')), {code: 'ENOENT'});
  assert.equal((await readdir(f.root)).some(name => name.includes('.tmp') || name === '.cover-crops.lock'), false);
});

test('spoofed MIME, truncated PNG/JPEG and oversized source images are reported without serving their bytes', async () => {
  const f = await fixture();
  await f.add('组', 'SVG伪装', '模组封面.png', Buffer.from('<svg onload="alert(1)"></svg>'));
  await f.add('组', 'PNG伪装JPG', '模组封面.jpg', png());
  await f.add('组', '截断PNG', '模组封面.png', png().subarray(0, 40));
  await f.add('组', '截断JPG', '模组封面.jpg', jpegHeader().subarray(0, -2));
  await f.add('组', '过大图片', '模组封面.png', Buffer.alloc(16 * 1024 * 1024 + 1));
  const catalog = await f.library.catalog(); assert.equal(modules(catalog).length, 5);
  for (const module of modules(catalog)) {
    assert.equal(module.cover, null); assert(module.issue);
    await assert.rejects(f.library.readCover(module.id), error => error instanceof ModuleLibraryError && [400, 413].includes(error.status));
  }
});

test('unknown lock files are preserved, and two library instances cannot overwrite a shared stale revision', async () => {
  const f = await fixture(); await f.add('组', '模组');
  const catalog = await f.library.catalog(), module = modules(catalog)[0], payload = savePayload(catalog, module);
  const alternate = createModuleLibrary({root: f.root});
  const results = await Promise.allSettled([f.library.saveCrop(payload), alternate.saveCrop({...payload, mode: 'crop', crop: normalizedCrop})]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  const config = await readFile(join(f.root, 'cover-crops.json'));
  await writeFile(join(f.root, '.cover-crops.lock'), 'unknown-owner');
  const latest = await f.library.catalog();
  await assert.rejects(f.library.saveCrop(savePayload(latest, modules(latest)[0])), isStatus(423));
  assert.equal(await readFile(join(f.root, '.cover-crops.lock'), 'utf8'), 'unknown-owner');
  assert((await readFile(join(f.root, 'cover-crops.json'))).equals(config));
});

test('missing root and empty libraries are read-only until a valid module is saved', async () => {
  const f = await fixture();
  const missing = join(f.root, 'not-created');
  const result = await createModuleLibrary({root: missing}).catalog();
  assert.deepEqual(result.groups, []); assert.match(result.configIssue, /不存在/);
  await assert.rejects(access(missing), {code: 'ENOENT'});
  const empty = await f.library.catalog(); assert.equal(empty.configIssue, null); assert.deepEqual(empty.groups, []);
  assert.deepEqual(await readdir(f.root), []);
});

test('symlink or junction categories and module directories are not traversed', async t => {
  const f = await fixture(), outside = await fixture(); await outside.add('外部组', '外部模组');
  await mkdir(join(f.root, '正常组'));
  try {
    await symlink(outside.root, join(f.root, '链接分类'), process.platform === 'win32' ? 'junction' : 'dir');
    await symlink(join(outside.root, '外部组', '外部模组'), join(f.root, '正常组', '链接模组'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('当前环境不能创建目录链接'); return; }
    throw error;
  }
  const catalog = await f.library.catalog();
  assert.equal(catalog.groups.some(group => group.name === '链接分类'), false); assert.equal(modules(catalog).length, 0);
  assert.deepEqual(await readdir(outside.root), ['外部组']);
});

test('cover and configuration file links are not read or overwritten', async t => {
  const f = await fixture(), outside = await fixture(); await f.add('组', '模组', null);
  const image = join(outside.root, 'image.png'), config = join(outside.root, 'config.json');
  await writeFile(image, png()); await writeFile(config, '{"schemaVersion":1,"frameAspectRatio":[3,4],"covers":{}}');
  try {
    await symlink(image, join(f.root, '组', '模组', '模组封面.png'), 'file');
    await symlink(config, join(f.root, 'cover-crops.json'), 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('当前环境不能创建文件符号链接'); return; }
    throw error;
  }
  const catalog = await f.library.catalog(); assert(catalog.configIssue); assert.equal(modules(catalog)[0].cover, null);
  await assert.rejects(f.library.readCover(modules(catalog)[0].id), isStatus(403));
  assert.equal(await readFile(config, 'utf8'), '{"schemaVersion":1,"frameAspectRatio":[3,4],"covers":{}}');
});

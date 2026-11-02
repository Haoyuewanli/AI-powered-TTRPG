import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findPdfRuntime, preprocessModule } from '../module-preprocess.mjs';
import { outputDirectory } from './check-helpers.mjs';

const execute = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  let runtime;
  try { runtime = await findPdfRuntime(); } catch (error) { t.skip(error.message); return null; }
  await mkdir(outputDirectory, { recursive: true });
  const directory = await mkdtemp(join(outputDirectory, 'preprocess-'));
  const input = join(directory, 'source.pdf'), image = join(directory, 'map.png');
  const result = await execute(runtime.command, [...runtime.args, '-c',
    'import fitz,json,sys; from pathlib import Path; r=Path(sys.argv[1]); art=fitz.open(); p=art.new_page(width=240,height=160); p.draw_rect(fitz.Rect(2,2,238,158),color=(0,0,0)); p.insert_text((20,40),"ORIGINAL MAP LABEL",fontsize=14); p.get_pixmap().save(r/"map.png"); d=fitz.open(); a=d.new_page(); a.insert_text((40,50),"Synthetic Adventure",fontsize=24); a.insert_text((40,90),"Only a test, no real game progress.",fontsize=10); b=d.new_page(); b.insert_text((40,50),"Test Location",fontsize=20); x=b.insert_image(fitz.Rect(30,80,270,240),filename=str(r/"map.png")); d.save(r/"source.pdf"); print(json.dumps({"xref":x}))', directory],
    { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  return { directory, input, image, xref: JSON.parse(result.stdout).xref, runtimeCandidates: [runtime], original: await readFile(input) };
}
const request = f => ({ inputPath: f.input, outputDirectory: join(f.directory, 'candidate'), moduleId: 'synthetic-module', title: 'Synthetic module', runtimeCandidates: f.runtimeCandidates });

test('missing installed PDF runtime gives an explanation and leaves source/output untouched', async () => {
  await mkdir(outputDirectory, { recursive: true });
  const directory = await mkdtemp(join(outputDirectory, 'preprocess-no-runtime-'));
  const input = join(directory, 'input.pdf'), output = join(directory, 'candidate');
  await writeFile(input, 'unchanged synthetic file');
  await assert.rejects(preprocessModule({ inputPath: input, outputDirectory: output, moduleId: 'test', title: 'test',
    runtimeCandidates: [{ command: join(directory, 'python-not-installed.exe'), args: [] }] }), /未找到可用.*Python.*PyMuPDF/);
  assert.equal(await readFile(input, 'utf8'), 'unchanged synthetic file');
  await assert.rejects(access(output), { code: 'ENOENT' });
});

test('offline PDF extraction preserves source and exact embedded image, all inference remains candidate', async t => {
  const f = await fixture(t); if (!f) return;
  const result = await preprocessModule({ ...request(f), mapSelections: [{ id: 'map-1', name: 'Map', audience: 'dm', pdfPage: 2, xref: f.xref }] });
  const m = result.manifest;
  assert.equal(m.source.sha256, hash(f.original)); assert.equal(m.source.pageCount, 2);
  assert.deepEqual(await readFile(f.input), f.original);
  assert.deepEqual(await readFile(join(result.directory, m.source.relativePath)), f.original);
  assert.equal(m.reviewStatus, 'candidate'); assert.ok(m.storyNodes.length > 0);
  assert.ok(m.storyNodes.every(node => node.verification === 'candidate' && node.description === '' && node.optional === null));
  assert.ok(m.pages.every(page => page.needsOcr === false));
  assert.equal(m.maps[0].source.pdfPage, 2); assert.equal(m.maps[0].resourceId, 'map-1');
  assert.deepEqual(await readFile(join(result.directory, m.maps[0].originalPath)), await readFile(f.image));
  assert.equal(m.maps[0].width, 240); assert.equal(m.maps[0].height, 160);
  assert.equal(m.maps[0].audience, 'dm'); assert.equal(m.maps[0].reviewStatus, 'candidate');
  assert.equal(m.resourceCandidates.length, 0); assert.equal(m.encounterTemplates.length, 0);
  assert.match((await readFile(join(result.directory, m.pages[0].textPath), 'utf8')), /Synthetic Adventure/);
});

test('a different page cannot borrow a map image, failed diagnostics and unchanged source are retained', async t => {
  const f = await fixture(t); if (!f) return;
  await assert.rejects(preprocessModule({ ...request(f), mapSelections: [{ id: 'wrong-page', name: 'Map', audience: 'player', pdfPage: 1, xref: f.xref }] }), /不在给定PDF页/);
  const status = JSON.parse(await readFile(join(f.directory, 'candidate', '处理状态.json'), 'utf8'));
  assert.equal(status.status, 'failed'); assert.equal(status.sourcePreserved, true);
  assert.deepEqual(await readFile(f.input), f.original);
  await assert.rejects(access(join(f.directory, 'candidate', '预处理.json')), { code: 'ENOENT' });
});

test('existing results cannot be overwritten and page limit failure does not alter the PDF', async t => {
  const f = await fixture(t); if (!f) return;
  const options = request(f);
  await mkdir(options.outputDirectory); await writeFile(join(options.outputDirectory, 'user-note.txt'), 'keep');
  await assert.rejects(preprocessModule(options), /输出目录已存在/);
  assert.equal(await readFile(join(options.outputDirectory, 'user-note.txt'), 'utf8'), 'keep');
  await assert.rejects(preprocessModule({ ...options, outputDirectory: join(f.directory, 'limited'), maxPages: 1 }), /页数超过/);
  assert.deepEqual(await readFile(f.input), f.original);
  const status = JSON.parse(await readFile(join(f.directory, 'limited', '处理状态.json'), 'utf8'));
  assert.equal(status.status, 'failed');
});

test('common image input keeps its original copy and does not fabricate story meaning', async t => {
  const f = await fixture(t); if (!f) return;
  const result = await preprocessModule({ ...request(f), inputPath: f.image });
  const m = result.manifest;
  assert.equal(m.source.kind, 'image'); assert.equal(m.source.pageCount, 1);
  assert.equal(m.storyNodes.length, 0); assert.equal(m.maps.length, 0); assert.equal(m.mapCandidates.length, 1);
  assert.equal(m.pages[0].needsOcr, true);
  assert.deepEqual(await readFile(join(result.directory, m.source.relativePath)), await readFile(f.image));
  assert.ok(m.warnings.some(value => value.includes('不联网')));
});

test('unsafe or duplicate IDs are rejected before an output directory is created', async () => {
  await assert.rejects(preprocessModule({ moduleId: '../escape' }), /模组ID/);
  await assert.rejects(preprocessModule({ inputPath: 'test.pdf', outputDirectory: 'not-created', moduleId: 'ok', title: 'ok',
    mapSelections: [{ id: '../escape', name: 'Map', audience: 'dm', pdfPage: 1, xref: 1 }] }), /地图ID/);
  const duplicate = { id: 'same-id', name: 'Map', audience: 'dm', pdfPage: 1, xref: 1 };
  await assert.rejects(preprocessModule({ inputPath: 'test.pdf', outputDirectory: 'not-created', moduleId: 'ok', title: 'ok',
    mapSelections: [duplicate, duplicate] }), /地图ID无效或重复/);
});

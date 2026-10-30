import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('./module-preprocess-helper.py', import.meta.url));
const supported = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value);
const fail = message => { throw new Error(message); };

function run(command, args, { timeout = 120000, maxOutput = 1024 * 1024 } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    let stdout = '', stderr = '', done = false;
    const finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : accept(value); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('PDF处理超时；原文件未改动。')); }, timeout);
    for (const [stream, key] of [[child.stdout, 'out'], [child.stderr, 'err']]) stream.on('data', chunk => {
      if (key === 'out') stdout += chunk.toString('utf8'); else stderr += chunk.toString('utf8');
      if (stdout.length + stderr.length > maxOutput) { child.kill(); finish(new Error('PDF工具输出过长，已停止；原文件未改动。')); }
    });
    child.once('error', error => finish(error));
    child.once('exit', code => finish(code === 0 ? null : new Error((stderr || stdout || `PDF工具退出：${code}`).trim().slice(0, 2000)), { stdout, stderr }));
  });
}

/** Finds an installed interpreter with PyMuPDF; never installs packages. */
export async function findPdfRuntime({ candidates } = {}) {
  const choices = candidates || [
    ...(process.env.RPG_PDF_PYTHON ? [{ command: process.env.RPG_PDF_PYTHON, args: [] }] : []),
    { command: 'python', args: [] }, { command: 'py', args: ['-3'] }, { command: 'python3', args: [] }
  ];
  for (const choice of choices) {
    try {
      const result = await run(choice.command, [...(choice.args || []), '-c',
        'import json,sys,fitz; print(json.dumps({"executable":sys.executable,"pymupdf":fitz.VersionBind}))'], { timeout: 15000, maxOutput: 20000 });
      const details = JSON.parse(result.stdout.trim());
      return { command: choice.command, args: choice.args || [], ...details };
    } catch { /* Try the next installed interpreter. */ }
  }
  throw new Error('未找到可用的本机Python与PyMuPDF。请指定已安装环境的RPG_PDF_PYTHON；程序没有安装软件或修改原PDF。');
}

function selections(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000) fail('地图选择清单须为至多1000项的数组。');
  const ids = new Set();
  return value.map(item => {
    if (!item || !safeId(item.id) || ids.has(item.id)) fail('地图ID无效或重复。');
    ids.add(item.id);
    if (!Number.isInteger(item.pdfPage) || item.pdfPage < 1 || !Number.isInteger(item.xref) || item.xref < 1) fail('地图需给出从1开始的PDF页码及该页嵌入图xref。');
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200 || !['dm', 'player', 'unreviewed'].includes(item.audience)) fail('地图名称或可见范围无效。');
    return { id: item.id, name: item.name.trim(), pdfPage: item.pdfPage, xref: item.xref, audience: item.audience,
      ...(item.printedPage === undefined ? {} : { printedPage: item.printedPage }) };
  });
}

/** Writes only a new candidate directory. Existing directories and source documents are never overwritten. */
export async function preprocessModule({ inputPath, outputDirectory, moduleId, title, mapSelections, runtimeCandidates,
  maxPages = 500, maxImages = 2000, maxPixels = 100000000 } = {}) {
  if (!safeId(moduleId)) fail('模组ID须为1～100位字母、数字、下划线或连字符。');
  if (typeof inputPath !== 'string' || typeof outputDirectory !== 'string') fail('请给出原文件和新输出目录。');
  const input = resolve(inputPath), output = resolve(outputDirectory), extension = extname(input).toLowerCase();
  if (!supported.has(extension)) fail('支持PDF、PNG、JPEG、WebP、BMP和TIFF；其他文件请先转换副本。');
  if (typeof title !== 'string' || !title.trim() || title.length > 200) fail('模组标题须为1～200字。');
  for (const [key, value, maximum] of [['maxPages', maxPages, 2000], ['maxImages', maxImages, 10000], ['maxPixels', maxPixels, 200000000]])
    if (!Number.isInteger(value) || value < 1 || value > maximum) fail(`${key}超过允许范围。`);
  const selected = selections(mapSelections);
  const stat = await lstat(input);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('请选择本机普通文件；不处理目录或文件链接。');
  if (stat.size > 512 * 1024 * 1024) fail('文件超过512MiB，未开始提取。');
  try { await lstat(output); fail('输出目录已存在；请指定新目录，原有结果不会被覆盖。'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const runtime = await findPdfRuntime({ candidates: runtimeCandidates });
  const digest = createHash('sha256').update(await readFile(input)).digest('hex');
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  const sourceDirectory = join(output, extension === '.pdf' ? '原PDF' : '原图');
  const sourceRelative = `${extension === '.pdf' ? '原PDF' : '原图'}/${basename(input)}`;
  const statusPath = join(output, '处理状态.json');
  await writeFile(statusPath, JSON.stringify({ status: 'extracting', moduleId, sourceSha256: digest }, null, 2) + '\n', 'utf8');
  try {
    await mkdir(sourceDirectory);
    await copyFile(input, join(sourceDirectory, basename(input)));
    const copiedDigest = createHash('sha256').update(await readFile(join(sourceDirectory, basename(input)))).digest('hex');
    if (copiedDigest !== digest) fail('原文件在读取期间发生变化；已保留副本，请重新处理。');
    const request = { sourceRelative, sourceSha256: digest,
      moduleId, title: title.trim(), mapSelections: selected, maxPages, maxImages, maxPixels };
    const requestPath = join(output, '提取参数.json');
    // The helper receives a JSON file, not shell-interpolated document text or paths.
    await writeFile(requestPath, JSON.stringify(request, null, 2) + '\n', 'utf8');
    await run(runtime.command, [...runtime.args, helper, requestPath], { timeout: 300000 });
    const manifest = JSON.parse(await readFile(join(output, '预处理.json'), 'utf8'));
    await writeFile(statusPath, JSON.stringify({ status: 'candidate-ready', moduleId, sourceSha256: digest,
      pageCount: manifest.source.pageCount, reviewStatus: 'candidate', pymupdf: runtime.pymupdf }, null, 2) + '\n', 'utf8');
    return { directory: output, manifestPath: join(output, '预处理.json'), manifest };
  } catch (error) {
    await writeFile(statusPath, JSON.stringify({ status: 'failed', moduleId, sourceSha256: digest,
      message: String(error.message).slice(0, 2000), sourcePreserved: true }, null, 2) + '\n', 'utf8').catch(() => {});
    throw new Error(`预处理未完成，原文件未改动；诊断与已提取部分保留在 ${output}。${error.message}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4) {
    process.stderr.write('用法：node module-preprocess.mjs <原PDF或图片> <新输出目录> <moduleId> <标题>\n');
    process.exitCode = 1;
  } else {
    try {
      const result = await preprocessModule({ inputPath: args[0], outputDirectory: args[1], moduleId: args[2], title: args[3] });
      process.stdout.write(JSON.stringify({ manifestPath: result.manifestPath, reviewStatus: 'candidate',
        pageCount: result.manifest.source.pageCount, mapCandidates: result.manifest.mapCandidates.length }) + '\n');
    } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
  }
}

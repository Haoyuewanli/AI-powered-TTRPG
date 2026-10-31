// 输入盘点工具：记录原MD与图片的路径、字节数、SHA256、行号基准、标题层级与图片引用。
// 文件名中的数字只当线索记录，不作为PDF页码。不修改任何输入文件。
//
// 用法：
//   node 开发记录/工具/模组预处理/index-input.mjs \
//     --project-root <工作区/项目> \
//     --input-dir <输入目录绝对路径> \
//     --md <MD文件名> --images <图片子目录名> \
//     --out <输出JSON绝对路径>

import { parseArgs } from 'node:util';
import { basename, join, resolve } from 'node:path';
import { existsFile, imageSize, listFilesSync, sha256OfFile, toProjectRel } from './lib/common.mjs';

const { values } = parseArgs({
  options: {
    'project-root': { type: 'string' },
    'input-dir': { type: 'string' },
    md: { type: 'string' },
    images: { type: 'string' },
    out: { type: 'string' },
  },
});

for (const k of ['project-root', 'input-dir', 'md', 'images', 'out']) {
  if (!values[k]) {
    console.error(`缺少参数 --${k}`);
    process.exit(2);
  }
}

const projectRoot = resolve(values['project-root']);
const inputDir = resolve(values['input-dir']);
const mdAbs = join(inputDir, values.md);
const imagesDir = join(inputDir, values.images);
const outAbs = resolve(values.out);

if (!existsFile(mdAbs)) {
  console.error(`MD 不存在: ${mdAbs}`);
  process.exit(2);
}

const { readFileSync, statSync } = await import('node:fs');

const mdBuf = readFileSync(mdAbs);
const mdSha = await import('node:crypto').then((c) => c.createHash('sha256').update(mdBuf).digest('hex'));
// UTF-8 换行基准：用 \n 切分并保留行号（1 起算）。
const mdText = mdBuf.toString('utf8');
const mdLines = mdText.split('\n');

const headings = [];
const imageRefs = [];
const linkRefs = [];
const nonEmptyLines = [];
const mdRel = toProjectRel(projectRoot, mdAbs);

for (let i = 0; i < mdLines.length; i++) {
  const lineNo = i + 1;
  const text = mdLines[i];
  if (text.trim() !== '') nonEmptyLines.push({ n: lineNo, text });
  const h = /^(#{1,6})\s+(.*)$/.exec(text);
  if (h) headings.push({ level: h[1].length, text: h[2].trim(), line: lineNo });
  // 图片引用：![...](...) 或裸 images/xxx.jpg
  const imgRe = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = imgRe.exec(text)) !== null) {
    imageRefs.push({ line: lineNo, raw: m[0], target: m[1] });
  }
  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
  while ((m = linkRe.exec(text)) !== null) {
    linkRefs.push({ line: lineNo, raw: m[0], target: m[1] });
  }
}

const images = [];
let imageEntries = [];
try {
  imageEntries = (await import('node:fs')).readdirSync(imagesDir, { withFileTypes: true });
} catch {
  console.error(`图片目录不存在: ${imagesDir}`);
  process.exit(2);
}
for (const e of imageEntries) {
  if (!e.isFile()) continue;
  const abs = join(imagesDir, e.name);
  const { sha256, bytes } = sha256OfFile(abs);
  const sz = imageSize(abs);
  images.push({
    name: e.name,
    relativePath: toProjectRel(projectRoot, abs),
    bytes,
    sha256,
    width: sz.width,
    height: sz.height,
    format: sz.format,
  });
}
images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

// 引用目标归一化：去掉 URL 查询与锚点，统一正斜杠。
function normTarget(t) {
  let x = String(t).replace(/[?#].*$/, '');
  x = x.replace(/\\/g, '/');
  x = decodeURIComponent(x);
  return x.replace(/^\.\//, '');
}

const referencedImages = new Set();
for (const r of imageRefs) {
  const base = basename(normTarget(r.target));
  referencedImages.add(base);
}
const imageNames = new Set(images.map((i) => i.name));
const unreferenced = images.filter((i) => !referencedImages.has(i.name)).map((i) => i.name);
const missing = [...referencedImages].filter((n) => !imageNames.has(n));

const nonEmptyCount = nonEmptyLines.length;

const result = {
  tool: 'index-input',
  generatedAt: new Date().toISOString(),
  projectRoot,
  inputDir,
  md: {
    relativePath: mdRel,
    bytes: mdBuf.length,
    sha256: mdSha,
    lineCount: mdLines.length,
    nonEmptyLineCount: nonEmptyCount,
    nonEmptyLines,
    headings,
    imageRefs,
    linkRefs,
    encoding: 'utf-8（按字节读取并以 UTF-8 解码）',
  },
  imagesDir: toProjectRel(projectRoot, imagesDir),
  images,
  imageCount: images.length,
  unreferencedImages: unreferenced,
  missingReferences: missing,
};

await import('node:fs').then((fs) => fs.writeFileSync(outAbs, JSON.stringify(result, null, 2), 'utf8'));
console.log(`已写出 ${outAbs}`);
console.log(`MD: ${mdRel}  ${mdBuf.length} 字节  ${mdLines.length} 行  SHA256=${mdSha.slice(0, 16)}…`);
console.log(`标题 ${headings.length} 个；图片引用 ${imageRefs.length} 处；图片 ${images.length} 张；未引用 ${unreferenced.length} 张；缺失引用 ${missing.length} 个`);
console.log(`非空行 ${nonEmptyCount} 行（行号基准保持原MD的1起算换行切分）`);

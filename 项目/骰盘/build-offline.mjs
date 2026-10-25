import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const files = ['rolls.mjs', 'journal.mjs', 'animation-contract.mjs', 'dice-animation.mjs', 'app.mjs'];

function replaceOnce(source, pattern, replacement, description) {
  if ((source.match(pattern) || []).length !== 1) throw new Error(`离线构建失败：${description}不唯一。`);
  return source.replace(pattern, replacement);
}

export async function buildOffline(output = resolve(root, '命运骰盘.html')) {
  const [template, css, vendor, ...modules] = await Promise.all([
    readFile(resolve(root, 'index.html'), 'utf8'),
    readFile(resolve(root, 'style.css'), 'utf8'),
    readFile(resolve(root, 'node_modules/@3d-dice/dice-box-threejs/dist/dice-box-threejs.umd.js'), 'utf8'),
    ...files.map(file => readFile(resolve(root, 'src', file), 'utf8')),
  ]);
  const licenses = await Promise.all([
    '@3d-dice/dice-box-threejs/LICENSE', 'three/LICENSE', 'cannon-es/LICENSE',
  ].map(async file => `${file}\n${await readFile(resolve(root, 'node_modules', file), 'utf8')}`));

  // This is a fixed entry graph, not a general bundler. New import forms fail closed.
  const source = modules.map((module, index) => {
    const flattened = module.replace(/^import [^\r\n]+ from ['"](\.\/[^'"]+)['"];?\r?$/gm, (statement, dependency) => {
      if (!files.includes(dependency.slice(2))) throw new Error(`离线依赖未列入入口图：${dependency}`);
      return '';
    });
    if (/^\s*import\s/m.test(flattened)) throw new Error(`未识别的离线导入：${files[index]}`);
    return `// src/${files[index]}\n${flattened}`;
  }).join('\n');
  const entryUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  let html = replaceOnce(template, /<link rel="stylesheet" href="\/style\.css">/g,
    () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`, '样式入口');
  html = replaceOnce(html, /<script type="module" src="\/src\/app\.mjs"><\/script>/g,
    () => `<script>${vendor.replace(/<\/script/gi, '<\\/script')}</script>\n` +
      `<script type="module" src="${entryUrl}"></script>`, '脚本入口');
  html = html.replace('</head>', '<meta name="dice-distribution" content="offline-v1">\n</head>');
  html += `\n<!-- Third-party licenses\n${licenses.join('\n\n').replace(/-->/g, '-- >')}\n-->\n`;
  await writeFile(output, html, 'utf8');
  return { output, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await buildOffline();
  console.log(`离线骰盘已生成：${result.output}\n${result.bytes} 字节；SHA-256 ${result.sha256}`);
}

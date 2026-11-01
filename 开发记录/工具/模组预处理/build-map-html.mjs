import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { loadModuleData } from '../../平台设计/地图窗口预览/data.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(directory, '../../..');
const preview = resolve(workspace, '开发记录/平台设计/地图窗口预览');
const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const scriptText = value => value.replace(/<\/script/gi, '<\\/script');
const jsonText = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function replaceOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))];
  if (matches.length !== 1) throw Error('HTML模板的' + label + '不是唯一位置，停止打包');
  return source.replace(pattern, () => replacement);
}

function bundleModel(source) {
  if (/\bimport\s*(?:[({*]|["'])/.test(source)) throw Error('地图模型包含未打包依赖');
  const names = [];
  let body = source.replace(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, (match, name) => {
    names.push(name); return match.replace(/^export\s+/, '');
  });
  body = body.replace(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm, (match, name) => {
    names.push(name); return match.replace(/^export\s+/, '');
  });
  if (!names.length || new Set(names).size !== names.length || /^\s*(?:export|import)\b/m.test(body)) throw Error('地图模型的导出形式不支持单文件打包');
  return 'const __MAP_MODEL__ = (() => {\n' + body + '\nreturn Object.freeze({' + names.join(',') + '});\n})();';
}

function bundleApp(source) {
  const pattern = /^import\s*\{([^}]+)\}\s*from\s*['"]\.\/model\.mjs['"];?\s*$/m;
  const match = source.match(pattern);
  if (!match) throw Error('地图入口的模型引用与打包契约不一致');
  const body = replaceOnce(source, pattern, 'const {' + match[1] + '} = __MAP_MODEL__;', '模型引用');
  if (/^\s*import\b/m.test(body) || /\bimport\s*\(/.test(body)) throw Error('地图入口仍包含未打包依赖');
  return body;
}

export async function buildMapHtml({ projectRoot = resolve(workspace, '项目'), outputPath, sourceMd } = {}) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw Error('请通过 --out 指定要生成的HTML文件');
  const output = resolve(outputPath);
  if (extname(output).toLowerCase() !== '.html') throw Error('输出文件须使用.html扩展名');
  const [{ moduleData, assets, sources }, template, css, model, app] = await Promise.all([
    loadModuleData({ projectRoot: resolve(projectRoot), sourceFile: sourceMd }),
    readFile(resolve(preview, 'index.html'), 'utf8'),
    readFile(resolve(preview, 'style.css'), 'utf8'),
    readFile(resolve(preview, 'model.mjs'), 'utf8'),
    readFile(resolve(preview, 'app.mjs'), 'utf8')
  ]);
  if (!(assets instanceof Map) || !(sources instanceof Map) || !Array.isArray(moduleData.nodes)) throw Error('地图资料格式不符合打包契约');
  if (/<\/style/i.test(css)) throw Error('样式包含HTML结束标签，停止打包');
  const embeddedAssets = Object.create(null);
  for (const [key, asset] of assets) {
    if (!/^image\/(?:png|jpeg|gif|webp|svg\+xml)$/.test(asset.mime)) throw Error('不支持的地图图片格式');
    const bytes = asset.bytes === undefined ? await readFile(asset.path) : Buffer.from(asset.bytes);
    embeddedAssets['/assets/' + key] = 'data:' + asset.mime + ';base64,' + bytes.toString('base64');
  }
  const data = structuredClone(moduleData);
  data.capabilities = { ...data.capabilities, offline: true, sharing: false };
  for (const node of data.nodes) {
    for (const url of [node.imageUrl, ...(node.variants || []).map(variant => variant.url)].filter(Boolean)) {
      if (!Object.hasOwn(embeddedAssets, url)) throw Error('地图图片未包含在资料包中：' + node.id);
    }
  }
  const payload = { moduleData: data, assets: embeddedAssets, sources: Object.fromEntries(sources) };
  const boot = `const __MAP_PAYLOAD__ = JSON.parse(document.getElementById('map-offline-data').textContent);
for (const node of __MAP_PAYLOAD__.moduleData.nodes) {
  if (node.imageUrl) node.imageUrl = __MAP_PAYLOAD__.assets[node.imageUrl];
  for (const variant of node.variants || []) variant.url = __MAP_PAYLOAD__.assets[variant.url];
}
window.__MAP_OFFLINE__ = { moduleData: __MAP_PAYLOAD__.moduleData, sources: __MAP_PAYLOAD__.sources };
`;
  const source = scriptText(boot + '\n' + bundleModel(model) + '\n' + bundleApp(app));
  let html = replaceOnce(template, /<title>[^<]*<\/title>/, '<title>风骸岛地图 · 本地完整版</title>', '页面标题');
  html = replaceOnce(html, /<meta\s+charset="utf-8"\s*>/i, '<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="' + csp + '">', '安全策略');
  html = replaceOnce(html, /<link\s+rel="stylesheet"\s+href="\/style\.css"\s*>/, '<style>\n' + css.replace(/^\s*@charset\s+"UTF-8";\s*/i, '') + '\n</style>', '样式入口');
  html = replaceOnce(html, /<span class="demo-badge">[^<]*<\/span>/, '<span class="demo-badge">单文件离线版</span>', '演示标记');
  html = replaceOnce(html, /<script\s+type="module"\s+src="\/app\.mjs"\s*><\/script>/, '<script type="application/json" id="map-offline-data">' + jsonText(payload) + '</script>\n<script type="module">\n' + source + '\n</script>', '脚本入口');
  if (/<(?:script|link)\b[^>]*(?:src|href)\s*=/i.test(html)) throw Error('单文件产物仍引用外部脚本或样式');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html, { encoding: 'utf8', flag: 'wx' });
  return {
    path: output, bytes: Buffer.byteLength(html), nodes: data.nodes.length,
    imageMaps: data.nodes.filter(node => node.kind === 'image').length,
    assets: assets.size, hotspots: data.nodes.reduce((count, node) => count + (node.hotspots?.length || 0), 0),
    sha256: createHash('sha256').update(html).digest('hex')
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const values = Object.create(null);
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index], value = args[index + 1];
      if (!['--out', '--project-root', '--source-md'].includes(key) || !value || value.startsWith('--') || Object.hasOwn(values, key)) throw Error('参数格式：--out <HTML路径> [--project-root <项目根>] [--source-md <原文路径>]');
      values[key] = value;
    }
    console.log(JSON.stringify(await buildMapHtml({ outputPath: values['--out'], projectRoot: values['--project-root'], sourceMd: values['--source-md'] }), null, 2));
  } catch (failure) {
    console.error(failure.code === 'EEXIST' ? '目标文件已经存在，未覆盖：' + failure.path : failure.message);
    process.exitCode = 1;
  }
}

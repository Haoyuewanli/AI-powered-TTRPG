import { readFile } from 'node:fs/promises';
const root = new URL('../工作台/', import.meta.url);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function once(source, pattern, replacement) {
  if ([...source.matchAll(new RegExp(pattern.source, 'gm'))].length !== 1) throw Error('工作台模板入口不唯一');
  return source.replace(pattern, () => replacement);
}
export async function renderHtml({moduleData,assets,sources}) {
  const [template, css, model, app] = await Promise.all(['index.html','style.css','model.mjs','app.mjs'].map(name => readFile(new URL(name,root),'utf8')));
  const exports = [...model.matchAll(/^export\s+function\s+(\w+)/gm)].map(m => m[1]);
  const body = model.replace(/^export\s+/gm,'');
  if (!exports.length || /^\s*(?:import|export)\b/m.test(body)) throw Error('模型依赖未打包');
  const application = once(app, /^import\s*\{([^}]+)\}\s*from\s*['"]\.\/model\.mjs['"];?\s*$/m, 'const { createDocument, anchors, nearestAnchor, resolveEndpoint, validateDocument, fitBounds } = __MODEL__;');
  if (/^\s*import\b/m.test(application) || /<\/style/i.test(css)) throw Error('不支持的工作台依赖');
  const embedded = Object.fromEntries([...assets].map(([key,asset]) => [key,'data:'+asset.mime+';base64,'+asset.bytes.toString('base64')]));
  const payload = {moduleData,assets:embedded,sources};
  const boot = `const payload=JSON.parse(document.getElementById('map-offline-data').textContent);
for(const n of payload.moduleData.nodes){if(n.imageUrl)n.imageUrl=payload.assets[n.imageUrl];for(const v of n.variants||[])v.url=payload.assets[v.url]}
window.__MAP_OFFLINE__={moduleData:payload.moduleData,sources:payload.sources};
document.title=payload.moduleData.title+' · 地图';
document.querySelector('.brand-copy h1').textContent=payload.moduleData.title+' · 地图工作台';
const __MODEL__=(()=>{${body}\nreturn {${exports.join(',')}}})();
${application}`.replace(/<\/script/gi,'<\\/script');
  const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  let html=once(template, /<title>[^<]*<\/title>/, '<title>'+escapeHtml(moduleData.title)+' · 地图</title>');
  html=once(html, /<h1>[^<]*<\/h1>/, '<h1>'+escapeHtml(moduleData.title)+' · 地图工作台</h1>');
  html=once(html, /<meta charset="utf-8">/, '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">');
  html=once(html, /<link rel="stylesheet" href="\/style\.css">/, '<style>'+css.replace(/^\s*@charset[^;]+;/,'')+'</style>');
  html=once(html, /<script type="module" src="\/app\.mjs"><\/script>/, '<script type="application/json" id="map-offline-data">'+json(payload)+'</script><script type="module">'+boot+'</script>');
  return html.replace('本机 HTML 演示','第一轮地图检查版');
}

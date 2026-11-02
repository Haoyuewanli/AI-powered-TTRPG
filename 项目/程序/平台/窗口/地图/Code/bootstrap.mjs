const CHANNEL = 'ttrpg-map-workbench-v1';
const bridge = new URLSearchParams(location.search).get('bridge');
const pending = new Map(); let serial = 0;
function parentRequest(type, payload) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('平台地图连接超时，当前草稿保留。')); }, 20000);
    pending.set(id, { resolve, reject, timer });
    parent.postMessage({ channel: CHANNEL, bridge, id, type, payload }, location.origin);
  });
}
window.addEventListener('message', event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.channel !== CHANNEL || event.data.bridge !== bridge) return;
  const result = event.data, entry = pending.get(result.id); if (!entry) return;
  pending.delete(result.id); clearTimeout(entry.timer);
  result.error ? entry.reject(new Error(result.error)) : entry.resolve(result.value);
});
try {
  const html = await fetch('/map-workbench/index.html', { cache: 'no-store' });
  if (!html.ok) throw new Error('工作台模板未找到');
  const parsed = new DOMParser().parseFromString(await html.text(), 'text/html');
  document.body.replaceChildren(...[...parsed.body.children].filter(node => node.tagName !== 'SCRIPT'));
  const boot = await parentRequest('bootstrap');
  document.querySelector('.brand-copy h1').textContent = boot.moduleData.title + ' · 地图';
  const context = document.createElement('span'); context.className = 'platform-map-context'; context.textContent = boot.contextLabel;
  document.querySelector('.brand-copy').append(context);
  const reset = document.createElement('button'); reset.id = 'reset-canvas'; reset.type = 'button'; reset.className = 'platform-map-reset'; reset.textContent = '重置'; reset.title = '恢复默认布置，可撤销；保存后写入本地文件';
  document.querySelector('.file-actions').insertBefore(reset, document.getElementById('load'));
  document.getElementById('redo').title = '恢复（Ctrl+Y）';
  document.getElementById('redo').textContent = '↷ 恢复';
  const help = document.querySelector('#help-guide ul');
  if (help) for (const item of help.children) {
    item.textContent = item.textContent.replace('Ctrl+Shift+Z重做', 'Ctrl+Y重做').replace('保存画布会下载本地文件，之后用“载入”恢复。', '保存画布写入当前模组和团的本地文件；载入只导入为草稿。');
  }
  window.__MAP_WORKBENCH_ADAPTER__ = {
    initialDocument: boot.document,
    initialDirty: boot.dirty,
    request: async path => {
      if (path === '/api/module') return { ok: true, json: async () => structuredClone(boot.moduleData) };
      if (path.startsWith('/api/source?')) {
        const id = new URLSearchParams(path.split('?')[1]).get('node');
        const text = boot.sources?.[id];
        return { ok: typeof text === 'string', json: async () => ({ text: text || '来源摘录未随地图包提供。' }) };
      }
      throw new Error('地图共享尚未启用');
    },
    save: document => parentRequest('save', { document }),
    onChange: value => parent.postMessage({ channel: CHANNEL, bridge, type: 'change', payload: value }, location.origin),
    onViewChange: value => parent.postMessage({ channel: CHANNEL, bridge, type: 'change', payload: value }, location.origin),
    onReady: controller => {
      reset.onclick = () => controller.resetDocument();
      document.getElementById('load').textContent = '导入草稿';
      parent.postMessage({ channel: CHANNEL, bridge, type: 'ready' }, location.origin);
    }
  };
  await import('/map-workbench/app.mjs');
} catch (error) {
  const status = document.getElementById('status') || document.body; status.textContent = '无法打开地图：' + error.message;
  parent.postMessage({ channel: CHANNEL, bridge, type: 'error', payload: { message: error.message } }, location.origin);
}

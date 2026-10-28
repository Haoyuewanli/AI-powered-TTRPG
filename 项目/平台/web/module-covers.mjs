const $ = id => document.getElementById(id);
const token = sessionStorage.getItem('battle-session') || '';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
const node = (tag, value, className) => {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
};

let catalog = null, groupId = null, selectedId = null, selectionEpoch = 0, catalogEpoch = 0;
let source = null, draft = null, editorModule = null, saving = false, conflict = false, editorEpoch = 0;
let observer, loadCount = 0, groupIndicator;
let imageEpoch = 0;
const pendingImages = [], imageCache = new Map();
const group = () => catalog?.groups.find(item => item.id === groupId);
const modules = () => group()?.modules || [];
const selected = () => modules().find(item => item.id === selectedId);
const findModule = id => catalog?.groups.flatMap(item => item.modules).find(item => item.id === id);
const setText = (id, value) => { $(id).textContent = value || ''; };
const showError = (id, value = '') => { setText(id, value); $(id).hidden = !value; };

function requireSession(message) {
  catalog = null; selectionEpoch++; catalogEpoch++; editorEpoch++;
  imageEpoch++; imageCache.clear();
  for (const item of pendingImages.splice(0)) item.reject(new Error('会话已结束，请返回跑团程序。'));
  $('module-groups').replaceChildren(); $('module-track').replaceChildren();
  $('library-content').hidden = true; $('auth-required').hidden = false;
  $('refresh-catalog').disabled = true;
  if ($('crop-dialog').open) $('crop-dialog').close();
  showError('tool-error', message || '请返回跑团程序，以本机 DM 身份进入后再打开此工具。');
  setText('tool-status', '此工具仅供本机 DM 使用。');
}

async function request(path, body, image = false) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    const error = Object.assign(new Error(value.error || '本地读取或保存失败，请刷新后核对。'), { status: response.status });
    if (response.status === 401 || response.status === 403) requireSession(error.message);
    throw error;
  }
  return image ? response.blob() : response.json();
}

const readDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => resolve(reader.result), { once: true });
  reader.addEventListener('error', () => reject(new Error('封面图片读取失败。')), { once: true });
  reader.readAsDataURL(blob);
});
const decodeImage = url => new Promise((resolve, reject) => {
  const image = new Image();
  image.addEventListener('load', () => resolve(image), { once: true });
  image.addEventListener('error', () => reject(new Error('浏览器无法显示这张封面。')), { once: true });
  image.src = url;
});

function queueImage(task) {
  return new Promise((resolve, reject) => { pendingImages.push({ task, resolve, reject }); pumpImages(); });
}
function pumpImages() {
  while (loadCount < 3 && pendingImages.length) {
    const item = pendingImages.shift(); loadCount++;
    Promise.resolve().then(item.task).then(item.resolve, item.reject).finally(() => { loadCount--; pumpImages(); });
  }
}
async function loadImage(module) {
  if (!module.cover) throw new Error('此模组没有可读取的封面。');
  const key = `${module.id}:${module.cover.revision}`;
  if (imageCache.has(key)) return imageCache.get(key);
  const epoch = imageEpoch;
  const promise = queueImage(async () => {
    const visible = [...$('module-track').querySelectorAll('button')].some(button => button.dataset.moduleId === module.id && button.dataset.visible === 'true');
    if (epoch !== imageEpoch || findModule(module.id)?.cover?.revision !== module.cover.revision || selectedId !== module.id && editorModule?.id !== module.id && !visible) throw new Error('封面读取已取消。');
    const blob = await request(`/api/module-covers/image?moduleId=${encodeURIComponent(module.id)}`, undefined, true);
    const url = await readDataUrl(blob), image = await decodeImage(url);
    if (epoch !== imageEpoch) throw new Error('会话已结束，请返回跑团程序。');
    return { url, image, width: image.naturalWidth, height: image.naturalHeight };
  });
  imageCache.set(key, promise);
  while (imageCache.size > 8) imageCache.delete(imageCache.keys().next().value);
  promise.catch(() => { if (imageCache.get(key) === promise) imageCache.delete(key); });
  return promise;
}

function croppedUrl(module, original) {
  const entry = module.crop;
  if (entry?.mode !== 'crop' || !entry.crop || entry.sourceSize?.width !== original.width || entry.sourceSize?.height !== original.height) return original.url;
  const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 400;
  const rect = entry.crop;
  canvas.getContext('2d').drawImage(original.image, rect.x * original.width, rect.y * original.height,
    rect.width * original.width, rect.height * original.height, 0, 0, 300, 400);
  return canvas.toDataURL('image/png');
}

async function loadThumbnail(button, module) {
  const image = button.querySelector('img'), placeholder = button.querySelector('.mc-no-image');
  if (!module.cover) return;
  try {
    const original = await loadImage(module);
    if (!button.isConnected || button.dataset.visible !== 'true' || findModule(module.id)?.cover?.revision !== module.cover.revision) return;
    image.src = croppedUrl(module, original); image.hidden = false; placeholder.hidden = true;
    button.dataset.loaded = 'true';
  } catch (error) {
    if (button.isConnected && button.dataset.visible === 'true') { placeholder.textContent = error.message; image.hidden = true; placeholder.hidden = false; }
  }
}

function updateGroupIndicator() {
  if (!groupIndicator) return;
  const button = [...$('module-groups').querySelectorAll('button')].find(item => item.dataset.groupId === groupId);
  if (!button) return;
  groupIndicator.style.width = button.offsetWidth + 'px';
  groupIndicator.style.transform = `translateX(${button.offsetLeft}px)`;
}

function renderGroups() {
  const root = $('module-groups'); root.replaceChildren();
  groupIndicator = node('span', undefined, 'mc-group-indicator'); groupIndicator.setAttribute('aria-hidden', 'true'); root.append(groupIndicator);
  for (const item of catalog.groups) {
    const button = node('button', item.name); button.type = 'button'; button.dataset.groupId = item.id;
    button.setAttribute('aria-pressed', String(item.id === groupId));
    button.addEventListener('click', () => { groupId = item.id; selectedId = item.modules[0]?.id || null; renderGroups(); renderModules(); });
    root.append(button);
  }
  root.hidden = !catalog.groups.length;
  requestAnimationFrame(updateGroupIndicator);
}

function renderModules() {
  observer?.disconnect();
  const track = $('module-track'); track.replaceChildren();
  const list = modules();
  $('empty-library').hidden = list.length > 0;
  $('module-navigation').hidden = !list.length;
  $('module-detail').hidden = !list.length;
  if (!list.some(item => item.id === selectedId)) selectedId = list[0]?.id || null;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      entry.target.dataset.visible = String(entry.isIntersecting);
      if (entry.isIntersecting) {
        const module = list.find(item => item.id === entry.target.dataset.moduleId);
        if (module) loadThumbnail(entry.target, module);
      } else {
        const image = entry.target.querySelector('img'), placeholder = entry.target.querySelector('.mc-no-image');
        image.removeAttribute('src'); image.hidden = true; placeholder.hidden = false;
        const module = list.find(item => item.id === entry.target.dataset.moduleId);
        placeholder.textContent = module?.cover ? '正在读取封面…' : '未找到封面';
        delete entry.target.dataset.loaded;
      }
    }
  }, { root: track, rootMargin: '0px 100px' });
  for (const module of list) {
    const button = node('button', undefined, 'mc-cover'); button.type = 'button'; button.dataset.moduleId = module.id;
    button.setAttribute('aria-pressed', String(module.id === selectedId));
    const box = node('span', undefined, 'mc-image-box'), image = document.createElement('img');
    image.alt = `${module.name}封面`; image.hidden = true; image.draggable = false;
    const placeholder = node('span', module.cover ? '正在读取封面…' : '未找到封面', 'mc-no-image');
    box.append(image, placeholder); button.append(box, node('span', module.name, 'mc-cover-name'));
    button.addEventListener('click', () => selectModule(module.id, false));
    track.append(button); observer.observe(button);
  }
  selectModule(selectedId, false);
}

async function selectModule(id, scroll = true, focus = false) {
  const module = modules().find(item => item.id === id), epoch = ++selectionEpoch;
  selectedId = module?.id || null; source = null;
  const list = modules(), index = list.indexOf(module);
  for (const button of $('module-track').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.moduleId === selectedId));
  setText('module-position', list.length ? `${index + 1} / ${list.length}` : '');
  $('previous-module').disabled = list.length < 2; $('next-module').disabled = list.length < 2;
  $('open-crop').disabled = true;
  if (!module) { $('module-detail').hidden = true; return; }
  $('module-detail').hidden = false; setText('module-name', module.name);
  setText('module-description', module.cover ? `${module.relativeDirectory} · ${module.cover.file} · ${module.cover.width}×${module.cover.height}` : module.relativeDirectory);
  showError('module-issue', module.issue || '');
  const button = [...$('module-track').querySelectorAll('button')].find(item => item.dataset.moduleId === selectedId);
  if (scroll && button) button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'instant' : 'smooth' });
  if (focus && button) button.focus({ preventScroll: true });
  if (!module.cover) return;
  try {
    const loaded = await loadImage(module);
    if (epoch !== selectionEpoch || selectedId !== id || !catalog) return;
    source = loaded;
    const mismatch = loaded.width !== module.cover.width || loaded.height !== module.cover.height;
    if (mismatch) showError('module-issue', '图片方向或尺寸与文件信息不一致，请先另存为普通PNG/JPG再裁切。');
    $('open-crop').disabled = !!catalog.configIssue || mismatch;
  } catch (error) { if (epoch === selectionEpoch) showError('module-issue', error.message); }
}

function stepModule(delta, focus = false) {
  const list = modules(); if (!list.length) return;
  const index = list.findIndex(item => item.id === selectedId);
  selectModule(list[((index + delta) % list.length + list.length) % list.length].id, true, focus);
}

function adoptCatalog(value) {
  catalog = value; $('library-content').hidden = false; $('auth-required').hidden = true;
  if (!value.groups.some(item => item.id === groupId)) groupId = value.groups[0]?.id || null;
  setText('module-root', value.root); setText('config-file', value.configFile);
  const total = value.groups.reduce((sum, item) => sum + item.modules.length, 0);
  setText('tool-status', `已读取 ${value.groups.length} 个分类、${total} 个模组。`);
  showError('tool-error', value.configIssue || '');
  renderGroups(); renderModules();
}

async function refreshCatalog() {
  const epoch = ++catalogEpoch; $('refresh-catalog').disabled = true;
  showError('tool-error'); setText('tool-status', '正在重新读取模组目录…');
  try { const value = await request('/api/module-covers'); if (epoch === catalogEpoch) adoptCatalog(value); }
  catch (error) { if (epoch === catalogEpoch) { showError('tool-error', error.message); setText('tool-status', '目录未更新，请核对后重试。'); } }
  finally { if (epoch === catalogEpoch && token) $('refresh-catalog').disabled = false; }
}

function cropRect() {
  const width = Math.min(source.width, source.height * .75) / draft.zoom, height = width / .75;
  return { x: (source.width - width) * draft.x / 100 / source.width, y: (source.height - height) * draft.y / 100 / source.height, width: width / source.width, height: height / source.height };
}
function renderEditor() {
  if (!draft || !source || !$('crop-dialog').open) return;
  const rect = cropRect(), canvas = $('crop-preview'), context = canvas.getContext('2d');
  context.fillStyle = '#f5f6fa'; context.fillRect(0, 0, canvas.width, canvas.height);
  if (draft.mode === 'crop') context.drawImage(source.image, rect.x * source.width, rect.y * source.height, rect.width * source.width, rect.height * source.height, 0, 0, 300, 400);
  else { const scale = Math.min(300 / source.width, 400 / source.height), w = source.width * scale, h = source.height * scale; context.drawImage(source.image, (300 - w) / 2, (400 - h) / 2, w, h); }
  const stage = $('crop-stage'), scale = Math.min(stage.clientWidth / source.width, stage.clientHeight / source.height), w = source.width * scale, h = source.height * scale;
  const outline = $('crop-outline'); outline.hidden = draft.mode !== 'crop';
  outline.style.left = ((stage.clientWidth - w) / 2 + rect.x * w) + 'px'; outline.style.top = ((stage.clientHeight - h) / 2 + rect.y * h) + 'px'; outline.style.width = rect.width * w + 'px'; outline.style.height = rect.height * h + 'px';
  $('crop-mode').value = draft.mode;
  for (const key of ['x', 'y', 'zoom']) {
    $('crop-' + key).value = draft[key];
    $('crop-' + key).disabled = saving || draft.mode !== 'crop' || key === 'x' && rect.width >= .999999 || key === 'y' && rect.height >= .999999;
    $('crop-' + key + '-value').value = key === 'zoom' ? draft.zoom.toFixed(2) + '×' : Math.round(draft[key]) + '%';
  }
  $('save-crop').disabled = saving || conflict || !!catalog?.configIssue || !editorModule?.cover;
  $('crop-mode').disabled = saving; $('show-full-cover').disabled = saving; $('cancel-crop').disabled = saving;
}

function openEditor() {
  const module = selected(); if (!module?.cover || !source || catalog.configIssue) return;
  editorEpoch++; editorModule = module; conflict = false; saving = false;
  draft = { mode: module.crop?.mode || 'crop', x: 50, y: 50, zoom: 1, configRevision: catalog.configRevision, coverRevision: module.cover.revision };
  const rect = module.crop?.mode === 'crop' ? module.crop.crop : null;
  if (rect) { draft.zoom = Number(clamp(Math.min(source.width, source.height * .75) / (rect.width * source.width), 1, 3).toFixed(2)); draft.x = rect.width < .999999 ? Math.round(clamp(rect.x / (1 - rect.width) * 100, 0, 100)) : 50; draft.y = rect.height < .999999 ? Math.round(clamp(rect.y / (1 - rect.height) * 100, 0, 100)) : 50; }
  $('crop-original').src = source.url; $('crop-original').alt = module.name + '完整封面原图';
  setText('crop-description', `${module.name} · ${source.width}×${source.height} · 原图保持完整`);
  showError('crop-error'); setText('crop-status', '核对预览后保存，所有模组裁切统一记录在 cover-crops.json。'); $('review-crop').hidden = true;
  $('crop-dialog').showModal(); renderEditor();
}

async function saveCrop() {
  if (!draft || !editorModule?.cover || !source || saving || conflict || catalog.configIssue) return;
  const epoch = editorEpoch;
  const payload = { moduleId: editorModule.id, expectedConfigRevision: draft.configRevision, expectedCoverRevision: draft.coverRevision, mode: draft.mode, ...(draft.mode === 'crop' ? { crop: cropRect() } : {}) };
  saving = true; showError('crop-error'); setText('crop-status', '正在保存裁切配置…'); renderEditor();
  try {
    const value = await request('/api/module-covers', payload);
    if (epoch !== editorEpoch) return;
    $('crop-dialog').close(); adoptCatalog(value); setText('tool-status', '裁切已保存到 cover-crops.json。原图保持完整。');
  } catch (error) {
    if (epoch !== editorEpoch || !$('crop-dialog').open) return;
    if (error.status === 409) { conflict = true; $('review-crop').hidden = false; showError('crop-error', error.message + '\n草稿已保留。请刷新并重新核对后，再决定是否保存。'); }
    else showError('crop-error', error.message);
    setText('crop-status', '本次保存未确认，草稿仍在当前窗口。');
  } finally { if (epoch === editorEpoch) { saving = false; renderEditor(); } }
}

async function reviewAfterConflict() {
  if (!draft || saving || !editorModule) return;
  const id = editorModule.id, epoch = editorEpoch; saving = true; renderEditor();
  try {
    const value = await request('/api/module-covers');
    if (epoch !== editorEpoch) return;
    const updated = value.groups.flatMap(item => item.modules).find(item => item.id === id);
    if (!updated?.cover) throw new Error('此模组或封面已不存在，请取消后刷新目录。');
    if (value.configIssue) throw new Error(value.configIssue);
    catalog = value;
    const loaded = await loadImage(updated);
    if (epoch !== editorEpoch) return;
    if (loaded.width !== updated.cover.width || loaded.height !== updated.cover.height) throw new Error('图片方向或尺寸与文件信息不一致，请先另存后重新读取。');
    editorModule = updated; source = loaded;
    draft.configRevision = value.configRevision; draft.coverRevision = updated.cover.revision; conflict = false;
    $('crop-original').src = source.url;
    setText('crop-description', `${updated.name} · ${source.width}×${source.height} · 原图保持完整`);
    setText('crop-status', '已重新读取配置和封面，草稿尚未保存；请核对预览后再次保存。'); showError('crop-error'); $('review-crop').hidden = true;
  } catch (error) { if (epoch === editorEpoch) { conflict = true; showError('crop-error', error.message); } }
  finally { if (epoch === editorEpoch) { saving = false; renderEditor(); } }
}

$('refresh-catalog').addEventListener('click', refreshCatalog);
$('previous-module').addEventListener('click', () => stepModule(-1));
$('next-module').addEventListener('click', () => stepModule(1));
$('module-track').addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); stepModule(event.key === 'ArrowRight' ? 1 : -1, true); } });
$('open-crop').addEventListener('click', openEditor);
$('cancel-crop').addEventListener('click', () => { if (!saving) $('crop-dialog').close(); });
$('crop-dialog').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
$('crop-dialog').addEventListener('close', () => { if (!$('crop-dialog').open) { editorEpoch++; draft = null; editorModule = null; saving = false; conflict = false; } });
$('crop-mode').addEventListener('change', () => { if (draft) { draft.mode = $('crop-mode').value === 'crop' ? 'crop' : 'contain'; renderEditor(); } });
for (const key of ['x', 'y', 'zoom']) $('crop-' + key).addEventListener('input', () => { if (draft) { draft[key] = Number($('crop-' + key).value); renderEditor(); } });
$('show-full-cover').addEventListener('click', () => { if (draft) { draft.mode = 'contain'; renderEditor(); } });
$('save-crop').addEventListener('click', saveCrop);
$('review-crop').addEventListener('click', reviewAfterConflict);
new ResizeObserver(() => { updateGroupIndicator(); renderEditor(); }).observe(document.body);
new ResizeObserver(renderEditor).observe($('crop-stage'));
if (token) refreshCatalog(); else requireSession();

import { createDesignWorkspace } from './preview-workspace.mjs';

const groupNames = { a: '单人短团', b: '多人短团', c: '长团' };
const modulePath = '模组/预处理/多人短团/风骸岛之龙';
const resources = [
  { id:'traveler', type:'角色', name:'旅人 · 演示角色', letter:'L', module:'wind', known:true, tags:'角色 player 旅行者', md:'# 旅人\n\n用于试走界面的合成角色，没有正式人物卡或战斗数值。\n\n## 当前所知\n\n- 随队前往岛屿\n- 尚未作出正式行动\n\n## 来源\n\n界面预览演示资料。' },
  { id:'guide', type:'NPC', name:'引路人 · 演示NPC', letter:'Y', module:'wind', known:true, tags:'npc guide 引导 旅途', md:'# 引路人\n\n一个合成的公开介绍，供体验资源阅读与引用。\n\n## 公开信息\n\n常在码头附近为旅人指路。\n\n## 相关资料\n\n港口来信。', private:'主持笔记示例：此处放尚未公开的背景，正式实现将按发放字段投影。' },
  { id:'mist', type:'怪物', name:'雾中兽 · 演示怪物', letter:'W', module:'wind', known:false, tags:'monster 雾 测试', md:'# 雾中兽\n\n原创占位生物，用于检查名称、来源与正文的阅读体验。\n\n## 描述\n\n雾中只看得见一对闪光的眼睛。\n\n## 规则状态\n\n没有机械数据，不能用作正式战斗资源。' },
  { id:'deck', type:'地图', name:'甲板 · 演示地图', letter:'J', module:'wind', known:true, tags:'map 船 甲板', md:'# 甲板示意\n\n这是界面测试条目，不是原书地图。\n\n## 地点\n\n- 船头\n- 桅杆\n- 船舱入口\n\n正式地图发放后，玩家视图按已确认要求显示图片和角色定位点。' },
  { id:'letter', type:'故事', name:'港口来信 · 演示节点', letter:'G', module:'wind', known:true, tags:'story letter 信件 情报', md:'# 港口来信\n\n这是一段合成的故事节点，供体验 Markdown 阅读。\n\n## 触发与结果\n\n当玩家打开信件时，可以记录“已阅读”。\n\n节点不预设等级，也不强制玩家按某个顺序行动。\n\n## 来源\n\n界面演示，不来自模组原文。' },
  { id:'check', type:'规则', name:'检定说明 · 演示规则', letter:'J', module:'other', known:true, tags:'rule 检定 check', md:'# 检定说明\n\n此条只展示规则资源的排版。\n\n## 阅读方式\n\n名称、版本和来源在正文旁保留；真实条文以后从本地资料读取。\n\n本页没有新增或覆盖任何D&D机械规则。' },
  { id:'key', type:'物品', name:'铜质钥匙 · 演示物品', letter:'T', module:'wind', known:true, tags:'item key 钥匙', md:'# 铜质钥匙\n\n一把没有机械效果的合成物品。\n\n## 公开描述\n\n柄上刻着简单的几何图案。\n\n## 团内状态\n\n预览不改库存，也不写入任何团的进度。' }
];
for (const item of resources) item.path = '资源/' + item.type + '/' + item.letter + '/' + item.name.split(' · ')[0] + '/资源.json';
const campaigns = [
  { id:'friday', name:'周五团', updated:'2026-10-30 20:30', characters:'旅人、同行者', place:'船舱入口', progress:'正在阅读港口来信', status:'游玩中' },
  { id:'rehearsal', name:'序幕试走', updated:'2026-10-29 19:10', characters:'角色待补充', place:'甲板', progress:'尚未开始，检查资料与布局', status:'准备中' }
];
let workspace, activeCampaign = null, selectedCampaign = null, catalogSelected = false, previewRole = null, search = '', scope = 'all', quoteDraft = '', frame = 0;
const esc = text => String(text).replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]));
const field = (id, label, value) => '<span><small>' + label + '</small> ' + esc(value) + '</span>';
function available(item) {
  if (previewRole === 'player' && !item.known) return false;
  if (scope === 'current' && (!activeCampaign || item.module !== 'wind')) return false;
  if (scope === 'wind' && item.module !== 'wind') return false;
  if (scope === 'other' && item.module !== 'other') return false;
  const query = search.trim().toLowerCase();
  return !query || (item.name + ' ' + item.tags + ' ' + item.path + ' 预览合成').toLowerCase().includes(query);
}
function resourceRow(item) {
  return '<article class="p-info-card pv-resource-row"><div class="pv-resource-text"><strong>' + esc(item.name) + '</strong><small>' + esc(item.type) + ' · ' + (item.module === 'wind' ? '风骸岛之龙' : '另一演示模组') + ' · 合成资料</small><small>' + esc(item.path) + '</small></div><button type="button" class="p-secondary p-button" data-open-resource="' + item.id + '">展开</button></article>';
}
function renderResourceList(category, list) {
  const items = resources.filter(item => item.type === category && available(item));
  list.innerHTML = items.length ? items.map(resourceRow).join('') : '<p class="pv-note">当前筛选下没有资料。可以更换模组筛选，或清空搜索。</p>';
}
function scheduleSync() { cancelAnimationFrame(frame); frame = requestAnimationFrame(sync); }
workspace = createDesignWorkspace({
  onPageChange: scheduleSync,
  onIdentityChange(role) { previewRole = role; activeCampaign = null; selectedCampaign = null; quoteDraft = ''; catalogSelected = false; scheduleSync(); },
  onAppearanceChange(snapshot) {
    try { sessionStorage.setItem('directory-preview-appearance', JSON.stringify(snapshot)); } catch {}
    scheduleSync();
  },
  onResourceRender: renderResourceList
});
const root = workspace.root;
const $ = selector => root.querySelector(selector);
const all = selector => [...root.querySelectorAll(selector)];
workspace.setAppearanceReady(true);
workspace.setAppearanceStatus('交互预览 · 所有更改只在本页；四预设在此调整页面比例，未接原生窗口外框。');
try { const saved = JSON.parse(sessionStorage.getItem('directory-preview-appearance') || 'null'); if (saved) workspace.setAppearance(saved); } catch {}

$('.p-main').insertAdjacentHTML('afterbegin', '<div class="pv-banner"><strong>方案预览</strong><span>建议顺序：选DM → 多人短团 → 风骸岛 → 选团 → 资源搜索与展开</span><a href="/original.html" target="_blank" rel="noopener">原设计示例</a></div>');
$('#platform-mode-note').textContent = '本页只使用合成团和资源。模组封面可只读显示本机原图；真实目录迁移、玩家授权和保存均未接入。';
$('#platform-connection').textContent = '本地交互预览 · 不写真实资料';
$('#platform-go-dialogue').textContent = '查看对话预览';
$('.p-home-copy h3').innerHTML = '回到你的团，<br>从上次继续。';
$('.p-home-copy > p').textContent = '首页确认视角，在模组窗口选择要继续的团。';
$('[data-browse-modules]').textContent = '选择模组';
all('[data-group]').forEach(button => button.textContent = groupNames[button.dataset.group]);

const modulePage = $('[data-view="模组"]');
modulePage.querySelector('.p-demo-note').textContent = '目录目标与界面关系预览 · 风骸岛封面只读，以下游玩团均为合成演示。';
modulePage.querySelector('.p-segments').insertAdjacentHTML('afterend', '<div class="pv-toolbar"><span class="pv-path" data-module-path></span><button type="button" class="p-secondary p-button" data-preview-refresh="modules">刷新</button><button type="button" class="p-secondary p-button" data-folder="module">打开文件夹</button></div><div class="pv-active" data-active-campaign>当前团：尚未继续任何团</div><div class="pv-empty" data-module-empty hidden><p>这个分类目前没有模组。</p><p>正式接入后，这里会显示对应目录中的模组。</p><a href="/original.html" target="_blank" rel="noopener">查看原设计示例</a></div>');
const stage = document.createElement('div'); stage.className = 'pv-module-stage';
const catalog = document.createElement('div'); catalog.className = 'pv-catalog';
for (const selector of ['[data-ring]', '.p-ring-controls', '.p-module-choice', '.p-module-confirmation']) catalog.append(modulePage.querySelector(selector));
stage.append(catalog);
const campaignPane = document.createElement('section'); campaignPane.className = 'pv-campaigns'; campaignPane.setAttribute('aria-label','已有游玩团');
stage.append(campaignPane); modulePage.append(stage);
modulePage.insertAdjacentHTML('beforeend', '<p class="pv-status" data-module-status role="status"></p>');

const resourcePage = $('[data-view="资源"]');
resourcePage.querySelector('.p-rule-version').insertAdjacentHTML('afterend', '<div class="pv-resource-tools"><label class="pv-search-label">快速查找资源<input type="search" data-search placeholder="搜索名称、中英文别名、标签或来源" autocomplete="off"></label><label class="pv-search-label">模组范围<select data-scope><option value="all">所有模组的资料</option><option value="current">仅看当前模组</option><option value="wind">仅看风骸岛之龙</option><option value="other">仅看另一演示模组</option></select></label></div><div class="pv-toolbar"><span class="pv-path" data-resource-path>资源 / 按真实目录类型归档（预览合成集）</span><button type="button" class="p-secondary p-button" data-preview-refresh="resources">刷新</button><button type="button" class="p-secondary p-button" data-folder="resources">打开文件夹</button></div><section class="pv-search-results" data-search-results aria-label="资源搜索结果" hidden></section>');
resourcePage.insertAdjacentHTML('beforeend', '<p class="pv-status" data-resource-status role="status">选择分类卡片，保留先滑到左侧再展开抽屉的动作。</p>');
const dialogueHost = $('[data-dialogue-host]');
if (dialogueHost) dialogueHost.innerHTML = '<section class="pv-preview-content"><h3>引用到对话</h3><p>先在资源中展开资料，点“引用到对话草稿”。这里仅展示名称与项目相对路径的引用格式，不发送真实消息。</p><div class="pv-draft" data-quote-draft>尚无引用草稿</div><button type="button" class="p-secondary p-button" data-clear-draft>清空预览草稿</button><p class="pv-note">正式分屏、指定接收者、私信和流程页沿用问卷方案分阶段接入；本页未模拟跨设备或正式权限。</p></section>';

const dialog = document.createElement('dialog'); dialog.className = 'pv-dialog';
dialog.setAttribute('aria-label','预览详情');
root.querySelector('#platform-covers').append(dialog);
function showDialog(title, body, footer = '') {
  dialog.innerHTML = '<header><h3>' + esc(title) + '</h3><button type="button" class="p-close p-button" data-close-preview>关闭</button></header><div class="pv-dialog-body">' + body + '</div>' + (footer ? '<footer>' + footer + '</footer>' : '');
  if (!dialog.open) dialog.showModal();
}
function status(area, message) { $('[data-' + area + '-status]').textContent = message; }
function renderCampaigns() {
  if (!catalogSelected) { campaignPane.innerHTML = '<div class="pv-empty"><p>选中左侧模组封面，查看它已有的游玩团。</p><p class="pv-note">浏览模组不会改变当前团。点击“继续此团”后，其他窗口才跟随。</p></div>'; return; }
  const list = campaigns.map(item => '<button type="button" class="pv-campaign p-button" data-campaign="' + item.id + '" aria-pressed="' + (selectedCampaign === item.id) + '"><strong>' + esc(item.name) + ' <small>预览演示团</small></strong><p>' + esc(item.progress) + '</p><div class="pv-meta">' + field('status','状态',item.status) + field('date','上次',item.updated) + field('pc','角色',item.characters) + field('place','地点',item.place) + '</div></button>').join('');
  const selected = campaigns.find(item => item.id === selectedCampaign);
  const overview = selected ? '<section class="pv-overview"><strong>' + esc(selected.name) + ' · 概况</strong><p>最近地点：' + esc(selected.place) + '。' + esc(selected.progress) + '。</p><button type="button" class="p-primary p-button" data-continue="' + selected.id + '">' + (activeCampaign === selected.id ? '当前正在预览此团' : '继续此团') + '</button><p class="pv-note">继续只更新本页的演示上下文；真实团保持原样。</p></section>' : '<p class="pv-note">选一个团看概况，再点“继续此团”。</p>';
  campaignPane.innerHTML = '<div class="pv-section-head"><h3>已有游玩团</h3><button type="button" class="p-secondary p-button" data-new-campaign' + (previewRole === 'player' ? ' disabled title="请在DM预览中体验新开团"' : '') + '>新开一团</button></div>' + list + overview + '<button type="button" class="p-secondary p-button" data-module-details>查看模组资料</button>';
}
function updateResources() {
  const querying = !!search.trim();
  resourcePage.dataset.searching = String(querying);
  $('[data-search-results]').hidden = !querying;
  if (querying) {
    const matches = resources.filter(available);
    $('[data-search-results]').innerHTML = '<p class="pv-note">' + matches.length + ' 条匹配 · 搜索整个合成资料库</p>' + (matches.map(resourceRow).join('') || '<p class="pv-empty">没有匹配资料。试试“钥匙”“guide”或“地图”。</p>');
  } else workspace.refreshResources();
  $('[data-resource-path]').textContent = '资源 / ' + (querying ? '搜索结果' : workspace.category) + ' · ' + (previewRole === 'player' ? '合成已知资料视角' : '合成资料库');
}
function sync() {
  if (!workspace) return;
  const group = workspace.group;
  modulePage.dataset.empty = String(group !== 'b');
  $('[data-module-empty]').hidden = group === 'b';
  $('[data-module-path]').textContent = '模组 / 预处理 / ' + groupNames[group] + (group === 'b' && catalogSelected ? ' / 风骸岛之龙' : '');
  const active = campaigns.find(item => item.id === activeCampaign);
  const context = active ? '当前团：' + active.name + '（预览演示团）' : '当前团：尚未继续任何团';
  $('[data-active-campaign]').textContent = context;
  $('#platform-current-session').textContent = context;
  $('[data-home-selection]').textContent = '正式资料与进度不会被本页修改';
  $('[data-browse-modules]').textContent = '选择或继续模组';
  all('[data-module-context]').forEach(node => node.textContent = context);
  $('[data-module-confirmation]').textContent = '封面只读 · 游玩团和资料列表为交互演示';
  $('#platform-identity').textContent = previewRole ? (previewRole === 'dm' ? 'DM · 交互预览' : 'Player · 合成视角') : '尚未选择视角';
  $('#platform-connection').textContent = previewRole === 'player' ? 'Player合成预览 · 正式授权尚未接通' : '本地交互预览 · 不写真实资料';
  renderCampaigns(); updateResources();
  if ($('[data-quote-draft]')) $('[data-quote-draft]').textContent = quoteDraft || '尚无引用草稿';
}
function renderMarkdown(text) {
  let html = '', list = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) { if (!list) { html += '<ul>'; list = true; } html += '<li>' + esc(line.slice(2)) + '</li>'; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (line.startsWith('# ')) html += '<h2>' + esc(line.slice(2)) + '</h2>';
    else if (line.startsWith('## ')) html += '<h3>' + esc(line.slice(3)) + '</h3>';
    else if (line.trim()) html += '<p>' + esc(line) + '</p>';
  }
  return html + (list ? '</ul>' : '');
}
function showResource(id) {
  const item = resources.find(item => item.id === id);
  if (!item || !available(item)) return;
  const body = '<p class="pv-module-source">合成演示资料 · Dungeons & Dragons 2024（龙与地下城2024版）筛选视图</p><code>' + esc(item.path) + '</code>' + renderMarkdown(item.md) + (item.private && previewRole === 'dm' ? '<h3>DM笔记（演示）</h3><p>' + esc(item.private) + '</p>' : '');
  showDialog(item.name, body, '<button type="button" class="p-primary p-button" data-quote="' + item.id + '">引用到对话草稿</button><button type="button" class="p-secondary p-button" data-folder-resource="' + item.id + '">打开文件夹</button>');
}
root.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-close-preview')) { dialog.close(); return; }
  if (button.dataset.group) { catalogSelected = false; selectedCampaign = null; scheduleSync(); }
  if (button.hasAttribute('data-module-index') || button.hasAttribute('data-confirm-module')) { if (workspace.group === 'b') catalogSelected = true; scheduleSync(); }
  if (button.dataset.campaign) { selectedCampaign = button.dataset.campaign; renderCampaigns(); }
  if (button.dataset.continue) { activeCampaign = button.dataset.continue; quoteDraft = ''; status('module','已继续演示团；地图、对话和战斗的预览标记随之更新。'); sync(); }
  if (button.hasAttribute('data-module-details')) showDialog('风骸岛之龙 · 模组资料', '<p>此预览只读使用原有封面。以下路径展示待实施的目录方案。</p><code>' + modulePath + '/\n  故事/\n  对话/\n  战斗/</code><p>你将自行准备PDF、Markdown及图片，再通过外部工具和固定提示词完成整理。正式平台会读取整理结果，检查缺项和来源。</p><p class="pv-note">原始PDF、地图、故事正文未在此复制或改写。正式迁移与预处理提示词不属于这页已实现的功能。</p>');
  if (button.hasAttribute('data-new-campaign')) showDialog('新开一团 · 仅内存演示', '<form data-new-campaign-form><label>团名<input name="name" maxlength="60" required value="风骸岛之龙 · 新团"></label><label>起始场景<select name="place"><option>甲板</option><option>船舱入口</option></select></label><p>角色可以稍后补齐。这里创建的演示团刷新页面后消失。</p><button type="submit" class="p-primary p-button">创建准备中的演示团</button></form>');
  if (button.dataset.openResource) showResource(button.dataset.openResource);
  if (button.dataset.quote) {
    const item = resources.find(item => item.id === button.dataset.quote);
    if (item) { quoteDraft = '[' + item.name + '](' + item.path + ')'; dialog.close(); workspace.show('dialogue'); scheduleSync(); }
  }
  if (button.hasAttribute('data-clear-draft')) { quoteDraft = ''; sync(); }
  if (button.hasAttribute('data-folder') || button.dataset.folderResource) {
    const item = resources.find(item => item.id === button.dataset.folderResource);
    const path = item ? item.path.slice(0,item.path.lastIndexOf('/')) : button.dataset.folder === 'module' ? (workspace.group === 'b' && catalogSelected ? modulePath : '模组/预处理/' + groupNames[workspace.group]) : '资源/' + workspace.category;
    showDialog('打开文件夹 · 预览', '<p>正式接入后，这个按钮将打开对应的本地文件夹。</p><code>' + esc(path) + '</code><p class="pv-note">这是拟定或合成路径。本页只展示目标位置，没有打开系统文件夹或移动任何文件。</p>');
  }
  if (button.dataset.previewRefresh) {
    const area = button.dataset.previewRefresh === 'modules' ? 'module' : 'resource';
    if (area === 'resource') updateResources();
    status(area,'已重新显示预览数据。正式目录扫描将在实现阶段接入，本次未扫描或写入真实资料。');
  }
  if (button.dataset.resource || button.dataset.resourceStep || button.hasAttribute('data-close-drawer')) scheduleSync();
});
root.addEventListener('input', event => { if (event.target.matches('[data-search]')) { search = event.target.value; updateResources(); } });
root.addEventListener('change', event => { if (event.target.matches('[data-scope]')) { scope = event.target.value; updateResources(); } });
root.addEventListener('submit', event => {
  if (!event.target.matches('[data-new-campaign-form]')) return;
  event.preventDefault();
  const form = new FormData(event.target), name = String(form.get('name') || '').trim();
  if (!name) return;
  const item = { id:'created-' + campaigns.length, name, place:String(form.get('place')), updated:'刚刚（仅本页）', characters:'角色待补充', progress:'未开始，等待角色和场景确认', status:'准备中' };
  campaigns.unshift(item); selectedCampaign = item.id; catalogSelected = true; dialog.close(); sync();
});
sync();

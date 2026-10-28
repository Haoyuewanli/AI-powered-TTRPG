const pages = [
  ['home', '首页', 'HOME / WORKSPACE', '00'],
  ['modules', '模组', 'MODULE / LIBRARY', '01'],
  ['resources', '资源', 'RESOURCE / LIBRARY', '02'],
  ['maps', '地图', 'MAP / DIRECTORY', '03'],
  ['dialogue', '对话', 'DIALOGUE / WORKSPACE', '04'],
  ['battle', '战斗', 'BATTLE / TABLE', '05']
];

const paths = {
  home: ['M3 10 12 3l9 7', 'M5 9v12h5v-7h4v7h5V9'],
  modules: ['M12 5v16', 'M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z'],
  resources: ['m12 3 9 5-9 5-9-5Z', 'm3 12 9 5 9-5', 'm3 16 9 5 9-5'],
  maps: ['m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z', 'M9 3v16', 'M15 5v16'],
  dialogue: ['M4 4h16v13H9l-5 4Z', 'M8 9h8', 'M8 13h5'],
  battle: ['m4 3 9 9-3 3-7-9Z', 'm20 3-9 9 3 3 7-9Z', 'm5 14 5 5', 'm19 14-5 5', 'm7 17-3 4', 'm17 17 3 4']
};

const element = (tag, className, content) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  for (const d of paths[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}

export function createPlatformShell({ onPageChange = () => {}, onIdentityChange = () => {} } = {}) {
  const root = element('div', 'platform-shell'); root.id = 'platform-root'; root.dataset.page = 'home';
  const atmosphere = element('div', 'platform-atmosphere'); atmosphere.setAttribute('aria-hidden', 'true');
  const wall = element('div', 'platform-wall'); wall.append(element('div', 'platform-beam'));
  const floor = element('div', 'platform-floor'); floor.append(element('div', 'platform-floor-light'), element('div', 'platform-floor-shade'), element('div', 'platform-floor-contact'));
  atmosphere.append(wall, floor); root.append(atmosphere);
  const side = element('aside', 'platform-side');
  const brand = element('div', 'platform-brand'); const mark = element('span', 'platform-brand-mark'); mark.setAttribute('aria-hidden', 'true');
  brand.append(mark, element('span', '', '战局'));
  const nav = element('nav', 'platform-nav'); nav.setAttribute('aria-label', '平台导航');
  const navButtons = new Map();
  for (const [key, label] of pages) {
    const button = element('button', 'platform-nav-button platform-button'); button.type = 'button';
    button.dataset.platformPage = key; button.setAttribute('aria-pressed', String(key === 'home')); button.disabled = key !== 'home';
    button.append(icon(key), element('span', '', label)); button.addEventListener('click', () => show(key)); nav.append(button); navButtons.set(key, button);
  }
  const sideIdentity = element('p', 'platform-side-identity', '选择视角');
  side.append(brand, element('p', 'platform-edition', 'D&D 2024'), nav, sideIdentity); root.append(side);
  const main = element('main', 'platform-main');
  const chrome = element('div', 'platform-chrome');
  const identity = element('span', 'platform-identity', '尚未选择视角'); identity.id = 'platform-identity';
  const connection = element('span', 'platform-connection', '独立本机平台'); connection.id = 'platform-connection'; connection.setAttribute('role', 'status');
  chrome.append(identity, connection);
  const heading = element('header', 'platform-heading'); const headingCopy = element('div', 'platform-heading-copy');
  const eyebrow = element('p', 'platform-eyebrow', pages[0][2]);
  const title = element('h2', 'platform-title', '首页'); title.id = 'platform-title'; title.tabIndex = -1;
  headingCopy.append(eyebrow, title); const number = element('span', 'platform-page-number', '00'); number.setAttribute('aria-hidden', 'true'); heading.append(headingCopy, number);
  const workspace = element('div', 'platform-workspace'); const views = new Map();
  for (const [key, label] of pages) {
    const view = element('section', `platform-view platform-view-${key}`); view.dataset.platformView = key; view.setAttribute('aria-label', `${label}窗口`); view.hidden = key !== 'home'; workspace.append(view); views.set(key, view);
  }
  main.append(chrome, heading, workspace); root.append(main);

  const home = views.get('home'); const homeCopy = element('div', 'platform-home-copy');
  homeCopy.append(element('p', 'platform-kicker', '独立本机平台 · P1'), element('h3', '', '下一场冒险，从这里开始。'));
  const hint = element('p', 'platform-home-hint', '选择 DM 或 Player，预览你的平台视角。');
  const modeNote = element('p', 'platform-demo-note', 'P1 界面演示；尚未接入正式身份、模组资料和玩家权限。'); modeNote.id = 'platform-mode-note';
  const choices = element('div', 'platform-identity-choices'); choices.id = 'platform-identity-choices';
  for (const [key, label, id] of [['dm', 'DM · 主持视图', 'enter-dm'], ['player', 'Player · 玩家视图', 'enter-player']]) {
    const button = element('button', 'platform-primary platform-button', label); button.type = 'button'; button.id = id; button.addEventListener('click', () => chooseIdentity(key)); choices.append(button);
  }
  homeCopy.append(hint, modeNote, choices);
  const summary = element('section', 'platform-summary'); summary.id = 'platform-current-session'; summary.hidden = true; summary.setAttribute('aria-label', '当前平台上下文');
  summary.append(element('p', 'platform-kicker', 'CURRENT MODULE'), element('h3', 'platform-module-name', '未选择模组'), element('p', 'platform-module-description', '真实模组将在后续阶段接入。所属模组只能由模组窗口更改。'));
  const actions = element('div', 'platform-home-actions');
  const browse = element('button', 'platform-primary platform-button', '查看模组窗口'); browse.type = 'button'; browse.id = 'platform-go-modules'; browse.addEventListener('click', () => show('modules'));
  const demo = element('button', 'platform-secondary platform-button', '查看对话演示'); demo.type = 'button'; demo.id = 'platform-go-dialogue'; demo.addEventListener('click', () => show('dialogue'));
  const change = element('button', 'platform-secondary platform-button', '更换 DM / Player'); change.type = 'button'; change.id = 'platform-switch-identity'; change.addEventListener('click', clear);
  actions.append(browse, demo, change); summary.append(actions);
  const art = element('div', 'platform-home-art'); art.setAttribute('aria-hidden', 'true'); art.append(element('div', 'platform-home-sheet platform-home-sheet-back'), element('div', 'platform-home-sheet platform-home-sheet-front'));
  const right = element('div', 'platform-home-right'); right.append(summary, art); home.append(homeCopy, right);

  const placeholders = {
    modules: ['模组', '真实模组目录与 JSON 引用将在 P2 / P3 接入。当前没有可选的真实模组；之后只有此窗口可以更改所属模组。'],
    resources: ['NPC、角色、怪物、地图与物品', '五类资源尚未接入真实资料。Player 资料的服务端筛选和发放记录将在后续阶段实现。'],
    maps: ['地图', '尚未选择模组；真实矢量地图和图片地图均未接入。'],
    battle: ['战斗', '尚未选择模组；战斗模块保持独立，本平台没有启动战斗核心或结算程序。']
  };
  for (const key of ['maps', 'dialogue', 'battle']) {
    const context = element('p', 'platform-context', '未选择模组'); context.dataset.moduleContext = ''; views.get(key).append(context);
  }
  for (const [key, [label, description]] of Object.entries(placeholders)) {
    const sheet = element('div', 'platform-placeholder'); sheet.append(element('span', 'platform-status-label', '尚未接入'), element('h3', '', label), element('p', '', description)); views.get(key).append(sheet);
  }
  const dialogueView = views.get('dialogue');
  const demoBoundary = element('section', 'platform-demo-boundary');
  demoBoundary.append(element('strong', '', '公共界面演示'), element('p', '', '以下群聊、资源与地图均为公共示例，不属于任何已选模组，不代表已发放资料或正式进度。'));
  const dialogueHost = element('div'); dialogueHost.dataset.dialogueHost = ''; dialogueView.append(demoBoundary, dialogueHost);
  document.body.prepend(root);

  let currentPage = 'home', role = null;
  function chooseIdentity(value) {
    role = value; root.dataset.role = value || '';
    const label = value === 'dm' ? 'DM · 界面预览' : value === 'player' ? 'Player · 界面预览' : '尚未选择视角';
    identity.textContent = label; sideIdentity.textContent = value === 'dm' ? 'DM 预览' : value === 'player' ? 'Player 预览' : '选择视角';
    choices.hidden = !!value; summary.hidden = !value; art.hidden = !!value;
    hint.textContent = value ? '在此切换视角，或查看平台各窗口。' : '选择 DM 或 Player，预览你的平台视角。';
    for (const [key, button] of navButtons) button.disabled = key !== 'home' && !value;
    onIdentityChange(value);
  }
  function show(page = 'home') {
    if (!views.has(page) || (page !== 'home' && !role)) return false;
    currentPage = page; root.dataset.page = page;
    for (const [key, view] of views) view.hidden = key !== page;
    for (const [key, button] of navButtons) button.setAttribute('aria-pressed', String(key === page));
    const entry = pages.find(item => item[0] === page); title.textContent = entry[1]; eyebrow.textContent = entry[2]; number.textContent = entry[3];
    onPageChange(page); title.focus({ preventScroll: true }); return true;
  }
  function clear() { chooseIdentity(null); show('home'); }
  function setConnection(connected) { connection.textContent = connected ? '独立本机平台' : '本机连接暂不可用'; connection.dataset.connected = String(connected); }
  return { root, show, clear, setConnection, get page() { return currentPage; }, get role() { return role; } };
}

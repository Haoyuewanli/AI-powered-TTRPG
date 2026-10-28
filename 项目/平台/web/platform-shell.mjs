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

export function createPlatformShell({ login, table, canNavigate = () => true, onVisibilityChange = () => {}, onLogout = () => {} }) {
  const root = element('div', 'platform-shell'); root.id = 'platform-root'; root.dataset.page = 'home';
  const atmosphere = element('div', 'platform-atmosphere'); atmosphere.setAttribute('aria-hidden', 'true');
  const wall = element('div', 'platform-wall'); wall.append(element('div', 'platform-beam'));
  const floor = element('div', 'platform-floor'); floor.append(element('div', 'platform-floor-light'), element('div', 'platform-floor-shade'), element('div', 'platform-floor-contact'));
  atmosphere.append(wall, floor); root.append(atmosphere);

  const side = element('aside', 'platform-side');
  const brand = element('div', 'platform-brand');
  const mark = element('span', 'platform-brand-mark'); mark.setAttribute('aria-hidden', 'true');
  brand.append(mark, element('span', '', '战局'));
  const nav = element('nav', 'platform-nav'); nav.setAttribute('aria-label', '平台导航');
  const navButtons = new Map();
  for (const [key, label] of pages) {
    const button = element('button', 'platform-nav-button platform-button'); button.type = 'button';
    button.dataset.platformPage = key; button.setAttribute('aria-pressed', String(key === 'home'));
    button.append(icon(key), element('span', '', label));
    button.addEventListener('click', () => show(key)); nav.append(button); navButtons.set(key, button);
  }
  const sideIdentity = element('p', 'platform-side-identity', '选择身份');
  side.append(brand, element('p', 'platform-edition', 'D&D 2024'), nav, sideIdentity); root.append(side);

  const main = element('div', 'platform-main');
  const chrome = element('div', 'platform-chrome');
  const identity = element('span', 'platform-identity', '尚未选择身份'); identity.id = 'platform-identity';
  const connection = element('span', 'platform-connection', ''); connection.id = 'platform-connection'; connection.setAttribute('role', 'status');
  chrome.append(identity, connection);
  const heading = element('header', 'platform-heading');
  const headingCopy = element('div', 'platform-heading-copy');
  const eyebrow = element('p', 'platform-eyebrow', pages[0][2]);
  const title = element('h2', 'platform-title', '首页'); title.id = 'platform-title'; title.tabIndex = -1;
  headingCopy.append(eyebrow, title);
  const number = element('span', 'platform-page-number', '00'); number.setAttribute('aria-hidden', 'true');
  heading.append(headingCopy, number);
  const workspace = element('div', 'platform-workspace');
  const views = new Map();
  for (const [key, label] of pages) {
    const view = element('section', `platform-view platform-view-${key}`);
    view.dataset.platformView = key; view.setAttribute('aria-label', `${label}窗口`); view.hidden = key !== 'home';
    workspace.append(view); views.set(key, view);
  }
  main.append(chrome, heading, workspace); root.append(main);

  const home = views.get('home');
  const homeCopy = element('div', 'platform-home-copy');
  homeCopy.append(element('p', 'platform-kicker', '一份本地进度 · 你的视角'), element('h3', '', '下一场冒险，从这里继续。'));
  const homeHint = element('p', 'platform-home-hint', '在首页选择 DM 或 Player，进入你的视角。');
  const loginSlot = element('div', 'platform-login-slot'); loginSlot.append(login);
  homeCopy.append(homeHint, loginSlot);
  const summary = element('section', 'platform-summary'); summary.id = 'platform-current-session'; summary.hidden = true; summary.setAttribute('aria-label', '当前团与战斗');
  summary.append(element('p', 'platform-kicker', 'CURRENT SESSION'));
  const campaign = element('h3', 'platform-campaign-name'); campaign.id = 'platform-campaign-name';
  const battle = element('p', 'platform-battle-name'); battle.id = 'platform-battle-name';
  const details = element('dl', 'platform-session-details');
  const readings = new Map();
  for (const [key, label] of [['phase', '当前阶段'], ['save', '保存状态']]) {
    const row = element('div', 'platform-detail-row');
    const reading = element('dd'); reading.id = `platform-${key}`; row.append(element('dt', '', label), reading); details.append(row); readings.set(key, reading);
  }
  const actions = element('div', 'platform-home-actions');
  const continueButton = element('button', 'platform-primary platform-button', '继续当前战斗'); continueButton.id = 'platform-go-battle'; continueButton.type = 'button'; continueButton.addEventListener('click', () => show('battle'));
  const switchButton = element('button', 'platform-secondary platform-button', '更换 DM / Player'); switchButton.id = 'platform-switch-identity'; switchButton.type = 'button'; switchButton.addEventListener('click', () => onLogout());
  actions.append(continueButton, switchButton);
  summary.append(campaign, battle, details, actions);
  const art = element('div', 'platform-home-art'); art.setAttribute('aria-hidden', 'true'); art.append(element('div', 'platform-home-sheet platform-home-sheet-back'), element('div', 'platform-home-sheet platform-home-sheet-front'));
  const right = element('div', 'platform-home-right'); right.append(summary, art); home.append(homeCopy, right);

  const placeholderCopy = {
    modules: ['模组封面与分类', '真实封面管理已可使用。连续封面环和模组开团尚未接入。'],
    resources: ['角色、NPC 与怪物资料', '资源资料窗口尚未接入。当前角色的数值和操作仍在战斗工作区。'],
    maps: ['俯视地图与目录', '真实地图读取尚未接入。当前战斗地图仍在战斗工作区。'],
    dialogue: ['对话工作区', '群聊标签页与分屏正在进行范围对齐。']
  };
  for (const [key, [label, description]] of Object.entries(placeholderCopy)) {
    const sheet = element('div', 'platform-placeholder');
    sheet.append(element('span', 'platform-status-label', '建设中'), element('h3', '', label), element('p', '', description));
    views.get(key).append(sheet);
  }
  const coversLink = element('a', 'platform-secondary platform-button', '管理模组封面'); coversLink.href = '/module-covers'; coversLink.id = 'platform-module-covers'; coversLink.hidden = true;
  views.get('modules').firstElementChild.append(coversLink);
  views.get('battle').append(table);
  document.body.prepend(root);

  let currentPage = 'home', context = null;
  const phaseName = state => state.initiativeCollection ? '收集先攻' : ({ preparing: '准备中', active: '战斗中', ended: '已结束' }[state.combat?.phase] || '等待状态');

  function displayPage(page, focus = true) {
    currentPage = page; root.dataset.page = page;
    for (const [key, view] of views) view.hidden = key !== page;
    for (const [key, button] of navButtons) button.setAttribute('aria-pressed', String(key === page));
    const entry = pages.find(item => item[0] === page);
    title.textContent = entry[1]; eyebrow.textContent = entry[2]; number.textContent = entry[3];
    table.hidden = page !== 'battle' || !context?.state;
    onVisibilityChange(page === 'battle' && !!context?.state);
    if (focus) {
      const target = page === 'battle' ? document.getElementById('viewport') : title;
      target?.focus({ preventScroll: true });
    }
  }

  function show(page = 'home') {
    if (!views.has(page) || (page !== 'home' && !context?.state)) return false;
    if (page === currentPage) return true;
    if (canNavigate(page) === false) return false;
    displayPage(page); return true;
  }

  function update(value) {
    context = value;
    const { state, selection, audience = 'local', connected = true, busy = false } = value;
    const active = !!state;
    login.hidden = active; summary.hidden = !active; art.hidden = active;
    homeHint.textContent = active ? '继续当前场，或在这里切换 DM / Player。' : audience === 'player' ? '使用主持发来的角色邀请进入当前战斗。' : '在首页选择 DM 或 Player，进入你的视角。';
    for (const [key, button] of navButtons) button.disabled = key !== 'home' && !active;
    continueButton.disabled = !active || busy;
    switchButton.disabled = busy;
    switchButton.hidden = audience === 'player';
    coversLink.hidden = !(active && audience === 'local' && state.viewRole === 'dm');
    const role = active ? state.viewRole === 'dm' ? 'DM · 主持视角' : 'Player · 角色视角' : '尚未选择身份';
    identity.textContent = role; sideIdentity.textContent = active ? state.viewRole === 'dm' ? 'DM' : 'Player' : '选择身份';
    connection.textContent = !connected ? '连接中断 · 正在重连' : audience === 'player' ? '已连接主持' : '本机运行';
    connection.dataset.connected = String(connected);
    campaign.textContent = active ? selection?.campaignName || '当前团' : '';
    battle.textContent = active ? selection?.battleName || state.title || '当前战斗' : '';
    readings.get('phase').textContent = active ? phaseName(state) : '';
    readings.get('save').textContent = active ? busy ? '保存中…' : `${audience === 'player' ? '主持端已保存' : '已保存'} · v${state.revision}` : '';
    table.hidden = currentPage !== 'battle' || !active;
  }

  function clear() {
    update({ state: null, selection: null, audience: context?.audience || 'local', connected: context?.connected ?? true, busy: false });
    displayPage('home', false);
  }

  update({ state: null, selection: null, audience: 'local', connected: true, busy: false });
  return { root, update, clear, show, get page() { return currentPage; } };
}

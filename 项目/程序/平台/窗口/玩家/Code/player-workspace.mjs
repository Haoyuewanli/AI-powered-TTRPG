import { renderResourceMarkdown } from '/resource-workspace.mjs';

const el = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const parentPath = path => path.split('/').slice(0, -1).join('/');
const runKey = value => value.moduleId + '/' + value.runId;

export function createPlayerWorkspace({ root, api, getRole }) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/player-workspace.css'; document.head.append(css);
  const dialog = el('dialog', undefined, 'player-explorer');
  const title = el('h2', '玩家与角色'), tabs = el('div', undefined, 'player-view-tabs'), toolbar = el('div', undefined, 'player-toolbar');
  const crumb = el('div', undefined, 'player-breadcrumb'), body = el('div', undefined, 'player-explorer-body');
  const browser = el('section', undefined, 'player-browser'), list = el('div', undefined, 'player-files');
  const detail = el('section', undefined, 'player-detail'), status = el('p', '', 'player-status');
  const menu = el('div', undefined, 'player-context'), search = el('input'), count = el('small', '', 'player-file-count');
  const searchBar = el('div', undefined, 'player-search');
  const unassigned = el('input'), unassignedLabel = el('label', undefined, 'player-unassigned-filter');
  unassigned.type = 'checkbox'; unassigned.setAttribute('aria-label', '只看未入团'); unassignedLabel.append(unassigned, el('span', '只看未入团'));
  search.type = 'search'; search.placeholder = '搜索当前文件夹'; search.setAttribute('aria-label', '搜索当前玩家文件夹');
  searchBar.append(search, count); browser.append(searchBar, unassignedLabel, list); body.append(browser, detail);
  menu.hidden = true; status.setAttribute('role', 'status');
  dialog.append(title, tabs, toolbar, crumb, body, status, menu); root.append(dialog);

  let data = { entries: [], revision: '' }, current = '', selected = null, clipboard = null;
  let dirty = '', busy = false, serial = 0, mode = 'relations';
  let relations = { players: [], characters: [], runs: [], issues: [] };
  const action = (name, fn) => {
    const button = el('button', name); button.type = 'button'; button.onclick = () => run(fn); return button;
  };
  const clean = () => { if (dirty) throw new Error('请先保存或放弃当前修改，再进行其他操作。'); };
  async function run(fn) {
    if (busy) return;
    busy = true; dialog.setAttribute('aria-busy', 'true'); syncActions();
    try { await fn(); } catch (error) { status.textContent = error.message; }
    finally { busy = false; dialog.removeAttribute('aria-busy'); syncActions(); }
  }
  const up = action('上一级', () => enter(parentPath(current))), fresh = action('刷新', refresh), add = action('新建', create);
  const renameButton = action('重命名', rename), cut = action('剪切', () => copy(true)), copyButton = action('复制', () => copy());
  const pasteButton = action('粘贴', paste), duplicateButton = action('建立副本', duplicate);
  toolbar.append(up, fresh, add, renameButton, cut, copyButton, pasteButton, duplicateButton, action('关闭', () => { clean(); dialog.close(); }));
  const relationsTab = action('关系总览', () => changeView('relations')), filesTab = action('档案文件', () => changeView('files'));
  tabs.append(relationsTab, filesTab);
  async function changeView(next) {
    clean(); mode = next; search.value = '';
    if (mode === 'relations' && selected && !['player', 'character'].includes(selected.type)) selected = data.entries.find(entry => entry.path === selected.path.split('/').slice(0, 2).join('/')) || null;
    if (selected) current = parentPath(selected.path);
    render(); if (selected) await show(selected);
  }
  function syncActions() {
    const folderSelected = !!selected && selected.type !== 'file';
    for (const button of [up, renameButton, cut, copyButton, pasteButton, duplicateButton]) button.hidden = mode !== 'files';
    add.textContent = mode === 'relations' ? '新建玩家' : '新建';
    up.disabled = busy || !current;
    fresh.disabled = busy;
    add.disabled = busy || mode === 'files' && current.split('/').filter(Boolean).length >= 3;
    for (const button of [renameButton, cut, copyButton, duplicateButton]) button.disabled = busy || !folderSelected;
    pasteButton.disabled = busy || !clipboard || parentPath(clipboard.path).split('/').filter(Boolean).length !== current.split('/').filter(Boolean).length;
  }
  function select(entry) {
    selected = entry;
    for (const row of list.querySelectorAll('[data-player-path]')) row.classList.toggle('selected', row.dataset.playerPath === entry?.path);
    syncActions();
  }
  async function refresh() {
    clean(); const previous = selected?.path;
    [data, relations] = await Promise.all([api('/api/library/players'), api('/api/library/player-relations')]);
    if (current && !data.entries.some(entry => entry.path === current)) current = '';
    selected = data.entries.find(entry => entry.path === previous) || null; render(); if (selected) await show(selected);
    const issues = [...(data.issues || []), ...(relations.issues || [])];
    status.textContent = issues.length ? '部分文件需要核对：' + issues.map(entry => entry.path + ' ' + (entry.error || entry.reason)).join('；')
      : '选择角色后可管理所属玩家和参加的团。各团进度独立；调整关系不会切换当前团。';
  }
  async function mutate(value, { allowDraft = false, focusPath, directory, message = '已保存到本地目录。' } = {}) {
    if (!allowDraft) clean();
    const result = await api('/api/library/players', { ...value, expectedRevision: data.revision });
    data = result; dirty = ''; selected = null;
    relations = await api('/api/library/player-relations');
    if (directory !== undefined) current = directory;
    render();
    if (focusPath) {
      const next = data.entries.find(entry => entry.path === focusPath);
      if (next) { select(next); await show(next); }
    }
    status.textContent = message;
  }
  function enter(path) { clean(); mode = 'files'; current = path; selected = null; search.value = ''; render(); }
  async function create() {
    clean(); const parent = mode === 'relations' ? '' : current, depth = parent ? parent.split('/').length : 0;
    if (depth >= 3) return;
    const name = prompt(['玩家名', '角色名-模组', '等级目录（如01级）'][depth], depth === 2 ? '01级' : '');
    if (name?.trim()) { search.value = ''; await mutate({ action: 'create', parent, name: name.trim() }); }
  }
  function copy(cutting = false) {
    clean(); if (!selected || selected.type === 'file') throw new Error('请选择玩家、角色或等级文件夹。');
    clipboard = { path: selected.path, name: selected.name, cut: cutting }; syncActions();
    status.textContent = cutting ? '已剪切；进入目标文件夹后粘贴。' : '已复制；进入目标文件夹后粘贴。';
  }
  async function paste() {
    clean(); if (!clipboard) return;
    const duplicate = data.entries.some(entry => entry.path === [current, clipboard.name].filter(Boolean).join('/'));
    const name = prompt('粘贴后的名称', clipboard.name + (duplicate ? ' · 副本' : ''));
    if (!name) return;
    await mutate({ action: clipboard.cut ? 'move' : 'copy', path: clipboard.path, parent: current, name });
    if (clipboard.cut) clipboard = null; syncActions();
  }
  async function rename() {
    clean(); if (!selected || selected.type === 'file') return;
    const name = prompt('重命名', selected.name);
    if (name && name !== selected.name) await mutate({ action: 'rename', path: selected.path, name });
  }
  async function duplicate() {
    clean(); if (!selected || selected.type === 'file') return;
    const name = prompt('副本名称', selected.name + ' · 副本');
    if (name) await mutate({ action: 'copy', path: selected.path, parent: parentPath(selected.path), name });
  }
  function drop(event, parent) {
    event.preventDefault(); const path = event.dataTransfer.getData('application/x-player-path');
    if (!path) return;
    run(async () => {
      clean(); const source = data.entries.find(entry => entry.path === path); if (!source) return;
      let name = source.name;
      if (event.ctrlKey && data.entries.some(entry => entry.path === [parent, name].filter(Boolean).join('/'))) name = prompt('副本名称', name + ' · 副本');
      if (name) await mutate({ action: event.ctrlKey ? 'copy' : 'move', path, parent, name });
    });
  }
  function dropTarget(element, path) {
    element.ondragover = event => { event.preventDefault(); event.stopPropagation(); };
    element.ondrop = event => { event.stopPropagation(); drop(event, path); };
  }
  function openMenu(event, entry) {
    event.preventDefault(); if (dirty || busy) return;
    if (mode !== 'files') return;
    select(entry); menu.replaceChildren();
    if (entry) menu.append(action('打开', () => entry.type === 'file' ? show(entry) : enter(entry.path)));
    const items = [action('新建', create), action('重命名', rename), action('剪切', () => copy(true)), action('复制', () => copy()), action('粘贴', paste), action('建立副本', duplicate)];
    items[0].disabled = add.disabled;
    for (const index of [1, 2, 3, 5]) items[index].disabled = !entry || entry.type === 'file';
    items[4].disabled = pasteButton.disabled;
    menu.append(...items); menu.hidden = false;
    menu.style.left = Math.min(event.clientX, innerWidth - 180) + 'px';
    menu.style.top = Math.max(12, Math.min(event.clientY, innerHeight - 300)) + 'px';
  }
  function renderList() {
    list.replaceChildren();
    if (mode === 'relations') { renderOverview(); return; }
    const all = data.entries.filter(entry => parentPath(entry.path) === current);
    const query = search.value.trim().toLocaleLowerCase(), visible = all.filter(entry => entry.name.toLocaleLowerCase().includes(query));
    count.textContent = query ? `${visible.length} / ${all.length} 项` : `${all.length} 项`;
    for (const entry of visible) {
      const row = el('button', undefined, 'player-file'); row.type = 'button'; row.dataset.playerPath = entry.path;
      const icon = el('span', entry.type === 'file' ? '▤' : '▱'); icon.setAttribute('aria-hidden', 'true');
      row.append(icon, el('strong', entry.name)); row.classList.toggle('selected', selected?.path === entry.path);
      if (entry.type === 'player') row.append(el('small', data.entries.filter(item => item.type === 'character' && parentPath(item.path) === entry.path).length + ' 个角色'));
      if (entry.type === 'character') row.append(el('small', '单击管理归属 · 双击查看等级'));
      row.draggable = entry.type !== 'file';
      row.ondragstart = event => {
        if (dirty || busy) { event.preventDefault(); return; }
        event.dataTransfer.setData('application/x-player-path', entry.path); event.dataTransfer.effectAllowed = 'copyMove';
      };
      row.onclick = () => {
        if (busy) return;
        try { clean(); select(entry); show(entry).catch(error => { status.textContent = error.message; }); }
        catch (error) { status.textContent = error.message; }
      };
      row.ondblclick = () => entry.type !== 'file' && run(() => enter(entry.path));
      row.oncontextmenu = event => { event.stopPropagation(); openMenu(event, entry); };
      if (entry.type !== 'file') dropTarget(row, entry.path);
      list.append(row);
    }
    if (!visible.length) list.append(el('p', query ? '没有匹配项，清空搜索即可查看全部。' : current.split('/').length >= 3 ? '此等级缺少选择.md或能力.md，请核对本地目录。' : '此处还没有内容，点击“新建”添加。', 'player-empty'));
  }
  function renderOverview() {
    const query = search.value.trim().toLocaleLowerCase(); let visibleCount = 0;
    const includes = values => values.filter(Boolean).join(' ').toLocaleLowerCase().includes(query);
    for (const player of relations.players) {
      const characters = relations.characters.filter(character => character.ownerId === player.id);
      const visible = characters.filter(character => (!unassigned.checked || character.memberships.length === 0) && includes([player.name, character.name,
        character.memberships.length ? '' : '未入团', ...character.memberships.map(ref => relations.runs.find(run => runKey(run) === runKey(ref))).flatMap(run => run ? [run.moduleName, run.runName] : ['暂不可用'])]));
      if (!visible.length && (unassigned.checked || !includes([player.name]))) continue;
      const section = el('section', undefined, 'player-relation-group'), header = el('header');
      const playerEntry = data.entries.find(entry => entry.path === player.path);
      const name = action(player.name, () => { clean(); select(playerEntry); return show(playerEntry); }); name.disabled = !playerEntry;
      header.append(name, el('small', characters.length + ' 个角色'), action('新建角色', async () => {
        clean(); const name = prompt('角色名-模组', '');
        if (name?.trim()) { search.value = ''; await mutate({ action: 'create', parent: player.path, name: name.trim() }, { focusPath: player.path + '/' + name.trim() }); }
      }));
      section.append(header);
      for (const character of visible) {
        const entry = data.entries.find(item => item.path === character.path);
        const row = action('', () => { clean(); if (!entry) throw new Error('档案位置已变化，请刷新。'); select(entry); return show(entry); });
        row.className = 'player-relation-character'; row.dataset.relationCharacter = character.id; row.dataset.playerPath = character.path;
        row.classList.toggle('selected', selected?.path === character.path);
        const memberships = character.memberships.map(ref => relations.runs.find(run => runKey(run) === runKey(ref))).filter(Boolean);
        const missing = character.memberships.length - memberships.length;
        const groupText = [...memberships.map(run => run.moduleName + ' / ' + run.runName), ...(missing ? [missing + ' 个团暂不可用，原关联保留'] : [])];
        row.append(el('strong', character.name), el('span', '所属玩家：' + player.name), el('small', groupText.length ? groupText.join('；') : '未入团'));
        section.append(row); visibleCount++;
      }
      if (!characters.length) section.append(el('p', '还没有角色，点击“新建角色”添加。', 'player-empty'));
      else if (!visible.length) section.append(el('p', '此玩家下没有匹配角色。', 'player-empty'));
      list.append(section);
    }
    const legacy = el('section', undefined, 'player-legacy-roles');
    for (const run of unassigned.checked ? [] : relations.runs) for (const character of run.characters.filter(member => !member.managed)) {
      if (!includes([run.moduleName, run.runName, character.name, character.playerName])) continue;
      const row = el('article');
      row.append(el('strong', character.name), el('p', run.moduleName + ' / ' + run.runName), el('small', '未关联档案' + (character.playerName ? ' · 原玩家：' + character.playerName : '')));
      legacy.append(row);
    }
    if (legacy.children.length) {
      legacy.prepend(el('h3', '已有团名单 · 未关联档案'), el('p', '选择左侧已有角色，在参加团设置中明确关联团内对应角色；不会按同名自动合并。', 'player-help'));
      list.append(legacy);
    }
    count.textContent = visibleCount + ' 个角色';
    if (!list.children.length) list.append(el('p', unassigned.checked ? '没有匹配的未入团角色。取消“只看未入团”可查看其他角色。' : query ? '没有匹配的玩家、角色或团。清空搜索可查看全部。' : '还没有玩家档案，点击“新建玩家”开始。', 'player-empty'));
  }
  function render() {
    serial++; menu.hidden = true; detail.replaceChildren(el('p', '单击角色管理所属玩家或查看最新能力；双击文件夹进入。', 'player-empty'));
    dialog.dataset.playerView = mode;
    relationsTab.setAttribute('aria-pressed', String(mode === 'relations')); filesTab.setAttribute('aria-pressed', String(mode === 'files'));
    search.placeholder = mode === 'relations' ? '搜索玩家、角色、模组或团' : '搜索当前文件夹';
    search.setAttribute('aria-label', mode === 'relations' ? '搜索玩家、角色或团' : '搜索当前玩家文件夹');
    crumb.hidden = mode === 'relations';
    unassignedLabel.hidden = mode !== 'relations';
    crumb.replaceChildren(action('玩家', () => enter(''))); dropTarget(crumb.firstElementChild, '');
    current.split('/').filter(Boolean).forEach((part, index, parts) => {
      const path = parts.slice(0, index + 1).join('/'), button = action(part, () => enter(path)); dropTarget(button, path); crumb.append(el('span', ' / '), button);
    });
    renderList(); syncActions();
  }
  async function showCharacter(entry) {
    const ownerPath = parentPath(entry.path), owner = data.entries.find(item => item.path === ownerPath);
    const panel = el('section', undefined, 'player-owner-panel'), label = el('label', '所属玩家'), selectOwner = el('select');
    selectOwner.setAttribute('aria-label', '角色所属玩家');
    for (const player of data.entries.filter(item => item.type === 'player')) { const option = el('option', player.name); option.value = player.path; selectOwner.append(option); }
    selectOwner.value = ownerPath; label.append(selectOwner);
    const apply = action('更换所属玩家', async () => {
      if (selectOwner.value === ownerPath) return;
      const nextOwner = selectOwner.value, nextPath = nextOwner + '/' + entry.name;
      search.value = '';
      await mutate({ action: 'move', path: entry.path, parent: nextOwner }, { allowDraft: true, directory: nextOwner, focusPath: nextPath, message: '所属玩家已更换，本地目录已同步。' });
    });
    apply.disabled = true;
    selectOwner.onchange = () => {
      if (dirty && dirty !== 'owner') { selectOwner.value = ownerPath; status.textContent = '请先保存或放弃参加团修改，再更换所属玩家。'; return; }
      dirty = selectOwner.value === ownerPath ? '' : 'owner'; apply.disabled = !dirty;
    };
    const discard = action('放弃归属修改', () => { if (dirty && dirty !== 'owner') throw new Error('请先保存或放弃参加团修改。'); dirty = ''; return show(entry); });
    panel.append(el('p', '当前玩家：' + (owner?.name || ownerPath)), label, apply, discard, el('p', '更换后将移动角色档案；旧所属玩家不再因此获得该角色资料。', 'player-help'));
    const levelNumber = item => Number.isInteger(item.level) ? item.level : /^\d{1,2}级$/.test(item.name) ? Number.parseInt(item.name) : 0;
    const levels = data.entries.filter(item => item.type === 'level' && parentPath(item.path) === entry.path && levelNumber(item) > 0)
      .sort((a, b) => levelNumber(b) - levelNumber(a) || b.name.localeCompare(a.name));
    const latest = levels.map(level => data.entries.find(item => item.path === level.path + '/能力.md')).find(Boolean);
    const quick = el('div', undefined, 'player-quick-actions');
    quick.append(action('打开等级文件夹', () => enter(entry.path)));
    const ability = action('查看最新等级能力', () => { clean(); mode = 'files'; current = parentPath(latest.path); search.value = ''; render(); select(latest); return show(latest); });
    ability.disabled = !latest; quick.append(ability);
    detail.append(panel, quick, el('p', latest ? '最新记录：' + parentPath(latest.path).split('/').at(-1) : '还没有能力记录。进入角色文件夹新建等级即可生成模版。', 'player-help'));
    const character = relations.characters.find(item => item.path === entry.path);
    if (character) showMemberships(entry, character);
    else detail.append(el('p', '此角色暂不能关联团，请刷新并核对档案身份。', 'player-help'));
  }
  function showMemberships(entry, character) {
    const initial = new Set(character.memberships.map(runKey)), selection = new Set(initial), legacySelection = new Map();
    const section = el('section', undefined, 'player-memberships'), choices = el('details'), summary = el('summary');
    const legacyForms = el('div', undefined, 'player-legacy-selection'), changes = el('p', '', 'player-help');
    choices.append(summary); section.append(el('h4', '参加的团'), el('p', '同一角色可参加多个团，共用档案，各团进度独立。这里的勾选只管理参团关系。', 'player-help'), choices, legacyForms, changes);
    const nameFor = key => { const run = relations.runs.find(run => runKey(run) === key); return run ? run.moduleName + ' / ' + run.runName : key; };
    const changed = () => selection.size !== initial.size || [...selection].some(key => !initial.has(key)) || legacySelection.size > 0;
    const save = action('保存参加的团', async () => {
      if (dirty && dirty !== 'memberships') throw new Error('请先保存或放弃所属玩家修改。');
      const runRefs = [...selection].map(key => {
        const run = relations.runs.find(run => runKey(run) === key) || character.memberships.find(run => runKey(run) === key);
        return { moduleId: run.moduleId, runId: run.runId, ...(legacySelection.get(key) ? { legacyCharacterId: legacySelection.get(key) } : {}) };
      });
      await api('/api/library/player-relations', { characterId: character.id, runRefs, expectedRevision: relations.revision, expectedPlayerRevision: relations.playerRevision });
      dirty = '';
      [data, relations] = await Promise.all([api('/api/library/players'), api('/api/library/player-relations')]);
      const freshCharacter = relations.characters.find(item => item.id === character.id);
      const next = freshCharacter && data.entries.find(item => item.path === freshCharacter.path);
      selected = next || null; render(); if (next) { select(next); await show(next); }
      status.textContent = '参加的团已保存；当前正在游玩的团保持不变。';
    }); save.disabled = true;
    const discard = action('放弃参加团修改', () => { if (dirty && dirty !== 'memberships') throw new Error('请先保存或放弃所属玩家修改。'); dirty = ''; return show(entry); });
    function update() {
      dirty = changed() ? 'memberships' : ''; save.disabled = !dirty;
      summary.textContent = '选择参加的团（' + selection.size + '）';
      const added = [...selection].filter(key => !initial.has(key)), removed = [...initial].filter(key => !selection.has(key));
      changes.textContent = [added.length ? '将加入：' + added.map(nameFor).join('、') : '', removed.length ? '将移出：' + removed.map(nameFor).join('、') : '', legacySelection.size ? '将关联选定的已有团内角色；保留其历史记录。' : ''].filter(Boolean).join('；') || '尚无未保存的参团变化。';
    }
    function renderLegacyChoices() {
      legacyForms.replaceChildren();
      for (const run of relations.runs.filter(run => selection.has(runKey(run)) && !initial.has(runKey(run)))) {
        const available = run.characters.filter(member => !member.managed);
        const label = el('label', run.moduleName + ' / ' + run.runName + ' · 团内对应角色'), picker = el('select');
        picker.setAttribute('aria-label', run.runName + '的团内对应角色');
        const newMember = el('option', '新加入'); newMember.value = ''; picker.append(newMember);
        for (const member of available) { const option = el('option', '关联已有：' + member.name + (member.playerName ? '（' + member.playerName + '）' : '')); option.value = member.id; picker.append(option); }
        picker.value = legacySelection.get(runKey(run)) || '';
        picker.onchange = () => {
          if (dirty && dirty !== 'memberships') { picker.value = legacySelection.get(runKey(run)) || ''; status.textContent = '请先保存或放弃所属玩家修改。'; return; }
          if (picker.value) legacySelection.set(runKey(run), picker.value); else legacySelection.delete(runKey(run)); update();
        };
        label.append(picker); legacyForms.append(label);
        if (available.some(member => member.name === character.name || character.name.startsWith(member.name + '-'))) legacyForms.append(el('p', '名单中有同名角色，请自行选择是否关联。', 'player-help'));
      }
    }
    const groups = new Map();
    for (const run of relations.runs) {
      if (!groups.has(run.moduleId)) { const group = el('fieldset'); group.append(el('legend', run.moduleName)); choices.append(group); groups.set(run.moduleId, group); }
      const label = el('label'), checkbox = el('input'), key = runKey(run);
      checkbox.type = 'checkbox'; checkbox.value = JSON.stringify({ moduleId: run.moduleId, runId: run.runId }); checkbox.dataset.relationRun = key;
      checkbox.setAttribute('aria-label', run.moduleName + ' / ' + run.runName); checkbox.checked = selection.has(key);
      checkbox.onchange = () => {
        if (dirty && dirty !== 'memberships') { checkbox.checked = selection.has(key); status.textContent = '请先保存或放弃所属玩家修改，再调整参加的团。'; return; }
        if (checkbox.checked) selection.add(key); else { selection.delete(key); legacySelection.delete(key); }
        update(); renderLegacyChoices();
      };
      label.append(checkbox, el('span', run.runName)); groups.get(run.moduleId).append(label);
    }
    const missing = character.memberships.filter(ref => !relations.runs.some(run => runKey(run) === runKey(ref)));
    if (missing.length) {
      const group = el('fieldset'); group.append(el('legend', '暂不可用的团'), el('p', '原关联仍保留。恢复模组目录后刷新，或明确取消勾选以移出。', 'player-help'));
      for (const reference of missing) {
        const key = runKey(reference), label = el('label'), checkbox = el('input');
        checkbox.type = 'checkbox'; checkbox.checked = selection.has(key); checkbox.dataset.relationRun = key;
        checkbox.setAttribute('aria-label', '暂不可用的团 ' + key);
        checkbox.onchange = () => {
          if (dirty && dirty !== 'memberships') { checkbox.checked = selection.has(key); status.textContent = '请先保存或放弃所属玩家修改。'; return; }
          if (checkbox.checked) selection.add(key); else selection.delete(key); update();
        };
        label.append(checkbox, el('span', key)); group.append(label);
      }
      choices.append(group);
    }
    summary.textContent = '选择参加的团（' + selection.size + '）';
    if (!relations.runs.length) choices.append(el('p', '还没有可参加的团。请先在模组窗口建立团，再刷新。'));
    changes.textContent = '尚无未保存的参团变化。'; section.append(save, discard);
    detail.append(section);
    const invites = el('section', undefined, 'player-run-invites');
    for (const run of relations.runs.filter(run => initial.has(runKey(run)))) {
      const member = run.characters.find(item => item.managed && item.archiveCharacterId === character.id);
      if (!member) continue;
      const row = el('div', undefined, 'player-invite-row'), controls = el('div');
      row.append(el('strong', run.moduleName + ' / ' + run.runName), controls);
      const invite = action('生成本机邀请', async () => {
        clean(); const result = await api('/api/library/invites', { moduleId: run.moduleId, runId: run.runId, playerId: member.playerId, expectedRevision: relations.revision });
        relations = await api('/api/library/player-relations');
        const url = new URL(location.pathname, location.origin); url.hash = 'invite=' + encodeURIComponent(result.token);
        const field = el('input'); field.type = 'text'; field.readOnly = true; field.value = url.href; field.setAttribute('aria-label', run.runName + '的本机邀请链接');
        controls.replaceChildren(field, action('复制本机邀请链接', async () => { try { await navigator.clipboard.writeText(field.value); status.textContent = '邀请链接已复制。'; } catch { field.focus(); field.select(); status.textContent = '链接已选中，可按Ctrl+C复制。'; } }), action('撤销此邀请', async () => {
          clean(); await api('/api/library/invites/revoke', { moduleId: run.moduleId, runId: run.runId, inviteId: result.inviteId, expectedRevision: relations.revision });
          relations = await api('/api/library/player-relations'); controls.replaceChildren(invite); status.textContent = '此邀请已撤销。';
        })); status.textContent = '已生成指定团的本机邀请，当前团保持不变。';
      }); invite.setAttribute('aria-label', run.moduleName + ' / ' + run.runName + '的本机邀请'); controls.append(invite); invites.append(row);
    }
    if (invites.children.length) { invites.prepend(el('h4', '已参加团的玩家入口')); detail.append(invites); }
  }
  async function show(entry) {
    const request = ++serial; detail.replaceChildren(el('h3', entry.name));
    detail.scrollTop = 0;
    if (entry.type === 'character') { await showCharacter(entry); return; }
    if (entry.type === 'player') {
      const characters = data.entries.filter(item => item.type === 'character' && parentPath(item.path) === entry.path);
      const quick = el('div', undefined, 'player-character-links');
      for (const character of characters) quick.append(action(character.name, () => { clean(); current = entry.path; search.value = ''; render(); select(character); return show(character); }));
      detail.append(el('p', characters.length + ' 个角色'), quick, action('打开玩家文件夹', () => enter(entry.path)));
      const context = await api('/api/library/context'); if (request !== serial) return;
      const original = new Set(entry.linkedPlayerIds || []), selection = new Set(original), choices = el('details'), summary = el('summary', '已有邀请兼容设置');
      choices.append(summary);
      const save = action('保存绑定', () => mutate({ action: 'bind', path: entry.path, playerIds: [...selection] }, { allowDraft: true, focusPath: entry.path }));
      save.disabled = true;
      for (const character of context.characters || []) {
        const label = el('label'), check = el('input'); check.type = 'checkbox'; check.checked = selection.has(character.playerId); check.dataset.playerIdentity = character.playerId;
        check.onchange = () => {
          if (check.checked) selection.add(character.playerId); else selection.delete(character.playerId);
          for (const input of choices.querySelectorAll('input')) input.checked = selection.has(input.dataset.playerIdentity);
          dirty = selection.size !== original.size || [...selection].some(id => !original.has(id)) ? 'binding' : ''; save.disabled = !dirty;
        };
        label.append(check, el('span', character.name)); choices.append(label);
      }
      if (!context.characters?.length) choices.append(el('p', '当前团没有可绑定身份。现有绑定保持不变。'));
      choices.append(el('p', '仅为之前生成的邀请补充档案访问权限。新角色参加团后无需在此重复设置；此处不会改变角色所属玩家或参加的团。', 'player-help'), save, action('放弃绑定修改', () => { dirty = ''; return show(entry); }));
      detail.append(choices);
      return;
    }
    if (entry.type !== 'file') { detail.append(action('打开文件夹', () => enter(entry.path))); return; }
    const value = await api('/api/library/player-file?' + new URLSearchParams({ path: entry.path })); if (request !== serial) return;
    data = { entries: value.entries, issues: value.issues, revision: value.revision };
    renderList(); syncActions();
    const textarea = el('textarea'); textarea.value = value.text; textarea.setAttribute('aria-label', '编辑' + entry.name); textarea.hidden = true;
    textarea.oninput = () => { dirty = textarea.value === value.text ? '' : 'md'; };
    const sourceText = value.text.replace(/^\uFEFF/, '');
    const markdown = sourceText.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    const preview = renderResourceMarkdown(markdown);
    detail.append(action('编辑MD', () => { textarea.hidden = false; preview.hidden = true; textarea.focus(); }), action('保存', async () => {
      const result = await api('/api/library/players', { action: 'save', path: entry.path, text: textarea.value, expectedRevision: data.revision });
      dirty = ''; data = result; await show(entry); status.textContent = 'MD已保存。';
    }), action('放弃修改', () => { dirty = ''; return show(entry); }), preview, textarea);
    if (entry.name === '能力.md') {
      const imageStatus = el('p', '正在读取能力档案的本地图片…', 'player-help'); imageStatus.setAttribute('role', 'status');
      preview.append(imageStatus);
      try {
        const header = sourceText.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        const resourceId = header && JSON.parse(header[1]).id;
        if (typeof resourceId !== 'string' || !resourceId) throw new Error('能力档案缺少有效资源身份。');
        const resource = await api('/api/library/read?' + new URLSearchParams({ resourceId }));
        if (request !== serial) return;
        if (resource.resource?.scope !== 'player' || resource.resource?.path !== '资源/玩家/' + entry.path) throw new Error('图片对应的档案位置已变化，请刷新核对。');
        const rendered = renderResourceMarkdown(markdown, resource.images || []);
        preview.replaceChildren(...rendered.childNodes);
        if (resource.imageIssues?.length) preview.append(el('p', '部分图片未加载：' + resource.imageIssues.map(issue => issue.reason || issue.error || issue.source).join('；') + '。文字与编辑内容已保留。', 'player-help'));
      } catch (error) {
        if (request !== serial) return;
        imageStatus.textContent = '图片读取失败：' + error.message + ' 文字与编辑内容已保留；可刷新后重试。';
      }
    }
  }
  search.oninput = renderList;
  unassigned.onchange = renderList;
  list.ondragover = event => { if (mode === 'files') event.preventDefault(); }; list.ondrop = event => { if (mode === 'files') drop(event, current); };
  list.oncontextmenu = event => openMenu(event, null);
  dialog.addEventListener('cancel', event => { if (dirty || busy) { event.preventDefault(); status.textContent = busy ? '正在保存，请稍候。' : '请先保存或放弃当前修改。'; } });
  dialog.addEventListener('keydown', event => {
    if (mode !== 'files' || event.target.matches('textarea,input,select')) return;
    if (event.ctrlKey && ['c', 'x', 'v'].includes(event.key.toLowerCase())) { event.preventDefault(); run(() => event.key.toLowerCase() === 'v' ? paste() : copy(event.key.toLowerCase() === 'x')); }
  });
  dialog.addEventListener('click', event => { if (!menu.contains(event.target)) menu.hidden = true; });
  return {
    hasDraft: () => !!dirty || busy,
    clear() { serial++; dirty = ''; selected = null; clipboard = null; data = { entries: [], revision: '' }; relations = { players: [], characters: [], runs: [], issues: [] }; current = ''; mode = 'relations'; search.value = ''; unassigned.checked = false; dialog.close(); list.replaceChildren(); detail.replaceChildren(); status.textContent = ''; },
    async open() { if (getRole() !== 'dm') return; if (!dialog.open) dialog.showModal(); await run(refresh); }
  };
}

const $ = id => document.getElementById(id);
const sceneNames = new Set(['setup', 'terrain']);
const dmTools = new Set(['workspace', 'setup', 'terrain', 'actor', 'sharing', 'files']);

export function initShell() {
  const compact = window.matchMedia('(max-width: 1100px)');
  const workspace = $('table-workspace'), actionPanel = $('action-panel');
  const operationsPanel=document.createElement('aside');operationsPanel.id='operations-panel';operationsPanel.className='right-panel panel';operationsPanel.setAttribute('aria-label','分类常规操作');
  operationsPanel.append($('hotbar-section'));workspace.append(operationsPanel);
  const collapsed={actor:false,operations:false};
  function buildSidebar(panel,key,title) {
    panel.classList.add('battle-sidebar');
    const body=document.createElement('div');body.id=`${key}-sidebar-body`;body.className='sidebar-body';body.append(...panel.childNodes);
    const heading=document.createElement('header');heading.className='sidebar-heading';const h=document.createElement('h2');h.textContent=title;
    const toggle=document.createElement('button');toggle.type='button';toggle.id=`toggle-${key}-sidebar`;toggle.className='sidebar-toggle';toggle.setAttribute('aria-controls',body.id);
    toggle.addEventListener('click',()=>setCollapsed(key,!collapsed[key]));heading.append(h,toggle);panel.append(heading,body);
    return {panel,body,toggle,title};
  }
  const sidebars={actor:buildSidebar(actionPanel,'actor','棋子与资源'),operations:buildSidebar(operationsPanel,'operations','常规操作')};
  const operationCaption=document.createElement('p');operationCaption.id='operations-selected-name';operationCaption.className='sidebar-selected-name';sidebars.operations.body.prepend(operationCaption);
  const empty=document.createElement('p');empty.id='operations-empty';empty.className='fine';empty.textContent='此视角不显示该棋子的操作资料，请选择自己的角色。';empty.hidden=true;sidebars.operations.body.append(empty);
  function setCollapsed(key,value) {
    const sidebar=sidebars[key];collapsed[key]=value;sidebar.body.hidden=value;sidebar.panel.classList.toggle('is-collapsed',value);
    sidebar.toggle.textContent=value?'‹':'›';sidebar.toggle.setAttribute('aria-expanded',String(!value));
    sidebar.toggle.setAttribute('aria-label',`${value?'展开':'收起'}${sidebar.title}栏`);sidebar.toggle.title=sidebar.toggle.getAttribute('aria-label');
    workspace.dataset[`${key}Collapsed`]=String(value);
  }
  for(const key of Object.keys(sidebars))setCollapsed(key,false);
  const switcher=document.createElement('nav');switcher.className='sidebar-switcher';switcher.setAttribute('aria-label','右栏快捷定位');
  for(const [name,label] of [['actions','棋子与资源'],['operations','常规操作']]) {const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',()=>openTool(name));switcher.append(button);}
  $('actions-dialog').querySelector('.dialog-heading').after(switcher);
  const dialogs = new Map([...document.querySelectorAll('[data-dialog]')].map(dialog => [dialog.dataset.dialog, dialog]));
  const returnFocus = new Map();
  let currentState = null, contextKey = '', sceneReturnFocus = null;

  const visible = element => element?.isConnected && !element.disabled && element.getClientRects().length > 0;
  function focusBack(element) {
    const target = visible(element) ? element : $('viewport');
    if (visible(target)) target.focus({ preventScroll: true });
  }
  function triggerFor(name, candidate = document.activeElement) {
    if (visible(candidate) && candidate !== document.body && !candidate.closest('dialog')) return candidate;
    return [...document.querySelectorAll(`button[data-tool="${name}"]`)].find(visible);
  }
  function closeDialog(dialog, restore = true) {
    if (!dialog?.open) return;
    if ($('toast').parentElement === dialog) document.body.append($('toast'));
    dialog.close();
    if (restore) focusBack(returnFocus.get(dialog));
    returnFocus.delete(dialog);
  }
  function closeScene(restore = true) {
    if ($('scene-tools').hidden) return;
    $('scene-tools').hidden = true;
    delete workspace.dataset.sceneTool;
    document.querySelectorAll('button[data-tool="setup"], button[data-tool="terrain"]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    if (restore) focusBack(sceneReturnFocus);
    sceneReturnFocus = null;
  }
  function closeTools({ restoreFocus = true } = {}) {
    const activeDialog = [...dialogs.values()].find(dialog => dialog.open);
    const target = activeDialog ? returnFocus.get(activeDialog) : sceneReturnFocus;
    for (const dialog of dialogs.values()) closeDialog(dialog, false);
    closeScene(false);
    document.querySelectorAll('.session-menu').forEach(menu => { menu.open = false; });
    if (restoreFocus) focusBack(target);
  }
  function focusSidebar(key) {
    const panel=sidebars[key].panel;panel.tabIndex=-1;
    if(compact.matches)panel.scrollIntoView({block:'start'});
    panel.focus({preventScroll:true});
  }
  function openTool(name) {
    if (!currentState || (dmTools.has(name) && currentState.viewRole !== 'dm')) return false;
    const trigger = triggerFor(name);
    document.querySelectorAll('.session-menu').forEach(menu => { menu.open = false; });
    if (sceneNames.has(name)) {
      for (const dialog of dialogs.values()) closeDialog(dialog, false);
      if ($('scene-tools').hidden) sceneReturnFocus = trigger;
      $('scene-tools').hidden = false;
      $('scene-tools').dataset.tool = name;
      workspace.dataset.sceneTool = name;
      $('scene-tool-title').textContent = name === 'setup' ? '布置棋子' : '盘面与地形';
      $('terrain-panel').open = true;
      document.querySelectorAll('button[data-tool="setup"], button[data-tool="terrain"]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === name)));
      $('scene-tools').querySelector('[data-close-tool]').focus({ preventScroll: true });
      return true;
    }
    const sidebarKey=name==='actions'?'actor':name==='operations'?'operations':null;
    if(sidebarKey) {
      setCollapsed(sidebarKey,false);
      if(!compact.matches) {
        for(const other of dialogs.values())closeDialog(other,false);
        focusSidebar(sidebarKey);return true;
      }
    }
    const dialog = dialogs.get(sidebarKey?'actions':name);
    if (!dialog) return false;
    if (dialog.open) {if(sidebarKey)focusSidebar(sidebarKey);return true;}
    for (const other of dialogs.values()) closeDialog(other, false);
    if (name === 'actor') $('edit-details').open = true;
    if (name === 'exchange') $('exchange-panel').open = true;
    returnFocus.set(dialog, trigger);
    dialog.append($('toast'));
    dialog.showModal();
    if(sidebarKey)focusSidebar(sidebarKey);
    return true;
  }
  function placeActions() {
    if (compact.matches) {
      if (actionPanel.parentElement !== $('actions-slot')) $('actions-slot').append(actionPanel,operationsPanel);
    } else {
      closeDialog(dialogs.get('actions'), false);
      if (actionPanel.parentElement !== workspace) workspace.append(actionPanel,operationsPanel);
    }
  }
  function update(state) {
    currentState = state;
    if (!state) { closeTools({ restoreFocus: false }); contextKey = '';operationCaption.textContent='';for(const key of Object.keys(sidebars))setCollapsed(key,false);return; }
    const nextKey = `${state.campaignId}/${state.battleId}/${state.viewRole}/${state.viewerId || ''}`;
    if (contextKey && contextKey !== nextKey) closeTools({ restoreFocus: false });
    contextKey = nextKey;
    operationCaption.textContent=$('selected-name').textContent;
    $('table').dataset.phase = state.combat?.phase || 'preparing';
    $('table').dataset.role = state.viewRole;
    document.querySelectorAll('[data-dm-only]').forEach(element => { element.hidden = state.viewRole !== 'dm'; });
    const latest = state.events?.at(-1);
    $('latest-event-text').textContent = latest ? (state.viewRole === 'dm' ? latest.dmText || latest.text : latest.text) || '已保存新的操作' : '这里会留下每一步已保存的结果';
    placeActions();
  }

  document.addEventListener('click', event => {
    const open = event.target.closest('button[data-tool]');
    if (open) { openTool(open.dataset.tool); return; }
    const close = event.target.closest('[data-close-tool]');
    if (close) {
      const dialog = close.closest('dialog');
      dialog ? closeDialog(dialog) : closeScene();
    }
    if (!event.target.closest('.session-menu')) document.querySelectorAll('.session-menu').forEach(menu => { menu.open = false; });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || [...dialogs.values()].some(dialog => dialog.open)) return;
    if (!$('scene-tools').hidden) { event.preventDefault(); closeScene(); }
    document.querySelectorAll('.session-menu').forEach(menu => { menu.open = false; });
  });
  for (const dialog of dialogs.values()) {
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog);
    });
  }
  compact.addEventListener('change', placeActions);
  placeActions();
  return { openTool, closeTools, update };
}

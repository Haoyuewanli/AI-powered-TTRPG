const $ = id => document.getElementById(id);
const sceneNames = new Set(['setup', 'terrain']);
const dmTools = new Set(['workspace', 'setup', 'terrain', 'actor', 'sharing', 'files']);

export function initShell() {
  const compact = window.matchMedia('(max-width: 1100px)');
  const workspace = $('table-workspace'), actionPanel = $('action-panel');
  const consolePanel = document.createElement('section'); consolePanel.id='battle-console'; consolePanel.className='panel'; consolePanel.setAttribute('aria-label','数值资源与操作');
  const consoleTitle=document.createElement('strong');consoleTitle.id='dock-selected-name';consolePanel.append(consoleTitle);document.querySelector('.board-region').append(consolePanel);
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
    if (name === 'actions' && !compact.matches) {
      actionPanel.tabIndex = -1;
      actionPanel.focus({ preventScroll: true });
      return true;
    }
    const dialog = dialogs.get(name);
    if (!dialog) return false;
    if (dialog.open) return true;
    for (const other of dialogs.values()) closeDialog(other, false);
    if (name === 'actor') $('edit-details').open = true;
    if (name === 'exchange') $('exchange-panel').open = true;
    returnFocus.set(dialog, trigger);
    dialog.append($('toast'));
    dialog.showModal();
    return true;
  }
  function placeActions() {
    if (compact.matches) {
      consolePanel.hidden=true;
      if ($('actor-info').parentElement !== actionPanel) { const selected=actionPanel.querySelector('.selected-heading');selected.after($('actor-info'));$('actor-info').after($('resource-section')); }
      if (actionPanel.parentElement !== $('actions-slot')) $('actions-slot').append(actionPanel);
    } else {
      consolePanel.hidden=false;if ($('actor-info').parentElement !== consolePanel) consolePanel.append($('actor-info'),$('resource-section'));
      closeDialog(dialogs.get('actions'), false);
      if (actionPanel.parentElement !== workspace) workspace.append(actionPanel);
    }
  }
  function update(state) {
    currentState = state;
    if (!state) { closeTools({ restoreFocus: false }); contextKey = ''; return; }
    const nextKey = `${state.campaignId}/${state.battleId}/${state.viewRole}/${state.viewerId || ''}`;
    if (contextKey && contextKey !== nextKey) closeTools({ restoreFocus: false });
    contextKey = nextKey;
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

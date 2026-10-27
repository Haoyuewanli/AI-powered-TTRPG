import { BattleBoard } from '/board.mjs';
import { largestFaces } from '/geometry.mjs';
import { terrainPanel } from '/terrain-panel.mjs';
import { workspacePanel } from '/workspace-panel.mjs';
import { dicePanel } from '/dice-panel.mjs';
import { initShell } from '/shell.mjs';
import { filesPanel } from '/files-panel.mjs';
import { sharingPanel } from '/sharing-panel.mjs';
import { actionId, copyText } from '/client-utils.mjs';
import { valueBars } from '/value-bars.mjs';
import { resourcePanel } from '/resource-panel.mjs';
import { actionPanel } from '/action-panel.mjs';
import { resourceOrbit } from '/resource-orbit.mjs';
import { resourceView } from '/resources.mjs';

const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('battle-session') || '';
let state = null, selectedId = null, board = null, busy = false, polling = false;
let dirty = false, editingRevision = null, toastTimer, selection, library, dice, terrain, previewedProposal, shell, sharing, files;
let clientAudience = 'local', connected = true, sessionEpoch = 0, manualContext = '';
let resources, operations, orbit;
const cancelled = () => Object.assign(new Error('操作所属的会话已结束'), { cancelled: true });
const contextKey = () => state ? `${state.campaignId}/${state.battleId}` : '';
const formFields = ['name', 'ac', 'hp', 'maxHp', 'tempHp', 'speed', 'initiativeBonus', 'attackLimit', 'tiePriority', 'facing'];
const text = (tag, value, className) => { const item = document.createElement(tag); item.textContent = value; if (className) item.className = className; return item; };
const actor = () => state?.actors.find(a => a.id === selectedId);
const currentId = () => state?.viewRole === 'dm' ? state.combat.order?.[state.combat.index] : state?.combat.currentActorId;
const isDm = () => state?.viewRole === 'dm';
const owns = a => isDm() || a?.ownerId === state?.viewerId;
const isTurn = a => a && currentId() === a.id && state.combat.phase === 'active';
function notify(message, error = false) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').className = error ? 'error' : '';
  $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 9000 : 4500);
}
const guarded = fn => async event => { event?.preventDefault(); try { await fn(event); } catch (error) { if (!error.cancelled) notify(error.message || '操作未完成，请刷新后核对。', true); } };
async function api(path, body) {
  const epoch = sessionEpoch, requestToken = token, context = contextKey();
  let response;
  try {
    response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch { if (epoch !== sessionEpoch || requestToken !== token) throw cancelled(); setConnection(false); throw new Error(clientAudience === 'player' ? '与主持电脑连接中断。正在重连，已提交的进度保留在主持电脑。' : '本地连接中断。重新双击“打开跑团”即可继续，已保存进度仍在本机。'); }
  let value;
  try { value = await response.json(); } catch {
    if (epoch !== sessionEpoch || requestToken !== token) throw cancelled();
    setConnection(false); throw new Error('连接暂时未就绪，正在重试。已保存的进度仍保留在主持电脑。');
  }
  if (epoch !== sessionEpoch || requestToken !== token) throw cancelled();
  if (context && context !== contextKey() && !['/api/select', '/api/campaigns', '/api/battles', '/api/logout', '/api/shutdown'].includes(path)) throw cancelled();
  Object.defineProperties(value, { requestEpoch: { value: epoch }, requestContext: { value: context }, requestPath: { value: path } });
  setConnection(true);
  if (!response.ok) { if ((response.status === 401 && path !== '/api/login') || value.code === 'CONTEXT_CHANGED') clearSession(); throw new Error(value.error || '请求失败'); }
  return value;
}
function clearSession() {
  sessionEpoch++; manualContext = '';
  token = ''; state = null; selectedId = null; dirty = false; editingRevision = null; selection = null;
  files?.clear(); library?.clear(); dice?.clear(); terrain?.clear(); sharing?.clear(); resources?.clear(); operations?.clear(); orbit?.clear(); shell?.update(null); clearPreview();
  sessionStorage.removeItem('battle-session');
  $('external-file-notice').hidden = true;
  $('table').hidden = true; $('login').hidden = false;
  for (const id of ['roster', 'actor-info', 'events', 'reference']) $(id).replaceChildren();
  for (const id of ['selected-name', 'selected-kind', 'turn-caption', 'title', 'role', 'save-status', 'recovery', 'latest-event-text', 'phase-label', 'board-size', 'round', 'dock-selected-name']) $(id).textContent = '';
  for (const item of $('table').querySelectorAll('input,textarea')) { item.value = ''; if (item.type === 'checkbox') item.checked = false; }
  for (const id of ['attack-choice', 'target-choice']) $(id).replaceChildren();
  board?.clear();
}
function ensureBoard() {
  if (board) return;
  try { board = new BattleBoard($('viewport'), choose, placeOnBoard, { canDrag: canDragActor, onDrop: dropActor,
    terrainEditing: () => terrain?.editing(), stamping: () => terrain?.stamping(), acceptsObject: o => terrain?.accepts(o),
    onSelectObject: id => {const accepted=terrain?.select(id); board?.update(state,selectedId);return accepted;}, canDragObject: () => terrain?.canDrag(),
    objectDestination: (...args) => terrain.destination(...args), objectIds: () => terrain?.selectedIds(),
    onObjectDrop: async (...args) => {try {await terrain.drop(...args);}catch(error){notify(error.message,true);}}, onHint: message => { const hint = $('drag-hint'); if (hint) { hint.textContent = message; hint.hidden = !message; } } }); }
  catch { $('board-error').textContent = '无法启用3D绘图，请检查浏览器硬件加速。可以继续用表单操作，正式进度保存在本机。'; $('board-error').hidden = false; }
}
function choose(id) {
  if (dirty && id !== selectedId) { notify('棋子设置尚未保存；请先保存或点击“放弃编辑并重载”。', true); return; }
  selectedId = id; render(true);
}
function fillEditor(a) {
  for (const key of formFields) $(`edit-${key}`).value = a[key];
  $('edit-x').value = a.position.x; $('edit-z').value = a.position.z; $('edit-y').value = a.position.y || 0;
  for (const key of ['width', 'depth', 'height']) $(`edit-${key}`).value = a.body[key];
  for (const key of ['width', 'depth']) $(`edit-space-${key}`).value = a.space[key];
  for (const key of ['immunities', 'resistances', 'vulnerabilities']) $(`edit-${key}`).value = a[key].join(',');
  for (const key of ['resources', 'notes']) $(`edit-${key}`).value = a[key];
  $('edit-attacks').value = JSON.stringify(a.attacks, null, 2);
  $('edit-hidden').checked = a.hidden; $('edit-confirmed').checked = a.confirmed;
  $('reference').textContent = JSON.stringify(a.reference || { note: '此棋子没有附加原始资料' }, null, 2);
  const look = a.appearance || { model: 'voxel', preset: a.kind === 'npc' ? 'monster' : 'human', skin: a.kind === 'npc' ? '#7aab75' : '#d6ae88', clothes: a.kind === 'pc' ? '#347e8b' : '#866158', hair: '#4d382c', weapon: 'none', material: 'iron', armor: {}, shield: false };
  for (const key of ['model','preset','skin','clothes','hair','weapon','material']) $(`look-${key}`).value = look[key];
  for (const key of ['head','chest','legs','feet']) $(`look-${key}`).value = look.armor[key] || 'none';
  $('look-shield').checked = look.shield;
  editingRevision = state.revision; dirty = false; $('dirty-indicator').textContent = '';
}
function render(selectionChanged = false) {
  if (!state) return;
  for (const node of document.querySelectorAll('[data-offline-disabled]')) { node.disabled = false; delete node.dataset.offlineDisabled; }
  $('login').hidden = true; $('table').hidden = false;
  ensureBoard();
  if (!actor()) selectedId = (state.actors.find(a => a.ownerId === state.viewerId) || state.actors[0])?.id;
  const a = actor(), current = state.actors.find(item => item.id === currentId());
  const nextManualContext = `${contextKey()}/${selectedId}`;
  if (manualContext !== nextManualContext) { $('manual-form').reset(); manualContext = nextManualContext; }
  $('title').textContent = state.title;
  $('role').textContent = isDm() ? 'DM · 完整视角' : '玩家 · 角色视角';
  $('save-status').textContent = busy ? '保存中…' : `${clientAudience === 'player' ? '主持端已保存' : '已保存'} · v${state.revision}`;
  $('round').textContent = state.combat.phase === 'active' ? `第 ${state.combat.round || 0} 轮` : '';
  $('phase-label').textContent = state.initiativeCollection ? '收集先攻' : state.combat.phase === 'active' ? '战斗中' : state.combat.phase === 'ended' ? '已结束' : '准备中';
  $('board-size').textContent = `${state.board.width} × ${state.board.depth} 尺`;
  $('turn-caption').textContent = state.combat.phase === 'active' ? `${current ? current.name : '未揭示参战者'} 的回合` : state.combat.phase === 'ended' ? '本场战斗已结束' : state.initiativeCollection ? '等待各位提交先攻' : '准备阶段 · 核对资料后收集先攻';
  $('roster').replaceChildren(...state.actors.map(item => {
    const button = document.createElement('button'); button.className = `roster-item${item.id === selectedId ? ' selected' : ''}`;
    button.dataset.actorId = item.id;
    if (state.combat.phase === 'active' && item.id === currentId()) button.append(text('span', '当前回合', 'tag'));
    button.append(text('strong', item.name));
    button.append(text('small', `${item.kind === 'pc' ? '玩家角色' : 'NPC'}${item.hidden ? ' · 对玩家隐藏' : ''} · ${'hp' in item ? `HP ${item.hp}/${item.maxHp}${item.confirmed ? '' : ' · 待核对'}` : '状态由DM掌握'}`));
    button.addEventListener('click', () => choose(item.id)); return button;
  }));
  $('start').hidden = !isDm(); $('end').hidden = !isDm();
  $('shutdown').hidden = !isDm();
  $('setup-panel').hidden = !isDm();
  for (const id of ['place-mode', 'place-actor', 'place-facing', 'clone-actor', 'remove-actor']) $(id).disabled = busy || state.combat.phase === 'active';
  $('add-actor-form').querySelector('button').disabled = busy || state.combat.phase === 'active';
  $('go-setup').hidden = !isDm();
  $('undo').hidden = !isDm(); $('undo').disabled = busy || !state.undoAvailable;
  $('undo').textContent = '撤销上一步'; $('undo').title = `可回退 ${state.undoAvailable || 0} 步，保留原始记录`;
  $('flow-title').textContent = isDm() ? 'DM主持流程' : '玩家操作流程';
  $('flow-text').textContent = state.combat.phase === 'ended' ? (isDm() ?
    '本场战斗已结束，进度已保存。可以查看战斗记录，或在“团与战斗”中新建下一场。' :
    '本场战斗已结束，进度已保存。可以查看战斗记录，等待主持安排下一场。') : isDm() ? (state.combat.phase === 'active' ?
    '正在战斗：选中当前行动者 → 移动或攻击 → 结束当前回合。NPC行动由你或外部AI选择；特殊效果用人工裁定。结束后可保留本场并新建下一场。' :
    '① 选择团与战斗 → ② 战前布置参战者 → ③ 核对资料并勾选“已核对” → ④ 选择程序骰或线下骰 → ⑤ 收集先攻后开始。下方“主持交接”可交给外部AI。') :
    '先在行动区提交自己的先攻。轮到你时拖动自己的棋子，或选择攻击与目标；需要的骰点都在行动区填写，完成后结束回合。';
  renderTasks();
  library?.render(state, selection);
  $('start').disabled = busy || state.combat.phase === 'active' || state.actors.some(item => !item.confirmed || item.hp <= 0) || dirty;
  $('start').textContent = state.initiativeCollection ? '先攻齐全，开始战斗' : '收集先攻';
  if (state.initiativeCollection && isDm()) $('start').disabled ||= state.actors.filter(item => item.hp > 0).some(item => !state.initiativeCollection.entries[item.id]);
  $('end').disabled = busy || state.combat.phase !== 'active';
  $('next').disabled = busy || state.combat.phase !== 'active' || !current || !owns(current);
  $('dash').disabled = busy || !isTurn(a) || !owns(a) || a.hp <= 0 || state.combat.action !== 'none';
  $('selected-name').textContent = a?.name || '选择棋子';
  if ($('dock-selected-name')) $('dock-selected-name').textContent = `${a?.name || '选择棋子'} · 数值与操作`;
  $('selected-kind').textContent = a ? a.kind === 'pc' ? 'PLAYER' : 'NPC' : '';
  $('actor-info').replaceChildren();
  if (a) {
    if ('hp' in a) {
      const stats = valueBars(state,a);
      $('actor-info').append(stats);
      $('actor-info').append(text('p', `${a.confirmed ? '资料已核对' : '资料待核对，尚不能开始'} · 速度 ${a.speed} 尺`, 'fine'));
      $('actor-info').append(text('p', a.resources, 'resource-note'));
    } else $('actor-info').append(text('p', '此视角不显示敌方精确数值和私密资料。', 'fine'));
    if (isDm() && a.kind === 'pc') $('actor-info').append(text('p', `玩家登录ID：${a.ownerId}（也可输入角色名）`, 'fine'));
    const face = largestFaces(a.body);
    const extra = text('details', '', 'actor-extra'); extra.append(text('summary', '位置与外观'));
    extra.append(text('p', `位置 (${a.position.x}, 高${a.position.y || 0}, ${a.position.z}) · 朝向 ${a.facing}°\n外观 ${a.body.width}×${a.body.depth}×${a.body.height} 尺\n占地 ${a.space.width}×${a.space.depth} 尺 · 最大两面 ${face.area} 平方尺`, 'resource-note')); $('actor-info').append(extra);
    if (isTurn(a) && owns(a)) $('actor-info').append(text('p', `本回合：移动 ${state.combat.moved || 0} 尺 · 已攻击 ${state.combat.attacksUsed || 0}/${a.attackLimit} 次 · 动作 ${state.combat.action}`, 'fine'));
    if (selectionChanged || !document.activeElement?.closest('#move-form')) {
      $('move-x').value = a.position.x; $('move-z').value = a.position.z;
      if (selectionChanged || !document.activeElement?.closest('#setup-panel')) { $('place-x').value = a.position.x; $('place-z').value = a.position.z; $('place-y').value = a.position.y || 0; $('place-facing').value = a.facing; }
    }
    const previousAttack = $('attack-choice').value, previousTarget = $('target-choice').value;
    $('attack-choice').replaceChildren(...(a.attacks || []).map(item => { const option = text('option', item.name); option.value = item.id; return option; }));
    if (!a.attacks?.length) { const empty = text('option', owns(a) ? '请DM先设置攻击' : '无法操作该角色'); empty.value = ''; $('attack-choice').append(empty); }
    if ([...$('attack-choice').options].some(o => o.value === previousAttack)) $('attack-choice').value = previousAttack;
    $('target-choice').replaceChildren(...state.actors.filter(item => item.id !== a.id && !item.hidden).map(item => { const option = text('option', item.name); option.value = item.id; return option; }));
    if ([...$('target-choice').options].some(o => o.value === previousTarget)) $('target-choice').value = previousTarget;
    $('move-form').querySelector('button').disabled = busy || !owns(a) || !isTurn(a) || a.hp <= 0;
    $('attack-form').querySelector('button').disabled = busy || !owns(a) || !isTurn(a) || a.hp <= 0 || !a.attacks?.length || !['none', 'attack'].includes(state.combat.action) || state.combat.attacksUsed >= a.attackLimit;
    $('dm-tools').hidden = !isDm();
    if (isDm() && !dirty) fillEditor(a);
  }
  const events = state.events.slice(-100).reverse();
  $('events').replaceChildren(...events.map(event => {
    const row = text('div', '', 'event'); row.append(text('small', `v${event.revision}${event.undoneBy ? ' · 已撤销' : ''}`), text('span', isDm() ? event.dmText : event.text)); if (event.undoneBy) row.classList.add('undone'); return row;
  }));
  if (!events.length) $('events').append(text('p', '尚无已保存的战斗事件。', 'fine'));
  files?.update(state); dice?.render(state); terrain?.render(state); resources?.update();
  board?.update(state, selectedId); shell?.update(state); sharing?.render(state); setConnection(connected);
}
function renderTasks() {
  const area = $('battle-tasks'); area.replaceChildren();
  area.hidden = state.combat.phase !== 'preparing';
  if (area.hidden) return;
  area.append(text('strong', isDm() ? '开始战斗 · 下一步' : '我的待办'));
  const add = (label, fn) => { const b = text('button', label); b.type = 'button'; b.addEventListener('click', fn); area.append(b); };
  const pending = state.actors.filter(a => !a.confirmed || a.hp <= 0);
  if (isDm() && (pending.length || dirty)) {
    area.append(text('p', dirty ? '角色资料未保存。保存后继续。' : '请核对以下参战者，勾选“已核对”并保存。', 'fine'));
    for (const a of pending) add(`${a.name} · ${a.hp <= 0 ? '起始HP须大于0' : '待核对'}`, () => { choose(a.id); openEditor(); });
    if (dirty) add('继续保存资料', openEditor);
  } else if (!state.initiativeCollection) {
    area.append(text('p', isDm() ? '资料已齐全，点击顶部“收集先攻”。' : '等待DM收集先攻。', 'fine'));
  } else {
    const missing = state.actors.filter(a => (isDm() || a.ownerId === state.viewerId) && !state.initiativeCollection.entries[a.id]);
    area.append(text('p', missing.length ? `待提交：${missing.map(a => a.name).join('、')}。在下方填写原始d20，或点掷骰。` : isDm() ? '先攻齐全，点击顶部“先攻齐全，开始战斗”。' : '先攻已保存，等待DM开始。', 'fine'));
  }
}
function applyResult(result) {
  if (!token || (result.requestEpoch !== undefined && result.requestEpoch !== sessionEpoch)) return;
  if (result.requestPath === '/api/state' && result.requestContext !== contextKey()) return;
  if (state && state.campaignId === result.state.campaignId && state.battleId === result.state.battleId && result.state.revision < state.revision) return;
  const switched = state && (state.campaignId !== result.state.campaignId || state.battleId !== result.state.battleId);
  if (state?.combat.phase !== result.state.combat.phase) dice?.clearAttack();
  if (switched) { $('exchange-text').value = ''; dirty = false; selectedId = null; editingRevision = null; dice?.clear(); terrain?.clear(); sharing?.clear(); shell?.closeTools(); clearPreview(); board?.clear(); }
  const nextCurrent = result.state.viewRole === 'dm' ? result.state.combat.order?.[result.state.combat.index] : result.state.combat.currentActorId;
  if (!dirty && result.state.combat.phase === 'active' && nextCurrent !== currentId()) {
    const nextActor = result.state.actors.find(item => item.id === nextCurrent);
    if (nextActor && (result.state.viewRole === 'dm' || nextActor.ownerId === result.state.viewerId)) selectedId = nextCurrent;
  }
  if (Object.hasOwn(result,'externalFileChanged')) $('external-file-notice').hidden = !result.externalFileChanged || result.state.viewRole !== 'dm';
  state = result.state; selection = result.selection; $('recovery').hidden = !result.recoveryNote; $('recovery').textContent = result.recoveryNote || ''; render();
}
async function loadState() {
  const generation = token; const result = await api('/api/state');
  if (token !== generation) return;
  applyResult(result);
}
async function sendCommand(command) {
  if (busy) throw new Error('正在保存上一项操作，请稍后再试。');
  if (!connected) throw new Error('连接恢复后再操作；当前动作尚未提交。');
  if (dirty && !(command.type === 'edit-actor' && command.payload?.actorId === selectedId && command.expectedRevision === editingRevision && formFields.every(key=>Object.hasOwn(command.payload?.patch||{},key)))) { shell?.openTool('actor'); throw new Error('角色资料还没保存。请先保存，或点击“放弃编辑并重载”。'); }
  busy = true; render(); const generation = token;
  try {
    const result = await api('/api/action', command);
    if (token === generation) { if (['attack', 'next', 'undo'].includes(command.type)) dice?.clearAttack(); if (command.type === 'edit-actor') dirty = false; if (command.type === 'adjudicate') $('manual-form').reset(); applyResult(result); notify(`已保存到本机 · 进度 v${state.revision}`); }
  } catch (error) { if (token === generation) await loadState().catch(() => {}); throw error; }
  finally { busy = false; if (state) render(); }
}
const action = (type, payload = {}, expectedRevision = state.revision) => sendCommand({ campaignId: state.campaignId, battleId: state.battleId, actionId: actionId(), expectedRevision, type, payload });

function setConnection(value) {
  connected = value;
  const node = $('connection-status');
  if (node) { node.textContent = value ? (clientAudience === 'player' ? '已连接主持' : '本机运行') : '连接中断 · 正在重连'; node.dataset.connected = String(value); }
  if (!value) for (const button of document.querySelectorAll('#start,#end,#next,#dash,#undo,#place-actor,#clone-actor,#remove-actor,#table form button[type=submit],#initiative-collection button')) {
    if (!button.disabled) { button.dataset.offlineDisabled = 'true'; button.disabled = true; }
  }
  else if (state) for (const button of document.querySelectorAll('[data-offline-disabled]')) { button.disabled = false; delete button.dataset.offlineDisabled; }
}
function canDragActor(id) {
  const a = state?.actors.find(item => item.id === id);
  return !!a && connected && !busy && !dirty && !terrain?.dirty &&
    (state.combat.phase !== 'active' ? isDm() : owns(a) && isTurn(a) && a.hp > 0);
}
async function dropActor(id, position, context) {
  try {
    if (!canDragActor(id)) throw new Error('当前不能移动此棋子，请先完成正在进行的操作。');
    if (state.campaignId !== context.campaignId || state.battleId !== context.battleId || state.revision !== context.revision) throw new Error('局面已更新，请重新拖动。');
    if (state.combat.phase === 'active') await action('move', { actorId: id, position: { x: position.x, z: position.z } }, context.revision);
    else await action('edit-actor', { actorId: id, patch: { position }, reason: '拖动摆放' }, context.revision);
  } catch (error) { notify(error.message, true); }
}
async function enter(id) {
  sessionEpoch++;
  const result = await api('/api/login', { id });
  token = result.token; sessionEpoch++; sessionStorage.setItem('battle-session', token); await loadState();
}
$('login-form').addEventListener('submit', guarded(() => enter($('identity').value)));
$('enter-dm').addEventListener('click', guarded(() => enter('DM')));
$('logout').addEventListener('click', guarded(async () => { const epoch = sessionEpoch; try { await api('/api/logout', {}); } finally { if (epoch === sessionEpoch) clearSession(); } }));
$('shutdown').addEventListener('click', guarded(async () => { await api('/api/shutdown', {}); clearSession(); notify('本地服务已停止。下次双击“启动战斗.cmd”恢复进度。'); }));
$('refresh').addEventListener('click', guarded(async () => { await loadState(); notify('已读取本机最新进度'); }));
$('start').addEventListener('click', guarded(async () => {
  if (state.initiativeCollection) await action('start');
  else { await action('collect-initiative', { modes: dice.startPayload().modes }); shell?.openTool('actions'); }
}));
$('next').addEventListener('click', guarded(() => action('next')));
$('dash').addEventListener('click', guarded(() => action('dash', { actorId: selectedId })));
$('end').addEventListener('click', guarded(() => action('end')));
$('move-form').addEventListener('submit', guarded(() => action('move', { actorId: selectedId, position: { x: Number($('move-x').value), z: Number($('move-z').value) } })));
$('attack-form').addEventListener('submit', guarded(() => action('attack', { actorId: selectedId, targetId: $('target-choice').value, attackId: $('attack-choice').value, mode: $('roll-mode').value, ...dice.attackPayload() })));
$('look-preset').addEventListener('change', () => { $('look-skin').value = { human: '#d6ae88', giant: '#9ccde0', monster: '#7aab75' }[$('look-preset').value]; dirty = true; $('dirty-indicator').textContent = '未保存'; });
$('edit-form').addEventListener('input', () => { dirty = true; $('dirty-indicator').textContent = '未保存'; });
$('reload-editor').addEventListener('click', () => { dirty = false; fillEditor(actor()); render(); });
$('attack-template').addEventListener('click', () => {
  $('edit-attacks').value = JSON.stringify([{ id: 'custom-attack', name: '请改为已核对的攻击名称', kind: 'melee', bonus: 0, reach: 5, damage: [{ formula: '1d4', type: 'bludgeoning' }] }], null, 2);
  dirty = true; $('dirty-indicator').textContent = '模板待修改';
});
$('edit-form').addEventListener('submit', guarded(async () => {
  const patch = {};
  for (const key of formFields) patch[key] = key === 'name' ? $(`edit-${key}`).value : Number($(`edit-${key}`).value);
  patch.position = { x: Number($('edit-x').value), y: Number($('edit-y').value), z: Number($('edit-z').value) };
  patch.body = Object.fromEntries(['width', 'depth', 'height'].map(key => [key, Number($(`edit-${key}`).value)]));
  patch.space = Object.fromEntries(['width', 'depth'].map(key => [key, Number($(`edit-space-${key}`).value)]));
  for (const key of ['immunities', 'resistances', 'vulnerabilities']) patch[key] = $(`edit-${key}`).value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  for (const key of ['resources', 'notes']) patch[key] = $(`edit-${key}`).value;
  patch.appearance = Object.fromEntries(['model','preset','skin','clothes','hair','weapon','material'].map(k => [k, $(`look-${k}`).value]));
  patch.appearance.armor = Object.fromEntries(['head','chest','legs','feet'].map(k => [k, $(`look-${k}`).value]));
  patch.appearance.shield = $('look-shield').checked;
  patch.hidden = $('edit-hidden').checked; patch.confirmed = $('edit-confirmed').checked;
  try { patch.attacks = JSON.parse($('edit-attacks').value); } catch { throw new Error('攻击列表的JSON格式有误，尚未保存。'); }
  await action('edit-actor', { actorId: selectedId, patch, reason: '本机DM资料设置' }, editingRevision);
}));
$('manual-form').addEventListener('submit', guarded(() => action('adjudicate', { actorId: selectedId,
  reason: $('manual-reason').value, publicNote: $('manual-public').value, heal: Number($('manual-heal').value),
  temporaryHp: Number($('manual-temp').value), consumeAction: $('manual-consume').checked,
  damage: [{ type: $('manual-damage-type').value, amount: Number($('manual-damage').value) }] })));
$('export-handoff').addEventListener('click', guarded(async () => {
  clearPreview(); const result = await api('/api/handoff'); $('exchange-text').value = JSON.stringify(result, null, 2);
  notify(`${result.audience === 'dm' ? 'DM完整' : '玩家'}局面包已生成，尚未发送到任何外部工具。`);
}));
$('copy-exchange').addEventListener('click', guarded(async () => {
  if (!$('exchange-text').value) throw new Error('请先生成局面包或输入文本');
  const copied = await copyText($('exchange-text').value, $('exchange-text')); notify(copied ? '已复制，可交给主持者。' : '文本已选中，请按 Ctrl+C 复制。');
}));
$('download-exchange').addEventListener('click', guarded(() => {
  if (!$('exchange-text').value) throw new Error('尚无可保存文本');
  const url = URL.createObjectURL(new Blob([$('exchange-text').value], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `战斗交接-${state.viewRole}-v${state.revision}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
function clearPreview() { previewedProposal = null; $('proposal-preview').textContent = ''; $('import-proposal').disabled = true; }
$('exchange-text').addEventListener('input', clearPreview);
$('preview-proposal').addEventListener('click', guarded(() => {
  let object; try { object = JSON.parse($('exchange-text').value); } catch { throw new Error('提议不是有效JSON'); }
  const command = object.proposal || object;
  if (!command || typeof command !== 'object' || typeof command.type !== 'string' || !command.actionId) throw new Error('缺少操作类型或actionId，请按局面包返回proposal');
  if (command.campaignId !== state.campaignId || command.battleId !== state.battleId || command.expectedRevision !== state.revision) throw new Error('团、战斗或版本不符。请重新生成当前局面包。');
  previewedProposal = structuredClone(command);
  $('proposal-preview').textContent = `待执行：${command.type} · 当前版本 v${command.expectedRevision}\n${JSON.stringify(command.payload || {}, null, 2)}\n尚未修改进度；确认后仍由本地规则校验。`;
  $('import-proposal').disabled = false;
}));
$('import-proposal').addEventListener('click', guarded(async () => {
  if (!previewedProposal) throw new Error('请先预览提议');
  await sendCommand(previewedProposal); clearPreview();
}));
$('zoom-in').addEventListener('click', () => board?.zoom(.85));
$('zoom-out').addEventListener('click', () => board?.zoom(1.15));
$('reset-camera').addEventListener('click', () => board?.reset());
$('viewport').addEventListener('board-error', event => { $('board-error').textContent = event.detail; $('board-error').hidden = false; });
setInterval(async () => {
  if (!token || busy || polling || document.hidden) return;
  polling = true; const generation = token;
  try {
    const result = await api('/api/state');
    if (generation === token) $('external-file-notice').hidden = !result.externalFileChanged || result.state.viewRole !== 'dm';
    if (generation === token && (result.state.revision !== state?.revision || result.state.battleId !== state?.battleId)) applyResult(result);
  } catch (error) { if (generation === token) { setConnection(false); } }
  finally { polling = false; }
}, 1250);
function openEditor() { $('edit-details').open = true; shell?.openTool('actor'); }
$('open-editor').addEventListener('click', openEditor);
$('go-setup').addEventListener('click', () => shell?.openTool('setup'));
function canSwitch() { if (busy || dirty || terrain?.dirty) { notify('请先保存或放弃当前棋子/地形的编辑，再切换或摆放。', true); return false; } return true; }
async function placeActor(position) {
  if (!isDm() || state.combat.phase === 'active' || !actor()) return;
  if (!canSwitch()) return;
  await action('edit-actor', { actorId: selectedId, patch: { position, facing: Number($('place-facing').value) }, reason: '战前摆放' });
}
async function placeOnBoard(point) {
  if (isDm()) { try { if (await terrain?.place(point)) return; } catch (error) { notify(error.message, true); return; } }
  if (!$('place-mode').checked || !isDm() || state.combat.phase === 'active' || !actor()) return;
  const a = actor(), snap = (value, size) => Math.round((value - size / 2) / 5) * 5 + size / 2;
  try { await placeActor({ x: snap(point.x, a.space.width), y: a.position.y || 0, z: snap(point.z, a.space.depth) }); } catch (error) { notify(error.message, true); }
}
$('place-actor').addEventListener('click', guarded(() => placeActor({ x: Number($('place-x').value), y: Number($('place-y').value), z: Number($('place-z').value) })));
$('add-actor-form').addEventListener('submit', guarded(async () => {
  await action('add-actor', { name: $('add-name').value, kind: $('add-kind').value, ownerId: $('add-owner').value });
  selectedId = state.actors.at(-1).id; render(true); openEditor();
}));
$('clone-actor').addEventListener('click', guarded(async () => { await action('add-actor', { copyActorId: selectedId, name: `${actor().name} 副本`, kind: actor().kind, ownerId: actor().ownerId }); selectedId = state.actors.at(-1).id; render(true); }));
$('remove-actor').addEventListener('click', guarded(() => action('remove-actor', { actorId: selectedId })));
$('undo').addEventListener('click', guarded(() => action('undo')));
library = workspacePanel({ api, apply: applyResult, notify, getState: () => state, canSwitch });
terrain = terrainPanel({ action, getState: () => state, notify, canEdit: () => { if (busy || dirty) { notify('请先保存棋子编辑或等待当前操作完成', true); return false; } return true; } });
dice = dicePanel({ api, action, getState: () => state, getActor: actor, notify });
resources = resourcePanel({api,action,getState:()=>state,getActor:actor,notify,openTool:name=>shell?.openTool(name),onResource:r=>orbit?.open(r)});
operations = actionPanel({resources,getState:()=>state,getActor:actor,action,notify,openTool:name=>shell?.openTool(name),openCategory:category=>orbit?.open(resourceView(state,actor()).find(r=>r.id==='action'),category)});
orbit = resourceOrbit({resources,operations,getState:()=>state,getActor:actor,openTool:name=>shell?.openTool(name)});
shell = initShell();
files = filesPanel({api, apply:applyResult, notify, getState:()=>state, canEdit:canSwitch});
sharing = sharingPanel({ api, notify, getState: () => state });
async function boot() {
  $('enter-dm').disabled = true; $('login-form').querySelector('button').disabled = true;
  try {
    const info = await api('/api/client-info'); clientAudience = info.audience;
    if (clientAudience === 'player') {
      $('enter-dm').hidden = true; $('login-form').hidden = true; document.querySelectorAll('[data-local-only]').forEach(item => { item.hidden = true; });
      const message = document.createElement('p'); message.className = 'fine'; message.id = 'join-message';
      message.textContent = '通过主持发来的角色邀请进入。邀请失效时，请主持重新复制邀请。'; $('login').append(message);
      const invite = new URLSearchParams(location.hash.slice(1)).get('invite');
      if (invite) {
        history.replaceState(null, '', location.pathname);
        const result = await api('/api/join', { invite });
        token = result.token; sessionEpoch++; sessionStorage.setItem('battle-session', token);
      }
    }
    if (token) await loadState();
  } catch (error) { if (!error.cancelled) notify(error.message, true); }
  finally { $('enter-dm').disabled = false; $('login-form').querySelector('button').disabled = false; }
}
boot();

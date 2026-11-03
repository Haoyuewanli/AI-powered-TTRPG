import { MODEL_CLASSES, MODEL_SPECIES, MODEL_WEAPONS } from '/data/model-catalog.mjs';
import { resourceActorDraft } from '/resource-actor.mjs';

const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
export function actorAddPanel({ api, add, cloneSelected, getSelected, getState, canOpen, notify }) {
  const button = element('button', '＋', 'add-combatant'); button.id = 'add-combatant'; button.type = 'button'; button.setAttribute('aria-label', '添加参战者');
  document.querySelector('.roster-strip').append(button);
  document.getElementById('add-actor-form').closest('details').hidden = true;
  document.getElementById('clone-actor').hidden = true;
  const dialog = element('dialog', undefined, 'tool-dialog actor-add-dialog'); dialog.id = 'add-combatant-dialog'; dialog.setAttribute('aria-label', '添加角色、NPC或怪物');
  const heading = element('header', undefined, 'dialog-heading'); heading.append(element('h2', '添加参战者'));
  const body = element('div', undefined, 'dialog-body'), form = element('form'), fields = new Map();
  let busy = false, dirty = false, generation = 0, sourceDraft = null;
  const status = element('p', '', 'fine'); status.setAttribute('role', 'status');
  const field = (name, label, type = 'text', options) => {
    const row = element('label', label), input = element(options ? 'select' : 'input'); input.id = 'combatant-' + name; input.setAttribute('aria-label', label);
    if (options) for (const item of options) { const option = element('option', item.name); option.value = item.id; input.append(option); }
    else { input.type = type; if (type === 'number') { input.min = '0'; input.max = '10000'; input.step = '1'; } }
    input.addEventListener('input', () => { dirty = true; }); row.append(input); fields.set(name, input); form.append(row); return input;
  };
  const kind = field('type', '参战者类型', 'text', [{ id: 'pc', name: '玩家角色' }, { id: 'npc', name: 'NPC' }, { id: 'monster', name: '怪物' }]);
  const resourceTools = element('section', undefined, 'actor-resource-picker'), search = element('input'); search.type = 'search'; search.placeholder = '搜索可用人物、角色或怪物资源'; search.setAttribute('aria-label', '搜索参战者资源');
  const searchButton = element('button', '搜索资源'); searchButton.type = 'button';
  const resourceSelect = element('select'); resourceSelect.setAttribute('aria-label', '选择参战者资源');
  const use = element('button', '使用选中资源'); use.type = 'button'; const original = element('pre', '', 'actor-source-preview'); original.hidden = true;
  resourceTools.append(search, searchButton, resourceSelect, use, element('p', '资源仅预填草稿，加入后仍须核对数值、版本与攻击；也可直接新建。', 'fine'), original);
  form.append(resourceTools);
  field('name', '参战者名称').required = true;
  field('owner', '玩家控制ID').value = 'player-1';
  field('species', '基础种族外观', 'text', MODEL_SPECIES); field('classId', '基础职业外观', 'text', MODEL_CLASSES);
  field('weapon', '手持武器外观', 'text', MODEL_WEAPONS);
  for (const [name, label, value] of [['hp','生命上限',10],['ac','护甲等级',10],['speed','速度（尺）',30],['width','模型宽（尺）',2],['depth','模型深（尺）',1],['height','模型高（尺）',6],['space','规则占地（尺）',5]]) {
    const input = field(name, label, 'number'); input.value = value; if (['width','depth','height'].includes(name)) { input.min = '.2'; input.max = '60'; input.step = '.1'; }
  }
  const actions = element('div', undefined, 'button-grid'), submit = element('button', '加入本场战斗', 'primary'), cancel = element('button', '取消'); submit.type = 'submit'; cancel.type = 'button';
  const clone = element('button', '复制当前选中参战者'); clone.type = 'button';
  actions.append(submit, clone, cancel); form.append(status, actions); body.append(form); dialog.append(heading, body); document.body.append(dialog);
  const value = name => fields.get(name).value;
  const set = (name, value) => { fields.get(name).value = value; };
  function reset() {
    generation++; sourceDraft = null; original.hidden = true; original.textContent = ''; resourceSelect.replaceChildren(); search.value = ''; status.textContent = '';
    set('type', 'pc'); set('name', '新角色'); set('owner', 'player-1'); set('species', 'human'); set('classId', 'fighter'); set('weapon', 'sword');
    for (const [key, number] of Object.entries({ hp: 10, ac: 10, speed: 30, width: 2, depth: 1, height: 6, space: 5 })) set(key, number);
    dirty = false; updateKind();
  }
  function updateKind() { fields.get('owner').disabled = kind.value !== 'pc'; fields.get('species').disabled = fields.get('classId').disabled = kind.value === 'monster'; }
  kind.onchange = updateKind;
  fields.get('classId').onchange = () => { const preset = MODEL_CLASSES.find(item => item.id === value('classId')); if (preset?.weapon) set('weapon', preset.weapon); dirty = true; };
  async function perform(callback) {
    if (busy) return; busy = true; submit.disabled = true; dialog.setAttribute('aria-busy', 'true');
    try { await callback(); } catch (error) { status.textContent = error.message; }
    finally { busy = false; submit.disabled = false; dialog.removeAttribute('aria-busy'); }
  }
  async function find() {
    const request = ++generation, response = await api('/api/resource-catalog?' + new URLSearchParams({ q: search.value.trim() }));
    if (request !== generation || !dialog.open) return;
    resourceSelect.replaceChildren();
    for (const resource of response.resources || []) { const option = element('option', resource.name + ' · ' + resource.kind + (resource.moduleName ? ' · ' + resource.moduleName : '')); option.value = resource.id; resourceSelect.append(option); }
    use.disabled = !resourceSelect.options.length;
    status.textContent = response.unavailable ? '独立启动未连接平台资源库，可新建或从平台战斗入口选择资源。' : resourceSelect.options.length ? '选择资源后点击“使用选中资源”。最多显示200条，可缩小搜索。' : '未找到可加入的资源，试试其他名称。';
  }
  searchButton.onclick = () => perform(find); search.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); perform(find); } };
  use.onclick = () => perform(async () => {
    if (!resourceSelect.value) return; const request = ++generation, selected = resourceSelect.value;
    const response = await api('/api/resource-read?id=' + encodeURIComponent(selected));
    if (request !== generation || !dialog.open) return;
    const imported = resourceActorDraft(response); sourceDraft = imported.draft; set('name', imported.name);
    if (/怪物/.test(response.resource?.kind)) set('type', 'monster'); else if (/NPC|人物/.test(response.resource?.kind)) set('type', 'npc'); else set('type', 'pc');
    for (const [key, number] of Object.entries({ hp: sourceDraft.maxHp, ac: sourceDraft.ac, speed: sourceDraft.speed, ...sourceDraft.body, space: sourceDraft.space.width })) set(key, number);
    original.textContent = imported.sourceText.slice(0, 16000); original.hidden = false; updateKind(); dirty = true;
    status.textContent = '已预填资源草稿。' + (imported.missingFields.length ? imported.missingFields.join('、') + '未找到明确记录，当前为待填写占位值。' : '') + '请核对尺寸、外观和启用版本；原资料不会因加入而改变。';
  });
  form.onsubmit = event => { event.preventDefault(); perform(async () => {
    if (!form.reportValidity()) return;
    const appearance = { model: 'voxel', preset: value('type') === 'monster' ? 'monster' : 'human', species: value('species'), classId: value('classId'),
      weapon: value('weapon'), material: 'iron', skin: '#d6ae88', clothes: '#347e8b', hair: '#4d382c', shield: false,
      armor: { head: 'none', chest: 'none', legs: 'none', feet: 'none' } };
    const draft = { ...(sourceDraft || {}), ac: Number(value('ac')), maxHp: Number(value('hp')), hp: Number(value('hp')), speed: Number(value('speed')),
      body: Object.fromEntries(['width','depth','height'].map(key => [key, Number(value(key))])), space: { width: Number(value('space')), depth: Number(value('space')) }, appearance };
    await add({ name: value('name').trim(), kind: value('type') === 'pc' ? 'pc' : 'npc', ownerId: value('owner'), draft });
    dirty = false; generation++; dialog.close(); notify('参战者已加入并保存，请核对资料后开战。');
  }); };
  cancel.onclick = () => { if (busy) return; dirty = false; generation++; dialog.close(); };
  clone.onclick = () => perform(async () => { if (!getSelected()) throw new Error('请先选择要复制的参战者。'); await cloneSelected(); dirty = false; generation++; dialog.close(); notify('已复制选中的参战者并保存。'); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); else { dirty = false; generation++; } });
  button.onclick = () => { if (!canOpen()) return; reset(); dialog.showModal(); perform(find); };
  return { hasDraft: () => dirty || busy, clear() { dirty = false; generation++; dialog.close(); },
    update(state) { button.hidden = state?.viewRole !== 'dm'; button.disabled = !state || state.combat.phase === 'active'; clone.disabled = !getSelected() || state?.combat.phase === 'active'; } };
}

const $ = id => document.getElementById(id);
const element = (tag, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
const modes = [['normal', '通常'], ['advantage', '优势'], ['disadvantage', '劣势']];
function selectModes() {
  const select = element('select');
  for (const [value, title] of modes) { const node = element('option', title); node.value = value; select.append(node); }
  return select;
}
function dieInput(key, sides, previous = new Map()) {
  const input = element('input'); input.type = 'number'; input.min = '1'; input.max = String(sides); input.step = '1';
  input.dataset.dieKey = key; input.placeholder = `d${sides}`; input.value = previous.get(key) || ''; return input;
}

export function dicePanel({ api, action, getState, getActor, notify }) {
  let actorKey = '', planKey = '', entryKey = '', plan, request = 0;
  const physical = () => getState()?.diceMode === 'physical' || $('use-physical-dice').checked;
  const readValues = root => [...root.querySelectorAll('input[data-die-key]')].filter(i => i.value !== '').map(i => Number(i.value));
  function refreshDamage() {
    if (!plan) return;
    const previous = new Map([...$('physical-damage').querySelectorAll('input')].map(i => [i.dataset.dieKey, i.value]));
    const values = readValues($('physical-d20'));
    const natural = values.length ? plan.mode === 'advantage' ? Math.max(...values) : Math.min(...values) : 0;
    $('physical-damage').replaceChildren(...plan.damage.map((item, index) => {
      const row = element('div'); row.className = 'dice-row'; row.dataset.damageIndex = String(index);
      row.append(element('span', `${item.type} · ${item.formula}${natural === 20 ? ' · 重击双倍骰' : ''}`));
      const inputs = element('div'); inputs.className = 'dice-inputs';
      for (let i = 0; i < item.count * (natural === 20 ? 2 : 1); i++) inputs.append(dieInput(`damage-${index}-${i}`, item.sides, previous));
      row.append(inputs); return row;
    }));
  }
  async function refreshPlan() {
    const state = getState(), actor = getActor();
    $('physical-attack').hidden = !physical();
    if (!physical() || !state || !actor || state.combat.phase !== 'active' || !$('attack-choice').value || !$('target-choice').value) return;
    const payload = { actorId: actor.id, targetId: $('target-choice').value, attackId: $('attack-choice').value, mode: $('roll-mode').value };
    const key = `${state.battleId}/${state.revision}/${JSON.stringify(payload)}`;
    if (key === planKey) return;
    planKey = key; const pending = ++request;
    const identity = `${state.battleId}/${state.combat.round}/${state.combat.currentActorId || state.combat.order?.[state.combat.index]}/${state.combat.attacksUsed || 0}/${JSON.stringify(payload)}`;
    if (entryKey !== identity) { plan = null; $('physical-d20').replaceChildren(); $('physical-damage').replaceChildren(); entryKey = identity; }
    $('physical-plan-note').textContent = '正在核对检定模式…';
    try {
      const next = await api('/api/attack-plan', payload);
      if (pending !== request || !getState() || getState().battleId !== state.battleId) return;
      plan = next;
      const previous = entryKey === identity ?
        new Map([...$('physical-d20').querySelectorAll('input')].map(i => [i.dataset.dieKey, i.value])) : new Map();
      if (entryKey !== identity) $('physical-damage').replaceChildren();
      entryKey = identity;
      $('physical-plan-note').textContent = `实际检定：${modes.find(m => m[0] === next.mode)[1]}，录入${next.d20Count}颗d20；加值由程序计算。`;
      $('physical-d20').replaceChildren(...Array.from({ length: next.d20Count }, (_, i) => dieInput(`attack-${i}`, 20, previous)));
      refreshDamage();
    } catch (error) { if (pending === request) $('physical-plan-note').textContent = error.message; }
  }
  function renderInitiative(state) {
    const dm = state.viewRole === 'dm', collection = state.initiativeCollection;
    const eligible = state.actors.filter(a => (dm || a.ownerId === state.viewerId) && (a.hp ?? 1) > 0);
    const key = `${state.battleId}/${eligible.map(a => a.id).join(',')}`;
    if (key !== actorKey) {
      actorKey = key;
      $('initiative-entries').replaceChildren(...eligible.map(actor => {
        const row = element('div'); row.className = 'initiative-row'; row.dataset.actorId = actor.id;
        row.append(element('span', actor.name), selectModes()); return row;
      }));
    }
    $('initiative-options').hidden = !dm || !!collection || state.combat.phase === 'active';
    const area = $('initiative-collection');
    const activeDie = document.activeElement?.closest('#initiative-collection') ? document.activeElement.dataset.dieKey : null;
    const previous = new Map([...area.querySelectorAll('input')].map(i => [i.dataset.dieKey, i.value]));
    area.replaceChildren();
    area.hidden = state.combat.phase === 'active';
    if (state.combat.phase === 'active') return;
    if (!collection) {
      area.append(element('p', dm ? '核对资料后，点“收集先攻”。程序会等待每位玩家提交。' : '等待主持发起先攻；发起后可在这里填写或掷骰。'));
      return;
    }
    area.append(element('p', dm ? '先攻已收集的角色无需重填。全部齐全后即可开始。' : '提交自己的先攻，程序会自动加上先攻加值。'));
    const invoke = async (button, type, payload) => {
      button.disabled = true;
      try { await action(type, payload); } catch (error) { notify(error.message, true); }
      finally { if (button.isConnected) button.disabled = false; }
    };
    if (dm && state.diceMode !== 'physical') {
      const batch = element('div'); batch.className = 'button-row';
      for (const [scope, title] of [['npc', '掷NPC先攻'], ['all', '替所有未提交者掷骰']]) {
        const button = element('button', title); button.type = 'button'; button.dataset.rollScope = scope;
        button.disabled = !eligible.some(a => !collection.entries[a.id] && (scope === 'all' || a.kind === 'npc'));
        button.addEventListener('click', () => invoke(button, 'roll-initiative', { scope })); batch.append(button);
      }
      area.append(batch);
    }
    for (const actor of eligible) {
      const entry = collection.entries[actor.id], mode = collection.modes[actor.id] || 'normal';
      const row = element('div'); row.className = 'initiative-task'; row.dataset.initiativeActor = actor.id;
      row.append(element('strong', actor.name));
      if (entry) {
        row.append(element('p', `已提交：${entry.values.join('、')} → 先攻 ${entry.total}`));
        if (dm) { const clear = element('button', '重填'); clear.type = 'button'; clear.addEventListener('click', () => invoke(clear, 'clear-initiative', { actorId: actor.id })); row.append(clear); }
      } else {
        row.append(element('small', `${modes.find(m => m[0] === mode)[1]} · 原始d20，加值自动计算${dm && actor.kind === 'pc' ? ' · 可代填' : ''}`));
        const inputs = element('div'); inputs.className = 'dice-inputs';
        for (let i = 0; i < (mode === 'normal' ? 1 : 2); i++) inputs.append(dieInput(`collect-${actor.id}-${i}`, 20, previous));
        row.append(inputs);
        const submit = element('button', state.diceMode === 'physical' ? '提交骰点' : '掷骰 / 提交所填骰点'); submit.type = 'button'; submit.dataset.submitInitiative = actor.id;
        submit.addEventListener('click', () => {
          const rolls = readValues(inputs);
          return invoke(submit, 'submit-initiative', { actorId: actor.id, ...(rolls.length || state.diceMode === 'physical' ? { rolls } : {}) });
        }); row.append(submit);
      }
      area.append(row);
    }
    if (activeDie) [...area.querySelectorAll('input')].find(i => i.dataset.dieKey === activeDie)?.focus();
  }
  for (const id of ['attack-choice', 'target-choice', 'roll-mode', 'use-physical-dice']) $(id).addEventListener('change', () => {
    planKey = ''; refreshPlan();
    $('attack-form').querySelector('button').textContent = physical() ? '提交线下骰并结算' : '掷骰并结算攻击';
  });
  $('physical-d20').addEventListener('input', refreshDamage);
  $('dice-mode').addEventListener('change', async () => {
    try { await action('set-dice-mode', { mode: $('dice-mode').value }); } catch (error) { notify(error.message, true); }
  });
  return {
    render(state) {
      $('dice-mode-label').hidden = state.viewRole !== 'dm'; $('dice-mode').value = state.diceMode || 'program';
      $('use-physical-dice').disabled = state.diceMode === 'physical';
      $('physical-mode-caption').textContent = state.diceMode === 'physical' ? '本场：线下骰' : '本场：程序骰；也可临时录入实体骰';
      renderInitiative(state);
      if (state.diceMode === 'physical' && state.combat.phase === 'preparing') $('initiative-options').open = true;
      refreshPlan();
      $('attack-form').querySelector('button').textContent = physical() ? '提交线下骰并结算' : '掷骰并结算攻击';
    },
    startPayload() {
      const state = getState(), modeMap = {}, initiative = {};
      for (const row of $('initiative-entries').querySelectorAll('[data-actor-id]')) {
        modeMap[row.dataset.actorId] = row.querySelector('select').value;
        if (state.diceMode === 'physical' && row.querySelector('[data-initiative-dice]')) initiative[row.dataset.actorId] = readValues(row.querySelector('[data-initiative-dice]'));
      }
      return { modes: modeMap, ...(state.diceMode === 'physical' ? { manualRolls: { initiative } } : {}) };
    },
    attackPayload() {
      if (!physical()) return {};
      return { manualRolls: { attack: readValues($('physical-d20')),
        damage: [...$('physical-damage').querySelectorAll('[data-damage-index]')].map(row => readValues(row)) } };
    },
    clearAttack() { request++; planKey = ''; entryKey = ''; plan = null; $('physical-d20').replaceChildren(); $('physical-damage').replaceChildren(); },
    clear() {
      request++; actorKey = ''; planKey = ''; entryKey = ''; plan = null;
      for (const id of ['initiative-entries', 'initiative-collection', 'physical-d20', 'physical-damage']) $(id).replaceChildren();
      $('physical-plan-note').textContent = ''; $('use-physical-dice').checked = false;
    }
  };
}

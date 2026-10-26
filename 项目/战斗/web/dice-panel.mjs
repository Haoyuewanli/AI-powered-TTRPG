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
    const identity = `${state.battleId}/${JSON.stringify(payload)}`;
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
    const key = `${state.battleId}/${state.actors.map(a => a.id).join(',')}`;
    if (key !== actorKey) {
      actorKey = key;
      $('initiative-entries').replaceChildren(...state.actors.map(actor => {
        const row = element('div'); row.className = 'initiative-row'; row.dataset.actorId = actor.id;
        row.append(element('span', actor.name), selectModes());
        const inputs = element('div'); inputs.className = 'dice-inputs'; inputs.dataset.initiativeDice = 'true';
        const update = () => {
          const previous = new Map([...inputs.querySelectorAll('input')].map(i => [i.dataset.dieKey, i.value]));
          const count = row.querySelector('select').value === 'normal' ? 1 : 2;
          inputs.replaceChildren(...Array.from({ length: count }, (_, i) => dieInput(`initiative-${actor.id}-${i}`, 20, previous)));
        };
        row.querySelector('select').addEventListener('change', update); row.append(inputs); update(); return row;
      }));
    }
    for (const row of $('initiative-entries').querySelectorAll('[data-initiative-dice]')) row.hidden = state.diceMode !== 'physical';
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
      $('initiative-options').hidden = state.viewRole !== 'dm'; renderInitiative(state);
      if (state.diceMode === 'physical' && state.combat.phase === 'preparing') $('initiative-options').open = true;
      refreshPlan();
      $('attack-form').querySelector('button').textContent = physical() ? '提交线下骰并结算' : '掷骰并结算攻击';
    },
    startPayload() {
      const state = getState(), modeMap = {}, initiative = {};
      for (const row of $('initiative-entries').querySelectorAll('[data-actor-id]')) {
        modeMap[row.dataset.actorId] = row.querySelector('select').value;
        if (state.diceMode === 'physical') initiative[row.dataset.actorId] = readValues(row.querySelector('[data-initiative-dice]'));
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
      for (const id of ['initiative-entries', 'physical-d20', 'physical-damage']) $(id).replaceChildren();
      $('physical-plan-note').textContent = ''; $('use-physical-dice').checked = false;
    }
  };
}

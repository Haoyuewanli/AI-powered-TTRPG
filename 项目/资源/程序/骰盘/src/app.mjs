import { SIDES, MAX_DICE, createRoll, validateRequest, logicalDice, formatFormula } from './rolls.mjs';
import { loadRoll, saveRoll } from './journal.mjs';
import { DiceAnimation } from './dice-animation.mjs';

const $ = id => document.getElementById(id);
const outlines = { 4: 'M16 3 29 27H3Z M16 3v16M3 27l13-8 13 8',
  6: 'M5 8 16 2 27 8v16l-11 6L5 24Z M5 8l11 6 11-6M16 14v16',
  8: 'M16 2 29 16 16 30 3 16Z M3 16h26M16 2l6 14-6 14-6-14Z',
  10: 'M16 2 29 14 23 26 16 30 8 26 3 14Z M16 2l7 24M16 2 8 26M3 14l13 4 13-4M16 18v12',
  12: 'M10 3h12l9 10-4 14-15 4L1 20 3 9Z M10 3l-1 10 8 6 10-6M9 13l-8 7M17 19l-5 12M27 13v14',
  20: 'M16 2 29 9v15l-13 6L3 24V9Z M16 2 8 22h16L16 2M3 9l13 4 13-4M3 24l5-2 8 8 8-8 5 2M16 13 8 22m8-9 8 9' };
let current = null;
let pending = null;
let busy = false;
let ready = false;
let animationAvailable = false;
export const animator = new DiceAnimation('#dice-scene');

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}

function setBusy(value) {
  busy = value;
  let valid = false;
  try { readRequest(); valid = true; } catch {}
  const locked = value || !!pending;
  const count = [...document.querySelectorAll('.die-count')].reduce((sum, input) => sum + Number(input.value), 0);
  $('roll').disabled = value || !ready || (!valid && !pending);
  $('roll').innerHTML = value ? '命运正在落定… <span>✧</span>' : pending ? '重试保存这一掷 <span>↗</span>' : '掷出骰子 <span>↗</span>';
  $('skip').disabled = !value;
  $('replay').disabled = value || !current || !!pending;
  document.querySelectorAll('.die-option').forEach(option => {
    const input = option.querySelector('.die-count');
    const selected = Number(input.value) > 0;
    option.dataset.selected = String(selected);
    input.disabled = locked;
    option.querySelector('.die-choice').setAttribute('aria-pressed', String(selected));
    option.querySelectorAll('[data-action="add"]').forEach(button => { button.disabled = locked || count >= MAX_DICE; });
    option.querySelector('[data-action="remove"]').disabled = locked || !selected;
  });
  $('clear-pool').disabled = locked || count === 0;
  $('modifier-enabled').disabled = locked;
  $('modifier').disabled = locked || !$('modifier-enabled').checked;
  $('rolling-label').hidden = !value;
  $('table-state').textContent = value ? '投掷中' : animationAvailable ? '骰盘已就绪' : '文字结果可用';
}

function readRequest() {
  const groups = [...document.querySelectorAll('.die-count')].map(input => ({ sides: Number(input.dataset.sides), count: Number(input.value) }))
    .filter(group => group.count !== 0);
  const modifier = $('modifier-enabled').checked ? Number($('modifier').value) : 0;
  if ($('modifier-enabled').checked && (!Number.isInteger(modifier) || modifier < 1 || modifier > 20)) {
    throw new Error('附加数值须为 1 至 20 的整数。');
  }
  return validateRequest({ groups, modifier });
}

function updateRequest() {
  try {
    const request = readRequest();
    $('notation').textContent = formatFormula(request);
    $('selection-help').textContent = `共 ${request.groups.reduce((sum, group) => sum + group.count, 0)} 颗，最多 ${MAX_DICE} 颗`;
    $('selection-help').classList.remove('error');
  } catch (error) {
    $('notation').textContent = '组合你的骰池';
    $('selection-help').textContent = error.message;
    $('selection-help').classList.add('error');
  }
  setBusy(busy);
}

for (const value of SIDES) {
  const option = document.createElement('div');
  option.className = 'die-option';
  option.innerHTML = `<button class="die-choice" data-action="add" data-sides="${value}" aria-label="添加一颗 d${value}" aria-pressed="${value === 20}"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="${outlines[value === 100 ? 10 : value]}"/></svg><span>d${value}</span></button><div class="die-stepper"><button data-action="remove" aria-label="减少一颗 d${value}">−</button><input class="die-count" data-sides="${value}" type="number" min="0" max="20" step="1" value="${value === 20 ? 1 : 0}" aria-label="d${value} 数量"><button data-action="add" aria-label="增加一颗 d${value}">＋</button></div>`;
  option.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    const input = option.querySelector('.die-count');
    input.value = Math.max(0, Math.min(MAX_DICE, (Number(input.value) || 0) + (button.dataset.action === 'add' ? 1 : -1)));
    updateRequest();
  }));
  option.querySelector('input').addEventListener('input', updateRequest);
  $('dice-picker').append(option);
}

$('clear-pool').addEventListener('click', () => {
  document.querySelectorAll('.die-count').forEach(input => { input.value = 0; });
  updateRequest();
});
$('modifier-enabled').addEventListener('change', updateRequest);
$('modifier').addEventListener('input', updateRequest);

function showResult(record) {
  $('individual').replaceChildren(...logicalDice(record).map(({ sides, value }) => {
    const element = document.createElement('span');
    element.className = `result-die${sides === 20 && value === 20 ? ' critical' : ''}`;
    element.textContent = `d${sides} · ${value}`;
    return element;
  }));
  $('result-label').textContent = `${formatFormula(record)} · 已保留`;
  $('breakdown').textContent = record.version === 2 && record.modifier ?
    `骰子和 ${record.diceTotal} ＋ 附加 ${record.modifier} ＝ ${record.total}` : `骰子和 ${record.total}`;
  $('total').textContent = record.total;
}

async function present(record, replay = false) {
  setBusy(true);
  $('empty-hint').hidden = true;
  $('total').textContent = '·';
  $('individual').replaceChildren();
  $('breakdown').textContent = '';
  $('result-label').textContent = replay ? '重播上一掷' : formatFormula(record);
  notice(replay ? '重播同一组点数，投掷轨迹可能不同。' : '点数已保留，等待骰子落定。');
  try {
    let result = { status: 'reduced' };
    if (animationAvailable && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      result = await animator.play(record);
    }
    notice(result.status === 'complete' ? '点数已落定。你可以继续投掷，或重播这一掷。' :
      result.status === 'timeout' ? '动画等待超时，显示已保留的点数。' :
      result.status === 'resized' ? '骰盘尺寸改变，已保留这一掷。可重播查看。' :
      result.status === 'unavailable' ? '三维画面暂不可用，已保留这一掷。' : '显示已保留的点数，结果没有改变。');
  } catch (error) {
    notice(`${error.message} 可重播或继续投掷。`, true);
  } finally {
    showResult(record);
    setBusy(false);
  }
}

$('roll').addEventListener('click', async () => {
  if (busy) return;
  try {
    pending ??= createRoll(readRequest());
    saveRoll(localStorage, pending);
  } catch (error) {
    notice(pending ? '本机保存失败。请重试保存，这一掷不会重新生成。' : error.message, true);
    setBusy(false);
    return;
  }
  current = pending;
  pending = null;
  await present(current);
});
$('replay').addEventListener('click', () => { if (current && !busy && !pending) present(current, true); });
$('skip').addEventListener('click', () => animator.stop());
document.addEventListener('visibilitychange', () => { if (document.hidden) animator.stop('hidden'); });
window.addEventListener('pagehide', event => { if (event.persisted) animator.stop('hidden'); else animator.dispose(); });

let restored = false;
try {
  current = loadRoll(localStorage);
  if (current) {
    showResult(current);
    const request = validateRequest(current);
    document.querySelectorAll('.die-count').forEach(input => {
      input.value = request.groups.find(group => group.sides === Number(input.dataset.sides))?.count ?? 0;
    });
    $('modifier-enabled').checked = request.modifier > 0;
    $('modifier').value = request.modifier || 1;
    $('empty-hint').textContent = '上一掷已保留，点击重播查看。';
    restored = true;
  }
} catch {
  notice('上一掷记录无法读取。原记录未删除；新投掷会在保存成功后替换它。', true);
}
try {
  await animator.initialize();
  animationAvailable = true;
  if (!$('notice').classList.contains('error')) notice(restored ? '已恢复上一掷，点击重播可以重新查看。' : '骰盘已就绪。选好骰子，开始投掷。');
} catch {
  notice('三维画面加载失败。仍可生成并保存点数，刷新页面后重试画面。', true);
}
ready = true;
updateRequest();

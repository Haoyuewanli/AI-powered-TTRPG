import { SIDES, MAX_DICE, createRoll } from './rolls.mjs';
import { loadRoll, saveRoll } from './journal.mjs';
import { DiceAnimation } from './dice-animation.mjs';

const $ = id => document.getElementById(id);
const descriptions = { 4: '四面骰', 6: '六面骰', 8: '八面骰', 10: '十面骰',
  12: '十二面骰', 20: '二十面骰', 100: '十位骰 + 个位骰' };
const outlines = { 4: 'M16 3 29 27H3Z M16 3v16M3 27l13-8 13 8',
  6: 'M5 8 16 2 27 8v16l-11 6L5 24Z M5 8l11 6 11-6M16 14v16',
  8: 'M16 2 29 16 16 30 3 16Z M3 16h26M16 2l6 14-6 14-6-14Z',
  10: 'M16 2 29 14 23 26 16 30 8 26 3 14Z M16 2l7 24M16 2 8 26M3 14l13 4 13-4M16 18v12',
  12: 'M10 3h12l9 10-4 14-15 4L1 20 3 9Z M10 3l-1 10 8 6 10-6M9 13l-8 7M17 19l-5 12M27 13v14',
  20: 'M16 2 29 9v15l-13 6L3 24V9Z M16 2 8 22h16L16 2M3 9l13 4 13-4M3 24l5-2 8 8 8-8 5 2M16 13 8 22m8-9 8 9' };
let sides = 20;
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
  $('roll').disabled = value || !ready;
  $('roll').innerHTML = value ? '命运正在落定… <span>✧</span>' : pending ? '重试保存这一掷 <span>↗</span>' : '掷出骰子 <span>↗</span>';
  $('skip').disabled = !value;
  $('replay').disabled = value || !current || !!pending;
  $('count').disabled = value || !!pending;
  $('minus').disabled = value || !!pending;
  $('plus').disabled = value || !!pending;
  document.querySelectorAll('.die-choice').forEach(button => { button.disabled = value || !!pending; });
  $('rolling-label').hidden = !value;
  $('table-state').textContent = value ? '投掷中' : animationAvailable ? '骰盘已就绪' : '文字结果可用';
}

function updateRequest() {
  const count = Number($('count').value);
  $('notation').textContent = `${count || '—'}d${sides}`;
  $('dice-description').textContent = descriptions[sides];
}

for (const value of SIDES) {
  const button = document.createElement('button');
  button.className = 'die-choice';
  button.dataset.sides = value;
  button.setAttribute('aria-label', `选择 d${value}`);
  button.setAttribute('aria-pressed', String(value === sides));
  button.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="${outlines[value === 100 ? 10 : value]}"/></svg><span>d${value}</span>`;
  button.addEventListener('click', () => {
    sides = value;
    document.querySelectorAll('.die-choice').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    updateRequest();
  });
  $('dice-picker').append(button);
}

for (const [id, amount] of [['minus', -1], ['plus', 1]]) {
  $(id).addEventListener('click', () => {
    $('count').value = Math.max(1, Math.min(MAX_DICE, (Number($('count').value) || 1) + amount));
    updateRequest();
  });
}
$('count').addEventListener('input', updateRequest);

function showResult(record) {
  $('individual').replaceChildren(...record.values.map(value => {
    const element = document.createElement('span');
    element.className = `result-die${record.sides === 20 && value === 20 ? ' critical' : ''}`;
    element.textContent = value;
    return element;
  }));
  $('result-label').textContent = `${record.count}d${record.sides} · 已保留`;
  $('total').textContent = record.total;
}

async function present(record, replay = false) {
  setBusy(true);
  $('empty-hint').hidden = true;
  $('total').textContent = '·';
  $('individual').replaceChildren();
  $('result-label').textContent = replay ? '重播上一掷' : `${record.count}d${record.sides}`;
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
    pending ??= createRoll({ sides, count: Number($('count').value) });
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
setBusy(false);

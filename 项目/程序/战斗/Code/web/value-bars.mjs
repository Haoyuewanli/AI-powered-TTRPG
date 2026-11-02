const el = (tag, text, cls) => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
export function valueBars(state, actor) {
  const group = el('div','','value-bars');
  const items = [ ['生命',actor.hp,actor.maxHp,'#df5965',''], ['临时生命',actor.tempHp,actor.tempHpBase ?? actor.tempHp,'#36c6b4','本次授予量；不是生命上限'] ];
  for (const [label,current,max,color,note] of items) {
    const row = el('div','','value-row'); row.title = note; row.style.setProperty('--bar-color',color);
    const bar = el('div','','value-track'); bar.setAttribute('role','meter'); bar.setAttribute('aria-label',label); bar.setAttribute('aria-valuemin','0'); bar.setAttribute('aria-valuemax',String(max || 1)); bar.setAttribute('aria-valuenow',String(current)); bar.setAttribute('aria-valuetext',`${current}/${max}`);
    const fill = el('span','','value-fill'); fill.style.width = `${max ? Math.min(100,current/max*100) : 0}%`; bar.append(fill,el('span','','value-ticks'));
    row.append(el('span',label,'value-label'),bar,el('strong',`${current}/${max}`,'value-readout')); group.append(row);
  }
  const badges = el('div','','value-badges'); badges.append(el('span',`AC ${actor.ac}`),el('span',`先攻 ${actor.initiativeBonus >= 0 ? '+' : ''}${actor.initiativeBonus}`)); group.append(badges);
  return group;
}

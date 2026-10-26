import { copyText } from '/client-utils.mjs';
const node = (tag, text = '') => { const item = document.createElement(tag); item.textContent = text; return item; };
export function sharingPanel({ api, notify, getState }) {
  const root = document.getElementById('sharing-panel');
  let status, context = '', pending = false, generation = 0, issued = new Map();
  const intro = node('p', '主持电脑保存进度。朋友通过角色邀请加入，无需安装程序。');
  const buttons = node('div'); buttons.className = 'button-row';
  const local = node('button', '开启同Wi-Fi联机'), online = node('button', '开启线上联机'), stop = node('button', '关闭分享');
  local.id = 'share-lan'; online.id = 'share-online'; stop.id = 'share-stop';
  for (const button of [local, online, stop]) { button.type = 'button'; buttons.append(button); }
  const report = node('p'); report.id = 'share-status'; report.setAttribute('role', 'status');
  const form = node('div'); form.className = 'sharing-invite';
  const label = node('label', '邀请哪位玩家'); const players = node('select'); players.id = 'share-actor'; label.append(players);
  const invite = node('button', '生成并复制邀请'); invite.id = 'share-invite'; invite.type = 'button';
  const link = node('textarea'); link.id = 'share-link'; link.rows = 3; link.readOnly = true; link.setAttribute('aria-label', '角色邀请链接'); link.hidden = true;
  const copy = node('button', '复制邀请'); copy.id = 'share-copy'; copy.type = 'button'; copy.hidden = true;
  const links = node('div'); links.className = 'sharing-addresses';
  const list = node('div'); list.id = 'share-invites';
  const note = node('p', '同Wi-Fi：双方连接同一个网络。线上：邀请仅在主机开着分享时有效；连接失败可重试。远程数据经过Cloudflare转发。'); note.className = 'fine';
  const help = node('details'); help.append(node('summary', '朋友打不开时')); help.append(node('p', '先确认主持电脑仍开着分享，朋友使用的是带角色邀请的完整地址。同Wi-Fi请避开访客网络；若Windows弹出网络访问询问，允许当前可信的私人网络。线上失败可先重试，或改为同Wi-Fi。程序不会自动修改防火墙。'));
  form.append(label, invite, link, copy, links); root.append(intro, buttons, report, form, list, note, help);
  const visible = () => root.closest('dialog')?.open || root.offsetParent !== null;
  function draw() {
    if (!status) return;
    local.textContent = status.enabled ? '同Wi-Fi已开启' : '开启同Wi-Fi联机'; local.disabled = pending || status.enabled;
    const phase = status.online?.status;
    online.textContent = phase === 'starting' ? '正在建立线上连接…' : phase === 'ready' ? '线上已开启' : '开启线上联机';
    online.disabled = pending || ['starting', 'ready'].includes(phase); stop.disabled = pending || !status.enabled;
    report.textContent = !status.enabled ? '分享已关闭。本机仍可继续游戏。' :
      `${phase === 'ready' ? '线上可加入' : phase === 'starting' ? '正在连接线上服务' : '同Wi-Fi可加入'} · 已连接 ${status.connectedPlayers || 0} 位玩家${status.online?.error ? `。${status.online.error}` : ''}`;
    const selected = players.value;
    players.replaceChildren(...(status.players || []).map(p => { const option = node('option', p.actorName); option.value = p.actorId; return option; }));
    if ([...players.options].some(o => o.value === selected)) players.value = selected;
    invite.disabled = pending || !players.value;
    list.replaceChildren(...(status.invites || []).map(entry => {
      const row = node('div'); row.className = 'invite-row'; row.append(node('span', entry.actorName));
      const revoke = node('button', '撤销邀请'); revoke.type = 'button'; revoke.disabled = pending;
      revoke.addEventListener('click', () => mutate({ operation: 'revoke', inviteId: entry.id })); row.append(revoke); return row;
    }));
    for (const key of issued.keys()) if (!(status.invites || []).some(entry => entry.id === key)) issued.delete(key);
    const current = [...issued.values()].reverse().find(entry => entry.actorId === players.value);
    links.replaceChildren();
    if (current && status.enabled) {
      const urls = [...(phase === 'ready' && status.online.url ? [status.online.url] : []), ...(status.lanUrls || [])]
        .map(base => `${base.replace(/\/$/, '')}/#invite=${encodeURIComponent(current.token)}`);
      link.value = urls[0] || ''; link.hidden = !link.value; copy.hidden = !link.value;
      if (urls.length > 1) {
        const other = node('details'); other.append(node('summary', '其他可用地址'));
        for (const value of urls.slice(1)) { const input = node('input'); input.value = value; input.readOnly = true; input.setAttribute('aria-label', '备用邀请地址'); input.addEventListener('click', () => input.select()); other.append(input); }
        links.append(other);
      }
    } else { link.value = ''; link.hidden = true; copy.hidden = true; }
  }
  async function refresh() {
    if (pending || getState()?.viewRole !== 'dm') return;
    const stamp = generation;
    try { const next = await api('/api/sharing'); if (stamp === generation) { status = next; draw(); } }
    catch (error) { if (stamp === generation) report.textContent = error.message; }
  }
  async function mutate(body) {
    if (pending || getState()?.viewRole !== 'dm') return;
    pending = true; draw(); const stamp = generation;
    try {
      const result = await api('/api/sharing', body);
      if (stamp !== generation) return;
      if (result.invite) issued.set(result.invite.id, result.invite);
      status = result; draw();
      if (body.operation === 'invite' && link.value) {
        const ok = await copyText(link.value, link);
        notify(ok ? '邀请已复制，发给对应玩家即可。' : '邀请已生成并选中，请按 Ctrl+C 复制。');
      }
    } catch (error) { if (stamp === generation) notify(error.message, true); }
    finally { pending = false; draw(); await refresh(); }
  }
  local.addEventListener('click', () => mutate({ operation: 'enable' }));
  online.addEventListener('click', () => mutate({ operation: 'start-online' }));
  stop.addEventListener('click', () => mutate({ operation: 'disable' }));
  invite.addEventListener('click', () => mutate({ operation: 'invite', actorId: players.value }));
  players.addEventListener('change', draw);
  copy.addEventListener('click', async () => notify(await copyText(link.value, link) ? '邀请已复制。' : '已选中，请按 Ctrl+C 复制。'));
  link.addEventListener('click', () => link.select());
  setInterval(() => { if (visible()) refresh(); }, 2000);
  return {
    render(state) {
      const key = `${state.campaignId}/${state.battleId}/${state.viewRole}`;
      if (context !== key) { generation++; context = key; status = null; issued.clear(); link.value = ''; link.hidden = copy.hidden = true; refresh(); }
    },
    clear() { generation++; context = ''; status = null; issued.clear(); players.replaceChildren(); list.replaceChildren(); links.replaceChildren(); link.value = ''; link.hidden = copy.hidden = true; report.textContent = ''; }
  };
}

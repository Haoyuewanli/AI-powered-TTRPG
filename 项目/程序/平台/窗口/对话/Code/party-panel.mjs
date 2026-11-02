const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
const button = (text, action) => { const element = node('button', text, 'project-button'); element.type = 'button'; element.addEventListener('click', action); return element; };

export function createPartyPanel({ host, api, onChange = () => {}, onStatus = () => {} }) {
  const section = node('section', undefined, 'library-party-panel'); section.setAttribute('aria-label', '当前团角色与玩家邀请'); host.append(section);
  let current = null, generation = 0, busy = false;
  const notice = message => onStatus(message);
  async function perform(operation) {
    if (busy) return; busy = true;
    for (const element of section.querySelectorAll('button,input')) element.disabled = true;
    try { await operation(); } catch (error) { notice(error.message); }
    finally { busy = false; for (const element of section.querySelectorAll('button,input')) element.disabled = false; }
  }
  async function load() {
    const request = ++generation;
    try {
      const value = await api('/api/library/context'); if (request !== generation) return; current = value; section.replaceChildren();
      if (value.role !== 'dm') { section.hidden = true; return; } section.hidden = false;
      section.append(node('h3', '角色与玩家邀请'));
      if (!value.selected) { section.append(node('p', '先在模组窗口继续一个游玩团。')); return; }
      section.append(node('p', value.selected.runName));
      const characters = node('div');
      for (const character of value.characters || []) {
        const row = node('article', undefined, 'library-party-member');
        row.append(node('strong', character.name), node('p', character.playerName || '受控玩家'));
        const actions = node('div');
        const invite = button('生成本机邀请', () => perform(async () => {
          const latest = await api('/api/library/context');
          if (latest.selected?.runId !== value.selected.runId || latest.selected?.moduleId !== value.selected.moduleId) throw new Error('当前团已切换，请重新打开角色名单。');
          const result = await api('/api/library/invites', { playerId: character.playerId, expectedRevision: latest.revision });
          const link = new URL(location.pathname, location.origin); link.hash = 'invite=' + encodeURIComponent(result.token);
          const field = node('input'); field.type = 'text'; field.readOnly = true; field.value = link.href; field.setAttribute('aria-label', character.name + '的本机邀请链接');
          const copy = button('复制本机邀请链接', async () => {
            try { await navigator.clipboard.writeText(field.value); notice('本机邀请链接已复制。'); }
            catch { field.focus(); field.select(); notice('链接已选中，可按Ctrl+C复制。'); }
          });
          actions.replaceChildren(field, copy, button('撤销此邀请', () => perform(async () => {
            await api('/api/library/invites/revoke', { inviteId: result.inviteId }); actions.replaceChildren(invite); notice('此邀请已撤销，已有玩家会话随即失效。'); await onChange();
          })));
          notice('本机邀请已生成。'); await onChange();
        }));
        actions.append(invite); row.append(actions); characters.append(row);
      }
      section.append(characters);
      const form = node('form'), nameLabel = node('label', '角色名'), name = node('input'); name.required = true; name.maxLength = 200; name.setAttribute('aria-label', '新角色名称'); nameLabel.append(name);
      const playerLabel = node('label', '玩家称呼'), playerName = node('input'); playerName.maxLength = 200; playerName.setAttribute('aria-label', '玩家称呼'); playerLabel.append(playerName);
      const add = node('button', '添加角色', 'project-button'); add.type = 'submit';
      form.append(nameLabel, playerLabel, add); form.addEventListener('submit', event => {
        event.preventDefault(); if (!name.value.trim()) return;
        void perform(async () => {
          const latest = await api('/api/library/context');
          if (latest.selected?.runId !== value.selected.runId || latest.selected?.moduleId !== value.selected.moduleId) throw new Error('当前团已切换，请重新打开角色名单。');
          await api('/api/library/characters', { name: name.value.trim(), playerName: playerName.value.trim(), expectedRevision: latest.revision });
          notice('角色已加入当前团。'); await load(); await onChange();
        });
      });
      section.append(form);
    } catch (error) { if (request === generation) notice(error.message); }
  }
  return { load, clear() { generation++; current = null; section.replaceChildren(); }, setVisible(value) { section.hidden = !value; if (value) void load(); } };
}

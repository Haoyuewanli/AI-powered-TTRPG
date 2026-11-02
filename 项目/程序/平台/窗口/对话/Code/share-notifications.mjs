const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };

export function createShareNotifications({ host, api, onOpenResource = () => {}, onPermissionsChanged = () => {}, onStatus = () => {}, interval = 5000 }) {
  const section = node('section', undefined, 'library-notifications'); section.setAttribute('aria-label', '资料开放通知');
  const title = node('strong', '资料开放通知'), list = node('div'); list.setAttribute('role', 'log'); list.setAttribute('aria-live', 'polite');
  section.append(title, list); host.append(section);
  let timer = null, active = true, loading = false, revision = null, signature = '', generation = 0;
  function clear() { generation++; revision = null; signature = ''; list.replaceChildren(); }
  async function load() {
    if (!active || loading) return;
    loading = true; const current = generation;
    try {
      const value = await api('/api/library/notifications'); if (current !== generation || !active) return;
      if (revision !== null && revision !== value.revision) await onPermissionsChanged({ revision: value.revision });
      revision = value.revision;
      const next = JSON.stringify(value.notifications || []); if (next === signature) return; signature = next;
      list.replaceChildren();
      for (const notification of value.notifications || []) {
        const row = node('article', undefined, 'library-notification');
        const text = node(notification.canOpen ? 'button' : 'p', notification.content);
        if (notification.canOpen) {
          text.type = 'button'; text.className = 'project-button'; text.dataset.sharedResourceId = notification.resourceId;
          text.addEventListener('click', async () => {
            text.disabled = true;
            try { await onOpenResource(notification.resourceId); }
            catch (error) { onStatus(error.message); await onPermissionsChanged({ resourceId: notification.resourceId, denied: true }); void load(); }
            finally { text.disabled = false; }
          });
        }
        const time = node('time', new Date(notification.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })); time.dateTime = notification.createdAt;
        row.append(text, time); list.append(row);
      }
      if (!list.childElementCount) list.append(node('p', '还没有资料开放通知。'));
    } catch (error) {
      if (current !== generation) return;
      if (error.status === 401 || error.code === 'session_invalid') { clear(); await onPermissionsChanged({ invalid: true }); stop(); }
      onStatus(error.message);
    } finally { loading = false; }
  }
  function start() { active = true; if (!timer) timer = setInterval(() => void load(), Math.max(1000, interval)); void load(); }
  function stop() { active = false; clearInterval(timer); timer = null; }
  start();
  return { load, clear, setVisible(value) { if (value) start(); else stop(); section.hidden = !value; }, destroy() { stop(); clear(); section.remove(); } };
}

export const PLATFORM_BRIDGE_CHANNEL = 'ttrpg-platform-battle-v1';

function exactLocalOrigin(value) {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value)) return false;
  try { return new URL(value).origin === value && Number(new URL(value).port) <= 65535; } catch { return false; }
}

// The parent receives lifecycle acknowledgements only; game state stays in this origin.
export function installPlatformBridge({ origin, lifecycle, host = window }) {
  if (!exactLocalOrigin(origin) || host.parent === host) return () => {};
  const parent = host.parent;
  if (host.document?.body) {
    host.document.body.dataset.platformEmbedded = 'true';
    const style = host.document.createElement('link');
    style.rel = 'stylesheet'; style.href = '/platform-embed.css'; style.id = 'platform-embed-style'; host.document.head.append(style);
  }
  let queue = Promise.resolve(), active = true;
  const respond = value => { if (active) parent.postMessage({ channel: PLATFORM_BRIDGE_CHANNEL, ...value }, origin); };
  const receive = event => {
    const data = event.data;
    if (!active || event.source !== parent || event.origin !== origin || !data || typeof data !== 'object' || Array.isArray(data)
      || data.channel !== PLATFORM_BRIDGE_CHANNEL || typeof data.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(data.id)
      || !['canLeave', 'setVisible', 'logout'].includes(data.type) || (data.type === 'setVisible' && typeof data.visible !== 'boolean')) return;
    const { id, type, visible } = data;
    queue = queue.then(async () => {
      if (!active) return;
      try {
        const allowed = type === 'canLeave' ? await lifecycle.canLeave()
          : type === 'setVisible' ? await lifecycle.setVisible(visible) : await lifecycle.logout();
        respond({ id, type: 'reply', ok: true, allowed: !!allowed, visible: !!lifecycle.visible });
      } catch { respond({ id, type: 'reply', ok: false, allowed: false, visible: !!lifecycle.visible }); }
    });
  };
  host.addEventListener('message', receive);
  lifecycle.setVisible(false);
  respond({ type: 'ready' });
  return () => { active = false; host.removeEventListener('message', receive); };
}

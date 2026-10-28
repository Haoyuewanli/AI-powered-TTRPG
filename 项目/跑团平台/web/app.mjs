import { createPlatformShell } from '/platform-shell.mjs';
import { createDialogueWorkspace } from '/dialogue-workspace.mjs';

let dialogue;
let appearanceTag = null, appearanceRevision = 0, appearanceLoaded = false;
let pendingAppearance = null, committedAppearance = '', appearanceTimer = 0, appearanceSaving = false, appearanceBlocked = false;
const platform = createPlatformShell({
  onPageChange: page => dialogue?.setVisible(page === 'dialogue'),
  onIdentityChange: () => dialogue?.clear(),
  onAppearanceChange: value => {
    if (!appearanceLoaded) return;
    if (JSON.stringify(value) === committedAppearance) return;
    pendingAppearance = value;
    if (appearanceBlocked) return;
    platform.setAppearanceStatus('外观更改待保存');
    clearTimeout(appearanceTimer);
    appearanceTimer = setTimeout(saveAppearance, 220);
  },
  onAppearanceRetry: () => loadAppearance()
});
const dialogueHost = platform.root.querySelector('[data-dialogue-host]');
dialogue = createDialogueWorkspace(dialogueHost);
dialogue.setVisible(false);
document.getElementById('platform-loading')?.remove();

async function loadAppearance() {
  clearTimeout(appearanceTimer);
  if (appearanceSaving) return;
  platform.setAppearanceReady(false);
  platform.setAppearanceStatus('正在读取本地外观设置');
  try {
    const response = await fetch('/api/appearance', { cache: 'no-store' });
    const value = await response.json();
    if (!response.ok || !response.headers.get('etag')) throw new Error(value.error || '外观读取失败');
    appearanceTag = response.headers.get('etag');
    appearanceRevision = value.revision;
    platform.setAppearance(value);
    committedAppearance = JSON.stringify(platform.getAppearance());
    pendingAppearance = null;
    appearanceBlocked = false;
    appearanceLoaded = true;
    platform.setAppearanceStatus('外观已从本地文件读取');
  } catch {
    appearanceBlocked = true;
    platform.setAppearanceStatus('本地外观暂不可读；页面外观可调整，草稿尚未保存。重新读取会放弃本页草稿。', { canRetry: true });
  } finally {
    platform.setAppearanceReady(true);
  }
}

async function saveAppearance() {
  if (appearanceSaving || appearanceBlocked || !appearanceTag || !pendingAppearance) return;
  const draft = pendingAppearance;
  const signature = JSON.stringify(draft);
  if (signature === committedAppearance) { pendingAppearance = null; return; }
  appearanceSaving = true;
  platform.setAppearanceStatus('正在保存外观');
  try {
    const response = await fetch('/api/appearance', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': appearanceTag },
      body: JSON.stringify({ schemaVersion: 1, revision: appearanceRevision, ...draft })
    });
    const value = await response.json();
    if (!response.ok || !response.headers.get('etag')) {
      appearanceBlocked = true;
      platform.setAppearanceStatus(response.status === 409
        ? '外观文件已由其他窗口修改；本页草稿保留，自动保存已暂停。重新读取会放弃本页草稿。'
        : '外观保存失败；本页草稿保留。重新读取会放弃本页草稿。', { conflict: response.status === 409, canRetry: true });
      return;
    }
    appearanceTag = response.headers.get('etag');
    appearanceRevision = value.revision;
    committedAppearance = signature;
    if (JSON.stringify(pendingAppearance) === signature) pendingAppearance = null;
    platform.setAppearanceStatus('外观已保存到本地文件');
  } catch {
    appearanceBlocked = true;
    platform.setAppearanceStatus('连接中断；外观草稿保留。重新读取会放弃本页草稿。', { canRetry: true });
  } finally {
    appearanceSaving = false;
    if (pendingAppearance && !appearanceBlocked) saveAppearance();
  }
}

async function connectionStatus() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    const info = await response.json();
    platform.setConnection(response.ok && info.app === 'standalone-ttrpg-platform');
  } catch { platform.setConnection(false); }
}
connectionStatus();
loadAppearance();

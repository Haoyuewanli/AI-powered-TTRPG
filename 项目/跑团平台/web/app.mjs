import { createPlatformShell } from '/platform-shell.mjs';
import { createDialogueWorkspace } from '/dialogue-workspace.mjs';

let dialogue;
const platform = createPlatformShell({
  onPageChange: page => dialogue?.setVisible(page === 'dialogue'),
  onIdentityChange: () => dialogue?.clear()
});
const dialogueHost = platform.root.querySelector('[data-dialogue-host]');
dialogue = createDialogueWorkspace(dialogueHost);
dialogue.setVisible(false);
document.getElementById('platform-loading')?.remove();

async function connectionStatus() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    const info = await response.json();
    platform.setConnection(response.ok && info.app === 'standalone-ttrpg-platform');
  } catch { platform.setConnection(false); }
}
connectionStatus();

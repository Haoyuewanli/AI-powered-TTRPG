import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, execFile } from 'node:child_process';

export async function windowBrowser(environment = process.env) {
  const candidates = [environment['ProgramFiles(x86)'], environment.ProgramFiles, environment.LOCALAPPDATA]
    .filter(Boolean).map(base => join(base, 'Microsoft/Edge/Application/msedge.exe'));
  for (const path of candidates) {
    try { await access(path); return path; } catch { /* Try the next installed location. */ }
  }
  return null;
}

export function windowArguments(url, profile) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') throw new Error('桌面窗口仅接受本机战斗地址');
  return [`--app=${url}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-sync',
    '--disable-background-networking', '--no-default-browser-check'];
}

export async function openBattleWindow(url, profile, { browser = windowBrowser } = {}) {
  const executable = await browser();
  if (!executable) return false;
  const child = spawn(executable, windowArguments(url, profile), { detached: true, windowsHide: true, stdio: 'ignore' });
  await new Promise((accept, reject) => { child.once('spawn', accept); child.once('error', reject); });
  child.unref(); return true;
}

export function openBrowser(url) {
  return new Promise((accept, reject) => {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, error => error ? reject(error) : accept());
  });
}

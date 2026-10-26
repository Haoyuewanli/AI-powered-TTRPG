import { spawn } from 'node:child_process';
import { open, readFile, access } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import { findCampaign } from './src/campaign.mjs';
import { openBattleWindow, openBrowser } from './src/desktop.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const sleep = ms => new Promise(accept => setTimeout(accept, ms));
async function health(url) {
  try { return await (await fetch(url + '/health', { signal: AbortSignal.timeout(700) })).json(); }
  catch { return null; }
}
async function occupied(port) {
  return new Promise(accept => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(600);
    const finish = value => { socket.destroy(); accept(value); };
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.once('timeout', () => finish(false));
  });
}

try {
  const port = Number(argument('--port') || process.env.BATTLE_PORT || 4182);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口须为1～65535的整数');
  const directory = resolve(argument('--campaign') || await findCampaign(resolve(root, '../存档')));
  const campaignKey = createHash('sha256').update(directory.toLowerCase()).digest('hex');
  const url = `http://127.0.0.1:${port}`;
  await access(resolve(root, '../骰盘/node_modules/three/build/three.module.js'));
  const packageInfo = JSON.parse(await readFile(resolve(root, '../骰盘/node_modules/three/package.json'), 'utf8'));
  if (packageInfo.version !== '0.143.0') throw new Error('当前棋盘使用已锁定的Three.js 0.143.0，请先核对依赖版本。');
  let status = await health(url);
  if (status && (status.app !== 'local-battle-v1' || status.campaignKey !== campaignKey)) throw new Error('此端口运行的是其他服务或战役；请关闭它，或用 --port 指定其他端口。');
  if (!status) {
    if (await occupied(port)) throw new Error('端口被其他程序占用，未启动新进程。请用 --port 指定其他端口。');
    const output = await open(join(directory, '服务输出.log'), 'a');
    const errors = await open(join(directory, '服务错误.log'), 'a');
    let child, failed = false;
    try {
      child = spawn(process.execPath, [join(root, 'server.mjs'), '--campaign', directory], {
        cwd: root, env: { ...process.env, BATTLE_PORT: String(port) },
        detached: true, windowsHide: true, stdio: ['ignore', output.fd, errors.fd]
      });
      child.once('error', () => { failed = true; });
      child.unref();
    } finally { await output.close(); await errors.close(); }
    for (let attempt = 0; attempt < 60; attempt++) {
      status = await health(url);
      if (status) break;
      if (failed || child.exitCode !== null) throw new Error('启动失败，请查看战役目录的“服务错误.log”。');
      await sleep(200);
    }
    if (!status || status.app !== 'local-battle-v1' || status.campaignKey !== campaignKey) throw new Error('服务未能就绪，请检查战役目录的日志。');
  }
  if (process.argv.includes('--credentials')) {
    if (process.platform !== 'win32') throw new Error('请在本机战役目录查看“本机身份.json”。');
    const editor = spawn('notepad.exe', [join(directory, '本机身份.json')], { detached: true, stdio: 'ignore' });
    editor.once('error', () => console.error('无法打开记事本，请在战役目录手动查看“本机身份.json”。')); editor.unref();
  }
  if (!process.argv.includes('--no-browser') && process.platform === 'win32') {
    const opened = !process.argv.includes('--browser') && await openBattleWindow(url, resolve(root, '../存档/战斗窗口')).catch(() => false);
    if (!opened) await openBrowser(url);
  }
  console.log(`本地战斗就绪：${url}`);
} catch (error) { console.error(error.code === 'ENOENT' ? '缺少战役资料或现有骰盘依赖，请先核对本地目录。' : error.message); process.exitCode = 1; }

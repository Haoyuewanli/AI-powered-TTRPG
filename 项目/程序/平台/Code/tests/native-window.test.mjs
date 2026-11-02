import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, copyFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformAppUrl, platformWindowProfile, createNativeWindow } from '../native-window.mjs';
import { outputDirectory } from './check-helpers.mjs';

const windows = { skip: process.platform !== 'win32' };
const url = 'http://127.0.0.1:4198';
const presets = ['2560x1600', '2560x1440', '2048x1536', '1920x1440'];
const valueAt = (args, name) => args[args.indexOf(name) + 1];
function resultFor(args, patch = {}) {
  const preset = args.includes('-Preset') ? valueAt(args, '-Preset').split('x').map(Number) : [0, 0];
  return { status: preset[0] ? 'resized' : 'found', width: preset[0] ? preset[0] / 2 : 1200, height: preset[1] ? preset[1] / 2 : 800,
    requestedWidth: preset[0], requestedHeight: preset[1], scale: preset[0] ? .5 : 1, scaled: !!preset[0], windowCount: 1, pid: 123, windowId: '456', ...patch };
}
async function fixture(execute) {
  await mkdir(outputDirectory, { recursive: true });
  const directory = await mkdtemp(join(outputDirectory, 'native-window-')), projectRoot = join(directory, 'project'), codeRoot = join(directory, 'code');
  await mkdir(codeRoot); await mkdir(projectRoot);
  const native = createNativeWindow({ codeRoot, projectRoot, getUrl: () => url, browser: async () => 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', execute });
  return { directory, projectRoot, codeRoot, native, profile: platformWindowProfile(codeRoot, projectRoot, url) };
}

test('application URLs remain exact loopback roots with one independent-window marker', () => {
  assert.equal(platformAppUrl(url), url + '/#platform-window=1');
  assert.equal(platformAppUrl(url + '/#platform-window=1'), url + '/#platform-window=1');
  for (const invalid of ['https://127.0.0.1:4198', 'http://localhost:4198', 'http://127.0.0.1', 'http://127.0.0.1:4198/path', url + '?preset=bad', url + '/#other', 'http://user@127.0.0.1:4198', 'http://127.0.0.1:70000']) assert.throws(() => platformAppUrl(invalid));
});

test('profiles separate code folders, project roots and origins without containing raw project names', () => {
  const first = platformWindowProfile('code-one', 'project-one', url);
  assert(first.startsWith(join(resolve('code-one'), '.runtime', 'browser-')));
  assert.match(first.slice(-32), /^browser-[a-f0-9]{24}$/);
  assert.equal(first, platformWindowProfile('code-one', 'project-one', url + '/#platform-window=1'));
  assert.notEqual(first, platformWindowProfile('code-two', 'project-one', url));
  assert.notEqual(first, platformWindowProfile('code-one', 'project-two', url));
  assert.notEqual(first, platformWindowProfile('code-one', 'project-one', 'http://127.0.0.1:4199'));
});

test('an absent profile with no wait remains unmanaged and cannot invoke a native helper', windows, async () => {
  let calls = 0; const f = await fixture(async () => { calls++; throw Error('must not run'); });
  const result = await f.native.inspect(); assert.equal(result.status, 'unmanaged'); assert.equal(result.reason, 'profile-not-created'); assert.equal(calls, 0);
  assert.equal((await f.native.resize('2560x1440')).status, 'unmanaged'); assert.equal(calls, 0);
});

test('native operations are serialized, pass only preset arguments and confirm measured dimensions', windows, async () => {
  const calls = []; let running = 0, maximum = 0;
  const f = await fixture(async (executable, args, options) => {
    calls.push({ executable, args, options }); maximum = Math.max(maximum, ++running);
    await new Promise(accept => setTimeout(accept, 5)); running--;
    return { stdout: JSON.stringify(resultFor(args)) };
  });
  await mkdir(f.profile, { recursive: true });
  const results = await Promise.all(presets.map(preset => f.native.resize(preset)));
  assert.equal(maximum, 1); assert.equal(calls.length, 4);
  assert.deepEqual(results.map(x => [x.width, x.height]), [[1280, 800], [1280, 720], [1024, 768], [960, 720]]);
  for (let n = 0; n < calls.length; n++) {
    const call = calls[n]; assert.equal(call.executable, 'powershell.exe');
    assert.deepEqual(call.args.slice(0, 4), ['-NoProfile', '-NonInteractive', '-File', join(f.codeRoot, 'native-window.ps1')]);
    assert.equal(valueAt(call.args, '-AppUrl'), url + '/#platform-window=1'); assert.equal(valueAt(call.args, '-Profile'), f.profile);
    assert.equal(valueAt(call.args, '-Preset'), presets[n]); assert.equal(call.options.shell, false); assert.equal(call.options.windowsHide, true);
    assert(!call.args.includes('-Activate')); assert(!call.args.some(x => /Command|EncodedCommand|WindowId|Pid/i.test(x)));
  }
  const inspected = await f.native.inspect(); assert.equal(inspected.status, 'found');
  await f.native.resize(presets[0], { waitMs: 5000, activate: true });
  assert.equal(valueAt(calls.at(-1).args, '-WaitMs'), '5000'); assert(calls.at(-1).args.includes('-Activate'));
});

test('unsupported presets and unsafe options cannot reach a native helper or poison the next request', windows, async () => {
  let calls = 0; const f = await fixture(async (_, args) => { calls++; return { stdout: JSON.stringify(resultFor(args)) }; });
  await mkdir(f.profile, { recursive: true });
  for (const invalid of ['1024x768', '__proto__', '../window', {}, null]) await assert.rejects(f.native.resize(invalid));
  await assert.rejects(f.native.resize(presets[0], { waitMs: 5001 }));
  await assert.rejects(f.native.inspect({ waitMs: -1 })); await assert.rejects(f.native.inspect({ activate: 'yes' }));
  assert.equal(calls, 0); assert.equal((await f.native.resize(presets[0])).status, 'resized'); assert.equal(calls, 1);
});

test('ambiguous or failed helpers never claim resize success or expose raw helper errors', windows, async () => {
  let output;
  const f = await fixture(async () => {
    if (output instanceof Error) throw output;
    return { stdout: output };
  });
  await mkdir(f.profile, { recursive: true });
  const success = { status: 'resized', width: 1280, height: 800, requestedWidth: 2560, requestedHeight: 1600, scale: .5, scaled: true, windowCount: 1 };
  for (output of ['not JSON', JSON.stringify({ ...success, width: 1279 }), JSON.stringify({ ...success, windowCount: 2 }), new Error('private host path and raw native output')]) {
    const result = await f.native.resize(presets[0]); assert.equal(result.status, 'failed'); assert.equal(result.reason, 'native-helper-failed'); assert(!JSON.stringify(result).includes('private'));
  }
  output = JSON.stringify({ ...success, status: 'ambiguous', width: 0, height: 0, windowCount: 2, reason: 'multiple-owned-windows', privatePath: 'do not return' });
  const result = await f.native.resize(presets[0]); assert.equal(result.status, 'ambiguous'); assert.equal(result.windowCount, 2); assert(!Object.hasOwn(result, 'privatePath'));
  output = JSON.stringify({ ...success, requestedWidth: 0, requestedHeight: 0 }); assert.equal((await f.native.inspect()).status, 'failed');
});

test('the actual Windows helper compiles and reads an unused synthetic profile without changing any window', windows, async t => {
  const candidates = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean).map(root => join(root, 'Microsoft/Edge/Application/msedge.exe'));
  let browser;
  for (const candidate of candidates) { try { await access(candidate); browser = candidate; break; } catch {} }
  if (!browser) { t.skip('No installed Edge for the read-only helper smoke check'); return; }
  const f = await fixture(); await mkdir(f.profile, { recursive: true });
  await copyFile(fileURLToPath(new URL('../native-window.ps1', import.meta.url)), join(f.codeRoot, 'native-window.ps1'));
  const native = createNativeWindow({ codeRoot: f.codeRoot, projectRoot: f.projectRoot, getUrl: () => url, browser });
  const result = await native.inspect(); assert.equal(result.status, 'unmanaged'); assert.equal(result.windowCount, 0);
});

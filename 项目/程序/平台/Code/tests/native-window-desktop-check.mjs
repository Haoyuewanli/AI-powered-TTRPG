import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolatePlatform, stopOwnedPlatform } from './check-helpers.mjs';

assert.equal(process.platform, 'win32', 'This check measures real Windows application frames.');
const sample = await isolatePlatform('native-frames-'), previousRoot = process.env.RPG_PROJECT_ROOT;
const launcher = await import(pathToFileURL(join(sample.isolated, 'launcher.mjs')));
const { createNativeWindow } = await import(pathToFileURL(join(sample.isolated, 'native-window.mjs')));
const opened = [], checks = [], measurements = [];
let app, control, ownWindow, controlWindow;
const check = text => { checks.push(text); console.log('PASS: ' + text); };
async function start(name) {
  const projectRoot = join(sample.directory, name); await mkdir(projectRoot);
  process.env.RPG_PROJECT_ROOT = projectRoot;
  const result = await launcher.launchPlatform({ port: 0 });
  const item = { ...result, projectRoot, native: createNativeWindow({ codeRoot: sample.isolated, projectRoot, getUrl: () => result.url }) }; opened.push(item);
  assert.equal(result.reused, false); assert.equal(result.window.status, 'resized');
  return item;
}
async function save(preset, native = true) {
  const before = await fetch(app.url + '/api/appearance'), value = await before.json(); value.displayPreset = preset;
  const response = await fetch(app.url + '/api/appearance', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': before.headers.get('etag'), ...(native ? { 'X-Platform-Window': 'application' } : {}) }, body: JSON.stringify(value) });
  assert.equal(response.status, 200); await response.json(); return response;
}
async function finishApp(item) {
  const current = await item.native.inspect();
  if (current.status === 'found') process.kill(current.pid);
  await stopOwnedPlatform(item.pid, item.url);
}
try {
  app = await start('main-fixture'); ownWindow = await app.native.inspect(); assert.equal(ownWindow.status, 'found');
  control = await start('unrelated-fixture'); controlWindow = await control.native.inspect(); assert.equal(controlWindow.status, 'found'); assert.notEqual(controlWindow.pid, ownWindow.pid);
  for (const preset of ['2560x1440', '2048x1536', '1920x1440', '2560x1600']) {
    const response = await save(preset); assert.equal(response.headers.get('x-platform-window-state'), 'resized');
    const current = await app.native.inspect(), other = await control.native.inspect();
    assert.equal(current.status, 'found'); assert.equal(current.windowId, ownWindow.windowId);
    const [width, height] = response.headers.get('x-platform-window-size').split('x').map(Number);
    assert.equal(current.width, width); assert.equal(current.height, height);
    assert.deepEqual({ width: other.width, height: other.height, windowId: other.windowId }, { width: controlWindow.width, height: controlWindow.height, windowId: controlWindow.windowId });
    measurements.push({ preset, width, height, windowId: current.windowId });
  }
  assert.equal(new Set(measurements.map(x => x.width + 'x' + x.height)).size, 4);
  check('四预设改变同一个原生窗口的实测外框，两个4:3尺寸也不同，另一平台资料根窗口不动');
  const beforeBrowser = await app.native.inspect(), response = await save('1920x1440', false);
  assert.equal(response.headers.get('x-platform-window-state'), 'browser');
  const afterBrowser = await app.native.inspect(); assert.equal(afterBrowser.width, beforeBrowser.width); assert.equal(afterBrowser.height, beforeBrowser.height);
  check('普通浏览器保存尺寸不移动独立窗口，外观仍成功保存');
  process.env.RPG_PROJECT_ROOT = app.projectRoot;
  const beforeReopen = await app.native.inspect();
  const reopened = await launcher.launchPlatform({ port: Number(new URL(app.url).port) });
  assert.equal(reopened.reused, true); assert.equal(reopened.pid, app.pid); assert.equal(reopened.window.status, 'resized'); assert.equal(reopened.window.reusedWindow, true); assert.equal(reopened.window.windowId, ownWindow.windowId);
  assert.equal(reopened.window.pid, beforeReopen.pid);
  const selected = measurements.find(x => x.preset === '1920x1440'); assert.equal(reopened.window.width, selected.width); assert.equal(reopened.window.height, selected.height);
  check('重新打开复用原服务和原窗口，并从已保存的预设恢复真实外框');
  const result = { checks, measurements, directory: sample.directory, app: { url: app.url, windowId: ownWindow.windowId }, control: { url: control.url, windowId: controlWindow.windowId } };
  await writeFile(join(sample.directory, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} catch (error) { await writeFile(join(sample.directory, 'failure.json'), JSON.stringify({ message: error.message, checks, measurements }, null, 2)); throw error; }
finally {
  for (const item of [...opened].reverse()) await finishApp(item);
  if (previousRoot === undefined) delete process.env.RPG_PROJECT_ROOT; else process.env.RPG_PROJECT_ROOT = previousRoot;
}

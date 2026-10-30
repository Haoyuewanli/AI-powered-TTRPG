import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startPlatform } from '../../平台/server.mjs';

const { chromium } = await import(pathToFileURL(process.env.RPG_PLATFORM_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../../../开发记录/临时/封面视角缓存检查/', import.meta.url));
await mkdir(output, { recursive: true }); const directory = await mkdtemp(join(output, 'case-')), projectRoot = join(directory, '项目');
const imagePath = join(projectRoot, '模组/多人短团/私有合成模组/模组封面.png'); await mkdir(join(imagePath, '..'), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.RPG_PLATFORM_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
const checks = [], errors = [], outside = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
let app;
const pause = ms => new Promise(accept => setTimeout(accept, ms));
async function until(read, accept, label) { for (let index = 0; index < 100; index++) { const value = await read(); if (accept(value)) return value; await pause(30); } throw new Error('Timed out: ' + label); }

try {
  const parent = await context.newPage();
  const base64 = await parent.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100; canvas.getContext('2d').fillRect(0, 0, 160, 100); return canvas.toDataURL('image/png').split(',')[1]; });
  const original = Buffer.from(base64, 'base64'); await writeFile(imagePath, original);
  app = await startPlatform({ port: 0, projectRoot, appearanceFile: join(directory, '外观.json') });
  await context.route('**/*', route => { const url = route.request().url(); if (/^(data:|about:)/.test(url) || new URL(url).origin === app.url) return route.continue(); outside.push(url); return route.abort(); });
  await parent.goto(app.url);
  async function chooseDm() {
    await parent.locator('#enter-dm').click();
    return until(() => parent.evaluate(() => sessionStorage.getItem('platform-session')), Boolean, 'DM ticket');
  }
  async function openTool() {
    await parent.locator('[data-platform-page=modules]').click();
    const panel = parent.locator('[data-project-panel=modules]'); if (!await panel.evaluate(node => node.open)) await panel.locator('summary').click();
    const opened = parent.waitForEvent('popup'); await parent.locator('#platform-manage-covers').click();
    const tool = await opened; await tool.locator('#library-content:visible').waitFor(); await tool.locator('#open-crop:enabled').waitFor();
    await tool.locator('#open-crop').click(); await tool.locator('#crop-dialog:visible').waitFor();
    assert((await tool.locator('body').textContent()).includes('私有合成模组'));
    assert(await tool.locator('#crop-original').getAttribute('src'));
    return tool;
  }
  async function revoked(token) { return until(async () => (await fetch(app.url + '/api/module-covers', { headers: { 'X-Platform-Session': token } })).status, status => status === 403, 'old ticket rejected'); }
  async function switchPlayer() {
    await parent.locator('[data-platform-page=home]').click(); await parent.locator('#platform-switch-identity').click(); await parent.locator('#enter-player').click();
    await until(() => parent.locator('.p-appearance-status > .project-notice').textContent(), value => value.includes('Player当前为公共预览'), 'Player preview');
  }
  const firstToken = await chooseDm(), first = await openTool();
  const firstClosed = first.waitForEvent('close'); await switchPlayer(); await firstClosed; await revoked(firstToken);
  checks.push('DM封面和裁切原图已可见时父页切Player，工具popup关闭且旧DM票据403');

  await parent.locator('[data-platform-page=home]').click(); await parent.locator('#platform-switch-identity').click();
  const secondToken = await chooseDm(), second = await openTool();
  const secondClosed = second.waitForEvent('close'); await parent.reload(); await secondClosed; await parent.locator('#enter-dm').waitFor(); await revoked(secondToken);
  checks.push('父平台刷新即广播清理已打开的DM工具，旧票据撤销，主页回未选择身份');

  const thirdToken = await chooseDm();
  const standalone = await context.newPage(); await standalone.goto(app.url + '/health');
  await standalone.evaluate(token => sessionStorage.setItem('platform-session', token), thirdToken); await standalone.goto(app.url + '/module-covers');
  assert.equal(await standalone.evaluate(() => window.opener), null);
  await standalone.locator('#open-crop:enabled').waitFor(); await standalone.locator('#open-crop').click(); await standalone.locator('#crop-dialog:visible').waitFor();
  await standalone.locator('#cancel-crop').click();
  let resume, started, done, failed;
  const gate = new Promise(accept => { resume = accept; }), pending = new Promise(accept => { started = accept; });
  const finished = new Promise((accept, reject) => { done = accept; failed = reject; });
  await standalone.route(app.url + '/api/module-covers', async route => { try { const response = await route.fetch(); started(); await gate; await route.fulfill({ response }); done(); } catch (error) { failed(error); } });
  await standalone.locator('#refresh-catalog').click(); await pending;
  await switchPlayer(); await standalone.locator('#auth-required:visible').waitFor();
  assert(await standalone.locator('#library-content').isHidden()); assert(await standalone.locator('#crop-dialog').isHidden());
  assert.equal(await standalone.locator('#module-track img').count(), 0); assert.equal(await standalone.locator('#crop-original').getAttribute('src'), null);
  assert.equal(await standalone.evaluate(() => sessionStorage.getItem('platform-session')), null);
  assert.equal(await standalone.locator('#crop-preview').evaluate(node => node.getContext('2d').getImageData(0, 0, node.width, node.height).data.some(value => value !== 0)), false);
  assert(!(await standalone.locator('body').textContent()).includes('私有合成模组'));
  resume(); await finished; await pause(100); await revoked(thirdToken);
  assert(await standalone.locator('#library-content').isHidden()); assert.equal(await standalone.locator('#module-track button').count(), 0);
  checks.push('无opener的独立工具页立即清空目录/路径/原图/画布/票据，迟到DM目录响应不能回填');
  assert.deepEqual(await readFile(imagePath), original); assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  checks.push('修复不改原图、不产生外部请求或脚本错误；平台原入口和裁切仍可正常打开');
  await writeFile(join(directory, 'result.json'), JSON.stringify({ checks, errors, outside }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, directory, errors, outside }, null, 2));
} finally { await browser.close(); await app?.close(); }

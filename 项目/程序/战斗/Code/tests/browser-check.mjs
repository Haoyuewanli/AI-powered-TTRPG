import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture } from './fixture.mjs';

const playwrightPath = process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath));
const output = fileURLToPath(new URL('../../../../../开发记录/临时/战斗浏览器检查/', import.meta.url));
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(output, 'campaign-'));
const app = await startApp({ campaignDir: directory, port: 0, initial: () => {
  const state = fixture(); state.actors.forEach(a => { a.confirmed = false; });
  return state;
} });
const browser = await chromium.launch({ executablePath: process.env.BATTLE_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1 });
const errors = [], external = [];
await context.route('**/*', route => {
  if (route.request().url().startsWith(app.url + '/')) return route.continue();
  external.push(route.request().url()); return route.abort();
});
const checks = [];
const check = name => checks.push(name);
const camera = async page => JSON.parse(await page.locator('canvas').getAttribute('data-camera'));
const settle = async page => { await page.waitForTimeout(150); await page.locator('canvas[data-settled="true"]').waitFor({ timeout: 20000 }); };
async function login(page, id) {
  await page.goto(app.url); await page.locator('#identity').fill(id);
  await page.locator('#login-form button').click(); await page.locator('canvas[data-ready="true"]').waitFor(); await settle(page);
}
async function tool(page, name) {
  if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
  await page.locator(`[data-tool="${name}"]`).first().click();
}
async function editor(page, id) {
  if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
  await page.locator(`#roster [data-actor-id="${id}"]`).click();
  await tool(page, 'actor');
  if ((await page.locator('#edit-details').getAttribute('open')) === null) await page.locator('#edit-details > summary').click();
}
async function saveEditor(page) {
  const before = app.store.state.revision;
  await page.locator('#edit-form button[type=submit]').click();
  await page.waitForFunction(version => document.querySelector('#save-status').textContent.includes(`v${version + 1}`), before);
}
try {
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await login(page, 'DM');
  assert.equal(await page.locator('canvas').getAttribute('data-actor-count'), '2');
  assert(await page.locator('#start').isDisabled()); check('未核对资料不能开始');
  const initial = await camera(page), box = await page.locator('canvas').boundingBox();
  const center = { x: box.x + box.width * .5, y: box.y + box.height * .65 };
  await page.mouse.move(center.x, center.y); await page.mouse.wheel(0, -200); await settle(page);
  assert((await camera(page)).distance < initial.distance); check('滚轮缩放');
  await page.locator('#viewport').focus(); await page.keyboard.press('+'); await settle(page);
  const keyboardZoom = await camera(page); assert(keyboardZoom.distance < initial.distance); check('键盘缩放');
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 70, center.y + 25, { steps: 8 }); await page.mouse.up(); await settle(page);
  const rotated = await camera(page); assert(Math.abs(rotated.azimuth - initial.azimuth) > .1); check('左拖旋转');
  await page.locator('#viewport').focus(); await page.keyboard.press('q'); await page.keyboard.press('r'); await settle(page);
  const keyboardRotate = await camera(page); assert(keyboardRotate.azimuth > rotated.azimuth); assert(keyboardRotate.polar < rotated.polar); check('键盘旋转与倾角');
  await page.keyboard.down('q'); await page.waitForTimeout(160); const heldA = await camera(page);
  await page.waitForTimeout(180); const heldB = await camera(page);
  await page.waitForTimeout(180); const heldC = await camera(page); await page.keyboard.up('q'); await settle(page);
  assert(heldB.azimuth > heldA.azimuth + .03 && heldC.azimuth > heldB.azimuth + .03); check('仅一次keydown后长按仍逐帧连续旋转');
  await page.keyboard.down('w'); await page.waitForTimeout(180); const walkA = await camera(page);
  await page.waitForTimeout(220); const walkB = await camera(page); await page.keyboard.up('w'); await settle(page);
  assert(Math.hypot(walkB.target[0] - walkA.target[0], walkB.target[2] - walkA.target[2]) > 1); check('长按连续平移');
  await page.keyboard.down('q'); await page.waitForTimeout(150); await page.locator('#dice-mode').focus(); await settle(page);
  const unfocused = await camera(page); await page.waitForTimeout(220);
  assert(Math.abs((await camera(page)).azimuth - unfocused.azimuth) < .003); await page.keyboard.up('q'); check('输入框获得焦点后停止相机按键');
  await page.locator('#viewport').focus();
  await page.mouse.move(center.x, center.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(center.x + 60, center.y + 20, { steps: 8 }); await page.mouse.up({ button: 'right' }); await settle(page);
  const panned = await camera(page); assert(Math.abs(panned.target[0] - keyboardRotate.target[0]) > .1); check('右拖平移');
  await page.locator('#viewport').focus(); await page.keyboard.press('w'); await settle(page);
  const keyboardPan = await camera(page);
  assert(Math.hypot(keyboardPan.target[0] - panned.target[0], keyboardPan.target[2] - panned.target[2]) > .1,
    JSON.stringify({ before: panned, after: keyboardPan, focus: await page.locator(':focus').getAttribute('id') })); check('键盘平移');
  await page.keyboard.press('0'); await settle(page); assert(Math.abs((await camera(page)).distance - initial.distance) < .1); check('视角复位');
  await editor(page, 'pc-001');
  await page.locator('#edit-notes').fill('DM_ONLY_CANARY'); await page.locator('#edit-confirmed').check(); await saveEditor(page);
  await editor(page, 'npc-001'); await page.locator('#edit-confirmed').check(); await page.locator('#edit-hidden').check(); await saveEditor(page);
  const playerPage = await context.newPage(); playerPage.on('pageerror', error => errors.push(error.message));
  await login(playerPage, '测试冒险者');
  assert.equal(await playerPage.locator('#roster [data-actor-id]').count(), 1); assert.equal(await playerPage.locator('canvas').getAttribute('data-actor-count'), '1');
  assert(!(await playerPage.locator('body').innerText()).includes('测试守卫'));
  const playerToken = await playerPage.evaluate(() => sessionStorage.getItem('battle-session'));
  const response = await context.request.get(app.url + '/api/state', { headers: { Authorization: `Bearer ${playerToken}` } });
  const raw = await response.text(); assert(!raw.includes('DM_ONLY_CANARY')); assert(!raw.includes('npc-001')); check('玩家网络数据和棋盘均无隐藏单位与DM备注');
  await page.locator('#edit-hidden').uncheck(); await saveEditor(page);
  await playerPage.locator('.session-menu > summary').click(); await playerPage.locator('#refresh').click(); await playerPage.locator('.session-menu > summary').click(); await playerPage.locator('#roster [data-actor-id="npc-001"]').waitFor();
  const shown = await (await context.request.get(app.url + '/api/state', { headers: { Authorization: `Bearer ${playerToken}` } })).json();
  assert(!('hp' in shown.state.actors.find(a => a.id === 'npc-001'))); check('揭示棋子仍隐藏敌方精确数值');
  await page.keyboard.press('Escape');
  await page.locator('#start').click();
  await page.locator('[data-roll-scope=all]').click();
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#turn-caption').textContent.includes('的回合'));
  if (app.store.state.combat.order[0] !== 'pc-001') await page.locator('#next').click();
  await playerPage.locator('.session-menu > summary').click(); await playerPage.locator('#refresh').click(); await playerPage.locator('.session-menu > summary').click();
  await playerPage.locator('#attack-form button[type=submit]').click();
  await playerPage.waitForFunction(() => document.querySelector('#events').textContent.includes('测试近战'));
  const saved = JSON.parse(await readFile(join(directory, '战斗状态.json'), 'utf8'));
  assert.equal(saved.combat.attacksUsed, 1); check('玩家攻击由本地结算并写入正式文件');
  await page.locator('.session-menu > summary').click(); await page.locator('#refresh').click(); await page.locator('.session-menu > summary').click();
  if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
  await page.locator('#reset-camera').click(); await page.mouse.click(20, 100); await settle(page);
  await page.screenshot({ path: join(output, '战斗桌-DM.png'), fullPage: true });
  await playerPage.screenshot({ path: join(output, '战斗桌-玩家.png'), fullPage: true });
  await tool(page, 'exchange'); await page.locator('#export-handoff').click();
  await page.waitForFunction(() => document.querySelector('#exchange-text').value.includes('local-dm-exchange-v2'));
  const dmPackage = JSON.parse(await page.locator('#exchange-text').inputValue());
  assert.equal(dmPackage.audience, 'dm'); assert(JSON.stringify(dmPackage).includes('DM_ONLY_CANARY'));
  await tool(playerPage, 'exchange'); await playerPage.locator('#export-handoff').click();
  await playerPage.waitForFunction(() => document.querySelector('#exchange-text').value.includes('local-dm-exchange-v2'));
  const playerPackage = JSON.parse(await playerPage.locator('#exchange-text').inputValue());
  assert.equal(playerPackage.audience, 'player'); assert(!JSON.stringify(playerPackage).includes('DM_ONLY_CANARY')); check('主持交接按当前权限导出');
  const revision = app.store.state.revision;
  await playerPage.locator('#exchange-text').fill(JSON.stringify({ campaignId: 'test-campaign', battleId: app.store.state.battleId, actionId: 'stale-browser-action', expectedRevision: 0, type: 'next', payload: {} }));
  await playerPage.locator('#preview-proposal').click();
  await playerPage.locator('#toast').filter({ hasText: '版本不符' }).waitFor(); assert.equal(app.store.state.revision, revision); check('旧主持提议拒绝执行');
  await page.keyboard.press('Escape'); await page.locator('.session-menu > summary').click();
  await page.locator('#logout').click(); await page.locator('#login').waitFor();
  assert(!(await page.content()).includes('DM_ONLY_CANARY')); check('退出DM清理页面中的私密文本');
  await playerPage.reload(); await playerPage.locator('canvas[data-ready="true"]').waitFor(); check('刷新重载本地已保存进度');
  await playerPage.setViewportSize({ width: 780, height: 1000 }); await settle(playerPage);
  assert(await playerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await playerPage.screenshot({ path: join(output, '战斗桌-窄屏.png'), fullPage: true }); check('窄屏无横向溢出');
  assert.equal(errors.length, 0, errors.join('\n')); assert.equal(external.length, 0); check('无页面脚本错误、无外部请求');
  await writeFile(join(output, '结果.json'), JSON.stringify({ browser: await browser.version(), checks, directory, errors, external }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, output }, null, 2));
} finally { await browser.close(); await app.close(); }

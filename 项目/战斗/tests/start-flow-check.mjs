import { enterBattle } from './browser-platform.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { startApp } from '../server.mjs';
import { fixture } from './fixture.mjs';
const { chromium } = await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../开发记录/临时/方块地图检查/',import.meta.url));
await mkdir(output,{recursive:true});
const app = await startApp({campaignDir:await mkdtemp(join(output,'flow-')),port:0,initial:()=>{const s=fixture();s.actors.forEach(a=>a.confirmed=false);return s;}});
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1366,height:768}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(app.url);await page.locator('#enter-dm').click();await enterBattle(page);await page.locator('canvas[data-ready=true]').waitFor();
 for(const size of [{width:1920,height:1080},{width:390,height:844},{width:1366,height:768}]) {
  await page.setViewportSize(size);await page.locator('#open-actions').click();
  assert.ok(await page.locator('#battle-tasks').isVisible());await page.keyboard.press('Escape');
 }
 await page.locator('#viewport').evaluate(async el=>{await el.closest('#table').requestFullscreen();});
 assert.ok(await page.locator('#open-actions').isVisible());await page.evaluate(()=>document.exitFullscreen());
 for(const id of ['pc-001','npc-001']) {
  await page.locator(`[data-actor-id="${id}"]`).first().click();await page.locator('[data-tool=actor]:visible').first().click();
  await page.locator('#edit-confirmed').check();const before=app.store.state.revision;
  await page.locator('#edit-form button[type=submit]').click();await page.waitForFunction(v=>document.querySelector('#save-status').textContent.includes(`v${v}`),before+1);
  await page.keyboard.press('Escape');
 }
 await page.locator('#start').click();await page.locator('#initiative-collection button[data-submit-initiative]').first().waitFor();
 for(const id of ['pc-001','npc-001']) {const before=app.store.state.revision;await page.locator(`[data-submit-initiative="${id}"]`).click();await page.waitForFunction(v=>document.querySelector('#save-status').textContent.includes(`v${v}`),before+1);}
 await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#table').dataset.phase==='active');
 assert.equal(app.store.state.combat.round,1);assert.deepEqual(errors,[]);
 await page.screenshot({path:join(output,'开始流程.png')});console.log('PASS: responsive/fullscreen action entry and unconfirmed → saved → initiative → first turn');
} finally {await browser.close();await app.close();}

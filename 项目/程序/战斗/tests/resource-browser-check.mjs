import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startApp} from '../server.mjs';
import {active} from './fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.BATTLE_PLAYWRIGHT_MODULE || join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output=fileURLToPath(new URL('../../../../开发记录/临时/资源界面检查/',import.meta.url));await mkdir(output,{recursive:true});const directory=await mkdtemp(join(output,'campaign-'));
let app=await startApp({campaignDir:directory,port:0,initial:()=>{const s=active();s.actors[0].tempHp=8;s.actors[0].resourcePools=[{id:'slots-1',name:'一环法术位',kind:'slots',level:1,current:3,max:4,recovery:{long:'all'},source:'合成测试 PHB2024 法术位'},{id:'wild',name:'荒野形态',kind:'pool',current:2,max:2,recovery:{short:1,long:'all'},source:'合成测试 PHB2024 荒野形态'}];return s;}});
const browser=await chromium.launch({executablePath:process.env.BATTLE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const login=async()=>{await page.goto(app.url);await page.locator('#enter-dm').click();await page.locator('#resource-row button').first().waitFor();await page.waitForTimeout(200);};
try {
  await login();assert.equal(await page.locator('.value-track[aria-label="临时生命"]').getAttribute('aria-valuetext'),'8/8');
  const slots=page.locator('[data-resource-id="slots-1"]');assert.equal(await slots.locator('.resource-pip').count(),4);assert.equal(await slots.locator('[data-spent=true]').count(),1);assert.equal(await slots.locator('.resource-pips').evaluate(n=>getComputedStyle(n).gridTemplateColumns),'12px 12px');checks.push('刻度条与2×2法术位消耗显示');
  const revision=app.store.state.revision;await page.locator('#resource-settings').click();await page.locator('#style-active').fill('#2277cc');
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.fillStyle='#fff';x.beginPath();x.arc(48,48,30,0,Math.PI*2);x.fill();return c.toDataURL('image/png').split(',')[1];});
  await page.locator('#style-image').setInputFiles({name:'circle.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});await page.waitForFunction(()=>document.querySelector('#glass-layout-preview .image-pip'));
  const icon=page.locator('#glass-layout-preview [data-glass-part=icon]'),b=await icon.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2-18,b.y+b.height/2-14,{steps:6});await page.mouse.up();
  await page.locator('#save-resource-style').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('界面设置已保存'));assert.equal(app.store.state.revision,revision);checks.push('透明图片导入、球内拖动布局与颜色保存不改变战斗版本');
  const saved=await page.locator('#glass-layout-preview [data-glass-part=icon]').getAttribute('style');await page.keyboard.press('Escape');await page.reload();await page.locator('#resource-row .image-pip').waitFor();await page.locator('#resource-settings').click();assert.equal(await page.locator('#style-active').inputValue(),'#2277cc');assert.equal(await page.locator('#glass-layout-preview [data-glass-part=icon]').getAttribute('style'),saved);checks.push('页面重开恢复图片、颜色与布局');
  await page.keyboard.press('Escape');await app.close();app=await startApp({campaignDir:directory,port:0,initial:()=>{throw new Error('不可重建');}});await login();await page.locator('#resource-row .image-pip').waitFor();assert.equal(app.store.state.actors[0].resourcePools[0].current,3);checks.push('服务重启后从本地文件恢复设置与资源');
  assert.deepEqual(errors,[]);await page.screenshot({path:join(output,'资源图标.png')});await writeFile(join(output,'结果.json'),JSON.stringify({checks,errors,directory},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors}));
} finally {await browser.close();await app.close();}

import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startPreview} from './serve.mjs';
const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const temp=fileURLToPath(new URL('../../临时/战斗窗口预览/',import.meta.url));await mkdir(temp,{recursive:true});const output=await mkdtemp(join(temp,'browser-v2-'));
const app=await startPreview();let browser;const errors=[],outside=[],checks=[];
try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(7000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(app.url))return route.continue();outside.push(url);return route.abort();});
 await page.goto(app.url);await page.locator('#save').filter({hasText:'演示已保存'}).waitFor();
 const state=async()=>await(await fetch(app.url+'/v2/state')).json();
 const waitRevision=async r=>{await page.waitForFunction(r=>Number(document.getElementById('save').textContent.split('·')[1])>r,r);};
 const shot=async name=>{await page.waitForTimeout(150);await page.screenshot({path:join(output,name+'.png')});};
 const point=async(x,z)=>{const b=await page.locator('canvas').boundingBox();return {x:b.x+b.width/2+(x-25)*b.height/65,y:b.y+b.height/2+(z-25)*b.height/65};};
 const clickAt=async(x,z)=>{const p=await point(x,z);await page.mouse.click(p.x,p.y);};
 const clickSaved=async(selector)=>{const s=await state();await page.locator(selector).click();await waitRevision(s.revision);};
 await shot('01-2d');
 await page.keyboard.press('4');let floorBefore=await state();await clickAt(22.5,22.5);await waitRevision(floorBefore.revision);await page.locator('[data-tool="select"]').click();await clickAt(22.5,22.5);assert.equal(await page.locator('#edit-name').inputValue(),'演示战士');await clickAt(22.5,22.5);assert.equal(await page.locator('#edit-name').inputValue(),'地板');await clickSaved('#remove');checks.push('同层地板不遮住参战者选择，重叠对象可切换编辑');
 await page.keyboard.press('3');let s=await state();await clickAt(12.5,12.5);await waitRevision(s.revision);
 s=await state();await clickAt(17.5,12.5);await waitRevision(s.revision);
 s=await state();assert.equal(s.items.filter(i=>i.kind==='actor').length,4);const blank=s.items.find(i=>i.x===2.4&&i.z===2.4);assert.equal(blank.stats,null);
 await clickAt(17.5,12.5);await page.locator('#toast').filter({hasText:'已有积木占用'}).waitFor();assert.equal((await state()).revision,s.revision);
 await page.locator('[data-tool="select"]').click();await clickAt(14.5,14.5);await page.locator('#inspector').waitFor({state:'visible'});
 const oldSlot=await page.locator('.slot.active').getAttribute('data-slot');await page.locator('#edit-name').fill('白板独立编辑');await page.locator('#edit-name').press('1');assert.equal(await page.locator('.slot.active').getAttribute('data-slot'),oldSlot);
 await page.locator('#edit-name').fill('白板甲');await page.locator('#edit-width').fill('2');await page.locator('#edit-depth').fill('2');await clickSaved('#edit-form button[type="submit"]');
 s=await state();assert.equal(s.items.find(i=>i.id===blank.id).width,2);assert.equal(s.items.find(i=>i.x===3.4&&i.z===2.4).width,1);
 await page.locator('#inspector-close').click();await page.locator('#battle-start').click();assert(await page.locator('#confirm-start').isDisabled());assert((await page.locator('#action-content').innerText()).includes('缺少战斗数值'));await page.locator('[data-close="action-dialog"]').click();
 checks.push('连续放置、独立白板、尺寸编辑、重复落点、输入隔离、开战缺项检查');
 await page.locator('#layer-toggle').click();await page.locator('#layer-add').click();await page.locator('#layer-name').fill('测试高层');await page.locator('#layer-height').fill('4');await clickSaved('#layer-form button.primary');
 s=await state();const layer=s.layers.at(-1);await page.locator('#layer-close').click();await page.keyboard.press('4');await clickAt(42.5,42.5);await waitRevision(s.revision);
 assert.equal((await state()).items.at(-1).layerId,layer.id);
 await page.locator('#layer-toggle').click();await page.locator(`[data-layer-edit="${layer.id}"]`).click();await page.locator('#layer-height').fill('3');await clickSaved('#layer-form button.primary');
 assert.equal((await state()).layers.at(-1).height,3);await page.locator('#layer-close').click();await clickSaved('#undo');assert.equal((await state()).layers.at(-1).height,4);
 await page.locator('[data-view="3d"]').click();await page.keyboard.press('4');await page.locator('#layer-toggle').click();await page.locator('[data-layer-check="upper"]').check();await page.locator('#layer-close').click();await shot('02-3d-layers');
 await page.locator('#layer-toggle').click();for(const id of ['ground','upper',layer.id])await page.locator(`[data-layer-check="${id}"]`).uncheck();await page.locator('#layer-close').click();
 const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+box.width*.72,box.y+box.height*.65);await page.waitForTimeout(100);assert.equal(await page.locator('canvas').getAttribute('data-candidate'),null);s=await state();await page.mouse.click(box.x+box.width*.72,box.y+box.height*.65);assert.equal((await state()).revision,s.revision);
 await page.locator('#layer-toggle').click();await page.locator('[data-layer-check="ground"]').check();await page.locator('#layer-close').click();await page.mouse.move(box.x+box.width*.72,box.y+box.height*.65);await page.waitForFunction(()=>document.querySelector('canvas').dataset.candidate);let candidate=JSON.parse(await page.locator('canvas').getAttribute('data-candidate'));assert.equal(candidate.layerId,'ground');await page.mouse.click(box.x+box.width*.72,box.y+box.height*.65);await waitRevision(s.revision);assert.equal((await state()).items.at(-1).layerId,'ground');
 checks.push('地面层新增、改高、撤销、2D/3D共用场景、多层网格、未选层禁建、3D落点归属');
 const camera=async()=>JSON.parse(await page.locator('canvas').getAttribute('data-camera'));
 const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
 async function travel(end){await page.locator('#settings-open').click();await page.locator('#move-speed').focus();await page.keyboard.press(end?'End':'Home');await page.locator('#settings button[aria-label]').click();await page.locator('#viewport').focus();const before=await camera();await page.keyboard.down('w');await page.waitForTimeout(300);await page.keyboard.up('w');return distance(before,await camera());}
 const slow=await travel(false),fast=await travel(true);assert(fast>slow*5,`${slow} vs ${fast}`);
 await page.locator('#viewport').focus();const beforeY=(await camera())[1];await page.keyboard.down('e');await page.waitForTimeout(200);await page.keyboard.up('e');assert((await camera())[1]>beforeY);
 await page.keyboard.down('w');await page.locator('#settings-open').click();const stopped=await camera();await page.waitForTimeout(150);assert(distance(stopped,await camera())<.01);await page.keyboard.up('w');
 await page.locator('#settings-reset').click();await page.locator('#settings button[aria-label]').click();await page.locator('#camera-reset').click();
 for(const key of ['q','Space']){await page.locator('#viewport').focus();const y=(await camera())[1];await page.keyboard.down(key);await page.waitForTimeout(120);await page.keyboard.up(key);assert(key==='q'?(await camera())[1]<y:(await camera())[1]>y);}
 async function turnCamera(fast){await page.locator('#settings-open').click();await page.locator('#look-speed').focus();await page.keyboard.press(fast?'End':'Home');await page.locator('#settings button[aria-label]').click();const b=await page.locator('canvas').boundingBox();await page.mouse.move(b.x+b.width*.6,b.y+b.height*.5);const before=JSON.parse(await page.locator('canvas').getAttribute('data-look'))[0];await page.mouse.down({button:'right'});await page.mouse.move(b.x+b.width*.6+60,b.y+b.height*.5,{steps:4});await page.mouse.up({button:'right'});await page.waitForTimeout(60);return Math.abs(JSON.parse(await page.locator('canvas').getAttribute('data-look'))[0]-before);}
 const slowLook=await turnCamera(false),fastLook=await turnCamera(true);assert(fastLook>slowLook*5);
 for(let n=1;n<=9;n++){await page.keyboard.press(String(n));assert.equal(await page.locator('.slot.active').getAttribute('data-slot'),String(n-1));}
 const wb=await page.locator('canvas').boundingBox();await page.mouse.move(wb.x+wb.width*.6,wb.y+wb.height*.5);await page.mouse.wheel(0,100);await page.waitForTimeout(60);assert.equal(await page.locator('.slot.active').getAttribute('data-slot'),'0');
 await page.locator('#layer-toggle').click();await page.locator('[data-layer-check="upper"]').check();await page.locator('#layer-priority').check();await page.locator('#layer-close').click();await page.locator('#camera-reset').click();await page.mouse.move(wb.x+wb.width*.5,wb.y+wb.height*.5);await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.candidate||'{}').layerId==='upper');
 await page.locator('#look-lock').click();await page.waitForFunction(()=>!!document.pointerLockElement);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.pointerLockElement);
 await page.locator('#settings-open').click();await page.locator('#settings-reset').click();await page.locator('#settings button[aria-label]').click();await page.locator('#camera-reset').click();
 checks.push('Q/Space升降、鼠标转向灵敏度、全部数字快捷键、滚轮循环、固定目标层、锁鼠与Esc退出');
 checks.push('三维WASD灵敏度、升降、设置窗口阻断移动、恢复默认');
 await page.reload();await page.locator('#save').filter({hasText:'演示已保存'}).waitFor();assert.equal((await state()).items.find(i=>i.id===blank.id).name,'白板甲');
 // Remove only the two synthetic blank actors via their UI review cards.
 await page.locator('#battle-start').click();const draftIds=(await state()).items.filter(i=>i.kind==='actor'&&!i.stats).map(i=>i.id);
 for(const id of draftIds){await page.locator(`[data-review="${id}"]`).click();await clickSaved('#remove');await page.locator('#battle-start').click();}
 await clickSaved('#confirm-start');await page.locator('#combat-panel').waitFor({state:'visible'});assert(await page.locator('#dock').isHidden());
 await page.locator('[data-action="attack"]').click();await page.locator('[data-target]').first().click();await clickSaved('#confirm-attack');assert.equal((await state()).combat.combat.attacksUsed,1);await shot('03-combat');
 await clickSaved('#undo');assert.equal((await state()).combat.combat.attacksUsed,0);await clickSaved('#next-turn');assert.equal((await state()).combat.combat.index,1);
 await page.locator('[data-action="adjudicate"]').click();await page.locator('#manual-note').fill('演示伤害核对');await page.locator('#manual-kind').selectOption('damage');await page.locator('#manual-amount').fill('2');await clickSaved('#adjudicate-form button.primary');assert((await state()).combat.actors.some(a=>a.hp===28));
 await page.locator('#battle-end').click();await clickSaved('#confirm-end');assert(await page.locator('#dock').isVisible());checks.push('刷新恢复、开战先攻、目标选择、攻击结算、撤销、下一回合、主持裁定、结束战斗');
 for(const [w,h]of [[1440,1000],[1024,768],[390,844]]){await page.setViewportSize({width:w,height:h});await page.waitForTimeout(200);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`宽度溢出${w}`);await shot(`04-size-${w}`);}
 for(const path of ['/api/sharing','/api/files','/api/shutdown'])assert.equal((await fetch(app.url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(app.url+'/v2/state',{headers:{Origin:'https://example.com'}})).status,403);assert.equal((await fetch(app.url+'/preview-store.mjs')).status,404);
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);checks.push('三尺寸布局、接口隔离、无页面错误与外部请求');
 await writeFile(join(output,'result.json'),JSON.stringify({checks,errors,outside},null,2));console.log(JSON.stringify({output,checks}));
}finally{await browser?.close();await app.close();}

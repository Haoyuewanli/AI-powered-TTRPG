import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startApp} from '../server.mjs';
import {active} from './fixture.mjs';

const {chromium}=await import(pathToFileURL(process.env.BATTLE_PLAYWRIGHT_MODULE||join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output=fileURLToPath(new URL('../../../开发记录/临时/双右栏检查/',import.meta.url));await mkdir(output,{recursive:true});const directory=await mkdtemp(join(output,'campaign-'));
const app=await startApp({campaignDir:directory,port:0,initial:()=>{
  const s=active();s.actors[0].tempHp=8;
  s.actors[0].resourcePools=[{id:'slots-1',name:'一环法术位',kind:'slots',level:1,current:3,max:4,recovery:{long:'all'},source:'合成 PHB2024'},{id:'wild',name:'荒野形态',kind:'pool',max:2,current:1,recovery:{short:1,long:'all'},source:'合成 PHB2024'}];
  s.actors[0].operations=[{id:'test-spell',name:'合成法术操作',category:'spells',ruleset:'2024',source:'合成界面测试',notes:'仅检查显示，不执行效果',spellLevel:1,slotMode:'expend',target:true,costs:[{resourceId:'action',amount:1}]}];
  s.actors[1].resourcePools=[{id:'secret',name:'隐秘资源',kind:'pool',max:2,current:2,recovery:{},source:'仅DM可见'}];
  s.actors[1].operations=[{id:'secret',name:'隐秘战技',category:'features',ruleset:'2024',source:'仅DM可见',notes:'仅DM可见',target:false,costs:[{resourceId:'bonus',amount:1}]}];return s;
}});
const browser=await chromium.launch({executablePath:process.env.BATTLE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const box=id=>page.locator(id).boundingBox();
try {
  await page.goto(app.url);await page.locator('#enter-dm').click();await page.locator('#operations-panel .operation-tile').first().waitFor();await page.waitForTimeout(200);const before=await readFile(app.store.path,'utf8');
  assert.deepEqual(await page.locator('#actor-info [role=meter]').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))),['生命','临时生命']);
  assert.equal(await page.locator('#actor-info').evaluate(n=>!!n.closest('#action-panel')),true);assert.equal(await page.locator('#resource-section').evaluate(n=>!!n.closest('#action-panel')),true);assert.equal(await page.locator('#hotbar-section').evaluate(n=>!!n.closest('#operations-panel')),true);
  assert.equal(await page.locator('[data-resource-id=slots-1].resource-button .resource-pip').count(),4);assert.equal(await page.locator('[data-resource-id=wild].resource-button small').textContent(),'1/2');checks.push('生命/临时生命保留条形；移动/法术位/职业资源仅在资源区显示图标');
  const actorBox=await box('#action-panel'),operationsBox=await box('#operations-panel'),boardBox=await box('.board-panel');assert.ok(boardBox.x+boardBox.width<actorBox.x+1&&actorBox.x+actorBox.width<operationsBox.x+1);assert.ok(operationsBox.x+operationsBox.width<=1440);
  assert.ok(await page.locator('.operation-category').count()>=6);assert.equal(await page.locator('.operation-category').evaluateAll(groups=>groups.every(g=>[...g.querySelectorAll('.operation-cell')].every(c=>c.dataset.category===g.dataset.category))),true);checks.push('两栏从左到右分别显示数据资源与按分类分组的完整操作');
  for(const id of ['dash','disengage','hide'])assert.equal(await page.locator(`[data-operation-id="common:${id}"]`).evaluate(n=>n.closest('.operation-category').dataset.category),'movement');
  assert.equal(await page.locator('[data-operation-id="common:help"]').evaluate(n=>n.closest('.operation-category').dataset.category),'unarmed');assert.match(await page.locator('#operation-category-unarmed').textContent(),/^徒手 ·/);
  await page.locator('#manual-form').locator('xpath=ancestor::details').evaluate(n=>{n.open=true;});await page.locator('#manual-reason').fill('未提交的布局检查草稿');
  const width0=(await box('.board-panel')).width;await page.locator('#toggle-actor-sidebar').click();assert.equal(await page.locator('#actor-sidebar-body').isHidden(),true);assert.equal(await page.locator('#operations-sidebar-body').isVisible(),true);assert.ok((await box('#action-panel')).width<45);assert.ok((await box('.board-panel')).width>width0+200);
  await page.locator('#roster [data-actor-id=pc-001]').click();assert.equal(await page.locator('#toggle-actor-sidebar').getAttribute('aria-expanded'),'false');await page.locator('#toggle-operations-sidebar').click();assert.ok((await box('#operations-panel')).width<45);await page.waitForTimeout(250);await page.locator('canvas[data-settled=true]').waitFor();await page.screenshot({path:join(output,'两栏收起.png')});
  await page.locator('#toggle-actor-sidebar').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#manual-reason').inputValue(),'未提交的布局检查草稿');await page.locator('#toggle-operations-sidebar').click();checks.push('两栏可独立/同时收起，箭头持续可见，重渲染与展开保留裁定草稿');
  await page.locator('#toggle-actor-sidebar').click();await page.locator('#hotbar-filter').selectOption('weapons');await page.locator('[data-operation-id="weapon:sword"] .operation-tile').click();assert.equal(await page.locator('#actor-sidebar-body').isVisible(),true);assert.equal(await page.locator('#attack-choice').inputValue(),'sword');await page.locator('#hotbar-filter').selectOption('');checks.push('左栏收起时选择右栏武器会自动展开并定位原攻击表单');
  await page.locator('.sidebar-body').evaluateAll(ns=>ns.forEach(n=>{n.scrollTop=0;}));await page.screenshot({path:join(output,'双右栏-1440.png')});
  for(const [width,height] of [[1920,1080],[1280,720],[1101,700],[1100,700],[780,900],[390,844],[320,640]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(width<=1100) {
      await page.locator('#open-actions').click();assert.equal(await page.locator('#actions-slot #action-panel').count(),1);assert.equal(await page.locator('#actions-slot #operations-panel').count(),1);
      await page.locator('.sidebar-switcher button').nth(1).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'operations-panel');await page.locator('#toggle-operations-sidebar').click();assert.equal(await page.locator('#operations-sidebar-body').isHidden(),true);await page.locator('#toggle-operations-sidebar').click();await page.keyboard.press('Escape');
    }else{
      assert.equal(await page.locator('#table-workspace > #action-panel').count(),1);assert.equal(await page.locator('#table-workspace > #operations-panel').count(),1);
    }
    const canvas=await box('#viewport');assert.ok(canvas.height>=150);
  }checks.push('七种尺寸下两栏与小屏抽屉可用，棋盘保持可见、页面无横向溢出');
  assert.equal(await readFile(app.store.path,'utf8'),before);checks.push('收起、展开、分类筛选和浏览后战斗文件逐字节不变');
  const player=await browser.newPage({viewport:{width:1440,height:1000}});player.on('pageerror',e=>errors.push(e.message));await player.goto(app.url);await player.locator('#identity').fill('player-1');await player.locator('#login-form button').click();await player.locator('#operation-grid .operation-cell').first().waitFor();await player.locator('#roster [data-actor-id=npc-001]').click();assert.equal(await player.locator('#operation-grid .operation-cell').count(),0);assert.equal(await player.locator('#operations-empty').isVisible(),true);assert.equal((await player.locator('body').textContent()).includes('隐秘战技'),false);assert.equal((await player.locator('body').textContent()).includes('隐秘资源'),false);await player.close();checks.push('独立操作栏不保留上一个角色列表，也不暴露NPC私密资料');
  assert.deepEqual(errors,[]);await writeFile(join(output,'结果.json'),JSON.stringify({checks,errors,directory},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors}));
} finally {await browser.close();await app.close();}

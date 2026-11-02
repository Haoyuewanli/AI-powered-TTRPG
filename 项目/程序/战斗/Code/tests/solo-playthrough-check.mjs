import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture } from './fixture.mjs';
import { windowBrowser } from '../src/desktop.mjs';
export function trial(){
 const s=fixture();s.campaignId='solo-trial';s.title='单人战斗试玩 · 训练场';
 s.board.width=50;s.board.depth=40;
 for(const a of s.actors){a.confirmed=false;a.ac=12;a.notes='合成练习数据，不是正式角色卡；归零表示训练结束。';a.resources='本次仅练习移动与普通近战攻击';a.attacks[0].name='训练剑';}
 s.actors[0].name='试玩冒险者';s.actors[0].hp=24;s.actors[0].maxHp=24;
 s.actors[1].name='训练守卫';s.actors[1].hp=12;s.actors[1].maxHp=12;s.actors[1].position.x=32.5;
 return s;
}
{
 const out=fileURLToPath(new URL('../../../../../开发记录/临时/单人试玩检查/',import.meta.url));await mkdir(out,{recursive:true});
 const dir=await mkdtemp(join(out,'campaign-'));let app=await startApp({campaignDir:dir,port:0,initial:trial});
 const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
 const browser=await chromium.launch({executablePath:await windowBrowser(),headless:true,args:['--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
 const ctx=await browser.newContext({viewport:{width:1366,height:900}});const errors=[],checks=[];
 await ctx.route('**/*',r=>r.request().url().startsWith(app.url+'/')?r.continue():r.abort());
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 async function changed(run){const v=app.store.state.revision;await run();await page.waitForFunction(v=>document.querySelector('#save-status').textContent.includes(`v${v+1}`),v);}
 try{
  await page.goto(app.url);await page.locator('#enter-dm').click();await page.locator('canvas[data-ready=true]').waitFor();
  for(const id of ['pc-001','npc-001']){
   await page.locator(`[data-actor-id="${id}"]`).first().click();await page.locator('[data-tool=actor]:visible').first().click();
   await page.locator('#edit-confirmed').check();await changed(()=>page.locator('#edit-form button[type=submit]').click());await page.keyboard.press('Escape');
  }
  checks.push('逐个核对并保存合成角色');
  await changed(()=>page.locator('#dice-mode').selectOption('physical'));await changed(()=>page.locator('#start').click());
  for(const [id,value] of [['pc-001','18'],['npc-001','8']]){await page.locator(`[data-initiative-actor="${id}"] input`).fill(value);await changed(()=>page.locator(`[data-submit-initiative="${id}"]`).click());}
  await changed(()=>page.locator('#start').click());assert.equal(app.store.state.combat.order[0],'pc-001');checks.push('收集先攻并开始第一回合');
  await page.locator('.movement-section summary').click();await page.locator('#move-x').fill('27.5');await page.locator('#move-z').fill('22.5');await changed(()=>page.locator('#move-form button').click());assert.equal(app.store.state.combat.moved,5);checks.push('移动5尺并消耗移动力');
  async function attack(die){await page.locator('#physical-d20 input').fill('15');await page.locator('#physical-damage input').first().fill(String(die));await changed(()=>page.locator('#attack-form button[type=submit]').click());}
  await attack(6);assert.equal(app.store.state.actors[1].hp,3);
  await changed(()=>page.locator('#next').click());
  await page.locator('[data-tool=exchange]').first().click();await page.locator('#export-handoff').click();
  await page.waitForFunction(()=>document.querySelector('#exchange-text').value.includes('local-dm-exchange-v2'));
  const pack=JSON.parse(await page.locator('#exchange-text').inputValue());
  pack.proposal.type='attack';pack.proposal.payload={actorId:'npc-001',targetId:'pc-001',attackId:'sword',mode:'normal',manualRolls:{attack:[15],damage:[[4]]}};
  await page.locator('#exchange-text').fill(JSON.stringify({proposal:pack.proposal}));
  const prior=app.store.state.revision;await page.locator('#preview-proposal').click();assert.equal(app.store.state.revision,prior);
  await changed(()=>page.locator('#import-proposal').click());assert.equal(app.store.state.actors[0].hp,17);await page.keyboard.press('Escape');
  checks.push('NPC攻击经主持包提议、预览和统一核心结算，预览不写进度');
  await changed(()=>page.locator('#next').click());await attack(6);assert.equal(app.store.state.actors[1].hp,0);checks.push('玩家与NPC轮流攻击，本地结算至守卫归零');
  await page.locator('.session-menu summary').click();await changed(()=>page.locator('#end').click());assert.equal(app.store.state.combat.phase,'ended');checks.push('主持手动结束本场');
  assert.equal(await page.locator('#roster .tag').count(),0);
  assert.equal(await page.locator('#initiative-options').isVisible(),false);
  assert.equal(await page.locator('#battle-tasks').isVisible(),false);
  assert.match(await page.locator('#initiative-collection').textContent(),/已结束并保存/);
  assert.doesNotMatch(await page.locator('#flow-text').textContent(),/收集先攻/);
  checks.push('结束后移除当前回合及开战提示，明确进度已保存');
  await page.keyboard.press('Escape');
  const saved=await readFile(join(dir,'战斗状态.json'));await page.screenshot({path:join(out,'结束战斗.png')});
  await app.close();app=await startApp({campaignDir:dir,port:0});assert.deepEqual(await readFile(join(dir,'战斗状态.json')),saved);
  await page.goto(app.url);await page.locator('#enter-dm').click();await page.locator('canvas[data-ready=true]').waitFor();assert.equal(app.store.state.actors[0].hp,17);assert.equal(app.store.state.combat.phase,'ended');assert.equal(await page.locator('#table').getAttribute('data-phase'),'ended');checks.push('关闭核心后重开，同一存档、HP与结束状态恢复');
  const playerPage=await ctx.newPage();playerPage.on('pageerror',e=>errors.push(e.message));
  await playerPage.goto(app.url);await playerPage.locator('#identity').fill('player-1');await playerPage.locator('#login-form button').click();await playerPage.locator('canvas[data-ready=true]').waitFor();
  assert.equal(await playerPage.locator('#roster .tag').count(),0);assert.equal(await playerPage.locator('#battle-tasks').isVisible(),false);
  assert.match(await playerPage.locator('#initiative-collection').textContent(),/已结束并保存，等待主持/);
  assert.match(await playerPage.locator('#flow-text').textContent(),/等待主持安排下一场/);checks.push('玩家重开后也显示结束状态，不引导提交先攻');
  assert.deepEqual(errors,[]);await writeFile(join(out,'结果.json'),JSON.stringify({checks,errors,dir,revision:app.store.state.revision},null,2));console.log(JSON.stringify({checks,errors}));
 }finally{await browser.close();await app.close();}
}

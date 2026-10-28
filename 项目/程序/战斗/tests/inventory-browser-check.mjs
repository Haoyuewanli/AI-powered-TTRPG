import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startApp} from '../server.mjs';
import {ITEM_CATALOG} from '../data/items-2024.mjs';
import {active, command, dm} from './fixture.mjs';

const {chromium}=await import(pathToFileURL(process.env.BATTLE_PLAYWRIGHT_MODULE||join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output=fileURLToPath(new URL('../../../../开发记录/临时/库存界面检查/',import.meta.url));
await mkdir(output,{recursive:true});
const directory=await mkdtemp(join(output,'campaign-'));
const itemId=name=>{const item=ITEM_CATALOG.find(item=>item.name===name);assert.ok(item,`缺少物品：${name}`);return item.id;};
const stack=(id,name,quantity,extra={})=>({id,itemId:itemId(name),quantity,...extra});
const initial=()=>{
  const state=active();state.actors[0].hp=20;
  state.actors[0].inventory=[stack('personal-potion','治疗药水',2),stack('personal-poison','基础毒药',1),stack('personal-kit','医疗包',1,{charges:2})];
  state.actors[1].inventory=[stack('npc-private-stock','基础毒药',7)];
  state.partyInventory=[stack('party-potion','治疗药水',3)];
  return state;
};

let app, browser, page;
const checks=[],errors=[],external=[];
const actor=()=>app.store.state.actors.find(actor=>actor.id==='pc-001');
const personal=id=>actor().inventory.find(stack=>stack.id===id);
const party=id=>app.store.state.partyInventory.find(stack=>stack.id===id);
async function waitRevision(expected) {
  for(let attempt=0;attempt<100;attempt++) {
    if(app.store.state.revision===expected) break;
    await delay(100);
  }
  assert.equal(app.store.state.revision,expected,'操作应恰好提交一次');
  await page.waitForFunction(revision=>Number(/v(\d+)/.exec(document.querySelector('#save-status').textContent)?.[1])===revision,expected);
}
async function createPage(viewport={width:1440,height:1040}) {
  const context=await browser.newContext({viewport});
  const origin=app.url;
  await context.route('**/*',route=>{
    if(route.request().url().startsWith(origin+'/'))return route.continue();
    external.push(route.request().url());return route.abort();
  });
  const next=await context.newPage();next.on('pageerror',error=>errors.push(error.message));return next;
}
async function loginDm() {
  await page.goto(app.url);await page.locator('#enter-dm').click();await page.locator('#open-inventory').waitFor();
}
async function closeDialogs() {
  for(let attempt=0;attempt<6&&await page.locator('dialog[open]').count();attempt++)await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(),0);
}
async function openInventory(scope='personal') {
  await closeDialogs();await page.locator('#open-inventory').click();await page.locator('#inventory-dialog[open]').waitFor();
  await page.locator('#inventory-scope').selectOption(scope);await page.locator('#inventory-search').fill('');
  await page.locator('#inventory-editor').evaluate(node=>{node.open=true;});
}
async function openUse(operation='potion') {
  await closeDialogs();
  await page.locator(`[data-operation-id="common:${operation}"] .operation-tile`).click();
  await page.locator('#item-use-dialog[open]').waitFor();
}
async function selectChoice(scopeText,name,useText='') {
  const options=await page.locator('#item-choice option').evaluateAll(nodes=>nodes.map(node=>({value:node.value,text:node.textContent})));
  const option=options.find(option=>option.text.includes(scopeText)&&option.text.includes(name)&&(!useText||option.text.includes(useText)));
  assert.ok(option,`未找到${scopeText}/${name}/${useText}选项：${options.map(o=>o.text).join('；')}`);
  await page.locator('#item-choice').selectOption(option.value);
}
async function fillUse({target='pc-001',note='已核对本次物品用途与目标',physical,rolls}={}) {
  await page.locator('#item-target').selectOption(target);await page.locator('#item-note').fill(note);
  if(physical!==undefined)await page.locator('#item-physical').setChecked(physical);
  if(rolls!==undefined)await page.locator('#item-roll-values').fill(rolls);
}
async function confirmUse() {
  const revision=app.store.state.revision+1;await page.locator('#item-confirm').click();await waitRevision(revision);await closeDialogs();
}
async function newHeroTurn() {
  await closeDialogs();
  for(let count=0;count<2;count++){const state=app.store.state;await app.store.dispatch(command(state,'next'),dm);}
  await page.reload();await page.locator('#open-inventory').waitFor();
  assert.equal(actor().economy.bonusUsed,false);assert.equal(app.store.state.combat.action,'none');
}

try {
  app=await startApp({campaignDir:directory,port:0,initial});
  browser=await chromium.launch({executablePath:process.env.BATTLE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
  page=await createPage();await loginDm();

  await openInventory();assert.match(await page.locator('#inventory-list').innerText(),/治疗药水/);assert.match(await page.locator('#inventory-list').innerText(),/医疗包/);
  await page.locator('#inventory-scope').selectOption('catalog');
  const catalogText=await page.locator('#inventory-list').innerText();
  for(const item of ITEM_CATALOG)assert.ok(catalogText.includes(item.name),`目录未显示${item.name}`);
  assert.equal(await page.locator('#inventory-add-item option').count(),182);
  await page.screenshot({path:join(output,'物品目录.png')});checks.push('个人与团队背包入口、182项完整目录可浏览');

  await closeDialogs();const cancelled=await readFile(app.store.path);
  await openUse();await selectChoice('个人','治疗药水');await closeDialogs();assert.deepEqual(await readFile(app.store.path),cancelled);checks.push('查看与取消物品操作不扣费用、不改存档');

  await openUse();await selectChoice('个人','治疗药水');await fillUse({physical:true,rolls:'3,4',note:'线下两颗d4为3和4，给自己饮用治疗药水'});await confirmUse();
  assert.equal(actor().hp,29);assert.equal(actor().economy.bonusUsed,true);assert.equal(personal('personal-potion').quantity,1);assert.equal(party('party-potion').quantity,3);
  const healing=app.store.state.events.at(-1).rolls.find(roll=>roll.source==='manual'&&roll.origin==='physical-dice');assert.ok(healing,'应保存线下骰来源');assert.deepEqual(healing.values,[3,4]);assert.equal(healing.total,9);checks.push('个人治疗药水录入[3,4]后本地治疗9，仅扣一次附赠动作和个人库存');

  await newHeroTurn();await openUse();await selectChoice('团队','治疗药水');await fillUse({physical:true,rolls:'1,2',note:'确认团队药水可取用，线下骰1和2'});
  await page.locator('#item-party-access').uncheck();assert.equal(await page.locator('#item-confirm').isDisabled(),true);assert.match(await page.locator('#item-status').innerText(),/团队|取用|可及|确认/);
  await page.locator('#item-party-access').check();await confirmUse();assert.equal(actor().hp,34);assert.equal(actor().economy.bonusUsed,true);assert.equal(personal('personal-potion').quantity,1);assert.equal(party('party-potion').quantity,2);checks.push('团队物品必须显式确认可及性；成功后只扣团队库存及对应费用');

  await newHeroTurn();await openUse();assert.equal(await page.locator('#item-owned-only').isChecked(),true);await page.locator('#item-owned-only').uncheck();
  await selectChoice('未持有','抗毒剂');await fillUse({note:'仅查看无库存的抗毒剂，不应允许使用'});assert.equal(await page.locator('#item-confirm').isDisabled(),true);assert.match(await page.locator('#item-status').innerText(),/库存|没有|不足|未持有/);await closeDialogs();checks.push('无库存目录可查看，无法作为免费物品提交');

  let state=app.store.state;await app.store.dispatch(command(state,'edit-actor',{actorId:'npc-001',patch:{hp:0},reason:'合成医疗包检查：目标0HP且昏迷'}),dm);await page.reload();await page.locator('#open-inventory').waitFor();
  await openUse('utilize');await selectChoice('个人','医疗包');await fillUse({target:'npc-001',note:'已核对目标0HP、昏迷，使用一次医疗包稳定伤势'});await confirmUse();
  assert.equal(personal('personal-kit').quantity,1);assert.equal(personal('personal-kit').charges,1);assert.equal(app.store.state.actors[1].hp,0);assert.equal(app.store.state.combat.action,'manual');
  await newHeroTurn();await openUse('utilize');await selectChoice('个人','医疗包');await fillUse({target:'npc-001',note:'第二次次数测试，扣尽当前医疗包，不恢复生命'});await confirmUse();assert.equal(personal('personal-kit').quantity,0);assert.equal(personal('personal-kit').charges,0);checks.push('医疗包按单件次数扣除，未耗尽不扣整包，耗尽后正确归零');

  await newHeroTurn();await openInventory();await page.locator('#inventory-edit-scope').selectOption('personal');await page.locator('#inventory-add-item').selectOption(itemId('医疗包'));await page.locator('#inventory-add-quantity').fill('1');
  const replenishedRevision=app.store.state.revision+1;await page.locator('#inventory-add').click();await waitRevision(replenishedRevision);
  assert.equal(personal('personal-kit').quantity,1);assert.equal(personal('personal-kit').charges,10);
  const replenishedJson=JSON.parse(await page.locator('#inventory-json').inputValue()).find(stack=>stack.id==='personal-kit');assert.equal(replenishedJson.quantity,1);assert.equal(replenishedJson.charges,10);
  assert.match(await page.locator(`#inventory-list [data-item-id="${itemId('医疗包')}"] summary`).innerText(),/当前包余10次/);
  await openUse('utilize');await selectChoice('个人','医疗包');await fillUse({target:'npc-001',note:'补货后新医疗包具有完整十次，可正常核对使用'});assert.equal(await page.locator('#item-confirm').isDisabled(),false);await closeDialogs();checks.push('已耗尽医疗包补货一包后恢复10次，JSON与列表一致且可用');

  await openInventory();await page.locator('#inventory-edit-scope').selectOption('personal');await page.locator('#inventory-add-item').selectOption(itemId('火把'));await page.locator('#inventory-add-quantity').fill('2');
  let revision=app.store.state.revision+1;await page.locator('#inventory-add').click();await waitRevision(revision);assert.equal(actor().inventory.filter(stack=>stack.itemId===itemId('火把')).reduce((sum,stack)=>sum+stack.quantity,0),2);
  await closeDialogs();await openInventory();await page.locator('#inventory-edit-scope').selectOption('personal');const oldInventory=structuredClone(actor().inventory);await page.locator('#inventory-json').fill('[]');
  state=app.store.state;await app.store.dispatch(command(state,'edit-actor',{actorId:'pc-001',patch:{resources:'库存过期草稿测试：已发生其他更改'}}),dm);await waitRevision(app.store.state.revision);await page.locator('#inventory-save-json').click();await page.waitForFunction(()=>/已变化|重新|过期/.test(document.querySelector('#toast').textContent));assert.deepEqual(actor().inventory,oldInventory);checks.push('主持可添加库存；过期JSON草稿不能覆盖新的战斗进度');

  await closeDialogs();await page.locator('#roster [data-actor-id=npc-001]').click();await openInventory();await page.locator('#inventory-edit-scope').selectOption('personal');
  const npcInventory=JSON.parse(await page.locator('#inventory-json').inputValue());assert.equal(npcInventory.length,1);assert.equal(npcInventory[0].id,'npc-private-stock');assert.equal(npcInventory[0].quantity,7);
  const player=await createPage();await player.goto(app.url);await player.locator('#identity').fill('player-1');await player.locator('#login-form button').click();await player.locator('#open-inventory').waitFor();
  const projected=await player.evaluate(async()=>fetch('/api/state',{headers:{Authorization:`Bearer ${sessionStorage.getItem('battle-session')}`}}).then(response=>response.json()));assert.equal(projected.state.actors.find(actor=>actor.id==='npc-001').inventory,undefined);assert.equal(JSON.stringify(projected).includes('npc-private-stock'),false);
  const rejected=await player.evaluate(async body=>{const response=await fetch('/api/action',{method:'POST',headers:{Authorization:`Bearer ${sessionStorage.getItem('battle-session')}`,'content-type':'application/json'},body:JSON.stringify(body)});return response.status;},command(app.store.state,'edit-inventory',{actorId:'pc-001',scope:'personal',inventory:[],reason:'玩家权限负面检查'}));assert.equal(rejected,403);await player.close();checks.push('切换角色不串个人背包；玩家看不到他人私有库存且不能调用主持库存编辑');

  const saved=await readFile(app.store.path),savedState=app.store.state;await page.close();page=null;const previous=app;app=null;await previous.close();app=await startApp({campaignDir:directory,port:0,initial:()=>{throw new Error('已有存档不能重建');}});assert.deepEqual(await readFile(app.store.path),saved);
  page=await createPage();await loginDm();await openInventory();await page.locator('#inventory-edit-scope').selectOption('personal');assert.deepEqual(JSON.parse(await page.locator('#inventory-json').inputValue()),savedState.actors[0].inventory);assert.deepEqual(app.store.state.partyInventory,savedState.partyInventory);assert.equal(actor().hp,savedState.actors[0].hp);await page.screenshot({path:join(output,'库存重开.png')});checks.push('关闭核心后重开，从本地文件恢复个人/团队库存、使用次数与HP');

  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(join(output,'结果.json'),JSON.stringify({checks,errors,external,directory},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors}));
} catch(error) {
  if(page&&!page.isClosed())await page.screenshot({path:join(output,'失败现场.png')}).catch(()=>{});
  await writeFile(join(output,'失败.json'),JSON.stringify({checks,errors,external,error:error.message,directory},null,2));throw error;
} finally {await browser?.close();await app?.close();}

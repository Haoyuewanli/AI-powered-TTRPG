import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {startApp} from '../server.mjs';
import {ITEM_CATALOG} from '../data/items-2024.mjs';
import {createClassTestActors} from '../src/testing-presets.mjs';
import {fixture,command,dm} from './fixture.mjs';

const {chromium}=await import(pathToFileURL(process.env.BATTLE_PLAYWRIGHT_MODULE||join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output=fileURLToPath(new URL('../../../开发记录/临时/职业测试角色界面检查/',import.meta.url));
await mkdir(output,{recursive:true});
const directory=await mkdtemp(join(output,'campaign-'));
const checks=[],errors=[],external=[],counts={actors:0,resources:0,operations:0};
let app,browser,page;

async function waitRevision(expected) {
  for(let attempt=0;attempt<100&&app.store.state.revision!==expected;attempt++)await delay(100);
  assert.equal(app.store.state.revision,expected,'操作须恰好提交一次');
  await page.waitForFunction(revision=>Number(/v(\d+)/.exec(document.querySelector('#save-status').textContent)?.[1])===revision,expected);
}
async function dispatch(type,payload={}) {
  await app.store.dispatch(command(app.store.state,type,payload),dm);
}
async function createPage() {
  const context=await browser.newContext({viewport:{width:1680,height:1080},reducedMotion:'reduce'}),origin=app.url;
  await context.route('**/*',route=>{
    if(route.request().url().startsWith(origin+'/'))return route.continue();
    external.push(route.request().url());return route.abort();
  });
  const next=await context.newPage();next.on('pageerror',error=>errors.push(error.message));return next;
}
async function loginDm() {
  await page.goto(app.url);await page.locator('#enter-dm').click();await page.locator('#resource-row .resource-button').first().waitFor();
}
async function closeDialogs() {
  for(let attempt=0;attempt<8&&await page.locator('dialog[open]').count();attempt++)await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog[open]').count(),0);
}
async function selectActor(id) {
  await closeDialogs();await page.locator(`#roster [data-actor-id="${id}"]`).click();
  await page.waitForFunction(id=>document.querySelector('#roster .selected')?.dataset.actorId===id,id);
}
const resource=id=>page.locator(`#resource-row [data-resource-id="${id}"]`);
const operation=id=>page.locator(`[data-operation-id="custom:${id}"] .operation-tile`);
async function assertResource(pool) {
  const button=resource(pool.id),pips=Math.min(32,pool.max),remaining=pool.max>32?Math.ceil(pool.current/pool.max*32):pool.current;
  assert.equal(await button.locator(':scope > small').textContent(),`${pool.current}/${pool.max}`);
  assert.equal(await button.locator('.resource-pip').count(),pips);
  assert.equal(await button.locator('.resource-pip[data-spent=true]').count(),pips-remaining);
  assert.equal(await button.locator('.resource-pips').getAttribute('data-kind'),pool.kind);
  if(['slots','pact'].includes(pool.kind)) {
    assert.equal(await button.locator('.resource-pips').evaluate(node=>getComputedStyle(node).gridTemplateColumns),'12px 12px');
    assert.equal(await button.locator(`.resource-pip[data-shape="${pool.kind}"]`).count(),pool.max);
  }
}
async function browseActor(actor) {
  await selectActor(actor.id);
  await page.locator('#class-test-notes').evaluate(node=>{node.open=true;});
  const notes=await page.locator('#class-test-notes').innerText();
  assert.ok(notes.includes(actor.classTestProfile.subclassName));assert.match(notes,/合成占位|合成/);
  for(const note of actor.classTestProfile.resourceNotes)assert.ok(notes.includes(note));
  assert.ok(notes.includes(JSON.stringify(actor.classTestProfile.manualState,null,2)));
  await page.locator('#class-test-notes').evaluate(node=>{node.open=false;});
  assert.deepEqual(await page.locator('#actor-info [role=meter]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label'))),['生命','临时生命']);
  assert.equal(await page.locator('#resource-row .resource-button').count(),actor.resourcePools.length+5);
  for(const pool of actor.resourcePools) {
    await assertResource(pool);await resource(pool.id).click();await page.locator('#resource-orbit-dialog[open]').waitFor();
    assert.equal(await page.locator('#orbit-ball [data-glass-part=label]').textContent(),pool.name);
    assert.equal(await page.locator('#orbit-ball [data-glass-part=count]').textContent(),`${pool.current}/${pool.max}`);
    assert.equal(await page.locator('#orbit-ball .resource-pips').getAttribute('data-kind'),pool.kind);
    const linked=actor.operations.find(operation=>operation.costs.some(cost=>cost.resourceId===pool.id));
    if(linked) {
      if(await page.locator('#orbit-list').isHidden())await page.locator('#orbit-list-toggle').click();
      await page.locator(`#orbit-list [data-node-id="${linked.category}"]`).click();
      await page.locator(`#orbit-list [data-node-id="custom:${linked.id}"]`).click();
      await page.locator('#operation-dialog[open]').waitFor();
      assert.equal(await page.locator('#operation-title').textContent(),linked.name);
      assert.match(await page.locator('#operation-cost').textContent(),new RegExp(pool.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    }
    await closeDialogs();counts.resources++;
  }
  for(const entry of actor.operations) {
    await operation(entry.id).click();await page.locator('#operation-dialog[open]').waitFor();
    assert.equal(await page.locator('#operation-title').textContent(),entry.name);
    assert.equal(await page.locator('#operation-notes').textContent(),entry.notes);
    assert.equal(await page.locator('#operation-source').textContent(),entry.source);
    assert.equal(await page.locator('#operation-submit').isDisabled(),true,'未确认的战前合成角色只能浏览，不能扣资源');
    await closeDialogs();counts.operations++;
  }
  counts.actors++;
  if(counts.actors%8===0)console.log(`已浏览${counts.actors}名合成角色、${counts.resources}组资源、${counts.operations}项登记操作`);
}
async function inspectInventory(actor,scope) {
  await selectActor(actor.id);await page.locator('#open-inventory').click();await page.locator('#inventory-dialog[open]').waitFor();
  await page.locator('#inventory-scope').selectOption(scope);await page.locator('#inventory-search').fill('');
  const text=await page.locator('#inventory-list').innerText(),inventory=scope==='party'?app.store.state.partyInventory:actor.inventory;
  for(const stack of inventory)assert.ok(text.includes(ITEM_CATALOG.find(item=>item.id===stack.itemId).name),`${actor.id}/${scope}背包缺少物品`);
  await closeDialogs();
}
async function inspectBatch(batch) {
  const actors=app.store.state.actors.filter(actor=>actor.classTestProfile?.batch===batch);
  assert.equal(actors.length,24);assert.deepEqual(actors.map(actor=>actor.id).sort(),createClassTestActors({batch}).map(actor=>actor.id).sort());
  for(const actor of actors){assert.equal(actor.confirmed,false);assert.ok(actor.inventory.length>0);assert.ok(actor.inventory.every(stack=>stack.quantity>0));}
  assert.equal(app.store.state.partyInventory.length,182);
  assert.deepEqual(app.store.state.partyInventory.map(stack=>stack.itemId).sort(),ITEM_CATALOG.map(item=>item.id).sort());
  const path=app.store.path,before=await readFile(path);
  for(const actor of actors)await browseActor(actor);
  await inspectInventory(actors[0],'personal');await inspectInventory(actors.at(-1),'personal');await inspectInventory(actors[0],'party');
  assert.deepEqual(await readFile(path),before,'浏览角色、资源树、操作和背包不得改写战斗文件');
  await page.screenshot({path:join(output,`批次${batch}-资源与操作.png`)});
  return {path,before};
}
async function settleOperation(actorId,operationId,reason) {
  await selectActor(actorId);await operation(operationId).click();await page.locator('#operation-dialog[open]').waitFor();
  await page.locator('#operation-reason').fill(reason);assert.equal(await page.locator('#operation-submit').isDisabled(),false);
  const revision=app.store.state.revision+1;await page.locator('#operation-submit').click();await waitRevision(revision);await closeDialogs();
}
function pool(actorId,id) {return app.store.state.actors.find(actor=>actor.id===actorId).resourcePools.find(pool=>pool.id===id);}

try {
  app=await startApp({campaignDir:directory,port:0,initial:fixture});
  browser=await chromium.launch({executablePath:process.env.BATTLE_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
  page=await createPage();await loginDm();

  await dispatch('add-testing-actors',{batch:1});await page.reload();await page.locator('#resource-row .resource-button').first().waitFor();
  assert.equal(app.store.state.actors.length,26);const first=await inspectBatch(1);
  checks.push('批次1导入24名未确认合成角色，逐一浏览资源玻璃球及全部登记操作，个人/团队背包正确且战斗文件不变');

  await app.workspace.createBattle({name:'第二批职业资源隔离测试'},dm);
  const placeholderId=app.store.state.actors[0].id;
  await dispatch('add-testing-actors',{batch:2});await dispatch('remove-actor',{actorId:placeholderId});
  await page.reload();await page.locator('#resource-row .resource-button').first().waitFor();
  assert.equal(app.store.state.actors.length,24);const second=await inspectBatch(2);
  assert.deepEqual(await readFile(first.path),first.before);
  checks.push('第二场保留24名批次2角色，普通/契约法术位及职业池只呈图标，全部浏览不改本场或第一场存档');

  const wizard='test20-wizard-evoker',warlock='test20-warlock-archfey';
  await dispatch('apply-actors',{actors:app.store.state.actors.map(actor=>({...actor,confirmed:true}))});
  const initiative=Object.fromEntries(app.store.state.actors.map(actor=>[actor.id,[actor.id===wizard?20:actor.id===warlock?19:1]]));
  await dispatch('start',{manualRolls:{initiative}});assert.equal(app.store.state.combat.order[0],wizard);assert.equal(app.store.state.combat.order[1],warlock);
  await page.reload();await page.locator('#resource-row .resource-button').first().waitFor();

  await settleOperation(wizard,'check-spell-slot-1','合成测试：已选定合法一环动作型法术，核对成分与目标，仅验费用，不预编法术效果');
  assert.equal(pool(wizard,'spell-slot-1').current,3);assert.equal(app.store.state.combat.action,'manual');await assertResource(pool(wizard,'spell-slot-1'));
  const spentWizard=await readFile(second.path);await operation('check-spell-slot-1').click();assert.equal(await page.locator('#operation-submit').isDisabled(),true);await closeDialogs();assert.deepEqual(await readFile(second.path),spentWizard);
  checks.push('法师经操作格确认后只扣一枚普通一环位及一个动作，查看已用操作不会再扣');

  let revision=app.store.state.revision+1;await page.locator('#next').click();await waitRevision(revision);
  assert.equal(app.store.state.combat.order[app.store.state.combat.index],warlock);
  await settleOperation(warlock,'check-pact-slots','合成测试：已选定合法动作型契约法术，核对施法条件，仅验费用');
  assert.equal(pool(warlock,'pact-slots').current,3);assert.equal(app.store.state.combat.action,'manual');await assertResource(pool(warlock,'pact-slots'));
  checks.push('魔契师经界面只扣一枚五环契约位及一个动作，契约位与普通环位分别保存');

  const feyBefore=pool(warlock,'steps-fey').current;
  await settleOperation(warlock,'check-steps-fey','合成测试：核对至高妖精妖精步伐的免费迷踪步与落点，测试只登记费用，位移由主持另记');
  assert.equal(pool(warlock,'steps-fey').current,feyBefore-1);assert.equal(pool(warlock,'pact-slots').current,3);assert.equal(app.store.state.actors.find(actor=>actor.id===warlock).economy.bonusUsed,true);await assertResource(pool(warlock,'steps-fey'));
  const uses=app.store.state.events.filter(event=>event.type==='use-operation');assert.equal(uses.length,3);
  assert.equal(uses.filter(event=>event.dmText.includes('妖精步伐')).length,1);
  checks.push('子职妖精步伐经界面扣一次独立次数和附赠动作，不重复扣已用契约位');

  const saved=await readFile(second.path),savedState=app.store.state;
  await page.context().close();page=null;const previous=app;app=null;await previous.close();
  app=await startApp({campaignDir:directory,port:0,initial:()=>{throw new Error('已有合成战斗不能重建');}});
  assert.deepEqual(await readFile(app.store.path),saved);assert.deepEqual(app.store.state,savedState);assert.deepEqual(await readFile(first.path),first.before);
  page=await createPage();await loginDm();
  await selectActor(wizard);await assertResource(pool(wizard,'spell-slot-1'));
  await selectActor(warlock);await assertResource(pool(warlock,'pact-slots'));await assertResource(pool(warlock,'steps-fey'));
  await page.screenshot({path:join(output,'重开后契约位与子职资源.png')});
  checks.push('关闭服务重开后从本地文件原样恢复24名角色、三笔费用、消耗缺口与独立两场进度');

  await page.locator('#logout').evaluate(button=>button.click());
  await page.waitForFunction(()=>document.querySelector('#class-test-notes').textContent==='');
  assert.equal(await page.locator('#class-test-notes').textContent(),'');

  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  checks.push('全部操作无新增脚本错误，没有访问本机测试服务之外的页面资源');
  await writeFile(join(output,'结果.json'),JSON.stringify({checks,counts,errors,external,directory},null,2));
  console.log(JSON.stringify({passed:checks.length,checks,counts,errors}));
} catch(error) {
  if(page&&!page.isClosed())await page.screenshot({path:join(output,'失败现场.png')}).catch(()=>{});
  await writeFile(join(output,'失败.json'),JSON.stringify({checks,counts,errors,external,error:error.message,stack:error.stack,directory},null,2));throw error;
} finally {await browser?.close();await app?.close();}

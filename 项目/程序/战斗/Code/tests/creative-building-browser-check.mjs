import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture } from './fixture.mjs';
const { chromium } = await import(pathToFileURL(join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output = fileURLToPath(new URL('../../../../../开发记录/临时/创造搭建检查/', import.meta.url));
await mkdir(output, { recursive: true }); const directory = await mkdtemp(join(output, 'building-'));
let app = await startApp({ campaignDir: directory, port: 0, initial: fixture }), browser;
const errors = [];
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } }); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__building_check', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body style="margin:0"><div id="board" tabindex="0" style="width:100vw;height:100vh"></div><p id="hint"></p><script type="module">
import { BattleBoard } from '/board.mjs';
import { baseBlockBrush } from '/creative-building.mjs';
let token='',state=null;
async function api(route,body){const r=await fetch(route,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw new Error(value.error);return value;}
async function login(id){token=(await api('/api/login',{id})).token;state=(await api('/api/state')).state;window.board.update(state,null);}
async function action(type,payload={}){const r=await api('/api/action',{actionId:crypto.randomUUID(),type,payload,expectedRevision:state.revision,campaignId:state.campaignId,battleId:state.battleId});state=r.state;window.board.update(state,null);}
window.board=new BattleBoard(document.querySelector('#board'),()=>{},()=>{},{canBuild:()=>state?.viewRole==='dm',buildBrush:unit=>baseBlockBrush(unit),onBuildPlace:item=>action('add-object',item),onBuildRemove:id=>action('remove-object',{objectId:id}),onHint:value=>document.querySelector('#hint').textContent=value});window.undo=()=>action('undo');window.login=login;await login('DM');window.ready=true;
</script></body></html>` }));
  await page.goto(app.url + '/__building_check'); await page.waitForFunction(() => window.ready);
  const effectResult = await page.evaluate(() => {
    const board = window.board, actor = board.state.actors[0], actorId = actor.id;
    actor.appearance = { ...actor.appearance, model: 'voxel', weapon: 'sword' }; board.update(board.state, actorId);
    const sourceWeapon = board.actorModels.get(actorId).userData.weapon;
    board.playCombatEffect({ actorId, targetId: board.state.actors[1].id, weapon: 'bow', kind: 'attack' });
    const effectWeapon = board.actorModels.get(actorId).userData.weapon, registeredWeapon = actor.appearance.weapon;
    board.update(board.state, actorId);
    return { sourceWeapon, effectWeapon, registeredWeapon, restoredWeapon: board.actorModels.get(actorId).userData.weapon };
  });
  assert.deepEqual(effectResult, { sourceWeapon: 'sword', effectWeapon: 'bow', registeredWeapon: 'sword', restoredWeapon: 'sword' });
  const canvas = page.locator('canvas'); await page.getByLabel('DM创造搭建视角').click();
  await page.locator('canvas[data-build-mode=true][data-build-preview]').waitFor();
  const revision = app.store.state.revision;
  const before = JSON.parse(await canvas.getAttribute('data-camera'));
  await canvas.focus(); await page.keyboard.down('KeyW'); await page.waitForFunction(position => JSON.parse(document.querySelector('canvas').dataset.camera).position[2] < position - .2, before.position[2]); await page.keyboard.up('KeyW');
  const rectangle = await canvas.boundingBox();
  await page.mouse.move(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2); await page.mouse.down();
  await page.mouse.move(rectangle.x + rectangle.width / 2 + 50, rectangle.y + rectangle.height / 2, { steps: 5 });
  await page.waitForFunction(() => Math.abs(JSON.parse(document.querySelector('canvas').dataset.camera).yaw) > .05);
  await page.mouse.move(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2, { steps: 5 }); await page.mouse.up();
  assert.equal(app.store.state.revision, revision, 'moving the camera and its preview does not save terrain');
  await canvas.click({ button: 'right', position: { x: rectangle.width / 2, y: rectangle.height / 2 } });
  await page.waitForFunction(() => document.querySelector('canvas').dataset.objectCount === '1');
  assert.deepEqual(app.store.state.objects[0].size, { width: 5, depth: 5, height: 5 });
  await page.getByLabel('基础方块尺寸').selectOption('1');
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.buildPreview).unit === '1');
  await page.getByRole('button', { name: '放置', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('canvas').dataset.objectCount === '2');
  assert.deepEqual(app.store.state.objects.at(-1).size, { width: 1, depth: 1, height: 1 });
  await page.locator('canvas[data-build-target]').waitFor();
  await canvas.click({ position: { x: rectangle.width / 2, y: rectangle.height / 2 } });
  await page.waitForFunction(() => document.querySelector('canvas').dataset.objectCount === '1');
  await page.evaluate(() => window.undo()); assert.equal(app.store.state.objects.length, 2);
  await page.screenshot({ path: join(directory, 'first-person-preview.png') });
  await page.evaluate(() => window.login('player-1'));
  assert.equal(await page.getByLabel('DM创造搭建视角').isVisible(), false);
  assert.equal(await canvas.getAttribute('data-build-mode'), 'false');
  const playerRevision = app.store.state.revision;
  assert.equal(await page.evaluate(() => window.board.setBuildMode(true)), false);
  assert.equal(app.store.state.revision, playerRevision);
  assert.deepEqual(errors, []); await browser.close(); browser = null; await app.close();
  app = await startApp({ campaignDir: directory, port: 0, initial: fixture }); assert.equal(app.store.state.objects.length, 2);
  console.log('PASS: first-person flight, live preview without writes, 1/5-foot blocks, place/destroy/undo, persisted restart and Player denial');
  console.log('证据：' + directory);
} finally { await browser?.close(); await app.close(); }

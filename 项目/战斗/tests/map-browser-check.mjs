import { enterBattle } from './browser-platform.mjs';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { startApp } from '../server.mjs';
import { fixture,command,dm } from './fixture.mjs';
const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const output=fileURLToPath(new URL('../../../开发记录/临时/方块地图检查/',import.meta.url));await mkdir(output,{recursive:true});
const app=await startApp({campaignDir:await mkdtemp(join(output,'map-')),port:0,initial:()=>{const s=fixture();s.board.extended=true;s.board.width=50;s.board.depth=40;s.actors[1].position={x:37.5,y:0,z:22.5};s.actors[1].body={width:6,depth:4,height:14};s.actors.forEach((a,i)=>a.appearance={model:'voxel',preset:i?'giant':'human',skin:i?'#9ccde0':'#d6ae88',clothes:'#347e8b',hair:'#4d382c',weapon:i?'axe':'sword',material:i?'iron':'diamond',shield:!i,armor:{head:'iron',chest:'iron',legs:'chain',feet:'leather'}});return s;}});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(app.url);await page.locator('#enter-dm').click();await enterBattle(page);await page.locator('canvas[data-ready=true]').waitFor();
 async function settle(){await page.waitForTimeout(120);await page.locator('canvas[data-settled=true]').waitFor();}
 async function point(p){await settle();return page.evaluate(async p=>{const T=await import('/vendor/three.module.js');const el=document.querySelector('canvas'),r=el.getBoundingClientRect(),v=JSON.parse(el.dataset.camera);const c=new T.PerspectiveCamera(44,r.width/r.height,.1,5000);c.position.set(v.target[0]+v.distance*Math.sin(v.polar)*Math.sin(v.azimuth),v.distance*Math.cos(v.polar),v.target[2]+v.distance*Math.sin(v.polar)*Math.cos(v.azimuth));c.lookAt(new T.Vector3(...v.target));c.updateMatrixWorld();const q=new T.Vector3(p.x,p.y,p.z).project(c);return{x:r.x+(q.x+1)*r.width/2,y:r.y+(1-q.y)*r.height/2};},p);}
 async function changed(fn){const before=app.store.state.revision;await fn();await page.waitForFunction(v=>document.querySelector('#save-status').textContent.includes(`v${v}`),before+1);assert.equal(app.store.state.revision,before+1);}
 await page.locator('[data-tool=terrain]:visible').first().click();await page.locator('[data-brush=cube5]').click();
 for(const p of [{x:12.5,y:0,z:12.5},{x:17.5,y:0,z:12.5}]){const q=await point(p);await changed(()=>page.mouse.click(q.x,q.y));}
 assert.equal(app.store.state.objects.length,2);assert.equal(app.store.state.objects[1].size.width,5);
 await page.locator('#map-stamp').uncheck();const id=app.store.state.objects[0].id;
 async function drag(to,{shift=false,ctrl=false,cancel=false}={}){
  const o=app.store.state.objects.find(o=>o.id===id);const a=await point({...o.position,y:o.position.y+o.size.height/2}),b=await point({...to,y:o.position.y+o.size.height/2});
  if(shift)await page.keyboard.down('Shift');if(ctrl)await page.keyboard.down('Control');
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.locator(`canvas[data-dragging="${id}"]`).waitFor();
  if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(shift)await page.keyboard.up('Shift');if(ctrl)await page.keyboard.up('Control');
 }
 const before=structuredClone(app.store.state.objects[0].position);await changed(()=>drag({x:before.x+10,z:before.z+15},{shift:true}));
 assert.equal(app.store.state.objects[0].position.x,before.x);assert.notEqual(app.store.state.objects[0].position.z,before.z);
 const moved=structuredClone(app.store.state.objects[0].position);await changed(()=>drag({x:moved.x+15,z:moved.z},{ctrl:true}));assert.equal(app.store.state.objects.length,3);assert.deepEqual(app.store.state.objects[0].position,moved);
 const count=app.store.state.revision;await drag({x:moved.x-10,z:moved.z},{cancel:true});await page.waitForTimeout(200);assert.equal(app.store.state.revision,count);
 await page.locator('[data-tool=terrain]:visible').first().click();await page.locator('[data-brush=circle]').click();
 for(const x of [5,20]){const q=await point({x,y:0,z:5});await changed(()=>page.mouse.click(q.x,q.y));}
 assert.equal(app.store.state.objects.at(-1).shape,'cylinder');assert.equal(app.store.state.objects.at(-2).shape,'cylinder');
 await page.locator('#map-stamp').uncheck();
 const selected=app.store.state.objects.slice(0,2).map(o=>o.id);await page.locator('#map-multi').selectOption(selected);await changed(()=>page.locator('#map-group').click());
 const groupBefore=app.store.state.objects.slice(0,2).map(o=>structuredClone(o.position));
 await changed(()=>drag({x:groupBefore[0].x,z:groupBefore[0].z-5}));
 const delta=app.store.state.objects[0].position.z-groupBefore[0].z;
 assert.equal(app.store.state.objects[1].position.z-groupBefore[1].z,delta);
 await changed(()=>page.locator('#map-ungroup').click());assert.equal(app.store.state.objects[0].groupId,null);
 await page.locator('[data-brush=tile1]').click();const small=await point({x:35.5,y:0,z:5.5});await changed(()=>page.mouse.click(small.x,small.y));
 assert.equal(app.store.state.objects.at(-1).type,'tile');assert.equal(app.store.state.objects.at(-1).size.width,1);assert.equal(await page.locator('#map-snap').inputValue(),'1');
 await page.keyboard.press('Escape');await settle();await page.screenshot({path:join(output,'方块人物与拼贴地图.png')});
 await page.locator('#zoom-in').click();await page.locator('#zoom-in').click();await settle();await page.screenshot({path:join(output,'装备近景.png')});
 assert.deepEqual(errors,[]);console.log('PASS: continuous same-type placement, terrain drag, Shift Z lock, Ctrl copy, Esc cancel, voxel equipment render');
}finally{await browser.close();await app.close();}

import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {threeRoot} from '../project-paths.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),outRoot=resolve(root,'../../../../开发记录/临时/战斗模型检查');
await mkdir(outRoot,{recursive:true});const out=await mkdtemp(join(outRoot,'models-'));
const {chromium}=await import(pathToFileURL(join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const routes=new Map([
 ['/voxel-model.mjs',join(root,'web/voxel-model.mjs')],['/combat-effects.mjs',join(root,'web/combat-effects.mjs')],
 ['/data/model-catalog.mjs',join(root,'data/model-catalog.mjs')],['/vendor/three.module.js',join(threeRoot,'build/three.module.js')]
]);
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://127.0.0.1').pathname;if(path==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<html><body style="margin:0;background:#12222b"><main></main></body></html>');return;}const target=routes.get(path);if(!target){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(await readFile(target));}catch{res.writeHead(500);res.end();}});
await new Promise(accept=>server.listen(0,'127.0.0.1',accept));const port=server.address().port;
let browser;const errors=[];
try{
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1800,height:1200}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+port);
 const result=await page.evaluate(async()=>{
  const THREE=await import('/vendor/three.module.js'),{voxelModel}=await import('/voxel-model.mjs'),{modelMatrix,MODEL_WEAPONS}=await import('/data/model-catalog.mjs'),{playActorAnimation,tickActorModel,BattleEffects}=await import('/combat-effects.mjs');
  const dispose=model=>model.traverse(mesh=>{mesh.geometry?.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:mesh.material?[mesh.material]:[])material.dispose();});
  const actor=(species,classId,weapon='none',preset='human')=>({id:'synthetic',kind:'pc',body:{width:2.4,height:6,depth:1.6},appearance:{species,classId,weapon,preset}});
  const shape=model=>{model.updateMatrixWorld(true);const data=[];model.traverse(mesh=>{if(mesh.isMesh)data.push([mesh.name,Array.from(mesh.geometry.attributes.position.array),mesh.matrixWorld.toArray()]);});return JSON.stringify(data);};
  const hashes=new Set(),ids=new Set();
  for(const descriptor of modelMatrix()){
   const model=voxelModel(actor(descriptor.species.id,descriptor.profession.id));ids.add(model.userData.modelId);const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(shape(model)));hashes.add(Array.from(new Uint8Array(bytes)).join(','));dispose(model);
  }
  const weapons=new Set();
  for(const weapon of MODEL_WEAPONS){const model=voxelModel(actor('human','fighter',weapon.id));weapons.add(shape(model));playActorAnimation(model,{weapon:weapon.id});const active=tickActorModel(model,.1);if(!active||!model.userData.motion)throw Error('Weapon did not animate: '+weapon.id);for(let i=0;i<12;i++)tickActorModel(model,.1);if(model.userData.motion||model.userData.rig.right.rotation.x!==0)throw Error('Weapon pose did not reset: '+weapon.id);dispose(model);}
  const monster=voxelModel({...actor('human','fighter','none','monster'),body:{width:7,height:13,depth:4}}),bounds=new THREE.Box3().setFromObject(monster),size=bounds.getSize(new THREE.Vector3());dispose(monster);
  const effectScene=new THREE.Scene(),effects=new BattleEffects(effectScene);for(const color of ['#ff0000','#0000ff'])effects.play({source:new THREE.Vector3(0,2,0),target:new THREE.Vector3(6,2,0),magic:true,color});effects.update(.1);
  const particleParity=JSON.stringify(effects.entries[0].group.children.map(m=>m.position.toArray()))===JSON.stringify(effects.entries[1].group.children.map(m=>m.position.toArray()));
  const colors=effects.entries.map(e=>e.group.children[0].material.color.getHexString());for(let i=0;i<20;i++)effects.update(.1);const cleared=effects.entries.length===0&&effectScene.children.length===0;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#172d39');scene.add(new THREE.HemisphereLight('#e5f4ff','#6e6353',1.15));const sun=new THREE.DirectionalLight('#fff2d8',1.5);sun.position.set(-15,40,20);scene.add(sun);
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1800,1200);renderer.outputEncoding=THREE.sRGBEncoding;document.querySelector('main').append(renderer.domElement);
  const camera=new THREE.OrthographicCamera(-23,23,17,-17,.1,300);camera.position.set(0,48,36);camera.lookAt(0,0,0);
  const label=(text,x,z)=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#e9f0ed';ctx.font='28px Microsoft YaHei';ctx.textAlign='center';ctx.fillText(text,256,42);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));sprite.position.set(x,7.8,z);sprite.scale.set(6, .75,1);scene.add(sprite);};
  const models=[];window.paintModels=mode=>{
   for(const model of models){scene.remove(model);dispose(model);}models.length=0;for(const child of [...scene.children])if(child.isSprite){child.material.map.dispose();child.material.dispose();scene.remove(child);}
   if(mode==='weapons')for(let i=0;i<MODEL_WEAPONS.length;i++){const weapon=MODEL_WEAPONS[i],model=voxelModel(actor('human','fighter',weapon.id));model.position.set((i%5-2)*8,0,(Math.floor(i/5)-1)*10);scene.add(model);models.push(model);playActorAnimation(model,{weapon:weapon.id});for(let j=0;j<4;j++)tickActorModel(model,.1);label(weapon.name,model.position.x,model.position.z);}
   else{const species=['human','dwarf','elf','dragonborn','orc','tiefling'],classes=['fighter','wizard','ranger','bard'];for(let i=0;i<classes.length;i++)for(let j=0;j<species.length;j++){const model=voxelModel(actor(species[j],classes[i]));model.position.set((j-2.5)*7,0,(i-1.5)*8);scene.add(model);models.push(model);label(model.userData.descriptor.species.name+' · '+model.userData.descriptor.profession.name,model.position.x,model.position.z);}}
   renderer.render(scene,camera);
  };window.paintModels('matrix');
  return{matrixCount:modelMatrix().length,uniqueModelIds:ids.size,uniqueGeometry:hashes.size,uniqueWeapons:weapons.size,monsterSize:size.toArray(),particleParity,colors,cleared};
 });
 assert.equal(result.matrixCount,520);assert.equal(result.uniqueModelIds,520);assert.equal(result.uniqueGeometry,520);assert.equal(result.uniqueWeapons,15);result.monsterSize.forEach((value,i)=>assert.ok(Math.abs(value-[7,13,4][i])<1e-6));assert.equal(result.particleParity,true);assert.notEqual(...result.colors);assert.equal(result.cleared,true);assert.deepEqual(errors,[]);
 await page.screenshot({path:join(out,'model-gallery.png')});await page.evaluate(()=>window.paintModels('weapons'));await page.screenshot({path:join(out,'weapon-gallery.png')});await writeFile(join(out,'result.json'),JSON.stringify({...result,errors},null,2));console.log('模型矩阵520、独立几何520、武器15与独立动作复位、怪物尺寸及单色粒子检查通过。证据：'+out);
}finally{await browser?.close();await new Promise(accept=>server.close(accept));}

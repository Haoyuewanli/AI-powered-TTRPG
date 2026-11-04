import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {initialScene,editScene,demoStats,PALETTE} from './scene-model.mjs';
import {battleFromScene,createPreviewStore} from './preview-store.mjs';
const temp=fileURLToPath(new URL('../../临时/战斗窗口预览/',import.meta.url));
test('独立白板、未填数值检查、重复落点拦截',()=>{
 let s=editScene(initialScene(),'place',{preset:'actor',layerId:'ground',x:2,z:2},'blank-a');
 s=editScene(s,'place',{preset:'actor',layerId:'ground',x:2,z:3},'blank-b');
 assert.equal(s.items.find(i=>i.id==='blank-a').stats,null);
 assert.throws(()=>battleFromScene(s),/完善战斗数值/);
 assert.throws(()=>editScene(s,'place',{preset:'actor',layerId:'ground',x:2,z:2},'duplicate'),/已有/);
 s=editScene(s,'edit',{id:'blank-a',patch:{name:'独立白板',width:2,depth:2,stats:demoStats()}});
 assert.equal(s.items.find(i=>i.id==='blank-b').width,1);assert.equal(s.items.find(i=>i.id==='blank-b').stats,null);
});
test('地面层调整同时移动该层所有物件；不改变其他层',()=>{
 const before=initialScene(),after=editScene(before,'layer-edit',{id:'upper',name:'二楼',height:4});
 assert.equal(battleFromScene(after).objects.find(i=>i.id==='platform').position.y,20);
 assert.equal(battleFromScene(after).actors[0].position.y,0);
 assert.equal(before.layers[1].height,2);
 assert.throws(()=>editScene(after,'layer-edit',{id:'upper',name:'过高',height:100}),/层高/);
 assert.throws(()=>editScene(after,'edit',{id:'platform',patch:{layerId:'missing'}}),/不存在/);
});
test('全部积木可编译为原规则接受的战斗数据',()=>{
 let s=initialScene();
 for(const [n,p]of PALETTE.entries()){s=editScene(s,'place',{preset:p.id,layerId:'ground',x:50+n*3,z:50},`preset-${n}`);if(p.kind==='actor')s=editScene(s,'edit',{id:`preset-${n}`,patch:{stats:demoStats()}});}
 assert.equal(battleFromScene(s).objects.length,s.items.filter(i=>i.kind==='block').length);
});
test('保存版本冲突、无效操作不写盘；撤销层高恢复同层物件',async()=>{
 await mkdir(temp,{recursive:true});const dir=await mkdtemp(join(temp,'store-check-')),file=join(dir,'state.json'),store=await createPreviewStore(file);
 await store.dispatch({revision:0,type:'layer-edit',payload:{id:'upper',name:'二层',height:4}});
 const snapshot=await readFile(file,'utf8');
 await assert.rejects(store.dispatch({revision:0,type:'layer-add',payload:{name:'过期',height:30}}),/更新/);
 await assert.rejects(store.dispatch({revision:1,type:'place',payload:{preset:'cube5',layerId:'missing',x:2,z:2}}),/不存在/);
 assert.equal(await readFile(file,'utf8'),snapshot);
 await store.dispatch({revision:1,type:'undo'});assert.equal(store.get().layers[1].height,2);
 assert.equal(store.get().revision,2);
});
test('战斗沿用本地结算；攻击扣费、非法移动原子拒绝、撤销恢复',async()=>{
 const dir=await mkdtemp(join(temp,'combat-check-')),store=await createPreviewStore(join(dir,'state.json'));
 await store.dispatch({revision:0,type:'battle-start'});let s=store.get();
 const a=s.combat.actors.find(a=>a.id===s.combat.combat.order[0]),target=s.combat.actors.find(a=>a.id!==s.combat.combat.order[0]);
 store.plan({actorId:a.id,targetId:target.id,attackId:'basic'});
 await store.dispatch({revision:1,type:'battle-action',action:'attack',payload:{actorId:a.id,targetId:target.id,attackId:'basic'}});
 s=store.get();assert.equal(s.combat.combat.attacksUsed,1);assert(s.combat.actors.find(t=>t.id===target.id).hp<=30);
 await assert.rejects(store.dispatch({revision:2,type:'battle-action',action:'move',payload:{actorId:a.id,position:{x:a.position.x+450,y:0,z:a.position.z+450}}}),/移动距离/);
 assert.equal(store.get().revision,2);
 await store.dispatch({revision:2,type:'undo'});assert.equal(store.get().combat.combat.attacksUsed,0);
 await store.dispatch({revision:3,type:'battle-action',action:'next'});assert.equal(store.get().combat.combat.index,1);
});

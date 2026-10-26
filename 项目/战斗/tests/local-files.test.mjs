import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {openWorkspace} from '../src/workspace.mjs';
import {fixture,command,dm,player} from './fixture.mjs';
const root=fileURLToPath(new URL('../../../开发记录/临时/文件刷新检查/',import.meta.url));
async function setup(){await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'case-'));const w=await openWorkspace({seedDirectory:dir,workspaceDirectory:join(dir,'.workspace'),initial:fixture});return {dir,w};}
const call=(w,operation,rest={})=>w.files({operation,...w.selection,...rest},dm);
test('JSON libraries initialize independently; chosen actor import preserves placement and other battles',async()=>{
 const {dir,w}=await setup();try{
  const list=await call(w,'list');assert.equal(list.libraries[0].actors.length,1);assert.equal(list.libraries[1].actors.length,1);
  const path=join(dir,'玩家资料.json'),data=JSON.parse(await readFile(path,'utf8'));data.actors[0].hp=17;data.actors[0].position.x=90;await writeFile(path,JSON.stringify(data));
  const preview=await call(w,'preview-library',{key:'players',ids:['pc-001']});const before=w.store.state.actors[0].position;
  await call(w,'apply-library',{key:'players',ids:['pc-001'],fingerprint:preview.preview.fingerprint,expectedRevision:preview.preview.revision});
  assert.equal(w.store.state.actors[0].hp,17);assert.deepEqual(w.store.state.actors[0].position,before);
  const first=w.selection;await w.createBattle({name:'另一场',templateBattleId:first.battleId},dm);await w.dispatch(command(w.store.state,'edit-actor',{actorId:'pc-001',patch:{hp:12}}),dm);await w.select(first,dm);assert.equal(w.store.state.actors[0].hp,17);
 }finally{await w.close();}
});
test('external battle changes block writes; validated reload increments version, keeps audit, supports undo',async()=>{
 const {dir,w}=await setup();try{
  await w.dispatch(command(w.store.state,'edit-actor',{actorId:'pc-001',patch:{hp:30}}),dm);
  const s=w.store.state,copy=structuredClone(s);copy.actors[0].hp=19;copy.events=[];copy.undoStack=[];
  await writeFile(w.store.path,JSON.stringify(copy));assert.equal((await w.store.fileStatus()).changed,true);
  await assert.rejects(w.dispatch(command(s,'edit-actor',{actorId:'pc-001',patch:{hp:10}}),dm),/外部已修改/);
  assert.equal(JSON.parse(await readFile(w.store.path)).actors[0].hp,19);
  const p=await call(w,'preview-battle');await call(w,'reload-battle',{fingerprint:p.preview.fingerprint,expectedRevision:p.preview.revision});
  assert.equal(w.store.state.revision,s.revision+1);assert.equal(w.store.state.events.length,s.events.length+1);assert.equal(w.store.state.actors[0].hp,19);assert.equal((await w.store.fileStatus()).changed,false);
  assert.ok((await readdir(dir)).some(n=>n.startsWith('外部编辑-')));
  await w.dispatch(command(w.store.state,'undo'),dm);assert.equal(w.store.state.actors[0].hp,30);
 }finally{await w.close();}
});
test('bad JSON, stale previews and changed identities never replace last valid memory',async()=>{
 const {w}=await setup();try{
  const s=w.store.state;await writeFile(w.store.path,'{broken');await assert.rejects(call(w,'preview-battle'),/有效JSON/);assert.deepEqual(w.store.state,s);
  const changed=structuredClone(s);changed.actors[0].ownerId='other';await writeFile(w.store.path,JSON.stringify(changed));await assert.rejects(call(w,'preview-battle'),/归属/);
  changed.actors[0].ownerId='player-1';await writeFile(w.store.path,JSON.stringify(changed));const p=await call(w,'preview-battle');await writeFile(w.store.path,JSON.stringify(changed)+' ');await assert.rejects(call(w,'reload-battle',{fingerprint:p.preview.fingerprint,expectedRevision:p.preview.revision}),/又变了/);assert.deepEqual(w.store.state,s);
 }finally{await w.close();}
});
test('file navigation resolves registered paths only and rejects player access',async()=>{
 const {dir,w}=await setup();try{
  const opened=[];await w.files({operation:'reveal',key:'players',...w.selection},dm,{reveal:(path,folder)=>opened.push({path,folder})});assert.deepEqual(opened,[{path:join(dir,'玩家资料.json'),folder:false}]);
  await assert.rejects(call(w,'reveal',{key:'../../secret'}),/已登记/);
  await assert.rejects(w.files({operation:'list',...w.selection},player),/DM权限/);
  await assert.rejects(w.files({operation:'list',...w.selection,battleId:'other'},dm),/切换战斗/);
 }finally{await w.close();}
});

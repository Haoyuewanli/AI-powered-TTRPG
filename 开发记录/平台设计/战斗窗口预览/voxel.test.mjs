import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {CELL,aligned,voxelCells,gridLine,renderItem} from './voxel-grid.mjs';
import {initialScene,PALETTE,editScene,snapPoint,validateScene} from './scene-model.mjs';
import {createPreviewStore,battleFromScene} from './preview-store.mjs';

test('所有积木和位置采用0.2格；小于格或半格编辑均拒绝',()=>{
  const s=initialScene();validateScene(s);
  for(const i of PALETTE)for(const k of ['width','depth','height'])assert(i[k]>=CELL&&aligned(i[k]));
  for(const patch of [{width:.1},{depth:.3},{height:.5},{x:.1},{z:1.1}])assert.throws(()=>editScene(s,'edit',{id:'fighter',patch}),/0.2/);
  assert.throws(()=>editScene(s,'layer-edit',{id:'upper',name:'半格层',height:.1}),/0.2/);
  assert.equal(voxelCells(PALETTE[0]).length,125);assert.equal(voxelCells(PALETTE[1]).length,1);
});
test('方块圆与坡面只有整数小格；圆角与光滑斜面不再作为实体',()=>{
  const cylinder={...PALETTE.find(i=>i.id==='pillar'),width:1,depth:1,height:.4};
  const cells=voxelCells(cylinder);assert.equal(cells.length,42);assert(!cells.some(([x,,z])=>x===0&&z===0));
  assert(cells.every(c=>c.every(Number.isInteger)));
  const ramp=voxelCells(PALETTE.find(i=>i.id==='ramp'));assert.equal(ramp.length,75);
  const person=voxelCells(PALETTE[2],'person');assert(person.length>0);assert(person.every(c=>c.every(Number.isInteger)));
});
test('大小网格吸附和负坐标一致；规则尺坐标仍按中心换算',()=>{
  assert.deepEqual(snapPoint({x:2.89,z:-.01},PALETTE[0]),{x:2,z:-1});
  assert.deepEqual(snapPoint({x:2.89,z:-.01},PALETTE[1]),{x:2.8,z:-.2});
  const s=initialScene(),i=renderItem(s.items[0]);assert.equal(i.x,22.5);assert.equal(i.width,5);
  assert.equal(battleFromScene(s).actors[0].position.x,22.5);
});
test('快速划过补齐网格；来回同格与大小积木重叠不会重复写入',()=>{
  const points=gridLine({x:0,z:0},{x:2,z:0},.2);assert.equal(points.length,11);
  assert.deepEqual(gridLine({x:0,z:0},{x:3,z:1},1),[{x:0,z:0},{x:1,z:0},{x:2,z:1},{x:3,z:1}]);
  let s=editScene(initialScene(),'paint',{preset:'cube1',layerId:'ground',points:[...points,...points.slice().reverse()]},'stroke');
  assert.equal(s.items.length,initialScene().items.length+11);
  const repeated=editScene(s,'paint',{preset:'cube1',layerId:'ground',points},'repeat');assert.equal(repeated,s);
  s=editScene(s,'paint',{preset:'cube5',layerId:'ground',points:[{x:0,z:0},{x:3,z:0}]},'large');
  assert.equal(s.items.filter(i=>i.preset==='cube5').length,1);
  assert.throws(()=>editScene(s,'paint',{preset:'actor',layerId:'ground',points:[{x:0,z:0}]},'bad'),/仅支持/);
});
test('连续铺设整笔原子保存、整笔撤销；重复覆盖不产生记录',async()=>{
  const root=fileURLToPath(new URL('../../临时/战斗窗口预览/',import.meta.url));await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'voxel-test-')),file=join(dir,'scene.json'),store=await createPreviewStore(file);
  const payload={preset:'cube5',layerId:'ground',points:gridLine({x:0,z:0},{x:9,z:0},1)};
  const after=await store.dispatch({type:'paint',revision:0,payload});assert.equal(after.items.length,15);assert.equal(after.revision,1);
  const saved=await readFile(file,'utf8');await store.dispatch({type:'paint',revision:1,payload});assert.equal(await readFile(file,'utf8'),saved);
  await assert.rejects(store.dispatch({type:'paint',revision:1,payload:{...payload,points:[{x:0,z:2},{x:.1,z:2}]}}),/0.2/);
  assert.equal(await readFile(file,'utf8'),saved);
  await store.dispatch({type:'undo',revision:1});assert.equal(store.get().items.length,5);assert.equal(store.get().revision,2);
});
test('调整积木不能与已有小格重叠；战斗移动正确换算回0.2世界坐标',async()=>{
  let s=editScene(initialScene(),'place',{preset:'cube5',layerId:'ground',x:0,z:0},'cube-a');
  s=editScene(s,'place',{preset:'cube1',layerId:'ground',x:2,z:0},'cube-b');
  assert.throws(()=>editScene(s,'edit',{id:'cube-b',patch:{x:.2}}),/重叠/);
  const root=fileURLToPath(new URL('../../临时/战斗窗口预览/',import.meta.url));await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'move-units-')),store=await createPreviewStore(join(dir,'state.json'));
  await store.dispatch({type:'battle-start',revision:0});s=store.get();const a=s.combat.actors.find(a=>a.id===s.combat.combat.order[0]);const old=s.items.find(i=>i.id===a.id);
  await store.dispatch({type:'battle-action',action:'move',revision:1,payload:{actorId:a.id,position:{...a.position,z:a.position.z+5}}});
  const next=store.get().items.find(i=>i.id===a.id);assert.equal(next.z,old.z+1);assert(aligned(next.z));assert.equal(store.get().combat.combat.moved,5);
});

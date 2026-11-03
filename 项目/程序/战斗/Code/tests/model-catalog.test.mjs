import test from 'node:test';
import assert from 'node:assert/strict';
import {MODEL_CLASSES,MODEL_SPECIES,MODEL_WEAPONS,modelDescriptor,modelMatrix,attackPose} from '../data/model-catalog.mjs';

test('基础种族与职业组合保持唯一、确定，核心和扩展覆盖分别标明',()=>{
  const core=modelMatrix({coreOnly:true}),all=modelMatrix();
  assert.equal(core.length,120);assert.equal(all.length,520);
  assert.equal(new Set(all.map(model=>model.modelId)).size,all.length);
  assert.equal(new Set(all.map(model=>model.signature)).size,all.length);
  for(const model of all)assert.deepEqual(modelDescriptor({species:model.species.id,classId:model.profession.id}),model);
  assert.equal(MODEL_CLASSES.filter(item=>item.core).length,12);assert.equal(MODEL_SPECIES.filter(item=>item.core).length,10);
  assert.equal(modelDescriptor({species:'龙裔 Dragonborn',classId:'圣武士'}).modelId,'voxel-v2:dragonborn:paladin');
  assert.equal(modelDescriptor({preset:'monster',species:'tiefling',classId:'wizard'}).modelId,'voxel-monster-v2');
});
test('每种武器有自己的动作轨迹，结束后回到休息姿态，魔法不按武器改变姿态',()=>{
  const signatures=MODEL_WEAPONS.map(weapon=>JSON.stringify([.2,.4,.65].map(t=>attackPose(weapon.id,t))));
  assert.equal(new Set(signatures).size,MODEL_WEAPONS.length);
  for(const weapon of MODEL_WEAPONS){
    const rest=attackPose(weapon.id,0),last=attackPose(weapon.id,1);
    for(const value of Object.values(rest))assert.equal(Math.abs(value),0);
    for(const value of Object.values(last))assert.ok(Math.abs(value)<1e-12);
    assert.deepEqual(attackPose(weapon.id,.5,true),attackPose('none',.5,true));
  }
});

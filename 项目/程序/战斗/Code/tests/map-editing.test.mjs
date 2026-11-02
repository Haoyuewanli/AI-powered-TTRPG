import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAction, validateState, projectState } from '../src/rules.mjs';
import { snapObject } from '../src/map-placement.mjs';
import { upgradeBattle } from '../src/workspace.mjs';
import { fixture,command,dm,player } from './fixture.mjs';
const state=()=>{const s=upgradeBattle(fixture(),'test-campaign','map-battle');s.board.extended=true;return s;};
const block=(id,x=0)=>({id,name:'合成方块',type:'prop',shape:'box',position:{x,y:0,z:-10},size:{width:5,depth:5,height:5},rotation:0,hidden:false,blocksMovement:true});
test('extended negative positions, new shapes and finite coordinate limits',()=>{
 let s=state();for(const shape of ['box','cylinder','triangle','ramp'])s=executeAction(s,command(s,'add-object',{...block('x',-50),shape}),dm);
 assert.equal(s.objects.length,4);assert.equal(projectState(s,player).objects[2].shape,'triangle');
 assert.throws(()=>executeAction(s,command(s,'edit-object',{objectId:s.objects[0].id,patch:{position:{x:10001,y:0,z:0}}}),dm));
 assert.throws(()=>executeAction(s,command(s,'edit-board',{width:100,depth:80,extended:false}),dm));
});
test('group translation and Ctrl-copy are atomic, undoable and independent',()=>{
 let s=state();s.objects=[block('a'),block('b',10)];s=executeAction(s,command(s,'transform-objects',{ids:['a','b'],operation:'group'}),dm);
 const group=s.objects[0].groupId;assert.equal(s.objects[1].groupId,group);
 s=executeAction(s,command(s,'transform-objects',{ids:['a','b'],operation:'copy',delta:{x:0,y:5,z:15}}),dm);
 assert.equal(s.objects.length,4);assert.notEqual(s.objects[2].groupId,group);assert.equal(s.objects[2].groupId,s.objects[3].groupId);assert.equal(s.objects[0].position.y,0);
 s=executeAction(s,command(s,'undo'),dm);assert.equal(s.objects.length,2);
 const before=structuredClone(s);assert.throws(()=>executeAction(s,command(s,'transform-objects',{ids:['a','missing'],operation:'move',delta:{x:1,y:0,z:0}}),dm));assert.deepEqual(s,before);
 assert.throws(()=>executeAction(s,command(s,'transform-objects',{ids:['a'],operation:'copy',delta:{x:0,y:0,z:5}}),player));
});
test('alignment supports grid, edges, height and Shift preserving X/Y',()=>{
 const a=block('a'), b={...block('b',10),position:{x:10,y:5,z:10}};
 assert.deepEqual(snapObject(a,{x:8,y:0,z:7},[],{step:5}),{x:7.5,y:0,z:7.5});
 const p=snapObject(a,{x:9,y:0,z:9},[b],{step:.5,height:true});assert.equal(p.y,10);
 const locked=snapObject(a,{x:11,y:5,z:10},[b],{step:1,edges:true,height:true,lockZ:true});assert.equal(locked.x,a.position.x);assert.equal(locked.y,0);
});
test('2000 items validate, higher counts reject; hidden group metadata stays private',()=>{
 const s=state();s.objects=Array.from({length:2000},(_,i)=>({...block(`o${i}`),groupId:'private-group'}));validateState(s);
 assert.ok(!JSON.stringify(projectState(s,player)).includes('private-group'));s.objects.push(block('extra'));assert.throws(()=>validateState(s),/2000/);
});

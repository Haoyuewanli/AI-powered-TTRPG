import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAction, projectState } from '../src/rules.mjs';
import { fixture, command, dm, player } from './fixture.mjs';
export const appearance = {model:'voxel',preset:'human',skin:'#d6ae88',clothes:'#347e8b',hair:'#4d382c',weapon:'axe',material:'iron',shield:true,armor:{head:'iron',chest:'diamond',legs:'chain',feet:'leather'}};
test('appearance saves and projects without changing mechanics; invalid fields reject',()=>{
 const s=fixture(), before=structuredClone(s.actors[0]);
 const next=executeAction(s,command(s,'edit-actor',{actorId:before.id,patch:{appearance}}),dm);
 assert.deepEqual(next.actors[0],{...before,appearance});
 assert.deepEqual(projectState(next,player).actors[0].appearance,appearance);
 for(const patch of [{...appearance,skin:'url(secret)'},{...appearance,weapon:'unknown'},{...appearance,notes:'private'}]) assert.throws(()=>executeAction(s,command(s,'edit-actor',{actorId:before.id,patch:{appearance:patch}}),dm));
 assert.throws(()=>executeAction(s,command(s,'edit-actor',{actorId:before.id,patch:{appearance}}),player));
});

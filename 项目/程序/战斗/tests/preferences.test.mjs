import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openPreferences,validatePreferences} from '../src/preferences.mjs';
import {dm,player} from './fixture.mjs';
test('preferences persist per campaign/viewer and reject stale writes',async()=>{
  const root=fileURLToPath(new URL('../../../../开发记录/临时/设置测试/',import.meta.url));await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'prefs-')),file=join(dir,'界面设置.json');let store=await openPreferences(file);
  const value={resources:{action:{color:'#123456',spentColor:'#777777'}},layout:{icon:{x:40,y:30}},hotbars:{'pc-001':['common:dash']}};
  await store.save(dm,'camp',{campaignId:'camp',expectedRevision:0,value});assert.throws(()=>validatePreferences({hp:100}));assert.deepEqual(store.get(player,'camp').value,{});assert.deepEqual(store.get(dm,'other').value,{});
  await assert.rejects(store.save(dm,'camp',{campaignId:'camp',expectedRevision:0,value}),/已变化/);store=await openPreferences(file);assert.deepEqual(store.get(dm,'camp').value,value);
});
test('preferences reject executable images, traversal, invalid layouts and unbounded data',()=>{
  for(const value of [{resources:{action:{color:'#123456',spentColor:'#777777',image:'data:image/svg+xml,<svg onload="alert(1)"/>'}}},{resources:{'../test':{color:'#123456',spentColor:'#777777'}}},{layout:{icon:{x:-1,y:20}}},{layout:{icon:{x:NaN,y:20}}},{hotbars:{a:['x','x']}}])assert.throws(()=>validatePreferences(value));
});
test('corrupt preferences preserve original and recover defaults without blocking battle files',async()=>{
  const root=fileURLToPath(new URL('../../../../开发记录/临时/设置测试/',import.meta.url));await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'bad-')),path=join(dir,'界面设置.json');await writeFile(path,'bad json');const store=await openPreferences(path);assert.match(store.recoveryNote,/原件/);assert.deepEqual(store.get(dm,'c').value,{});const bad=(await readdir(dir)).find(n=>n.includes('损坏-'));assert.equal(await readFile(join(dir,bad),'utf8'),'bad json');
});

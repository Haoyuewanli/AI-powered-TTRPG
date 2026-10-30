import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { RuleError, requireRule, validateActor } from './rules.mjs';
const digest = raw => createHash('sha256').update(raw).digest('hex');
export async function dataFiles(directory, store, payload={operation:'list'}, {reveal}={}) {
 const paths={players:join(directory,'玩家资料.json'),npcs:join(directory,'NPC资料.json'),battle:store.path,folder:directory};
 for(const [key,kind] of [['players','pc'],['npcs','npc']]) {
  const value={formatVersion:1,campaignId:store.state.campaignId,kind,actors:store.state.actors.filter(a=>a.kind===kind)};
  try{await writeFile(paths[key],JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 }
 async function readLibrary(key) {
  requireRule(['players','npcs'].includes(key),'资料类型无效');
  const info=await stat(paths[key]);requireRule(info.size<=8*1024*1024,'资料文件超过8MB，请拆分或精简');
  const raw=await readFile(paths[key],'utf8');let value;
  try{value=JSON.parse(raw.replace(/^\uFEFF/,''));}catch{throw new RuleError(`${key==='players'?'玩家':'NPC'}资料JSON格式无效，请检查逗号、引号和括号；文件未改动。`);}
  requireRule(value.formatVersion===1&&value.campaignId===store.state.campaignId&&value.kind===(key==='players'?'pc':'npc')&&Array.isArray(value.actors)&&value.actors.length<=200,'资料文件版本、团ID、类型或数量无效');
  requireRule(new Set(value.actors.map(a=>a.id)).size===value.actors.length,'资料角色ID重复');
  for(const actor of value.actors) {requireRule(actor.kind===value.kind,'资料中混入其他角色类型');validateActor(actor,{width:300,depth:300,extended:true});}
  return {value,fingerprint:digest(raw),modified:info.mtime.toISOString()};
 }
 const op=payload.operation;
 if(op==='reveal') {
  requireRule(Object.hasOwn(paths,payload.key),'只能定位本团已登记的数据文件');
  if(reveal) await reveal(paths[payload.key],payload.key==='folder');
  else { requireRule(process.platform==='win32','此按钮目前仅支持Windows；可复制显示的路径');await new Promise((accept,reject)=>{const child=spawn('explorer.exe',payload.key==='folder'?[paths.folder]:[`/select,${paths[payload.key]}`],{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();accept();});}); }
  return {opened:true};
 }
 if(op==='preview-battle') return {preview:await store.previewFile()};
 if(op==='reload-battle') {await store.reloadFile(payload);return {loaded:true};}
 if(op==='preview-library'||op==='apply-library') {
  const source=await readLibrary(payload.key);
  requireRule(Array.isArray(payload.ids)&&payload.ids.length>0&&payload.ids.length<=40&&new Set(payload.ids).size===payload.ids.length,'请从资料列表选择要应用的角色');
  const actors=payload.ids.map(id=>{const a=source.value.actors.find(a=>a.id===id);requireRule(a,'资料中找不到角色');const existing=store.state.actors.find(x=>x.id===id);requireRule(existing&&existing.kind===a.kind&&existing.ownerId===a.ownerId,'角色须已在本场且归属相同；新增角色请用战前布置');return a;});
  const fields=['name','ac','maxHp','hp','tempHp','tempHpBase','speed','initiativeBonus','attackLimit','body','space','immunities','resistances','vulnerabilities','notes','resources','resourcePools','operations','inventory','hidden','confirmed','attacks','tiePriority','appearance'];
  const changes=actors.map(a=>{const before=store.state.actors.find(x=>x.id===a.id);return {actorId:a.id,name:a.name,fields:fields.filter(k=>Object.hasOwn(a,k)&&JSON.stringify(a[k])!==JSON.stringify(before[k])).map(k=>({field:k,before:before[k],after:a[k]}))};});
  if(op==='preview-library')return {preview:{fingerprint:source.fingerprint,revision:store.state.revision,changes}};
  requireRule(source.fingerprint===payload.fingerprint,'资料在预览后已修改，请重新刷新',409);
  await store.dispatch({campaignId:store.state.campaignId,battleId:store.state.battleId,expectedRevision:payload.expectedRevision,actionId:randomUUID(),type:'apply-actors',payload:{actors}},{role:'dm',id:'DM'});
  return {loaded:true};
 }
 requireRule(op==='list','文件操作无效');
 const libraries=[];
 for(const key of ['players','npcs']) {try{const r=await readLibrary(key);libraries.push({key,path:paths[key],modified:r.modified,actors:r.value.actors.map(a=>({id:a.id,name:a.name,inBattle:store.state.actors.some(x=>x.id===a.id)}))});}catch(error){libraries.push({key,path:paths[key],error:error.message,actors:[]});}}
 let battle;try{const info=await stat(store.path);battle={path:store.path,modified:info.mtime.toISOString(),...await store.fileStatus()};}catch{battle={path:store.path,changed:true,error:'战斗文件暂时无法读取，请检查编辑器是否已保存'};}
 return {folder:directory,libraries,battle};
}

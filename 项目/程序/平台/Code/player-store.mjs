import { playerMarkdown, parsePlayerMarkdown } from './player-format.mjs';
import { archiveInitial } from './project-files.mjs';
import { lstat, readdir, readFile, mkdir, writeFile, rename, open, unlink, cp } from 'node:fs/promises';
import { resolve, join, relative, dirname, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
const fail = (message,status=400)=>{throw Object.assign(new Error(message),{status});};
const segment = value => typeof value==='string' && value.length>0 && value.length<100 && !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !value.startsWith('.') && !/[. ]$/.test(value) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
export function createPlayerStore({root}) {
 const base=resolve(root,'资源/玩家'); let queue=Promise.resolve();
 async function safe(path='',missing=false){
  if(path && !path.split('/').every(segment))fail('玩家目录名称无效。'); const target=resolve(base,path);
  if(target!==base&&!target.startsWith(base+sep))fail('目录越界。',403);
  let cursor=resolve(root); const rel=relative(cursor,target);
  for(const part of rel.split(sep)){cursor=join(cursor,part);try{const info=await lstat(cursor);if(info.isSymbolicLink()||info.isFile()&&info.nlink>1)fail('不支持链接文件或目录。',403);}catch(e){if(e.code==='ENOENT'&&missing)break;throw e;}}
  return target;
 }
 async function json(path){return JSON.parse(await readFile(await safe(path),'utf8'));}
 const missingIndex = fallback => error => { if(error.code==='ENOENT')return fallback;throw error; };
 async function write(path,text){const target=await safe(path,true);await mkdir(dirname(target),{recursive:true});const temp=target+'.'+randomUUID()+'.tmp';try{await writeFile(temp,text,{flag:'wx'});await rename(temp,target);}finally{await unlink(temp).catch(()=>{});}}
 async function tree(){const entries=[],issues=[],hash=createHash('sha256');
  async function walk(path='',depth=0){let children;try{children=await readdir(await safe(path),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;issues.push({path,error:e.message});return;}
   for(const child of children.sort((a,b)=>a.name.localeCompare(b.name))){if(child.name.startsWith('.')||child.name==='Code'||child.name==='模版'||child.name.endsWith('.tmp'))continue;const key=[path,child.name].filter(Boolean).join('/');
    try{const target=await safe(key),stat=await lstat(target);hash.update(key+stat.mtimeMs+stat.size);
     if(child.isDirectory()&&depth<3){let info={};try{info=await json(key+'/索引.json');hash.update(JSON.stringify(info));}catch(e){if(e.code!=='ENOENT')issues.push({path:key+'/索引.json',error:e.message});}entries.push({...info,path:key,name:child.name,type:['player','character','level'][depth]});await walk(key,depth+1);}
     else if(child.isFile()&&depth===3&&['选择.md','能力.md'].includes(child.name)){const text=await readFile(target,'utf8');hash.update(text);entries.push({path:key,name:child.name,type:'file'});}
    }catch(e){issues.push({path:key,error:e.message});}
   }
  }await walk();return{entries,issues,revision:hash.digest('hex')};
 }
 async function records(){const data=await tree(),resources=[];for(const file of data.entries.filter(e=>e.type==='file'&&e.name==='能力.md')){try{const parts=file.path.split('/'),player=data.entries.find(e=>e.path===parts[0]),character=data.entries.find(e=>e.path===parts.slice(0,2).join('/'));const raw=await readFile(await safe(file.path),'utf8');const {meta,body:text}=parsePlayerMarkdown(raw,'能力.md');resources.push({resource:{id:meta.id,name:(character?.name||parts[1])+' · '+parts[2],kind:'角色',scope:'player',ownerId:player?.id,ownerName:player?.name||parts[0],ownerPlayerIds:Array.isArray(player?.linkedPlayerIds)?player.linkedPlayerIds.filter(id=>typeof id==='string'):[],path:'资源/玩家/'+file.path,scopeRoot:'资源/玩家/'+parts.slice(0,3).join('/'),initial:archiveInitial(character?.name||parts[1],meta.initial).letter,shareable:false},text});}catch(e){data.issues.push({path:file.path,error:e.message});}}return{...data,resources};}
 async function read(path){if(typeof path!=='string'||path.split('/').length!==4||!/\/(选择|能力)\.md$/.test(path))fail('请选择等级文件夹内的选择.md或能力.md。');const text=await readFile(await safe(path),'utf8');return{text,...await tree()};}
 async function operation(body){const next=queue.catch(()=>{}).then(async()=>{
  await mkdir(await safe('',true),{recursive:true});const lock=join(base,'.player.lock');let handle;try{handle=await open(lock,'wx');}catch{fail('玩家资料正在保存，请稍后重试。',409);}
  try{const before=await tree();if(body.expectedRevision!==before.revision)fail('目录或文件已变化，请刷新后重试。',409);
   const path=body.path||'',entry=before.entries.find(e=>e.path===path),parent=body.parent||'';
   if(body.action==='create'){
    const depth=parent?parent.split('/').length:0;if(depth>2||!segment(body.name))fail('名称无效或此处不能新建文件夹。');if(parent&&!before.entries.some(e=>e.path===parent&&e.type!=='file'))fail('目标目录不存在。',404);
    const dest=[parent,body.name].filter(Boolean).join('/');if(before.entries.some(e=>e.path===dest))fail('同名目录已存在。',409);await mkdir(await safe(dest,true));
    const type=['player','character','level'][depth];await write(dest+'/索引.json',JSON.stringify({id:randomUUID(),type,name:body.name,linkedPlayerIds:[]},null,2));
    if(type==='level')for(const filename of ['选择.md','能力.md'])await write(dest+'/'+filename,playerMarkdown(filename,{name:parent.split('/').at(-1),level:body.name}));
   }else if(body.action==='save'){
    if(entry?.type!=='file'||typeof body.text!=='string'||Buffer.byteLength(body.text)>200000)fail('文件或内容无效。');const {meta}=parsePlayerMarkdown(body.text,entry.name);const old=parsePlayerMarkdown((await read(path)).text,entry.name);if(meta.id!==old.meta.id)fail('不能更改条目ID。');await write(path,body.text);
   }else if(body.action==='bind'){
    if(entry?.type!=='player'||!Array.isArray(body.playerIds)||body.playerIds.length>100)fail('请选择本团已有玩家。');
    const info=await json(path+'/索引.json').catch(missingIndex({id:randomUUID(),type:entry.type,name:entry.name}));
    const existing=Array.isArray(info.linkedPlayerIds)?info.linkedPlayerIds:[];
    if(body.playerIds.some(id=>!body.allowedPlayerIds.includes(id)&&!existing.includes(id)))fail('只能添加本团已有玩家。');
    await write(path+'/索引.json',JSON.stringify({...info,linkedPlayerIds:[...new Set(body.playerIds)]},null,2));
   }else if(['move','copy','rename'].includes(body.action)){
    if(!entry||entry.type==='file')fail('请选择文件夹。');const depth=path.split('/').length, destinationParent=body.action==='rename'?path.split('/').slice(0,-1).join('/'):parent;
    if((destinationParent?destinationParent.split('/').length:0)!==depth-1)fail('只能移动到同类上级目录。');if(destinationParent&&!before.entries.some(e=>e.path===destinationParent&&e.type!=='file'))fail('目标目录不存在。',404);
    const name=body.name||entry.name;if(!segment(name))fail('名称无效。');const dest=[destinationParent,name].filter(Boolean).join('/');if(before.entries.some(e=>e.path===dest))fail('同名目录已存在。',409);
    await json(path+'/索引.json').catch(missingIndex({}));
    if(body.action==='copy'){
     if(before.issues.some(issue=>issue.path===path||issue.path.startsWith(path+'/')))fail('源目录含不可读取文件，未复制。');
     // Check every file before copying, including files not used by the reader.
     async function check(p){for(const ent of await readdir(await safe(p),{withFileTypes:true})){await safe(p+'/'+ent.name);if(ent.isDirectory())await check(p+'/'+ent.name);}}
     await check(path);const stage=join(dirname(await safe(dest,true)),'.copy-'+randomUUID());await cp(await safe(path),stage,{recursive:true,errorOnExist:true,force:false});
     async function renew(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const p=join(dir,ent.name);if(ent.isDirectory())await renew(p);else if(ent.name==='索引.json'){const info=JSON.parse(await readFile(p,'utf8'));info.id=randomUUID();info.linkedPlayerIds=[];await writeFile(p,JSON.stringify(info,null,2));}else if(/\.md$/.test(ent.name)){const text=await readFile(p,'utf8');await writeFile(p,text.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)/,(_,a,b,c)=>a+JSON.stringify({...JSON.parse(b),id:'character-'+randomUUID()},null,2)+c));}}}
     await renew(stage);await rename(stage,await safe(dest,true));
    }else await rename(await safe(path),await safe(dest,true));
    const info=await json(dest+'/索引.json').catch(missingIndex({id:randomUUID(),type:entry.type}));await write(dest+'/索引.json',JSON.stringify({...info,name},null,2));
   }else fail('不支持的玩家操作。');return tree();
  }finally{await handle.close();await unlink(lock);}
 });queue=next;return next;}
 return{tree,read,operation,records};
}

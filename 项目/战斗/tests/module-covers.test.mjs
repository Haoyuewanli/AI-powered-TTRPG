import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {startApp} from '../server.mjs';
import {fixture} from './fixture.mjs';

const output=fileURLToPath(new URL('../../../开发记录/临时/模组封面HTTP检查/',import.meta.url));
const crop={x:.2890625,y:0,width:.421875,height:1};

function png(width=16,height=9,seed=0){
  const crc32=bytes=>{
    let crc=0xffffffff;
    for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    return (crc^0xffffffff)>>>0;
  };
  const chunk=(kind,data)=>{
    const name=Buffer.from(kind),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);
  };
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const pixels=Buffer.alloc(height*(width*4+1));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const offset=y*(width*4+1)+1+x*4;
    pixels[offset]=(x*13+seed*31)%256;pixels[offset+1]=(y*23+seed*17)%256;pixels[offset+2]=160;pixels[offset+3]=255;
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}

async function setup({config}={}){
  await mkdir(output,{recursive:true});const root=await mkdtemp(join(output,'case-'));
  const campaignDir=join(root,'战斗'),modulesDir=join(root,'模组'),moduleDir=join(modulesDir,'分类 A','模组 A');
  await mkdir(moduleDir,{recursive:true});const source=png(),coverFile=join(moduleDir,'模组封面.png'),configFile=join(modulesDir,'cover-crops.json');
  await writeFile(coverFile,source);await writeFile(join(moduleDir,'秘密.txt'),'SYNTHETIC_MODULE_PRIVATE_FILE');
  await writeFile(join(moduleDir,'模组封面.svg'),'<svg>SYNTHETIC_SVG_NOT_ALLOWED</svg>');
  if(config!==undefined)await writeFile(configFile,config);
  const app=await startApp({campaignDir,modulesDir,port:0,initial:fixture,sharingOptions:{host:'127.0.0.1',interfaces:()=>({})}});
  return {app,root,campaignDir,modulesDir,moduleDir,coverFile,configFile,source};
}
const request=(base,path,body,token,extraHeaders={})=>fetch(base+path,{
  method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`} : {}),...extraHeaders},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
});
async function login(app,id='DM'){
  const response=await request(app.url,'/api/login',{id});assert.equal(response.status,200,await response.clone().text());return (await response.json()).token;
}
async function catalog(app,token){
  const response=await request(app.url,'/api/module-covers',undefined,token);assert.equal(response.status,200,await response.clone().text());return response.json();
}
const modules=data=>data.groups.flatMap(group=>group.modules);
const findModule=data=>modules(data).find(item=>item.relativeDirectory==='分类 A/模组 A');
const command=(data,item,overrides={})=>({moduleId:item.id,expectedConfigRevision:data.configRevision,expectedCoverRevision:item.cover.revision,mode:'crop',crop:{...crop},...overrides});

test('module cover HTTP tool reuses local DM sessions, saves one JSON and leaves battle state and source bytes unchanged',async()=>{
  const setupData=await setup();let {app}=setupData;
  try{
    const before=app.store.state;
    assert.equal((await request(app.url,'/api/module-covers')).status,401);
    assert.equal((await request(app.url,'/api/module-covers',{})).status,401);
    assert.equal((await request(app.url,'/api/module-covers/image?moduleId=unknown')).status,401);
    const player=await login(app,'player-1');
    assert.equal((await request(app.url,'/api/module-covers',undefined,player)).status,403);
    assert.equal((await request(app.url,'/api/module-covers',{},player)).status,403);
    assert.equal((await request(app.url,'/api/module-covers/image?moduleId=unknown',undefined,player)).status,403);
    const dm=await login(app),data=await catalog(app,dm),item=findModule(data);
    assert(item);assert.equal(item.name,'模组 A');assert.equal(item.cover.file,'模组封面.png');assert.equal(item.cover.width,16);assert.equal(item.cover.height,9);assert.equal(item.cover.mime,'image/png');
    const imagePath='/api/module-covers/image?moduleId='+encodeURIComponent(item.id);
    const image=await request(app.url,imagePath,undefined,dm);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal(image.headers.get('x-content-type-options'),'nosniff');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()),setupData.source);
    assert.equal((await request(app.url,imagePath+'&token='+encodeURIComponent(dm))).status,401,'URL must not be an authentication channel');
    assert.equal((await request(app.url,'/api/module-covers?token='+encodeURIComponent(dm))).status,401);
    assert.equal((await request(app.url,'/api/module-covers',undefined,dm,{Origin:'https://other.invalid'})).status,403);
    for(const candidate of ['unknown-module','../../秘密.txt','分类 A/模组 A/秘密.txt','C:\\outside\\模组封面.png']){
      const response=await request(app.url,'/api/module-covers/image?moduleId='+encodeURIComponent(candidate),undefined,dm);
      assert([400,404].includes(response.status),`${candidate}: ${response.status}`);assert(!(await response.text()).includes('SYNTHETIC_MODULE_PRIVATE_FILE'));
    }
    for(const path of ['/cover-crops.json','/分类%20A/模组%20A/秘密.txt','/分类%20A/模组%20A/模组封面.svg'])assert.equal((await request(app.url,path)).status,404);
    const saved=await request(app.url,'/api/module-covers',command(data,item),dm);assert.equal(saved.status,200,await saved.clone().text());
    const next=await saved.json(),nextItem=findModule(next);assert(nextItem.crop);
    const disk=JSON.parse(await readFile(setupData.configFile,'utf8'));assert.equal(disk.schemaVersion,1);assert.deepEqual(disk.frameAspectRatio,[3,4]);
    const entry=disk.covers[item.relativeDirectory];assert.equal(entry.file,'模组封面.png');assert.deepEqual(entry.sourceSize,{width:16,height:9});assert.equal(entry.mode,'crop');assert.deepEqual(entry.crop,crop);
    assert.deepEqual(await readFile(setupData.coverFile),setupData.source);assert.deepEqual(app.store.state,before,'catalog, image and crop saves must not settle a game action');
    await app.close();app=await startApp({campaignDir:setupData.campaignDir,modulesDir:setupData.modulesDir,port:0,initial:()=>{throw new Error('Must restore existing synthetic progress');}});
    const restarted=await catalog(app,await login(app));assert(findModule(restarted).crop);assert.deepEqual(JSON.parse(await readFile(setupData.configFile,'utf8')).covers[item.relativeDirectory],entry);assert.deepEqual(app.store.state,before);
  }finally{await app.close();}
});

test('module crop HTTP rejects stale config, stale image and concurrent writes without overwriting external files',async()=>{
  const {app,coverFile,configFile,source}=await setup();
  try{
    const dm=await login(app),before=app.store.state,data=await catalog(app,dm),item=findModule(data),payload=command(data,item);
    const replies=await Promise.all([
      request(app.url,'/api/module-covers',payload,dm),
      request(app.url,'/api/module-covers',{...payload,crop:{...crop,x:.2}},dm)
    ]);
    assert.deepEqual(replies.map(response=>response.status).sort(),[200,409]);
    const committed=await readFile(configFile,'utf8');assert(['0.2890625','0.2'].some(value=>committed.includes(value)));assert.deepEqual(await readFile(coverFile),source);
    const staleConfig=await request(app.url,'/api/module-covers',payload,dm);assert.equal(staleConfig.status,409);assert.equal(await readFile(configFile,'utf8'),committed);
    const fresh=await catalog(app,dm),freshItem=findModule(fresh),replacement=png(16,9,2);await writeFile(coverFile,replacement);
    const staleImage=await request(app.url,'/api/module-covers',command(fresh,freshItem),dm);assert.equal(staleImage.status,409);assert.equal(await readFile(configFile,'utf8'),committed);assert.deepEqual(await readFile(coverFile),replacement);
    const replaced=await catalog(app,dm),replacedItem=findModule(replaced);assert.notEqual(replacedItem.cover.revision,freshItem.cover.revision);
    const externallyEdited=JSON.parse(committed);externallyEdited.covers[item.relativeDirectory].crop.x=.1;const externalRaw=JSON.stringify(externallyEdited,null,2)+'\n';await writeFile(configFile,externalRaw);
    const externalConflict=await request(app.url,'/api/module-covers',command(replaced,replacedItem),dm);assert.equal(externalConflict.status,409);assert.equal(await readFile(configFile,'utf8'),externalRaw);
    assert.deepEqual(app.store.state,before);
  }finally{await app.close();}
});

test('module management pages and APIs are absent from the player gateway, even with local DM credentials',async()=>{
  const {app}=await setup();
  try{
    const before=app.store.state,dm=await login(app),inviteResponse=await request(app.url,'/api/sharing',{operation:'invite',actorId:'pc-001'},dm);assert.equal(inviteResponse.status,200,await inviteResponse.clone().text());
    const shared=await inviteResponse.json(),joined=await request(shared.localUrl,'/api/join',{invite:shared.invite.token});assert.equal(joined.status,200);const player=(await joined.json()).token;
    for(const path of ['/module-covers','/module-covers.mjs','/module-covers.css']){
      const response=await request(shared.localUrl,path,undefined,player);assert.equal(response.status,404,path);assert(!(await response.text()).includes('SYNTHETIC_MODULE_PRIVATE_FILE'));
    }
    for(const token of [undefined,dm,player]){
      for(const [path,body] of [['/api/module-covers',undefined],['/api/module-covers',{}],['/api/module-covers/image?moduleId=unknown',undefined]])assert.equal((await request(shared.localUrl,path,body,token)).status,403,path);
    }
    const playerState=await request(shared.localUrl,'/api/state',undefined,player);assert.equal(playerState.status,200);assert(!(await playerState.text()).includes('cover-crops.json'));assert.deepEqual(app.store.state,before);
  }finally{await app.close();}
});

test('invalid module crop JSON does not prevent battle startup or replace the original config',async()=>{
  const invalid='{ invalid synthetic crop JSON';const {app,configFile}=await setup({config:invalid});
  try{
    const before=app.store.state,dm=await login(app),state=await request(app.url,'/api/state',undefined,dm);assert.equal(state.status,200);
    const data=await catalog(app,dm);assert(data.configIssue);assert.equal(await readFile(configFile,'utf8'),invalid);
    const item=findModule(data);assert(item?.cover);const rejected=await request(app.url,'/api/module-covers',command(data,item),dm);assert.equal(rejected.status,409);assert.equal(await readFile(configFile,'utf8'),invalid);assert.deepEqual(app.store.state,before);
  }finally{await app.close();}
});

import { readFile, writeFile, mkdir, rename, rm, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { indexInput } from './inventory.mjs';
import { readInputFile, sha256,assertOutputTarget } from './io.mjs';
import { validatePlan } from './validate.mjs';
import { renderHtml } from './html.mjs';
const exec=promisify(execFile);
const within=(base,target)=>{const p=relative(base,target);return p===''||(!isAbsolute(p)&&p!=='..'&&!p.startsWith('..\\')&&!p.startsWith('../'));};
function ranges(text,refs){const lines=text.split(/\r?\n/);return refs.map(r=>lines.slice(r.start-1,r.end).join('\n')).join('\n\n');}
async function cropImage(path,crop){
  const script=`Add-Type -AssemblyName System.Drawing
$im=[System.Drawing.Bitmap]::FromFile('${path.replace(/'/g,"''")}')
$part=$null;$mem=$null
try{$part=$im.Clone([System.Drawing.Rectangle]::new(${crop.x},${crop.y},${crop.w},${crop.h}),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb);$mem=[IO.MemoryStream]::new();$part.Save($mem,[System.Drawing.Imaging.ImageFormat]::Png);[Convert]::ToBase64String($mem.ToArray())}finally{if($mem){$mem.Dispose()};if($part){$part.Dispose()};$im.Dispose()}`;
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:20000,maxBuffer:32*1024*1024});
  return Buffer.from(stdout.trim(),'base64');
}
export async function inspectPlan({inputDir,md,images='images',plan}){
  const index=await indexInput({inputDir,md,images});
  const {bytes}=await readInputFile(inputDir,md);const text=bytes.toString('utf8');
  if(sha256(bytes)!==index.md.sha256)throw Error('原文在盘点后发生变化，请重新盘点');
  return {index,text,report:validatePlan(plan,index,text)};
}
export async function buildPackage({inputDir,md,images='images',plan,outDir}){
  const {index,text,report}=await inspectPlan({inputDir,md,images,plan});
  if(!report.ok)throw Error('地图计划校验失败：'+report.errors.join('；'));
  const inputRoot=await realpath(inputDir),output=resolve(outDir);
  await assertOutputTarget(output,inputRoot,{directory:true});
  await mkdir(dirname(output),{recursive:true});
  const actualParent=await realpath(dirname(output));
  if(actualParent!==resolve(dirname(output)))throw Error('输出父目录含链接，请使用真实路径');
  try{await realpath(output);throw Error('输出已存在，使用新的批次目录，不覆盖旧结果');}catch(error){if(error.code!=='ENOENT')throw error;}
  const assets=new Map(),sources=Object.create(null), decisions=new Map(plan.images.map(i=>[i.path,i]));
  const nodes=[];
  for(const node of plan.nodes){
    const variants=[];let dimensions={width:280,height:120};
    for(const variant of node.variants||[]){
      const decision=decisions.get(variant.image);
      if(decision?.decision!=='map'||decision.evidence?.method!=='direct-visual'||variant.evidence?.method!=='direct-visual')continue;
      const file=await readInputFile(inputDir,variant.image), record=index.images.find(i=>i.path===variant.image);
      if(sha256(file.bytes)!==record.sha256)throw Error('原图在盘点后发生变化：'+variant.image);
      const bytes=variant.crop?await cropImage(file.path,variant.crop):file.bytes;
      const mime=variant.crop?'image/png':({jpeg:'image/jpeg',jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'}[record.format.toLowerCase()]);
      if(!mime)throw Error('不支持图像格式：'+record.format);
      const key='/assets/a'+sha256(bytes).slice(0,24);assets.set(key,{bytes,mime});
      variants.push({id:variant.id,label:decision.audience==='unknown'?'用途待核对':variant.id==='player'?'玩家原图':variant.id==='dm'?'主持原图':variant.id,url:key});
      if(variants.length===1)dimensions={width:variant.crop?.w||record.width,height:variant.crop?.h||record.height};
    }
    const primaryId=node.primaryVariantId||node.variants?.[0]?.id;
    const primary=variants.find(v=>v.id===primaryId);if(primary){variants.splice(variants.indexOf(primary),1);variants.unshift(primary);const v=node.variants.find(v=>v.id===primaryId),r=index.images.find(i=>i.path===v.image);dimensions={width:v.crop?.w||r.width,height:v.crop?.h||r.height};}
    const description=ranges(text,node.source), start=Math.min(...node.source.map(r=>r.start)),end=Math.max(...node.source.map(r=>r.end));
    sources[node.id]=node.source.map(r=>`【原文第${r.start}～${r.end}行】\n`+ranges(text,[r])).join('\n\n');
    nodes.push({id:node.id,parentId:node.parentId,name:node.name+(node.kind==='image'&&!variants.length?'（图片待核对）':''),kind:variants.length?'image':'text',...dimensions,description,sensory:node.sensory.text,source:{start,end,label:node.source.map(r=>`原文第${r.start}～${r.end}行`).join('、')},variants,imageUrl:variants[0]?.url,hotspots:(node.hotspots||[]).filter(h=>variants.length&&(h.variantId||primaryId)===variants[0].id&&Number.isFinite(h.x)&&Number.isFinite(h.y)&&h.evidence?.method==='direct-visual').map(h=>({x:h.x,y:h.y,targetId:h.targetId,label:h.label}))});
  }
  const moduleData={id:plan.module.id,title:plan.module.title,version:plan.module.version,players:[],capabilities:{sharing:false,offline:true},nodes};
  const html=await renderHtml({moduleData,assets,sources});
  const after=await indexInput({inputDir,md,images});
  if(after.md.sha256!==index.md.sha256||JSON.stringify(after.images)!==JSON.stringify(index.images))throw Error('原件在构建期间变化，未落盘，请重新盘点');
  const extension=asset=>({'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif'}[asset.mime]);
  const stage=output+'.stage-'+randomUUID();await mkdir(stage);
  try{
    const contents={
      '地图计划.json':JSON.stringify(plan,null,2),'输入索引.json':JSON.stringify(index,null,2),
      '校验.json':JSON.stringify({...report,reviewStatus:'candidate',note:'结构通过不代表人工内容验收；direct-visual是计划作者声明的视觉证据。'},null,2),
      '地图包.json':JSON.stringify({schemaVersion:1,moduleData,source:{md:index.md,images:index.images},assetFiles:Object.fromEntries([...assets].map(([key,a])=>[key,{path:'图片/'+key.slice(8)+extension(a),mime:a.mime,sha256:sha256(a.bytes)}]))},null,2),
      '地图内容.md':nodes.map(n=>`## ${n.name}\n\n### 模组描述\n\n${n.description}\n\n### 移步换景（主持提词）\n\n${n.sensory}\n`).join('\n'),
      '地图.html':html
    };
    await mkdir(join(stage,'图片'));
    for(const [name,content] of Object.entries(contents))await writeFile(join(stage,name),content,{flag:'wx'});
    for(const [key,asset] of assets)await writeFile(join(stage,'图片',key.slice(8)+extension(asset)),asset.bytes,{flag:'wx'});
    await rename(stage,output);
  }catch(error){if(within(dirname(output),stage))await rm(stage,{recursive:true,force:true});throw error;}
  return {output,nodes:nodes.length,images:assets.size,hotspots:nodes.reduce((n,x)=>n+x.hotspots.length,0),pending:report.pending,htmlBytes:Buffer.byteLength(html)};
}

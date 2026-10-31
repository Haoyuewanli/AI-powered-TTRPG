import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { packageDigest, validateReview, consoleData, consoleLinks, localLinkTarget, cacheKey } from './lib/review-contract.mjs';

// 合成内容留在临时目录，失败时保留现场。这里的DOM替身不等于浏览器验收。
const root = mkdtempSync(join(tmpdir(), 'module-tools-'));
const toolDir = dirname(fileURLToPath(import.meta.url));
const project = join(root, '项目');
const stage = join(root, '阶段区');
const model = join(root, '中间数据');
const moduleRel = '模组/预处理/测试分类/第二本合成模组';
const moduleId = 'synthetic-other-module';
const batchId = 'synthetic-batch';
const mdRel = '输入/合成.md';
const source = {mdPath:mdRel,heading:'合成',lines:[1,3],verification:'candidate'};
const w = (file, value) => { mkdirSync(dirname(file), {recursive:true}); writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value,null,2)); };
const j = file => JSON.parse(readFileSync(file,'utf8'));
const results = [];
const test = async (name, fn) => { await fn(); results.push({name,ok:true}); };
const run = (name, args) => spawnSync(process.execPath,[join(toolDir,name),...args],{encoding:'utf8'});
const mustRun = (name,args) => { const r=run(name,args);assert.equal(r.status,0,r.stdout+r.stderr);return r; };
const hashTree = dir => Object.fromEntries(readdirSync(dir,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{const file=join(e.parentPath,e.name);return [file,packageDigest(readFileSync(file))];}));

try {
  const text='# 合成\n\n<script>不执行</script>\n';
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  w(join(project,mdRel),text);w(join(project,'输入/自选封面.png'),png);
  const image={name:'自选封面.png',relativePath:'输入/自选封面.png',bytes:png.length,sha256:packageDigest(png),width:1,height:1,format:'png'};
  const inventory={md:{relativePath:mdRel,bytes:Buffer.byteLength(text),sha256:packageDigest(text),lineCount:4,nonEmptyLineCount:2,nonEmptyLines:[{n:1,text:'# 合成'},{n:3,text:'正文'}]},images:[image],imageCount:1,unreferencedImages:[],missingReferences:[]};
  w(join(root,'inventory.json'),inventory);w(join(root,'index.json'),{entries:[]});
  const node=(id,ch)=>({id,chapterId:ch,title:id,type:'scene',description:'完整描述'+id+'尾部证据'.repeat(70),conditions:[],optional:null,source,mapIds:[],resourceIds:['synthetic-resource'],next:[],dmNotes:'',readAloud:null,mechanicsReferences:[]});
  const nodes=[node('node-one','chapter-one'),node('node-two','chapter-two')];
  const newResource={formatVersion:1,id:'synthetic-resource',name:'合成资源',resourceType:'故事',moduleIds:[moduleId],referenceBase:'project',bodyPath:'资源/故事/H/合成资源__synthetic-resource/正文.md',source,edition:{rulesFamily:'custom',year:null,evidence:'合成叙事'},availability:{enabled:false,status:'reference-only',requiresDmApproval:true},reviewStatus:'candidate',publicCandidate:{},dmOnly:{},imagePaths:[]};
  w(join(model,'model-meta.json'),{meta:{moduleId,batchId,title:'另一部测试作品',category:'测试分类',sourceVersion:'test-v2',inputMd:mdRel,targetRules:'D&D 2024',capabilities:{}},chapters:[{id:'chapter-one',title:'甲',source},{id:'chapter-two',title:'乙',source}],nodeFiles:['arbitrary-nodes.json'],coverSourceName:image.name,warnings:[],overviewCapabilityLines:[],overviewUsageLines:[]});
  w(join(model,'arbitrary-nodes.json'),{nodes});
  w(join(model,'model-maps.json'),{maps:[{id:'synthetic-map',resourceId:null,name:'图像候选',proposedName:null,mappingStatus:'unresolved',mappingEvidence:[],path:moduleRel+'/故事/原始资料/images/'+image.name,originalPath:image.relativePath,referenceBase:'project',audience:'unreviewed',width:1,height:1,source,reviewStatus:'candidate',locations:[]}],locationCandidates:[]});
  w(join(model,'model-resources.json'),{newResources:[newResource],resourceCandidates:[],resourceMatching:[{resourceId:newResource.id,name:newResource.name,decision:'new',idExists:true,contentStatus:'confirmed',versionStatus:'none',evidence:'合成来源'}],resourceBodies:{[newResource.id]:'# 自定义资源正文\n\n只来自中间数据。\n'}});
  w(join(model,'model-encounters.json'),{encounters:[],dialogues:[]});
  w(join(model,'model-images.json'),{images:[{name:image.name,refLine:1,usage:'candidate',mapId:'synthetic-map'}]});
  w(join(model,'model-coverage.json'),{coverage:[{start:1,end:4,destType:'node',destId:'node-one',reason:'合成覆盖'}]});
  const buildArgs=['--project-root',project,'--input-dir',join(project,'输入'),'--inventory',join(root,'inventory.json'),'--model-dir',model,'--stage-dir',stage,'--module-rel',moduleRel,'--cover-name','自选封面.png'];
  const pkgRoot=join(stage,'包');const dir=join(pkgRoot,moduleRel);const reviewPath=join(dir,'校验/人工审核.json');
  const validateArgs=['--project-root',project,'--package-dir',pkgRoot,'--module-rel',moduleRel,'--inventory',join(root,'inventory.json'),'--resources-index',join(root,'index.json'),'--stage-root',stage,'--mode','staging'];
  const consoleArgs=['--project-root',project,'--package-dir',pkgRoot,'--module-rel',moduleRel,'--inventory',join(root,'inventory.json'),'--out-dir',join(dir,'校验')];
  await test('另一模组、自选章节文件与封面、资源正文来自中间数据',()=>{
    mustRun('build-package.mjs',buildArgs);
    assert.equal(j(join(dir,'预处理.json')).storyNodes.length,2);
    assert.equal(readFileSync(join(stage,'新资源',newResource.bodyPath),'utf8'),'# 自定义资源正文\n\n只来自中间数据。\n');
    assert.ok(readFileSync(join(dir,'故事/模组概览.md'),'utf8').includes('另一部测试作品'));
  });
  await test('再次生成保留空审核文件原字节',()=>{
    const hash=packageDigest(readFileSync(reviewPath));mustRun('build-package.mjs',buildArgs);assert.equal(packageDigest(readFileSync(reviewPath)),hash);
  });
  await test('生成、审核台、校验命令形成可复用闭环',()=>{
    const first=run('validate-package.mjs',[...validateArgs,'--write-results']);assert.equal(first.status,1);
    assert.ok(JSON.parse(first.stdout).blockingErrors.every(e=>e.id==='review-console'), first.stdout);
    mustRun('build-review-console.mjs',consoleArgs);mustRun('validate-package.mjs',validateArgs);
  });
  let html=readFileSync(join(dir,'校验/审核台.html'),'utf8');let data=consoleData(html);
  await test('实际生成器产生的动态链接全部指向存在文件',()=>{
    for(const link of consoleLinks(data)) localLinkTarget(project,moduleRel+'/校验/审核台.html',link,rel=>join(pkgRoot,rel));
  });

  function page(code, storage=new Map()) {
    const elements=new Map();const docEvents={};let exported;
    const elem=id=>({id,innerHTML:'',value:'',listeners:{},classList:{toggle(){}},addEventListener(name,fn){this.listeners[name]=fn;},appendChild(){},remove(){},click(){this.listeners.click?.();}});
    const document={getElementById(id){if(!elements.has(id))elements.set(id,elem(id));return elements.get(id);},querySelectorAll(){return [];},addEventListener(n,f){docEvents[n]=f;},createElement(){const e=elem('');Object.defineProperty(e,'textContent',{set(v){e.innerHTML=String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}});return e;},body:{appendChild(){}}};
    const ctx=vm.createContext({document,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},Blob,URL:{createObjectURL(blob){exported=blob;return 'blob:synthetic';},revokeObjectURL(){}},setTimeout:fn=>fn()});
    vm.runInContext(code.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
    return {elements,ctx,storage,docEvents,getExport:()=>exported};
  }
  const page1=page(html);
  await test('页面逻辑完整描述与文本转义',()=>{
    const list=page1.elements.get('nodeList').innerHTML;
    assert.ok(list.includes(nodes[0].description.replace(/</g,'&lt;').replace(/>/g,'&gt;')));
    assert.ok(!list.includes('<script>不执行'));
    assert.ok(list.includes('&lt;script&gt;不执行&lt;/script&gt;'));
    assert.ok(page1.elements.get('overview').innerHTML.includes(data.originalMdLink));
  });
  await test('页面逻辑章节筛选只显示对应节点',()=>{
    page1.elements.get('chapterSel').listeners.change({target:{value:'chapter-two'}});
    const list=page1.elements.get('nodeList').innerHTML;assert.ok(list.includes('node-two'));assert.ok(!list.includes('node-one'));
  });
  await test('页面逻辑导出选择备注并通过正式校验',async()=>{
    page1.docEvents.click({target:{closest:()=>({dataset:{id:'map:synthetic-map',v:'needfix'}})}});
    page1.docEvents.input({target:{matches:()=>true,dataset:{id:'map:synthetic-map'},value:'合成备注"<>'}});
    page1.elements.get('doExport').click();
    const review=JSON.parse(await page1.getExport().text());
    assert.equal(review.entries[0].note,'合成备注"<>');validateReview(review,j(join(dir,'预处理.json')),data.packageSha256);
    w(reviewPath,review);mustRun('validate-package.mjs',validateArgs);
  });
  await test('页面逻辑重开恢复缓存，跨批次和跨模组不串记录',()=>{
    const same=page(html,page1.storage);assert.ok(same.elements.get('export').innerHTML.includes('合成备注'));
    for (const field of ['moduleId','batchId','packageSha256']) {
      const fresh=structuredClone(data);fresh[field]+='other';fresh.cacheKey=cacheKey(fresh.moduleId,fresh.batchId,fresh.packageSha256);
      const other=page(html.replace(/^const DATA = .+;$/m,()=> 'const DATA = '+JSON.stringify(fresh).replace(/</g,'\\u003c')+';'),page1.storage);
      assert.ok(other.elements.get('export').innerHTML.includes('尚未标记'));
    }
  });
  await test('生成器拒绝覆盖非空审核及其所在包',()=>{
    const before=hashTree(stage);const runResult=run('build-package.mjs',buildArgs);assert.equal(runResult.status,1);assert.deepEqual(hashTree(stage),before);
  });
  await test('审核台重建读入已保存审核且不改原文件',()=>{
    const before=packageDigest(readFileSync(reviewPath));mustRun('build-review-console.mjs',consoleArgs);
    const d=consoleData(readFileSync(join(dir,'校验/审核台.html'),'utf8'));assert.equal(d.initialReview.length,1);
    assert.equal(packageDigest(readFileSync(reviewPath)),before);
  });
  console.log(JSON.stringify({passed:results.length,failed:0,results,fixtureRoot:root,browserTested:false},null,2));
} catch(e) {
  console.error(e);console.log(JSON.stringify({passed:results.length,failed:1,results,fixtureRoot:root,browserTested:false},null,2));process.exitCode=1;
}

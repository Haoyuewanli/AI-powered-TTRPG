import { readFile,writeFile,mkdir,realpath } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { indexInput } from './lib/inventory.mjs';
import { inspectPlan,buildPackage } from './lib/build.mjs';
import {assertOutputTarget} from './lib/io.mjs';
const [command,...args]=process.argv.slice(2), values=Object.create(null);
try{
 for(let i=0;i<args.length;i+=2){if(!/^--[a-z-]+$/.test(args[i])||!args[i+1]||Object.hasOwn(values,args[i]))throw Error('参数须为 --名称 值');values[args[i]]=args[i+1];}
 const required=names=>{for(const name of names)if(!values['--'+name])throw Error('缺少 --'+name);};
 const write=async (path,value)=>{
  const target=resolve(path),parent=dirname(target);
  await assertOutputTarget(target,values['--input-dir']);
  await mkdir(parent,{recursive:true});if(await realpath(parent)!==parent)throw Error('输出父目录含链接，请使用真实路径');
  await writeFile(target,JSON.stringify(value,null,2),{flag:'wx'});
 };
 if(command==='index'){
  required(['input-dir','md','out']);const index=await indexInput({inputDir:values['--input-dir'],md:values['--md'],images:values['--images']||'images'});await write(values['--out'],index);console.log(JSON.stringify({md:index.md,images:index.images.length,warnings:index.warnings,out:values['--out']}));
 }else if(command==='template'){
  required(['index','input-dir','id','title','version','out']);const index=JSON.parse(await readFile(values['--index'],'utf8'));
  await write(values['--out'],{schemaVersion:1,module:{id:values['--id'],title:values['--title'],version:values['--version']},source:{mdSha256:index.md.sha256},images:index.images.map(i=>({path:i.path,sha256:i.sha256,decision:'pending',audience:'unknown',evidence:{method:'unknown',note:'待实际查看图片'}})),nodes:[]});console.log('模板已生成，节点和视觉证据需由本次会话整理。');
 }else if(command==='validate'||command==='build'){
  required(['input-dir','md','plan']);const options={inputDir:values['--input-dir'],md:values['--md'],images:values['--images']||'images',plan:JSON.parse(await readFile(values['--plan'],'utf8'))};
  if(command==='validate'){const {report}=await inspectPlan(options);console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;}
  else{required(['out']);console.log(JSON.stringify(await buildPackage({...options,outDir:values['--out']}),null,2));}
 }else throw Error('命令：index、template、validate、build。用法见README.md。');
}catch(error){console.error(error.message);process.exitCode=1;}

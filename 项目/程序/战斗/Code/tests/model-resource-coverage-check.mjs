import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {MODEL_CLASSES,MODEL_SPECIES,modelMatrix} from '../data/model-catalog.mjs';

const project=fileURLToPath(new URL('../../../../',import.meta.url)),coverage={species:[],classes:[],excluded:[],uncovered:[]};
const aliases=new Map([['纯血蛇人','蛇人'],['灰矮人角色（玩家可选）','灰矮人']]);
for(const kind of ['种族','职业'])for(const filename of await readdir(join(project,'资源',kind))){
 if(!filename.endsWith('.md')||filename==='示例模版.md')continue;
 const raw=await readFile(join(project,'资源',kind,filename),'utf8'),match=raw.replace(/^\uFEFF/,'').match(/^---\r?\n([\s\S]*?)\r?\n---/);
 if(!match)throw Error('Missing frontmatter: '+filename);const meta=JSON.parse(match[1]);
 if(kind==='种族'){
  const source=meta.source?.title||meta.name;
  if(/亚种|身高与体重|怪物冒险者|吉斯人角色/.test(source)){coverage.excluded.push({name:meta.name,reason:/亚种/.test(source)?'明确子种族汇总':'总览或说明页'});continue;}
  let canonical=source.replace(/（旧版）|\.html$/g,'').trim();canonical=aliases.get(canonical)||canonical;
  const model=MODEL_SPECIES.find(item=>item.name===canonical);
  if(!model)coverage.uncovered.push({kind,name:meta.name,title:source});else if(!coverage.species.includes(model.id))coverage.species.push(model.id);
 }else{
  const className=/\b(Barbarian|Bard|Cleric|Druid|Fighter|Monk|Paladin|Ranger|Rogue|Sorcerer|Warlock|Wizard|Artificer)$/.exec(meta.name);
  if(!className)continue;const id=className[1].toLowerCase();if(!MODEL_CLASSES.some(item=>item.id===id))coverage.uncovered.push({kind,name:meta.name});else if(!coverage.classes.includes(id))coverage.classes.push(id);
 }
}
assert.deepEqual(coverage.uncovered,[],'本地独立种族或基础职业存在未覆盖项');
assert.equal(coverage.species.length,MODEL_SPECIES.length);assert.equal(coverage.classes.length,MODEL_CLASSES.length);
const result={speciesCount:coverage.species.length,classCount:coverage.classes.length,modelCount:modelMatrix().length,coreModelCount:modelMatrix({coreOnly:true}).length,...coverage};
const out=join(project,'../开发记录/临时/战斗模型检查');await mkdir(out,{recursive:true});await writeFile(join(out,'resource-coverage.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({species:result.speciesCount,classes:result.classCount,models:result.modelCount,coreModels:result.coreModelCount,excluded:result.excluded,uncovered:result.uncovered},null,2));

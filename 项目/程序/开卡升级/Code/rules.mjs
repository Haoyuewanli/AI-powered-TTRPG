import { abilities, skills, classProgression, spellCapacity, findEntry } from './library.mjs';
import { equipment } from './equipment.mjs';

export const mod = n => Math.floor((n-10)/2);
export const pb = n => 2+Math.floor((n-1)/4);
export const split = text => String(text||'').normalize('NFKC').split(/[,，、;；\n]+/).map(s=>s.trim()).filter(Boolean);
export const skillName = text => ({特技:'体操',医疗:'医药'}[text]||text);
export const STAGES = ['角色方向','基础选择','4级成长','8级成长','目标等级成长','法术与能力','装备'];
export const instruments = ['风笛','鼓','扬琴','长笛','鲁特琴','里拉琴','号角','排箫','提琴','唢呐'];
export const artisanTools = ['炼金工具','酿酒工具','书法工具','木匠工具','制图工具','鞋匠工具','厨师工具','玻璃工工具','珠宝工具','皮匠工具','石匠工具','画家工具','陶匠工具','铁匠工具','修补工具','织布工具','木雕工具'];
export const tools = [...artisanTools,...instruments,'草药工具','盗贼工具','易容工具','文书伪造工具','领航工具','制毒工具','骰子','龙棋','纸牌','三龙牌'];
export const languages = ['通用手语','龙语','矮人语','精灵语','巨人语','侏儒语','地精语','半身人语','兽人语'];
const castAbility = {吟游诗人:'魅力',圣武士:'魅力',德鲁伊:'感知',术士:'魅力',法师:'智力',游侠:'感知',牧师:'感知',魔契师:'魅力'};
const featStages = n=>n<=4?2:n<=8?3:4;
const asNumber = x=>Number(String(x).normalize('NFKC'));
const fraction = s => s?.includes('/') ? Number(s.split('/')[0])/Number(s.split('/')[1]) : Number(s);
const names = es => es.map(e=>e.name);
const trait = (entry, label) => entry.tables[0]?.rows.find(r=>r[0].includes(label))?.[1] || '';
const line = (e,label) => e.body.match(new RegExp(label+'[：:]([^\\n]+)'))?.[1]||'';
const norm = s=>s.replace(/\s+/g,'');

export function featLevels(c, level) {
  return Array.from({length:level},(_,i)=>i+1).filter(n=>/属性值提升|传奇恩惠/.test(classProgression(c,n).row[2]));
}
export function spellsMentioned(lib,text) {
  const byName = new Map(lib.spells.map(s=>[s.name,s]));
  const expression = [...byName.keys()].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  return [...new Set((text.match(new RegExp(expression,'g'))||[]))].map(n=>byName.get(n));
}
function autoSubclassSpells(lib, sub, level, land) {
  if(!sub) return [];
  if(sub.name==='星辰结社')return ['神导术','光导箭'].map(n=>lib.find('spells',n)).filter(Boolean);
  let tables=sub.tables.filter(t=>t.rows[0]?.some(c=>/法术/.test(c)) && !t.rows[0]?.some(c=>/戏法|法术位/.test(c)));
  if(sub.name==='大地结社') tables=land?[sub.tables[['荒漠','极地','温带','热带'].indexOf(land)]]:[];
  const result=[];
  for(const t of tables){let at=Infinity;for(const r of t.rows){if(/^\d+$/.test(r[0]))at=Number(r[0]);if(at<=level)result.push(...spellsMentioned(lib,r.slice(/^\d+$/.test(r[0])?1:0).join(' ')));}}
  return [...new Map(result.map(s=>[s.id,s])).values()];
}

export function evaluate(lib, answers, context={}) {
  const questions=[],issues=[],missing=[],canonical={}, effects=[], grants=[], takenFeats=[];
  const sourceIds=new Set(), skillsKnown=new Set(), expertise=new Set(), saves=new Set(), trained=new Set(), toolKnown=new Set();
  let scores=Object.fromEntries(abilities.map(a=>[a,10])), workingLevel=1, hpBonusPerLevel=0, flatHp=0, speedBonus=0, featSpellKeys=[];
  function question(key, stage, opts={}) {
    if(opts.multiple&&opts.count===0)return [];
    const q={key,stage,required:true,...opts};questions.push(q);
    let value=answers[key];if(value==null)value='';value=String(value).trim();
    if(!value){if(q.required)missing.push({key,stage,message:key+'：请填写。'});return q.multiple?[]:'';}
    let values=q.multiple?split(value):[value.normalize('NFKC')];
    if(q.multiple&&values.length===1&&values[0]==='无')values=[];
    if(q.options) {
      values=values.map(v=>{
        if(/^\d+$/.test(v)&&q.options[Number(v)-1]!==undefined)return q.options[Number(v)-1];
        if(q.options.includes(v))return v;
        const alias=skillName(v);if(q.options.includes(alias))return alias;
        const e=lib.find('entries',v);return e&&q.options.includes(e.name)?e.name:v;
      });
      for(const v of values)if(!q.options.includes(v))issues.push({key,stage,message:`${key}：找不到“${v}”，请使用对应选项中的名称。`});
    }
    if(q.multiple&&new Set(values).size!==values.length)issues.push({key,stage,message:key+'：不能重复填写同一项。'});
    if(q.count!==undefined&&values.length!==q.count)issues.push({key,stage,message:`${key}：需要${q.count}项，目前${values.length}项。`});
    if(q.number){const n=asNumber(values[0]);if(!Number.isInteger(n)||n<q.min||n>q.max)issues.push({key,stage,message:`${key}：填写${q.min}至${q.max}的整数。`});canonical[key]=String(n);return n;}
    canonical[key]=q.multiple?(values.join('、')||'无'):values[0];
    return q.multiple?values:values[0];
  }
  const one=(key,stage,options,extra={})=>question(key,stage,{options,...extra});
  const many=(key,stage,options,count,extra={})=>question(key,stage,{multiple:true,options,count,...extra});
  const error=(key,message,stage=5)=>issues.push({key,message:`${key}：${message}`,stage});
  const use = e=>{if(e)sourceIds.add(e.id);return e;};
  const name=question('角色名',0,{help:'角色显示名称，不用于决定内部存档身份。'});
  const level=question('目标等级',0,{number:true,min:1,max:20});
  const className=one('职业',0,names(lib.classes));
  const speciesName=one('种族',0,names(lib.species));
  const backgroundName=one('背景',0,names(lib.backgrounds));
  const abilityMethod=one('属性方式',0,['标准数组','购点','程序掷骰']);
  const hpMethod=one('生命值方式',0,['固定值','程序掷骰','填写骰点']);
  const c=use(lib.find('classes',className)), species=use(lib.find('species',speciesName)), background=use(lib.find('backgrounds',backgroundName));
  const subName=c&&level>=3?one('子职',0,names(lib.subclasses.filter(s=>s.className===c.className))):'';
  if(!c||!species||!background||!Number.isInteger(level)||level<1||level>20) return {questions,issues,missing,canonical,snapshot:null};
  const sub=use(lib.find('subclasses',subName));
  const hitDie=Number(trait(c,'生命值骰').match(/D(\d+)/i)?.[1]);
  const baseScores = many('基础属性',1,undefined,6,{help:'按力量、敏捷、体质、智力、感知、魅力顺序填写六个数，用逗号分隔。'}).map(asNumber);
  if(baseScores.length===6){
    if(baseScores.some(n=>!Number.isInteger(n)||n<3||n>18))error('基础属性','六项必须为3至18的整数。',1);
    else {
      scores=Object.fromEntries(abilities.map((a,i)=>[a,baseScores[i]]));
      if(abilityMethod==='标准数组'&&[...baseScores].sort((a,b)=>a-b).join(',')!=='8,10,12,13,14,15')error('基础属性','标准数组须使用15、14、13、12、10、8各一次。',1);
      if(abilityMethod==='购点') {
        const costs={8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9},cost=baseScores.reduce((s,n)=>s+(costs[n]??100),0);
        if(cost>27)error('基础属性',`购点超出27点或8至15范围，目前计费${cost}。`,1);
      }
      if(abilityMethod==='程序掷骰'){
        if(!context.rolls?.abilities)error('基础属性','请先运行“掷骰”，再分配已保存的六个结果。',1);
        else if([...baseScores].sort((a,b)=>a-b).join(',')!==[...context.rolls.abilities].sort((a,b)=>a-b).join(','))error('基础属性','必须使用本角色已保存的六个掷骰结果。',1);
      }
    }
  }
  function addAbilities(key,stage,allowed,total,max,distinct=false){
    const values=many(key,stage,abilities,undefined,{help:`填写属性名称，共${total}点；同一属性加2时写两次，例如感知、感知。`,allowRepeated:true});
    // Repetition is meaningful for ability increases, unlike other multi-selects.
    const duplicate=issues.findIndex(e=>e.key===key&&e.message.includes('不能重复'));if(duplicate>=0)issues.splice(duplicate,1);
    if(!values.length)return;
    if(values.length!==total||values.some(a=>!allowed.includes(a)))error(key,'加点数量或可选属性不符合要求。',stage);
    const counts=Object.fromEntries(abilities.map(a=>[a,values.filter(x=>x===a).length]));
    if(distinct && (Math.max(...Object.values(counts))>2 || Object.values(counts).filter(n=>n>0).length<2))error(key,'背景加值选两项分别+2/+1，或三项各+1。',stage);
    for(const a of abilities){scores[a]+=counts[a];if(scores[a]>max)error(key,`${a}不能超过${max}。`,stage);}
  }
  addAbilities('背景加值',1,abilities.filter(a=>line(background,'属性值').includes(a)),3,20,true);
  const skillOptions=Object.keys(skills).filter(s=>trait(c,'技能熟练').replaceAll('特技','体操').replaceAll('医疗','医药').includes(s));
  const skillCount=Number(trait(c,'技能熟练').match(/(\d)项/)?.[1])||2;
  for(const a of abilities)if(trait(c,'豁免熟练').includes(a))saves.add(a);
  for(const a of ['轻甲','中甲','重甲','盾牌'])if(trait(c,'护甲受训').includes(a))trained.add(a);
  const bgSkills=Object.keys(skills).filter(s=>line(background,'技能熟练').replaceAll('特技','体操').replaceAll('医疗','医药').includes(s));
  bgSkills.forEach(s=>skillsKnown.add(s));
  const pickedSkills=many('职业技能',1,skillOptions.length?skillOptions:Object.keys(skills),skillCount);
  let overlap=0;for(const s of pickedSkills){if(skillsKnown.has(s))overlap++;else skillsKnown.add(s);}
  if(overlap)many('重复技能补选',1,Object.keys(skills).filter(s=>!skillsKnown.has(s)),overlap).forEach(s=>skillsKnown.add(s));
  const chosenLanguages=many('额外语言',1,languages,2);
  let weaponTraining=trait(c,'武器熟练'), classTools=trait(c,'工具熟练');
  if(classTools.includes('任选3'))many('职业工具',1,instruments,3).forEach(x=>toolKnown.add(x));
  else if(classTools.includes('选择1'))many('职业工具',1,[...artisanTools,...instruments],1).forEach(x=>toolKnown.add(x));
  else if(classTools)toolKnown.add(classTools);
  const bgTool=line(background,'工具熟练');
  if(bgTool.includes('选择'))many('背景工具',1,bgTool.includes('乐器')?instruments:bgTool.includes('赌具')?['骰子','龙棋','纸牌','三龙牌']:artisanTools,1).forEach(x=>toolKnown.add(x));
  else if(bgTool)toolKnown.add(bgTool);
  let size=species.body.match(/体型：([^（\n]+)/)?.[1]||'中型';
  if(size.includes('或'))size=one('体型',1,['中型','小型']);
  let lineage='', speciesCasting='';
  const lineages={精灵:['卓尔','高等精灵','木精灵'],侏儒:['森林侏儒','岩石侏儒'],提夫林:['深渊','幽冥','炼狱'],歌利亚:['云巨人','火巨人','霜巨人','山丘巨人','石巨人','风暴巨人'],龙裔:['白龙','黑龙','绿龙','蓝龙','红龙','黄铜龙','赤铜龙','青铜龙','银龙','金龙']};
  if(lineages[species.name])lineage=one('种族分支',1,lineages[species.name]);
  if(['精灵','侏儒','提夫林'].includes(species.name))speciesCasting=one('种族施法属性',1,['智力','感知','魅力']);
  if(species.name==='人类')many('人类技能',1,Object.keys(skills).filter(s=>!skillsKnown.has(s)),1).forEach(s=>skillsKnown.add(s));
  if(species.name==='精灵')many('精灵技能',1,['洞悉','察觉','求生'].filter(s=>!skillsKnown.has(s)),1).forEach(s=>skillsKnown.add(s));
  if(species.name==='矮人')hpBonusPerLevel++;
  let primal='',divine='',elemental='',land='';
  if(c.name==='德鲁伊'){primal=one('原初职能',1,['术师','卫士']);if(primal==='卫士'){trained.add('中甲');weaponTraining='简易和军用武器';}if(level>=7)elemental=one('元素之怒',3,['强力施法','原力蛮击']);}
  if(c.name==='牧师'){divine=one('神圣职能',1,['保护者','奇术使']);if(divine==='保护者'){trained.add('重甲');weaponTraining='简易和军用武器';}if(level>=7)one('受祝击',3,['神圣打击','强力施法']);}
  if(sub?.name==='大地结社')land=one('大地地形',5,['荒漠','极地','温带','热带']);
  if(sub?.name==='星辰结社')one('星图外观',1,['卷轴','石板','枭熊皮','星图集','水晶','玻璃圆盘']);

  function grant(spell,source,ability,extra={}){const e=use(lib.find('spells',spell));if(!e){error(source,'本地法术条目缺失：'+spell);return;}grants.push({name:e.name,source,ability,...extra});}
  function spellPick(key,stage,options,count,ability,source){
    featSpellKeys.push(key);return many(key,stage,names(options),count,{kind:'spell'}).map(n=>{const e=use(lib.find('spells',n));if(e)grants.push({name:n,ability,source});return e;}).filter(Boolean);
  }
  function feat(name,key,at,origin=false,magicClass='') {
    const f=use(lib.find('feats',name));if(!f){
      if(/^\d+级专长$/.test(key))question(key+'加值',featStages(at),{required:false,multiple:true,help:'若专长增加属性，在此填写属性名称。属性值提升共两点（例如感知、感知），其他专长按说明填写；不加属性留空。'});
      return;
    }
    const stage=at===1?1:featStages(at), text=f.body.replace(/\s+/g,'');
    const requirement=f.body.match(/先决[：:]([^）\n]+)/)?.[1]||'';
    if(origin&&!f.body.includes('起源专长'))error(key,'这里需要起源专长。',stage);
    const minimum=Number(requirement.match(/等级(\d+)/)?.[1])||1;
    if(at<minimum)error(key,`此专长需要${minimum}级。`,stage);
    if(/战斗风格/.test(requirement)&&!key.includes('战斗风格'))error(key,'战斗风格专长须由战斗风格特性获得。',stage);
    const reqScores=abilities.filter(a=>requirement.includes(a));
    const threshold=Number(requirement.match(/(\d+)\+/g)?.at(-1)?.replace('+',''))||0;
    if(reqScores.length&&threshold&&Math.max(...reqScores.map(a=>scores[a]))<threshold)error(key,`获得时需${reqScores.join('或')}${threshold}+。`,stage);
    for(const armor of ['轻甲','中甲','重甲','盾牌'])if(requirement.includes(armor+'受训')&&!trained.has(armor))error(key,'获得时需要'+armor+'受训。',stage);
    if(/施法或契约魔法/.test(requirement)&&!castAbility[c.name]&&!['奥法骑士','诡术师'].includes(sub?.name))error(key,'需要施法或契约魔法职业特性。',stage);
    if(takenFeats.some(x=>x.name===f.name)&&!f.body.includes('复选'))error(key,'这个专长不能重复获得。',stage);
    const before={...scores};let increase='';
    if(f.name==='属性值提升')addAbilities(key+'加值',stage,abilities,2,20);
    else if(text.includes('属性值提升')){
      const clause=text.match(/属性值提升[\s\S]*?[。]/)?.[0]||'';
      const allowed=abilities.filter(a=>clause.includes(a));
      increase=one(key+'加值',stage,allowed.length?allowed:abilities);
      if(increase){if(f.name==='强健身心'&&saves.has(increase))error(key+'加值','须选择尚未具有豁免熟练的属性。',stage);scores[increase]++;if(scores[increase]>(clause.includes('30')?30:20))error(key+'加值','属性超过此专长的上限。',stage);}
    }
    takenFeats.push({name:f.name,level:at,source:key,increase,before});
    if(f.name==='健壮')hpBonusPerLevel+=2;
    if(f.name==='超凡强韧之恩惠')flatHp+=40;
    if(f.name==='强健身心'&&increase)saves.add(increase);
    if(f.name==='轻甲运用')trained.add('轻甲');if(f.name==='中甲运用')trained.add('中甲');if(f.name==='重甲运用')trained.add('重甲');
    if(f.name==='军用武器训练')weaponTraining='简易和军用武器';
    if(f.name==='飙速跑者')speedBonus+=10;if(f.name==='神行无拘之恩惠')speedBonus+=30;
    if(f.name==='熟习')many(key+'熟练',stage,[...Object.keys(skills),...tools].filter(s=>!skillsKnown.has(s)&&!toolKnown.has(s)),3).forEach(s=>(skills[s]?skillsKnown:toolKnown).add(s));
    if(f.name==='巧匠')many(key+'工具',stage,artisanTools,3).forEach(s=>toolKnown.add(s));
    if(f.name==='音乐家')many(key+'乐器',stage,instruments,3).forEach(s=>toolKnown.add(s));
    if(f.name==='大厨')toolKnown.add('厨师工具');
    if(f.name==='技艺专家'){
      many(key+'技能',stage,Object.keys(skills).filter(s=>!skillsKnown.has(s)),1).forEach(s=>skillsKnown.add(s));
      many(key+'专精',stage,[...skillsKnown].filter(s=>!expertise.has(s)),1).forEach(s=>expertise.add(s));
    }
    if(['敏锐心灵','观察力'].includes(f.name)){
      const options=f.name==='敏锐心灵'?['奥秘','历史','调查']:['洞悉','察觉','求生'];
      many(key+'技能',stage,options,1).forEach(s=>{if(skillsKnown.has(s))expertise.add(s);else skillsKnown.add(s);});
    }
    if(f.name==='博学多才之恩惠')Object.keys(skills).forEach(s=>skillsKnown.add(s));
    if(f.name==='元素掌控')one(key+'伤害类型',stage,['强酸','寒冷','火焰','闪电','雷鸣']);
    if(f.name==='能量抗性之恩惠')many(key+'抗性',stage,['强酸','寒冷','火焰','闪电','雷鸣','毒素','力场','心灵','光耀','暗蚀'],2);
    if(f.name==='魔法学徒'){
      const list=magicClass||one(key+'法表',stage,['牧师','德鲁伊','法师']);
      const ability=one(key+'施法属性',stage,['智力','感知','魅力']);
      if(takenFeats.slice(0,-1).some(x=>x.name==='魔法学徒'&&x.magicClass===list))error(key,'再次选择魔法学徒须使用不同法表。',stage);
      takenFeats.at(-1).magicClass=list;
      if(list){spellPick(key+'戏法',5,lib.spells.filter(s=>s.spellLevel===0&&s.classes.includes(list)),2,ability,key);spellPick(key+'法术',5,lib.spells.filter(s=>s.spellLevel===1&&s.classes.includes(list)),1,ability,key);}
    }
    if(f.name==='念动力')grant('法师之手',key,increase);
    if(f.name==='心灵感应')grant('侦测思想',key,increase);
    if(f.name==='妖精触碰'||f.name==='影界触碰'){
      grant(f.name==='妖精触碰'?'迷踪步':'隐形术',key,increase);
      spellPick(key+'法术',5,lib.spells.filter(s=>s.spellLevel===1&&(f.name==='妖精触碰'?['预言','惑控']:['幻术','死灵']).includes(s.school)),1,increase,key);
    }
    if(f.name==='仪式施法者')spellPick(key+'仪式',5,lib.spells.filter(s=>s.spellLevel===1&&/仪式/.test(s.body.split('持续时间')[0])),pb(level),increase,key);
  }
  const backgroundFeat=line(background,'专长').split(/[（(]/)[0];
  feat(backgroundFeat,'背景专长',1,true,line(background,'专长').match(/魔法学徒[（(](牧师|德鲁伊|法师)/)?.[1]);
  if(species.name==='人类'){const n=one('人类专长',1,names(lib.feats.filter(f=>f.body.includes('起源专长'))));feat(n,'人类专长',1,true);}
  if(['战士','游侠','圣武士'].includes(c.name) && level>=(c.name==='战士'?1:2)){
    const styles=lib.feats.filter(f=>f.body.includes('战斗风格专长'));
    const extra=c.name==='游侠'?'德鲁伊教战':c.name==='圣武士'?'受祝战士':null;
    const style=one('战斗风格',1,[...names(styles),...(extra?[extra]:[])]);
    if(extra===style)spellPick('战斗风格戏法',5,lib.spells.filter(s=>s.spellLevel===0&&s.classes.includes(c.name==='游侠'?'德鲁伊':'牧师')),2,castAbility[c.name],'战斗风格');else feat(style,'战斗风格',c.name==='战士'?1:2);
    if(sub?.name==='勇士'&&level>=7){const s=one('勇士战斗风格',3,names(styles).filter(n=>n!==style));feat(s,'勇士战斗风格',7);}
  }
  if(c.name==='野蛮人'&&level>=3)many('原初学识技能',2,skillOptions.filter(s=>!skillsKnown.has(s)),1).forEach(s=>skillsKnown.add(s));
  const scheduledFeats=featLevels(c,level);
  for(let at=2;at<=level;at++) {
    if(at===3&&sub?.name==='勇气学院'){trained.add('中甲');trained.add('盾牌');weaponTraining='简易和军用武器';}
    if(at===3&&sub?.name==='逸闻学院')many('逸闻技能',2,Object.keys(skills).filter(s=>!skillsKnown.has(s)),3).forEach(s=>skillsKnown.add(s));
    if(at===3&&sub?.name==='妖精漫游者')many('妖冶娴都技能',2,['欺瞒','表演','游说'].filter(s=>!skillsKnown.has(s)),1).forEach(s=>skillsKnown.add(s));
    if(at===3&&sub?.name==='命流武者'){skillsKnown.add('洞悉');skillsKnown.add('医药');toolKnown.add('草药工具');}
    if(at===3&&sub?.name==='战斗大师'){
      many('战争学者工具',2,artisanTools,1).forEach(s=>toolKnown.add(s));
      many('战争学者技能',2,skillOptions.filter(s=>!skillsKnown.has(s)),1).forEach(s=>skillsKnown.add(s));
    }
    if(at===7&&sub?.name==='幽域追猎者'){
      if(saves.has('感知')){const a=one('钢铁意志豁免',3,['智力','魅力'].filter(a=>!saves.has(a)));if(a)saves.add(a);}else saves.add('感知');
    }
    if(!scheduledFeats.includes(at))continue;
    workingLevel=at;
    const opts=lib.feats.filter(f=>!f.body.includes('战斗风格专长')&&(at>=19||!f.body.includes('传奇恩惠专长')));
    const selected=one(at+'级专长',featStages(at),names(opts));feat(selected,at+'级专长',at);
  }
  if(c.name==='野蛮人'&&level===20){scores.力量+=4;scores.体质+=4;}
  if(c.name==='武僧'&&level===20){scores.敏捷+=4;scores.感知+=4;}
  for(const a of abilities)if(scores[a]>30)error('属性',a+'超过30。');
  if(c.name==='武僧'&&level>=14)abilities.forEach(a=>saves.add(a));
  for(const [at,count] of ({吟游诗人:[[2,2],[9,2]],游荡者:[[1,2],[6,2]],游侠:[[2,1],[9,2]],法师:[[2,1]]}[c.name]||[]))if(level>=at){
    const options=[...skillsKnown].filter(s=>!expertise.has(s)&&(c.name!=='法师'||['奥秘','历史','调查','医药','自然','宗教'].includes(s)));
    many(at+'级专精',Math.min(featStages(at),4),options,count).forEach(s=>expertise.add(s));
  }
  if(c.name==='游侠'&&level>=2)many('熟练探索语言',1,languages.filter(s=>!chosenLanguages.includes(s)),2);
  if(c.name==='游荡者')one('盗贼黑话额外语言',1,languages.filter(s=>!chosenLanguages.includes(s)));
  const capacity=spellCapacity(c,level);
  if(['奥法骑士','诡术师'].includes(sub?.name)){
    const t=sub.tables.find(t=>t.rows[0]?.some(c=>/戏法/.test(c))),r=t?.rows.find(r=>r[0]===String(level));
    if(r){capacity.cantrips=Number(r[1]);capacity.prepared=Number(r[2]);capacity.slots=r.slice(3).map(n=>Number(n)||0);capacity.maxSpell=capacity.slots.findLastIndex(n=>n>0)+1;}
  }
  capacity.cantrips+=(primal==='术师'||divine==='奇术使'?1:0);
  const spellClass=['奥法骑士','诡术师'].includes(sub?.name)?'法师':c.name;
  const mainAbility=castAbility[c.name]||(['奥法骑士','诡术师'].includes(sub?.name)?'智力':null);
  if(c.name==='德鲁伊')grant('动物交谈','德鲁伊语','感知');
  if(c.name==='游侠')grant('猎人印记','宿敌','感知');
  if(c.name==='圣武士'&&level>=2)grant('至圣斩','圣武斩','魅力');
  if(c.name==='圣武士'&&level>=5)grant('寻获坐骑','信实坐骑','魅力');
  for(const s of autoSubclassSpells(lib,sub,level,land))grant(s.name,sub.name,mainAbility);
  if(sub?.name==='诡术师'){capacity.cantrips--;grant('法师之手',sub.name,'智力');}
  if(sub?.name==='暗影武者')grant('次级幻象',sub.name,'感知');
  if(sub?.name==='幻术师')grant('次级幻象',sub.name,'智力');
  if(sub?.name==='魅心学院'){grant('魅惑类人',sub.name,'魅力');grant('镜影术',sub.name,'魅力');if(level>=6)grant('命令术',sub.name,'魅力');}
  if(sub?.name==='兽心道途'){grant('野兽感官',sub.name,'感知');grant('动物交谈',sub.name,'感知');if(level>=10)grant('问道自然',sub.name,'感知');if(level>=6)one('兽之形貌',3,['枭','豹','鲑']);}
  if(sub?.name==='猎人'){one('猎杀技艺',2,['巨像屠夫','灭族者']);if(level>=7)one('防守战术',3,['冲出重围','多重防御']);}
  if(sub?.name==='龙族术法'&&level>=6)one('龙族元素亲和',3,['强酸','寒冷','火焰','闪电','毒素']);
  if(sub?.name==='驯兽师')one('原初伙伴形态',5,['陆之野兽','海之野兽','空之野兽']);
  if(sub?.name==='战斗大师'){
    const body=sub.body.split('战技选项 Maneuver Options')[1]||'';
    const options=[...body.matchAll(/^([\u4e00-\u9fff]+)[A-Z]/gm)].map(m=>m[1]);
    many('战技',5,options,3+(level>=7?2:0)+(level>=10?2:0)+(level>=15?2:0));
  }
  if(c.name==='魔契师'&&level>=9)grant('异界探知','联络宗主','魅力');
  const racial={卓尔:['舞光术','妖火','黑暗术'],高等精灵:['魔法伎俩','侦测魔法','迷踪步'],木精灵:['德鲁伊伎俩','大步奔行','行动无踪'],深渊:['毒气喷涌','致病射线','定身类人'],幽冥:['颤栗之触','虚假生命','衰弱射线'],炼狱:['火焰箭','炼狱叱喝','黑暗术']};
  if(racial[lineage])racial[lineage].forEach((n,i)=>{if(level>=[1,3,5][i]){if(i===0&&lineage==='高等精灵')spellPick('高等精灵戏法',5,lib.spells.filter(s=>s.spellLevel===0&&s.classes.includes('法师')),1,speciesCasting,'精灵血系');else grant(n,'种族',speciesCasting);}});
  if(species.name==='提夫林')grant('奇术','种族',speciesCasting);
  if(species.name==='阿斯莫')grant('光亮术','种族','魅力');
  if(lineage==='森林侏儒'){grant('次级幻象','种族',speciesCasting);grant('动物交谈','种族',speciesCasting);}
  if(lineage==='岩石侏儒'){grant('修复术','种族',speciesCasting);grant('魔法伎俩','种族',speciesCasting);}
  let cantrips=[],prepared=[],spellbook=[];
  const classSpells=lib.spells.filter(s=>s.classes.includes(spellClass));
  const autoClass = new Set(grants.filter(g=>g.source===sub?.name||['德鲁伊语','宿敌','圣武斩','信实坐骑'].includes(g.source)).map(g=>g.name));
  if(capacity.cantrips) cantrips=many('职业戏法',5,names(classSpells.filter(s=>s.spellLevel===0&&!autoClass.has(s.name))),capacity.cantrips,{kind:'spell'}).map(n=>use(lib.find('spells',n))).filter(Boolean);
  if(c.name==='法师'){
    for(let at=1;at<=level;at++)spellbook.push(...many(at+'级法术书新增',5,names(classSpells.filter(s=>s.spellLevel>=1&&s.spellLevel<=spellCapacity(c,at).maxSpell)),at===1?6:2,{kind:'spell'}).map(n=>use(lib.find('spells',n))).filter(Boolean));
    const school={防护师:'防护',预言师:'预言',塑能师:'塑能',幻术师:'幻术'}[sub?.name];
    if(school)for(const at of [3,5,7,9,11,13,15,17].filter(n=>n<=level))spellbook.push(...many(at+'级学派法术书',5,names(classSpells.filter(s=>s.spellLevel>=1&&s.spellLevel<=spellCapacity(c,at).maxSpell&&s.school===school)),at===3?2:1,{kind:'spell'}).map(n=>use(lib.find('spells',n))).filter(Boolean));
    if(new Set(spellbook.map(s=>s.id)).size<spellbook.length)error('法术书','各等级新增不能重复抄入同一道法术。');
    if(level>=18)for(const rank of [1,2])spellPick('法术精通'+rank+'环',5,spellbook.filter(s=>s.spellLevel===rank&&/施法时间：动作/.test(s.body)),1,'智力','法术精通');
    if(level>=20)spellPick('招牌法术',5,spellbook.filter(s=>s.spellLevel===3),2,'智力','招牌法术');
  }
  if(capacity.prepared){
    let options=c.name==='法师'?spellbook:classSpells;
    if(c.name==='吟游诗人'&&level>=10)options=lib.spells.filter(s=>s.classes.some(c=>['吟游诗人','牧师','德鲁伊','法师'].includes(c)));
    prepared=many('准备法术',5,names(options.filter(s=>s.spellLevel>=1&&s.spellLevel<=capacity.maxSpell&&!autoClass.has(s.name))),capacity.prepared,{kind:'spell'}).map(n=>use(lib.find('spells',n))).filter(Boolean);
    if(['吟游诗人','术士','魔契师'].includes(c.name))for(let rank=2;rank<=capacity.maxSpell;rank++){
      const unlock=Array.from({length:level},(_,i)=>i+1).find(n=>spellCapacity(c,n).maxSpell>=rank);
      const prior=unlock>1?spellCapacity(c,unlock-1).prepared:0;
      const max=capacity.prepared-prior+level-unlock+1;
      if(prepared.filter(s=>s.spellLevel>=rank).length>max)error('准备法术',`${rank}环及以上法术过多，逐级新增/替换最多能形成${max}道。`);
    }
    if(c.name==='吟游诗人'&&level>=10){const other=prepared.filter(s=>!s.classes.includes('吟游诗人')).length;const limit=capacity.prepared-spellCapacity(c,9).prepared+level-9;if(other>limit)error('准备法术',`魔法奥秘的成长路径最多允许${limit}道非诗人法术。`);}
  }
  if(sub?.name==='逸闻学院'&&level>=6)spellPick('魔法探秘法术',5,lib.spells.filter(s=>s.spellLevel<=capacity.maxSpell&&s.classes.some(n=>['牧师','德鲁伊','法师'].includes(n))),2,'魅力','魔法探秘');
  if(c.name==='魔契师'){
    const invocationNames=['幽影护甲','魔能意志','刃之魔契','链之魔契','书之魔契','苦痛魔爆','魔鬼视界','魔能长枪','邪魔活力','原初之一的教习','千面之颜','幻象迷踪','超凡跳跃','斥力魔爆','星移步法','魔能斩','共视感官','深海馈赠','链主赋能','万形之主','融身入影','饥渴魔刃','坟茔殁语','饮命者','守护馈赠','穹宇尽视','灭世魔刃','巫术视界'];
    const minimum=[1,1,1,1,1,2,2,2,2,2,2,2,2,2,5,5,5,5,5,5,5,5,7,9,9,9,12,15];
    const count=Number(classProgression(c,level).row[3]);
    const inv=many('魔能祈唤',5,invocationNames,count,{allowRepeated:true});
    const duplication=issues.findIndex(e=>e.key==='魔能祈唤'&&e.message.includes('不能重复'));if(duplication>=0)issues.splice(duplication,1);
    for(const n of new Set(inv))if(inv.filter(v=>v===n).length>1&&!['苦痛魔爆','魔能长枪','斥力魔爆','原初之一的教习'].includes(n))error('魔能祈唤',n+'不能重复选择。');
    for(const n of inv)if(minimum[invocationNames.indexOf(n)]>level)error('魔能祈唤',n+'尚未达到所需等级。');
    for(const [n,prereq] of [['魔能斩','刃之魔契'],['饥渴魔刃','刃之魔契'],['饮命者','刃之魔契'],['链主赋能','链之魔契'],['守护馈赠','书之魔契'],['灭世魔刃','饥渴魔刃']])if(inv.includes(n)&&!inv.includes(prereq))error('魔能祈唤',n+'需要'+prereq+'。');
    for(const min of [...new Set(minimum)].filter(n=>n<=level&&n>1)){
      const max=count-Number(classProgression(c,min-1).row[3])+level-min+1;
      if(inv.filter(n=>minimum[invocationNames.indexOf(n)]>=min).length>max)error('魔能祈唤',`${min}级以上祈唤的数量无法通过逐级获取/替换达到。`);
    }
    for(const n of ['苦痛魔爆','魔能长枪','斥力魔爆']){const times=inv.filter(x=>x===n).length;if(times)many(n+'戏法',5,names(cantrips.filter(s=>/伤害/.test(s.body)&&(n!=='斥力魔爆'||/攻击/.test(s.body))&&(n!=='魔能长枪'||Number(s.body.match(/施法距离：(\d+)/)?.[1])>=10))),times,{kind:'spell'});}
    const grantsByInvocation={'幽影护甲':'法师护甲','链之魔契':'寻获魔宠','邪魔活力':'虚假生命','千面之颜':'易容术','幻象迷踪':'无声幻影','超凡跳跃':'跳跃术','星移步法':'浮空术','深海馈赠':'水下呼吸','万形之主':'变身术','融身入影':'隐形术','坟茔殁语':'死者交谈','穹宇尽视':'秘法眼'};
    for(const n of inv)if(grantsByInvocation[n])grant(grantsByInvocation[n],n,'魅力');
    if(inv.includes('书之魔契')){
      spellPick('书之魔契戏法',5,lib.spells.filter(s=>s.spellLevel===0&&!cantrips.some(c=>c.id===s.id)),3,'魅力','书之魔契');
      spellPick('书之魔契仪式',5,lib.spells.filter(s=>s.spellLevel===1&&/仪式/.test(s.body.split('持续时间')[0])&&!prepared.some(c=>c.id===s.id)),2,'魅力','书之魔契');
    }
    const lessons=inv.filter(n=>n==='原初之一的教习').length;
    if(lessons){const selected=many('教习起源专长',5,names(lib.feats.filter(f=>f.body.includes('起源专长'))),lessons);for(const n of selected)feat(n,'教习'+n,2,true);}
    for(const [at,rank] of [[11,6],[13,7],[15,8],[17,9]])if(level>=at)spellPick(rank+'环玄奥秘法',5,classSpells.filter(s=>s.spellLevel===rank),1,'魅力','玄奥秘法');
  }
  if(c.name==='德鲁伊'&&level>=2){
    const maxCR=sub?.name==='月亮结社'?Math.floor(level/3):level>=8?1:level>=4?0.5:0.25;
    const eligible=lib.beasts.filter(e=>fraction(e.meta.data.statBlock?.challengeRatingText)<=maxCR&&(level>=8||!e.meta.data.statBlock?.speedsFeet?.fly));
    many('野兽形态',5,names(eligible),level>=8?8:level>=4?6:4).forEach(n=>use(lib.find('beasts',n)));
  }
  // Choices whose effects are applied during play remain explicit, bounded selections.
  if(c.name==='术士'&&level>=2){const ref=lib.find('entries','超魔法选项');const options=[...ref.body.matchAll(/^([\u4e00-\u9fff]{2,12})\s+[A-Z]/gm)].map(m=>m[1].trim()).filter(s=>s!=='超魔法选项');many('超魔法',5,options,level>=17?6:level>=10?4:2);}
  const resources=Object.fromEntries(classProgression(c,level).header.map((h,i)=>[h,classProgression(c,level).row[i]]).filter(([h])=>!['等级','职业特性','戏法','准备法术'].includes(h)&&!h.includes('法术位')));
  const hpRolls=hpMethod==='填写骰点'?many('升级生命骰',1,undefined,level-1,{help:`按2级至${level}级顺序填写每次d${hitDie}的原始骰点。`}).map(asNumber):hpMethod==='程序掷骰'?context.rolls?.hp?.slice(0,level-1):Array(level-1).fill(hitDie/2+1);
  if(hpMethod==='程序掷骰'&&(!hpRolls||hpRolls.length!==level-1))error('生命值方式','请运行“掷骰”生成并保存生命骰。',1);
  if(hpRolls?.some(n=>!Number.isInteger(n)||n<1||n>hitDie))error('升级生命骰',`每个骰点须在1至${hitDie}之间。`,1);
  const hp=hitDie+mod(scores.体质)+(hpRolls||[]).reduce((s,n)=>s+Math.max(1,n+mod(scores.体质)),0)+hpBonusPerLevel*level+flatHp+(sub?.name==='龙族术法'?level:0);
  let speed=Number(species.body.match(/速度：\s*(\d+)/)?.[1])||30;
  if(lineage==='木精灵')speed=35;
  speed+=speedBonus;
  const passive=10+mod(scores.感知)+(skillsKnown.has('察觉')?pb(level):0)+(expertise.has('察觉')?pb(level):0);
  const skillBonuses=Object.fromEntries(Object.entries(skills).map(([s,a])=>[s,mod(scores[a])+(skillsKnown.has(s)?pb(level):c.name==='吟游诗人'&&level>=2?Math.floor(pb(level)/2):0)+(expertise.has(s)?pb(level):0)]));
  if(primal==='术师')for(const s of ['奥秘','自然'])skillBonuses[s]+=Math.max(1,mod(scores.感知));
  if(divine==='奇术使')for(const s of ['奥秘','宗教'])skillBonuses[s]+=Math.max(1,mod(scores.感知));
  if(sub?.name==='妖精漫游者')for(const [s,a] of Object.entries(skills))if(a==='魅力')skillBonuses[s]+=Math.max(1,mod(scores.感知));
  const snapshot={name,level,className:c.name,species:species.name,background:background.name,subclass:sub?.name||'',size,lineage,scores,modifiers:Object.fromEntries(abilities.map(a=>[a,mod(scores[a])])),proficiency:pb(level),hpMax:hp,hitDice:`${level}d${hitDie}`,speed,passivePerception:passive,initiative:mod(scores.敏捷)+(takenFeats.some(f=>f.name==='警戒')?pb(level):0),skills:skillBonuses,proficiencies:[...skillsKnown],expertise:[...expertise],savingThrows:Object.fromEntries(abilities.map(a=>[a,mod(scores[a])+(saves.has(a)?pb(level):0)])),savingProficiencies:[...saves],armorTraining:[...trained],weaponTraining,tools:[...toolKnown],languages:['通用语',...chosenLanguages,...(c.name==='德鲁伊'?['德鲁伊语']:[])],feats:takenFeats,cantrips:names(cantrips),prepared:names(prepared),spellbook:names(spellbook),grantedSpells:grants,spellcasting:mainAbility?{ability:mainAbility,attack:pb(level)+mod(scores[mainAbility]),dc:8+pb(level)+mod(scores[mainAbility]),...capacity}:null,resources,sourceIds:[...sourceIds],effects};
  if(sub?.name==='幽域追猎者')snapshot.initiative+=mod(scores.感知);
  for(const g of snapshot.grantedSpells)if(abilities.includes(g.ability)){g.attack=pb(level)+mod(scores[g.ability]);g.dc=8+g.attack;}
  snapshot.resourcePools={};
  const pool=(label,max,recovery)=>snapshot.resourcePools[label]={max,recovery};
  if(c.name==='术士'){pool('先天术法',2,'长休');if(level>=2)pool('术法点',level,'长休');}
  if(c.name==='吟游诗人')pool('吟游诗人激励',Math.max(1,mod(scores.魅力)),level>=5?'短休或长休':'长休');
  if(c.name==='圣武士'){pool('圣疗点数',5*level,'长休');if(level>=2)pool('免费至圣斩',1,'长休');}
  if(c.name==='法师')pool('奥术回想可恢复环阶',Math.ceil(level/2),'长休；六环以上不能恢复');
  if(c.name==='德鲁伊'&&level>=2)pool('荒野变形',Number(resources.荒野变形),'短休恢复1次，长休全恢复');
  if(c.name==='牧师'&&level>=2)pool('引导神力',Number(resources.引导神力),'短休恢复1次，长休全恢复');
  if(c.name==='战士')pool('回气',Number(resources.回气),'短休恢复1次，长休全恢复');
  if(c.name==='武僧'&&level>=2)pool('功力',level,'短休或长休');
  if(c.name==='游侠')pool('免费猎人印记',Number(resources.宿敌),'长休');
  if(sub?.name==='月亮结社'&&level>=10)pool('月光飞步',Math.max(1,mod(scores.感知)),'长休');
  if(sub?.name==='星辰结社'){pool('免费光导箭',Math.max(1,mod(scores.感知)),'长休');if(level>=6)pool('宇宙预兆',Math.max(1,mod(scores.感知)),'长休');}
  if(sub?.name==='战斗大师')pool('卓越骰',4+(level>=7?1:0)+(level>=15?1:0),'短休或长休');
  if(sub?.name==='天界宗主')pool('治愈之光骰',level+1,'长休');
  if(species.name==='歌利亚')pool('巨人先祖',pb(level),'长休');
  if(species.name==='龙裔')pool('吐息武器',pb(level),'长休');
  if(species.name==='矮人')pool('石中精妙',pb(level),'长休');
  if(takenFeats.some(f=>f.name==='幸运'))pool('幸运点',pb(level),'长休');
  if(c.name==='圣武士'&&level>=6)snapshot.auraSavingThrowBonus=Math.max(1,mod(scores.魅力));
  equipment(lib,{one,many,question,error,c,background,snapshot,context});
  return {questions,issues,missing,canonical,snapshot};
}

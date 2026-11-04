import { abilities, info, overview, pad } from './library.mjs';
import { STAGES, pointBuy } from './rules.mjs';

export function parseAnswers(text, expectedToken) {
  const lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');
  if(lines[0]!==`角色回答 · ${expectedToken}`)throw new Error('这份回答属于之前的填写版本。已保留文件，请运行 recover 查看上次文件后重新合并答案。');
  const answers=Object.create(null);let key=null;
  for(const raw of lines.slice(1)){
    const line=raw.trim();if(!line||/^(#|【|提示：)/.test(line))continue;
    const match=line.match(/^([^：:=]{1,60})\s*[：:=]\s*(.*)$/);
    if(match){key=match[1].trim();if(Object.hasOwn(answers,key))throw new Error('回答里重复出现了“'+key+'”，请保留一个填写位置。');answers[key]=match[2].trim();}
    else if(key)answers[key]+=(answers[key]?'、':'')+line;
    else throw new Error('无法识别这一行：'+line.slice(0,100));
  }
  return answers;
}

export function visibleQuestions(state,result,stage) {
  return result.questions.filter(q=>state.mode==='自由'||q.stage===stage);
}

export function answerText(state,result,stage) {
  const lines=[`角色回答 · ${state.id}-${state.revision}`,'','# 把答案填在冒号后。多项用顿号或逗号分开，保存后双击“继续”。',''];
  const s=result.snapshot;
  const questions=visibleQuestions(state,result,stage);
  let group=-1;
  for(const q of questions){
    if(q.stage!==group){group=q.stage;lines.push('【'+STAGES[group]+'】');}
    if(q.help)lines.push('# '+q.help.replace(/\n/g,'\n# '));
    if(q.excluded?.length)lines.push('# 不能选：'+q.excluded.map(({name,reason})=>name+'（'+reason+'）').join('、')+'。');
    if(q.options){
      lines.push('# 候选范围：');
      if(!q.options.length)lines.push('# 暂无候选；先填写相关的前置选择，再继续刷新。');
      for(let i=0;i<q.options.length;i+=6)lines.push('# '+q.options.slice(i,i+6).map((v,j)=>`${i+j+1}.${v}`).join('  '));
    }
    if(q.candidates){lines.push('# 可购买范围（单价）：');for(const item of q.candidates)lines.push(`# ${item.name}（${item.priceCp/100}GP）`);}
    if(q.kind==='spell'&&state.status!=='complete')lines.push('# 详细说明见“'+spellReferenceName(q)+'”。');
    if(q.count!==undefined)lines.push('# 选择'+q.count+'项。');
    if(s){
      const armor='护甲受训：'+(s.armorTraining.filter(n=>n!=='盾牌').join('、')||'无');
      const shield='盾牌受训：'+(s.armorTraining.includes('盾牌')?'有':'无');
      const weapon='武器熟练：'+(s.weaponTraining||'无');
      if(['职业装备','背景装备','购买物品'].includes(q.key))lines.push('# '+armor+'；'+shield+'；'+weapon+'。','# 工具熟练：'+(s.tools.join('、')||'无')+'。');
      else if(q.key==='穿戴护甲')lines.push('# '+armor+'。');
      else if(q.key==='使用盾牌')lines.push('# '+shield+'。');
      else if(['常用武器','武器精通','武器大师精通'].includes(q.key))lines.push('# '+weapon+'。');
      else if(['职业工具','背景工具'].includes(q.key))lines.push('# 当前工具熟练：'+(s.tools.join('、')||'无')+'。');
    }
    lines.push(q.key+'：'+(state.answers[q.key]||''),'');
  }
  return lines.join('\r\n')+'\r\n';
}

export function spellReferenceName(q) { return '法术候选-'+q.key.replace(/[<>:"/\\|?*]/g,'_')+'.txt'; }

export function summary(snapshot) {
  if(!snapshot)return '先填写职业、等级、种族和背景，继续后会出现对应的完整资料。\n';
  const s=snapshot,sign=n=>n>=0?'+'+n:String(n);
  return [s.name+' · '+s.level+'级'+s.className+(s.subclass?' / '+s.subclass:''),
    `${s.species} / ${s.background} / ${s.size}`,
    abilities.map(a=>`${a} ${s.scores[a]} (${sign(s.modifiers[a])})`).join('  '),
    `生命上限 ${s.hpMax}；生命骰 ${s.hitDice}；AC ${s.ac??'待选装备'}；熟练 ${sign(s.proficiency)}`,
    `先攻 ${sign(s.initiative)}；速度 ${s.speed}尺；被动察觉 ${s.passivePerception}`,
    s.auraSavingThrowBonus?`守护灵光：清醒且生效时，豁免另加${s.auraSavingThrowBonus}。`:'',
    '','技能：',...Object.entries(s.skills).map(([k,v])=>`${k} ${sign(v)}${s.expertise.includes(k)?'（专精）':s.proficiencies.includes(k)?'（熟练）':''}`),
    '','豁免：',...Object.entries(s.savingThrows).map(([k,v])=>`${k} ${sign(v)}${s.savingProficiencies.includes(k)?'（熟练）':''}`),
    '',`护甲受训：${s.armorTraining.join('、')||'无'}；武器熟练：${s.weaponTraining}`,
    `工具：${s.tools.join('、')||'无'}`,`语言：${s.languages.join('、')}`,
    '','专长：',...s.feats.map(f=>`${f.level}级 ${f.name}（${f.source}）`),
    '',...(s.spellcasting?[`职业施法属性：${s.spellcasting.ability}；攻击 ${sign(s.spellcasting.attack)}；DC ${s.spellcasting.dc}`,`法术位（一至九环）：${s.spellcasting.slots.join(' / ')}`,`职业戏法：${s.cantrips.join('、')}`,`常规准备：${s.prepared.join('、')}`]:[]),
    '额外法术：',...s.grantedSpells.map(g=>`${g.name}（${g.source}，${g.ability||'施法属性待填写'}${g.dc?`，攻击${sign(g.attack)} / DC${g.dc}`:''}）`),
    '','职业成长表资源：',...Object.entries(s.resources).map(([k,v])=>k+'：'+v),
    '','资源上限与恢复：',...Object.entries(s.resourcePools||{}).map(([k,v])=>`${k}：${v.max}；${v.recovery}`),
    '',...(s.equipment?[`余额：${s.equipment.gold}GP`,`护甲：${s.equipment.armor}；盾牌：${s.equipment.shield?'使用':'未使用'}`,...s.equipment.starting.map(x=>x.source+'：'+x.contents),...s.equipment.purchases.map(x=>`购买 ${x.name}×${x.count}`),...s.equipment.attacks.map(a=>`${a.name}：命中${sign(a.attack)}；伤害${a.damage} ${sign(a.damageBonus)}；${a.proficient?'熟练':'不熟练'}${a.mastery?'；精通 '+a.mastery:''}`),...s.equipment.notes]:[])
  ].filter(x=>x!==undefined).join('\n')+'\n';
}

function featureText(entry,level) {
  if(!entry)return '';
  const matches=[...entry.body.matchAll(/^(\d+)级[：:]/gm)];
  if(!matches.length)return info(entry);
  return entry.title+'\n\n'+matches.map((m,i)=>Number(m[1])<=level?entry.body.slice(m.index,matches[i+1]?.index??entry.body.length).trim():'').filter(Boolean).join('\n\n');
}

function backgroundRule(state) {
  return state.config?.freeBackgroundAbilities===true
    ?'房规已开启。可在六项属性中自由分配背景的3点，两项分别加2和1，或三项各加1。'
    :'按背景指定的三项属性分配，两项分别加2和1，或三项各加1。';
}

export function renderFiles(lib,state,result,stage) {
  const files=new Map();
  const list=(filename,entries)=>{if(entries.length)files.set(filename,overview(entries));};
  files.set('回答.txt',answerText(state,result,stage));
  if(state.status==='complete'){
    files.set('本轮说明.txt',`这个角色的${result.snapshot?.level||state.answers.目标等级}级档案已完成。\n\n角色卡在上一级目录的“成果”内。以后升级，请打开工具入口，选择“升级”。\n`);
    return files;
  }

  const questions=visibleQuestions(state,result,stage);
  const keys=new Set(questions.map(q=>q.key));
  const c=lib.find('classes',result.snapshot?.className||state.answers.职业);
  const sub=lib.find('subclasses',result.snapshot?.subclass||state.answers.子职);
  if(keys.has('职业'))list('职业总览.txt',lib.classes);
  if(keys.has('种族'))list('种族选项.txt',lib.species);
  if(keys.has('背景'))list('背景选项.txt',lib.backgrounds);
  if(keys.has('子职')&&c)list('子职选项.txt',lib.subclasses.filter(e=>e.className===c.className));
  if(keys.has('基础属性')||keys.has('背景加值')){
    const origin=[lib.find('species',state.answers.种族),lib.find('backgrounds',state.answers.背景)].filter(Boolean);
    files.set('起源与基础说明.txt',origin.map(info).join('\n')+'\n'+pointBuy(state.config).description+'\n背景加值：'+backgroundRule(state)+'\n');
  }
  const featNames=new Set(questions.filter(q=>/专长$|战斗风格$/.test(q.key)).flatMap(q=>q.options||[]));
  list('本轮专长候选.txt',lib.feats.filter(f=>featNames.has(f.name)));
  const selectedFeats=result.snapshot?.feats.filter(f=>questions.some(q=>q.key!==f.source&&q.key.startsWith(f.source)))||[];
  const featDetails=[...new Set(selectedFeats.map(f=>f.name))].map(n=>lib.find('feats',n)).filter(Boolean);
  list('已选专长说明.txt',featDetails);
  const classReferenceKeys={魔能祈唤:'魔能祈唤',超魔法:'超魔法'};
  for(const [key,keyword] of Object.entries(classReferenceKeys)){
    if(!keys.has(key)||!c)continue;
    for(const ref of lib.entries.filter(e=>e.kind==='class-reference'&&e.source.includes('/'+c.className+'/')&&e.name.includes(keyword))){
      files.set(ref.name+'.txt',info(ref));
    }
  }
  if(sub&&[...keys].some(k=>/地形|形态|战技|形貌|猎杀技艺|防守战术|元素亲和|星图外观/.test(k)&&k!=='野兽形态')){
    files.set('本轮子职能力.txt',featureText(sub,result.snapshot.level));
  }
  if(c&&[...keys].some(k=>['原初职能','神圣职能','元素之怒','受祝击'].includes(k))){
    files.set('本轮职业能力.txt',featureText(c,result.snapshot.level));
  }
  for(const q of questions.filter(q=>q.kind==='spell')){
    const entries=q.options.map(n=>lib.find('spells',n));
    if(entries.some(e=>!e))throw new Error('法术候选资料缺失：'+q.key);
    files.set(spellReferenceName(q),`${q.key}\n选择${q.count}项；候选${entries.length}项。\n\n`+(entries.length?entries.map((e,i)=>`${i+1}. ${info(e)}`).join('\n\n'):'先填写相关的前置选择，再继续刷新本题候选。\n'));
  }
  const shapes=questions.find(q=>q.key==='野兽形态');
  if(shapes)list('野兽形态选项.txt',shapes.options.map(n=>lib.find('beasts',n)).filter(Boolean));
  if([...keys].some(k=>['购买物品','穿戴护甲','使用盾牌','常用武器','武器精通','武器大师精通'].includes(k))){
    list('装备选项.txt',lib.equipment);
  }

  const notes=state.mode==='自由'?'自由模式可以按任意顺序填写。':'通过本轮检查后，程序会归档本轮参考并换成下一轮资料。';
  const shown=[...result.issues,...result.missing].filter(p=>state.mode==='自由'||p.stage===stage);
  const rolled=keys.has('基础属性')&&state.rolls.abilities?`属性骰点：${state.rolls.abilities.join('、')}。\n`:'';
  const refs=[...files.keys()].filter(n=>n!=='回答.txt');
  const reading=refs.length?'本轮参考（按题选读）\n'+refs.map(n=>'  '+n).join('\n')+'\n\n':'';
  files.set('本轮说明.txt',`第${state.referenceRound||1}轮 · ${state.mode}模式${state.mode==='自由'?'':' · '+STAGES[stage]}\n\n${reading}填写回答.txt，保存后双击“继续”。\n${notes}\n${rolled}\n`+
    (shown.length?shown.map(p=>p.message).join('\n'):'当前检查没有缺项。')+'\n\n完整资料可在工具目录的“TXT库”查看。\n');
  return files;
}

export function markdownPair(lib,state,result) {
  const s=result.snapshot,meta={schemaVersion:1,id:state.id,name:s.name,kind:'角色',level:pad(s.level)+'级',status:'已生成',rulesVersion:lib.version,sourceHash:lib.hash};
  const header='---\n'+JSON.stringify(meta,null,2)+'\n---\n';
  const selectionEntries=Object.entries(state.answers).filter(([k,v])=>!state.base||state.base.answers[k]!==v);
  const choices=header+'# 本级选择\n\n## 等级与来源\n'+s.level+'级'+s.className+'，2024核心。\n\n## 新增与替换\n'+selectionEntries.map(([k,v])=>`${k}：${v}`).join('\n\n')+'\n\n## 属性、专长与骰点\n'+JSON.stringify(state.rolls,null,2)+'\n\n## 待确认\n无未填写的程序必需项。\n';
  const spellNames=[...new Set([...s.cantrips,...s.prepared,...s.grantedSpells.map(g=>g.name)])];
  const ability=header+'# 能力与数值\n\n## 基础数值\n'+summary(s)+'\n## 能力速查\n'+featureText(lib.find('classes',s.className),s.level)+'\n\n'+featureText(lib.find('subclasses',s.subclass),s.level)+'\n\n'+s.feats.map(f=>info(lib.find('feats',f.name))).join('\n')+'\n## 法术与专注\n'+spellNames.map(n=>info(lib.find('spells',n))).join('\n\n')+'\n## 装备、房规与长期增益\n'+pointBuy(state.config).description+'\n背景加值：'+backgroundRule(state)+(state.config.notes?'\n'+state.config.notes:'')+'\n\n## 待确认\n开卡计算不包含战斗中的临时状态与效果结算。\n';
  return {'选择.md':choices,'能力.md':ability};
}

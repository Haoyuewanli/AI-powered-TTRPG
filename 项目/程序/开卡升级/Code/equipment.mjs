const light = ['布甲','皮甲','镶钉皮甲'];
const medium = ['兽皮甲','链甲衫','鳞甲','胸甲','半身板甲'];
const simple = ['木棒','匕首','巨棒','手斧','标枪','轻锤','硬头锤','长棍','镰刀','矛','轻弩','飞镖','短弓','投石索'];
const ranged = ['轻弩','飞镖','短弓','投石索','吹箭筒','手弩','重弩','长弓','手枪','火枪'];
const mod = n=>Math.floor((n-10)/2);
export function price(text) {
  const m=text.replaceAll(',','').match(/(\d+(?:\.\d+)?)\s*(CP|SP|EP|GP|PP)/i);
  return m?Math.round(Number(m[1])*({CP:1,SP:10,EP:50,GP:100,PP:1000}[m[2].toUpperCase()])):null;
}
export function equipmentCatalog(lib) {
  const result=new Map();
  for(const e of lib.equipment){
    const table=e.tables.find(t=>t.rows[0]?.includes('价格'));
    if(table){const h=table.rows[0],r=table.rows[1];if(!r)continue;
      const cost=price(r[h.indexOf('价格')]||'');if(cost===null)continue;
      const row={name:e.name,priceCp:cost,entry:e,weight:r[h.indexOf('重量')],damage:r[h.indexOf('伤害')],properties:r[h.indexOf('词条')],mastery:r[h.indexOf('精通')],ac:r[h.findIndex(x=>x.includes('护甲等级'))],strength:Number(r[h.indexOf('力量')]?.match(/\d+/)?.[0])||0,stealth:r[h.indexOf('隐匿')]};
      if(row.ac)row.armor=e.name==='盾牌'?'盾牌':light.includes(e.name)?'轻甲':medium.includes(e.name)?'中甲':'重甲';
      if(!result.has(e.name)||row.damage||row.ac)result.set(e.name,row);
    }else{const cost=price(e.body.match(/(?:价格|费用)[：:]\s*([^\n]+)/)?.[1]||'');if(cost!==null&&!result.has(e.name))result.set(e.name,{name:e.name,priceCp:cost,entry:e});}
  }
  if(!result.has('盾牌'))result.set('盾牌',{name:'盾牌',priceCp:1000,ac:'+2',armor:'盾牌',strength:0});
  return result;
}
export function startOptions(text) {
  const out={};
  for(const match of text.matchAll(/[（(]([ABC])[）)]\s*([\s\S]*?)(?=(?:[；;，,。]?\s*(?:或者|或)?\s*[（(][ABC][）)])|$)/g))out[match[1]]=match[2].replace(/[；;。\s]+$/,'');
  return out;
}
export function weaponProficient(name,item,training) {
  if(simple.includes(name))return training.includes('简易');
  if(!training.includes('军用'))return false;
  if(training.includes('轻型')||training.includes('灵巧'))return item.properties?.includes('轻型')||(training.includes('灵巧')&&item.properties?.includes('灵巧'));
  return true;
}
export function equipment(lib, env) {
  const {one,many,question,error,c,background,snapshot,context}=env, stage=6;
  const catalog=equipmentCatalog(lib), inventory=[], owned=new Map();
  const add=(name,count=1)=>owned.set(name,(owned.get(name)||0)+count);
  let coins=context.config?.extraGoldCp||0;
  for(const [label,entry,text] of [['职业装备',c,c.tables[0].rows.find(r=>r[0].includes('起始装备'))?.[1]],['背景装备',background,background.body.match(/装备：([^\n]+)/)?.[1]]]) {
    const opts=startOptions(text||'');
    const pick=one(label,stage,Object.keys(opts),{help:Object.entries(opts).map(([k,v])=>`${k}：${v}`).join('\n')});
    if(!pick||!opts[pick])continue;
    const contents=opts[pick];inventory.push({source:label,contents});
    const money=[...contents.matchAll(/(\d+)\s*GP/g)].at(-1);if(money)coins+=Number(money[1])*100;
    for(const [name] of catalog)if(contents.includes(name)){
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const count=contents.match(new RegExp('(\\d+)\\s*[把杆件支张个枚瓶]?'+escaped));add(name,count?Number(count[1]):1);
    }
    if(contents.includes('长棍')&&!owned.has('长棍'))add('长棍');
  }
  const purchases=many('购买物品',stage,undefined,undefined,{help:'每项写名称*数量，例如皮甲*1、匕首*2；不买填写“无”。'});
  const buys=[];
  for(const input of purchases){const m=input.match(/^(.+?)(?:\s*[*×x]\s*(\d+))?$/);if(!m)continue;const item=catalog.get(m[1].trim()),count=Number(m[2]||1);
    if(!item||!Number.isSafeInteger(count)||count<1||count>10000){error('购买物品',`无法识别或数量不合法：${input}。`,stage);continue;}
    const discount=snapshot.feats.some(f=>f.name==='巧匠')?0.8:1;
    const cost=Math.ceil(item.priceCp*count*discount);coins-=cost;add(item.name,count);buys.push({name:item.name,count,costCp:cost});
  }
  if(coins<0)error('购买物品',`资金不足，超出${(-coins/100).toFixed(2)}GP。`,stage);
  const armorName=one('穿戴护甲',stage,['无',...Array.from(catalog.values()).filter(i=>i.armor&&i.armor!=='盾牌').map(i=>i.name)]);
  const shield=one('使用盾牌',stage,['否','是']);
  const activeWeapons=many('常用武器',stage,Array.from(catalog.values()).filter(i=>i.damage).map(i=>i.name),undefined,{help:'可填多项；没有填写“无”。'});
  for(const n of [armorName,shield==='是'?'盾牌':null,...activeWeapons].filter(n=>n&&n!=='无'))if(!owned.has(n))error('装备',`没有持有${n}，请先从起始装备或购买获得。`,stage);
  const armor=catalog.get(armorName), dex=mod(snapshot.scores.敏捷), con=mod(snapshot.scores.体质), wis=mod(snapshot.scores.感知), cha=mod(snapshot.scores.魅力), notes=[];
  let ac=10+dex;
  if(armor?.ac){
    ac=Number(armor.ac.match(/\d+/)?.[0])||10;
    if(armor.armor==='轻甲')ac+=dex;
    if(armor.armor==='中甲')ac+=Math.min(dex,snapshot.feats.some(f=>f.name==='中甲大师')?3:2);
    if(!snapshot.armorTraining.includes(armor.armor))notes.push('未受训护甲：涉及力量/敏捷的D20检定有劣势，且不能施法。');
    if(armor.strength>snapshot.scores.力量)snapshot.speed-=10;
    if(armor.stealth==='劣势')notes.push('此护甲令隐匿检定具有劣势。');
    if(snapshot.feats.some(f=>f.name==='防御'))ac++;
  }else{
    if(snapshot.className==='野蛮人')ac=Math.max(ac,10+dex+con);
    if(snapshot.className==='武僧'&&shield!=='是')ac=Math.max(ac,10+dex+wis);
    if(snapshot.subclass==='舞蹈学院'&&shield!=='是')ac=Math.max(ac,10+dex+cha);
    if(snapshot.subclass==='龙族术法')ac=Math.max(ac,10+dex+cha);
  }
  if(shield==='是'){if(snapshot.armorTraining.includes('盾牌'))ac+=2;else notes.push('未受训盾牌：不能获得盾牌的AC增益。');}
  if(snapshot.className==='武僧'&&snapshot.level>=2&&!armor?.ac&&shield!=='是')snapshot.speed+=10+5*Math.floor((snapshot.level-2)/4);
  if(snapshot.className==='野蛮人'&&snapshot.level>=5&&armor?.armor!=='重甲')snapshot.speed+=10;
  if(snapshot.className==='游侠'&&snapshot.level>=6&&armor?.armor!=='重甲')snapshot.speed+=10;
  const masteryCount=snapshot.className==='战士'||snapshot.className==='野蛮人'?Number(snapshot.resources['武器精通']):['游侠','圣武士','游荡者'].includes(snapshot.className)?2:0;
  let masteries=[];
  if(masteryCount)masteries=many('武器精通',5,Array.from(catalog.values()).filter(i=>i.damage&&weaponProficient(i.name,i,snapshot.weaponTraining)).map(i=>i.name),masteryCount);
  if(snapshot.feats.some(f=>f.name==='武器大师'))masteries.push(...many('武器大师精通',5,Array.from(catalog.values()).filter(i=>i.damage&&weaponProficient(i.name,i,snapshot.weaponTraining)).map(i=>i.name),1));
  const attacks=activeWeapons.filter(n=>catalog.has(n)).map(n=>{const i=catalog.get(n),range=ranged.includes(n),str=mod(snapshot.scores.力量);let ability=range?dex:str;
    if(i.properties?.includes('灵巧'))ability=Math.max(dex,str);
    const proficient=weaponProficient(n,i,snapshot.weaponTraining), archery=range&&snapshot.feats.some(f=>f.name==='箭术');
    return {name:n,attack:ability+(proficient?snapshot.proficiency:0)+(archery?2:0),damage:i.damage,damageBonus:ability,proficient,properties:i.properties,mastery:masteries.includes(n)?i.mastery:null};});
  Object.assign(snapshot,{ac,equipment:{starting:inventory,purchases:buys,owned:Object.fromEntries(owned),gold:coins/100,armor:armorName,shield:shield==='是',weapons:activeWeapons,masteries,attacks,notes}});
  return snapshot;
}

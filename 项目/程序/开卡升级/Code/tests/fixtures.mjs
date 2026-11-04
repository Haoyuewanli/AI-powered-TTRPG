import { evaluate } from '../rules.mjs';
export function druid(lib, level=12) {
  const a={'角色名':'合成月德','目标等级':String(level),'职业':'德鲁伊','种族':'矮人','背景':'农民','属性方式':'标准数组','生命值方式':'固定值','基础属性':'8、14、13、12、15、10','背景加值':'感知、感知、体质','职业技能':'洞悉、宗教','额外语言':'精灵语、巨人语','原初职能':'术师','职业装备':'A','背景装备':'A','购买物品':'无','穿戴护甲':'皮甲','使用盾牌':'是','常用武器':'镰刀'};
  if(level>=3)a.子职='月亮结社';if(level>=7)a.元素之怒='强力施法';
  for(const [at,values] of [[4,'感知、感知'],[8,'感知、体质'],[12,'体质、敏捷'],[16,'敏捷、敏捷'],[19,'智力、智力']])if(level>=at){a[at+'级专长']='属性值提升';a[at+'级专长加值']=values;}
  const result=evaluate(lib,a);
  for(const q of result.questions.filter(q=>['职业戏法','准备法术','野兽形态'].includes(q.key)))a[q.key]=q.options.slice(0,q.count).join('、');
  return a;
}

export function basicCharacter(lib,className,level=12){
  const c=lib.find('classes',className),a={'角色名':'合成职业检查','职业':className,'目标等级':String(level),'种族':'矮人','背景':'农民','属性方式':'标准数组','生命值方式':'固定值','基础属性':'15、14、13、12、10、8','背景加值':'力量、力量、体质','子职':lib.subclasses.find(s=>s.className===c.className)?.name,'职业装备':className==='战士'?'C':'B','背景装备':'B','购买物品':'无','穿戴护甲':'无','使用盾牌':'否','常用武器':'无'};
  for(let turn=0;turn<150;turn++){
    const r=evaluate(lib,a),next=r.missing[0];if(!next)return {answers:a,result:r};
    const q=r.questions.find(q=>q.key===next.key);let value;
    if(/^\d+级专长$/.test(q.key))value='属性值提升';
    else if(/^\d+级专长加值$/.test(q.key)){const ability=['智力','感知','魅力','敏捷','体质','力量'].find(n=>r.snapshot.scores[n]<=18);value=ability+'、'+ability;}
    else if(q.options){
      let options=q.options;
      if(q.key==='准备法术'&&className==='吟游诗人')options=options.filter(n=>lib.find('spells',n).classes.includes('吟游诗人'));
      if(q.key.includes('法术书')){
        const used=Object.entries(a).filter(([k])=>k.includes('法术书')).flatMap(([,v])=>v.split('、'));
        options=options.filter(n=>!used.includes(n)).sort((a,b)=>lib.find('spells',b).spellLevel-lib.find('spells',a).spellLevel);
      }
      if(q.key==='魔能祈唤')options=['幽影护甲','魔能意志','刃之魔契','链之魔契','魔鬼视界','邪魔活力','千面之颜','幻象迷踪','超凡跳跃','星移步法'];
      value=q.multiple?(options.slice(0,q.count??0).join('、')||'无'):options[0];
    }else value=q.multiple?'无':'合成';
    if(!value)throw new Error('测试夹具无法填写：'+className+' '+q.key);
    a[q.key]=value;
  }
  throw new Error('测试夹具未能收敛。');
}

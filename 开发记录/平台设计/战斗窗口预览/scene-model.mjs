export const PALETTE = [
  {id:'cube5',name:'5尺方块',icon:'▣',kind:'block',width:5,depth:5,height:5,color:'#a8b3bd'},
  {id:'cube1',name:'1尺方块',icon:'▪',kind:'block',width:1,depth:1,height:1,color:'#c6cdd1'},
  {id:'actor',name:'参战者白板',icon:'♟',kind:'actor',width:5,depth:5,height:6,color:'#6ec9be'},
  {id:'floor',name:'地板',icon:'▱',kind:'block',width:5,depth:5,height:.5,color:'#7f938a'},
  {id:'wall',name:'矮墙',icon:'▥',kind:'block',width:5,depth:1,height:4,color:'#9daaa7'},
  {id:'pillar',name:'圆柱',icon:'▤',kind:'block',width:3,depth:3,height:8,color:'#bcb5a3'},
  {id:'ramp',name:'坡块',icon:'◩',kind:'block',width:5,depth:5,height:5,color:'#b4ad97'},
  {id:'stairs',name:'楼梯',icon:'▟',kind:'block',width:5,depth:5,height:5,color:'#a5aea9'},
  {id:'actor-large',name:'大型白板',icon:'♟',kind:'actor',width:10,depth:10,height:10,color:'#d39c78'},
  {id:'actor-small',name:'小型白板',icon:'♟',kind:'actor',width:2,depth:2,height:3,color:'#6ec9be'},
  {id:'floor1',name:'1尺地板',icon:'▫',kind:'block',width:1,depth:1,height:.5,color:'#7f938a'},
];
export const DEFAULT_SETTINGS={move:20,vertical:14,look:1};
export const demoStats=()=>({hp:30,ac:14,speed:30,initiative:2,attackBonus:5,damage:'1d8+3'});
export function initialScene(){
  const make=(id,preset,layerId,x,z,extra={})=>({...structuredClone(PALETTE.find(p=>p.id===preset)),preset,id,layerId,x,z,...extra});
  return {revision:0,layers:[{id:'ground',name:'地面',height:0},{id:'upper',name:'二层',height:10}],items:[
    make('fighter','actor','ground',22.5,22.5,{name:'演示战士',faction:'ally',stats:demoStats()}),
    make('guard','actor','ground',27.5,22.5,{name:'演示守卫',faction:'enemy',stats:demoStats()}),
    make('wall-a','wall','ground',35.5,28.5),make('wall-b','wall','ground',35.5,33.5),
    make('platform','floor','upper',42.5,32.5,{width:15,depth:15}),
  ],combat:null,log:['演示局面已就绪。选取底部积木，点击画布放置。']};
}
export const layerFor=(s,item)=>s.layers.find(l=>l.id===item.layerId);
export function snapPoint(point, preset){
  const step=preset.width===1?1:preset.kind==='actor'?preset.width:1;
  return {x:Math.floor(point.x/step)*step+step/2,z:Math.floor(point.z/step)*step+step/2};
}
export function validateScene(s){
  if(!Array.isArray(s.layers)||s.layers.length<1||s.layers.length>20)throw Error('地面层数量须为1～20');
  if(!Array.isArray(s.items)||s.items.length>2000)throw Error('演示最多放置2000件积木');
  const ids=new Set();
  for(const l of s.layers){if(ids.has(l.id))throw Error('层标识重复');ids.add(l.id);checkName(l.name);number(l.height,0,90,'层高');if(l.height%.5)throw Error('层高须对齐0.5尺');}
  const objects=new Set();
  for(const i of s.items){
    if(objects.has(i.id))throw Error('对象标识重复');objects.add(i.id);
    if(!layerFor(s,i))throw Error('积木所属地面层不存在');
    if(!PALETTE.some(p=>p.id===i.preset))throw Error('积木类型无效');
    checkName(i.name);number(i.x,-500,500,'X坐标');number(i.z,-500,500,'Z坐标');
    for(const k of ['width','depth','height']){number(i[k],.5,50,'尺寸');if(i[k]%.5)throw Error('尺寸须对齐0.5尺');}
    if(i.x%.5||i.z%.5)throw Error('位置须对齐0.5尺');
    if(layerFor(s,i).height+i.height>100)throw Error('积木顶部不能超过100尺');
    if(i.kind==='actor'){
      if(!Number.isInteger(i.width)||!Number.isInteger(i.depth)||i.width>30||i.depth>30)throw Error('参战者占地宽深须为1～30尺整数');
      if(!['ally','enemy','neutral'].includes(i.faction))throw Error('请选择阵营');
      if(i.stats){for(const [k,min,max] of [['hp',1,9999],['ac',0,50],['speed',0,300],['initiative',-30,100],['attackBonus',-30,100]]){
        number(i.stats[k],min,max,k);if(!Number.isInteger(i.stats[k]))throw Error('战斗数值须为整数');
      }if(!/^([1-9]|1\d|20)d(4|6|8|10|12|20|100)([+-]\d{1,3})?$/.test(i.stats.damage))throw Error('伤害请填写如1d8+3（最多20颗常见D&D骰）');}
    }
  }
}
function number(n,min,max,label){if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(`${label}须在${min}～${max}之间`);}
function checkName(n){if(typeof n!=='string'||!n.trim()||n.length>80)throw Error('名称须为1～80字');}
export function editScene(original,type,p={},id){
  const s=structuredClone(original);
  if(s.combat?.combat.phase==='active')throw Error('正在战斗；请先结束战斗再调整场景');
  if(type==='place'){
    const preset=PALETTE.find(x=>x.id===p.preset);if(!preset)throw Error('请选择有效积木');
    if(s.items.some(i=>i.layerId===p.layerId&&i.x===p.x&&i.z===p.z&&i.preset===p.preset))throw Error('该位置已有相同积木');
    if(preset.kind==='actor'&&s.items.filter(i=>i.kind==='actor').length>=40)throw Error('最多40名参战者');
    s.items.push({...preset,preset:preset.id,id,layerId:p.layerId,x:p.x,z:p.z,...(preset.kind==='actor'?{faction:'ally',stats:null}:{})});
  }else if(type==='edit'){
    const item=s.items.find(i=>i.id===p.id);if(!item)throw Error('对象不存在');
    const keys=['name','width','depth','height','x','z','layerId',...(item.kind==='actor'?['faction','stats']:[])];
    if(Object.keys(p.patch||{}).some(k=>!keys.includes(k)))throw Error('不支持的编辑字段');Object.assign(item,p.patch);
  }else if(type==='remove'){
    if(!s.items.some(i=>i.id===p.id))throw Error('对象不存在');s.items=s.items.filter(i=>i.id!==p.id);
  }else if(type==='layer-add')s.layers.push({id,name:p.name,height:p.height});
  else if(type==='layer-edit'){
    const l=s.layers.find(l=>l.id===p.id);if(!l)throw Error('地面层不存在');Object.assign(l,{name:p.name,height:p.height});
  }else throw Error('未知场景操作');
  if(s.combat)s.combat=null;
  validateScene(s);return s;
}

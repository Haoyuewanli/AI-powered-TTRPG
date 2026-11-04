import {CELL,clean,cellIndex,aligned,voxelCells,cellKey} from './voxel-grid.mjs';
export const PALETTE = [
  {id:'cube5',name:'大方块 · 1',icon:'▣',kind:'block',width:1.0,depth:1.0,height:1.0,color:'#a8b3bd'},
  {id:'cube1',name:'小方块 · 0.2',icon:'▪',kind:'block',width:0.2,depth:0.2,height:0.2,color:'#c6cdd1'},
  {id:'actor',name:'参战者白板',icon:'♟',kind:'actor',width:1.0,depth:1.0,height:1.2,color:'#6ec9be'},
  {id:'floor',name:'地板',icon:'▱',kind:'block',width:1.0,depth:1.0,height:0.2,color:'#7f938a'},
  {id:'wall',name:'矮墙',icon:'▥',kind:'block',width:1.0,depth:0.2,height:0.8,color:'#9daaa7'},
  {id:'pillar',name:'圆柱',icon:'▤',kind:'block',width:0.6,depth:0.6,height:1.6,color:'#bcb5a3'},
  {id:'ramp',name:'坡块',icon:'◩',kind:'block',width:1.0,depth:1.0,height:1.0,color:'#b4ad97'},
  {id:'stairs',name:'楼梯',icon:'▟',kind:'block',width:1.0,depth:1.0,height:1.0,color:'#a5aea9'},
  {id:'actor-large',name:'大型白板',icon:'♟',kind:'actor',width:2.0,depth:2.0,height:2.0,color:'#d39c78'},
  {id:'actor-small',name:'小型白板',icon:'♟',kind:'actor',width:0.4,depth:0.4,height:0.6,color:'#6ec9be'},
  {id:'floor1',name:'1尺地板',icon:'▫',kind:'block',width:0.2,depth:0.2,height:0.2,color:'#7f938a'},
];
export const DEFAULT_SETTINGS={move:20,vertical:14,look:1};
export const demoStats=()=>({hp:30,ac:14,speed:30,initiative:2,attackBonus:5,damage:'1d8+3'});
export function initialScene(){
  const make=(id,preset,layerId,x,z,extra={})=>({...structuredClone(PALETTE.find(p=>p.id===preset)),preset,id,layerId,x,z,...extra});
  return {schemaVersion:3,cellSize:CELL,revision:0,layers:[{id:'ground',name:'地面',height:0},{id:'upper',name:'二层',height:2}],items:[
    make('fighter','actor','ground',4,4,{name:'演示战士',faction:'ally',stats:demoStats()}),
    make('guard','actor','ground',5,4,{name:'演示守卫',faction:'enemy',stats:demoStats()}),
    make('wall-a','wall','ground',6.6,5.6),make('wall-b','wall','ground',6.6,6.6),
    make('platform','floor','upper',7,5,{width:3,depth:3}),
  ],combat:null,log:['演示局面已就绪。选取底部积木，点击画布放置。']};
}
export const layerFor=(s,item)=>s.layers.find(l=>l.id===item.layerId);
export function snapPoint(point, preset){
  const step=preset.id==='cube5'||preset.preset==='cube5'?1:CELL;
  const floor=n=>clean(Math.floor(n/step+1e-9)*step);
  return {x:floor(point.x),z:floor(point.z)};
}
export function occupiedCells(s){
  const occupied=new Set();
  for(const i of s.items.filter(i=>i.kind==='block')){
    const ox=cellIndex(i.x),oz=cellIndex(i.z),oy=cellIndex(layerFor(s,i).height);
    for(const [x,y,z] of voxelCells(i))occupied.add(cellKey(x+ox,y+oy,z+oz));
  }
  return occupied;
}
export function placementCells(preset,p,layerHeight){
  return voxelCells(preset).map(([x,y,z])=>cellKey(x+cellIndex(p.x),y+cellIndex(layerHeight),z+cellIndex(p.z)));
}
export function validateScene(s){
  if(!Array.isArray(s.layers)||s.layers.length<1||s.layers.length>20)throw Error('地面层数量须为1～20');
  if(!Array.isArray(s.items)||s.items.length>2000)throw Error('演示最多放置2000件积木');
  const ids=new Set();
  for(const l of s.layers){if(ids.has(l.id))throw Error('层标识重复');ids.add(l.id);checkName(l.name);number(l.height,0,18,'层高');if(!aligned(l.height))throw Error('层高须对齐0.2坐标');}
  const volume=s.items.reduce((n,i)=>n+cellIndex(i.width)*cellIndex(i.depth)*cellIndex(i.height),0);
  if(volume>250000)throw Error('预览最多容纳25万个小方块，请缩小尺寸或减少积木');
  const objects=new Set();
  for(const i of s.items){
    if(objects.has(i.id))throw Error('对象标识重复');objects.add(i.id);
    if(!layerFor(s,i))throw Error('积木所属地面层不存在');
    if(!PALETTE.some(p=>p.id===i.preset))throw Error('积木类型无效');
    checkName(i.name);number(i.x,-100,100,'X坐标');number(i.z,-100,100,'Z坐标');
    for(const k of ['width','depth','height']){number(i[k],CELL,10,'尺寸');if(!aligned(i[k]))throw Error('尺寸须为0.2的整数倍');}
    if(!aligned(i.x)||!aligned(i.z))throw Error('位置须对齐0.2坐标');
    if(layerFor(s,i).height+i.height>20)throw Error('积木顶部坐标不能超过20');
    if(i.kind==='actor'){
      if(i.width>6||i.depth>6)throw Error('参战者占地宽深不能超过6坐标单位');
      if(!['ally','enemy','neutral'].includes(i.faction))throw Error('请选择阵营');
      if(i.stats){for(const [k,min,max] of [['hp',1,9999],['ac',0,50],['speed',0,300],['initiative',-30,100],['attackBonus',-30,100]]){
        number(i.stats[k],min,max,k);if(!Number.isInteger(i.stats[k]))throw Error('战斗数值须为整数');
      }if(!/^([1-9]|1\d|20)d(4|6|8|10|12|20|100)([+-]\d{1,3})?$/.test(i.stats.damage))throw Error('伤害请填写如1d8+3（最多20颗常见D&D骰）');}
    }
  }
  const occupied=new Set();
  for(const item of s.items.filter(i=>i.kind==='block'))for(const key of placementCells(item,item,layerFor(s,item).height)){
    if(occupied.has(key))throw Error('场景积木的小格发生重叠，请调整位置或尺寸');occupied.add(key);
  }
}
function number(n,min,max,label){if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(`${label}须在${min}～${max}之间`);}
function checkName(n){if(typeof n!=='string'||!n.trim()||n.length>80)throw Error('名称须为1～80字');}
export function editScene(original,type,p={},id){
  const s=structuredClone(original);
  if(s.combat?.combat.phase==='active')throw Error('正在战斗；请先结束战斗再调整场景');
  if(type==='place'||type==='paint'){
    const preset=PALETTE.find(x=>x.id===p.preset);if(!preset)throw Error('请选择有效积木');
    const layer=s.layers.find(l=>l.id===p.layerId);if(!layer)throw Error('积木所属地面层不存在');
    if(type==='paint'&&!['cube1','cube5'].includes(p.preset))throw Error('按住铺设仅支持大小方块');
    const points=type==='paint'?p.points:[p];
    if(!Array.isArray(points)||!points.length||points.length>1000)throw Error('单次铺设须为1～1000格');
    const occupied=preset.kind==='block'?occupiedCells(s):null;let count=0;
    for(const point of points){
      if(!point||!aligned(point.x)||!aligned(point.z))throw Error('位置须对齐0.2坐标');
      const keys=occupied?placementCells(preset,point,layer.height):[];
      const duplicate=s.items.some(i=>i.layerId===p.layerId&&i.x===point.x&&i.z===point.z&&i.preset===p.preset);
      if(duplicate||keys.some(k=>occupied.has(k))){if(type==='paint')continue;throw Error('该位置已有积木占用，不能重复铺设');}
      if(preset.kind==='actor'&&s.items.filter(i=>i.kind==='actor').length>=40)throw Error('最多40名参战者');
      s.items.push({...preset,preset:preset.id,id:type==='paint'?`${id}-${count}`:id,layerId:p.layerId,x:clean(point.x),z:clean(point.z),...(preset.kind==='actor'?{faction:'ally',stats:null}:{})});
      count++;for(const k of keys)occupied.add(k);
    }
    if(!count)return original;
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

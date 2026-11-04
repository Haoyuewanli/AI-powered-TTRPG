import {randomUUID} from 'node:crypto';
import {atomicJson} from '../../../项目/程序/战斗/Code/src/store.mjs';
import {executeAction,validateState,planAttack} from '../../../项目/程序/战斗/Code/src/rules.mjs';
import {newBattleState} from '../../../项目/程序/战斗/Code/src/workspace.mjs';
import {initialScene,editScene,layerFor,validateScene} from './scene-model.mjs';
import {toFeet,renderItem,clean} from './voxel-grid.mjs';

const dm={role:'dm',id:'DM'};
export function battleFromScene(scene){
  validateScene(scene);
  const actors=scene.items.filter(i=>i.kind==='actor').map(renderItem);
  if(!actors.length)throw Error('请先从物品栏放置至少一名参战者');
  const missing=actors.filter(i=>!i.stats);if(missing.length)throw Error(`请先完善战斗数值：${missing.map(i=>i.name).join('、')}`);
  const s=newBattleState('preview-v2','preview-battle','预览战斗');
  s.board={...s.board,width:100,depth:100};
  s.actors=actors.map((i,index)=>({id:i.id,name:i.name,kind:i.faction==='ally'?'pc':'npc',ownerId:i.faction==='ally'?`player-${index+1}`:null,
    ac:i.stats.ac,hp:i.stats.hp,maxHp:i.stats.hp,tempHp:0,speed:i.stats.speed,initiativeBonus:i.stats.initiative,attackLimit:1,tiePriority:index,
    body:{width:Math.min(i.width,3),depth:Math.min(i.depth,2),height:i.height},space:{width:i.width,depth:i.depth},position:{x:i.x,y:toFeet(layerFor(scene,i).height),z:i.z},
    facing:0,immunities:[],resistances:[],vulnerabilities:[],notes:'预览演示',resources:'',hidden:false,confirmed:true,
    attacks:[{id:'basic',name:'武器攻击',kind:'melee',bonus:i.stats.attackBonus,reach:5,damage:[{formula:i.stats.damage,type:'slashing'}]}]}));
  s.objects=scene.items.filter(i=>i.kind==='block').map(renderItem).map(i=>({id:i.id,name:i.name,type:i.preset.startsWith('floor')?'tile':i.preset==='stairs'?'stairs':'prop',
    shape:i.preset==='pillar'?'cylinder':i.preset==='ramp'?'ramp':'box',position:{x:i.x,y:toFeet(layerFor(scene,i).height),z:i.z},
    size:{width:i.width,depth:i.depth,height:i.height},rotation:0,hidden:false,blocksMovement:!i.preset.startsWith('floor')}));
  validateState(s);return s;
}
export async function createPreviewStore(file){
  let state=initialScene(),history=[],queue=Promise.resolve();
  await atomicJson(file,state);
  function command(type,payload={},actionId=randomUUID()){
    return {campaignId:state.combat.campaignId,battleId:state.combat.battleId,expectedRevision:state.combat.revision,actionId,type,payload};
  }
  return {get:()=>structuredClone(state),
    plan(payload){if(!state.combat)throw Error('请先开始战斗');const plan=planAttack(state.combat,payload,dm);return {distance:plan.distance,attack:plan.attack.name};},
    dispatch(body){const run=queue.then(async()=>{
      if(body.revision!==state.revision)throw Error('画布已更新，请重试本次操作');
      const before=structuredClone(state);let next,undo=false;
      if(body.type==='undo'){
        if(!history.length)throw Error('没有可撤销的操作');next=structuredClone(history.at(-1));undo=true;
      }else if(body.type==='battle-start'){
        if(state.combat?.combat.phase==='active')throw Error('战斗已经开始');
        const s=battleFromScene(state);
        next=structuredClone(state);next.combat=executeAction(s,{campaignId:s.campaignId,battleId:s.battleId,expectedRevision:s.revision,actionId:randomUUID(),type:'start',payload:{}},dm);
      }else if(body.type==='battle-action'){
        if(!state.combat)throw Error('请先开始战斗');
        if(!['attack','move','dash','next','end','adjudicate'].includes(body.action))throw Error('不支持此战斗操作');
        next=structuredClone(state);next.combat=executeAction(state.combat,command(body.action,body.payload),dm);
        for(const a of next.combat.actors){const item=next.items.find(i=>i.id===a.id);item.x=clean(a.position.x/5-item.width/2);item.z=clean(a.position.z/5-item.depth/2);}
      }else next=editScene(state,body.type,body.payload,randomUUID());
      if(next===state)return structuredClone(state);
      next.revision=state.revision+1;
      const event=next.combat?.events.at(-1);
      const messages={place:'积木已放置',paint:`连续铺设完成：新增 ${next.items.length-before.items.length} 件，整笔可撤销`,edit:'对象已更新',remove:'对象已移出',undo:'已撤销上一步','layer-add':'地面层已创建','layer-edit':'地面层及所属物件高度已更新'};
      const message=body.type.startsWith('battle')?(event?.dmText||event?.publicText||'战斗状态已更新'):messages[body.type];
      next.log=[...state.log,message].slice(-40);
      await atomicJson(file,next);
      if(undo)history.pop();else{history.push(before);if(history.length>50)history.shift();}
      state=next;return structuredClone(state);
    });queue=run.catch(()=>{});return run;}
  };
}

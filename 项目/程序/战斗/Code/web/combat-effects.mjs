import * as THREE from '/vendor/three.module.js';
import { attackPose } from '/data/model-catalog.mjs';

export function playActorAnimation(model, {weapon=model?.userData?.weapon||'none',kind='attack',duration=kind==='magic'?1.05:.8}={}) {
  if (!model?.userData.rig) return;
  model.userData.motion={weapon,kind,duration:Math.max(.15,Math.min(3,duration)),elapsed:0};
}
export function tickActorModel(model, deltaSeconds) {
  const motion=model?.userData.motion,rig=model?.userData.rig;if(!motion||!rig)return false;
  motion.elapsed+=Math.max(0,Math.min(.1,deltaSeconds));
  const progress=Math.min(1,motion.elapsed/motion.duration),pose=attackPose(motion.weapon,progress,motion.kind==='magic');
  rig.right.rotation.set(pose.rightX,pose.rightY,pose.rightZ);rig.left.rotation.set(pose.leftX,pose.leftY,pose.leftZ);rig.torso.rotation.y=pose.torsoY;
  rig.right.position.copy(rig.rightRest);rig.right.position.z+=pose.reach;
  rig.weapon.rotation.set(pose.weaponX,0,pose.weaponZ);
  if(rig.weapon.userData.bowString)rig.weapon.userData.bowString.position.x=2.1+pose.draw*1.7;
  if(progress<1)return true;
  rig.right.rotation.set(0,0,0);rig.left.rotation.set(0,0,0);rig.torso.rotation.y=0;rig.right.position.copy(rig.rightRest);rig.weapon.rotation.set(0,0,0);
  if(rig.weapon.userData.bowString)rig.weapon.userData.bowString.position.x=2.1;
  delete model.userData.motion;return false;
}

function dispose(group) {
  group.traverse(item=>{item.geometry?.dispose();for(const material of Array.isArray(item.material)?item.material:item.material?[item.material]:[])material.dispose();});
  group.removeFromParent();
}

export class BattleEffects {
  constructor(scene){this.scene=scene;this.entries=[];}
  play({source,target,weapon='none',magic=false,color='#83baf0'}) {
    if(!source||!target)return;
    const start=new THREE.Vector3(source.x,source.y,source.z),end=new THREE.Vector3(target.x,target.y,target.z),group=new THREE.Group();
    if(![...start.toArray(),...end.toArray()].every(Number.isFinite))return;
    group.name=magic?'spell-particles':'weapon-effect';this.scene.add(group);
    const material=new THREE.MeshBasicMaterial({color:magic&&/^#[0-9a-f]{6}$/i.test(color)?color:'#e1d9b1',transparent:true,opacity:1,depthWrite:false});
    if(magic) {
      // All schools share one particle shape and trajectory; the spell palette is the only variation.
      for(let i=0;i<30;i++){
        const particle=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.13),material.clone());
        particle.userData.phase=i/30;particle.userData.angle=i*2.399963;group.add(particle);
      }
      material.dispose();
    } else if(['bow','crossbow','spear','dagger'].includes(weapon)) {
      const length=weapon==='crossbow'?.8:weapon==='spear'?2.3:weapon==='dagger'?.6:1.3;
      const shaft=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,length),material);group.add(shaft);
      const point=new THREE.Mesh(new THREE.ConeGeometry(.13,.3,4),material.clone());point.rotation.x=Math.PI/2;point.position.z=length/2+.1;group.add(point);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),end.clone().sub(start).normalize());
    } else {
      const spark=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3),material);group.add(spark);
    }
    this.entries.push({group,start,end,magic,weapon,elapsed:0,duration:magic?.85:['bow','crossbow','spear','dagger'].includes(weapon)?.55:.35});
  }
  update(deltaSeconds) {
    const delta=Math.max(0,Math.min(.1,deltaSeconds));
    this.entries=this.entries.filter(effect=>{
      effect.elapsed+=delta;const t=Math.min(1,effect.elapsed/effect.duration),{group,start,end}=effect;
      if(effect.magic){
        for(const particle of group.children){const p=particle.userData,flight=Math.max(0,Math.min(1,t*1.55-p.phase*.55)),radius=.12+Math.sin(flight*Math.PI)*.55;
          particle.position.lerpVectors(start,end,flight);particle.position.x+=Math.cos(p.angle+t*8)*radius;particle.position.y+=Math.sin(p.angle+t*8)*radius;
          particle.rotation.set(t*5+p.angle,t*7,0);particle.material.opacity=(1-t)*.9;
        }
      }else{
        group.position.lerpVectors(start,end,t);
        if(!['bow','crossbow','spear','dagger'].includes(effect.weapon)){group.position.copy(end);group.scale.setScalar(.6+t*2.3);}
        for(const particle of group.children)particle.material.opacity=1-t;
      }
      if(t<1)return true;dispose(group);return false;
    });
    return this.entries.length>0;
  }
  clear(){for(const effect of this.entries)dispose(effect.group);this.entries=[];}
}

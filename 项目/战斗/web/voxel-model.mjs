import * as THREE from '/vendor/three.module.js';
const armorColors = {leather:'#85593a',chain:'#929fa2',iron:'#c6d0d7',gold:'#eac252',diamond:'#50d4d0'};
export function voxelModel(actor) {
 const a=actor.appearance || {}, group=new THREE.Group();
 const skin=a.skin || (a.preset==='monster'?'#7aab75':a.preset==='giant'?'#9ccde0':'#d6ae88');
 const shirt=a.clothes || (actor.kind==='pc'?'#347e8b':'#866158');
 const box=(w,h,d,x,y,z,color)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.8,transparent:!!actor.hidden,opacity:actor.hidden?.45:1}));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.actorId=actor.id;group.add(mesh);return mesh;};
 // Normalized body: 32 units tall, 16 units across, 8 units deep.
 box(8,8,8,0,28,0,skin);box(8,12,4,0,18,0,shirt);
 box(4,12,4,-6,18,0,skin);box(4,12,4,6,18,0,skin);
 box(4,5,4,-6,21.5,0,shirt);box(4,5,4,6,21.5,0,shirt);
 box(4,12,4,-2,6,0,'#354451');box(4,12,4,2,6,0,'#354451');
 box(8.2,2,8.2,0,31.2,0,a.hair || '#4d382c');
 for(const x of [-2,2]) {box(1.4,1,0.2,x,28,4.1,'#f2f3e4');box(.6,1,.25,x,28,4.2,'#233143');}
 box(2,.6,.2,0,25.4,4.1,'#8b6052');
 const equip=a.armor || {};
 if(armorColors[equip.head]) {const c=armorColors[equip.head];box(9,2,9,0,32,0,c);box(1,6,9,-4.1,29,0,c);box(1,6,9,4.1,29,0,c);box(9,6,1,0,29,-4,c);}
 if(armorColors[equip.chest]) {const c=armorColors[equip.chest];box(8.6,10,5,0,18,0,c);box(4.5,4,5,-6,22,0,c);box(4.5,4,5,6,22,0,c);}
 if(armorColors[equip.legs]) for(const x of [-2,2]) box(4.2,7,4.6,x,8.5,0,armorColors[equip.legs]);
 if(armorColors[equip.feet]) for(const x of [-2,2]) box(4.3,4,5,x,2,.4,armorColors[equip.feet]);
 const weapon=a.weapon || 'none', metal=armorColors[a.material] || '#c6d0d7';
 if(['sword','axe','club'].includes(weapon)) {
  box(1.3,8,1.3,-6,11,3.8,'#69482f');
  if(weapon==='sword'){box(2,11,1,-6,21,3.8,metal);box(6,1.3,1.5,-6,15.5,3.8,'#e2bf6c');}
  if(weapon==='axe'){box(1.5,11,1.5,-6,20,3.8,'#69482f');box(6,5,1.5,-8,24,3.8,metal);}
  if(weapon==='club'){box(3,11,3,-6,21,3.8,'#96734c');box(4,5,4,-6,24,3.8,'#ad8757');}
 }
 if(weapon==='bow') {for(let i=0;i<5;i++)box(1,3,1,-7+Math.abs(i-2)*.7,10+i*3,4,'#96734c');box(.3,15,.3,-5.6,16,4,'#e7ddbc');}
 if(a.shield) {box(6,9,1.5,7,14,3.5,'#ad8457');box(1,9,1.7,7,14,3.5,metal);box(6,1,1.7,7,14,3.5,metal);}
 group.scale.set(actor.body.width/16,actor.body.height/32,actor.body.depth/8);
 group.userData.voxel=true; return group;
}

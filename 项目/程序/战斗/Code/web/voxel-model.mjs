import * as THREE from '/vendor/three.module.js';
import { modelDescriptor } from '/data/model-catalog.mjs';

const armorColors = {leather:'#85593a',chain:'#929fa2',iron:'#c6d0d7',gold:'#eac252',diamond:'#50d4d0'};
const clothColors = {fur:'#80553e',performer:'#884c85',priest:'#e4dfc8',leaves:'#46694b',soldier:'#557b98',wraps:'#bd7950',knight:'#336fa7',scout:'#466d51',leather:'#3f465d',silk:'#9d4d6c',occult:'#624a81',robe:'#3b5d94',engineer:'#aa804b'};

export function voxelModel(actor) {
  const appearance = actor.appearance || {}, descriptor = modelDescriptor({...appearance, classId: appearance.classId || actor.classTestProfile?.classId, preset: appearance.preset || (actor.kind === 'npc' ? 'monster' : 'human')});
  const group = new THREE.Group(), figure = new THREE.Group(), torso = new THREE.Group(); group.add(figure); figure.add(torso);
  group.userData.voxel = true; group.userData.modelId = descriptor.modelId; group.userData.actorId = actor.id;
  group.userData.descriptor = descriptor;
  const anatomy = descriptor.monster ? 'monster' : descriptor.species.anatomy, outfit = descriptor.profession.outfit;
  const palette = /dragon|lizard|snake|goblin|tusks/.test(anatomy) ? '#77a17b' : /construct|stone/.test(anatomy) ? '#a4b3b6' : /infernal/.test(anatomy) ? '#b3788d' : /bird|crow/.test(anatomy) ? '#6d7780' : '#d6ae88';
  const skin = appearance.skin || (descriptor.monster ? '#7aab75' : palette), cloth = appearance.clothes || clothColors[outfit], hair = appearance.hair || '#4d382c', metal = armorColors[appearance.material] || '#bac8cd';
  const box = (parent, name, w,h,d,x,y,z,color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({color:new THREE.Color(color).convertSRGBToLinear(),roughness:.8,transparent:!!actor.hidden,opacity:actor.hidden?.45:1}));
    mesh.name = name; mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.actorId = actor.id; parent.add(mesh); return mesh;
  };
  const block = (name,w,h,d,x,y,z,color,parent=torso) => box(parent,name,w,h,d,x,y,z,color);
  const wide = ['beard','grey-dwarf','stone','tusks','bull','shell','construct','long-arms'].includes(anatomy) ? 1.18 : ['ears','sea-elf','shadow-elf','season-elf','gith-warrior','gith-monk'].includes(anatomy) ? .87 : 1;
  const short = ['beard','grey-dwarf','nose','deep-gnome','barefoot','goblin','small-dragon','fairy'].includes(anatomy);
  const legHeight = short ? 9 : anatomy === 'long-arms' ? 13 : 12, hip = legHeight;
  const bodyHeight = 12, shoulders = hip + bodyHeight, headSize = anatomy === 'nose' ? 9.5 : anatomy === 'small-dragon' ? 7 : 8;
  const headY = shoulders + headSize/2;
  block('torso',8*wide,bodyHeight,4,0,hip+6,0,descriptor.monster?skin:cloth);
  for(const side of [-1,1]) {
    block('leg',3.8,legHeight,4,side*2,legHeight/2,0,descriptor.monster?skin:'#354451');
    block('foot',4.1,2,5,side*2,1,.5,anatomy==='barefoot'?skin:'#3b3531');
  }
  const head = new THREE.Group(); head.position.set(0,headY,0); torso.add(head);
  block('head',headSize,headSize,headSize,0,0,0,skin,head);
  const right = new THREE.Group(), left = new THREE.Group();
  right.position.set(-6*wide,shoulders-1,0); left.position.set(6*wide,shoulders-1,0); torso.add(right,left);
  for(const arm of [right,left]) {
    const length = anatomy==='long-arms'?15:12;
    block('arm',4,length,4,0,-length/2,0,skin,arm);
    if(!descriptor.monster) block('sleeve',4.2,4.5,4.2,0,-2.25,0,cloth,arm);
  }
  if(!descriptor.monster) {
    block('hair',headSize+.2,2,headSize+.2,0,headSize/2-.7,0,hair,head);
    if(!['dragon','small-dragon','bird','crow','lizard','bull','snake'].includes(anatomy)) block('nose',1.2,1.6,1.1,0,-.2,headSize/2+.25,skin,head);
    for(const side of [-1,1]) { block('eye',1.6,1,.25,side*2,.5,headSize/2+.14,'#f2f3e4',head); block('pupil',.7,1,.3,side*2,.5,headSize/2+.19,'#233143',head); }
    block('mouth',2,.5,.3,0,-2.2,headSize/2+.2,'#8b6052',head);
    addAnatomy(); addOutfit();
  } else {
    for(const side of [-1,1]) block('monster-eye',1.5,1,.3,side*2,.5,4.2,'#203b27',head);
  }

  function ear(size=3, color=skin) { for(const side of [-1,1]) block('ear',size,2,1.6,side*(headSize/2+size/2-.2),1.5,0,color,head); }
  function horns(size=4) { for(const side of [-1,1]) { block('horn-base',1.8,size,1.8,side*3,headSize/2+size/2-.5,0,'#d8c8a3',head); block('horn-tip',1.3,1.8,1.3,side*3.6,headSize/2+size,.2,'#f0e3c2',head); } }
  function tail(color=skin, length=8) { const part=block('tail',2,2,length,0,hip+1,-length/2-2,color); part.rotation.x=-.25; }
  function wings(color, length=7, thin=false) { for(const side of [-1,1]) { const part=block('wing',length,thin?.8:3,1,side*(length/2+3),shoulders-1,-3,color); part.rotation.z=side*.3; } }
  function addAnatomy() {
    switch(anatomy) {
      case 'celestial': {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(4.5,.55,4,12),new THREE.MeshStandardMaterial({color:'#e5ca75',emissive:'#9d7c23',emissiveIntensity:.2}));
        halo.rotation.x=Math.PI/2; halo.position.y=shoulders+headSize+3; halo.name='halo'; torso.add(halo); wings('#dedbcc',4,true); break;
      }
      case 'dragon': case 'small-dragon': block('muzzle',5,3,4,0,-1.5,headSize/2+1,skin,head); horns(anatomy==='dragon'?3:1.8); tail(skin,anatomy==='dragon'?9:7); break;
      case 'beard': block('beard',7,6,2,0,-3.5,4.3,hair,head); block('brow',7,1,1,0,2,4.2,hair,head); break;
      case 'ears': ear(3.7); break;
      case 'sea-elf': ear(3.8,'#7ebbb7');for(const side of [-1,1]){block('gill-ridge',.7,3.7,.6,side*3,-1,4.4,'#75a5a7',head);block('webbed-hand',5,3,1,side*6,hip+2,2,'#82b4b0');}break;
      case 'season-elf': ear(4);for(const side of [-1,1]){const branch=block('season-crown',1.2,5,2,side*2.8,5.5,0,'#8a9b65',head);branch.rotation.z=side*.35;block('crown-leaf',3,1.5,2,side*4.4,6,0,'#9faa6f',head);}break;
      case 'shadow-elf': ear(3.4);for(const side of [-1,1]){block('tear-chain',.45,4,.6,side*2,-1.2,4.5,'#8f9eaa',head);block('ear-chain',.5,3,.5,side*6,0,0,'#9babb8',head);}break;
      case 'half-ears': ear(2.1); block('sideburn',1,3,1,-4.4,-1.6,2,hair,head); break;
      case 'nose': ear(2); block('large-nose',2,2,2,0,-.5,headSize/2+.6,skin,head); break;
      case 'deep-gnome': ear(2.5);block('deep-nose',2.4,2,2.8,0,-.5,headSize/2+.8,skin,head);block('deep-brow',7,1.6,1.2,0,2,4.2,'#929d9e',head);break;
      case 'grey-dwarf':block('grey-beard',7,7,2.5,0,-3.5,4.3,'#b8bec3',head);block('grey-brow',8,1.3,1.3,0,2,4.2,'#a2aeb4',head);for(const side of [-1,1])block('beard-ring',1.3,1.5,2.8,side*2,-5.5,4.3,'#acb4b5',head);break;
      case 'stone': block('stone-brow',7,1.2,1.5,0,2,4.2,'#617f8b',head); for(const side of [-1,1])block('stone-mark',1,4,.4,side*3,-.5,4.2,'#617f8b',head); break;
      case 'barefoot': block('curly-hair',9,3,9,0,3.3,0,hair,head); block('foot-hair',3,.5,2,-2,2.1,1,hair); break;
      case 'tusks': for(const side of [-1,1])block('tusk',1,2.6,1,side*2,-1.7,4.8,'#f0e6ca',head); block('heavy-brow',7,1.5,1,0,2,4.3,skin,head); break;
      case 'infernal': horns(4.5); tail('#ad7184',9); break;
      case 'cat': for(const side of [-1,1]) {block('cat-ear',2.5,4,2.5,side*3,4.6,0,skin,head);block('whisker',4,.3,.3,side*4,-1.2,4.5,'#e4d5b8',head);} tail(skin,11); break;
      case 'goat': horns(2.2); ear(2.4); for(const side of [-1,1])block('hoof',4,3,5,side*2,1.5,.6,'#44382c'); tail(skin,3); break;
      case 'snake': block('snake-jaw',6,2.5,1.7,0,-2,4.2,skin,head); for(const side of [-1,1])block('fang',.7,1.5,.7,side*1.5,-2,5.1,'#e9e3c8',head); break;
      case 'goblin-warrior': ear(3.4); block('red-muzzle',6,3,1,0,-1.8,4.3,'#b17b66',head); break;
      case 'goblin': ear(4); block('goblin-nose',1.8,2.5,2.5,0,-.4,4.8,skin,head); break;
      case 'firbolg': ear(3); block('bovine-nose',4,2.2,2,0,-1.8,4.3,'#b78c86',head); block('beard',7,3,2,0,-3.2,4.3,hair,head); break;
      case 'shell': {const shell=block('shell',11,15,5,0,hip+7,-4,'#627856'); for(const side of [-1,1])block('shell-ridge',1,13,1,side*3,hip+7,-6.7,'#bca877'); block('beak',4,2,1.5,0,-2,4.6,'#a79261',head); break;}
      case 'beast': ear(2.7); block('ruff',11,4,6,0,shoulders-1,0,hair); for(const side of [-1,1])block('fang',.8,1.8,.7,side*1.7,-1.8,4.5,'#e9e3c8',head); break;
      case 'mask': block('mask-brow',7,.7,.6,0,2,4.3,'#d3d8dc',head); block('mask-chin',3,1.2,1,0,-3,4,'#bcc8ce',head); break;
      case 'gith-warrior': ear(3.4); block('gith-nose',1.5,2.4,.7,0,-.2,4.2,skin,head); block('head-crest',2,5,5,0,5,0,hair,head); break;
      case 'gith-monk': ear(2.9); block('brow-ridge',5,.8,.5,0,2.6,4.2,'#adb282',head); block('chin',2,2,1,0,-4.4,1,skin,head); break;
      case 'crystal': block('forehead-crystal',1.8,2.2,1,0,2.1,4.2,'#93d6dc',head); block('hair-flow',7,7,2,0,0,-4.2,hair,head); break;
      case 'bird': wings('#bead80',8); block('beak',3,2.5,5,0,-.9,5.4,'#c7a35e',head); for(const side of [-1,1])block('talon',3,1.5,5.5,side*2,.8,1.2,'#b39458'); break;
      case 'crow': block('beak',3,3,6,0,-1.3,5.5,'#343b43',head); block('back-feathers',9,9,2,0,shoulders-4,-3.2,'#3f4852'); break;
      case 'bull': horns(4); block('bull-muzzle',6,3.5,4,0,-1.5,4.4,skin,head); ear(2); tail(skin,6); break;
      case 'centaur': block('horse-body',9,8,16,0,8,-5,skin); for(const side of [-1,1])block('hindleg',3,8,3,side*3,4,-11,skin); tail(hair,7); break;
      case 'fins': ear(3,'#6bafa8'); block('head-fin',1.3,5,8,0,5,0,'#6bafa8',head); for(const side of [-1,1])block('forearm-fin',2,5,1,side*8,hip+6,0,'#6bafa8'); break;
      case 'rabbit': for(const side of [-1,1])block('rabbit-ear',2.4,9,2.3,side*2.4,7.2,0,skin,head); block('rabbit-tail',3.5,3.5,3.5,0,hip,-3.5,'#e4d6c3'); break;
      case 'lizard': block('lizard-muzzle',5,2.5,4,0,-1.4,4.5,skin,head); tail(skin,12); for(let i=0;i<3;i++)block('spine',1.7,2,1.3,0,hip+4+i*3,-3,'#486d48'); break;
      case 'fairy': ear(2.7); wings('#9ec5d7',8,true); for(const side of [-1,1]) {const lower=block('lower-wing',6,.8,1,side*5,shoulders-6,-3,'#bad7c2');lower.rotation.z=-side*.35;} break;
      case 'long-arms': ear(2.5); block('fur-mane',11,5,6,0,shoulders,0,hair); block('jaw',7,2,3,0,-3.8,3,skin,head); break;
      case 'elements': for(let i=0;i<4;i++) {const plume=block('element-hair',1.5,4+i%2,2,-3+i*2,5+i%2,0,'#8cb4c5',head);plume.rotation.z=(i-1.5)*.12;} break;
      case 'construct': block('face-plate',6,6,.6,0,0,4.3,'#a1aea9',head); block('jaw-bolt',8,1,1,0,-2.4,4.5,'#596b6d',head); for(const side of [-1,1])block('joint',4.3,3,4.3,side*6.7,shoulders-5,0,'#9d7e4c'); break;
      default: block('hair-part',1,2.3,8,1,4,0,hair,head);
    }
  }
  function addOutfit() {
    block('belt',8.5*wide,1.5,4.6,0,hip+1,0,'#554331');
    switch(outfit) {
      case 'fur': block('fur-shoulder',5,4,6,-6*wide,shoulders-1,0,'#9c8b68'); block('loincloth',5,5,1,0,hip-1,2.5,cloth); break;
      case 'performer': block('coat-tail',9,7,1,0,hip-1,-3,cloth); block('feather',1,6,1,-2,shoulders+11,0,'#dbbf6c'); block('lute-body',5,7,2,3,hip+6,-4,'#a87644'); block('lute-neck',1.5,9,1,3,shoulders,-4,'#c3a572'); break;
      case 'priest': block('tabard',6,15,.7,0,hip+4,2.5,'#ddd8bc'); block('holy-vertical',.9,4,.8,0,shoulders-5,3,'#d9b75e');block('holy-horizontal',3,.9,.8,0,shoulders-4,3,'#d9b75e'); break;
      case 'leaves': for(const side of [-1,1]) {const leaf=block('leaf-mantle',6,3,6,side*5,shoulders-1,-1,'#748454');leaf.rotation.z=side*.3;} block('vine-belt',9,2,5,0,hip+1,0,'#7d7049'); break;
      case 'soldier': for(const side of [-1,1])block('soldier-pauldron',5,3,5,side*6*wide,shoulders-1,0,metal);block('helmet-band',9,2,9,0,shoulders+7,0,metal);block('helmet-crest',1.5,4,6,0,shoulders+10,0,'#8f4d45'); break;
      case 'wraps': block('sash',9,3,5,0,hip+3,0,'#e2bb7b');block('sash-tail',2,8,1,3,hip-1,3,'#e2bb7b');block('topknot',3,3,3,0,shoulders+9,-1,hair);for(const arm of [right,left])block('wrist-wrap',4.2,3,4.3,0,-9.5,0,'#dbc6a4',arm);break;
      case 'knight': for(const side of [-1,1])block('knight-pauldron',6,4,6,side*6*wide,shoulders-1,0,metal);block('long-tabard',7,17,.8,0,hip+2,2.8,cloth);block('knight-emblem',3,4,.8,0,shoulders-5,3.4,'#e5cc81');break;
      case 'scout': block('hood-top',9,2,9,0,shoulders+8.5,0,cloth);block('hood-back',9,8,1,0,shoulders+4,-4.3,cloth);block('cloak',10,15,1,0,hip+7,-3.3,'#455d44');block('quiver',3,10,3,4,hip+8,-4.5,'#785532');for(let i=0;i<3;i++)block('arrow-shaft',.5,7,.5,3+i*.8,shoulders+1,-4.5,'#d1bf8c');break;
      case 'leather': block('rogue-hood',9,2,9,0,shoulders+8.5,0,'#3e4354');block('short-cape',9,9,1,0,shoulders-4,-3.3,'#343a4c');for(const side of [-1,1])block('belt-knife',.8,5,1,side*4,hip,2.7,metal);break;
      case 'silk': block('silk-mantle',5,5,6,6*wide,shoulders-1,0,'#bd92b9');block('gem-brooch',2,2,1,0,shoulders-3,2.8,'#a9c2e1');block('robe-panel',4,11,.8,-2,hip-1,2.5,cloth);break;
      case 'occult': block('high-collar',11,5,1,0,shoulders+1,-3.4,'#785c91');block('occult-coat',9,12,5,0,hip+1,0,cloth);block('sigil-vertical',1,5,.8,0,shoulders-6,3.1,'#bfa9d1');block('sigil-square',4,1,.8,0,shoulders-6,3.1,'#bfa9d1');break;
      case 'robe': block('long-robe',9,14,6,0,hip-1,0,cloth);block('hat-brim',12,1.5,12,0,shoulders+8.5,0,cloth);block('hat-middle',7,4,7,0,shoulders+11,0,cloth);block('hat-tip',3.5,4,3.5,0,shoulders+15,0,cloth);block('spellbook',3,5,2,5,hip+1,1,'#81644a');break;
      case 'engineer': block('work-apron',7,13,1,0,hip+4,2.8,'#6a563b');for(const side of [-1,1])block('goggle',3,2.5,1.2,side*2,shoulders+4,4.5,'#c6ad6c');block('tool-pack',8,10,4,0,hip+8,-4,'#71634d');block('tool-handle',1,8,1,-4,shoulders,-4,'#b8c7c6');break;
    }
    const armor=appearance.armor||{};
    if(armorColors[armor.head]) {const c=armorColors[armor.head];block('armor-helmet',9,2,9,0,shoulders+8,0,c);for(const side of [-1,1])block('armor-cheek',1,6,9,side*4.1,shoulders+4,0,c);}
    if(armorColors[armor.chest]) {block('armor-chest',8.6*wide,10,5,0,hip+6,0,armorColors[armor.chest]);for(const arm of [right,left])block('armor-shoulder',4.5,4,5,0,-2,0,armorColors[armor.chest],arm);}
    for(const side of [-1,1]) {if(armorColors[armor.legs])block('armor-legs',4.2,6,4.6,side*2,hip-3,0,armorColors[armor.legs]);if(armorColors[armor.feet])block('armor-boots',4.3,4,5,side*2,2,.4,armorColors[armor.feet]);}
  }
  const bodyBounds=new THREE.Box3().setFromObject(figure);
  const weaponId = appearance.weapon || (descriptor.monster ? 'none' : descriptor.weapon.id), weapon = new THREE.Group();weapon.name='held-weapon';weapon.position.set(0,-10,2);right.add(weapon);
  const weaponPart=(name,w,h,d,x,y,z,color=metal)=>block(name,w,h,d,x,y,z,color,weapon);
  const handle=(height=8)=>weaponPart('grip',1.3,height,1.3,0,0,0,'#765334');
  switch(weaponId) {
    case 'sword': handle();weaponPart('guard',6,1.3,1.6,0,4,0,'#d7be73');weaponPart('blade',2,12,1,0,10.5,0);weaponPart('blade-tip',1.1,3,.8,0,17.5,0);break;
    case 'scimitar': handle(6);weaponPart('guard',4,1,1.5,0,3,0,'#d7be73');for(let i=0;i<5;i++)weaponPart('curved-blade',2.5,2.6,1,Math.max(0,i-1)*.65,4.5+i*2.4,0);break;
    case 'dagger':handle(4);weaponPart('guard',3.8,.9,1.4,0,2.2,0,'#d7be73');weaponPart('short-blade',1.5,6,.7,0,5.8,0);weaponPart('short-tip',.7,1.7,.6,0,9.4,0);break;
    case 'axe':handle(12);weaponPart('axe-head',7,5,1.6,-2.5,8,0);weaponPart('axe-edge',1,6,1.3,-6,8,0);break;
    case 'club':handle(9);weaponPart('club-head',3.5,9,3.5,0,7.5,0,'#a37b4b');weaponPart('club-cap',4.5,3,4.5,0,11.5,0,'#9c7042');break;
    case 'staff':weaponPart('long-staff',1.5,28,1.5,0,5,0,'#927247');weaponPart('staff-cap',3,3,3,0,19,0,'#a2b6b2');break;
    case 'bow': {
      handle(3);for(let i=0;i<7;i++)weaponPart('bow-limb',1.2,2.5,1.2,Math.abs(i-3)*.65,(-3+i)*2.3,0,'#9d784b');
      const string=weaponPart('bow-string',.2,14,.2,2.1,0,0,'#eee3c5');weapon.userData.bowString=string;weaponPart('nocked-arrow',.3,.3,12,1.2,0,4,'#c6b387');break;
    }
    case 'crossbow':weaponPart('stock',2,2,11,0,0,3,'#967448');weaponPart('cross-limb',10,1.3,1.3,0,0,6.7,'#b69c71');weaponPart('cross-string',9,.2,.2,0,0,5.4,'#e6ddbd');weaponPart('bolt',.35,.35,8,0,.8,6,'#c7b98b');break;
    case 'spear':weaponPart('shaft',1.2,29,1.2,0,4,0,'#927247');weaponPart('spear-head',2.3,5,.9,0,21,0);break;
    case 'hammer':handle(12);weaponPart('hammer-head',7,4,4,0,9,0);break;
    case 'mace':handle(10);weaponPart('mace-head',4.5,5,4.5,0,8,0);for(const side of [-1,1])weaponPart('mace-flange',1.6,4,1.6,side*3,8,0);break;
    case 'halberd':weaponPart('pole',1.3,30,1.3,0,5,0,'#927247');weaponPart('halberd-head',7,5,1.7,-2.5,17,0);weaponPart('halberd-point',1.6,5,1,0,23,0);break;
    case 'flail':handle(8);for(let i=0;i<5;i++)weaponPart('chain-link',.8,1.5,.8,i*.65,5+i*.8,0);weaponPart('flail-ball',4,4,4,3.5,10,0);break;
    case 'sickle':handle(6);weaponPart('sickle-neck',1.3,4,1,0,5,0);weaponPart('hook-blade',5,1.3,1,2,7.3,0);weaponPart('hook-tip',1.2,3,1,4,6.5,0);break;
  }
  if(appearance.shield) {block('shield',6.5,9,1.6,0,-8,3,'#aa8154',left);block('shield-bar',1,9,1.8,0,-8,3.1,metal,left);}
  const bounds=bodyBounds,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  figure.position.set(-center.x,-bounds.min.y,-center.z);
  group.scale.set((actor.body?.width||2)/Math.max(.1,size.x),(actor.body?.height||6)/Math.max(.1,size.y),(actor.body?.depth||1.5)/Math.max(.1,size.z));
  group.userData.rig={right,left,torso,weapon,rightRest:right.position.clone(),leftRest:left.position.clone(),weaponRest:weapon.position.clone()};
  group.userData.weapon=weaponId;
  group.traverse(mesh=>{if(mesh.isMesh){mesh.userData.actorId=actor.id;if(actor.hidden){mesh.material.transparent=true;mesh.material.opacity=.45;}}});
  return group;
}

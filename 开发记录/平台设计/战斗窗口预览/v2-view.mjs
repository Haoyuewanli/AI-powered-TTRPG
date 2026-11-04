import * as THREE from '/vendor/three.module.js';
import {voxelModel} from '/voxel-model.mjs';
import {layerFor,snapPoint} from '/scene-model.mjs';

const factionColor={ally:'#72c5ba',enemy:'#df9c82',neutral:'#c9bd92'};
function dispose(group){group.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){m?.map?.dispose();m?.dispose();}});group.clear();}
function label(text){
  const c=document.createElement('canvas');c.width=256;c.height=64;const x=c.getContext('2d');
  x.fillStyle='#14252ddd';x.roundRect(0,0,256,64,10);x.fill();x.font='30px Microsoft YaHei';x.fillStyle='#f1f4e8';x.textAlign='center';x.fillText(text.slice(0,14),128,43);
  const texture=new THREE.CanvasTexture(c);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(8,1.7,1);sprite.renderOrder=10;return sprite;
}
function blockMesh(item,ghost=false){
  const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:new THREE.Color(ghost?'#bfe8b6':item.color).convertSRGBToLinear(),roughness:.9,transparent:ghost,opacity:ghost?.45:1});
  const box=(w,h,d,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);group.add(m);};
  if(item.preset==='pillar'){const m=new THREE.Mesh(new THREE.CylinderGeometry(item.width/2,item.width/2,item.height,20),material);m.scale.z=item.depth/item.width;m.position.y=item.height/2;group.add(m);}
  else if(item.preset==='stairs'){for(let n=0;n<5;n++)box(item.width,item.height*(n+1)/5,item.depth/5,0,item.height*(n+1)/10,-item.depth/2+item.depth*(n+.5)/5);}
  else if(item.preset==='ramp'){
    const w=item.width/2,d=item.depth/2,h=item.height;
    const vertices=[-w,0,-d,w,0,-d,-w,0,d,w,0,d,-w,h,d,w,h,d];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex([0,2,1,1,2,3,0,4,2,0,1,4,1,5,4,1,3,5,2,4,3,3,4,5]);g.computeVertexNormals();group.add(new THREE.Mesh(g,material));
  }else box(item.width,item.height,item.depth,0,item.height/2,0);
  return group;
}
export class SceneView{
  constructor(container,callbacks){
    this.el=container;this.cb=callbacks;this.mode='2d';this.tool='select';this.keys=new Set();this.layers=new Set(['ground']);this.current='ground';this.size=65;this.center=new THREE.Vector3(25,0,25);this.yaw=0;this.pitch=-.55;this.settings={move:20,vertical:14,look:1};this.pointer=new THREE.Vector2();this.lastPointer=null;this.ray=new THREE.Raycaster();
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#17262e');this.scene.fog=new THREE.Fog('#17262e',180,450);
    this.scene.add(new THREE.HemisphereLight('#f2f2df','#4a6670',.9));const sun=new THREE.DirectionalLight('#fff1d4',1.4);sun.position.set(35,90,45);this.scene.add(sun);
    this.ortho=new THREE.OrthographicCamera(-50,50,50,-50,.1,2000);this.ortho.up.set(0,0,-1);
    this.perspective=new THREE.PerspectiveCamera(52,1,.1,1200);this.perspective.position.set(53,35,58);this.perspective.lookAt(25,0,25);this.readAngles();
    this.world=new THREE.Group();this.grids=new THREE.Group();this.overlay=new THREE.Group();this.scene.add(this.world,this.grids,this.overlay);
    this.renderer=new THREE.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputEncoding=THREE.sRGBEncoding;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;this.el.append(this.renderer.domElement);this.canvas=this.renderer.domElement;
    new ResizeObserver(()=>this.resize()).observe(container);this.bind();this.resize();let previous=performance.now();
    const frame=now=>{const dt=Math.min((now-previous)/1000,.05);previous=now;this.move(dt);this.updateGhost();this.renderer.render(this.scene,this.camera);this.canvas.dataset.camera=JSON.stringify(this.camera.position.toArray());this.canvas.dataset.look=JSON.stringify([this.yaw,this.pitch]);requestAnimationFrame(frame);};requestAnimationFrame(frame);
  }
  get camera(){return this.mode==='2d'?this.ortho:this.perspective;}
  readAngles(){const dir=this.perspective.getWorldDirection(new THREE.Vector3());this.yaw=Math.atan2(-dir.x,-dir.z);this.pitch=Math.asin(dir.y);}
  resize(){const w=this.el.clientWidth,h=this.el.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.perspective.aspect=w/h;this.perspective.updateProjectionMatrix();this.updateOrtho();}
  updateOrtho(){const ratio=this.el.clientWidth/Math.max(1,this.el.clientHeight);this.ortho.left=-this.size*ratio/2;this.ortho.right=this.size*ratio/2;this.ortho.top=this.size/2;this.ortho.bottom=-this.size/2;this.ortho.position.set(this.center.x,500,this.center.z);this.ortho.lookAt(this.center.x,0,this.center.z);this.ortho.updateProjectionMatrix();this.ortho.updateMatrixWorld();}
  set(state,ui){this.state=state;const prevMode=this.mode;Object.assign(this,ui);this.scene.fog=this.mode==='3d'?new THREE.Fog('#17262e',180,450):null;if(prevMode!==this.mode){this.stop();if(document.pointerLockElement===this.canvas)document.exitPointerLock();}this.canvas.dataset.view=this.mode;this.canvas.dataset.tool=this.tool;this.resize();this.rebuild();}
  rebuild(){
    if(!this.state)return;dispose(this.world);dispose(this.grids);dispose(this.overlay);this.ghost=null;this.lastCandidate='';
    const chosen=this.mode==='2d'?new Set([this.current]):this.layers;
    const currentActor=this.state.combat?.combat.phase==='active'?this.state.combat.combat.order[this.state.combat.combat.index]:null;
    for(const l of this.state.layers){if(!chosen.has(l.id))continue;
      const grid=new THREE.GridHelper(200,40,l.id===this.current?'#92b6a6':'#657b89',l.id===this.current?'#526e69':'#40545c');grid.position.set(50,l.height+.015,50);grid.material.transparent=true;grid.material.opacity=this.mode==='2d'?.32:(l.id===this.current?.38:.18);this.grids.add(grid);
      if(this.mode==='3d'){const t=label(`${l.name} · ${l.height}尺`);t.position.set(-10,l.height+1,-10);this.grids.add(t);}
    }
    for(const item of this.state.items){
      if(this.mode==='2d'&&item.layerId!==this.current)continue;
      const y=layerFor(this.state,item).height;let object;
      if(item.kind==='actor'){
        const color=factionColor[item.faction];object=new THREE.Group();
        const dot=new THREE.Mesh(new THREE.CylinderGeometry(item.width/2,item.width/2,this.mode==='2d'?.12:.15,40),new THREE.MeshStandardMaterial({color:new THREE.Color(color).convertSRGBToLinear(),roughness:1,transparent:true,depthTest:this.mode!=='2d',opacity:this.mode==='2d'?1:.65}));dot.renderOrder=this.mode==='2d'?20:0;dot.scale.z=item.depth/item.width;dot.position.y=.12;object.add(dot);
        if(this.mode==='3d')object.add(voxelModel({id:item.id,body:{width:Math.min(item.width*.6,5),depth:Math.min(item.depth*.4,3),height:item.height},appearance:{preset:'human',classId:'fighter',clothes:color,weapon:item.stats?'sword':'none'}}));
        if(this.selected===item.id||currentActor===item.id){const t=label(item.name+(item.stats?'':' · 白板'));t.position.set(0,this.mode==='2d'?.4:item.height+1.5,this.mode==='2d'?item.depth/2+1.4:0);object.add(t);}
      }else object=blockMesh(item);
      object.position.set(item.x,y,item.z);object.traverse(o=>{o.userData.itemId=item.id;});this.world.add(object);
      if(this.selected===item.id||currentActor===item.id){const edge=new THREE.Box3Helper(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(item.x,y+(this.mode==='2d'?.15:item.height/2),item.z),new THREE.Vector3(item.width+.3,this.mode==='2d'?.3:item.height+.2,item.depth+.3)),'#f2d78c');this.overlay.add(edge);}
    }
  }
  screenPoint(e){const r=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.lastPointer={clientX:e.clientX,clientY:e.clientY};}
  cast(){this.camera.updateMatrixWorld();this.ray.setFromCamera(document.pointerLockElement===this.canvas?new THREE.Vector2():this.pointer,this.camera);}
  candidate(){
    if(!this.state||!this.brush)return null;this.cast();
    const choices=this.state.layers.filter(l=>this.mode==='2d'?l.id===this.current:this.layers.has(l.id)&&(!this.priority||l.id===this.current));
    const hits=choices.map(l=>{const p=this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-l.height),new THREE.Vector3());return p?{layer:l,point:p,distance:p.distanceTo(this.camera.position)}:null;}).filter(h=>h&&h.distance<800&&Math.abs(h.point.x)<500&&Math.abs(h.point.z)<500).sort((a,b)=>a.distance-b.distance);
    if(!hits.length)return null;const hit=hits[0],point=snapPoint(hit.point,this.brush);return {...point,layerId:hit.layer.id,y:hit.layer.height,layerName:hit.layer.name};
  }
  updateGhost(){
    if(!this.state)return;
    const enabled=['build','relocate','move'].includes(this.tool)&&(this.lastPointer||document.pointerLockElement===this.canvas);
    const hit=enabled?this.candidate():null;
    if(!hit){if(this.ghost)this.ghost.visible=false;delete this.canvas.dataset.candidate;return;}
    if(!this.ghost){const item={...this.brush,preset:this.brush.preset||this.brush.id};this.ghost=blockMesh(item,true);this.overlay.add(this.ghost);}
    this.ghost.visible=true;this.ghost.position.set(hit.x,hit.y+.04,hit.z);this.canvas.dataset.candidate=JSON.stringify(hit);
    const key=JSON.stringify(hit);if(key!==this.lastCandidate){this.lastCandidate=key;this.cb.candidate?.(hit);}
  }
  pick(){this.cast();const hits=this.ray.intersectObjects(this.world.children,true);if(this.mode==='2d'){
    const ids=[...new Set(hits.map(h=>h.object.userData.itemId).filter(Boolean))];ids.sort((a,b)=>Number(this.state.items.find(i=>i.id===b)?.kind==='actor')-Number(this.state.items.find(i=>i.id===a)?.kind==='actor'));
    const index=ids.indexOf(this.selected);return ids.length?ids[index>=0?(index+1)%ids.length:0]:null;
  }return hits.find(h=>h.object.userData.itemId)?.object.userData.itemId||null;}
  zoom(factor){if(this.mode==='2d'){this.size=THREE.MathUtils.clamp(this.size*factor,10,220);this.updateOrtho();}else{this.perspective.position.addScaledVector(this.perspective.getWorldDirection(new THREE.Vector3()),factor<1?5:-5);}}
  reset(){this.center.set(25,0,25);this.size=65;this.perspective.position.set(53,35,58);this.perspective.lookAt(25,0,25);this.readAngles();this.updateOrtho();}
  focusItem(item){this.center.set(item.x,0,item.z);if(this.mode==='3d'){const y=layerFor(this.state,item).height;this.perspective.position.set(item.x+20,y+22,item.z+25);this.perspective.lookAt(item.x,y,item.z);this.readAngles();}this.updateOrtho();}
  stop(){this.keys.clear();this.drag=null;}
  move(dt){
    if(this.mode!=='3d'||!this.keys.size)return;
    const k=this.keys,forward=Number(k.has('KeyW'))-Number(k.has('KeyS')),side=Number(k.has('KeyD'))-Number(k.has('KeyA'));
    const scale=dt*this.settings.move/Math.max(1,Math.hypot(forward,side));
    this.perspective.position.x+=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*scale;
    this.perspective.position.z+=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*scale;
    const up=Number(k.has('KeyE')||k.has('Space'))-Number(k.has('KeyQ')||k.has('ShiftLeft')||k.has('ShiftRight'));
    this.perspective.position.y=THREE.MathUtils.clamp(this.perspective.position.y+up*dt*this.settings.vertical,.5,180);
  }
  look(dx,dy){this.yaw-=dx*.002*this.settings.look;this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.002*this.settings.look,-1.53,1.53);this.perspective.rotation.set(this.pitch,this.yaw,0,'YXZ');}
  bind(){
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
    this.canvas.addEventListener('pointerdown',e=>{e.preventDefault();this.el.focus();this.screenPoint(e);this.drag={x:e.clientX,y:e.clientY,button:e.button,moved:false};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{this.screenPoint(e);if(document.pointerLockElement===this.canvas){this.look(e.movementX,e.movementY);return;}if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
      if(Math.abs(dx)+Math.abs(dy)>2)this.drag.moved=true;
      if(this.drag.button===2||this.drag.button===1){if(this.mode==='3d')this.look(dx,dy);else{const units=this.size/this.el.clientHeight;this.center.x-=dx*units;this.center.z-=dy*units;this.updateOrtho();}this.drag.x=e.clientX;this.drag.y=e.clientY;}
    });
    this.canvas.addEventListener('pointerup',e=>{const drag=this.drag;this.drag=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);if(!drag||drag.button!==0||drag.moved)return;
      if(['build','relocate','move'].includes(this.tool)){const point=this.candidate();if(point)this.cb.place(point);else this.cb.hint('请先选中地面层，并把光标对准有效网格');}else this.cb.pick(this.pick());
    });
    for(const event of ['pointercancel','lostpointercapture'])this.canvas.addEventListener(event,()=>{this.drag=null;});
    this.canvas.addEventListener('pointerleave',()=>{if(!this.drag&&document.pointerLockElement!==this.canvas)this.lastPointer=null;});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey&&this.mode==='2d')this.zoom(Math.exp(e.deltaY*.001));else this.cb.cycle(Math.sign(e.deltaY));},{passive:false});
    this.el.addEventListener('keydown',e=>{if(e.target!==this.el||document.querySelector('dialog[open]'))return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Space','ShiftLeft','ShiftRight'].includes(e.code)&&this.mode==='3d'){e.preventDefault();this.keys.add(e.code);}});
    window.addEventListener('keyup',e=>this.keys.delete(e.code));window.addEventListener('blur',()=>this.stop());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();});
    document.addEventListener('focusin',e=>{if(e.target!==this.el)this.stop();});
    document.addEventListener('pointerlockchange',()=>{this.stop();this.cb.lock?.(document.pointerLockElement===this.canvas);});
  }
}

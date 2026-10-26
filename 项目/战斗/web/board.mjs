import * as THREE from '/vendor/three.module.js';
import { terrainGroup } from '/terrain-view.mjs';
import { voxelModel } from '/voxel-model.mjs';
import { largestFaces } from '/geometry.mjs';

function textTexture(text, subtitle, background, width = 256, height = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 3; ctx.strokeRect(12, 12, width - 24, height - 24);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 35px "Microsoft YaHei",sans-serif'; ctx.fillText(text.slice(0, 12), width / 2, height * .46, width - 26);
  ctx.font = '21px sans-serif'; ctx.fillStyle = '#ffffffbb'; ctx.fillText(subtitle, width / 2, height * .68, width - 26);
  const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding; texture.anisotropy = 4; return texture;
}
function disposeGroup(group) {
  group.traverse(item => {
    item.geometry?.dispose();
    for (const material of Array.isArray(item.material) ? item.material : item.material ? [item.material] : []) {
      material.map?.dispose(); material.dispose();
    }
  });
  group.clear();
}

export class BattleBoard {
  constructor(container, onSelect, onPlace, interaction = {}) {
    this.interaction = interaction; this.state = null;
    this.container = container; this.onSelect = onSelect; this.onPlace = onPlace; this.selected = null;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#0b1722');
    this.camera = new THREE.PerspectiveCamera(44, 1, .1, 5000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.setAttribute('aria-label', '3D战斗棋盘画布');
    container.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#badbea', '#1e2a2c', .8));
    const sun = new THREE.DirectionalLight('#ffe8bd', 1.35); sun.position.set(20, 70, -20); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100; sun.shadow.camera.far = 250; sun.shadow.bias = -.00015;
    sun.target.position.set(50, 0, 40); this.scene.add(sun, sun.target); this.sun = sun;
    const rim = new THREE.DirectionalLight('#438aab', .7); rim.position.set(100, 35, 100); this.scene.add(rim);
    this.ground = new THREE.Group(); this.pieces = new THREE.Group(); this.terrain = new THREE.Group(); this.scene.add(this.ground, this.terrain, this.pieces);
    this.target = new THREE.Vector3(50, 0, 40); this.wantedTarget = this.target.clone();
    this.orbit = { azimuth: .4, polar: .82, distance: 135 }; this.wanted = { ...this.orbit };
    this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.meshes = [];
    this.autoFit = true; this.frame = 0; this.drag = null; this.heldKeys = new Set();
    this.resize = new ResizeObserver(() => {
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false); if (this.autoFit) this.reset(); this.requestRender();
    }); this.resize.observe(container);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => {
      if (this.drag) { this.cancelDrag(); return; }
      event.preventDefault(); container.focus(); canvas.setPointerCapture(event.pointerId);
      this.cast(event);
      const terrainEdit = this.interaction.terrainEditing?.();
      const stamp = terrainEdit && this.interaction.stamping?.();
      const objectHit = event.button === 0 && terrainEdit && !stamp ? this.ray.intersectObjects(this.terrain.children, true).find(hit => hit.object.userData.objectId && this.interaction.acceptsObject?.(this.state.objects.find(o=>o.id===hit.object.userData.objectId))) : null;
      const object = objectHit && this.state?.objects.find(o=>o.id===objectHit.object.userData.objectId);
      const hit = event.button !== 0 || terrainEdit ? null : this.ray.intersectObjects(this.meshes)[0];
      const pan = event.button !== 0 || (event.shiftKey && !object && !hit);
      const actor = hit && this.state?.actors.find(a => a.id === hit.object.userData.actorId);
      if (actor) this.onSelect(actor.id);
      const objectSelected = object && this.interaction.onSelectObject?.(object.id);
      const movable = object ? objectSelected && this.interaction.canDragObject?.() : actor && this.interaction.canDrag?.(actor.id);
      this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        startX: event.clientX, startY: event.clientY, pan, button: event.button,
        actor: actor ? structuredClone(actor) : null, object: object ? structuredClone(object) : null, copy: !!event.ctrlKey, stamp, movable, moving: false,
        origin: actor || object ? this.planePoint(event, (actor || object).position.y || 0) : null,
        context: this.state ? { campaignId: this.state.campaignId, battleId: this.state.battleId, revision: this.state.revision } : null };
    });
    canvas.addEventListener('pointermove', event => {
      const drag = this.drag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      drag.x = event.clientX; drag.y = event.clientY;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moving = true;
      if (drag.actor || drag.object) {
        if (drag.movable && drag.moving && drag.origin) this.previewDrag(event);
      } else if (drag.pan) this.pan(-dx * this.wanted.distance * .0015, -dy * this.wanted.distance * .0015);
      else if (drag.moving) {
        this.autoFit = false; this.wanted.azimuth -= dx * .006;
        this.wanted.polar = THREE.MathUtils.clamp(this.wanted.polar - dy * .005, .18, 1.48);
      }
      this.requestRender();
    });
    canvas.addEventListener('pointerup', event => {
      const drag = this.drag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const destination = drag.destination;
      this.cancelDrag();
      if (drag.object && drag.movable && drag.moving && destination) {
        this.interaction.onObjectDrop?.(drag.object.id, destination, drag.context, drag.copy || event.ctrlKey);
      } else if (drag.actor && drag.movable && drag.moving && destination) {
        const old = drag.actor.position;
        if (old.x !== destination.x || old.z !== destination.z) this.interaction.onDrop?.(drag.actor.id, destination, drag.context);
      } else if (!drag.actor && !drag.object && !drag.moving && drag.button === 0 && !drag.pan) {
        const point = this.planePoint(event, 0); if (point) this.onPlace?.(point);
      }
    });
    canvas.addEventListener('pointercancel', () => this.cancelDrag());
    canvas.addEventListener('lostpointercapture', () => this.cancelDrag());
    canvas.addEventListener('wheel', event => { event.preventDefault(); if (!this.drag?.actor && !this.drag?.object) this.zoom(Math.exp(event.deltaY * .001)); }, { passive: false });
    container.addEventListener('keydown', event => {
      if (event.code === 'Escape') { this.cancelDrag(); return; }
      if (this.drag?.actor || this.drag?.object || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.code === 'Digit0' || event.code === 'Numpad0') {
        event.preventDefault(); if (!event.repeat) this.reset(); return;
      }
      const keys = ['KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'];
      if (!keys.includes(event.code)) return;
      event.preventDefault();
      if (this.heldKeys.has(event.code)) return;
      if (!this.heldKeys.size) this.lastFrame = performance.now();
      this.heldKeys.add(event.code); this.advanceKeyboard(1 / 60); this.requestRender();
    });
    window.addEventListener('keyup', event => { this.heldKeys.delete(event.code); });
    const releaseKeys = () => { this.heldKeys.clear(); this.cancelDrag(); };
    container.addEventListener('blur', releaseKeys);
    window.addEventListener('blur', releaseKeys);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.container.dispatchEvent(new CustomEvent('board-error', { detail: '3D绘图暂时中断，请刷新页面；已保存的战斗进度仍在本机。' })); });
    this.requestRender();
  }
  cast(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
  }
  planePoint(event, height) {
    this.cast(event);
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), new THREE.Vector3());
  }
  previewDrag(event) {
    const drag = this.drag;
    if (drag.object) {
      const o=drag.object, point=this.planePoint(event,o.position.y); if(!point)return;
      drag.destination=this.interaction.objectDestination(o,{x:o.position.x+point.x-drag.origin.x,y:o.position.y,z:o.position.z+point.z-drag.origin.z},event.shiftKey);
      if(!this.ghost) {
        this.ghost=new THREE.Group();
        const ids=this.interaction.objectIds?.() || [o.id];
        for(const item of this.state.objects.filter(i=>ids.includes(i.id))) {
          const mesh=terrainGroup({...item,position:{x:item.position.x-o.position.x,y:item.position.y-o.position.y,z:item.position.z-o.position.z}},true);
          mesh.traverse(n=>{if(n.material){n.material.transparent=true;n.material.opacity=.45;n.material.depthWrite=false;}});this.ghost.add(mesh);
        }
        this.scene.add(this.ghost);
      }
      const p=drag.destination;this.ghost.position.set(p.x,p.y,p.z);
      this.renderer.domElement.dataset.dragging=o.id;
      this.interaction.onHint?.(`${drag.copy||event.ctrlKey?'复制':'移动'}至 (${p.x}, ${p.y}, ${p.z})${event.shiftKey?' · 仅Z轴':''} · 松手保存，Esc取消`);return;
    }
    const a = drag.actor, point = this.planePoint(event, a.position.y || 0);
    if (!point) return;
    const snap = (value, size) => Math.round((value - size / 2) / 5) * 5 + size / 2;
    drag.destination = { x: snap(a.position.x + point.x - drag.origin.x, a.space.width),
      y: a.position.y || 0, z: snap(a.position.z + point.z - drag.origin.z, a.space.depth) };
    if (event.shiftKey) drag.destination.x = a.position.x;
    if (!this.ghost) {
      this.ghost = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(a.body.width, a.body.height, a.body.depth),
        new THREE.MeshBasicMaterial({ color: '#8ee1c5', transparent: true, opacity: .48, depthWrite: false }));
      body.position.y = a.body.height / 2 + .1; body.rotation.y = -a.facing * Math.PI / 180;
      const base = new THREE.Mesh(new THREE.PlaneGeometry(a.space.width, a.space.depth),
        new THREE.MeshBasicMaterial({ color: '#8ee1c5', transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide }));
      base.rotation.x = -Math.PI / 2; base.position.y = .12;
      this.ghost.add(body, base); this.scene.add(this.ghost);
    }
    const p = drag.destination;
    this.ghost.position.set(p.x, p.y, p.z);
    const outside = !this.board.extended && (p.x < a.space.width / 2 || p.z < a.space.depth / 2 ||
      p.x > this.board.width - a.space.width / 2 || p.z > this.board.depth - a.space.depth / 2);
    for (const mesh of this.ghost.children) mesh.material.color.set(outside ? '#f28b82' : '#8ee1c5');
    this.renderer.domElement.dataset.dragging = a.id;
    const distance = Math.max(Math.abs(p.x - a.position.x), Math.abs(p.z - a.position.z));
    this.interaction.onHint?.(outside ? '落点超出棋盘，松手会恢复原位' : `移动 ${distance} 尺 · 松手保存，Esc 取消`);
  }
  cancelDrag(message = '') {
    const drag = this.drag; this.drag = null;
    if (drag && this.renderer.domElement.hasPointerCapture(drag.pointerId)) this.renderer.domElement.releasePointerCapture(drag.pointerId);
    if (this.ghost) { disposeGroup(this.ghost); this.scene.remove(this.ghost); this.ghost = null; }
    delete this.renderer.domElement.dataset.dragging;
    if (drag) this.interaction.onHint?.(message);
    this.requestRender();
  }
  pan(right, forward) {
    this.autoFit = false;
    const angle = this.wanted.azimuth;
    this.wantedTarget.x += right * Math.cos(angle) - forward * Math.sin(angle);
    this.wantedTarget.z += -right * Math.sin(angle) - forward * Math.cos(angle);
    this.wantedTarget.x = THREE.MathUtils.clamp(this.wantedTarget.x, -10000, 10000);
    this.wantedTarget.z = THREE.MathUtils.clamp(this.wantedTarget.z, -10000, 10000);
  }
  zoom(factor) { this.autoFit = false; this.wanted.distance = THREE.MathUtils.clamp(this.wanted.distance * factor, 14, 700); this.requestRender(); }
  advanceKeyboard(seconds) {
    this.autoFit = false;
    const held = (...keys) => keys.some(key => this.heldKeys.has(key)) ? 1 : 0;
    this.wanted.azimuth += (held('KeyQ', 'ArrowLeft') - held('KeyE', 'ArrowRight')) * 1.6 * seconds;
    this.wanted.polar = THREE.MathUtils.clamp(this.wanted.polar +
      (held('KeyF', 'ArrowDown') - held('KeyR', 'ArrowUp')) * .85 * seconds, .18, 1.48);
    let right = held('KeyD') - held('KeyA'), forward = held('KeyW') - held('KeyS');
    const length = Math.hypot(right, forward);
    if (length) {
      const speed = this.wanted.distance * .25 * seconds / length;
      this.pan(right * speed, forward * speed);
    }
    const zoom = held('Minus', 'NumpadSubtract') - held('Equal', 'NumpadAdd');
    if (zoom) this.wanted.distance = THREE.MathUtils.clamp(this.wanted.distance * Math.exp(zoom * 1.2 * seconds), 14, 700);
  }
  reset() {
    const { width = 100, depth = 80 } = this.board || {};
    this.wantedTarget.set(width / 2, 0, depth / 2);
    const azimuth = .4, polar = .82, tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    let distance = 14;
    for (const x of [-width / 2 - 5, width / 2 + 5]) for (const z of [-depth / 2 - 5, depth / 2 + 5]) {
      const horizontal = x * Math.cos(azimuth) - z * Math.sin(azimuth);
      const vertical = -Math.cos(polar) * (x * Math.sin(azimuth) + z * Math.cos(azimuth));
      const towardCamera = Math.sin(polar) * (x * Math.sin(azimuth) + z * Math.cos(azimuth));
      distance = Math.max(distance, towardCamera + Math.abs(horizontal) / (tangent * this.camera.aspect), towardCamera + Math.abs(vertical) / tangent);
    }
    this.autoFit = true;
    this.wanted = { azimuth, polar, distance: distance * 1.08 }; this.requestRender();
  }
  requestRender() {
    if (this.frame) return;
    this.renderer.domElement.dataset.settled = 'false';
    this.frame = requestAnimationFrame(time => {
      this.frame = 0;
      const elapsed = this.lastFrame ? THREE.MathUtils.clamp(time - this.lastFrame, 0, 64) : 16;
      const factor = 1 - Math.exp(-elapsed / 50); this.lastFrame = time;
      if (this.heldKeys.size) this.advanceKeyboard(elapsed / 1000);
      this.target.lerp(this.wantedTarget, factor);
      for (const key of ['azimuth', 'polar', 'distance']) this.orbit[key] += (this.wanted[key] - this.orbit[key]) * factor;
      const { azimuth: a, polar: p, distance: d } = this.orbit;
      this.camera.position.set(this.target.x + d * Math.sin(p) * Math.sin(a), d * Math.cos(p), this.target.z + d * Math.sin(p) * Math.cos(a));
      if(this.gridPlane) this.gridPlane.position.set(Math.round(this.target.x/5)*5, .015, Math.round(this.target.z/5)*5);
      this.camera.lookAt(this.target); this.renderer.render(this.scene, this.camera);
      this.renderer.domElement.dataset.camera = JSON.stringify({ ...this.orbit, target: this.target.toArray() });
      if (this.heldKeys.size || this.target.distanceTo(this.wantedTarget) > .001 || Object.keys(this.orbit).some(k => Math.abs(this.orbit[k] - this.wanted[k]) > .001)) this.requestRender();
      else this.renderer.domElement.dataset.settled = 'true';
    });
  }
  setGround(board) {
    disposeGroup(this.ground); this.board = board;
    this.renderer.shadowMap.needsUpdate = true;
    const { width, depth } = board;
    this.reset();
    const extent = Math.max(width, depth) / 2 + 25;
    this.sun.target.position.set(width / 2, 0, depth / 2); this.sun.position.set(width / 2 - 30, 100, depth / 2 - 40);
    Object.assign(this.sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: 400 }); this.sun.shadow.camera.updateProjectionMatrix();
    if(board.baseEnabled !== false) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 2, 1, depth + 2), new THREE.MeshStandardMaterial({ color: new THREE.Color('#172f3d').convertSRGBToLinear(), roughness: .8 }));
    slab.position.set(width / 2, -.6, depth / 2); this.ground.add(slab);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({ color: new THREE.Color('#132630').convertSRGBToLinear(), roughness: .95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(width / 2, -.08, depth / 2); floor.receiveShadow = true; this.ground.add(floor);
    }
    const minor = [], major = [];
    for (let x = 0; x <= width; x++) (x % 5 === 0 ? major : minor).push(x, 0, 0, x, 0, depth);
    for (let z = 0; z <= depth; z++) (z % 5 === 0 ? major : minor).push(0, 0, z, width, 0, z);
    for (const [points, color, opacity] of [[minor, '#365564', .35], [major, '#759396', .48]]) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), transparent: true, opacity })); this.ground.add(lines);
    }
    for (let x = 10; x <= width; x += 10) {
      const texture = textTexture(String(x), 'X / FT', '#162c38');
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture })); label.position.set(x, .3, -3); label.scale.set(4, 4, 1); this.ground.add(label);
    }
    for (let z = 10; z <= depth; z += 10) {
      const texture = textTexture(String(z), 'Z / FT', '#162c38');
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture })); label.position.set(-3, .3, z); label.scale.set(4, 4, 1); this.ground.add(label);
    }
  }
  makeGrid() {
    if(this.gridPlane) return;
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,extensions:{derivatives:true},
      vertexShader:`varying vec3 world;void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader:`varying vec3 world;float grid(float size){vec2 g=world.xz/size;vec2 w=max(fwidth(g),vec2(.00001));vec2 lines=abs(fract(g-.5)-.5)/w;return 1.-min(min(lines.x,lines.y),1.);}void main(){float d=length(cameraPosition.xz-world.xz);float fade=1.-smoothstep(500.,1100.,d);float minor=grid(1.)*.16*(1.-smoothstep(100.,300.,d));float major=grid(5.)*.38;gl_FragColor=vec4(.43,.59,.63,max(minor,major)*fade);}`});
    this.gridPlane=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),material);this.gridPlane.rotation.x=-Math.PI/2;this.scene.add(this.gridPlane);
  }
  update(state, selected) {
    if (this.drag?.context && (this.drag.context.revision !== state.revision || this.drag.context.battleId !== state.battleId || this.drag.context.campaignId !== state.campaignId)) this.cancelDrag('局面已更新，请重新拖动');
    this.state = state; this.makeGrid();
    const terrainKey = JSON.stringify(state.objects || []) + JSON.stringify(this.interaction.objectIds?.() || []);
    if (this.terrainKey !== terrainKey) {
      disposeGroup(this.terrain); this.terrainKey = terrainKey;
      for (const object of state.objects || []) this.terrain.add(terrainGroup(object, (this.interaction.objectIds?.() || []).includes(object.id)));
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.renderer.domElement.dataset.objectCount = String((state.objects || []).length);
    if (!this.board || this.board.width !== state.board.width || this.board.depth !== state.board.depth || this.board.baseEnabled !== state.board.baseEnabled || this.board.extended !== state.board.extended) this.setGround(state.board);
    const piecesKey = JSON.stringify(state.actors.map(a => [a.id, a.name, a.kind, a.body, a.space, a.position, a.facing, a.hidden, a.appearance])) + selected;
    if (this.piecesKey === piecesKey) { this.requestRender(); return; }
    this.piecesKey = piecesKey;
    disposeGroup(this.pieces); this.meshes = []; this.selected = selected;
    this.renderer.shadowMap.needsUpdate = true;
    for (const actor of state.actors) {
      const group = new THREE.Group(); group.position.set(actor.position.x, actor.position.y || 0, actor.position.z); group.rotation.y = -actor.facing * Math.PI / 180;
      if (actor.appearance?.model !== 'box') {
        const model = voxelModel(actor); group.add(model);
        model.traverse(mesh => { if (mesh.isMesh) this.meshes.push(mesh); });
      } else {
      const color = actor.kind === 'pc' ? '#3b8595' : '#906b60';
      const materials = Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial({ color, roughness: .65 }));
      const faces = largestFaces(actor.body), [front, back] = faces.materialIndices;
      materials[front].dispose(); materials[back].dispose();
      materials[front] = new THREE.MeshStandardMaterial({ map: textTexture('前', 'FRONT', '#b18449'), roughness: .65 });
      materials[back] = new THREE.MeshStandardMaterial({ map: textTexture('后', 'BACK', '#334956'), roughness: .8 });
      if (actor.hidden) for (const mat of materials) { mat.transparent = true; mat.opacity = .45; }
      const box = new THREE.Mesh(new THREE.BoxGeometry(actor.body.width, actor.body.height, actor.body.depth), materials);
      box.position.y = actor.body.height / 2 + .08; box.castShadow = true; box.receiveShadow = true; box.userData.actorId = actor.id;
      group.add(box); this.meshes.push(box);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: actor.id === selected ? '#ffe1a3' : '#b2cfcc', transparent: true, opacity: .6 }));
      outline.position.copy(box.position); group.add(outline);
      }
      // Occupied rules space is axis-aligned even when the visual body faces another direction.
      const sx = actor.space.width / 2, sz = actor.space.depth / 2;
      const footprint = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-sx, .07, -sz), new THREE.Vector3(sx, .07, -sz), new THREE.Vector3(sx, .07, sz), new THREE.Vector3(-sx, .07, sz)
      ]), new THREE.LineBasicMaterial({ color: actor.id === selected ? '#ffe1a3' : '#65aaa9' }));
      footprint.position.set(actor.position.x, actor.position.y || 0, actor.position.z); this.pieces.add(footprint);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(actor.name, actor.hidden ? 'DM / HIDDEN' : actor.kind === 'pc' ? 'PLAYER' : 'NPC', '#122938', 512, 128), depthTest: false }));
      label.position.set(0, actor.body.height + 3, 0); label.scale.set(Math.max(12, actor.name.length * 1.1), 3, 1); group.add(label);
      this.pieces.add(group);
    }
    this.renderer.domElement.dataset.actorCount = String(state.actors.length);
    this.renderer.domElement.dataset.ready = 'true'; this.requestRender();
  }
  clear() { this.cancelDrag(); this.state = null; this.heldKeys.clear(); this.piecesKey = null; this.terrainKey = null; disposeGroup(this.terrain); this.renderer.domElement.dataset.objectCount = '0'; disposeGroup(this.pieces); this.meshes = []; this.renderer.shadowMap.needsUpdate = true; this.renderer.domElement.dataset.actorCount = '0'; this.requestRender(); }
}

import * as THREE from '/vendor/three.module.js';
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
  constructor(container, onSelect) {
    this.container = container; this.onSelect = onSelect; this.selected = null;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#0b1722');
    this.camera = new THREE.PerspectiveCamera(44, 1, .1, 1000);
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
    sun.target.position.set(50, 0, 40); this.scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight('#438aab', .7); rim.position.set(100, 35, 100); this.scene.add(rim);
    this.ground = new THREE.Group(); this.pieces = new THREE.Group(); this.scene.add(this.ground, this.pieces);
    this.target = new THREE.Vector3(50, 0, 40); this.wantedTarget = this.target.clone();
    this.orbit = { azimuth: .4, polar: .82, distance: 135 }; this.wanted = { ...this.orbit };
    this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2(); this.meshes = [];
    this.frame = 0; this.drag = null; this.heldKeys = new Set();
    this.resize = new ResizeObserver(() => {
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false); this.requestRender();
    }); this.resize.observe(container);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => {
      event.preventDefault(); container.focus(); canvas.setPointerCapture(event.pointerId);
      this.drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
        pan: event.button !== 0 || event.shiftKey, button: event.button };
    });
    canvas.addEventListener('pointermove', event => {
      if (!this.drag) return;
      const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX; this.drag.y = event.clientY;
      if (this.drag.pan) this.pan(-dx * this.wanted.distance * .0015, -dy * this.wanted.distance * .0015);
      else { this.wanted.azimuth -= dx * .006; this.wanted.polar = THREE.MathUtils.clamp(this.wanted.polar - dy * .005, .18, 1.48); }
      this.requestRender();
    });
    canvas.addEventListener('pointerup', event => {
      if (this.drag && this.drag.button === 0 && Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) < 4) {
        const rect = canvas.getBoundingClientRect();
        this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        this.ray.setFromCamera(this.pointer, this.camera);
        const hit = this.ray.intersectObjects(this.meshes)[0]; if (hit) this.onSelect(hit.object.userData.actorId);
      }
      this.drag = null;
    });
    canvas.addEventListener('pointercancel', () => { this.drag = null; });
    canvas.addEventListener('wheel', event => { event.preventDefault(); this.zoom(Math.exp(event.deltaY * .001)); }, { passive: false });
    container.addEventListener('keydown', event => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
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
    const releaseKeys = () => this.heldKeys.clear();
    container.addEventListener('blur', releaseKeys);
    window.addEventListener('blur', releaseKeys);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.container.dispatchEvent(new CustomEvent('board-error', { detail: '3D绘图暂时中断，请刷新页面；已保存的战斗进度仍在本机。' })); });
    this.requestRender();
  }
  pan(right, forward) {
    const angle = this.wanted.azimuth;
    this.wantedTarget.x += right * Math.cos(angle) - forward * Math.sin(angle);
    this.wantedTarget.z += -right * Math.sin(angle) - forward * Math.cos(angle);
    this.wantedTarget.x = THREE.MathUtils.clamp(this.wantedTarget.x, -100, 300);
    this.wantedTarget.z = THREE.MathUtils.clamp(this.wantedTarget.z, -100, 300);
  }
  zoom(factor) { this.wanted.distance = THREE.MathUtils.clamp(this.wanted.distance * factor, 14, 350); this.requestRender(); }
  advanceKeyboard(seconds) {
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
    if (zoom) this.wanted.distance = THREE.MathUtils.clamp(this.wanted.distance * Math.exp(zoom * 1.2 * seconds), 14, 350);
  }
  reset() {
    const { width = 100, depth = 80 } = this.board || {};
    this.wantedTarget.set(width / 2, 0, depth / 2);
    this.wanted = { azimuth: .4, polar: .82, distance: Math.max(width, depth) * 1.35 }; this.requestRender();
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
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 2, 1, depth + 2), new THREE.MeshStandardMaterial({ color: new THREE.Color('#172f3d').convertSRGBToLinear(), roughness: .8 }));
    slab.position.set(width / 2, -.6, depth / 2); this.ground.add(slab);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshStandardMaterial({ color: new THREE.Color('#132630').convertSRGBToLinear(), roughness: .95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(width / 2, -.08, depth / 2); floor.receiveShadow = true; this.ground.add(floor);
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
  update(state, selected) {
    if (!this.board || this.board.width !== state.board.width || this.board.depth !== state.board.depth) this.setGround(state.board);
    disposeGroup(this.pieces); this.meshes = []; this.selected = selected;
    this.renderer.shadowMap.needsUpdate = true;
    for (const actor of state.actors) {
      const group = new THREE.Group(); group.position.set(actor.position.x, 0, actor.position.z); group.rotation.y = -actor.facing * Math.PI / 180;
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
      // Occupied rules space is axis-aligned even when the visual body faces another direction.
      const sx = actor.space.width / 2, sz = actor.space.depth / 2;
      const footprint = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-sx, .07, -sz), new THREE.Vector3(sx, .07, -sz), new THREE.Vector3(sx, .07, sz), new THREE.Vector3(-sx, .07, sz)
      ]), new THREE.LineBasicMaterial({ color: actor.id === selected ? '#ffe1a3' : '#65aaa9' }));
      footprint.position.set(actor.position.x, 0, actor.position.z); this.pieces.add(footprint);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(actor.name, actor.hidden ? 'DM / HIDDEN' : actor.kind === 'pc' ? 'PLAYER' : 'NPC', '#122938', 512, 128), depthTest: false }));
      label.position.set(0, actor.body.height + 3, 0); label.scale.set(Math.max(12, actor.name.length * 1.1), 3, 1); group.add(label);
      this.pieces.add(group);
    }
    this.renderer.domElement.dataset.actorCount = String(state.actors.length);
    this.renderer.domElement.dataset.ready = 'true'; this.requestRender();
  }
  clear() { this.heldKeys.clear(); disposeGroup(this.pieces); this.meshes = []; this.renderer.shadowMap.needsUpdate = true; this.renderer.domElement.dataset.actorCount = '0'; this.requestRender(); }
}

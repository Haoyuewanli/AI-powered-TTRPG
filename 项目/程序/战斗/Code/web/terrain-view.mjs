import * as THREE from '/vendor/three.module.js';
import { baseBlockComposition } from '/creative-building.mjs';
const colors = { wall: '#718b98', hill: '#63816b', floor: '#ac9878', stairs: '#9c8d79', prop: '#826b91', tile: '#667d80' };
export function terrainGroup(object, selected) {
  const group = new THREE.Group(), { width: w, depth: d, height: h } = object.size;
  group.position.set(object.position.x, object.position.y, object.position.z);
  group.rotation.y = -object.rotation * Math.PI / 180;
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors[object.type]).convertSRGBToLinear(), roughness: .85,
    transparent: !!object.hidden, opacity: object.hidden ? .3 : 1 });
  function block(width, height, depth, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material.clone()); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: selected ? '#ffe1a3' : '#bfced0', transparent: true, opacity: selected ? .9 : .25 }));
    edges.position.copy(mesh.position); group.add(edges);
  }
  if (object.type === 'stairs') {
    const steps = Math.min(12, Math.max(2, Math.round(h * 2)));
    for (let i = 0; i < steps; i++) { const height = h * (i + 1) / steps; block(w, height, d / steps, 0, height / 2, -d / 2 + d * (i + .5) / steps); }
  } else if (object.type === 'hill') {
    for (let i = 0; i < 3; i++) block(w * (1 - i * .2), h / 3, d * (1 - i * .2), 0, h * (i + .5) / 3, 0);
  } else if (object.shape && object.shape !== 'box') {
    let geometry;
    if (object.shape === 'cylinder') { geometry = new THREE.CylinderGeometry(.5, .5, h, 32); geometry.scale(w, 1, d); geometry.translate(0, h/2, 0); }
    else {
      const points = object.shape === 'ramp' ? [-w/2,0,-d/2, w/2,0,-d/2, -w/2,0,d/2, w/2,0,d/2, -w/2,h,d/2, w/2,h,d/2] : [-w/2,0,-d/2, w/2,0,-d/2, -w/2,0,d/2, -w/2,h,-d/2, w/2,h,-d/2, -w/2,h,d/2];
      const indices = object.shape === 'ramp' ? [0,2,1,1,2,3,2,4,3,3,4,5,0,4,2,1,3,5,0,1,4,1,5,4] : [0,2,1,3,4,5,0,1,3,1,4,3,1,2,4,2,5,4,2,0,5,0,3,5];
      geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    }
    const mesh=new THREE.Mesh(geometry,material.clone());mesh.material.side=THREE.DoubleSide;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:selected?'#ffe1a3':'#b6c8ca',transparent:true,opacity:.55})));
  } else {
    const cells = baseBlockComposition(object.size);
    if (cells && cells.length > 1) {
      const matrix = new THREE.Matrix4();
      for (const unit of [1, 5]) {
        const members = cells.filter(cell => cell.unit === unit); if (!members.length) continue;
        const geometry = new THREE.BoxGeometry(unit - .014, unit - .014, unit - .014);
        const mesh = new THREE.InstancedMesh(geometry, material.clone(), members.length);
        members.forEach((cell, index) => { matrix.makeTranslation(cell.x, cell.y, cell.z); mesh.setMatrixAt(index, matrix); });
        mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
      }
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: selected ? '#ffe1a3' : '#bfced0', transparent: true, opacity: selected ? .9 : .25 }));
      outline.position.y = h / 2; group.add(outline);
    } else block(w, h, d, 0, h / 2, 0);
  }
  material.dispose();
  group.traverse(mesh => { if(mesh.isMesh) mesh.userData.objectId=object.id; });
  if (object.type === 'floor' && (!object.shape || object.shape === 'box')) {
    const points = [];
    for (let x = -w / 2; x <= w / 2; x += 5) points.push(x, h + .02, -d / 2, x, h + .02, d / 2);
    for (let z = -d / 2; z <= d / 2; z += 5) points.push(-w / 2, h + .02, z, w / 2, h + .02, z);
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)),
      new THREE.LineBasicMaterial({ color: '#eddfb6', transparent: true, opacity: .5 })); group.add(lines);
  }
  return group;
}

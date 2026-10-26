import * as THREE from '/vendor/three.module.js';
const colors = { wall: '#718b98', hill: '#63816b', floor: '#ac9878', stairs: '#9c8d79', prop: '#826b91' };
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
  } else block(w, h, d, 0, h / 2, 0);
  material.dispose();
  if (object.type === 'floor') {
    const points = [];
    for (let x = -w / 2; x <= w / 2; x += 5) points.push(x, h + .02, -d / 2, x, h + .02, d / 2);
    for (let z = -d / 2; z <= d / 2; z += 5) points.push(-w / 2, h + .02, z, w / 2, h + .02, z);
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)),
      new THREE.LineBasicMaterial({ color: '#eddfb6', transparent: true, opacity: .5 })); group.add(lines);
  }
  return group;
}

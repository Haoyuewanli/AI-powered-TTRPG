import * as THREE from '/vendor/three.module.js';
import {voxelCells,cellIndex,cellKey} from '/voxel-grid.mjs';

const faces=[
  [[1,0,0],[[1,0,1],[1,0,0],[1,1,0],[1,1,1]]],
  [[-1,0,0],[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]],
  [[0,1,0],[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]],
  [[0,-1,0],[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]],
  [[0,0,1],[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]],
  [[0,0,-1],[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]],
];

export function voxelMesh(item,{ghost=false,variant='solid',color=item.color,overlay=false}={}){
  const cells=voxelCells(item,variant),occupied=new Set(cells.map(c=>cellKey(...c)));
  const positions=[],normals=[],colors=[],uvs=[];
  const nx=cellIndex(item.width),nz=cellIndex(item.depth),ny=cellIndex(item.height);
  const tint=new THREE.Color(ghost?'#bfe8b6':color).convertSRGBToLinear(),head=new THREE.Color('#d9bc96').convertSRGBToLinear();
  for(const [x,y,z]of cells)for(const [n,vertices]of faces){
    if(occupied.has(cellKey(x+n[0],y+n[1],z+n[2])))continue;
    const c=variant==='person'&&y>=Math.floor(ny*.7)?head:tint;
    for(const index of [0,1,2,0,2,3]){
      const v=vertices[index];positions.push(x+v[0]-nx/2,y+v[1],z+v[2]-nz/2);normals.push(...n);colors.push(c.r,c.g,c.b);uvs.push(...[[0,0],[1,0],[1,1],[0,1]][index]);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,32,32);ctx.strokeStyle='#c7c7c7';ctx.lineWidth=1;ctx.strokeRect(.5,.5,31,31);
  const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;
  const material=new THREE.MeshStandardMaterial({vertexColors:true,map:texture,roughness:1,transparent:ghost||overlay,opacity:ghost?.5:overlay?.85:1,depthTest:!overlay});
  const mesh=new THREE.Mesh(geometry,material);if(overlay)mesh.renderOrder=20;
  mesh.userData.voxelCount=cells.length;return mesh;
}

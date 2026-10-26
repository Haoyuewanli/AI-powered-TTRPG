import { objectBounds } from './geometry.mjs';
// Placement is separate from collision: alignment never declares a move legal.
export function snapObject(object, desired, objects, {step=5,edges=false,height=false,exclude=[],lockZ=false}={}) {
 const p={...desired}, size=object.rotation%180 ? {width:object.size.depth,depth:object.size.width}:object.size;
 for(const [axis,extent] of [['x',size.width],['z',size.depth]]) p[axis]=Math.round((p[axis]-extent/2)/step)*step+extent/2;
 p.y=Math.round(p.y*2)/2;
 const candidates=objects.filter(o=>o.id!==object.id && !exclude.includes(o.id));
 if(edges) {
  let bx=2.01,bz=2.01,dx=0,dz=0;
  const a=objectBounds({...object,position:p});
  for(const other of candidates) {
   const b=objectBounds(other);
   if(a.minZ<=b.maxZ+2&&a.maxZ>=b.minZ-2) for(const d of [b.minX-a.maxX,b.maxX-a.minX,b.minX-a.minX,b.maxX-a.maxX]) if(Math.abs(d)<bx){bx=Math.abs(d);dx=d;}
   if(a.minX<=b.maxX+2&&a.maxX>=b.minX-2) for(const d of [b.minZ-a.maxZ,b.maxZ-a.minZ,b.minZ-a.minZ,b.maxZ-a.maxZ]) if(Math.abs(d)<bz){bz=Math.abs(d);dz=d;}
  }
  p.x+=dx;p.z+=dz;
 }
 if(lockZ) p.x=object.position.x;
 if(height) {const targets=candidates.filter(o=>{const b=objectBounds(o);return p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ;});if(targets.length)p.y=Math.max(...targets.map(o=>o.position.y+o.size.height));}
 for(const axis of ['x','y','z'])p[axis]=Math.round(p[axis]*2)/2;
 if(lockZ){p.x=object.position.x;p.y=object.position.y;}
 return p;
}

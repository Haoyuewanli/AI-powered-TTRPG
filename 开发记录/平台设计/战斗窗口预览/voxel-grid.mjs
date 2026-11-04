// Scene coordinates are anchored at the minimum corner. One integer cell is 0.2.
export const CELL = .2;
export const FEET_PER_UNIT = 5;
export const clean = n => Math.round(n * 1e6) / 1e6;
export const cellIndex = n => Math.round(n / CELL);
export const aligned = n => Number.isFinite(n) && Math.abs(n / CELL - Math.round(n / CELL)) < 1e-7;
export const fromCell = n => clean(n * CELL);
export const toFeet = n => clean(n * FEET_PER_UNIT);
export const cellKey = (x,y,z) => `${x},${y},${z}`;
export function renderItem(i){return {...i,x:toFeet(i.x+i.width/2),z:toFeet(i.z+i.depth/2),width:toFeet(i.width),depth:toFeet(i.depth),height:toFeet(i.height)};}

export function voxelCells(item,variant='solid'){
  const preset=item.preset||item.id;
  const nx=cellIndex(item.width),ny=variant==='footprint'?1:cellIndex(item.height),nz=cellIndex(item.depth),result=[];
  const ellipse=(x,z)=>((x+.5-nx/2)/(nx/2))**2+((z+.5-nz/2)/(nz/2))**2<=1.000001;
  for(let x=0;x<nx;x++)for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){
    let keep=true;
    if(preset==='pillar'||variant==='footprint')keep=ellipse(x,z);
    else if(preset==='ramp'||preset==='stairs')keep=y<Math.max(1,Math.ceil((z+1)*ny/nz));
    else if(variant==='person'){
      const dx=Math.abs(x+.5-nx/2),dz=Math.abs(z+.5-nz/2),head=y>=Math.floor(ny*.7),legs=y<Math.floor(ny*.35);
      keep=head?dx<Math.max(1,Math.ceil(nx*.25))&&dz<Math.max(1,Math.ceil(nz*.25)):
        legs?dx<Math.max(1,Math.ceil(nx*.3))&&dz<Math.max(1,nz*.2)&&(nx<4||dx>=.5):
        dx<Math.max(1,Math.ceil(nx*.45))&&dz<Math.max(1,nz*.2);
    }
    if(keep)result.push([x,y,z]);
  }
  return result;
}

// Grid traversal inserts every crossed brush cell, even for a single fast pointer event.
export function gridLine(a,b,step){
  let x=Math.round(a.x/step),z=Math.round(a.z/step);const endX=Math.round(b.x/step),endZ=Math.round(b.z/step),out=[];
  const dx=Math.abs(endX-x),dz=Math.abs(endZ-z),sx=x<endX?1:-1,sz=z<endZ?1:-1;let ix=0,iz=0;
  while(true){
    out.push({x:clean(x*step),z:clean(z*step)});if(x===endX&&z===endZ)break;
    const nextX=(1+2*ix)*dz,nextZ=(1+2*iz)*dx;
    if(nextX<=nextZ){x+=sx;ix++;}if(nextZ<=nextX){z+=sz;iz++;}
    if(out.length>2000)throw Error('一次铺设距离过长，请分段');
  }
  return out;
}

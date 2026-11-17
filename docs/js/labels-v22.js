import * as THREE from 'three';

// Read layout before writing any label styles. Interleaving each left/top write
// with clientWidth/clientHeight reads forced layout repeatedly during movement.
// Every marker is still projected and receives the exact original CSS values.
export function createMarkerProjector({stage,camera,markers}){
  const projected=new THREE.Vector3(),lastStyles=new WeakMap();
  let frames=0,projections=0,layoutDimensionReads=0,styleWrites=0;
  return {
    frame(){
      const width=stage.clientWidth,height=stage.clientHeight;layoutDimensionReads+=2;frames++;
      for(const {element,position} of markers){
        const p=projected.copy(position).project(camera);projections++;
        const left=`${(p.x+1)*.5*width}px`,top=`${(-p.y+1)*.5*height}px`,display=p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1?'none':'';
        let previous=lastStyles.get(element);if(!previous){previous={};lastStyles.set(element,previous);}
        if(previous.left!==left||element.style.left!==previous.appliedLeft){element.style.left=left;previous.left=left;previous.appliedLeft=element.style.left;styleWrites++;}
        if(previous.top!==top||element.style.top!==previous.appliedTop){element.style.top=top;previous.top=top;previous.appliedTop=element.style.top;styleWrites++;}
        if(previous.display!==display||element.style.display!==previous.appliedDisplay){element.style.display=display;previous.display=display;previous.appliedDisplay=element.style.display;styleWrites++;}
      }
    },
    get state(){return {mode:'read-layout-once-before-style-writes',markers:markers.length,frames,projections,layoutDimensionReads,priorDimensionReadsAtSameWork:projections*2,styleWrites,priorStyleWritesAtSameWork:projections*3,perFrameProjectionPreserved:true};},
  };
}

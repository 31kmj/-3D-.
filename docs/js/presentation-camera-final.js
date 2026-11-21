import * as THREE from 'three';

// Fit existing study geometry, not a new terrain or safety model.
export function fitOverviewCamera({data,coreCorners,width,height,fov,uiHidden=false}){
 const points=[...coreCorners,...data.bridges.flatMap(b=>b.points),...data.plaza];
 const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
 const bounds={min:[Math.min(...xs)-18,-6,Math.min(...zs)-18],max:[Math.max(...xs)+18,Math.max(...data.buildings.map(b=>b.height))+8,Math.max(...zs)+18]};
 const portrait=width/height<.9;
 const margin=uiHidden?{left:25,right:25,top:45,bottom:35}:portrait?{left:24,right:24,top:112,bottom:258}:{left:40,right:40,top:70,bottom:160};
 const center=new THREE.Vector3(...bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(.5);
 const direction=new THREE.Vector3(...(portrait?[-1.15,.90,.44]:[-.46,.93,.95])).normalize();
 const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
 const up=new THREE.Vector3().crossVectors(direction,right).normalize();
 const aspect=width/height,tan=Math.tan(THREE.MathUtils.degToRad(fov/2)),horizontal=tan*aspect;
 const left=-1+2*margin.left/width,rightNdc=1-2*margin.right/width;
 const bottom=-1+2*margin.bottom/height,top=1-2*margin.top/height;
 const cx=(left+rightNdc)/2,cy=(bottom+top)/2;
 let distance=200;
 for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){
  const v=new THREE.Vector3(x,y,z).sub(center),vx=v.dot(right),vy=v.dot(up),vz=v.dot(direction);
  distance=Math.max(distance,(vx+vz*horizontal*rightNdc)/(horizontal*(rightNdc-cx)),(-vx-vz*horizontal*left)/(horizontal*(cx-left)),(vy+vz*tan*top)/(tan*(top-cy)),(-vy-vz*tan*bottom)/(tan*(cy-bottom)));
 }
 distance*=1.025;
 const target=center.clone().addScaledVector(right,-distance*horizontal*cx).addScaledVector(up,-distance*tan*cy);
 const position=target.clone().addScaledVector(direction,distance);
 return {position,target,diagnostics:{mode:portrait?'portrait-corridor':'landscape-diagonal',viewport:[width,height],margins:margin,bounds,distance,position:position.toArray(),target:target.toArray(),basis:'existing core bounds and displayed heights, not surveyed terrain'}};
}

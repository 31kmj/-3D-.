import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Expanded horizontal geography, deliberately without invented terrain relief.
export function buildContext({context,scene,shape,mesh,ribbon,materials,groups,core}){
  const group=new THREE.Group(),grid=new THREE.Group();scene.add(group,grid);
  groups.context=group;groups.grid=grid;grid.visible=false;
  const colors=['#9fa7a5','#b2b5ad','#a4afaf','#bcb9ae','#9ca9aa','#c2c2b8','#acb4b1'];
  const mats=colors.map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.94}));
  const batches=mats.map(()=>[]);
  for(const building of context.buildings){
    const geometry=new THREE.ExtrudeGeometry(shape(building.points),{depth:building.height,bevelEnabled:false,steps:1});
    geometry.rotateX(-Math.PI/2);geometry.translate(0,.09,0);batches[building.id%mats.length].push(geometry);
  }
  batches.forEach((geometries,i)=>{if(!geometries.length)return;const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(merged){const object=mesh(merged,mats[i],group);object.castShadow=true;object.userData.bridgeCameraContextBuildingCount=geometries.length}});
  const old=context.metadata.core_corners,xs=old.map(p=>p[0]),zs=old.map(p=>p[1]);
  const rect=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
  // Split each road segment at core rectangle boundaries. Do not double-draw core roads.
  const outside=p=>p[0]<rect[0]||p[0]>rect[2]||p[1]<rect[1]||p[1]>rect[3];
  let pieces=0;
  for(const road of context.roads)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],d=[b[0]-a[0],b[1]-a[1]],cuts=[0,1];
    for(const [axis,value] of [[0,rect[0]],[0,rect[2]],[1,rect[1]],[1,rect[3]]]){if(Math.abs(d[axis])>1e-8){const t=(value-a[axis])/d[axis];if(t>0&&t<1)cuts.push(t)}}
    cuts.sort((a,b)=>a-b);
    for(let j=1;j<cuts.length;j++){
      const lo=cuts[j-1],hi=cuts[j],mid=(lo+hi)/2;
      if(hi-lo<1e-7||!outside([a[0]+d[0]*mid,a[1]+d[1]*mid]))continue;
      const segment=[[a[0]+d[0]*lo,a[1]+d[1]*lo],[a[0]+d[0]*hi,a[1]+d[1]*hi]];
      ribbon(segment,road.width+.8,.018,materials.sidewalk,group);ribbon(segment,road.width,.065,materials.road,group);pieces++;
    }
  }
  const [minX,minZ,maxX,maxZ]=context.metadata.bounds_xz;
  const gridPoints=[];
  for(let x=Math.ceil(minX/100)*100;x<=maxX;x+=100)gridPoints.push(x,.135,minZ,x,.135,maxZ);
  for(let z=Math.ceil(minZ/100)*100;z<=maxZ;z+=100)gridPoints.push(minX,.135,z,maxX,.135,z);
  const gridGeo=new THREE.BufferGeometry();gridGeo.setAttribute('position',new THREE.Float32BufferAttribute(gridPoints,3));grid.add(new THREE.LineSegments(gridGeo,new THREE.LineBasicMaterial({color:'#547683',transparent:true,opacity:.27,depthWrite:false})));
  const boundaryGeometry=new THREE.BufferGeometry().setFromPoints([...old,old[0]].map(p=>new THREE.Vector3(p[0],.15,p[1])));
  const boundary=new THREE.Line(boundaryGeometry,new THREE.LineDashedMaterial({color:'#9b7345',dashSize:9,gapSize:6,transparent:true,opacity:.65}));boundary.computeLineDistances();group.add(boundary);
  document.getElementById('extentMetric').textContent=`약 ${(context.metadata.width_m/1000).toFixed(2)} × ${(context.metadata.depth_m/1000).toFixed(2)} km`;
  document.getElementById('extentDescription').textContent=`이전 대상 사각 범위의 ${context.metadata.bbox_area_ratio.toFixed(2)}배 · 주변 건물 ${context.buildings.length}개 추가. 외곽 건물은 단순 형상이며 현장 높이 미검증.`;
  document.getElementById('showContext').addEventListener('change',e=>{group.visible=e.target.checked;document.getElementById('showHeightBasis').dispatchEvent(new Event('change'))});
  document.getElementById('showGrid').addEventListener('change',e=>grid.visible=e.target.checked);
  return {group,grid,get buildingOccluders(){return group.children.filter(object=>object.isMesh&&object.userData.bridgeCameraContextBuildingCount)},stats:{additionalBuildings:context.buildings.length,roadPieces:pieces,bboxAreaRatio:context.metadata.bbox_area_ratio,ground:'flat assumed Y=0; not DEM'},
    updateVisibility(){
      const visible=document.getElementById('showContext').checked&&document.getElementById('showBuildings').checked;
      const filter=document.getElementById('hideAssumedHeight').checked;
      // A merged context mesh cannot express the core's per-building evidence filter.
      // Hide context shells while that filter/colour mode is active; roads remain.
      const evidence=document.getElementById('showHeightBasis').checked;
      for(const object of group.children)if(object.isMesh&&object.material&&mats.includes(object.material))object.visible=visible&&!filter&&!evidence;
      const description=document.getElementById('extentDescription');
      description.textContent=`이전 대상 사각 범위의 ${context.metadata.bbox_area_ratio.toFixed(2)}배 · 주변 건물 ${context.buildings.length}개 추가. `+(filter||evidence?'높이 근거 확인 중에는 단순 외곽 건물을 숨깁니다.':'외곽 건물은 단순 형상이며 현장 높이 미검증.');
    }};
}

export function createWaterEdge(points,scene){
  const geometry=new THREE.BufferGeometry().setFromPoints([...points,points[0]].map(p=>new THREE.Vector3(p[0],0,p[1])));
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#8dced6',transparent:true,opacity:.7,depthWrite:false}));
  scene.add(line);return line;
}

export function riskMaterial(color,pattern){
  if(!pattern)return new THREE.MeshBasicMaterial({color,transparent:true,opacity:.86,toneMapped:false});
  const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,64,64);
  ctx.strokeStyle='#ffffffa6';ctx.lineWidth=4;
  for(let x=-64;x<=128;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+64,64);ctx.stroke();if(pattern===2){ctx.beginPath();ctx.moveTo(x,64);ctx.lineTo(x+64,0);ctx.stroke()}}
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(5,1);
  return new THREE.MeshBasicMaterial({color:'#ffffff',map,transparent:true,opacity:.9,toneMapped:false});
}

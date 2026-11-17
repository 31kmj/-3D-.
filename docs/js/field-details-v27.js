import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {worldSurface} from './graphics-v21.js';

// Photo-visible material families, not photogrammetry or measured geometry.
// The original OSM XY and proximity-derived -3/0 endpoints remain the contract.
const PHOTO_MATCH={302087643:{ids:['P053','P054','P055','P056'],match:'direct-name-and-number',number:5},302093056:{ids:['P094','P095','P096','P097','P098'],match:'direct-name-and-number',number:7}};
const ASSUMPTIONS={widthM:2.7,widthPolicy:'Maximum2.7m; short bent polylines narrowed so miter landings fit adjacent segments; visual assumption, not measured or building-code compliance',lowY:-3,highY:0,defaultSteps:18,railHeightM:1.02,postSpacingM:1.3,landingPolicy:'Turn-dependent flat bands match miter footprint; endpoint flats0.20m, no longitudinal extension beyond mapped ends',elevator:'7번 인접 상대배치 외관 가정 / 운행·접근성·대피 연결 없음',surfaces:'사진의 가시 재질 계열만 참고 / 좌표·단수·폭·표고·숨은면은 실측 아님',drain:'참 옆 배수구는 절차적 외관 가정 / 관로·유량·실제 위치 미확인'};
const EPS=1e-8;
const length=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
function distanceToWalk(p,walks){return Math.min(...walks.flatMap(w=>w.points.slice(1).map((q,i)=>{const a=w.points[i],dx=q[0]-a[0],dz=q[1]-a[1],t=THREE.MathUtils.clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t)})))}

export function createStairLayout(stair,walks){
  if(!Array.isArray(stair.points)||stair.points.length<2||stair.points.some(p=>p.length<2||!p.slice(0,2).every(Number.isFinite)))throw Error('Invalid stair polyline '+stair.id);
  const a=stair.points[0],b=stair.points.at(-1),forward=distanceToWalk(a,walks)<distanceToWalk(b,walks),points=(forward?stair.points:stair.points.slice().reverse()).map(p=>p.slice()),distances=[0];
  for(let i=1;i<points.length;i++){const d=length(points[i-1],points[i]);if(d<EPS)throw Error('Zero-length stair segment '+stair.id);distances.push(distances.at(-1)+d)}
  const total=distances.at(-1),directions=points.slice(1).map((p,i)=>[(p[0]-points[i][0])/(distances[i+1]-distances[i]),(p[1]-points[i][1])/(distances[i+1]-distances[i])]),turns=[];
  let widthM=2.7;
  for(let i=1;i<points.length-1;i++){const u=directions[i-1],v=directions[i],dot=THREE.MathUtils.clamp(u[0]*v[0]+u[1]*v[1],-1,1),angle=Math.acos(dot),tanHalf=Math.tan(angle/2),adjacent=Math.min(distances[i]-distances[i-1],distances[i+1]-distances[i]);
    if(angle>Math.PI*.75)throw Error('Unsupported sharp stair turn '+stair.id);
    widthM=Math.min(widthM,adjacent*.70/(tanHalf+.20));turns.push({index:i,station:distances[i],angle,tanHalf});
  }
  if(widthM<.6)throw Error('Stair polyline too short for bounded landing '+stair.id);
  const half=widthM/2,endpointFlat=Math.min(.20,total*.04),joins=points.map((p,i)=>{let n;if(i===0)n=[-directions[0][1],directions[0][0]];else if(i===points.length-1)n=[-directions.at(-1)[1],directions.at(-1)[0]];else{const a=[-directions[i-1][1],directions[i-1][0]],b=[-directions[i][1],directions[i][0]],den=1+a[0]*b[0]+a[1]*b[1];n=[(a[0]+b[0])/den,(a[1]+b[1])/den]}return {center:[...p],offset:n,left:[p[0]+n[0]*half,p[1]+n[1]*half],right:[p[0]-n[0]*half,p[1]-n[1]*half]}});
  const bands=[[0,endpointFlat],[total-endpointFlat,total],...turns.map(t=>{const radius=half*t.tanHalf+.10;return [Math.max(0,t.station-radius),Math.min(total,t.station+radius)]})].sort((x,y)=>x[0]-y[0]);
  const plateaus=[];for(const band of bands){if(plateaus.length&&band[0]<=plateaus.at(-1)[1])plateaus.at(-1)[1]=Math.max(plateaus.at(-1)[1],band[1]);else plateaus.push([...band])}
  const flatLength=plateaus.reduce((sum,[x,y])=>sum+y-x,0),active=total-flatLength;
  if(!(active>EPS))throw Error('No rising stair length '+stair.id);
  const yAt=d=>{const clamped=THREE.MathUtils.clamp(d,0,total),flat=plateaus.reduce((sum,[x,y])=>sum+Math.max(0,Math.min(clamped,y)-x),0);return -3+3*(clamped-flat)/active};
  function at(d){d=THREE.MathUtils.clamp(d,0,total);let i=1;while(i<distances.length-1&&distances[i]<d-EPS)i++;const a=points[i-1],b=points[i],t=(d-distances[i-1])/(distances[i]-distances[i-1]);return {point:[a[0]+(b[0]-a[0])*t,yAt(d),a[1]+(b[1]-a[1])*t],direction:[(b[0]-a[0])/(distances[i]-distances[i-1]),(b[1]-a[1])/(distances[i]-distances[i-1])],segment:i-1}}
  const cuts=[...new Set([0,total,...distances,...plateaus.flat()].map(d=>+d.toFixed(9)))].sort((a,b)=>a-b),intervals=[];
  for(let i=1;i<cuts.length;i++){const start=cuts[i-1],end=cuts[i];if(end-start<EPS)continue;intervals.push({start,end,y0:yAt(start),y1:yAt(end),flat:Math.abs(yAt(end)-yAt(start))<EPS})}
  const requestedSteps=Math.max(8,Math.min(28,Number.isFinite(stair.step_count_tag)?Math.round(stair.step_count_tag):18)),rising=intervals.filter(i=>!i.flat),count=Math.max(requestedSteps,rising.length);
  let assigned=0;for(const it of rising){it.steps=Math.max(1,Math.floor(count*(it.y1-it.y0)/3));assigned+=it.steps}
  while(assigned<count){const item=rising.reduce((best,it)=>((it.y1-it.y0)/it.steps>(best.y1-best.y0)/best.steps?it:best));item.steps++;assigned++}
  const treads=[];for(const it of intervals){const n=it.flat?1:it.steps;for(let i=0;i<n;i++){const start=it.start+(it.end-it.start)*i/n,end=it.start+(it.end-it.start)*(i+1)/n;treads.push({start,end,y:it.flat?it.y0:yAt(end),flat:it.flat})}}
  function boundary(d,side=1,inset=0){const p=at(d),corner=distances.findIndex(s=>Math.abs(s-d)<EPS),offset=corner>=0?joins[corner].offset:[-p.direction[1],p.direction[0]],w=(half-inset)*side;return [p.point[0]+offset[0]*w,p.point[1],p.point[2]+offset[1]*w]}
  const footprint=joins.slice(1).map((j,i)=>[joins[i].left,j.left,j.right,joins[i].right].map(p=>[...p]));
  return {id:stair.id,points,distances,total,plateaus,intervals,treads,widthM,joins,turns,footprint,boundary,stepCount:assigned,requestedSteps,low:forward?a:b,high:forward?b:a,at,yAt};
}

function woodMaterial(waterUniform){
  const w=128,h=64,bytes=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,seam=x%16<1,grain=Math.sin(y*.45+x*.07)*4+Math.sin(y*2.3+x*.2)*2,n=(seam?-16:0)+grain;bytes.set([Math.max(0,86+n),Math.max(0,68+n),Math.max(0,52+n),seam?32:172+Math.sin(y*.5)*12],i)}
  const map=new THREE.DataTexture(bytes,w,h,THREE.RGBAFormat);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;map.userData.graphicsPacked=true;
  return worldSurface(new THREE.MeshStandardMaterial({color:'#b5a392',map,bumpMap:map,bumpScale:.012,roughness:.88,envMapIntensity:.45}),{tile:[2.7,.7],waterUniform,wet:true});
}

export function buildFieldDetails({data,groups,visual,waterUniform={value:-4.2}}){
  const root=new THREE.Group();root.name='photo-informed-stairs-source27';groups.stairs.add(root);
  const materials={wood:woodMaterial(waterUniform),stone:worldSurface(visual.wall.clone(),{tile:[2.4,1.2],waterUniform,wet:true}),metal:worldSurface(new THREE.MeshStandardMaterial({color:'#b7c6c9',metalness:.88,roughness:.27,envMapIntensity:.95}),{metal:true}),frame:new THREE.MeshStandardMaterial({color:'#697274',metalness:.63,roughness:.53}),white:new THREE.MeshStandardMaterial({color:'#e6e7df',roughness:.72}),blue:new THREE.MeshStandardMaterial({color:'#3d85a1',roughness:.65}),yellow:new THREE.MeshStandardMaterial({color:'#d5b739',roughness:.8}),dark:new THREE.MeshStandardMaterial({color:'#25393e',metalness:.25,roughness:.65}),glass:new THREE.MeshStandardMaterial({color:'#78b5b6',metalness:.1,roughness:.15,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide})};
  const buckets=new Map(),counts={inputPieces:0,steps:0,flatPieces:0,posts:0,rails:0,drains:0,signs:0,elevatorVisuals:0};
  function geometry(g,key,matrix){if(matrix)g.applyMatrix4(matrix);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);counts.inputPieces++}
  const dummy=new THREE.Object3D();
  function box(w,h,d,x,y,z,key='metal',yaw=0){dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();geometry(new THREE.BoxGeometry(w,h,d),key,dummy.matrix)}
  function bar(a,b,r=.035,key='metal'){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),v=to.clone().sub(from),len=v.length();if(len<EPS)return;dummy.position.copy(from).add(to).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());dummy.scale.set(1,1,1);dummy.updateMatrix();geometry(new THREE.CylinderGeometry(r,r,len,8,1),key,dummy.matrix)}
  function sidePoint(layout,d,side,height=0){const p=layout.boundary(d,Math.sign(side)||1,layout.widthM/2-Math.abs(side));return [p[0],p[1]+height,p[2]]}
  function surface(layout,start,end,y,key){const a=layout.boundary(start,1),b=layout.boundary(end,1),c=layout.boundary(end,-1),d=layout.boundary(start,-1),shape=new THREE.Shape();shape.moveTo(a[0],a[2]);for(const p of [b,c,d])shape.lineTo(p[0],p[2]);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:.11,bevelEnabled:false,steps:1});g.rotateX(Math.PI/2);g.translate(0,y,0);if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));geometry(g,key)}
  function digit(value,center,yaw){const segments={5:[0,1,3,5,6],7:[0,2,5]},lines=[[-.14,.24,.14,.24],[-.14,.24,-.14,0],[.14,.24,.14,0],[-.14,0,.14,0],[-.14,0,-.14,-.24],[.14,0,.14,-.24],[-.14,-.24,.14,-.24]];for(const s of segments[value]||[]){const [ax,ay,bx,by]=lines[s],dir=[Math.cos(yaw),-Math.sin(yaw)];bar([center[0]+dir[0]*ax,center[1]+ay,center[2]+dir[1]*ax],[center[0]+dir[0]*bx,center[1]+by,center[2]+dir[1]*bx],.035,'dark')}}
  const stairDetails=[];
  for(const stair of data.stairs){
    const layout=createStairLayout(stair,data.walks),photo=PHOTO_MATCH[stair.id],tag=stair.tags?.surface,material=photo||tag==='wood'?'wood':'stone',width=layout.widthM,details={id:stair.id,name:stair.name,photoIDs:photo?.ids||(+stair.id===302087645?['P028','P029','P030']:[]),match:photo?.match||(+stair.id===302087645?'type-reference-only-id-unconfirmed':'OSM-tag-or-unconfirmed-common-detail'),materialFamily:material,materialBasis:photo?'photo-visible':tag?'OSM surface tag':'unconfirmed neutral stone',widthM:width,widthBasis:'Assumed bounded landing fit, not measured',stepCount:layout.stepCount,stepCountBasis:stair.step_count_tag?'OSM tag':'assumed default18 distributed across flights',low:[...layout.low],high:[...layout.high],lowY:-3,highY:0,mappedVertices:layout.points.map(p=>[...p]),stationsM:[...layout.distances],plateausM:layout.plateaus,footprint:layout.footprint,landingFootprintMatchesFlatBands:true,geometryLengthM:layout.total,endpointHeightPreserved:true,allMappedVerticesFollowed:true};
    stair.low=layout.low;stair.high=layout.high;
    for(const t of layout.treads){const start=layout.at(t.start),end=layout.at(t.end),mid=layout.at((t.start+t.end)/2),yaw=Math.atan2(end.point[0]-start.point[0],end.point[2]-start.point[2]),run=t.end-t.start;
      surface(layout,t.start,t.end,t.y,material);counts[t.flat?'flatPieces':'steps']++;
      if(!t.flat){for(const side of [-1,1]){const p=sidePoint(layout,(t.start+t.end)/2,side*(width/2-.05),t.y-mid.point[1]-.055);box(.055,.055,run*.75,p[0],p[1],p[2],'frame',yaw)}
        // P094 has pale warning riser strips, not yellow tread edges.
        if(photo?.number===7){const p=layout.at(t.start),dy=Math.min(.10,(t.y-p.point[1])*.7);box(width*.80,Math.max(.035,dy),.014,p.point[0],t.y-.067,p.point[2],'white',yaw);box(width*.80,.014,.017,p.point[0],t.y-.045,p.point[2],'blue',yaw)}
      }
    }
    // Each flat piece uses the same miter boundary as its plateau. No oversized
    // corner square can overlap a rising flight or float outside the opening.
    const railStations=[...new Set([0,layout.total,...layout.distances,...layout.plateaus.flat(),...Array.from({length:Math.ceil(layout.total/1.3)+1},(_,i)=>Math.min(layout.total,i*1.3))])].sort((a,b)=>a-b);
    for(const side of [-1,1]){
      for(let i=1;i<layout.distances.length;i++){const a=layout.distances[i-1],b=layout.distances[i];for(const it of layout.intervals.filter(it=>it.start>=a-EPS&&it.end<=b+EPS)){const pa=sidePoint(layout,it.start,side*(width/2-.08),-.17),pb=sidePoint(layout,it.end,side*(width/2-.08),-.17);bar(pa,pb,.085,'frame')}}
      for(const d of railStations){const p=sidePoint(layout,d,side*(width/2-.07));bar(p,[p[0],p[1]+1.02,p[2]],.042);box(.20,.035,.20,p[0],p[1]+.018,p[2],'metal');counts.posts++;for(const bx of [-.065,.065])for(const bz of [-.065,.065])box(.025,.022,.025,p[0]+bx,p[1]+.045,p[2]+bz,'dark')}
      for(let i=1;i<railStations.length;i++)for(const h of [.27,.49,.71,1.02]){bar(sidePoint(layout,railStations[i-1],side*(width/2-.07),h),sidePoint(layout,railStations[i],side*(width/2-.07),h),h===1.02?.045:.022);counts.rails++}
    }
    // A small authored landing-side drain: surface detail, not a hydraulic input.
    const high=layout.at(layout.total),yaw=Math.atan2(high.direction[0],high.direction[1]),drain=sidePoint(layout,Math.max(0,layout.total-.16),width/2+.15);
    box(.18,.035,.48,drain[0],drain[1]+.012,drain[2],'dark',yaw);for(let i=-3;i<=3;i++){const x=drain[0]+high.direction[0]*i*.055,z=drain[2]+high.direction[1]*i*.055;box(.18,.015,.018,x,drain[1]+.035,z,'metal',yaw)}counts.drains++;
    if(photo){const p=sidePoint(layout,layout.total-.12,width/2+.38);box(.38,2.35,.38,p[0],p[1]+1.175,p[2],'white',yaw);box(.39,.055,.39,p[0],p[1]+1.40,p[2],'blue',yaw);const front=[p[0]+high.direction[0]*.20,p[1]+1.96,p[2]+high.direction[1]*.20];digit(photo.number,front,yaw);counts.signs++}
    if(photo?.number===7){
      // P094-96 tower exterior only. Location is a visual offset from the old
      // upper endpoint; there is deliberately no graph node or moving cabin.
      const p=sidePoint(layout,layout.total,-(width/2+1.65)),center=[p[0]+high.direction[0]*.4,p[2]+high.direction[1]*.4],s=2.2;
      box(s,6.6,s,center[0],.3,center[1],'glass',yaw);box(s+.4,.12,s+.4,center[0],3.64,center[1],'metal',yaw);
      for(const x of [-s/2,s/2])for(const z of [-s/2,s/2]){const px=center[0]+Math.cos(yaw)*x+Math.sin(yaw)*z,pz=center[1]-Math.sin(yaw)*x+Math.cos(yaw)*z;bar([px,-3,pz],[px,3.6,pz],.065,'metal')}
      for(const y of [-2.95,-1.3,.6,2.2,3.55])for(const side of [-1,1]){const x=center[0]+Math.cos(yaw)*side*s/2,z=center[1]-Math.sin(yaw)*side*s/2;bar([x-Math.sin(yaw)*s/2,y,z-Math.cos(yaw)*s/2],[x+Math.sin(yaw)*s/2,y,z+Math.cos(yaw)*s/2],.045,'metal')}
      const tactile=layout.at(layout.total-.14);box(.65,.025,.30,tactile.point[0],.027,tactile.point[2],'yellow',yaw);for(let x=-2;x<=2;x++)for(let z=-1;z<=1;z++)box(.035,.018,.035,tactile.point[0]+Math.cos(yaw)*x*.10+Math.sin(yaw)*z*.09,.049,tactile.point[2]-Math.sin(yaw)*x*.10+Math.cos(yaw)*z*.09,'yellow');counts.elevatorVisuals++;
      details.elevatorVisualOnly=true;details.elevatorRelativePlacementAssumed=true;details.newGraphConnection=false;
    }
    stairDetails.push(details);
  }
  const batchMetrics=[];
  for(const [key,pieces] of buckets){const beforeVertices=pieces.reduce((n,g)=>n+g.attributes.position.count,0),merged=mergeGeometries(pieces,false);if(!merged)throw Error('Stair merge failed '+key);
    let attributesPreserved=true,indicesPreserved=true;for(const name of Object.keys(merged.attributes)){let offset=0;for(const g of pieces){const input=g.attributes[name].array,output=merged.attributes[name].array;for(let i=0;i<input.length;i++)if(input[i]!==output[offset+i])attributesPreserved=false;offset+=input.length}}
    let vertexOffset=0,indexOffset=0;for(const g of pieces){for(let i=0;i<g.index.count;i++)if(merged.index.array[indexOffset+i]!==g.index.array[i]+vertexOffset)indicesPreserved=false;indexOffset+=g.index.count;vertexOffset+=g.attributes.position.count}
    if(!attributesPreserved||!indicesPreserved)throw Error('Stair merge attribute/index mismatch '+key);
    merged.computeBoundingBox();merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,materials[key]);mesh.name='field-stairs-'+key;mesh.castShadow=key!=='glass';mesh.receiveShadow=true;mesh.userData.fieldPhotoDetail=true;root.add(mesh);batchMetrics.push({material:key,inputPieces:pieces.length,inputVertices:beforeVertices,outputVertices:merged.attributes.position.count,attributeNames:Object.keys(merged.attributes),attributesPreserved,indicesPreserved,bounds:{min:merged.boundingBox.min.toArray(),max:merged.boundingBox.max.toArray()}});for(const g of pieces)g.dispose()}
  const diagnostics={version:'source27',scope:'photo-informed-exterior / not measured survey',photoIDs:[...new Set(stairDetails.flatMap(s=>s.photoIDs))],stairs:stairDetails,materialFamilies:Object.keys(materials).filter(k=>buckets.has(k)),assumptions:ASSUMPTIONS,geometry:{...counts,batches:batchMetrics.length,metrics:batchMetrics},routeGraphChanged:false,waterChanged:false,pointCloudOrPhotogrammetry:false,photoPixelsUsed:false};
  root.userData.fieldDetailsDiagnostics=diagnostics;return diagnostics;
}

// Only explicitly supplied obstacle meshes are affected. This visual cutout is
// not an observed opening, collision model, new terrain survey or route edge.
export function applyStairOpeningMasks(meshes,stairs){
  if(!Array.isArray(meshes)||!Array.isArray(stairs))throw Error('Opening mask requires explicit mesh/stair arrays');
  const corridors=[];for(const stair of stairs){const layout=createStairLayout(stair,[]);layout.footprint.forEach((quad,i)=>corridors.push({stairId:stair.id,segment:i,a:[...layout.points[i]],b:[...layout.points[i+1]],quad,widthM:layout.widthM}))}
  if(!corridors.length)return {mode:'assumed-worldXZ-stair-opening',targetCount:0,corridors:[],routeGraphChanged:false};
  if(corridors.length>128)throw Error('Opening corridor count exceeds bounded shader budget');
  const quads=corridors.flatMap(c=>c.quad.map(p=>new THREE.Vector2(...p))),key='fieldStairOpening27:'+JSON.stringify(corridors),uniforms={fieldStairQuadPoints:{value:quads}},targets=[...new Set(meshes)];
  const declaration='varying vec2 vFieldStairXZ;';
  const fragment=declaration+`\nuniform vec2 fieldStairQuadPoints[${quads.length}];\nfloat fieldStairCross(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}\nbool fieldStairOpening(){\n for(int i=0;i<${corridors.length};i++){vec2 a=fieldStairQuadPoints[i*4],b=fieldStairQuadPoints[i*4+1],c=fieldStairQuadPoints[i*4+2],d=fieldStairQuadPoints[i*4+3];float e0=fieldStairCross(b-a,vFieldStairXZ-a),e1=fieldStairCross(c-b,vFieldStairXZ-b),e2=fieldStairCross(d-c,vFieldStairXZ-c),e3=fieldStairCross(a-d,vFieldStairXZ-d);if((min(min(e0,e1),min(e2,e3))>=-0.00001)||(max(max(e0,e1),max(e2,e3))<=0.00001))return true;}\n return false;\n}\n`;
  function decorate(material,prior){
    const priorCompile=prior.onBeforeCompile,priorKey=prior.customProgramCacheKey.call(prior);material.onBeforeCompile=function(shader,renderer){priorCompile.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
      const anchor='#include <project_vertex>';if(!shader.vertexShader.includes(anchor)||!shader.fragmentShader.includes('#include <clipping_planes_fragment>'))throw Error('Opening shader anchors unavailable');
      shader.vertexShader=declaration+'\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace(anchor,`vec4 fieldStairLocal=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nfieldStairLocal=instanceMatrix*fieldStairLocal;\n#endif\nvFieldStairXZ=(modelMatrix*fieldStairLocal).xz;\n${anchor}`);
      shader.fragmentShader=fragment+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(fieldStairOpening())discard;');
    };material.customProgramCacheKey=()=>priorKey+'|'+key;material.userData.fieldStairOpening={maxWidthM:2.7,finiteButtEnds:true,assumed:true};material.needsUpdate=true;return material;
  }
  const cache=new Map();function color(source){if(!cache.has(source))cache.set(source,decorate(source.clone(),source));return cache.get(source)}
  for(const object of targets){if(!object?.isMesh||!object.userData.fieldOpeningCandidate||object.userData.fieldPhotoDetail||object.userData.fieldStairOpeningTarget)throw Error('Opening mask accepts explicitly tagged previously unmasked obstacle meshes only');const source=Array.isArray(object.material)?object.material:[object.material];if(source.some(m=>!m?.isMaterial))throw Error('Missing opening material')}
  for(const object of targets){const source=Array.isArray(object.material)?object.material:[object.material];object.material=Array.isArray(object.material)?source.map(color):color(source[0]);
    const priorDepth=object.customDepthMaterial||new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:source[0].side,map:source[0].map,alphaMap:source[0].alphaMap,alphaTest:source[0].alphaTest,displacementMap:source[0].displacementMap,displacementScale:source[0].displacementScale,displacementBias:source[0].displacementBias});object.customDepthMaterial=decorate(priorDepth.clone(),priorDepth);object.userData.fieldStairOpeningTarget=true;
  }
  return {mode:'assumed-finite-miter-stair-opening',basis:'Same bounded footprint as stair surfaces, butt ends flush at original mapped endpoints; assumed fit, no surveyed terrain opening',targetCount:targets.length,targetNames:targets.map(m=>m.name||'(unnamed)'),materialCount:cache.size,corridors,maxWidthM:2.7,sideClearanceM:0,finiteButtEnds:true,cornerFootprintMatches:true,shadowDepthMasked:true,routeGraphChanged:false,geometryCoordinatesChanged:false,cpuPerFrameWork:false,pointLightDistanceShadowMask:false};
}

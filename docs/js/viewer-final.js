import {buildLandmark,landmarkContracts,landmarkPresets} from './landmarks-v23.js';
import {createMarkerProjector} from './labels-v22.js';
import {createFrameProfiler} from './performance-v22.js';
import {createFloodUI} from './flood-ui-final.js';
import {bridgeCameraCandidates} from './bridge-camera-v14.js';
import {buildLocalNameIndex,createLocalNameSearch} from './search-v14.js';
import {createPlaceSelection} from './selection-v23.js';
import {batchEquivalentMeshes,sceneMeshMetrics} from './batching-v14.js';
import {createLightingLab as createLegacyLighting} from './lighting-v14.js';
import {createLightingLab as createNewLighting} from './lighting-final.js';
import {createGraphics} from './graphics-v21.js';
import {createBankSurfaces,buildPavingBands} from './bank-surfaces-v28.js';
import {createPhotoWater} from './water-detail-v28.js';
import {buildEvidenceBridge as buildNewBridge} from './bridges-v21.js';
import {buildEvidenceBridge as buildFieldBridge} from './bridges-v26.js';
import {buildFieldDetails as buildLegacyField,applyStairOpeningMasks as applyLegacyOpeningMasks} from './field-details-v26.js';
import {buildFieldDetails,applyStairOpeningMasks} from './field-details-v27.js';
import {buildExitFixtures} from './exit-fixtures-v27.js';
import {createPostProcessing as createNewPost} from './detail-final.js';
import {initRainfallUI} from './hydrology-v14.js';
// Version 2 is an evolution of Version 1: the scenario/visibility/OrbitControls
// interactions remain; procedural city boxes are replaced by attributed OSM geometry.
import * as THREE from 'three';
import {createInterface} from './interface-v32.js';
import {buildContext,createWaterEdge,riskMaterial} from './context-v14.js';
import {buildEvidenceBridge,gwangtongDetailCamera} from './gwangtong-v20.js';
import {createEvidenceUI} from './evidence-v23.js';
import {createArtMaterials,addMappedDetails} from './art-v14.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadVisualAssets, buildReferenceBridge, createPostProcessing as createLegacyPost, createBenchmark } from './detail-v14.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const stage = document.getElementById('stage');
// 새 표시 번호와 안정된 기존 구현 ID를 구분한다.
Object.assign(stage.dataset,{activeVersion:'31',displayVersion:'발표 마감본',legacyVersionOrdinal:'32',legacyDisplayVersion:'발표 마감본',buildRevision:'final-render-20261117',versionNamespace:'final'});
const loading = document.getElementById('loading');
const $ = id => document.getElementById(id);
const shell=window.cheonggyeV32Shell||createInterface();
const labels = [['가상 수위 낮음','시연 0.8m'],['가상 수위 중간','시연 1.8m'],['가상 수위 높음','시연 2.6m']];
let bridgeCameraBasis=null;
let curr=0, evening=false, frame=0, lastTime=performance.now(), movingTo=null,currentView='overview';

function makeGraphicPresets(data){
  const at=(points,fraction)=>{const distances=[0];for(let i=1;i<points.length;i++)distances.push(distances.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));const wanted=distances.at(-1)*fraction;let i=1;while(i<distances.length-1&&distances[i]<wanted)i++;const t=(wanted-distances[i-1])/(distances[i]-distances[i-1]||1),a=points[i-1],b=points[i];return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]};
  const views={overview:{position:[155,1150,620],target:[15,-1,20],fov:42}};
  for(const [side,fraction] of [['west',.18],['east',.76]]){const walkLine=data.walks[0].points[0][0]>data.walks[0].points.at(-1)[0]?data.walks[0].points.slice().reverse():data.walks[0].points,walk=at(walkLine,fraction),water=at(data.centerline,fraction);views['walk-'+side]={position:[walk[0],-1.25,walk[1]],target:[walk[0]+18,-2.1,walk[1]+4.5],fov:42};views['water-'+side]={position:[water[0]-7,-2.25,water[1]+3],target:[water[0]+13,-4.05,water[1]-1],fov:42}}
  for(const [key,name] of [['mojeon','모전교'],['gwang','광교'],['jangtong','장통교'],['samil','삼일교']]){const b=data.bridges.find(b=>b.name===name),p=b.center;views[key+'-close']={position:[p[0]-b.official_width_m/2-23,2.0,p[1]+8],target:[p[0],-.65,p[1]],fov:42,bridge:name}}
  const gwang=data.bridges.find(b=>b.name==='광교');
  views['gwang-under']={position:[gwang.center[0]-gwang.official_width_m/2-23,-1.25,gwang.center[1]+3],target:[gwang.center[0],-2.3,gwang.center[1]],fov:42,bridge:'광교',basis:'assumed channel presentation camera, not surveyed eye position'};
  const local=(bridge,x,y,z)=>{const yaw=Math.atan2(bridge.points.at(-1)[0]-bridge.points[0][0],bridge.points.at(-1)[1]-bridge.points[0][1]);return [bridge.center[0]+Math.cos(yaw)*x+Math.sin(yaw)*z,y,bridge.center[1]-Math.sin(yaw)*x+Math.cos(yaw)*z]};
  const jang=data.bridges.find(b=>b.name==='장통교'),samil=data.bridges.find(b=>b.name==='삼일교');
  views['field-jangtong']={position:local(jang,-jang.official_width_m/2-10,3.5,-9),target:local(jang,-jang.official_width_m/2,.6,-1),field:true,fov:42,description:'장통교 · P064/P067 참고 석재난간 / 세부치수·표고 추정'};
  views['field-samil']={position:local(samil,-samil.official_width_m/2-12,3.8,-8),target:local(samil,-samil.official_width_m/2,.8,0),field:true,fov:42,description:'삼일교 · P079/P094 참고 곡면 차폐 / 세부치수·표고 추정'};
  views['field-gwang-under']={position:local(gwang,-gwang.official_width_m/2+1.7,-2.9,-4),target:local(gwang,-gwang.official_width_m/2+1.7,-.9,4),field:true,fov:42,description:'광교 · P040/P043 참고 교하 거더·배관·조명 / 가정 카메라·부재배치'};
  for(const [key,id,photo] of [['field-exit5',302087643,'P053~P056'],['field-exit7',302093056,'P094~P098'],['field-exit3',302087645,'사진유형참고·ID정합미확정'],['field-exit4',302087656,'OSM목재태그·사진정합미확정'],['field-exit-osm',238533393,'OSM목재태그·사진정합미확정']]){
    const s=data.stairs.find(s=>s.id===id),low=s.low||s.points[0],high=s.high||s.points.at(-1),dx=high[0]-low[0],dz=high[1]-low[1],len=Math.hypot(dx,dz),right=[dz/len,-dx/len];
    views[key]={position:[low[0]-dx/len*10+right[0]*9,5.5,low[1]-dz/len*10+right[1]*9],target:[(low[0]+high[0])/2,-1.1,(low[1]+high[1])/2],field:true,fov:42,description:s.name+' · '+photo+' 참고 / 폭·표고'+(id===302093056?'·승강기 위치':'')+' 추정'};
  }
  for(const [key,id] of [['field-gate5',302087643],['field-warning7',302093056]]){
    const stair=data.stairs.find(s=>s.id===id),low=stair.low,high=stair.high,dx=high[0]-low[0],dz=high[1]-low[1],len=Math.hypot(dx,dz),u=[dx/len,dz/len],n=[-u[1],u[0]];
    views[key]=key==='field-gate5'?{position:[high[0]-u[0]*3.2-n[0]*4.5,2.6,high[1]-u[1]*3.2-n[1]*4.5],target:[high[0]-.4*u[0],.85,high[1]-.4*u[1]],field:true,fov:42,description:'장통교5번 · P054 열린 게이트 참고 / 정적 외관·현재 통제/경보 아님'}:{position:[low[0]-u[0]*3,-1.1,low[1]-u[1]*3],target:[low[0]+u[0]*9,-1.25,low[1]+u[1]*9],field:true,fov:42,description:'삼일교7번 · P094 안내 문구 참고 / 정적 표식·실제 통제 미연결'};
  }
  for(const side of ['west','east']){
    views['surface-'+side]={...views['walk-'+side],field:true,description:'사진 참고 연속 포장·석축 / 위치·치수·색도 추정'};
    views['surface-water-'+side]={...views['water-'+side],field:true,description:'광학 수면·가정 하상 무늬 / 실제 침수심·유속 아님'};
  }
  return {...views,...landmarkPresets()};
}

try {
  const query=new URLSearchParams(location.search),diagnostic=query.get('diagnostic'),legacyGraphics=query.get('graphics')==='legacy';
  const createPostProcessing=legacyGraphics?createLegacyPost:createNewPost,createLightingLab=legacyGraphics?createLegacyLighting:createNewLighting;
  if(diagnostic==='data-error')throw Error('검증용: 지도 자료를 읽지 못한 상황입니다.');
  async function readJSON(path,label){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch(new URL('../data/'+path,import.meta.url),{signal:controller.signal});if(!response.ok)throw Error(label+' HTTP '+response.status);return await response.json()}
    catch(error){if(error.name==='AbortError')throw Error(label+' 요청 시간이 초과되었습니다 (20초).');throw error}
    finally{clearTimeout(timer)}
  }
  window.cheonggyeV32Load?.status('지도·교량·과거 강우 자료를 함께 불러오는 중입니다…');
  const [data,rainData,context,official,detailContext,floodFixtures,temporalFixtures,evacuationScope]=await Promise.all([
    readJSON('scene_precision_v5.json','핵심 지도'),readJSON('rainfall_v7.json','과거 강우'),
    readJSON('context_v6.json','확장 지도'),readJSON('official_facilities_v5.json','공식 안내점'),readJSON('detail_context_v4.json','주변 시설'),readJSON('flood_scenarios_v15.json','합성 침수 실험'),readJSON('temporal_scenarios_v19.json','합성 시간 실험'),readJSON('evacuation_scope_v19.json','대피 적용 범위'),
  ]);
  const photoLegacy=query.get('fieldDetail')==='legacy';
  const surfaceLegacy=query.get('surfaceDetail')==='legacy';
  const legacyBridgeComparison=query.get('bridgeDetail')==='legacy';
  if(legacyBridgeComparison)window.cheonggyeV32Load?.notice('검증용 이전 광통교 형상 · 동일 근접 시점으로 비교합니다.');
  const gwangtongBridge=data.bridges.find(b=>b.name==='광통교'),gwangtongCamera=gwangtongDetailCamera(gwangtongBridge);
  const meta=data.metadata,rainfall=initRainfallUI(rainData);
  if(diagnostic==='webgl-error')throw Error('검증용: WebGL 그래픽 기능을 사용할 수 없습니다.');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dce8f0');
  scene.fog = new THREE.Fog('#dce8f0', 2200, 4800);
  const camera = new THREE.PerspectiveCamera(42,1,.5,6000);
  // Centimetre-spaced road layers need more depth precision in the kilometre-wide view.
  // Keep the close plane low at walking height; change only projection, never geometry.
  function updateDepthPrecision(){const near=THREE.MathUtils.clamp(Math.abs(camera.position.y)/30,.1,40);if(Math.abs(camera.near-near)>.02){camera.near=near;camera.updateProjectionMatrix()}}
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'})}
  catch(error){throw Error('이 브라우저에서 3D 그래픽(WebGL)을 시작하지 못했습니다. 브라우저를 업데이트하거나 그래픽 가속을 지원하는 기기로 접속해 주세요.')}
  let animationFrame=null,contextLost=false,firstFrame=true;
  renderer.domElement.addEventListener('webglcontextlost',event=>{
    event.preventDefault();contextLost=true;cancelAnimationFrame(animationFrame);stage.dataset.contextLost='true';
    window.cheonggyeV32Load?.error('3D 그래픽 연결이 중단되었습니다','다시 불러오기 또는 가벼운 모드로 열기를 선택해 주세요.');
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','청계천 3D 지도 · 방향키 이동 · 더하기 빼기 확대 축소');
  renderer.domElement.setAttribute('aria-describedby','mapInstructions');renderer.domElement.tabIndex=0;
  window.cheonggyeV32Load?.status('표면 재질과 환경광을 준비하는 중입니다…');
  const visual=await loadVisualAssets(renderer,{basic:query.get('quality')==='light',forceFailure:diagnostic==='asset-error'});scene.environment=visual.environment.texture;
  stage.dataset.visualMode=visual.mode;
  if(visual.mode!=='textured')window.cheonggyeV32Load?.notice(visual.mode==='basic'?'가벼운 모드 · 기본 재질로 표시합니다. 지도 자료는 동일합니다.':'일부 표현 자산을 읽지 못해 기본 재질로 표시합니다. 지도 탐색과 가상 수위는 계속 이용할 수 있습니다.');
  const ctl = new OrbitControls(camera,renderer.domElement);
  ctl.enableDamping=true;ctl.dampingFactor=.09;ctl.minDistance=7;ctl.maxDistance=3800;
  ctl.maxPolarAngle=1.52;ctl.screenSpacePanning=true;
  ctl.listenToKeyEvents(renderer.domElement);
  renderer.domElement.addEventListener('keydown',event=>{
    if(!['+','=','-','_'].includes(event.key))return;event.preventDefault();movingTo=null;
    const offset=camera.position.clone().sub(ctl.target),factor=['+','='].includes(event.key)?.82:1.22;
    offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,ctl.minDistance,ctl.maxDistance));camera.position.copy(ctl.target).add(offset);ctl.update();
  });
  ctl.addEventListener('start',()=>{movingTo=null});
  const hemi = new THREE.HemisphereLight('#edf3f5','#777468',1.25);scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1ce',2.5);
  sun.position.set(-260,540,250);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-650,right:650,top:450,bottom:-450,near:1,far:1500});
  sun.shadow.bias=-.00025;sun.shadow.normalBias=.35;scene.add(sun);scene.add(sun.target);
  const groups={buildings:new THREE.Group(),roads:new THREE.Group(),walks:new THREE.Group(),stairs:new THREE.Group(),bridges:new THREE.Group(),risk:new THREE.Group(),routes:new THREE.Group()};
  Object.values(groups).forEach(g=>scene.add(g));
  const palette=['#b7b6b1','#c5c6c1','#a6b1b4','#a3adb1','#c1b8aa','#b9bdb7','#98a5ab'];
  const standard=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.85,...extra});
  const materials={grass:standard('#a3b39c'),base:standard('#758780'),road:standard('#626e70'),sidewalk:standard('#bcbcac'),walk:standard('#c6c3ad'),stone:standard('#9a9a83'),rail:standard('#87938c',{metalness:.5,roughness:.4}),bridge:standard('#bcb8a8'),cyan:standard('#36e5d4',{emissive:'#138575',emissiveIntensity:.4}),risk:[standard('#44bc8c',{transparent:true,opacity:.8}),standard('#f2bf50',{transparent:true,opacity:.8}),standard('#ec7057',{transparent:true,opacity:.8})]};
  materials.base.color.set('#737971');materials.rail.color.set('#737b7c');
  materials.risk=[riskMaterial('#237a59',0),riskMaterial('#b87913',1),riskMaterial('#bc493b',2)];
  materials.risk.forEach((m,i)=>m.userData.riskColor=['237a59','b87913','bc493b'][i]);
  const art=createArtMaterials(renderer);materials.grass=art.urban;materials.road=art.road;materials.sidewalk=art.urban;
  materials.walk=visual.floor;materials.stone=visual.wall;
  visual.floor.color.set('#bcb7ac');visual.wall.color.set('#b9b8af');
  const graphics=legacyGraphics?null:createGraphics({data,scene,renderer,visual,materials,art});
  const surfaceStyle=graphics&&!surfaceLegacy?createBankSurfaces({data,waterUniform:graphics.waterUniform}):null;
  const photoWater=graphics&&!surfaceLegacy?createPhotoWater({data,waterUniform:graphics.waterUniform,baseWater:graphics.water}):null;
  if(photoWater){visual.water=photoWater.material;visual.tick=(now,night)=>photoWater.tick(now/1000,night);}
  const surfaceMemory={extraBytes:(surfaceStyle?.memoryBytes||0)+(photoWater?.memoryBytes||0),budgetBytes:4194304,baselineConservativeBytes:graphics?.diagnostics.newMapGpuBytesIncludingMipmaps||0};
  surfaceMemory.conservativeTotalBytes=surfaceMemory.extraBytes+surfaceMemory.baselineConservativeBytes;
  if(surfaceMemory.conservativeTotalBytes>surfaceMemory.budgetBytes)throw Error('수변 표현 텍스처 예산을 초과했습니다.');

  if(legacyGraphics)window.cheonggyeV32Load?.notice('1.9 표현 비교 · 지도와 고정 시점은 같습니다.');
  const post=createPostProcessing(renderer,scene,camera,sun);
  if(new URLSearchParams(location.search).get('quality')==='light'){post.setQuality(false);$('quality').textContent='품질: 가벼움';$('quality').setAttribute('aria-pressed','false')}
  const lighting=createLightingLab({scene,camera,controls:ctl,renderer,post,sun,hemi,onReset(){evening=false}});
  const bridgeDetails=[];
  function mesh(geometry,material,group=scene){const m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;group.add(m);return m}
  function box(w,h,d,x,y,z,material,group=scene){const m=mesh(new THREE.BoxGeometry(w,h,d),material,group);m.position.set(x,y,z);return m}
  function shape(points){const s=new THREE.Shape();points.forEach((p,i)=>i?s.lineTo(p[0],-p[1]):s.moveTo(p[0],-p[1]));s.closePath();return s}
  function flat(points,y,material,group=scene){const m=mesh(new THREE.ShapeGeometry(shape(points)),material,group);m.rotation.x=-Math.PI/2;m.position.y=y;m.castShadow=false;return m}
  function ribbon(points,width,y,material,group,verticalHeight=0){
    const vertices=[],indices=[],uv=[];let along=0;
    for(let i=0;i<points.length;i++){
      if(i)along+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);uv.push(along/3.4,0,along/3.4,width/3.4);
      const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
      const dx=next[0]-prev[0],dz=next[1]-prev[1],length=Math.hypot(dx,dz)||1;
      const nx=-dz/length*width/2,nz=dx/length*width/2;
      vertices.push(points[i][0]+nx,y,points[i][1]+nz,points[i][0]-nx,y+verticalHeight,points[i][1]-nz);
      if(i){const a=(i-1)*2,b=i*2;indices.push(a,b,a+1,b,b+1,a+1)}
    }
    const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geom.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geom.setIndex(indices);geom.computeVertexNormals();
    // Ground decals separated by only centimetres must not shadow each other.
    // They still receive the shadows cast by real-volume buildings and bridges.
    const result=mesh(geom,material,group);result.castShadow=verticalHeight!==0;return result;
  }
  function offsetLine(points,offset){return points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];const d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return[p[0]-(b[1]-a[1])/d*offset,p[1]+(b[0]-a[0])/d*offset]})}
  function samples(points,spacing){const result=[];let total=0,next=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);while(next<=total+len){const t=len?(next-total)/len:0;result.push({point:[THREE.MathUtils.lerp(a[0],b[0],t),THREE.MathUtils.lerp(a[1],b[1],t)],direction:[(b[0]-a[0])/len,(b[1]-a[1])/len],distance:next});next+=spacing}total+=len}return result}
  const ordered=points=>points[0][0]>points.at(-1)[0]?points.slice().reverse():points.slice();
  // An open channel, rather than a continuous ground slab (the V1 occlusion fix).
  const stairOpeningTargets=[];
  const bounds=context.metadata.bounds_xz;
  const ground=shape([[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]]]);
  const north=ordered(data.walks[0].points);
  const south=ordered(data.walks[1].points);
  const channel=[...offsetLine(north,-4),...offsetLine(south,4).reverse()];
  const hole=new THREE.Path();channel.forEach((p,i)=>i?hole.lineTo(p[0],-p[1]):hole.moveTo(p[0],-p[1]));hole.closePath();ground.holes.push(hole);
  const groundMesh=mesh(new THREE.ShapeGeometry(ground),materials.grass);groundMesh.rotation.x=-Math.PI/2;groundMesh.position.y=-.1;groundMesh.castShadow=false;stairOpeningTargets.push(groundMesh);
  box(bounds[2]-bounds[0],3,bounds[3]-bounds[1],(bounds[0]+bounds[2])/2,-6.4,(bounds[1]+bounds[3])/2,materials.base);
  flat(data.river_polygon,-5.0,photoWater?.bedMaterial||standard('#536c69'));
  if(data.plaza.length)flat(data.plaza,.035,materials.sidewalk);
  const roadDashMeshes=[],roofDecorationMeshes=[];
  for(const road of data.roads){
    ribbon(road.points,road.width+.9,.02,materials.sidewalk,groups.roads);
    ribbon(road.points,road.width,.07,materials.road,groups.roads);
    if(['primary','secondary'].includes(road.kind))for(const s of samples(road.points,13)){
      const line=box(4,.025,.16,s.point[0],.1,s.point[1],standard('#d4d1b4'),groups.roads);line.rotation.y=-Math.atan2(s.direction[1],s.direction[0]);line.castShadow=false;roadDashMeshes.push(line);
    }
  }
  stairOpeningTargets.push(...groups.roads.children.filter(o=>!roadDashMeshes.includes(o)));
  // Procedural facade texture. It is an illustrative material, not a photograph.
  const textureCanvas=document.createElement('canvas');textureCanvas.width=256;textureCanvas.height=256;
  const ctx=textureCanvas.getContext('2d');ctx.fillStyle='#b2b8b4';ctx.fillRect(0,0,256,256);
  for(let y=0;y<8;y++)for(let x=0;x<6;x++){
    const gradient=ctx.createLinearGradient(0,y*32,0,y*32+25);gradient.addColorStop(0,'#55767b');gradient.addColorStop(.55,'#8da7aa');gradient.addColorStop(1,'#536c70');
    ctx.fillStyle=gradient;ctx.fillRect(x*42+6,y*32+4,30,23);ctx.fillStyle='#aab6b1';ctx.fillRect(x*42+20,y*32+4,1,23);
    if((x*7+y*11)%19===0){ctx.fillStyle='#e0c78f';ctx.fillRect(x*42+7,y*32+5,28,21)}
  }
  const facade=new THREE.CanvasTexture(textureCanvas);facade.colorSpace=THREE.SRGBColorSpace;facade.wrapS=facade.wrapT=THREE.RepeatWrapping;facade.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const sideMaterials=art.sides;
  const roofMaterials=art.roofs;
  const uvGenerator={
    generateTopUV:(geometry,vertices,a,b,c)=>[a,b,c].map(i=>new THREE.Vector2(vertices[i*3]/15,vertices[i*3+1]/15)),
    generateSideWallUV:(geometry,vertices,a,b,c,d)=>{
      const axis=Math.abs(vertices[a*3]-vertices[b*3])>Math.abs(vertices[a*3+1]-vertices[b*3+1])?0:1;
      return[a,b,c,d].map(i=>new THREE.Vector2(vertices[i*3+axis]/24,vertices[i*3+2]/24));
    }
  };
  const buildingMeshes=[],landmarkModels=[];
  const legacyLandmarks=query.get('landmarks')==='legacy';
  stage.dataset.landmarkMode=legacyLandmarks?'legacy-generic':'source23-specific';
  if(legacyLandmarks)window.cheonggyeV32Load?.notice('일반 표현 비교 모드 · 2.2 화면에서 두 건물만 이전 일반 외벽으로 표시합니다. 동결된 2.1 원본 실행과 구분합니다.');
  for(const b of data.buildings){
    const landmark=legacyLandmarks?null:buildLandmark(b);
    if(landmark){groups.buildings.add(landmark);buildingMeshes.push(landmark);landmarkModels.push(landmark);continue}
    const geom=new THREE.ExtrudeGeometry(shape(b.points),{depth:Math.max(.1,b.height-(b.min_height||0)),bevelEnabled:false,UVGenerator:uvGenerator});
    const idx=b.id%sideMaterials.length;const m=mesh(geom,[roofMaterials[idx],sideMaterials[idx]],groups.buildings);m.rotation.x=-Math.PI/2;m.position.y=.1+(b.min_height||0);m.userData.building=b;buildingMeshes.push(m);
    if(b.height>38){const xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]);const w=Math.max(...xs)-Math.min(...xs),d=Math.max(...zs)-Math.min(...zs);roofDecorationMeshes.push(box(Math.min(w*.45,14),1.5,Math.min(d*.45,10),(Math.min(...xs)+Math.max(...xs))/2,b.height+.9,(Math.min(...zs)+Math.max(...zs))/2,materials.rail,groups.buildings))}
  }
  // V5 adds tagged building parts; height is the top above local ground,
  // so extrusion depth subtracts min_height. Neither value is survey verified.
  for(const b of data.building_parts){
    const outline=shape(b.points);
    for(const ring of b.holes){const hole=new THREE.Path();ring.forEach((p,i)=>i?hole.lineTo(p[0],-p[1]):hole.moveTo(p[0],-p[1]));hole.closePath();outline.holes.push(hole)}
    const geom=new THREE.ExtrudeGeometry(outline,{depth:b.height-b.min_height,bevelEnabled:false,UVGenerator:uvGenerator});
    const idx=b.id%sideMaterials.length;
    let side=sideMaterials[idx],roof=roofMaterials[idx];
    if(b.tags.window==='no')side=standard('#9da9ab',{metalness:.5,roughness:.55});
    if(/^#[0-9a-f]{6}$/i.test(b.tags['building:colour']||''))side=standard(b.tags['building:colour']);
    const object=mesh(geom,[roof,side],groups.buildings);object.rotation.x=-Math.PI/2;object.position.y=.1+b.min_height;object.userData.building=b;buildingMeshes.push(object);
  }
  // Actual mapped river polygon; water elevation and ripple are artistic assumptions.
  const waterMaterial=visual.water;
  const water=flat(data.river_polygon,-4.2,waterMaterial);water.castShadow=false;
  const waterEdge=createWaterEdge(data.river_polygon,scene);waterEdge.position.y=-4.17;
  const district=buildContext({context:context,scene,shape,mesh,ribbon,materials,groups,core:data});
  for(const id of ['showBuildings','showHeightBasis','hideAssumedHeight','showContext'])$(id).addEventListener('change',()=>{district.updateVisibility();post.invalidateShadow()});
  let targetWater=-4.2,depth=.8;
  function updateDepth(value,scenario=null){
    depth=THREE.MathUtils.clamp(Number(value),.8,2.6);targetWater=-5+depth;
    $('waterDepth').value=String(depth);$('depthReadout').innerHTML=`${depth.toFixed(2)}<small>m</small>`;
    $('waterChip').textContent=`가상 수심 ${depth.toFixed(2)}m`;
    const sy=116-depth*19;
    $('sectionWaterFill').setAttribute('d',depth<=2?`M73 ${sy}H187V115H73Z`:`M36 ${sy}H224V77H188V115H73V77H36Z`);$('sectionWaterLine').setAttribute('d',depth<=2?`M73 ${sy}H187`:`M36 ${sy}H224`);
    $('sectionDepth').textContent=`${depth.toFixed(2)}m`;$('sectionDepth').setAttribute('y',String(sy-7));
    $('scenarioTitle').textContent=scenario===null?'사용자 설정':labels[scenario][0];
    $('scenarioDetail').textContent=`가정 하상 기준 ${depth.toFixed(2)}m · 실제 관측값 아님`;
    stage.dataset.targetWaterY=String(targetWater);
    if(shell.reducedMotion)water.position.y=targetWater;
  }
  $('waterDepth').addEventListener('input',e=>{updateDepth(e.target.value);curr=depth<1.3?0:depth<2.2?1:2;applyRisk(curr);rebuildRoutes(curr);stage.dataset.scenario=String(curr);document.querySelectorAll('.scenario').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false')})});
  $('showWaterEdge').addEventListener('change',e=>waterEdge.visible=e.target.checked);
  const riskSegments=[];
  for(const walk of data.walks){
    const points=ordered(walk.points);
    ribbon(points,walk.width,-3.0,surfaceStyle?.pavingMaterial||materials.walk,groups.walks);
    const outer=offsetLine(points,walk.side==='north'?-3.3:3.3);
    const wallPoints=[];for(let i=0;i<outer.length;i++){wallPoints.push([outer[i][0],outer[i][1]])}
    // Retaining wall is a vertical strip with an assumed 3m depth.
    const v=[],ix=[],uv=[];let along=0;for(let i=0;i<wallPoints.length;i++){const p=wallPoints[i];if(i)along+=Math.hypot(p[0]-wallPoints[i-1][0],p[1]-wallPoints[i-1][1]);uv.push(along/2,0,along/2,1.5);v.push(p[0],-3.0,p[1],p[0],0,p[1]);if(i){let a=(i-1)*2,b=i*2;ix.push(a,a+1,b,a+1,b+1,b)}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();const stone=surfaceStyle?.wallMaterial||(legacyGraphics?materials.stone.clone():materials.stone);stone.side=THREE.DoubleSide;stairOpeningTargets.push(mesh(g,stone,groups.walks));
    stairOpeningTargets.push(ribbon(outer,.8,.11,materials.stone,groups.walks));
    for(const s of samples(outer,12)){stairOpeningTargets.push(box(.12,1,.12,s.point[0],.6,s.point[1],materials.rail,groups.walks))}
    const strip=ribbon(outer,.075,1.04,materials.rail,groups.walks);strip.castShadow=false;stairOpeningTargets.push(strip);
    for(const s of samples(points,16)){
      const side=walk.side==='north'?-1:1;const seg=box(12,.045,.28,s.point[0]-s.direction[1]*2*side,-2.96,s.point[1]+s.direction[0]*2*side,materials.risk[0],groups.risk);seg.rotation.y=-Math.atan2(s.direction[1],s.direction[0]);riskSegments.push(seg);
    }
    // Fine transverse paving joints, represented at a modest draw count.
    if(!surfaceStyle)for(const s of samples(points,6)){const line=box(.05,.012,walk.width,s.point[0],-2.99,s.point[1],materials.stone,groups.walks);line.rotation.y=-Math.atan2(s.direction[1],s.direction[0])}
  }
  const surfaceBands=surfaceStyle?buildPavingBands({data,groups,material:surfaceStyle.borderMaterial}):{mode:'legacy-source27',addedMeshes:0};
  const fieldDetails=(photoLegacy?buildLegacyField:buildFieldDetails)({data,groups,visual,waterUniform:graphics?.waterUniform});
  const exitFixtures=photoLegacy?{mode:'legacy-source26',newGeometry:false}:buildExitFixtures({data,groups,visual,waterUniform:graphics?.waterUniform});
  for(const obstacle of stairOpeningTargets)obstacle.userData.fieldOpeningCandidate=true;
  const detailStats=addMappedDetails({context:detailContext,data,scene,groups,box,mesh,standard,samples});
  $('showLandscape').addEventListener('change',e=>{groups.landscape.visible=e.target.checked;renderer.shadowMap.needsUpdate=true});
  const markerLabels=[];
  for(const bridge of data.bridges){
    const center=bridge.center;
    bridgeDetails.push(legacyGraphics?buildEvidenceBridge(bridge,groups.bridges,visual,buildReferenceBridge,{legacyComparison:legacyBridgeComparison}):buildFieldBridge(bridge,groups.bridges,visual,buildReferenceBridge,{waterUniform:graphics.waterUniform}));
    const div=document.createElement('span');div.className='map-label';div.textContent=bridge.name;$('mapLabels').append(div);markerLabels.push({element:div,position:new THREE.Vector3(center[0],5,center[1])});
  }
  // Historical manual-water lab is isolated from the new flood-conditioned graph.
  function rebuildRoutes(){}
  function applyRisk(){}
  function update(s){
    curr=s;document.querySelectorAll('.scenario').forEach(e=>{const active=+e.dataset.s===s;e.classList.toggle('active',active);e.setAttribute('aria-pressed',String(active))});
    updateDepth([.8,1.8,2.6][s],s);
    applyRisk(s);
    rebuildRoutes(s);
    stage.dataset.scenario=String(s);stage.dataset.waterY=String(water.position.y);
  }
  document.querySelectorAll('.scenario').forEach(b=>b.addEventListener('click',()=>update(+b.dataset.s)));
  for(const [id,key] of [['showRisk','risk'],['showRoute','routes'],['showBuildings','buildings']]){groups[key].visible=$(id).checked;$(id).addEventListener('change',e=>{groups[key].visible=e.target.checked;renderer.shadowMap.needsUpdate=true;if(id==='showRoute')rebuildRoutes(curr)})};
  $('showLabels').addEventListener('change',e=>{$('mapLabels').hidden=!e.target.checked});
  // A camera preset on the modeled line; no claim of surveyed terrain or collision following.
  const walkPreset=(()=>{
    const sourceWalk=data.walks?.[0],rawPoints=sourceWalk?.points;
    if(!Array.isArray(rawPoints)||rawPoints.length<2||rawPoints.some(point=>!Array.isArray(point)||point.length<2||!point.slice(0,2).every(Number.isFinite)))return {available:false,reason:'보행 시점을 정할 산책로 좌표가 부족하거나 유효하지 않습니다.'};
    const points=ordered(rawPoints);
    const segments=[];let total=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      if(![...a,...b].every(Number.isFinite))return {available:false,reason:'산책로 좌표가 유효하지 않습니다.'};
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-6)continue;
      segments.push({a,b,length,start:total,end:total+length});total+=length;
    }
    if(total<25||!segments.length)return {available:false,reason:'보행 시점을 정할 산책로 선이 부족합니다.'};
    function at(distance){
      const segment=segments.find(s=>distance<s.end)||segments.at(-1),ratio=THREE.MathUtils.clamp((distance-segment.start)/segment.length,0,1);
      return {point:[THREE.MathUtils.lerp(segment.a[0],segment.b[0],ratio),THREE.MathUtils.lerp(segment.a[1],segment.b[1],ratio)],segment,
        tangent:[(segment.b[0]-segment.a[0])/segment.length,(segment.b[1]-segment.a[1])/segment.length]};
    }
    const startDistance=total*.45,start=at(startDistance);
    let lookahead=Math.min(18,total-startDistance),target=at(startDistance+lookahead);
    function headingDot(sample){const dx=sample.point[0]-start.point[0],dz=sample.point[1]-start.point[1],length=Math.hypot(dx,dz);return length>1e-6?(dx*start.tangent[0]+dz*start.tangent[1])/length:-1}
    if(headingDot(target)<.35){lookahead=Math.min(10,total-startDistance);target=at(startDistance+lookahead)}
    let sharpTurnFallback=false;
    if(headingDot(target)<.35){sharpTurnFallback=true;lookahead=Math.min(10,(start.segment.end-startDistance)*.8);target=at(startDistance+lookahead)}
    if(lookahead<.25||headingDot(target)<.35)return {available:false,reason:'급한 굴곡 때문에 보행 시선 방향을 안정적으로 정하지 못했습니다.'};
    return {available:true,sourceWalkIndex:0,sourceWalkId:sourceWalk.id??null,sourceWalkSide:sourceWalk.side??null,source:'scene_precision_v5.json / walks[0].points',
      modeledLineLengthM:total,startDistanceM:startDistance,startFraction:.45,cameraStartXZ:start.point,targetXZ:target.point,
      lookaheadAlongLineM:lookahead,sharpTurnFallback,cameraStartOnModeledCenterline:true,presetCameraY:-1.25,assumedWalkwayY:-3,collisionDetection:false};
  })();
  const graphicPresets=makeGraphicPresets(data);
  function graphicPresetCamera(name){
    const preset=graphicPresets[name],position=new THREE.Vector3(...preset.position),target=new THREE.Vector3(...preset.target);
    if(name.startsWith('surface-'))return {position,target}; // Keep corridor eye point: aspect scaling can back into a bridge or wall.
    if(preset.field){const scale=Math.max(1,.9/(stage.clientWidth/stage.clientHeight));position.sub(target).multiplyScalar(scale).add(target);return {position,target}}
    if(!preset.landmark||!name.endsWith('building'))return {position,target};
    const source=data.buildings.find(b=>landmarkContracts[b.id]?.key===preset.landmark),xs=source.points.map(p=>p[0]),zs=source.points.map(p=>p[1]);
    const bounds=new THREE.Box3(new THREE.Vector3(Math.min(...xs),.1,Math.min(...zs)),new THREE.Vector3(Math.max(...xs),source.height+.1,Math.max(...zs)));
    const center=bounds.getCenter(new THREE.Vector3()),direction=position.clone().sub(target).normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize();
    const width=stage.clientWidth,height=stage.clientHeight,margins={top:135,bottom:195,left:28,right:28},tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    let extentX=0,extentY=0,extentDepth=0;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const v=new THREE.Vector3(x,y,z).sub(center);extentX=Math.max(extentX,Math.abs(v.dot(right)));extentY=Math.max(extentY,Math.abs(v.dot(up)));extentDepth=Math.max(extentDepth,Math.abs(v.dot(direction)))}
    const usableX=Math.max(.2,1-(margins.left+margins.right)/width),usableY=Math.max(.18,1-(margins.top+margins.bottom)/height),distance=(Math.max(extentX/(tan*(width/height)*usableX),extentY/(tan*usableY))+extentDepth)*1.12;
    target.copy(center).addScaledVector(up,-distance*tan*(margins.bottom-margins.top)/height);position.copy(target).addScaledVector(direction,distance);
    stage.dataset.landmarkCameraFit=JSON.stringify({name,viewport:[width,height],margins,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},distance,position:position.toArray(),target:target.toArray(),basis:'model-bounds-and-UI-padding-only'});
    return {position,target};
  }
  function setView(name,target,positionOverride=null){
    stage.classList.toggle('field-detail-mode',!!graphicPresets[name]?.field);
    stage.classList.toggle('route-fit-mode',name==='evacRoute');
    if(currentView==='stoneDetail'&&name!=='stoneDetail')$('mapModeLabel').textContent={hazard:'문헌 위험 기준 계산 · 청계천 적용 미검증',flood:'강우 변화와 이동시간 · 근사 시제품',explore:'도시 맥락 · 가정 지형',water:'가상 수위 비교 · 실측 침수 아님',evidence:'자료 근거 · 현장 검증 전',rain:'과거 강우 관측 · 침수위험 산정 보류'}[shell.panel]||'도시 맥락 · 가정 지형';
    if(name==='walk'&&!walkPreset.available){window.cheonggyeV32Load?.notice(walkPreset.reason+' 현재 시점을 유지합니다.');return}
    // Walk is an illustrative camera preset, not terrain-following navigation.
    currentView=name;ctl.maxPolarAngle=['field-gwang-under','field-warning7'].includes(name)?Math.PI-.1:name==='walk'?Math.PI/2:1.52;
    $('walkNotice').hidden=name!=='walk';$('bridgeCameraNotice').hidden=name!=='bridgeChannel';stage.dataset.cameraMode=name;
    stage.dataset.maxPolarAngle=String(ctl.maxPolarAngle);
    let t=target||new THREE.Vector3(15,-1,20),p;
    if(graphicPresets[name]){const fitted=graphicPresetCamera(name);p=fitted.position;t=fitted.target}
    else if(name==='bridgeClose'){p=new THREE.Vector3(t.x-44,-.8,t.z+3);t=new THREE.Vector3(t.x,-3.2,t.z)}
    else if(name==='stoneDetail'){p=new THREE.Vector3(...gwangtongCamera.position);t=new THREE.Vector3(...gwangtongCamera.target)}
    else if(name==='detail'){p=new THREE.Vector3(-200,8,5);t=new THREE.Vector3(-137,-1.5,-23)}
    else if(name==='compare'){p=new THREE.Vector3(-241.947,145,147.091);t=new THREE.Vector3(-146.947,0,-22.909)}
    else if(name==='walk'){p=new THREE.Vector3(walkPreset.cameraStartXZ[0],-1.25,walkPreset.cameraStartXZ[1]);t=new THREE.Vector3(walkPreset.targetXZ[0],-1.25,walkPreset.targetXZ[1]);stage.dataset.walkCameraStartOnModeledCenterline='true';stage.dataset.walkStartXZ=JSON.stringify(walkPreset.cameraStartXZ);stage.dataset.walkTargetXZ=JSON.stringify(walkPreset.targetXZ);stage.dataset.walkStartDistanceM=String(walkPreset.startDistanceM)}
    else if(name==='district'){const k=Math.max(1,1.25/camera.aspect);t=new THREE.Vector3(45,0,0);p=new THREE.Vector3(155*k,1510*k,720*k)}
    else if(name==='evac')p=new THREE.Vector3(t.x,t.y+310,t.z+1);
    else if(name==='evacRoute')p=positionOverride;
    else if(name==='bridgeChannel')p=positionOverride;
    else if(name==='top')p=new THREE.Vector3(t.x,t.y+1060,t.z+1);
    else if(target)p=new THREE.Vector3(t.x-95,145,t.z+170);
    // A lower, diagonal overview reveals bridge/river-wall depth without changing the map geometry.
    else {const scale=Math.max(1,1.15/camera.aspect);p=new THREE.Vector3(-420*scale,650*scale,1000*scale)}
    post.shadow(t,name==='overview'||name==='top');
    if(shell.reducedMotion){camera.position.copy(p);ctl.target.copy(t);ctl.update();movingTo=null}else movingTo={position:p,target:t};
    document.querySelectorAll('.view-buttons button').forEach(b=>b.classList.toggle('active',b.id===({walk:'viewWalk',top:'viewTop',overview:'viewOverview',detail:'viewDetail',compare:'viewCompare',stoneDetail:'viewStoneDetail'}[name])));
  }
  $('viewDistrict').addEventListener('click',()=>setView('district'));
  $('viewDetail').addEventListener('click',()=>setView('detail'));
  function showStoneDetail(){
    placeSelection?.clear({source:'stone-detail'});shell.activatePanel('explore');setView('stoneDetail');
    $('mapModeLabel').textContent='광통교 석재 · 사진 참고 형상 / 부재 치수·표고 추정';
    if(stage.clientWidth<760)shell.showMap();
  }
  $('viewStoneDetail').addEventListener('click',showStoneDetail);
  $('viewCompare').addEventListener('click',()=>setView('compare'));
  $('quality').addEventListener('click',()=>{post.setQuality(!post.high);$('quality').textContent=post.high?'품질: 높음':'품질: 가벼움';$('quality').setAttribute('aria-pressed',String(post.high));resize()});
  $('viewOverview').addEventListener('click',()=>setView('overview'));
  $('viewTop').addEventListener('click',()=>setView('top'));
  $('viewWalk').addEventListener('click',()=>setView('walk'));
  $('comparePlaza').addEventListener('click',()=>setView('focus',new THREE.Vector3(-420,0,-45)));
  $('compareGwangtong').addEventListener('click',()=>selectBridgeByName('광통교','comparison'));
  $('compareSamil').addEventListener('click',()=>selectBridgeByName('삼일교','comparison'));
  let placeSelection=null,localSearch=null;
  const landmarks=[{name:'청계광장',center:[-420,-45]},...data.bridges];
  landmarks.forEach((landmark,i)=>{const button=document.createElement('button');button.textContent=landmark.name;button.dataset.placeKey=i?'bridge:'+landmark.osm_way:'plaza:cheonggye';button.addEventListener('click',()=>placeSelection?.select(button.dataset.placeKey,{source:'landmark'}));$('landmarks').append(button)});
  $('lighting').addEventListener('click',()=>{
    evening=!evening;$('lighting').setAttribute('aria-pressed',String(evening));$('lighting').textContent=evening?'낮으로':'해질녘';
    lighting.setEvening(evening);
  });
  $('buildingCount').textContent=meta.counts.buildings;$('stairsCount').textContent=meta.counts.stairs;
  $('sceneStatus').textContent=`교량 ${meta.counts.bridges} · 양안 산책로 · 지도 좌표 반영`;
  const basis=meta.building_height_basis;
  const info=[['평면 위치','OpenStreetMap 공개 지도 좌표. 현장 측량과 대조 전.'],['건물 높이',`높이 태그 ${basis.osm_height_tag}개 / 층수 환산 ${basis['levels_times_3.2_assumed']}개 / 12m 임의 높이 ${basis.default_12m_assumed}개. 높이 태그도 미검증.`],['지형·수면·계단','모든 표고와 계단 단차는 시연용 가정. 현장 표고 미확보.'],['교량','평면 위치는 지도자료, 폭과 구간거리는 서울시설공단 안내자료. 5개 교량 모두 공식 제원과 사진을 재대조. 모전교 아치·광통교 석조·광교 주황 거더·장통교 지지/난간·삼일교 금속 곡면 난간을 참고. 부재 치수/표고·단면은 가정이며 완전한 복원 아님.'],['2.0 자체 표현','수면은 세계좌표 다중 잔물결과 환경 반사이며 실제 장면 반사·측정 유속이 아닙니다. 석재·포장은 자체 제작 줄눈/거칠기/범프이며 돌·풀·습윤 띠의 위치와 높이는 추정입니다. 보행 대피망 자료에 추가하지 않습니다.'],['외관·재질','2.2 삼일·SK서린 두 동은 공식 설계 설명을 참고한 별도 절차 형상입니다. 나머지 건물 창문·지붕은 7종 일반 반복 표현이며 실제 정면 사진과 다름. 포장·석축과 환경광은 Poly Haven CC0 일반 소재이며 실제 청계천 촬영 자료가 아님.'],['거리 차이',`공식 도면 합계 898m / 현재 OSM 중심선 추출 ${meta.osm_centerline_length_m}m. 차이의 원인은 아직 확인 전. 양 자료의 시·종점과 거리 정의를 대조해야 하며 강제 축척 보정하지 않음.`],['추가 시각 요소',`지도 수목 ${detailStats.mappedTrees}개와 수목열 ${detailStats.mappedTreeRows}개(7m 간격 보간), 벤치 ${detailStats.mappedBenches}개를 반영. 수관·높이·벤치 방향은 절차적 추정이며 수목의 실제 개수·수종·표고를 보증하지 않음. 횡단보도 위치는 지도 노드이며 폭·방향은 도로에서 추정.`],['자체평가','AI가 감사 관점(출처·재현성)과 교수 관점(공학적 타당성)으로 검토. 독립 감사나 교수의 실제 점수가 아님. 실측 표고·수리모형·현장검증 부재가 주요 미완성 항목.'],['V5 자료 보강',`건물 부속체 ${data.building_parts.length}개 추가(높이 태그9/층수환산2/기본12m1). 공식 경사로 안내점2·엘리베이터 안내점1·화장실 안내점15를 추출. 좌표 정확도·운영 상태는 미검증. 5개 교량 공식 폭·연장/범위와 사진을 재대조했으며 표고·세부 치수는 여전히 가정.`],['아직 필요한 자료','종·횡단 측량, 계단·출구 표고/폭, 하상, 건물 정면 사진과 이용허락, 최신 통행 상태.'],['지도 이용조건','© OpenStreetMap contributors, ODbL 1.0. 가공 공간 DB도 ODbL 1.0으로 제공.']];
  info.unshift(['2.2 대표 건물','삼일355906424·SK서린141957173만 전용 입면/저층/옥탑으로 교체했습니다. 원래 OSM 평면·111/160m를 유지합니다. 삼일31층은 정림과 일치하나 SK 공식36층/OSM35층은 불일치입니다. 모듈·상세 치수·색도·현재 상태는 미검증이며 사진 픽셀은 사용하지 않았습니다. 두 동을 건물 전수 완료로 보지 않습니다.'],['V7 비교·강우','S-Map 2025 3D건물/배경지도·고화질을 실제 열어 비교했다. 현재 시제품의 현실 재현 우위는 입증되지 않았다. 과거 서울시 2026년8월 종로구청·중구청 10분우량을 표시하며 실제 침수 위험도는 자료 부족으로 산정 보류한다. 강우 자료는 공공누리2유형(비상업)이다.'],['V7 색상·그림자','명암/노출/표현광원 방향과 그림자 켜기·끄기, 확대/이동에 따라 갱신하는 그림자 영역을 추가. 실제 천문 일조·현장 재질 색도 검증은 아니다.'],['V6 확장 범위',`${context.metadata.width_m} × ${context.metadata.depth_m}m, 이전 대상 사각 범위의 ${context.metadata.bbox_area_ratio}배. 추가 건물 ${context.buildings.length}개는 원본 OSM 평면이며 단순 외곽 형상으로 표현. 모든 지형 Y=0은 가정이며 DEM·등고선·침투·침수 분석 결과가 아님.`],['V6 색상과 움직임','석재·물은 기존 공식 참고사진을 보고 회색·올리브 계열로 조정. 현장 색도 측정이 아님. 위험도는 색과 패턴을 병기. 사용자/OS 움직임 줄이기 설정에서 카메라·수위 전환 및 수면 이동을 멈춤.']);
  const dl=document.createElement('dl');for(const [label,value] of info){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd)}$('sourceSummary').append(dl);

  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let hovered=null;
  let pointerTime=0;
  const showBuildingRecord=hit=>{hovered=hit.id;const strong=document.createElement('strong'),p=document.createElement('p'),label=document.createElement('span');label.className='eyebrow';label.textContent='선택한 건물';strong.textContent=hit.name||`지도 건물 #${hit.id}`;p.textContent=`${hit.height.toFixed(1)}m · ${hit.height_basis==='osm_height_tag'?'OSM 높이 태그 (현장 미확인)':hit.height_basis==='levels_times_3.2_assumed'?'층수 × 3.2m 추정':'높이 미확보 · 12m 임의 표현'}`;$('selection').replaceChildren(label,strong,p);const landmark=landmarkContracts[hit.id];if(landmark){const detail=document.createElement('p'),limit=document.createElement('p'),link=document.createElement('a');detail.textContent=landmark.features+' · '+landmark.officialFloors;limit.textContent=landmark.limit;link.href=landmark.url;link.target='_blank';link.rel='noreferrer';link.textContent=landmark.source+' ↗';$('selection').append(detail,limit,link)}};
  const inspectBuilding=event=>{
    if(event.type==='pointermove'&&performance.now()-pointerTime<80)return;pointerTime=performance.now();
    if(event.buttons||!groups.buildings.visible)return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(buildingMeshes.filter(o=>o.visible),true)[0]?.object.userData.building;
    if(hit&&hit.id!==hovered)showBuildingRecord(hit);
  };
  renderer.domElement.addEventListener('pointermove',inspectBuilding);
  renderer.domElement.addEventListener('click',inspectBuilding);
  // Miniature plan view contains only locally cached features, no basemap tiles.
  const svg=$('miniMap'),NS='http://www.w3.org/2000/svg';
  const svgPath=(points,fill,stroke,width)=>{const p=document.createElementNS(NS,'path');p.setAttribute('d',points.map((a,i)=>`${i?'L':'M'}${(a[0]-bounds[0])/(bounds[2]-bounds[0])*260},${(a[1]-bounds[1])/(bounds[3]-bounds[1])*135}`).join(' ') + (fill!=='none'?' Z':''));p.setAttribute('fill',fill);p.setAttribute('stroke',stroke);p.setAttribute('stroke-width',width);svg.append(p)};
  context.buildings.forEach(b=>svgPath(b.points,'#cad3d2','none',0));
  svgPath([...context.metadata.core_corners,context.metadata.core_corners[0]],'none','#a7814d',.6);
  data.buildings.forEach(b=>svgPath(b.points,'#c5cec0','none',0));svgPath(data.river_polygon,'#4f9b8c','none',0);data.walks.forEach(w=>svgPath(w.points,'none','#9eae8b',1.1));
  for(const b of data.bridges){const circle=document.createElementNS(NS,'circle');circle.setAttribute('cx',(b.center[0]-bounds[0])/(bounds[2]-bounds[0])*260);circle.setAttribute('cy',(b.center[1]-bounds[1])/(bounds[3]-bounds[1])*135);circle.setAttribute('r',2.1);circle.setAttribute('fill','#315b4d');svg.append(circle)}
  const precision=createEvidenceUI({data,official,groups,buildingMeshes,setView,scene,renderer,onBridgeSelect:bridge=>selectBridgeByName(bridge.name,'evidence')});
  // Desaturate generic architectural textures in linear working colour space.
  // This is an artistic neutralisation, not a measured site colour calibration.
  const corrected=new Set();
  scene.traverse(object=>{if(!object.isMesh)return;for(const material of (Array.isArray(object.material)?object.material:[object.material])){
    if(!material||material.userData.graphics21||!material.map||corrected.has(material)||![visual.wall.map,visual.floor.map].includes(material.map))continue;
    corrected.add(material);material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat v6Luma=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));\ndiffuseColor.rgb=mix(vec3(v6Luma),diffuseColor.rgb,0.28)*1.15;')};
    material.customProgramCacheKey=()=> 'v7-neutral-architectural-map';material.needsUpdate=true;
  }});
  function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();post.resize(w,h)}
  new ResizeObserver(resize).observe(stage);resize();
  // Batch static surfaces by material and vertex layout. Buildings stay individually
  // selectable; risk segments stay separate because scenarios change their materials.
  for(const group of [groups.roads,groups.walks,groups.stairs,groups.bridges,groups.context]){
    const batches=new Map();
    for(const object of [...group.children]){
      if(!object.isMesh||Array.isArray(object.material)||object.userData.bridgeCameraContextBuildingCount)continue;
      const key=[object.material.uuid,Object.keys(object.geometry.attributes).sort().join(','),!!object.geometry.index,object.castShadow,!!object.userData.fieldOpeningCandidate].join('/');
      if(!batches.has(key))batches.set(key,[]);batches.get(key).push(object);
    }
    for(const objects of batches.values()){
      if(objects.length<2)continue;
      const copies=objects.map(o=>{o.updateMatrix();return o.geometry.clone().applyMatrix4(o.matrix)});
      const merged=mergeGeometries(copies,false);copies.forEach(g=>g.dispose());
      if(!merged)continue;
      const combined=mesh(merged,objects[0].material,group);combined.castShadow=objects[0].castShadow;combined.userData.fieldOpeningCandidate=!!objects[0].userData.fieldOpeningCandidate;
      objects.forEach(o=>{group.remove(o);o.geometry.dispose()});
    }
  }
  // 위의 기존 병합 직후를 V10과 같은 구성의 비교 기준으로 삼는다.
  // 중복 도로 점선과 선택 대상이 아닌 옥상 상자만 추가로 병합한다.
  const batchBaseline=sceneMeshMetrics(scene),selectableBefore=buildingMeshes.length;
  const staticBatches=[
    await batchEquivalentMeshes({objects:roadDashMeshes,group:groups.roads,label:'road-dash-static-batch',shareEquivalentMaterial:true}),
    await batchEquivalentMeshes({objects:roofDecorationMeshes,group:groups.buildings,label:'roof-decoration-static-batch'}),
  ];
  roadDashMeshes.length=0;roofDecorationMeshes.length=0;
  {const openingMeshes=[];scene.traverse(object=>{if(object.isMesh&&object.userData.fieldOpeningCandidate)openingMeshes.push(object)});fieldDetails.openings=(photoLegacy?applyLegacyOpeningMasks:applyStairOpeningMasks)(openingMeshes,data.stairs);}
  const staticBatching={versionOrdinal:31,displayVersion:'발표 마감본',legacyVersionOrdinal:32,legacyDisplayVersion:'발표 마감본',baseline:'new V9 / legacy V10-equivalent scene after existing static batching, before new targeted operations',before:batchBaseline,after:sceneMeshMetrics(scene),selectableBefore,selectableAfter:buildingMeshes.length,batches:staticBatches};
  const batchOutput=document.createElement('output');batchOutput.id='staticBatchDiagnostics';batchOutput.hidden=true;batchOutput.textContent=JSON.stringify(staticBatching);stage.append(batchOutput);
  stage.dataset.staticMeshBefore=String(staticBatching.before.meshCount);stage.dataset.staticMeshAfter=String(staticBatching.after.meshCount);
  stage.dataset.staticMaterialsBefore=String(staticBatching.before.materialCount);stage.dataset.staticMaterialsAfter=String(staticBatching.after.materialCount);
  stage.dataset.staticTrianglesBefore=String(staticBatching.before.triangleCount);stage.dataset.staticTrianglesAfter=String(staticBatching.after.triangleCount);
  stage.dataset.selectableBefore=String(selectableBefore);stage.dataset.selectableAfter=String(buildingMeshes.length);
  stage.dataset.staticBatchGeometryEquivalent=String(staticBatches.every(batch=>batch.applied&&batch.geometryEquivalent));
  stage.dataset.cameraMode='overview';stage.dataset.maxPolarAngle=String(ctl.maxPolarAngle);
  const initialScale=Math.max(1,1.15/camera.aspect);
  camera.position.set(-420*initialScale,650*initialScale,1000*initialScale);ctl.target.set(15,-1,20);post.shadow(ctl.target,true);ctl.update();update(0);
  for(const id of ['showRisk','showRoute']){ $(id).checked=false;$(id).disabled=true }
  groups.risk.visible=false;groups.routes.visible=false;
  shell.activatePanel('flood');
  let routeFitRecord=null,lastRouteBounds=null;
  function fitEvacuationRoute(bounds){
    if(!bounds)return;lastRouteBounds=bounds;stage.classList.add('route-fit-mode');
    const width=stage.clientWidth,height=stage.clientHeight,margin={left:30,right:30,top:width<600?108:86,bottom:185},usableWidth=Math.max(80,width-margin.left-margin.right),usableHeight=Math.max(100,height-margin.top-margin.bottom),spanX=Math.max(12,bounds.max[0]-bounds.min[0]+12),spanZ=Math.max(12,bounds.max[2]-bounds.min[2]+12),tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const altitude=Math.max(50,spanX/(2*tan*camera.aspect*(usableWidth/width)),spanZ/(2*tan*(usableHeight/height)))*1.18+(bounds.max[1]-bounds.min[1]);
    const metersPerPixel=2*altitude*tan/height,screenCenterOffset=(margin.bottom-margin.top)/2;
    const target=new THREE.Vector3((bounds.min[0]+bounds.max[0])/2,bounds.min[1],(bounds.min[2]+bounds.max[2])/2+screenCenterOffset*metersPerPixel),position=new THREE.Vector3(target.x,target.y+altitude,target.z+1);
    routeFitRecord={bounds,viewport:[width,height],margins:margin,usable:[usableWidth,usableHeight],altitudeM:altitude,position:position.toArray(),target:target.toArray(),fovDegrees:camera.fov,scope:'model-path-bounds-and-HUD-padding-not-collision-or-safety-proof'};setView('evacRoute',target,position);
    let out=$('routeFitDiagnostics');if(!out){out=document.createElement('output');out.id='routeFitDiagnostics';out.hidden=true;stage.append(out)}out.textContent=JSON.stringify(routeFitRecord);
  }
  const flood=createFloodUI({data,fixtures:floodFixtures,temporalFixtures,evacuationScope,scene,shell,onFocus(point){setView('evac',new THREE.Vector3(point[0],-2,point[1]))},onFitRoute:fitEvacuationRoute,onReturnToFlood(){updateDepth(.8,0)}});
  function showHazardDemo(high){
    shell.activatePanel('flood');
    const values={evacMode:'rain-time',rainSource:'manual',rainfallIntensity:'75',rainfallDuration:'30',rainFuture:'rising',rainTimeDelay:'0',rainTimeView:'0',evacStart:'north:32',hazardPolicy:'aidr-prototype',hazardVelocityMode:'assumed-constant',hazardVelocityMps:high?'2.5':'0.5',facilityMode:'off',boundaryMode:'legacy'};
    for(const [id,value]of Object.entries(values))$(id).value=value;
    $('rainFreeze').checked=true;
    $('rainSource').dispatchEvent(new Event('change'));
    $('fitEvacRoute').click();
  }
  $('demoHazardLow').addEventListener('click',()=>showHazardDemo(false));
  $('demoHazardHigh').addEventListener('click',()=>showHazardDemo(true));
  if(['hazard-low','hazard-high'].includes(query.get('demo')))queueMicrotask(()=>showHazardDemo(query.get('demo')==='hazard-high'));
  function showFacilityDemo(scenario){
    shell.activatePanel('flood');
    const values={evacMode:'rain-time',rainSource:'manual',rainfallIntensity:'75',rainfallDuration:'30',rainFuture:'steady',rainTimeDelay:'0',rainTimeView:'0',evacStart:'north:32',hazardPolicy:'aidr-prototype',hazardVelocityMode:'assumed-constant',hazardVelocityMps:'0.5',facilityMode:'scenario',facilityScenario:scenario,minModelWidthM:'0',maxModelGradePct:'0',boundaryMode:'legacy'};
    for(const [id,value]of Object.entries(values))$(id).value=value;
    $('requireStepFree').checked=false;$('rainFreeze').checked=true;
    $('rainSource').dispatchEvent(new Event('change'));$('fitEvacRoute').click();
  }
  const facilityDemos={'facility-open':'all-open','facility-egress':'gate5-egress-90','facility-ingress':'gate5-ingress-90'};
  for(const [id,scenario]of [['demoFacilityOpen','all-open'],['demoFacilityEgress','gate5-egress-90'],['demoFacilityIngress','gate5-ingress-90']])$(id).addEventListener('click',()=>showFacilityDemo(scenario));
  if(facilityDemos[query.get('demo')])queueMicrotask(()=>showFacilityDemo(facilityDemos[query.get('demo')]));
  function showAreaDemo(high){
    shell.activatePanel('flood');
    const values={evacMode:'rain-time',rainSource:'manual',rainfallIntensity:high?'150':'75',rainfallDuration:'30',rainFuture:'rising',rainTimeDelay:'0',rainTimeView:'0',evacStart:'north:32',hazardPolicy:'aidr-prototype',hazardVelocityMode:'assumed-constant',hazardVelocityMps:'0.5',facilityMode:'scenario',facilityScenario:'all-open',minModelWidthM:'0',maxModelGradePct:'0',boundaryMode:'legacy',areaResolution:'2',areaExtent:'all',areaProbeChoice:'start'};
    for(const [id,value]of Object.entries(values))$(id).value=value;
    $('requireStepFree').checked=false;$('rainFreeze').checked=false;$('showInundationArea').checked=true;
    $('rainSource').dispatchEvent(new Event('change'));setView('overview');shell.showMap();
  }
  $('demoAreaRising').addEventListener('click',()=>showAreaDemo(false));$('demoAreaHigh').addEventListener('click',()=>showAreaDemo(true));
  if(['area-rising','area-high'].includes(query.get('demo')))queueMicrotask(()=>showAreaDemo(query.get('demo')==='area-high'));
  function showBoundaryDemo(restricted){
    shell.activatePanel('flood');
    const values={evacMode:'rain-time',rainSource:'manual',rainfallIntensity:'75',rainfallDuration:'30',rainFuture:'steady',rainTimeDelay:'0',rainTimeView:'0',evacStart:'north:32',hazardPolicy:'aidr-prototype',hazardVelocityMode:'assumed-constant',hazardVelocityMps:'0.5',facilityMode:'scenario',facilityScenario:'all-open',minModelWidthM:'0',maxModelGradePct:'0',areaResolution:'2',areaExtent:'all',areaProbeChoice:'start',boundaryMode:restricted?'scenario':'legacy',boundaryAreaHa:'50',boundaryRunoff:'0.65',boundaryUpstream:restricted?'1':'0',boundaryLateral:restricted?'0.5':'0',boundaryDrainagePct:restricted?'50':'100',boundaryInitialStorage:'0'};
    for(const [id,value]of Object.entries(values))$(id).value=value;
    $('requireStepFree').checked=false;$('rainFreeze').checked=false;$('showInundationArea').checked=true;
    $('rainSource').dispatchEvent(new Event('change'));setView('top');shell.showMap();
  }
  $('demoBoundaryBaseline').addEventListener('click',()=>showBoundaryDemo(false));$('demoBoundaryRestricted').addEventListener('click',()=>showBoundaryDemo(true));
  if(['boundary-base','boundary-restricted'].includes(query.get('demo')))queueMicrotask(()=>showBoundaryDemo(query.get('demo')==='boundary-restricted'));
  async function showHistoryDemo(cursor){
    shell.activatePanel('flood');
    const values={evacMode:'rain-time',rainFuture:'steady',rainTimeDelay:'0',rainTimeView:'0',evacStart:'north:32',hazardPolicy:'aidr-prototype',hazardVelocityMode:'assumed-constant',hazardVelocityMps:'0.5',facilityMode:'scenario',facilityScenario:'all-open',minModelWidthM:'0',maxModelGradePct:'0',areaResolution:'2',areaExtent:'all',areaProbeChoice:'start',boundaryMode:'legacy'};
    for(const [id,value]of Object.entries(values))$(id).value=value;
    $('requireStepFree').checked=false;$('rainFreeze').checked=false;$('showInundationArea').checked=true;
    setView('top');shell.showMap();
    try{await flood.setHistoricalReplay({episodeId:'seoul-1001-202608-peak',cursor})}catch(error){$('runtimeNotice').textContent='과거 강우 재생을 준비하지 못했습니다. 자료 선택을 다시 확인해 주세요.';$('runtimeNotice').hidden=false}
  }
  $('demoHistoryPeak').addEventListener('click',()=>showHistoryDemo(10));$('demoHistoryRecession').addEventListener('click',()=>showHistoryDemo(18));
  if(['history-peak','history-recession'].includes(query.get('demo')))queueMicrotask(()=>showHistoryDemo(query.get('demo')==='history-peak'?10:18));





  let routeFitResizeTimer;new ResizeObserver(()=>{clearTimeout(routeFitResizeTimer);routeFitResizeTimer=setTimeout(()=>{if(currentView==='evacRoute'&&lastRouteBounds&&shell.panel==='flood'&&flood.state.routeStatus==='route')fitEvacuationRoute(lastRouteBounds)},100)}).observe(stage);
  const placeRecords=buildLocalNameIndex(data);
  const selectedBuildingHidden=record=>record.kind==='building'&&(!groups.buildings.visible||!buildingMeshes.find(object=>object.userData.building?.id===record.building.id)?.visible);
  function openRecordDetails(record){
    if(record.kind==='building')showBuildingRecord(record.building);
    else if(record.kind==='bridge')precision.showBridge(record.bridge.name);
    else precision.showPlaza();
  }
  function selectBridgeByName(name,source){
    const bridge=data.bridges.find(bridge=>bridge.name===name);
    if(bridge)placeSelection?.select('bridge:'+bridge.osm_way,{source});
  }
  function navigateRecord(record){
    openRecordDetails(record);
    if(record.kind==='building'){
      const b=record.building,xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]),landmark=landmarkContracts[b.id];
      if(landmark){setView(landmark.key==='samil'?'samil-building':'sk-building');$('mapModeLabel').textContent=landmark.features+' · 문헌 참고 / 세부치수 추정'}
      else setView('focus',new THREE.Vector3((Math.min(...xs)+Math.max(...xs))/2,.1+((b.min_height||0)+b.height)/2,(Math.min(...zs)+Math.max(...zs))/2));
    }else if(record.kind==='bridge'){
      const candidates=bridgeCameraCandidates(data.centerline,record.bridge),checks=[];scene.updateMatrixWorld(true);
      const coreBlockers=groups.buildings.visible?buildingMeshes.filter(object=>object.visible):[];
      const contextBlockers=groups.context.visible?district.buildingOccluders.filter(object=>object.visible):[];
      const blockers=[...coreBlockers,...contextBlockers];
      for(const candidate of candidates){
        const origin=new THREE.Vector3(...candidate.position),target=new THREE.Vector3(...candidate.target),distance=origin.distanceTo(target);
        const ray=new THREE.Raycaster(origin,target.clone().sub(origin).normalize(),0,Math.max(0,distance-.5));
        const hit=ray.intersectObjects(blockers,true)[0];
        checks.push({...candidate,centerRayBlocked:!!hit,firstBlockingBuildingId:hit?.object.userData.building?.id??null,
          firstBlockingKind:hit?(hit.object.userData.building?'core-building-or-part':'context-building-batch'):null,
          firstBlockingDistanceM:hit?.distance??null});
      }
      const chosen=checks.find(candidate=>!candidate.centerRayBlocked)||checks[0];
      bridgeCameraBasis={bridge:record.name,osmWay:record.bridge.osm_way,candidates:checks,chosen:chosen??null,
        selectionReason:!chosen?'legacy-focus-no-valid-candidate':chosen.centerRayBlocked?'first-candidate-all-center-rays-blocked':'first-unblocked-center-ray',
        checkedCoreBuildingCount:coreBlockers.length,checkedContextBatchCount:contextBlockers.length,
        checkedContextBuildingCount:contextBlockers.reduce((sum,object)=>sum+object.userData.bridgeCameraContextBuildingCount,0),
        checkedAtSelectionOnly:true,currentBuildingLayerVisible:groups.buildings.visible,
        currentContextLayerVisible:groups.context.visible,heightFilter:$('hideAssumedHeight').checked,heightEvidence:$('showHeightBasis').checked,
        scope:'선택 순간 표시된 핵심 건물 본체/부속체와 확장 건물 묶음에 대한 카메라→교량중심(Y=0) 단일 ray, 목표 직전 0.5m 제외.',
        excluded:'시설 안내기호·수목/벤치·옥상 장식·다른 교량·지형·전체 교량면/화면 프레이밍은 검사하지 않음.',
        actualVisibilityVerified:false,collisionDetection:false};
      if(chosen)setView('bridgeChannel',new THREE.Vector3(...chosen.target),new THREE.Vector3(...chosen.position));else setView('focus',new THREE.Vector3(record.bridge.center[0],0,record.bridge.center[1]));
    }else{setView('focus',new THREE.Vector3(-420,0,-45))}
    $('landmarks').querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.placeKey===record.key));
  }
  placeSelection=createPlaceSelection({records:placeRecords,shell,stage,getCanvas:()=>renderer.domElement,onNavigate:navigateRecord,isHidden:selectedBuildingHidden,
    onDetails(record){openRecordDetails(record);shell.openControls(record.kind==='building'?'explore':'evidence',$(record.kind==='building'?'selection':'evidenceBox'))},
    onFallback(){setView('overview')},
    onChange(record,hidden){localSearch?.syncSelection(record,hidden);if(!record)$('landmarks').querySelectorAll('button').forEach(button=>button.classList.remove('active'))},
  });
  localSearch=createLocalNameSearch({data,onSelect:record=>placeSelection.select(record.key,{source:'search',focus:false}),onClear:()=>placeSelection.clear({source:'search-clear'})});
  for(const [id,key] of [['landmarkSamil','building:355906424'],['landmarkSK','building:141957173']])$(id).addEventListener('click',()=>placeSelection.select(key,{source:'landmark-shortcut'}));
  placeSelection.start();
  // A known selected place restored from the address takes precedence over a
  // camera query retained by copied links. Invalid/unknown fragments have no key.
  if(!placeSelection.state.key&&query.get('view')==='gwangtong-detail')showStoneDetail();
  function applyGraphicPreset(value){if(!graphicPresets[value])return;placeSelection.clear({source:'corridor-detail'});shell.activatePanel('explore');setView(value);$('mapModeLabel').textContent=graphicPresets[value].description||'구간 상세 · 자체 절차 표현 / 표고·세부 배치 추정';if(stage.clientWidth<760)shell.showMap()}
  document.querySelectorAll('[data-field-view]').forEach(button=>button.addEventListener('click',()=>{const value=button.dataset.fieldView;$('corridorDetailView').value=value;applyGraphicPreset(value)}));
  $('surfaceCompare').addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('view',graphicSelect.value||'surface-east');if(surfaceLegacy)url.searchParams.delete('surfaceDetail');else url.searchParams.set('surfaceDetail','legacy');location.assign(url.href)});
  $('surfaceCompare').textContent=surfaceLegacy?'2.7 수변 표현으로 돌아가기 ↗':'2.6 표면과 같은 시점 비교 ↗';
  $('surfaceMode').textContent=surfaceLegacy?'비교 · 기존2.6 수변 표현':'2.7 · 사진 참고 재질과 광학 수면';
  $('fieldCompare').addEventListener('click',()=>{const url=new URL(location.href);url.searchParams.set('view',graphicSelect.value||'field-jangtong');if(photoLegacy)url.searchParams.delete('fieldDetail');else url.searchParams.set('fieldDetail','legacy');location.assign(url.href)});
  $('fieldCompare').textContent=photoLegacy?'현재 계단 상세로 돌아가기 ↗':'이전 계단 형상과 비교 ↗';
  $('fieldMode').textContent=photoLegacy?'비교 · 보존2.5 형상':'2.6 · 계단 접합과 출구 표식';
  const graphicSelect=$('corridorDetailView');graphicSelect.addEventListener('change',()=>applyGraphicPreset(graphicSelect.value));
  if(!placeSelection.state.key&&graphicPresets[query.get('view')]){graphicSelect.value=query.get('view');applyGraphicPreset(query.get('view'));movingTo=null;const fitted=graphicPresetCamera(query.get('view'));camera.position.copy(fitted.position);ctl.target.copy(fitted.target);ctl.update()}
  if(query.get('time')==='evening'){$('lighting').click()}


  // Read-only diagnostics in the DOM record rendered state for repeatable QA.
  const profiler=createFrameProfiler({renderer,scene,stage,query});
  const markerProjector=createMarkerProjector({stage,camera,markers:markerLabels});
  const diagnostics=document.createElement('output');diagnostics.id='renderDiagnostics';diagnostics.hidden=true;stage.append(diagnostics);

  const benchmark=createBenchmark({button:$('benchmark'),output:$('benchmarkResult'),camera,controls:ctl,setTourView(){movingTo=null;post.shadow(new THREE.Vector3(-150,0,-23));},getState:()=>({quality:post.high?'high':'light',viewport:[stage.clientWidth,stage.clientHeight],pixelRatio:renderer.getPixelRatio(),version:31,displayVersion:'발표 마감본',legacyVersionOrdinal:32,legacyDisplayVersion:'발표 마감본',buildRevision:'final-render-20261117',versionNamespace:'final',scenario:curr,evening})});
  const backgroundDay=new THREE.Color('#dce9eb'),backgroundEvening=new THREE.Color('#82949f'),sunDay=new THREE.Color('#fff1db'),sunEvening=new THREE.Color('#ffca96');
  let animationTime=performance.now(),waterClock=0;
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),scaleRay=new THREE.Raycaster();
  function updateScale(){
    const a=new THREE.Vector3(),b=new THREE.Vector3();
    scaleRay.setFromCamera(new THREE.Vector2(-.1,-.1),camera);const hitA=scaleRay.ray.intersectPlane(plane,a);
    scaleRay.setFromCamera(new THREE.Vector2(-.1+200/stage.clientWidth,-.1),camera);const hitB=scaleRay.ray.intersectPlane(plane,b);
    if(!hitA||!hitB||camera.position.y<1){$('scaleLine').hidden=true;$('scaleText').textContent='근접 시점 · 축척 생략';return}
    const per100=a.distanceTo(b),steps=[1,2,5,10,20,50,100,200,500,1000],meters=steps.reduce((best,n)=>Math.abs(n-per100)<Math.abs(best-per100)?n:best,steps[0]);
    $('scaleLine').hidden=false;$('scaleLine').style.width=`${100*meters/per100}px`;$('scaleText').textContent=`약 ${meters}m · 화면 중앙 가정 지면`;
  }
  function animate(now){
    if(contextLost)return;
    try{
    profiler.begin(now);
    const delta=Math.min(100,Math.max(0,now-animationTime));const ease=shell.reducedMotion?1:1-Math.exp(-delta/190);animationTime=now;
    water.position.y=THREE.MathUtils.lerp(water.position.y,targetWater,shell.reducedMotion?1:1-Math.exp(-delta/270));
    if(Math.abs(water.position.y-targetWater)<.002)water.position.y=targetWater;waterEdge.position.y=water.position.y+.03;stage.dataset.waterY=String(water.position.y);
    if(!shell.reducedMotion)waterClock+=delta;
    const lightEase=shell.reducedMotion?1:1-Math.exp(-delta/280);scene.background.lerp(evening?backgroundEvening:backgroundDay,lightEase);scene.fog.color.copy(scene.background);
    profiler.mark('water-background');lighting.frame(now);profiler.mark('lighting');
    updateDepthPrecision();ctl.enableDamping=!shell.reducedMotion;
    if(movingTo){camera.position.lerp(movingTo.position,ease);ctl.target.lerp(movingTo.target,ease);if(camera.position.distanceTo(movingTo.position)<.08){camera.position.copy(movingTo.position);ctl.target.copy(movingTo.target);movingTo=null}}
    ctl.update();profiler.mark('controls');flood.frame(camera);profiler.mark('flood');benchmark.frame(now);profiler.mark('benchmark');if(photoWater&&profiler.ablation!=='graphics-sync')graphics?.sync({y:water.position.y,evening,quality:post.high?'high':'light',reducedMotion:shell.reducedMotion,landscape:groups.landscape.visible});visual.tick(waterClock,evening);if(!photoWater&&profiler.ablation!=='graphics-sync')graphics?.sync({y:water.position.y,evening,quality:post.high?'high':'light',reducedMotion:shell.reducedMotion,landscape:groups.landscape.visible});profiler.mark('graphics');if(profiler.enabled)profiler.render(()=>post.render());else post.render();profiler.mark('post-render');
    if(firstFrame){
      firstFrame=false;stage.dataset.firstRenderMs=performance.now().toFixed(1);
      const resources=performance.getEntriesByType('resource').filter(entry=>{try{return new URL(entry.name).origin===location.origin}catch{return false}});
      stage.dataset.resourceMeasuredAtMs=performance.now().toFixed(1);
      stage.dataset.resourceRequestCount=String(resources.length);
      stage.dataset.resourceTransferBytes=String(resources.reduce((sum,entry)=>sum+(entry.transferSize||0),0));
      stage.dataset.resourceEncodedBodyBytes=String(resources.reduce((sum,entry)=>sum+(entry.encodedBodySize||0),0));
      stage.dataset.resourceZeroTransferCount=String(resources.filter(entry=>entry.transferSize===0).length);
      stage.dataset.resourceMeasurementScope='completed-same-origin-resources-excluding-navigation';
      window.cheonggyeV32Load?.ready();
    }
    if(profiler.ablation!=='labels')markerProjector.frame();
    $('northArrow').style.transform=`rotate(${Math.atan2(camera.position.x-ctl.target.x,camera.position.z-ctl.target.z)*180/Math.PI}deg)`;
    profiler.mark('labels');frame++;if(now-lastTime>=1000){const fps=Math.round(frame*1000/(now-lastTime));$('fps').textContent=`${fps} fps`;frame=0;lastTime=now;updateScale();diagnostics.textContent=JSON.stringify({version:31,displayVersion:'발표 마감본',legacyVersionOrdinal:32,legacyDisplayVersion:'발표 마감본',buildRevision:'final-render-20261117',versionNamespace:'final',landmarks:{mode:legacyLandmarks?'legacy-generic':'source23-specific',models:landmarkModels.map(m=>m.userData.landmarkDiagnostics)},labelProjection:markerProjector.state,graphics:graphics?.diagnostics||{mode:'legacy-source20',sourceModules:['gwangtong-v20','art-v14','detail-v14','lighting-v14','context-v14']},graphicPresets,bridgeCamera:bridgeCameraBasis,gwangtongDetail:{legacyComparison:legacyBridgeComparison,preset:gwangtongCamera},localSearch:localSearch.state,selection:placeSelection.state,staticBatching,cameraMode:currentView,maxPolarAngle:ctl.maxPolarAngle,collisionDetection:false,walkPreset,walkPresetEyeHeightAboveAssumedWalkwayM:currentView==='walk'?1.75:null,lighting:lighting.state,rainfall:rainfall.state,flood:flood.state,interface:{panel:shell.panel,reducedMotion:shell.reducedMotion},context:{...district.stats,visible:groups.context.visible,grid:groups.grid.visible},targetWaterY:targetWater,virtualDepth:depth,waterEdge:waterEdge.visible,evidence:precision.state,detailStats,landscape:groups.landscape.visible,quality:post.high?'high':'light',assetsLoaded:visual.loaded,bridgeDetails,fieldDetails,exitFixtures,surfaceModel:{active:Boolean(surfaceStyle&&photoWater),materials:surfaceStyle?.diagnostics,bands:surfaceBands,water:photoWater?.diagnostics,memory:surfaceMemory,originalPixelsPublished:false,riverbedY:-5,surveyed:false,hydraulicModelChanged:false},photoModel:{mode:photoLegacy?'legacy-source26':'field-source27',photoCount:103,originalPixelsPublished:false,surveyedElevations:false,graphChanged:false},benchmarkRunning:benchmark.running,evening,pixelRatio:renderer.getPixelRatio(),viewport:[stage.clientWidth,stage.clientHeight],scenario:curr,waterY:water.position.y,buildings:groups.buildings.visible,risk:groups.risk.visible,route:groups.routes.visible,riskColors:[...new Set(riskSegments.map(s=>s.material.userData.riskColor||s.material.color.getHexString()))],camera:camera.position.toArray().map(n=>+n.toFixed(2)),target:ctl.target.toArray().map(n=>+n.toFixed(2)),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,fps,sceneCounts:meta.counts})}
    profiler.mark('diagnostics');if(profiler.enabled)profiler.end({shadow:post.shadowState,benchmarkRunning:benchmark.running});animationFrame=requestAnimationFrame(animate);
    }catch(error){console.error('청계천 발표 마감본 화면 오류',error);window.cheonggyeV32Load?.error('3D 화면을 계속 표시하지 못했습니다','다시 불러오기 또는 가벼운 모드로 열기를 선택해 주세요.')}
  }
  stage.dataset.initializationMs=performance.now().toFixed(1);animationFrame=requestAnimationFrame(animate);
} catch(error){
  console.error('청계천 발표 마감본 로드 실패:',error);
  window.cheonggyeV32Load?.error('3D 장면을 불러오지 못했습니다',error.message+' · 연결 상태와 자료 파일 경로를 확인한 뒤 다시 불러와 주세요.');
}


import * as THREE from 'three';

export function chooseOpenWalk(data){
 const walk=data.walks[0],points=walk.points[0][0]>walk.points.at(-1)[0]?walk.points.slice().reverse():walk.points;
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
 const total=lengths.at(-1);
 function at(distance){let i=1;while(i<lengths.length-1&&lengths[i]<distance)i++;const t=(distance-lengths[i-1])/(lengths[i]-lengths[i-1]||1);return points[i-1].map((v,k)=>v+(points[i][k]-v)*t)}
 const candidates=[.58,.60,.62,.55,.66,.72,.34].map(fraction=>{const point=at(total*fraction),clearance=Math.min(...data.bridges.map(b=>Math.hypot(point[0]-b.center[0],point[1]-b.center[1])-(b.official_width_m||20)/2));return{fraction,point,clearance}});
 const chosen=candidates.find(c=>c.clearance>35)||candidates.sort((a,b)=>b.clearance-a.clearance)[0];
 return {available:true,sourceWalkIndex:0,sourceWalkSide:walk.side,source:'scene_precision_v5.json / modeled walkway',modeledLineLengthM:total,
  startFraction:chosen.fraction,startDistanceM:total*chosen.fraction,cameraStartXZ:chosen.point,targetXZ:at(Math.min(total,total*chosen.fraction+24)),
  presetCameraY:-1.25,assumedWalkwayY:-3,cameraStartOnModeledCenterline:true,bridgeClearanceM:chosen.clearance,collisionDetection:false};
}

export function connectExhibitionScene({camera,controls,stage,shell,setView,graph,data,renderer,focusBridge}){
 const $=id=>document.getElementById(id);let rotating=false,picking=false,pointerStart=null;
 const button=$('rotateScene');button.disabled=false;$('pickRouteStart').disabled=false;
 function rotation(value){
  if(value&&shell.reducedMotion)document.getElementById('rainDemoStatus').textContent='움직임 줄이기 설정으로 자동 회전이 꺼져 있습니다.';
  rotating=Boolean(value)&&!shell.reducedMotion;controls.autoRotate=rotating;controls.autoRotateSpeed=.42;
  button.setAttribute('aria-pressed',String(rotating));button.textContent=rotating?'회전 정지':'자동 회전';stage.dataset.autoRotating=String(rotating);
 }
 button.addEventListener('click',()=>{document.dispatchEvent(new CustomEvent('cheonggye:rotationrequest'));if(!rotating&&stage.dataset.cameraMode==='walk')setView('overview');rotation(!rotating)});
 controls.addEventListener('start',()=>{rotation(false);document.dispatchEvent(new CustomEvent('cheonggye:manualcamera'))});
 document.addEventListener('cheonggye:manualcamera',()=>rotation(false));
 $('reduceMotion').addEventListener('change',()=>{if(shell.reducedMotion)rotation(false)});
 document.addEventListener('cheonggye:demostate',()=>rotation(false));
 document.addEventListener('cheonggye:viewrequest',e=>{rotation(false);setView(e.detail.view)});
 document.addEventListener('cheonggye:mapfocus',()=>{rotation(false);document.dispatchEvent(new CustomEvent('cheonggye:manualcamera'))});
 document.querySelectorAll('.view-buttons button').forEach(b=>b.addEventListener('click',()=>{rotation(false);document.dispatchEvent(new CustomEvent('cheonggye:manualcamera'))}));
 const bridgeButtons=new Map();
 function pick(value,message=''){
  picking=value;stage.dataset.pickingStart=String(value);rotation(false);
  document.dispatchEvent(new CustomEvent('cheonggye:pickstate',{detail:{active:value,message}}));
 }
 document.addEventListener('cheonggye:pickrequest',e=>{document.dispatchEvent(new CustomEvent('cheonggye:manualcamera'));pick(e.detail.active);if(picking)setView('top')});
 renderer.domElement.addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY]});
 renderer.domElement.addEventListener('click',e=>{
  if(!picking||!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>8)return;
  const rect=renderer.domElement.getBoundingClientRect();let nearest=null,best=42;
  for(const node of graph.nodes){if(!/^(north|south):\d+$/.test(node.id))continue;
   const point=new THREE.Vector3(node.point[0],-2.5,node.point[1]).project(camera);if(point.z< -1||point.z>1)continue;
   const d=Math.hypot(rect.left+(point.x+1)*rect.width/2-e.clientX,rect.top+(1-point.y)*rect.height/2-e.clientY);
   if(d<best){best=d;nearest=node}
  }
  if(!nearest){pick(true,'산책로에 더 가깝게 눌러 주세요.');return}
  const select=$('evacStart');let option=[...select.options].find(o=>o.value===nearest.id);
  if(!option){select.querySelector('option[data-map-picked]')?.remove();option=new Option((nearest.bank==='north'?'북안':'남안')+' · 지도에서 선택한 위치',nearest.id);option.dataset.mapPicked='true';select.add(option)}
  select.value=nearest.id;select.dispatchEvent(new Event('change',{bubbles:true}));pick(false,'지도에서 선택한 출발점으로 계산했습니다.');
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&picking)pick(false,'위치 선택을 취소했습니다.')});
 return {bridgeButtons,frame(){if(shell.reducedMotion&&rotating)rotation(false)},stopRotation:()=>rotation(false)};
}

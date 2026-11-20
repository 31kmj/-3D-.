import * as THREE from 'three';

export function createMarkerProjector({stage,camera,markers,getOccluders=()=>[]}){
 const p=new THREE.Vector3(),ray=new THREE.Raycaster(),lastCamera=new THREE.Vector3(Infinity,0,0);
 const leaders=document.createElementNS('http://www.w3.org/2000/svg','svg');leaders.classList.add('label-leaders');leaders.setAttribute('aria-hidden','true');document.getElementById('mapLabels').prepend(leaders);
 const leaderMap=new WeakMap();
 let frames=0,visible=0,lastOcclusion=0,lastVisibility='';const blocked=new WeakMap();
 return {frame(){
  frames++;visible=0;const width=stage.clientWidth,height=stage.clientHeight,stageBox=stage.getBoundingClientRect();
  const boxes=[...stage.querySelectorAll('.rain-hud,.map-presentation-tools,.final-analytics,.view-toolbar,.bridge-directory')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{x:r.x-stageBox.x,y:r.y-stageBox.y,w:r.width,h:r.height}});
  const visibility=['showBuildings','showHeightBasis','hideAssumedHeight','showContext'].map(id=>document.getElementById(id)?.checked).join(':');
  const occupied=[];const testOcclusion=visibility!==lastVisibility||performance.now()-lastOcclusion>350&&camera.position.distanceTo(lastCamera)>.6;
  const occluders=testOcclusion?getOccluders():[];
  for(const marker of markers){
   const {element,position}=marker;p.copy(position).project(camera);
   let hidden=p.z< -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;
   if(testOcclusion&&!hidden){const direction=position.clone().sub(camera.position),distance=direction.length();ray.set(camera.position,direction.normalize());ray.far=Math.max(0,distance-3);blocked.set(element,ray.intersectObjects(occluders,true).length>0)}
   const bridgeOverview=element.dataset.labelKind==='bridge'&&['overview','top'].includes(stage.dataset.cameraMode);
   hidden=hidden||(!bridgeOverview&&blocked.get(element)===true);
   const x=(p.x+1)*.5*width,y=(1-p.y)*.5*height,w=element.offsetWidth||72,h=element.offsetHeight||26;
   let chosen=null;
   if(!hidden)for(const dy of [-h-8,8,-h-36,36,-h-68,68,-h-104,104,-h-142,142]){
    const b={x:Math.max(8,Math.min(width-w-8,x-w/2)),y:y+dy,w,h};
    if(b.y<60||b.y+h>height-24)continue;
    const overlap=a=>b.x<a.x+a.w+5&&b.x+b.w+5>a.x&&b.y<a.y+a.h+4&&b.y+b.h+4>a.y;
    if(!occupied.some(overlap)&&!boxes.some(overlap)){chosen=b;break}
   }
   element.style.display=chosen?'block':'none';
   element.dataset.hiddenReason=chosen?'':hidden?'outside-or-occluded':'overlay-collision';
   element.dataset.inView=String(Boolean(chosen));
   let leader=leaderMap.get(element);if(!leader){leader=document.createElementNS('http://www.w3.org/2000/svg','line');leader.setAttribute('stroke','#547c8577');leader.setAttribute('stroke-width','1');leaders.append(leader);leaderMap.set(element,leader)}
   leader.style.display=chosen?'':'none';
   if(chosen){element.style.left=chosen.x+'px';element.style.top=chosen.y+'px';element.style.transform='none';occupied.push(chosen);visible++;leader.setAttribute('x1',String(x));leader.setAttribute('y1',String(y));leader.setAttribute('x2',String(chosen.x+chosen.w/2));leader.setAttribute('y2',String(y>chosen.y?chosen.y+chosen.h:chosen.y))}
   if(marker.directoryButton)marker.directoryButton.dataset.inView=String(Boolean(chosen));
  }
  if(testOcclusion){lastOcclusion=performance.now();lastCamera.copy(camera.position);lastVisibility=visibility}
  stage.dataset.visibleMapLabels=String(visible);
 },get state(){return{mode:'projected-labels-collision-and-building-occlusion',markers:markers.length,frames,visible}}};
}

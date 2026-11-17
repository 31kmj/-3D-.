import * as THREE from 'three';
import {HISTORY_APPLICATION,validateRainfallHistory,calculateHistoricalRainfall} from './rainfall-history-v32.js';
import {BOUNDARY_APPLICATION,resolveBoundaryContext} from './boundary-rainfall-v32.js';
import {createInundationAreaUI} from './inundation-area-ui-v32.js';
import {buildFloodGraph,edgeHazard,validateFloodResult,findEvacuationRoute} from './flood-engine-v15.js';
import {STUDY_PROFILES,temporalStateAt,findTemporalEvacuationRoute,validateScopeContract} from './temporal-evac-v19.js';
import {RAIN_MODEL,calculateRainfallFlood,unknownRainResult,rainfallHazard,findRainfallRoute} from './rainfall-prototype-v32.js';
import {buildRainTimeline,rainResultAt,findRainTimeRoute,RAIN_FUTURES} from './rainfall-time-v32.js';
import {resolveHazardPolicy,HAZARD_APPLICATION} from './hazard-policy-v29.js';
import {buildFacilityInventory,resolveFacilityContext,facilityMapStates,FACILITY_APPLICATION} from './facility-conditions-v30.js';
import {validateLiveSnapshot} from './live-rainfall-v24.js';
// Rainfall mode is an explicitly uncalibrated graduation prototype; original synthetic modes remain available.
export function buildOverlayBuffers(graph){
 const lookup=new Map(graph.nodes.map(n=>[n.id,n])),walkEdges=graph.edges.filter(e=>e.kind==='walk'),positions=[],indices=[],ranges=[];
 for(const edge of walkEdges){const a=lookup.get(edge.a).point,b=lookup.get(edge.b).point,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1,nx=-dz/len*(edge.width*.48),nz=dx/len*(edge.width*.48),offset=positions.length/3;positions.push(a[0]+nx,-2.91,a[1]+nz,a[0]-nx,-2.91,a[1]-nz,b[0]+nx,-2.91,b[1]+nz,b[0]-nx,-2.91,b[1]-nz);indices.push(offset,offset+1,offset+2,offset+2,offset+1,offset+3);ranges.push({edgeId:edge.id,vertexOffset:offset,vertexCount:4})}
 return {positions:new Float32Array(positions),indices:new Uint32Array(indices),ranges};
}
export function routeFitBounds(points){if(!points?.length||points.some(p=>!Array.isArray(p)||p.length<3||!p.every(Number.isFinite)))return null;return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))),pointCount:points.length}}
function hashBytes(array){let hash=2166136261;for(const value of new Uint8Array(array.buffer,array.byteOffset,array.byteLength)){hash^=value;hash=Math.imul(hash,16777619)>>>0}return hash.toString(16).padStart(8,'0')}
export function createFloodUI({data,fixtures,temporalFixtures,evacuationScope,scene,shell,onFocus,onFitRoute,onReturnToFlood}){
 const $=id=>document.getElementById(id),graph=buildFloodGraph(data),nodeMap=new Map(graph.nodes.map(n=>[n.id,n]));
 const areaUI=createInundationAreaUI({data,graph,scene,onFocus:point=>{onFocus(point);shell.showMap()},onChange:()=>recompute(),onMapTime:seconds=>{if(!isRainTime())return;$('rainTimeView').value=String(seconds);recompute()}});
 const facilityInventory=buildFacilityInventory(data,graph);let facilityContext=resolveFacilityContext(facilityInventory),facilityStates=[];
 const overlay=new THREE.Group(),routeLayer=new THREE.Group();scene.add(overlay,routeLayer);
 const buffers=buildOverlayBuffers(graph),geometry=new THREE.BufferGeometry(),colors=new Float32Array(buffers.positions.length);geometry.setAttribute('position',new THREE.BufferAttribute(buffers.positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(new THREE.BufferAttribute(buffers.indices,1));geometry.computeBoundingSphere();
 const overlayMaterial=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.79,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,depthWrite:false}),overlayMesh=new THREE.Mesh(geometry,overlayMaterial);overlayMesh.renderOrder=3;overlay.add(overlayMesh);
 const overlayStats={strategy:'one-indexed-vertex-colour-mesh',baselineMeshCount:buffers.ranges.length,overlayMeshCount:1,vertexCount:buffers.positions.length/3,triangleCount:buffers.indices.length/3,positionHash:hashBytes(buffers.positions),indexHash:hashBytes(buffers.indices),hashAlgorithm:'fnv1a32-bytes-not-cryptographic',geometryUnchangedAcrossScenarios:true,colorUpdates:0};
 const startMaterial=new THREE.MeshBasicMaterial({color:'#1e3a73'}),startMarker=new THREE.Mesh(new THREE.SphereGeometry(2.3,14,8),startMaterial);routeLayer.add(startMarker);
 const arrivalMarker=new THREE.Mesh(new THREE.SphereGeometry(2.8,14,8),new THREE.MeshBasicMaterial({color:'#ef8d32'}));routeLayer.add(arrivalMarker);
 const makeLabel=(text,kind)=>{const el=document.createElement('span');el.className='evac-map-label '+kind;el.textContent=text;$('stage').append(el);return el},startLabel=makeLabel('출발','origin'),arrivalLabel=makeLabel('지상 도착점 · 안전 미검증','destination');
 const routeMaterial=new THREE.MeshBasicMaterial({color:'#67f3f5'}),routeOutlineMaterial=new THREE.MeshBasicMaterial({color:'#153a4a',transparent:true,opacity:.96});let routeMesh=null,routeOutline=null,routePoints=[],fitBounds=null,current=fixtures.scenarios[0],route=null,importState='none',importedResult=null;
 const importOptionValue='__imported_synthetic__';
 let temporalScenario=temporalFixtures.scenarios[0];
 const scopeValidation=validateScopeContract(evacuationScope);
 const isTemporal=()=>$('evacMode').value==='temporal',isRainfall=()=>['rainfall','rain-time'].includes($('evacMode').value),isRainTime=()=>$('evacMode').value==='rain-time';
 let rainResult=unknownRainResult(graph),liveSnapshot=null,liveState={status:'unavailable',reason:'실시간 관측을 아직 조회하지 않았습니다.'},requestSerial=0,liveController=null,pollTimer=null;
 let historyFixture=null,historyController=null,historyState={status:'unavailable',reason:'과거10분 관측 재생 자료를 선택하면 불러옵니다.'};
 const historyURL=new URL('../data/rainfall_history_v32.json',import.meta.url);
 const liveURL=new URL('../data/live_rainfall_v24.json',import.meta.url);

 let rainDisplayResult=null,rainTimeline=null;
 const timeCache={timelineKey:null,timeline:null,routeKey:null,route:null,builds:0,routeCalculations:0,buildMs:0,routeMs:0};
 const clock=seconds=>Number.isFinite(seconds)?Math.floor(seconds/60)+':'+String(Math.round(seconds%60)).padStart(2,'0'):'—';
 for(const option of RAIN_FUTURES){const el=document.createElement('option');el.value=option.id;el.textContent=option.label+(option.id==='rising'?' (최대500mm/h)':'');$('rainFuture').append(el)}
 function selectedBoundaryContext(){
  const number=id=>$(id).value.trim()===''?NaN:Number($(id).value),mode=$('boundaryMode').value;
  return resolveBoundaryContext(mode==='scenario'?{mode,catchmentAreaM2:number('boundaryAreaHa')*10000,runoffCoefficient:number('boundaryRunoff'),upstreamExcessM3s:number('boundaryUpstream'),lateralExcessM3s:number('boundaryLateral'),drainageFactor:number('boundaryDrainagePct')/100,initialStorageM3:number('boundaryInitialStorage')}:{mode});
 }
 function renderBoundary(){
  const b=selectedBoundaryContext(),r=rainDisplayResult,c=r?.calculation,h=rainResult?.history;
  for(const id of ['boundaryAreaHa','boundaryRunoff','boundaryUpstream','boundaryLateral','boundaryDrainagePct','boundaryInitialStorage'])$(id).disabled=b.mode!=='scenario';
  $('boundarySummary').textContent=!b.valid?b.reason:b.mode==='legacy'?'3.0 비교 고정값: 기여면적 50ha · C 0.65 · 추가유입 0 · 배수 100% · 초기추가저류 0. 모두 실험 가정입니다.':`명시적 모형 경계 가정: 기여면적 ${b.catchmentAreaM2/10000}ha · C ${b.runoffCoefficient} · 상류 추가 ${b.upstreamExcessM3s}m³/s · 측방 추가 ${b.lateralExcessM3s}m³/s · 배수 ${b.drainageFactor*100}% · 초기추가저류 ${b.initialStorageM3}m³. 현재 현장 경계·운영 미연결.`;
  if(h?.valid)$('boundarySummary').textContent+=' 재생 시작 기준 경계입니다. 마지막10분 계산에는 앞선 관측을 적분한 저류 '+h.derivedLastBinInitialStorageM3.toFixed(2)+'m³를 계산 초기값으로 사용합니다.';
  const f=n=>Number.isFinite(n)?n.toFixed(2):'미확인';
  $('boundaryMassBalance').textContent=c&&r.valid?`조회 시점 유입: 강우유출 ${f(c.runoffInflowM3s)} + 상류추가 ${f(c.upstreamExcessM3s)} + 측방추가 ${f(c.lateralExcessM3s)} = ${f(c.inflowM3s)}m³/s. ${h?.valid?'마지막 관측10분 구간 시작(이력산출값)부터':'시작부터'} 누적: 초기 ${f(c.initialStorageM3)} + 강우유출 ${f(c.inputRunoffM3)} + 상류추가 ${f(c.inputUpstreamExcessM3)} + 측방추가 ${f(c.inputLateralExcessM3)} − 모형배출 ${f(c.drainedM3)} = 잔류 ${f(c.storageM3)}m³ (수지잔차 ${f(c.massBalanceResidualM3)}m³). 지도·위험·경로는 강우와 이 경계 조건을 함께 반영합니다.`:'유효한 강우·경계 입력이 없어 누적 수지와 침수·경로를 산정하지 않습니다.';
 }
 function selectedFacilityContext(){const number=id=>$(id).value.trim()===''?NaN:Number($(id).value);return resolveFacilityContext(facilityInventory,{mode:$('facilityMode').value,scenario:$('facilityScenario').value,minModelWidthM:number('minModelWidthM'),maxModelGradePct:number('maxModelGradePct'),requireStepFree:$('requireStepFree').checked})}
 function renderFacilities(closedExitIds){
  const atSeconds=isRainTime()?Number($('rainTimeView').value):0;facilityStates=facilityMapStates(graph,facilityContext,rainDisplayResult,atSeconds,closedExitIds);
  $('facilityScenario').disabled=facilityContext.mode!=='scenario';
  $('facilitySummary').textContent=!facilityContext.valid?facilityContext.reason:facilityContext.mode==='off'?'2.8 비교: 모델 폭·경사·운영 조건을 경로에 적용하지 않습니다. 기존 가정 경로입니다.':facilityContext.mode==='unverified'?'현재 운영 자료 미연결 → 대피방향을 미확인·차단합니다. 명시적 가정 운영 시연으로 비교할 수 있습니다.':`가정 운영 시연 · 조회 ${clock(atSeconds)} · 허용 ${facilityStates.filter(c=>!c.blocked).length}/${graph.exits.length}곳. 폭·상승구간 경사는 표시 모델에서 계산한 가정 치수입니다.`;
  const list=$('facilityExitList');list.replaceChildren();for(const item of facilityStates){const p=document.createElement('p');p.className='facility-exit-row';p.dataset.exitId=item.exitId;p.dataset.condition=item.blocked?(item.unknown?'unknown':'excluded'):'eligible';const m=item.model;p.textContent=item.name+' · '+(m?`모델 폭 ${m.modelWidthM.toFixed(2)}m / 상승경사 ${m.maxModelGradePct.toFixed(1)}%`:'모델 치수 미확인')+' · '+({'open':'대피 열림(가정)','ingress-closed-egress-open':'진입 차단·대피 열림(가정)','egress-closed':'대피 차단(가정)','unknown':'운영 미확인'}[item.operationState])+' · '+item.reason;list.append(p)}
  const rejected=(route.facilityCandidates||[]).filter(c=>c.blocked).map(c=>{const reasons=c.reasons||c.checks?.flatMap(k=>k.reasons)||[];return (c.name||c.exitId)+': '+[...new Set(reasons.map(r=>r.reason))].join(' / ')}).filter(s=>!s.endsWith(': '));
  $('facilityRouteSummary').textContent=(route.status==='route'?'선택 '+route.exit.name+(isRainTime()?` · 계단·연결부 점유 전구간/도착 검사 ${clock(route.arrivalSeconds)}`:' · 현재시각 출구조건 검사; 이동 중 변화는 시간 대피에서 검사'):'출구조건 결과: '+route.reason)+(rejected.length?' · 후보 제외 '+rejected.join(' / '):'');
 }
 function timedRain(closedExitIds){
  const profile=$('rainFuture').value,freezeInitialState=$('rainFreeze').checked;
  const timelineKey=JSON.stringify([rainResult.boundaryContextKey,rainResult.id,rainResult.reason,rainResult.hazardPolicy?.key,profile,freezeInitialState]);
  if(timeCache.timelineKey!==timelineKey){const begin=performance.now();timeCache.timelineKey=timelineKey;timeCache.timeline=buildRainTimeline(graph,rainResult,{profile,freezeInitialState,boundaryContext:rainResult.boundary});timeCache.routeKey=null;timeCache.builds++;timeCache.buildMs=performance.now()-begin}
  rainTimeline=timeCache.timeline;rainDisplayResult=rainResultAt(rainTimeline,Number($('rainTimeView').value));
  const delaySeconds=$('rainTimeDelay').value.trim()===''?NaN:Number($('rainTimeDelay').value),routeKey=JSON.stringify([timelineKey,$('evacStart').value,delaySeconds,closedExitIds,facilityContext.key]);
  if(timeCache.routeKey!==routeKey){const begin=performance.now();timeCache.routeKey=routeKey;timeCache.route=findRainTimeRoute(graph,rainTimeline,$('evacStart').value,{delaySeconds,closedExitIds,facilityContext});timeCache.routeCalculations++;timeCache.routeMs=performance.now()-begin}
  route=timeCache.route;
  $('rainTimeReadout').textContent=clock(Number($('rainTimeView').value));
  $('rainTimeSummary').textContent=!rainTimeline.valid?'강우 미확인 · 시간별 위험도와 경로를 산출하지 않습니다.':freezeInitialState?'비교 모드 · 현재 수심을15분 동안 고정합니다. 경로 목적함수는 시간변화 모드와 같습니다.':`앞으로15분은 시연 가정입니다. 1분 뒤 강우 ${profile==='rising'?Math.min(500,rainResult.rainfall.intensityMmH*3):profile==='falling'?0:rainResult.rainfall.intensityMmH}mm/h · 공식 예보 아님.`;
  if(rainResult.history?.valid)$('rainTimeSummary').textContent='과거 선택 관측 끝시점 이후15분의 가정입니다. 현재 실시간 예측 아님. '+$('rainTimeSummary').textContent;
  $('rainTimeRelation').textContent=route.status==='route'?`경로 출발 ${clock(route.departureSeconds)} → 도착 ${clock(route.arrivalSeconds)} · 지도 조회 ${clock(Number($('rainTimeView').value))}. 모형 보행 약${Math.round(route.actualMovingSeconds)}초 · 격자 이동 ${route.travelSeconds}초 · 위험가중 비용 ${route.costSeconds.toFixed(1)}초 상당(비교점수). 이동 전구간 검사.`+(Number($('rainTimeView').value)>route.arrivalSeconds?' 현재 지도는 경로 도착 이후 상태입니다.':' 지도 조회시각은 출발 지연을 바꾸지 않습니다.'):route.reason||'시간 경로를 확인하는 중입니다.';
  drawRainChart();
 }
 function drawRainChart(){
  const svg=$('rainTimelineChart');svg.replaceChildren();if(!rainTimeline?.valid)return;
  const ns='http://www.w3.org/2000/svg',samples=rainTimeline.results,max=Math.max(.1,...samples.map(s=>s.result.calculation.stageM)),x=t=>12+t/rainTimeline.horizonSeconds*252,y=h=>72-h/max*58;
  const line=(tag,attrs)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));svg.append(el);return el};
  line('line',{x1:12,y1:72,x2:264,y2:72,stroke:'#b7ccc6'});
  line('polyline',{points:samples.map(s=>x(s.atSeconds)+','+y(s.result.calculation.stageM)).join(' '),fill:'none',stroke:'#226b67','stroke-width':2.5});
  const markerTime=Number($('rainTimeView').value);line('line',{x1:x(markerTime),y1:8,x2:x(markerTime),y2:75,stroke:'#bb643d','stroke-width':1.4,'stroke-dasharray':'3 3'});
  for(const t of [0,300,600,900]){const text=line('text',{x:x(t),y:88,'text-anchor':t===0?'start':t===900?'end':'middle',fill:'#566e67','font-size':9});text.textContent=clock(t)}
  const text=line('text',{x:12,y:10,fill:'#385e52','font-size':9});text.textContent='가정 상대수위 · 최대 '+max.toFixed(2)+'m';
 }
 for(const id of ['rainFuture','rainFreeze','rainTimeDelay','rainTimeView'])$(id).addEventListener(['rainTimeDelay','rainTimeView'].includes(id)?'input':'change',recompute);
 for(const [id,time] of [['rainTimeNow',0],['rainTimeFive',300],['rainTimeEnd',900]])$(id).addEventListener('click',()=>{$('rainTimeView').value=String(time);recompute()});

 const liveReasonText=reason=>({'credentials-missing':'기상청 인증키 미연결 · 현재 강우 미확인','unavailable':'기상청 관측 미연결','stale-observation':'관측이 15분 초과 오래되어 현재 위험도 미확인','future-timestamp':'관측·조회 시각이 현재보다 미래입니다.','station-mismatch':'요청 지점과 관측 지점이 일치하지 않습니다.','invalid-rainfall':'강우 결측 또는 유효하지 않은 관측입니다.','outside-prototype-range':'시제품 강우 계산 범위(0~500mm/h)를 벗어났습니다.','source-mismatch':'공식 출처가 일치하지 않습니다.','unsupported-source':'지원하는 기상청 관측 형식이 아닙니다.','invalid-observation-contract':'관측 단위·누적기간을 확인할 수 없습니다.','invalid-timestamp':'관측·조회 시각 형식이 올바르지 않습니다.','invalid-station':'관측 지점을 확인할 수 없습니다.','invalid-clock':'현재 시각을 확인할 수 없습니다.'}[reason]||reason);
 function selectedHazardPolicy(){return resolveHazardPolicy({id:$('hazardPolicy').value,velocityMode:$('hazardVelocityMode').value,assumedVelocityMps:$('hazardVelocityMps').value.trim()===''?null:Number($('hazardVelocityMps').value)});}
 function currentRainResult(){
  const hazardPolicy=selectedHazardPolicy(),boundaryContext=selectedBoundaryContext();
  if($('rainSource').value==='history'){if(historyState.status!=='ready')return {...unknownRainResult(graph,historyState.reason,hazardPolicy,boundaryContext),history:{valid:false,reason:historyState.reason,liveObservation:false}};return calculateHistoricalRainfall(graph,historyFixture,{episodeId:$('historyStation').value,cursor:$('historyCursor').value.trim()===''?NaN:Number($('historyCursor').value),boundaryContext,hazardPolicy});}
  if($('rainSource').value==='manual')return calculateRainfallFlood(graph,{intensityMmH:$('rainfallIntensity').value.trim()===''?NaN:Number($('rainfallIntensity').value),durationMinutes:$('rainfallDuration').value.trim()===''?NaN:Number($('rainfallDuration').value),hazardPolicy,boundaryContext});
  if(liveState.status!=='ready')return unknownRainResult(graph,liveState.reason,hazardPolicy,boundaryContext);
  const checked=validateLiveSnapshot(liveSnapshot);
  if(!checked.valid){liveState={status:'unavailable',reason:liveReasonText(checked.reason),reasonCode:checked.reason,ageMinutes:checked.ageMinutes};return unknownRainResult(graph,liveState.reason,hazardPolicy,boundaryContext);}
  const o=checked.observation;liveState={status:'ready',reason:'최신 관측 형식·시각 확인',ageMinutes:checked.ageMinutes,observation:o};
  return calculateRainfallFlood(graph,{intensityMmH:o.rainfall60mMm,durationMinutes:60,provenance:'observed-rainfall-prototype',observedAt:o.observedAt,stationId:o.stationId,hazardPolicy,boundaryContext});
 }
 async function refreshLive(){
  if(!isRainfall()||$('rainSource').value!=='live')return;
  const serial=++requestSerial;liveController?.abort();const controller=new AbortController();liveController=controller;liveSnapshot=null;liveState={status:'loading',reason:'실시간 관측 조회 중 · 현재 위험도 미확인'};recompute();
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch(liveURL,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('관측 수집 파일 미연결 (HTTP '+response.status+')');const snapshot=await response.json();if(serial!==requestSerial||!isRainfall()||$('rainSource').value!=='live')return;const checked=validateLiveSnapshot(snapshot);if(!checked.valid)throw Error(liveReasonText(checked.reason));liveSnapshot=snapshot;liveState={status:'ready',reason:'최신 관측 수신'};}
  catch(error){if(serial!==requestSerial||!isRainfall()||$('rainSource').value!=='live')return;liveSnapshot=null;liveState={status:'unavailable',reason:error.name==='AbortError'?'관측 조회 시간 초과':error.message};}
  finally{clearTimeout(timeout);if(serial===requestSerial&&isRainfall()&&$('rainSource').value==='live')recompute();}
 }
 async function refreshHistory(){
  if(!isRainfall()||$('rainSource').value!=='history')return {status:'cancelled'};
  const serial=++requestSerial;liveController?.abort();historyController?.abort();clearInterval(pollTimer);pollTimer=null;liveSnapshot=null;liveState={status:'unavailable',reason:'과거 관측 재생 중 · 실시간 관측 미연결'};
  if(historyFixture){const checked=validateRainfallHistory(historyFixture);historyState=checked.valid?{status:'ready',reason:'보존 원본과 연결한 과거10분 관측 발췌'}:{status:'unavailable',reason:checked.reason};if(!checked.valid)historyFixture=null;recompute();return {status:historyState.status,serial};}
  const controller=new AbortController();historyController=controller;historyState={status:'loading',reason:'과거10분 관측 발췌 로딩 중 · 실시간 아님'};recompute();const timeout=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch(historyURL,{cache:'no-store',signal:controller.signal});if(serial!==requestSerial||!isRainfall()||$('rainSource').value!=='history')return {status:'cancelled'};if(!response.ok)throw Error('과거 관측 파일 미연결 (HTTP '+response.status+')');const fixture=await response.json();if(serial!==requestSerial||!isRainfall()||$('rainSource').value!=='history')return {status:'cancelled'};const checked=validateRainfallHistory(fixture);if(!checked.valid)throw Error(checked.reason);historyFixture=fixture;historyState={status:'ready',reason:'보존 원본과 연결한 과거10분 관측 발췌'};}
  catch(error){if(serial!==requestSerial||!isRainfall()||$('rainSource').value!=='history')return {status:'cancelled'};historyFixture=null;historyState={status:'unavailable',reason:error.name==='AbortError'?'과거 관측 로딩 시간 초과':error.message};}
  finally{clearTimeout(timeout);if(serial===requestSerial&&isRainfall()&&$('rainSource').value==='history'){historyController=null;recompute();}}
  return {status:historyState.status,serial};
 }
 async function restartLive(){requestSerial++;liveController?.abort();historyController?.abort();historyController=null;clearInterval(pollTimer);pollTimer=null;liveSnapshot=null;liveState={status:'unavailable',reason:'현재 실시간 관측 미확인'};historyState=historyFixture?{status:'ready',reason:'검증된 과거 관측 발췌'}:{status:'unavailable',reason:'과거10분 관측 재생 자료를 선택하면 불러옵니다.'};recompute();if(isRainfall()&&$('rainSource').value==='history')return refreshHistory();if(isRainfall()&&$('rainSource').value==='live'){refreshLive();pollTimer=setInterval(()=>{if(isRainfall()&&$('rainSource').value==='live'){recompute();refreshLive();}},60000);}return {status:'inactive'};}
 async function setHistoricalReplay({episodeId,cursor}={}){
  if(typeof episodeId!=='string'||![...$('historyStation').options].some(o=>o.value===episodeId)||!Number.isInteger(cursor)||cursor<6||cursor>18)return {status:'invalid-options',reason:'검증된 과거 에피소드와 완료구간6~18의 정수가 필요합니다.'};
  if(!isRainfall())return {status:'invalid-mode',reason:'강우 정적 또는 시간대피 모드를 먼저 선택하세요.'};
  $('historyStation').value=episodeId;$('historyCursor').value=String(cursor);$('rainSource').value='history';const state=await restartLive();
  if(state.status==='cancelled'||$('rainSource').value!=='history'||$('historyStation').value!==episodeId||Number($('historyCursor').value)!==cursor)return {status:'cancelled'};
  return {...state,valid:rainResult.valid,resultId:rainResult.id,history:rainResult.history};
 }
 function renderHistory(){
  const h=rainResult?.history,isHistory=$('rainSource').value==='history';$('rainHistoryControls').hidden=!isRainfall()||!isHistory;
  if(!isHistory)return;$('historyStatus').textContent=historyState.reason;
  if(!h?.valid){$('historySummary').textContent=h?.reason||rainResult.reason||'과거 관측 자료 미확인';$('historyCurrentTime').textContent='산정 시각 미확인';$('historySequence').textContent='유효한 연속10분 관측이 없어 이력 적분을 중단합니다.';$('historyWarmStart').textContent='재생 시작 조건과 마지막 구간 직전 저류 미산정';return;}
  const f=n=>Number.isFinite(n)?n.toFixed(2):'미확인',c=h.totals;
  $('historyCurrentTime').textContent=h.cursor+'/18구간 완료 · '+h.observedEndAt+' (KST)';
  $('historySummary').textContent=`${h.stationName} ${h.stationId} · 과거 점관측 ${h.startAt} → ${h.observedEndAt}. 누적 ${f(c.rainfallTotalMm)}mm를10분씩 순서 적분했습니다. 마지막10분 ${f(h.lastBinIntensityMmH/6)}mm → 구간 내 일정 ${f(h.lastBinIntensityMmH)}mm/h 가정. 현재 강우·유역 대표강우·관측 침수 아님.`;
  $('historySummary').textContent+=` 동일한 직전60분 총량·동일 구간시작 저류에서 일정 평균강도 가정의 상대수위는 ${h.comparisonRolling60.uniformStageM.toFixed(3)}m,10분 순서 적분은 ${h.comparisonRolling60.sequentialStageM.toFixed(3)}m입니다. 둘 다 미보정 모형 비교입니다.`;
  $('historySequence').textContent=h.sequence.map(b=>b.startAt.slice(11,16)+'–'+b.endAt.slice(11,16)+' '+b.amountMm+'mm').join(' → ');
  $('historyWarmStart').textContent=`재생 시작의 사용자 가정 초기저류 ${f(h.userInitialStorageM3)}m³ → 이력으로 계산한 마지막10분 직전 저류 ${f(h.derivedLastBinInitialStorageM3)}m³. 전체 재생 수지: 초기 ${f(c.initialStorageM3)} + 강우유출 ${f(c.inputRunoffM3)} + 상류추가 ${f(c.inputUpstreamExcessM3)} + 측방추가 ${f(c.inputLateralExcessM3)} − 배출 ${f(c.drainedM3)} = 현재 잔류 ${f(c.storageM3)}m³ (잔차 ${f(c.massBalanceResidualM3)}m³). 실제 초기저류 측정값이 아닙니다.`;
 }

 $('rainModelParams').textContent='미보정 가정 저류: dS/dt=C×I×A/3,600,000+상류 추가유입+측방 추가유입−배수비율×S/900. 상대수위=S/22,000; 수심=max(0,상대수위−기존 가정보행여유고). 배수0은 정확 선형누적, 양수는 구간별 지수해석. 기여면적은 전체 유역의 실측 대표값이 아닙니다. 상류는 평상시 기준 대비 추가유입이며 유지용수 전체를 자동 가산하지 않습니다. 측방은 강우유출항에 포함되지 않은 추가유입만 가정합니다. 하류 수위·배수문·역류 및 공간별 유속 계산 없음. 여유고·시설·위험 판정은 기존 시제품과 같으며 실제 지형 표고·보정 수리/현장안전이 아닙니다.';
 $('rainSource').addEventListener('change',restartLive);$('refreshLiveRain').addEventListener('click',refreshLive);$('evacMode').addEventListener('change',restartLive);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&isRainfall()&&$('rainSource').value==='live'){recompute();refreshLive();}});
 window.addEventListener('pagehide',()=>{requestSerial++;liveController?.abort();historyController?.abort();clearInterval(pollTimer);pollTimer=null;});
 window.addEventListener('pageshow',event=>{if(event.persisted)restartLive();});
 for(const item of temporalFixtures.scenarios){const option=document.createElement('option');option.value=item.id;option.textContent=item.label;$('temporalScenario').append(option)}
 for(const profile of Object.values(STUDY_PROFILES)){const option=document.createElement('option');option.value=profile.id;option.textContent=profile.label;$('mobilityProfile').append(option)}
 const scopeBox=$('temporalScope');for(const text of ['기술 적용 범위 선정 · 기관 승인·현장 검증 아님','모든 공공 보행 이용자의 요구를 다루기 위한 조건 연구입니다. 특정 나이·장애 여부로 속도나 계단 가능성을 자동 추정하지 않습니다.','현장 운영 자료 미연결. 현재 open/폐쇄는 합성 설정이며 실제 진입 통제와 대피방향 차단은 별개입니다.']){const p=document.createElement('p');p.textContent=text;scopeBox.append(p)}
 const scopeRecord=document.createElement('output');scopeRecord.id='evacuationScopeDiagnostics';scopeRecord.hidden=true;scopeRecord.textContent=JSON.stringify(evacuationScope);scopeBox.append(scopeRecord);
 for(const text of [evacuationScope.summary,...(evacuationScope.limitations||[])])if(typeof text==='string'){const p=document.createElement('p');p.textContent=text;scopeBox.append(p)}
 for(const item of evacuationScope.sourceURLs||[]){const url=typeof item==='string'?item:item.url;if(typeof url==='string'&&url.startsWith('https://')){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noreferrer';link.textContent=(item.title||item.label||'적용 범위 공식 근거')+' ↗';scopeBox.append(link)}}
 for(const scenario of fixtures.scenarios){const option=document.createElement('option');option.value=scenario.id;option.textContent=scenario.label;$('floodScenario').append(option)}
 for(const start of graph.starts){const option=document.createElement('option');option.value=start.id;option.textContent=start.label;$('evacStart').append(option)}
 // Start with a central location to reveal the route/blocked-route difference clearly.
 if(graph.starts[2])$('evacStart').value=graph.starts[2].id;
 for(const exit of graph.exits){const label=document.createElement('label');label.className='exit-toggle';const input=document.createElement('input');input.type='checkbox';input.value=exit.id;input.setAttribute('aria-label',exit.name+' 대피방향 합성 차단');input.addEventListener('change',recompute);const span=document.createElement('span');span.textContent=exit.name+' · '+(exit.bank==='north'?'북안':'남안');label.append(input,span);$('exitClosures').append(label)}
 const diagnostic=document.createElement('output');diagnostic.id='floodDiagnostics';diagnostic.hidden=true;$('stage').append(diagnostic);
 function clearRoute(){for(const mesh of [routeMesh,routeOutline])if(mesh){routeLayer.remove(mesh);mesh.geometry.dispose()}routeMesh=null;routeOutline=null;routePoints=[];fitBounds=null;arrivalMarker.visible=false;arrivalLabel.hidden=true}
 function drawRoute(){
  clearRoute();const start=nodeMap.get($('evacStart').value);if(start)startMarker.position.set(start.point[0],-.75,start.point[1]);
  if(route.status!=='route'||route.path.length<2)return;
  const points=[];for(let i=0;i<route.path.length;i++){
   const node=route.path[i];if(i){const edge=graph.edges.find(e=>e.id===route.edgeIds[i-1]);if(edge.kind==='stairs'&&edge.path?.length>2){const path=edge.a===route.path[i-1].id?edge.path:[...edge.path].reverse(),lengths=[0];for(let k=1;k<path.length;k++)lengths.push(lengths.at(-1)+Math.hypot(path[k][0]-path[k-1][0],path[k][1]-path[k-1][1]));for(let k=1;k<path.length-1;k++){const t=lengths.at(-1)>0?lengths[k]/lengths.at(-1):k/(path.length-1),y=route.path[i-1].elevation+(node.elevation-route.path[i-1].elevation)*t;points.push(new THREE.Vector3(path[k][0],y+.65,path[k][1]))}}}
   points.push(new THREE.Vector3(node.point[0],node.elevation+.65,node.point[1]));
  }
  const curve=new THREE.CurvePath();for(let i=1;i<points.length;i++)if(points[i].distanceTo(points[i-1])>.001)curve.add(new THREE.LineCurve3(points[i-1],points[i]));if(!curve.curves.length)return;
  routePoints=points.map(p=>p.toArray());fitBounds=routeFitBounds([...routePoints,startMarker.position.toArray(),route.path.at(-1).point.length===2?[route.path.at(-1).point[0],route.path.at(-1).elevation+2,route.path.at(-1).point[1]]:routePoints.at(-1)]);
  const end=route.path.at(-1);arrivalMarker.position.set(end.point[0],end.elevation+2,end.point[1]);arrivalMarker.visible=true;
  routeOutline=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(24,points.length*4),1.05,7,false),routeOutlineMaterial);routeOutline.renderOrder=4;routeLayer.add(routeOutline);
  routeMesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(24,points.length*4),.65,7,false),routeMaterial);routeMesh.position.y=.72;routeMesh.renderOrder=5;routeLayer.add(routeMesh);
 }
 function routeFooter(){if(isRainTime())return route.status==='route'?`시간 대피 ${clock(route.departureSeconds)} → ${clock(route.arrivalSeconds)} · ${Math.round(route.lengthM)}m · ${route.exit.name}`:'시간 대피 경로 없음 · '+(route.reason||'미확인');if(isRainfall())return route.status==='route'?`시제품 위험가중 경로 ${Math.round(route.lengthM)}m · 비용 ${Math.round(route.costM)}m · ${route.exit.name} · 현장 미검증`:'현재 강우 조건의 경로 없음 · '+(route.reason||'미확인');return route.status==='route'?(isTemporal()?`합성 도착 ${route.arrivalSeconds}초 · ${Math.round(route.lengthM)}m · `:`가정 최단 ${Math.round(route.lengthM)}m · `)+route.exit.name+' · 현장 미검증':'가정 경로 미산출 · 실제 운영·무단차 연결은 별도 확인 필요'}
 function temporalHazard(edge){const time=Number($('temporalViewTime').value),state=temporalStateAt(temporalScenario.edgeSeries[edge.id],time,temporalScenario.horizonSeconds);if(state.unknown)return {code:'unknown',color:'#7d8998'};if(state.depthM>0)return edgeHazard(edge,{edgeStates:{[edge.id]:{depthM:state.depthM}}});if(state.blocked)return {code:'closed',color:'#865d9e'};return {code:'dry',color:'#16866a'}}
 function recompute(){
  facilityContext=selectedFacilityContext();
  const hazardPolicy=selectedHazardPolicy(),legacyPolicy=hazardPolicy.id==='legacy-depth';
  $('hazardVelocityMode').disabled=legacyPolicy;$('hazardVelocityRow').hidden=legacyPolicy||hazardPolicy.velocityMode!=='assumed-constant';$('hazardVelocityMps').disabled=legacyPolicy||hazardPolicy.velocityMode!=='assumed-constant';
  $('hazardPolicySummary').textContent=legacyPolicy?'이전 수심 전용 시연: 0m 초록, 0~0.25m 미만 노랑, 0.25m 이상 빨강. 문헌 수심·유속 분류 적용 전 비교용입니다.':!hazardPolicy.valid?'가정 유속 입력 오류 · 모든 구간 미확인·차단. 0 이상 유한한 m/s 값을 입력하세요.':hazardPolicy.velocityMode==='missing'?'선택: NSW/AIDR 일반취약성 + 자체 보수적 묶음. 유속 자료 없음 → 양의 수심은 회색·차단. 모형 수심0만 초록입니다.':`선택: NSW/AIDR 일반취약성 + 자체 보수적 묶음. 전 구간 일정 유속 ${hazardPolicy.assumedVelocityMps}m/s는 사용자 가정입니다. H1 노랑·비용×3, H2~H6 빨강·차단. 실제 유속·현장 안전 아님.`;
  const closedExitIds=[...$('exitClosures').querySelectorAll('input:checked')].map(el=>el.value);
  const temporal=isTemporal(),rainfall=isRainfall();$('boundaryControls').hidden=!rainfall;$('facilityControls').hidden=!rainfall;$('rainTimeControls').hidden=!isRainTime();$('temporalControls').hidden=!temporal;$('staticScenarioControls').hidden=temporal||rainfall;$('staticImportDetails').hidden=temporal||rainfall;if($('rainfallControls'))$('rainfallControls').hidden=!rainfall;
  $('rainHistoryControls').hidden=!rainfall||$('rainSource').value!=='history';
  const manualRainInputRow=$('rainfallIntensity').closest('.flood-number-row');if(manualRainInputRow)manualRainInputRow.hidden=$('rainSource').value!=='manual';
  $('rainfallIntensity').disabled=$('rainSource').value!=='manual';$('rainfallDuration').disabled=$('rainSource').value!=='manual';$('refreshLiveRain').disabled=$('rainSource').value!=='live';
  if(rainfall){rainResult=currentRainResult();rainDisplayResult=rainResult;if(isRainTime())timedRain(closedExitIds);else route=findRainfallRoute(graph,rainResult,$('evacStart').value,{closedExitIds,facilityContext});renderFacilities(closedExitIds);renderBoundary();renderHistory();const calc=rainResult.calculation,obs=liveState.observation;
   $('rainfallInputState').textContent=rainResult.valid&&rainResult.history?.valid?`과거10분 순서 관측 재생 ${rainResult.history.observedEndAt} → 근사 침수·색상·경로 계산 · 실시간 아님`:rainResult.valid?`입력 ${rainResult.rainfall.intensityMmH} mm/h × ${rainResult.rainfall.durationMinutes}분 → 근사 침수·색상·경로 재계산`:(rainResult.reason||'강우 입력을 확인하세요.');
   $('rainModelSummary').textContent=calc?`가정 유입 ${calc.inflowM3s.toFixed(2)}m³/s · 저류 ${Math.round(calc.storageM3)}m³ · 가정 상대수위 ${calc.stageM.toFixed(3)}m. 실제 하천 수위·예측 침수심 아님.`:'유효한 강우가 없어 지도는 회색, 경로는 산출하지 않습니다.';
   $('liveRainState').textContent=$('rainSource').value==='history'?'과거 서울시 점관측 재생 · 기상청 현재 인증수신 아님':$('rainSource').value==='manual'?'수동 강우 시연 · 기상청 실시간 관측 아님':liveState.status==='ready'?`관측 ${obs.stationName||obs.stationId} · ${obs.observedAt} · 직전60분 ${obs.rainfall60mMm}mm · 자료나이 ${liveState.ageMinutes.toFixed(1)}분`:liveState.reason;
   $('rainSourceInfo').textContent=$('rainSource').value==='history'?'서울시 OA-1168 보존 자료의 각10분 완료구간을 순서대로 적분합니다. 관측량×6은 구간 내 일정강도 가정입니다. 미래15분은 마지막 강도에서 이어가는 시연 가정이며 실제 미래 관측·예보가 아닙니다. 지점 주소 불일치·현지 대표성은 미확정입니다.':$('rainSource').value==='manual'?'수동 강우를 일정 강도로 지속하는 실험입니다. 초기저류는 아래 경계 모드·입력값을 따릅니다.':'직전60분 누적 관측을 60분 평균강도로 환산해 재계산합니다. 같은 관측은 중복 적산하지 않습니다. 15분 초과·결측·오류는 미확인 처리합니다.';
  }
  else
  if(temporal){const profile=STUDY_PROFILES[$('mobilityProfile').value];$('assistanceConfirmed').disabled=!profile.requiresAssistance;$('temporalProfileBasis').textContent=`가정 속도: 평면 ${profile.walkMps}m/s · 계단 ${profile.stairsMps??'이용 제외'}${profile.stairsMps?'m/s':''} · 경사로 ${profile.rampMps}m/s. 연령 대표값 아님. 지원은 합성 가용 조건+확인 모두 필요.`;$('temporalViewTime').max=String(temporalScenario.horizonSeconds);$('departureDelay').max=String(temporalScenario.horizonSeconds);$('temporalTimeReadout').textContent=$('temporalViewTime').value+'초';route=findTemporalEvacuationRoute(graph,temporalScenario,$('evacStart').value,{profileId:profile.id,delaySeconds:$('departureDelay').value===''?NaN:Number($('departureDelay').value),closedExitIds,assistanceConfirmed:$('assistanceConfirmed').checked,requireScopeContract:true,scopeContract:evacuationScope})}
  else route=findEvacuationRoute(graph,current,$('evacStart').value,{closedExitIds});
  const hazardClasses={},hazardEdges={},counts={dry:0,wet:0,deep:0,unknown:0,closed:0};for(const range of buffers.ranges){const edge=graph.edges.find(e=>e.id===range.edgeId),hazard=rainfall?rainfallHazard(edge,rainDisplayResult):temporal?temporalHazard(edge):edgeHazard(edge,current),color=new THREE.Color(hazard.color);counts[hazard.code]++;if(rainfall){const category=hazard.classId||hazard.code;hazardClasses[category]=(hazardClasses[category]||0)+1;hazardEdges[edge.id]={code:hazard.code,classId:hazard.classId,depthM:hazard.depthM,velocityMps:hazard.velocityMps,depthVelocity:hazard.depthVelocity,blocked:hazard.blocked,reason:hazard.reason}}for(let i=0;i<range.vertexCount;i++)color.toArray(colors,(range.vertexOffset+i)*3)}geometry.attributes.color.needsUpdate=true;overlayStats.colorUpdates++;
  $('floodMapState').textContent=rainfall?(rainResult.valid?'강우 기반 근사 침수 · 시제품 상대등급':'강우 미확인 · 현재 위험도 산정 안 함'):(temporal?temporalScenario.label:current.label)+' · 강우에서 계산한 결과 아님';
  $('floodSource').textContent=rainfall?rainResult.source:temporal?'합성 시간 실험 · 실제 침수 예측·운영 정보 아님':'합성 실험 입력 · '+current.source;
  $('floodCount').textContent=rainfall?`건조(모형) ${counts.dry} · 주의 ${counts.wet} · 위험 ${counts.deep} · 미확인 ${counts.unknown}개 보행구간`:`건조 ${counts.dry} · 침수 ${counts.wet} · 깊은 침수 ${counts.deep} · 대피방향 차단 ${counts.closed} · 결측 ${counts.unknown}개 구간`;
  $('evacState').dataset.status=route.status;
  const stepFree=temporal&&STUDY_PROFILES[$('mobilityProfile').value].requiresStepFree;
  $('evacState').textContent=isRainTime()?(route.status==='route'?'이동 전구간 검사 · 시간 대피경로':route.status==='outside-horizon'?'15분 계산 범위 안에서 경로 미산출':route.status==='origin-blocked'?'출발 대기 중 위험 · 경로 없음':route.status==='insufficient-data'?'시간별 자료 부족 · 경로 없음':route.status==='no-route'?'조건 내 통과 경로 없음':'입력 확인 · 경로 없음'):rainfall?(route.status==='route'?'시제품 조건 내 위험가중 최적 경로':route.status==='origin-blocked'?'출발점 위험 · 경로 없음':route.status==='insufficient-data'?'강우·침수 미확인 · 경로 없음':route.status==='no-route'?'통과 가능한 경로 없음':'입력 오류 · 경로 없음'):route.status==='route'?(temporal?'합성 시간망 내 최소 도착 경로':'가정 그래프 내 경로 산출'):route.status==='invalid-scope'?'범위 계약 불일치 · 시간 경로 산출 중단':route.status==='assistance-unconfirmed'?'도움 가용·확인 부족 · 경로 보류':route.status==='origin-blocked'?'출발 대기 중 시작점 차단':route.status==='no-route'?(stepFree?'등록망의 무단차 연결 미충족 · 현장 부재 아님':'경로 없음 · 합성 조건에서 연결 불가'):route.status==='insufficient-data'?'자료 부족 · 경로를 확인할 수 없음':'입력 오류 · 경로를 산출하지 않음';
  $('evacExit').textContent=route.exit?.name||'—';$('evacDistance').textContent=Number.isFinite(route.lengthM)?Math.round(route.lengthM)+' m':'—';
  $('evacArrival').textContent=isRainTime()?(route.status==='route'?`${clock(route.arrivalSeconds)} · 출발 후 ${route.travelSeconds}초`:'—'):rainfall?'강우 정적 근사 · 도착시간 미산정':temporal&&Number.isFinite(route.arrivalSeconds)?`${route.arrivalSeconds}초 · 이동 ${route.travelSeconds}초`:temporal?'—':'정적 모드 · 시간 미산정';
  $('temporalClockRelation').textContent=temporal&&route.status==='route'?`경로 출발 ${route.departureSeconds}초 → 도착 ${route.arrivalSeconds}초. `+(Number($('temporalViewTime').value)>route.arrivalSeconds?'지도는 경로 도착 이후의 침수 상태를 표시합니다.':'지도 표시시각과 출발 지연은 별개 조건입니다.'):'시간·이동 조건을 충족하는 경로만 표시합니다.';
  $('evacDetail').textContent=route.errors?.join(' / ')||route.reason||(temporal?'검사 중 제외 사유 횟수: '+Object.entries(route.rejectionCounts||{}).filter(([,n])=>n).map(([k,n])=>({inundated:'침수','egress-closed':'대피 차단',unknown:'결측','outside-data':'시간 범위 밖','accessibility-unknown':'접근성 미확인','stairs-disallowed':'계단 제외'}[k]||k)+' '+n).join(' · '):`침수·결측 제외 ${route.blockedEdges}개 간선 (결측 ${route.unknownEdges}) · 합성 차단 ${closedExitIds.length}개 출구`);
  $('routeText').textContent=routeFooter();
  $('waterChip').textContent=isRainfall()?(rainResult.valid?'강우 → 근사 침수 · 시제품':'강우 미확인 · 위험도 미산정'):'합성 침수 실험 · 강우 연계 전';
  drawRoute();
  $('fitEvacRoute').disabled=!fitBounds;$('fitRouteStatus').textContent=fitBounds?'출발·계단·도착점을 모두 포함 · 실제 안전 미검증':'경로가 없어 전체 경로 보기를 사용할 수 없습니다.';
  areaUI.update({result:rainfall?rainDisplayResult:null,timeline:isRainTime()?rainTimeline:null,mapTimeSeconds:isRainTime()?Number($('rainTimeView').value):0,rainfall,route,startId:$('evacStart').value,panelVisible:shell.panel==='flood'});
  diagnostic.textContent=JSON.stringify({version:'final-preview',boundaryApplication:BOUNDARY_APPLICATION,boundaryContext:rainfall?selectedBoundaryContext():null,effectiveBoundaryContext:rainfall?rainResult.boundary:null,historyApplication:HISTORY_APPLICATION,history:rainfall&&$('rainSource').value==='history'?{state:historyState,replay:rainResult.history}:null,inundationArea:areaUI.diagnostics(),facilityApplication:rainfall?{...FACILITY_APPLICATION,inventory:facilityInventory,contextKey:facilityContext.key,mode:facilityContext.mode,scenario:facilityContext.scenario,mapStates:facilityStates}:null,mode:isRainTime()?'rain-time':rainfall?'rainfall':temporal?'temporal':'static',scopeValidation,hazardApplication:rainfall?{...HAZARD_APPLICATION,policy:hazardPolicy,classCounts:hazardClasses,edges:hazardEdges}:null,schema:graph.schema,provenance:rainfall?rainResult.provenance:temporal?'synthetic-study':current.provenance,scenario:rainfall?rainResult.id:temporal?temporalScenario.id:current.id,mapTimeSeconds:isRainTime()?Number($('rainTimeView').value):temporal?Number($('temporalViewTime').value):null,rainfallToFloodCalculated:rainfall&&rainResult.valid,hydraulicCalibrationValidated:false,result:rainfall?rainDisplayResult:null,currentRainResult:rainfall?rainResult:null,timeStudy:isRainTime()?{valid:rainTimeline?.valid,profile:rainTimeline?.profile,freezeInitialState:rainTimeline?.freezeInitialState,predictionBasis:rainTimeline?.predictionBasis,horizonSeconds:rainTimeline?.horizonSeconds,cacheBuilds:timeCache.builds,routeCalculations:timeCache.routeCalculations,cpu:{buildMs:timeCache.buildMs,routeMs:timeCache.routeMs},stages:rainTimeline?.results.filter(s=>s.atSeconds%60===0).map(s=>({seconds:s.atSeconds,stageM:s.result.calculation.stageM})),mapTimeSeconds:Number($('rainTimeView').value)}:null,modelparameters:rainfall?rainResult.model:null,live:rainfall&&$('rainSource').value==='live'?liveState:null,actualSafetyVerified:false,graph:{id:graph.id,nodes:graph.nodes.length,edges:graph.edges.length,exits:graph.exits,rejectedExits:graph.rejectedExits,config:graph.config},startId:$('evacStart').value,closedExitIds,counts,route,importState,overlayBatching:overlayStats,routeFit:{bounds:fitBounds,points:routePoints}});
  document.dispatchEvent(new CustomEvent('cheonggye:analysis',{detail:JSON.parse(diagnostic.textContent)}));
  if($('stage').classList.contains('route-fit-mode')){if(fitBounds)onFitRoute(fitBounds);else $('stage').classList.remove('route-fit-mode')}
 }
 for(const id of ['evacMode','mobilityProfile','departureDelay','assistanceConfirmed','temporalViewTime'])$(id).addEventListener(id==='temporalViewTime'||id==='departureDelay'?'input':'change',recompute);
 $('historyStation').addEventListener('change',recompute);$('historyCursor').addEventListener('input',recompute);
 for(const id of ['boundaryMode','boundaryAreaHa','boundaryRunoff','boundaryUpstream','boundaryLateral','boundaryDrainagePct','boundaryInitialStorage'])$(id).addEventListener(id==='boundaryMode'?'change':'input',recompute);
 for(const id of ['facilityMode','facilityScenario','minModelWidthM','maxModelGradePct','requireStepFree'])$(id).addEventListener(['minModelWidthM','maxModelGradePct'].includes(id)?'input':'change',recompute);
 for(const id of ['hazardPolicy','hazardVelocityMode','hazardVelocityMps'])$(id).addEventListener(id==='hazardVelocityMps'?'input':'change',recompute);
 $('temporalScenario').addEventListener('change',()=>{temporalScenario=temporalFixtures.scenarios.find(s=>s.id===$('temporalScenario').value);$('temporalViewTime').value='0';recompute()});
 $('floodScenario').addEventListener('change',()=>{const selected=$('floodScenario').value;if(selected===importOptionValue&&importedResult){current=importedResult;importState='accepted-structure-only'}else{const fixture=fixtures.scenarios.find(s=>s.id===selected);if(!fixture)return;current=fixture;importState='none';importedResult=null;$('floodScenario').querySelector('option[data-imported]')?.remove()}$('floodImportStatus').textContent='';recompute()});
 $('evacStart').addEventListener('change',recompute);
 $('focusEvacStart').addEventListener('click',()=>{const node=nodeMap.get($('evacStart').value);if(node){onFocus(node.point);shell.showMap()}});
 $('fitEvacRoute').addEventListener('click',()=>{if(fitBounds){shell.showMap();onFitRoute(fitBounds)}});
 $('resetExitClosures').addEventListener('click',()=>{$('exitClosures').querySelectorAll('input').forEach(el=>el.checked=false);recompute()});
 $('showFloodOverlay').addEventListener('change',()=>syncVisible());
 function syncVisible(){const visible=shell.panel==='flood';areaUI.setVisible(visible);overlay.visible=visible&&$('showFloodOverlay').checked;routeLayer.visible=visible;document.querySelector('.flood-inset-key').hidden=!visible;if(!visible)$('stage').classList.remove('route-fit-mode');if(visible){onReturnToFlood?.();$('waterChip').textContent=isRainfall()?(rainResult.valid?'강우 → 근사 침수 · 시제품':'강우 미확인 · 위험도 미산정'):'합성 침수 실험 · 강우 연계 전';$('routeText').textContent=routeFooter()}else $('routeText').textContent='침수 색상·조건부 경로는 침수·대피 탭에서 표시합니다.'}
 document.addEventListener('cheonggye:panelchange',syncVisible);
 $('rainfallIntensity').addEventListener('input',rainSummary);$('rainfallDuration').addEventListener('input',rainSummary);
 function rainSummary(){if(isRainfall())recompute();else $('rainfallInputState').textContent='강우 연결은 실시간 강우 시제품 모드에서 계산합니다.';}
 $('downloadFloodTemplate').addEventListener('click',()=>{const result={schema:graph.schema,graphId:graph.id,id:'external-result',label:'외부 침수 결과',provenance:'synthetic',source:'합성 실험 입력 · 실제 수리모형 결과 아님',notHydraulicPrediction:true,rainfall:null,rainfallLinkageValidated:false,scenarioTimeSeconds:null,coordinateBasis:{horizontal:'scene_precision_v5-local-xz-m',vertical:'assumed-walkway-y-minus3-m-not-datum'},edgeStates:Object.fromEntries(graph.edges.map(e=>[e.id,{depthM:null,velocityMps:null}]))};const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='cheonggye-flood-edge-template.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
 $('floodImport').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('최대 2MB까지 입력할 수 있습니다.');const parsed=JSON.parse(await file.text()),valid=validateFloodResult(parsed,graph);if(!valid.valid)throw Error(valid.errors.slice(0,4).join(' / '));parsed.label=typeof parsed.label==='string'?parsed.label:'입력한 합성 결과';parsed.id=importOptionValue;current=parsed;importedResult=parsed;let option=$('floodScenario').querySelector('option[data-imported]');if(!option){option=document.createElement('option');option.value=importOptionValue;option.dataset.imported='true';$('floodScenario').append(option)}option.textContent='입력한 합성 결과: '+parsed.label;$('floodScenario').value=importOptionValue;importState='accepted-structure-only';$('floodImportStatus').textContent='입력 형식 확인 완료 · 수리 정확성/현장 안전성 검증 아님';recompute()}catch(error){importState='rejected';$('floodImportStatus').textContent='입력 거부 · 이전 침수 입력과 경로를 유지합니다. '+error.message;recompute()}finally{event.target.value=''}});
 rainSummary();recompute();syncVisible();restartLive();
 return {graph,setHistoricalReplay,frame(camera){for(const [label,marker]of [[startLabel,startMarker],[arrivalLabel,arrivalMarker]]){const visible=routeLayer.visible&&marker.visible;label.hidden=!visible;if(!visible)continue;const p=marker.position.clone().project(camera);label.hidden=p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1;label.style.left=((p.x+1)*.5*$('stage').clientWidth)+'px';label.style.top=((-p.y+1)*.5*$('stage').clientHeight)+'px'}},get state(){return {boundaryContext:selectedBoundaryContext(),effectiveBoundaryContext:rainResult.boundary,history:rainResult.history,source:$('rainSource').value,inundationArea:areaUI.diagnostics(),mode:isRainTime()?'rain-time':isRainfall()?'rainfall':isTemporal()?'temporal':'static',scenario:isRainfall()?rainResult.id:isTemporal()?temporalScenario.id:current.id,routeStatus:route.status,rainfallToFloodCalculated:isRainfall()&&rainResult.valid,synthetic:!isRainfall(),hydraulicCalibrationValidated:false,facilityContextKey:facilityContext.key,facilityMode:facilityContext.mode,overlayBatching:overlayStats,routeFitBounds:fitBounds}}};
}

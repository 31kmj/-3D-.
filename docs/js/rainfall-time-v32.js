// Graduation prototype: assumed future rain and uncalibrated storage; not a weather forecast.
import {resolveBoundaryContext,integrateBoundaryStorage,validateBoundaryResult} from './boundary-rainfall-v32.js';
import {RAIN_MODEL, rainfallHazard, unknownRainResult} from './rainfall-prototype-v32.js';
import {resolveFacilityContext,evaluateFacilityExit} from './facility-conditions-v30.js';
import {resolveHazardPolicy} from './hazard-policy-v29.js';

export const RAIN_FUTURES=Object.freeze([
 Object.freeze({id:'steady',label:'현재 강우 유지 · 가정'}),
 Object.freeze({id:'rising',label:'1분 뒤 강우 3배 · 가정'}),
 Object.freeze({id:'falling',label:'1분 뒤 강우 중단 · 가정'})
]);
const SCHEMA='cheonggye-rain-time/1', EPS=1e-9;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function validGraph(g){
 if(!g||typeof g.id!=='string'||!g.id||!Array.isArray(g.nodes)||!g.nodes.length||g.nodes.length>5000||!Array.isArray(g.edges)||g.edges.length>5000||!Array.isArray(g.exits))return false;
 const ids=new Set(),edges=new Set(),exits=new Set();
 for(const n of g.nodes){if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id)||!Array.isArray(n.point)||n.point.length<2||!n.point.slice(0,2).every(finite))return false;ids.add(n.id)}
 for(const e of g.edges){if(!e||typeof e.id!=='string'||!e.id||edges.has(e.id)||!ids.has(e.a)||!ids.has(e.b)||!finite(e.lengthM)||e.lengthM<0||e.lengthM>1e7||!['walk','stairs','ramp','connector'].includes(e.kind))return false;edges.add(e.id)}
 for(const e of g.exits){if(!e||typeof e.id!=='string'||!e.id||exits.has(e.id)||!ids.has(e.nodeId))return false;exits.add(e.id)}
 return true;
}
function validInitial(g,r){const states=m=>m&&typeof m==='object'&&!Array.isArray(m)&&Object.values(m).every(s=>s&&typeof s==='object'&&(s.depthM===null||finite(s.depthM)&&s.depthM>=0&&s.depthM<=1e8)&&(s.freeboardM===null||finite(s.freeboardM)&&s.freeboardM>=0&&s.freeboardM<=100));return validateBoundaryResult(r)&&r.schema==='cheonggye-rain-prototype/1'&&r.graphId===g.id&&['manual-rainfall-prototype','observed-rainfall-prototype'].includes(r.provenance)&&finite(r.rainfall?.intensityMmH)&&r.rainfall.intensityMmH>=0&&r.rainfall.intensityMmH<=500&&finite(r.calculation?.storageM3)&&r.calculation.storageM3>=0&&finite(r.calculation?.stageM)&&Math.abs(r.calculation.storageM3/RAIN_MODEL.storageAreaM2-r.calculation.stageM)<EPS&&states(r.edgeStates)&&states(r.nodeStates)}
function intensityAt(t,seconds){const i=t.initialResult.rainfall.intensityMmH;return seconds<60||t.profile==='steady'?i:t.profile==='rising'?Math.min(500,3*i):0}
function advance(t,storage,intensity,seconds){return integrateBoundaryStorage(t.boundary,intensity,seconds,storage).storageM3}
function resultAtStorage(t,storage,seconds){
 const initial=t.initialResult,b=t.boundary,first=integrateBoundaryStorage(b,initial.rainfall.intensityMmH,Math.min(60,seconds),initial.calculation.storageM3),second=integrateBoundaryStorage(b,intensityAt(t,60),Math.max(0,seconds-60),first.storageM3),prior=initial.calculation;
 const futureInputRunoffM3=first.inputRunoffM3+second.inputRunoffM3,futureInputUpstreamExcessM3=first.inputUpstreamExcessM3+second.inputUpstreamExcessM3,futureInputLateralExcessM3=first.inputLateralExcessM3+second.inputLateralExcessM3,futureInputTotalM3=futureInputRunoffM3+futureInputUpstreamExcessM3+futureInputLateralExcessM3,inputRunoffM3=prior.inputRunoffM3+futureInputRunoffM3,inputUpstreamExcessM3=prior.inputUpstreamExcessM3+futureInputUpstreamExcessM3,inputLateralExcessM3=prior.inputLateralExcessM3+futureInputLateralExcessM3,inputTotalM3=prior.inputTotalM3+futureInputTotalM3;
 if(b.mode!=='legacy')storage=b.drainageFactor===0?b.initialStorageM3+inputTotalM3:second.storageM3;
 const stageM=storage/b.storageAreaM2,drainedM3=b.drainageFactor===0?0:Math.max(0,b.initialStorageM3+inputTotalM3-storage);
 const adapt=states=>Object.fromEntries(Object.entries(states).map(([id,s])=>[id,{...s,depthM:finite(s?.freeboardM)&&s.freeboardM>=0?Math.max(0,stageM-s.freeboardM):null}]));
 const current=intensityAt(t,seconds),flow=integrateBoundaryStorage(b,current,0);
 return {...initial,id:`${initial.id}:future:${t.profile}:${seconds}`,label:initial.history?.valid?'과거 관측 끝시점에서 가정한 미래 침수 · 현재 실시간 아님':'가정 미래 강우·경계 기반 근사 침수 시제품',source:initial.history?.valid?'서울시 과거10분 관측 이후 가정 미래 강우·추가유입·배수 + 미보정 저류 모형 · 실시간 아님':'현재 강우 입력 + 가정 미래 강우·추가유입·배수 + 미보정 저류 모형',futureAtSeconds:seconds,predictionBasis:t.predictionBasis,rainfall:{...initial.rainfall,intensityMmH:current,futureRainfallAssumed:true},calculation:{...prior,inflowM3s:flow.inflowM3s,runoffInflowM3s:flow.runoffInflowM3s,storageM3:storage,stageM,durationSeconds:prior.durationSeconds+seconds,elapsedFutureSeconds:seconds,inputRunoffM3,inputUpstreamExcessM3,inputLateralExcessM3,inputTotalM3,drainedM3,futureInputRunoffM3,futureInputUpstreamExcessM3,futureInputLateralExcessM3,futureInputTotalM3,futureDrainedM3:b.drainageFactor===0?0:Math.max(0,prior.storageM3+futureInputTotalM3-storage),massBalanceResidualM3:b.initialStorageM3+inputTotalM3-storage-drainedM3},edgeStates:adapt(initial.edgeStates),nodeStates:adapt(initial.nodeStates),hydraulicCalibrationValidated:false,rainfallLinkageValidated:false};
}
function validBoundaryTimeline(t){
 const b=resolveBoundaryContext(t?.boundary),policy=resolveHazardPolicy(t?.initialResult?.hazardPolicy).key;
 return b.valid&&t.boundaryContextKey===b.key&&t.tickSeconds===5&&Number.isInteger(t.horizonSeconds)&&t.horizonSeconds>=5&&t.horizonSeconds<=1800&&t.horizonSeconds%5===0&&typeof t.freezeInitialState==='boolean'&&RAIN_FUTURES.some(p=>p.id===t.profile)&&t.initialResult?.schema==='cheonggye-rain-prototype/1'&&t.initialResult.graphId===t.graphId&&t.initialResult.boundaryContextKey===b.key&&validateBoundaryResult(t.initialResult)&&Array.isArray(t.results)&&t.results.length===t.horizonSeconds/5+1&&t.results.every((e,i)=>e.atSeconds===i*5&&e.result?.graphId===t.graphId&&e.result?.schema==='cheonggye-rain-prototype/1'&&e.result?.boundaryContextKey===b.key&&validateBoundaryResult(e.result)&&resolveHazardPolicy(e.result.hazardPolicy).key===policy&&e.result.id===(i===0||t.freezeInitialState?t.initialResult.id:`${t.initialResult.id}:future:${t.profile}:${e.atSeconds}`));
}

export function buildRainTimeline(graph,initialResult,{profile='steady',horizonSeconds=900,tickSeconds=5,freezeInitialState=false,boundaryContext}={}){
 const boundary=resolveBoundaryContext(boundaryContext===undefined?initialResult?.boundary:boundaryContext);
 const base={boundary,boundaryContextKey:boundary.key,schema:SCHEMA,graphId:graph?.id,valid:false,initialResult,profile,horizonSeconds,tickSeconds,freezeInitialState,results:[],predictionBasis:freezeInitialState?'comparison-frozen-initial-state':'assumed-future-rainfall-not-official-forecast',provenance:initialResult?.provenance==='observed-rainfall-prototype'?'observed-rainfall-prototype-time':'manual-rainfall-prototype-time',hydraulicCalibrationValidated:false,rainfallLinkageValidated:false,continuousEvaluation:'exact piecewise-constant linear-storage solution; no snapshot rounding',profileSwitchSeconds:60};
 base.hazardPolicy=resolveHazardPolicy(initialResult?.hazardPolicy);base.policyKey=base.hazardPolicy.key;
 if(!validGraph(graph))return {...base,reason:'보행 그래프가 유효하지 않습니다.'};
 if(!boundary.valid||initialResult?.boundaryContextKey!==boundary.key)return {...base,reason:boundary.reason||'현재 강우와 미래 경계 조건이 다릅니다.'};
 if(!validInitial(graph,initialResult))return {...base,reason:initialResult?.reason||'현재 보행망과 일치하는 유효한 근사 강우 결과가 필요합니다.'};
 if(!RAIN_FUTURES.some(p=>p.id===profile)||typeof freezeInitialState!=='boolean'||tickSeconds!==5||!Number.isInteger(horizonSeconds)||horizonSeconds<5||horizonSeconds>1800||horizonSeconds%tickSeconds!==0)return {...base,reason:'가정 프로필·5초 격자·5~1800초 자료 범위를 확인하세요.'};
 const t={...base,valid:true};let storage=initialResult.calculation.storageM3;
 t.results.push({atSeconds:0,result:initialResult});
 for(let s=tickSeconds;s<=horizonSeconds;s+=tickSeconds){storage=advance(t,storage,intensityAt(t,s-tickSeconds),tickSeconds);t.results.push({atSeconds:s,result:freezeInitialState?initialResult:resultAtStorage(t,storage,s)})}
 return t;
}
export function rainResultAt(t,timeSeconds){
 if(!t?.valid||!validBoundaryTimeline(t)||t.schema!==SCHEMA||!finite(timeSeconds)||timeSeconds<0||timeSeconds>t.horizonSeconds)return unknownRainResult({id:t?.graphId},timeSeconds>t?.horizonSeconds?'가정 계산 시간 범위 밖입니다.':'시간별 강우 결과가 유효하지 않습니다.',t?.initialResult?.hazardPolicy,t?.boundary);
 if(timeSeconds===0||t.freezeInitialState)return t.initialResult;
 const index=Math.floor(timeSeconds/t.tickSeconds),entry=t.results[index];if(!entry)return unknownRainResult({id:t.graphId},'시간별 강우 결과가 없습니다.',t.initialResult?.hazardPolicy,t.boundary);
 if(entry.atSeconds===timeSeconds)return entry.result;
 return resultAtStorage(t,advance(t,entry.result.calculation.storageM3,intensityAt(t,entry.atSeconds),timeSeconds-entry.atSeconds),timeSeconds);
}
const empty=(status,reason,basis={},extra={})=>({status,reason,path:[],nodeIds:[],edgeIds:[],exit:null,lengthM:null,costSeconds:null,arrivalSeconds:null,travelSeconds:null,legs:[],actualSafetyVerified:false,hydraulicCalibrationValidated:false,...basis,...extra});
function prepare(graph,t){
 const n=t.results.length,edgeSeries=new Map(),incident=new Map(graph.nodes.map(x=>[x.id,[]]));
 for(const edge of graph.edges){const unknown=new Uint16Array(n+1),deep=new Uint16Array(n+1),wet=new Uint16Array(n+1);for(let i=0;i<n;i++){const code=rainfallHazard(edge,t.results[i].result).code;unknown[i+1]=unknown[i]+(code==='unknown');deep[i+1]=deep[i]+(code==='deep');wet[i+1]=wet[i]+(code==='wet')}edgeSeries.set(edge.id,{unknown,deep,wet});incident.get(edge.a).push(edge);if(edge.b!==edge.a)incident.get(edge.b).push(edge)}
 const range=(edgeId,start,end)=>{const s=edgeSeries.get(edgeId),lo=start/t.tickSeconds,hi=end/t.tickSeconds+1;if(s.unknown[hi]-s.unknown[lo])return 'unknown';if(s.deep[hi]-s.deep[lo])return 'deep';return s.wet[hi]-s.wet[lo]?'wet':'dry'};
 const atNode=(id,time)=>{const adjacent=incident.get(id),walk=adjacent.filter(e=>e.kind==='walk'),edges=walk.length?walk:adjacent;if(!edges.length)return 'unknown';let worst='dry';for(const e of edges){const code=range(e.id,time,time);if(code==='unknown')return code;if(code==='deep')worst='deep';else if(code==='wet'&&worst==='dry')worst='wet'}return worst};
 return {range,atNode,incident};
}
// The current registered network is a forest. Its unique simple path to each
// exit permits exact comparison without waiting, reversals or implicit loops.
export function findRainTimeRoute(graph,timeline,startId,{delaySeconds=0,closedExitIds=[],walkMps=1.5,stairsMps=.8,facilityContext=resolveFacilityContext()}={}){
 const basis={objective:'현재 비순환 등록망의 왕복 없는 단순경로 중 위험가중 실제이동시간 최소(초록×1, 노랑×3), 동률 빠른 도착·짧은 거리',departureSeconds:delaySeconds,tickSeconds:5,predictionBasis:timeline?.predictionBasis??'assumed-future-rainfall-not-official-forecast',resultId:timeline?.initialResult?.id,profile:timeline?.profile,waitingAllowed:false,cyclesAllowed:false,topologyScope:'forest-only'};
 basis.boundaryContextKey=timeline?.boundaryContextKey;
 basis.facilityContextKey=facilityContext.key;basis.facilityMode=facilityContext.mode;
 basis.hazardPolicy=resolveHazardPolicy(timeline?.initialResult?.hazardPolicy);basis.policyKey=basis.hazardPolicy.key;
 if(!validGraph(graph))return empty('invalid-graph','보행 그래프가 유효하지 않습니다.',basis);
 const parentSet=new Map(graph.nodes.map(n=>[n.id,n.id])),root=id=>{let p=id;while(parentSet.get(p)!==p)p=parentSet.get(p);while(parentSet.get(id)!==id){const next=parentSet.get(id);parentSet.set(id,p);id=next}return p};
 for(const edge of graph.edges){const a=root(edge.a),b=root(edge.b);if(a===b)return empty('unsupported-topology','순환 연결을 포함한 보행망은 이번 왕복 없는 경로 계산의 지원 범위 밖입니다.',basis);parentSet.set(a,b)}
 if(!timeline?.valid||!validBoundaryTimeline(timeline)||timeline.schema!==SCHEMA||timeline.graphId!==graph.id||timeline.tickSeconds!==5||!Array.isArray(timeline.results)||timeline.results.length!==timeline.horizonSeconds/5+1||!timeline.results.every((e,i)=>e.atSeconds===i*5&&e.result?.valid&&e.result.graphId===graph.id))return empty('insufficient-data',timeline?.reason||'현재 보행망과 일치하는 시간별 강우 결과가 없습니다.',basis);
 if(!timeline.results.every(e=>resolveHazardPolicy(e.result.hazardPolicy).key===basis.policyKey))return empty('insufficient-data','시간별 위험 분류 기준이 일치하지 않습니다. 같은 기준으로 다시 계산하세요.',basis);
 if(!finite(delaySeconds)||delaySeconds<0||delaySeconds%5!==0||!finite(walkMps)||walkMps<=0||walkMps>10||!finite(stairsMps)||stairsMps<=0||stairsMps>10||!Array.isArray(closedExitIds)||closedExitIds.some(id=>typeof id!=='string'))return empty('invalid-options','출발 지연은 0초 이상 5초 배수이며 유효한 이동속도와 출구 ID 목록이 필요합니다.',basis);
 if(delaySeconds>timeline.horizonSeconds)return empty('outside-horizon','출발 시각이 가정 계산 시간 범위 밖입니다.',basis);
 if(!facilityContext.valid)return empty('invalid-options',facilityContext.reason,basis);
 const nodes=new Map(graph.nodes.map(n=>[n.id,n]));if(!nodes.has(startId))return empty('invalid-start','출발점을 확인하세요.',basis);
 const closed=new Set(closedExitIds);if([...closed].some(id=>!graph.exits.some(e=>e.id===id)))return empty('invalid-options','등록되지 않은 차단 출구 ID입니다.',basis);
 const allowed=graph.exits.filter(e=>!closed.has(e.id)).sort((a,b)=>a.id.localeCompare(b.id)),rejectionCounts={unknown:0,deep:0,'outside-horizon':0},common={...basis,closedExits:closed.size,eligibleExits:allowed.length,rejectionCounts};
 if(!allowed.length)return empty('no-route','모든 등록 출구가 차단되었습니다.',common);
 const data=prepare(graph,timeline),record=code=>rejectionCounts[code]=(rejectionCounts[code]||0)+1;
 for(let s=0;s<=delaySeconds;s+=5){const code=data.atNode(startId,s);if(code==='unknown'||code==='deep')return empty(code==='unknown'?'insufficient-data':'origin-blocked','출발 대기 중 시작점이 '+(code==='unknown'?'미확인입니다.':'위험 구간에 포함됩니다.'),common,{blockedAtSeconds:s})}
 const adjacent=new Map(graph.nodes.map(n=>[n.id,[]]));for(const edge of [...graph.edges].sort((a,b)=>a.id.localeCompare(b.id))){adjacent.get(edge.a).push({edge,to:edge.b});adjacent.get(edge.b).push({edge,to:edge.a})}
 const previous=new Map(),seen=new Set([startId]),queue=[startId];for(let i=0;i<queue.length;i++)for(const item of adjacent.get(queue[i]))if(!seen.has(item.to)){seen.add(item.to);queue.push(item.to);previous.set(item.to,{node:queue[i],edge:item.edge})}
 let best=null,candidatePaths=0;const failedPaths=[],facilityCandidates=[];
 for(const exit of allowed){if(!seen.has(exit.nodeId))continue;candidatePaths++;const reversed=[];let n=exit.nodeId;while(previous.has(n)){const p=previous.get(n);reversed.unshift({edge:p.edge,from:p.node,to:n});n=p.node}
  let time=delaySeconds,cost=0,length=0,knownBlocked=false,unknown=false,outside=false;const legs=[],facilityChecks=[],path=[{...nodes.get(startId),atSeconds:time}];
  for(const {edge,from,to}of reversed){const actual=edge.lengthM/(edge.kind==='stairs'?stairsMps:walkMps),duration=edge.lengthM===0?0:Math.ceil(actual/5)*5,end=time+duration;let risk='unknown';
   if(time>timeline.horizonSeconds){outside=true;record('outside-horizon')}else{risk=data.range(edge.id,time,Math.min(end,timeline.horizonSeconds));if(risk==='deep'){knownBlocked=true;record('deep')}else if(risk==='unknown'){unknown=true;record('unknown')}if(end>timeline.horizonSeconds){outside=true;record('outside-horizon')}else{const nodeRisk=data.atNode(to,end);if(nodeRisk==='deep'){knownBlocked=true;record('deep')}else if(nodeRisk==='unknown'){unknown=true;record('unknown')}}}
   if(facilityContext.mode!=='off'&&edge.kind!=='walk'){
    const owner=graph.exits.find(e=>edge.id==='exit:'+e.id+':stairs'||edge.id==='exit:'+e.id+':connector');
    const check=evaluateFacilityExit(graph,owner,facilityContext,{result:rainResultAt(timeline,Math.min(time,timeline.horizonSeconds)),atSeconds:time,untilSeconds:end,closedExitIds});facilityChecks.push(check);
    if(check.blocked){if(check.knownBlocked){knownBlocked=true;record('facility-blocked')}else {unknown=true;record('facility-unknown')}}
   }
   const legCost=actual*(risk==='wet'?RAIN_MODEL.yellowCostMultiplier:1);legs.push({edgeId:edge.id,from,to,startSeconds:time,endSeconds:end,actualTravelSeconds:actual,maximumRisk:risk,costSeconds:legCost});cost+=legCost;length+=edge.lengthM;time=end;path.push({...nodes.get(to),atSeconds:time});
  }
  if(facilityContext.mode!=='off'&&!facilityChecks.some(c=>c.exitId===exit.id)){
   const check=evaluateFacilityExit(graph,exit,facilityContext,{result:rainResultAt(timeline,Math.min(time,timeline.horizonSeconds)),atSeconds:time,closedExitIds});facilityChecks.push(check);if(check.blocked){if(check.knownBlocked){knownBlocked=true;record('facility-blocked')}else{unknown=true;record('facility-unknown')}}
  }
  facilityCandidates.push({exitId:exit.id,name:exit.name,arrivalSeconds:time,checks:facilityChecks,blocked:knownBlocked||unknown||outside,unknown:unknown&&!knownBlocked,hydraulicOrHorizonBlocked:knownBlocked||outside,reasons:facilityChecks.flatMap(c=>c.reasons)});
  if(knownBlocked||unknown||outside){failedPaths.push(knownBlocked?(facilityChecks.some(c=>c.knownBlocked)?'facility-blocked':'deep'):unknown?'unknown':'outside-horizon');continue}
  const route={exit,path,legs,length,cost,time,facilityChecks};if(!best||cost<best.cost||cost===best.cost&&(time<best.time||time===best.time&&length<best.length))best=route;
 }
 const diagnostic={expanded:queue.length,candidatePaths,failedPaths,facilityCandidates};
 if(!best){const status=failedPaths.includes('unknown')?'insufficient-data':failedPaths.includes('outside-horizon')?'outside-horizon':'no-route';return empty(status,status==='insufficient-data'?'대피 후보의 미확인 구간 때문에 경로를 확인할 수 없습니다.':status==='outside-horizon'?'대피 후보가 가정 계산 시간 범위를 벗어납니다. 범위 이후는 미확인입니다.':'현재 수심·유속·모델 계단·대피방향 조건에서 왕복 없이 통과 가능한 경로가 없습니다.',common,diagnostic)}
 return {...empty('route','현재 비순환 등록망과 가정 미래 강우 안의 왕복 없는 계산 경로이며 실제 안전을 보장하지 않습니다.',common),path:best.path,nodeIds:best.path.map(n=>n.id),edgeIds:best.legs.map(l=>l.edgeId),exit:best.exit,lengthM:best.length,costSeconds:best.cost,arrivalSeconds:best.time,travelSeconds:best.time-delaySeconds,actualMovingSeconds:best.legs.reduce((sum,l)=>sum+l.actualTravelSeconds,0),legs:best.legs,selectedFacility:{exitId:best.exit.id,checks:best.facilityChecks},...diagnostic};
}

// Graduation prototype only: transparent assumed catchment/storage, not calibrated Cheonggye hydraulics.
import {BOUNDARY_APPLICATION,resolveBoundaryContext,integrateBoundaryStorage,validateBoundaryResult} from './boundary-rainfall-v32.js';
import {resolveHazardPolicy,appliedRainfallHazard} from './hazard-policy-v29.js';
export const RAIN_MODEL = Object.freeze({id:'assumed-linear-storage-v24',runoffCoefficient:.65,catchmentAreaM2:500000,responseSeconds:900,storageAreaM2:22000,initialStorageM3:0,freeboardMinM:.15,freeboardMaxM:.75,warningDepthM:.25,yellowCostMultiplier:3,calibrated:false});
export const RAIN_COLORS=Object.freeze({dry:'#16866a',wet:'#f4cb42',deep:'#dc5148',unknown:'#7d8998'});
const emptyRoute=(status,reason,extra={})=>({status,reason,path:[],nodeIds:[],edgeIds:[],exit:null,lengthM:null,costM:null,actualSafetyVerified:false,hydraulicCalibrationValidated:false,...extra});
export function validateRainInput(intensityMmH,durationMinutes){return typeof intensityMmH==='number'&&Number.isFinite(intensityMmH)&&intensityMmH>=0&&intensityMmH<=500&&typeof durationMinutes==='number'&&Number.isFinite(durationMinutes)&&durationMinutes>=1&&durationMinutes<=1440;}
export function assumedFreeboardM(ratio,bank){if(!Number.isFinite(ratio))return null;const p=Math.max(0,Math.min(1,ratio)),phase=bank==='south'?1.15:0;return RAIN_MODEL.freeboardMinM+(RAIN_MODEL.freeboardMaxM-RAIN_MODEL.freeboardMinM)*(.5+.5*Math.sin(2*Math.PI*p+phase));}
function graphValid(graph){if(!graph||!Array.isArray(graph.nodes)||!graph.nodes.length||!Array.isArray(graph.edges)||!Array.isArray(graph.exits)||!graph.nodes.every(n=>n&&typeof n==='object')||!graph.edges.every(e=>e&&typeof e==='object')||!graph.exits.every(e=>e&&typeof e==='object'))return false;const ns=new Set(graph.nodes.map(n=>n.id)),es=new Set(graph.edges.map(e=>e.id));return ns.size===graph.nodes.length&&es.size===graph.edges.length&&graph.nodes.every(n=>typeof n.id==='string'&&Array.isArray(n.point)&&n.point.length>=2&&n.point.slice(0,2).every(Number.isFinite))&&graph.edges.every(e=>ns.has(e.a)&&ns.has(e.b)&&Number.isFinite(e.lengthM)&&e.lengthM>=0)&&graph.exits.every(e=>ns.has(e.nodeId));}
export function unknownRainResult(graph,reason='강우 자료가 없습니다.',hazardPolicy,boundaryContext) {const policy=resolveHazardPolicy(hazardPolicy),boundary=resolveBoundaryContext(boundaryContext);return {schema:'cheonggye-rain-prototype/1',graphId:graph?.id,valid:false,id:'rain-unavailable:'+policy.key+':'+boundary.key,boundary,boundaryContextKey:boundary.key,hazardPolicy:policy,provenance:'unavailable-rainfall',source:reason,label:'실시간 강우 미확인',reason,model:RAIN_MODEL,rainfall:null,hydraulicCalibrationValidated:false,rainfallLinkageValidated:false,edgeStates:Object.fromEntries((Array.isArray(graph?.edges)?graph.edges.filter(e=>e&&typeof e.id==='string'):[]).map(e=>[e.id,{depthM:null,freeboardM:null}])),nodeStates:{}};}
export function calculateRainfallFlood(graph,{intensityMmH,durationMinutes,provenance='manual-rainfall-prototype',observedAt=null,stationId=null,hazardPolicy,boundaryContext}={}){
 const policy=resolveHazardPolicy(hazardPolicy),boundary=resolveBoundaryContext(boundaryContext);
 if(!graphValid(graph))return unknownRainResult(graph,'보행 그래프가 유효하지 않습니다.',policy,boundaryContext);
 if(!boundary.valid)return unknownRainResult(graph,boundary.reason,policy,boundaryContext);
 if(!validateRainInput(intensityMmH,durationMinutes)||!['manual-rainfall-prototype','observed-rainfall-prototype'].includes(provenance))return unknownRainResult(graph,'강도 0~500 mm/h, 지속시간 1~1440분의 유효한 강우 입력이 필요합니다.',policy,boundaryContext);
 const p=Object.freeze({...RAIN_MODEL,id:BOUNDARY_APPLICATION.id,catchmentAreaM2:boundary.catchmentAreaM2,runoffCoefficient:boundary.runoffCoefficient,initialStorageM3:boundary.initialStorageM3,boundaryContextKey:boundary.key}),durationSeconds=durationMinutes*60,calculation=integrateBoundaryStorage(boundary,intensityMmH,durationSeconds),{stageM}=calculation;
 const lookup=new Map(graph.nodes.map(n=>[n.id,n])),lengths=new Map((Array.isArray(graph.banks)?graph.banks:[]).filter(b=>b&&typeof b==='object').map(b=>[b.id,b.lengthM])),nodeStates={},edgeStates={};
 for(const n of graph.nodes){const length=lengths.get(n.bank);if(Number.isFinite(n.stationM)&&Number.isFinite(length)&&length>0){const freeboardM=assumedFreeboardM(n.stationM/length,n.bank);nodeStates[n.id]={freeboardM,depthM:Math.max(0,stageM-freeboardM)};}}
 for(const edge of graph.edges.filter(e=>e.kind==='walk')){const a=nodeStates[edge.a],b=nodeStates[edge.b];const freeboardM=a&&b?Math.min(a.freeboardM,b.freeboardM):null;edgeStates[edge.id]={depthM:freeboardM===null?null:Math.max(0,stageM-freeboardM),freeboardM};}
 // Stairs/connector inherit the worst adjoining walkway depth at their anchor, not assumed dry ground.
 for(const edge of graph.edges.filter(e=>e.kind!=='walk')){const anchor=lookup.get(edge.anchorNode),walks=graph.edges.filter(e=>e.kind==='walk'&&(e.a===anchor?.id||e.b===anchor?.id)),states=walks.map(e=>edgeStates[e.id]);const known=states.length&&states.every(s=>typeof s?.depthM==='number');edgeStates[edge.id]=known?{depthM:Math.max(...states.map(s=>s.depthM)),freeboardM:Math.min(...states.map(s=>s.freeboardM)),inheritedFromAnchor:edge.anchorNode}:{depthM:null,freeboardM:null};}
 return {schema:'cheonggye-rain-prototype/1',graphId:graph.id,id:`rain:${provenance}:${stationId??'manual'}:${observedAt??'input'}:${intensityMmH}:${durationMinutes}:policy:${policy.key}:${boundary.key}`,hazardPolicy:policy,boundary,boundaryContextKey:boundary.key,valid:true,label:'강우 기반 근사 침수 시제품',provenance,source:provenance==='observed-rainfall-prototype'?'관측 강우 + 미보정 가정 모형':'수동 강우 + 미보정 가정 모형',rainfall:{intensityMmH,durationMinutes,observedAt,stationId,constantRainfallAssumption:true},model:p,calculation,hydraulicCalibrationValidated:false,rainfallLinkageValidated:false,coordinateBasis:'scene-local; freeboard assumed, not surveyed elevation',nodeStates,edgeStates};
}
export const rainfallHazard=appliedRainfallHazard;
function baselineBoundaryRoute(graph,result,startId,{closedExitIds=[]}={}){
 if(!graphValid(graph))return emptyRoute('invalid-graph','보행 그래프가 유효하지 않습니다.');
 if(!validateBoundaryResult(result)||result.graphId!==graph.id||result.schema!=='cheonggye-rain-prototype/1')return emptyRoute('insufficient-data',result?.reason||'현재 보행망과 일치하는 강우 결과가 없습니다.');
 const lookup=new Map(graph.nodes.map(n=>[n.id,n]));if(!lookup.has(startId))return emptyRoute('invalid-start','출발점을 확인하세요.');
 const adjacent=new Map(graph.nodes.map(n=>[n.id,[]])),hazards=new Map();let blockedEdges=0,unknownEdges=0;
 for(const edge of graph.edges){const hazard=rainfallHazard(edge,result);hazards.set(edge.id,hazard);if(hazard.blocked){blockedEdges++;if(hazard.code==='unknown')unknownEdges++;continue;}adjacent.get(edge.a).push({to:edge.b,edge,hazard});adjacent.get(edge.b).push({to:edge.a,edge,hazard});}
 const closed=new Set(closedExitIds.map(String)),allowed=graph.exits.filter(e=>!closed.has(String(e.id))),common={blockedEdges,unknownEdges,closedExits:closed.size,eligibleExits:allowed.length,objective:'위험·미확인 제외 후 위험가중거리 최소(초록×1, 노랑×3)',resultId:result.id,hazardPolicy:resolveHazardPolicy(result.hazardPolicy)};
 const incident=graph.edges.filter(e=>e.a===startId||e.b===startId),startWalk=incident.filter(e=>e.kind==='walk'),startEdges=startWalk.length?startWalk:incident;
 if(startEdges.some(e=>hazards.get(e.id).code==='unknown'))return emptyRoute('insufficient-data','출발점 주변 침수 자료가 미확인입니다.',common);
 if(startEdges.some(e=>hazards.get(e.id).code==='deep'))return emptyRoute('origin-blocked','출발점이 위험 구간에 포함되어 경로를 표시하지 않습니다.',common);
 if(!allowed.length)return emptyRoute('no-route','모든 등록 출구가 차단되었습니다.',common);
 const goals=new Map(allowed.map(e=>[e.nodeId,e])),dist=new Map([[startId,0]]),previous=new Map(),pending=new Set([startId]),visited=new Set();let found=null;
 while(pending.size){let current=null;for(const id of pending)if(current===null||dist.get(id)<dist.get(current))current=id;pending.delete(current);if(visited.has(current))continue;visited.add(current);if(goals.has(current)){found=current;break;}for(const {to,edge,hazard}of adjacent.get(current)){const candidate=dist.get(current)+edge.lengthM*hazard.costMultiplier;if(candidate<(dist.get(to)??Infinity)){dist.set(to,candidate);previous.set(to,{from:current,edge});pending.add(to);}}}
 if(found===null)return emptyRoute(unknownEdges?'insufficient-data':'no-route',unknownEdges?'결측 구간 때문에 대피 연결을 확인할 수 없습니다.':'현재 근사 침수 조건에서 통과 가능한 경로가 없습니다.',common);
 const nodeIds=[found],edgeIds=[];let lengthM=0;while(previous.has(nodeIds[0])){const prev=previous.get(nodeIds[0]);nodeIds.unshift(prev.from);edgeIds.unshift(prev.edge.id);lengthM+=prev.edge.lengthM;}
 return {...emptyRoute('route','설정 조건 내 경로이며 실제 안전을 보장하지 않습니다.',common),nodeIds,edgeIds,path:nodeIds.map(id=>lookup.get(id)),exit:goals.get(found),lengthM,costM:dist.get(found)};
}

import {resolveFacilityContext,facilityMapStates} from './facility-conditions-v30.js';
export function findRainfallRoute(graph,result,startId,{closedExitIds=[],facilityContext=resolveFacilityContext()}={}){
 if(!Array.isArray(closedExitIds)||closedExitIds.some(id=>typeof id!=='string')||closedExitIds.some(id=>!graph?.exits?.some(e=>e.id===id)))return {status:'invalid-options',reason:'등록된 차단 출구 ID 목록을 확인하세요.',path:[],nodeIds:[],edgeIds:[],exit:null};
 const baseline=baselineBoundaryRoute(graph,result,startId,{closedExitIds});
 const base={...baseline,boundaryContextKey:result?.boundaryContextKey,facilityContextKey:facilityContext.key,facilityMode:facilityContext.mode};
 if(['invalid-graph','invalid-start','origin-blocked'].includes(baseline.status)||!result?.valid)return base;
 if(!facilityContext.valid)return {...base,status:'invalid-options',reason:facilityContext.reason,path:[],nodeIds:[],edgeIds:[],exit:null,lengthM:null,costM:null};
 const facilityCandidates=facilityMapStates(graph,facilityContext,result,0,closedExitIds);
 if(facilityContext.mode==='off')return {...base,facilityCandidates,selectedFacility:facilityCandidates.find(c=>c.exitId===baseline.exit?.id)||null};
 const blocked=facilityCandidates.filter(c=>c.blocked).map(c=>c.exitId),route=baselineBoundaryRoute(graph,result,startId,{closedExitIds:[...new Set([...closedExitIds,...blocked])]});
 // An unknown exit on the disconnected opposite bank cannot itself prevent this route.
 const reachable=new Set([startId]),adjacent=new Map(graph.nodes.map(n=>[n.id,[]]));for(const edge of graph.edges)if(rainfallHazard(edge,result).code!=='deep'){adjacent.get(edge.a).push(edge.b);adjacent.get(edge.b).push(edge.a)}const queue=[startId];for(let i=0;i<queue.length;i++)for(const id of adjacent.get(queue[i])||[])if(!reachable.has(id)){reachable.add(id);queue.push(id)}
 if(route.status==='no-route'&&facilityCandidates.some(c=>c.unknown&&reachable.has(graph.exits.find(e=>e.id===c.exitId)?.nodeId))){route.status='insufficient-data';route.reason='출구 모델·대피방향 또는 수심·유속 자료가 미확인이라 경로를 확인할 수 없습니다.'}
 return {...route,boundaryContextKey:result?.boundaryContextKey,facilityContextKey:facilityContext.key,facilityMode:facilityContext.mode,facilityCandidates,selectedFacility:facilityCandidates.find(c=>c.exitId===route.exit?.id)||null};
}

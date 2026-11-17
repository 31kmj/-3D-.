// Display-model dimensions and authored operation scenarios, never surveyed or live gate data.
import {createStairLayout} from './field-details-v27.js';
import {appliedRainfallHazard} from './hazard-policy-v29.js';
export const FACILITY_APPLICATION=Object.freeze({id:'rainfall-model-facility/1',geometrySource:'field-details-v27.createStairLayout',modelHeightBasis:'assumed walkway -3m to street 0m, not datum',measured:false,currentOperationsConnected:false,regulatoryAccessibilityVerified:false,elevator7:'visual exterior only; no evacuation graph connection',scenarioBasis:'authored demonstration; not official per-exit instructions'});
export const FACILITY_SCENARIOS=Object.freeze([
 {id:'all-open',label:'모든 대피방향 열림 · 가정'},
 {id:'gate5-egress-90',label:'5번 대피방향 90초 차단 · 가정'},
 {id:'gate5-ingress-90',label:'5번 진입만 90초 차단·대피 열림 · 가정'},
 {id:'all-egress-closed',label:'모든 대피방향 차단 · 가정'},
 {id:'unknown',label:'출구 운영 미확인'}
]);
const finite=n=>typeof n==='number'&&Number.isFinite(n),STATES=['open','ingress-closed-egress-open','egress-closed','unknown'];
const egress=s=>s==='open'||s==='ingress-closed-egress-open',hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return h.toString(16)};
export function buildFacilityInventory(data,graph){
 const entries={};for(const exit of graph.exits){try{
  const matches=(data?.stairs||[]).filter(s=>String(s.id)===exit.id);if(matches.length!==1)throw Error('등록 계단 형상 연결 미확인');
  if(!Array.isArray(data?.walks)||!data.walks.length)throw Error('보행로 형상 연결 미확인');
  const l=createStairLayout(matches[0],data.walks),rising=l.intervals.filter(i=>!i.flat),grade=Math.max(...rising.map(i=>100*Math.abs(i.y1-i.y0)/(i.end-i.start))),stairs=graph.edges.find(e=>e.id==='exit:'+exit.id+':stairs'),connector=graph.edges.find(e=>e.id==='exit:'+exit.id+':connector');
  if(!finite(l.widthM)||l.widthM<=0||!finite(grade)||grade<=0||!finite(l.total)||!stairs||!connector||Math.abs(Math.hypot(l.total,3)-stairs.lengthM)>1e-6)throw Error('표시 모델과 등록 경로의 계단 연결 불일치');
  const node=id=>graph.nodes.find(n=>n.id===id),low=node(stairs.a),high=node(stairs.b);
  if(!low||!high||Math.hypot(...low.point.map((p,i)=>p-l.low[i]))>1e-6||Math.hypot(...high.point.map((p,i)=>p-l.high[i]))>1e-6||low.elevation!==-3||high.elevation!==0)throw Error('표시 모델과 경로 양끝/가정표고 불일치');
  entries[exit.id]={valid:true,id:exit.id,name:exit.name,modelWidthM:l.widthM,maxModelGradePct:grade,modelHorizontalM:l.total,modelRiseM:3,stepFreeVerified:false,stairsEdgeId:stairs.id,connectorEdgeId:connector.id,profile:l.intervals.map(i=>({startM:i.start,endM:i.end,y0:i.y0,y1:i.y1,flat:i.flat})),basis:'OSM XY + assumed bounded width/landings and -3/0 model heights; not surveyed or code compliance'};
 }catch(error){entries[exit.id]={valid:false,id:exit.id,name:exit.name,reason:error.message}}}
 const key=hash(JSON.stringify([graph.id,entries]));return {schema:'cheonggye-model-facilities/1',graphId:graph.id,key,entries,application:FACILITY_APPLICATION};
}
export function resolveFacilityContext(inventory,options={}){
 const {mode='unverified',scenario='all-open',minModelWidthM=0,maxModelGradePct=0,requireStepFree=false,horizonSeconds=900,operations}=options||{};
 let valid=['off','unverified','scenario'].includes(mode)&&finite(minModelWidthM)&&minModelWidthM>=0&&finite(maxModelGradePct)&&maxModelGradePct>=0&&typeof requireStepFree==='boolean'&&Number.isInteger(horizonSeconds)&&horizonSeconds>=5&&horizonSeconds<=1800&&horizonSeconds%5===0&&FACILITY_SCENARIOS.some(s=>s.id===scenario);
 const states={},ids=Object.keys(inventory?.entries||{});
 if(operations!==undefined&&(!operations||typeof operations!=='object'||Array.isArray(operations)||Object.keys(operations).some(id=>!ids.includes(id))))valid=false;
 for(const id of ids){let initial='unknown',events=[];
  if(mode==='scenario'){
   if(operations!==undefined){const op=operations?.[id];initial=op?.initial??'unknown';events=op?.events??[]}
   else {initial=scenario==='all-egress-closed'?'egress-closed':scenario==='unknown'?'unknown':'open';if(id==='302087643'&&['gate5-egress-90','gate5-ingress-90'].includes(scenario))events=[{atSeconds:90,state:scenario==='gate5-egress-90'?'egress-closed':'ingress-closed-egress-open'}]}
  }
  let previous=-1,last=initial;
  if(!STATES.includes(initial)||!Array.isArray(events)||events.length>horizonSeconds/5)valid=false;
  else for(const event of events){if(!event||!finite(event.atSeconds)||event.atSeconds<0||event.atSeconds>horizonSeconds||event.atSeconds%5!==0||event.atSeconds<=previous||!STATES.includes(event.state)||!egress(last)&&egress(event.state))valid=false;previous=event?.atSeconds;last=event?.state}
  states[id]={initial,events:Array.isArray(events)?events.map(e=>({atSeconds:e?.atSeconds,state:e?.state})):[]};
 }
 const fields={schema:'cheonggye-facility-context/1',inventory,mode,scenario,minModelWidthM,maxModelGradePct,requireStepFree,horizonSeconds,states,valid,reason:valid?null:'출구조건 입력 오류: 유효한 폭·경사·운영 상태와 정렬된 5초 사건(재개방 없음)을 확인하세요.'};
 return {...fields,key:JSON.stringify([FACILITY_APPLICATION.id,inventory?.graphId,inventory?.key,mode,scenario,minModelWidthM,maxModelGradePct,requireStepFree,horizonSeconds,states,valid])};
}
export function facilityStateAt(context,exitId,time){const op=context?.states?.[exitId];if(!op||!finite(time)||time<0||time>context.horizonSeconds)return 'unknown';let state=op.initial;for(const e of op.events){if(e.atSeconds>time)break;state=e.state}return state}
export function evaluateFacilityExit(graph,exit,context,{result,atSeconds=0,untilSeconds=atSeconds,closedExitIds=[]}={}){
 const model=context?.inventory?.entries?.[exit?.id],reasons=[],out={exitId:exit?.id,name:exit?.name,atSeconds,untilSeconds,contextKey:context?.key,mode:context?.mode,model:model?.valid?model:null,operationState:'unknown',currentOperationsConnected:false,actualSafetyVerified:false};
 const add=(code,reason,unknown=false)=>reasons.push({code,reason,unknown});
 if(!context?.valid)add('invalid-options',context?.reason||'출구조건 설정이 없습니다.',true);
 if(closedExitIds.includes(exit?.id))add('manual-egress-closed','사용자 대피방향 차단');
 if(context?.mode!=='off'){
  if(context?.inventory?.graphId!==graph.id||!model?.valid)add('model-unknown',model?.reason||'현재 경로망과 모델 계단 연결 미확인',true);
  else {if(model.modelWidthM<context.minModelWidthM)add('model-width','모델 폭 '+model.modelWidthM.toFixed(2)+'m < 요청 '+context.minModelWidthM+'m');if(context.maxModelGradePct>0&&model.maxModelGradePct>context.maxModelGradePct)add('model-grade','모델 상승구간 경사 '+model.maxModelGradePct.toFixed(1)+'% > 요청 '+context.maxModelGradePct+'%');if(context.requireStepFree)add('step-free-unverified','등록 출구는 모두 계단입니다. 무단차 경로가 검증되지 않았습니다.')}
  const times=[atSeconds,untilSeconds,...(context?.states?.[exit?.id]?.events||[]).filter(e=>e.atSeconds>=atSeconds&&e.atSeconds<=untilSeconds).map(e=>e.atSeconds)],states=times.map(t=>({atSeconds:t,state:facilityStateAt(context,exit?.id,t)}));out.operationState=states[0]?.state??'unknown';out.operationChecks=states;
  if(states.some(s=>s.state==='egress-closed'))add('egress-closed','계단·연결부 점유 중 대피방향 차단');else if(states.some(s=>s.state==='unknown'))add('operation-unknown','대피방향 운영 미확인',true);
 }
 const edges=graph.edges.filter(e=>e.id==='exit:'+exit?.id+':stairs'||e.id==='exit:'+exit?.id+':connector');out.hydraulic=edges.map(e=>({edgeId:e.id,...appliedRainfallHazard(e,result)}));
 if(edges.length!==2)add('hydraulic-unknown','출구 침수 간선 연결 미확인',true);
 for(const h of out.hydraulic)if(h.blocked)add(h.code==='unknown'?'hydraulic-unknown':'hydraulic-danger',h.reason,h.code==='unknown');
 const depth=out.hydraulic.find(h=>finite(h.depthM))?.depthM;out.assumedRelativeDepthProfile=model?.valid&&finite(depth)?model.profile.map(p=>({startM:p.startM,endM:p.endM,depthAtStartM:Math.max(0,depth-(p.y0+3)),depthAtEndM:Math.max(0,depth-(p.y1+3))})):null;
 out.relativeProfileBasis='assumed relative model height above -3 walkway; hydraulic routing conservatively retains worst anchor depth over entire stair';
 const knownBlocked=reasons.some(r=>!r.unknown),unknown=reasons.some(r=>r.unknown);return {...out,blocked:reasons.length>0,unknown:unknown&&!knownBlocked,knownBlocked,reasons,reason:reasons.length?reasons.map(r=>r.reason).join(' · '):context?.mode==='off'?'2.8 비교 · 출구 모델/운영 조건 적용 안 함':'가정 모델·대피방향 조건 충족 · 현장 안전 미검증'};
}
export function facilityMapStates(graph,context,result,atSeconds=0,closedExitIds=[]){return graph.exits.map(e=>evaluateFacilityExit(graph,e,context,{result,atSeconds,closedExitIds}))}

// Synthetic monotone closure study. This module does not predict floods or certify safety.
export const TEMPORAL_SCHEMA='cheonggye-temporal/1';
export const STUDY_PROFILES={
 'stairs-capable':{id:'stairs-capable',label:'계단 이용 가능 · 가정',walkMps:1.5,stairsMps:.8,rampMps:1.2,requiresStepFree:false,requiresAssistance:false},
 'step-free-required':{id:'step-free-required',label:'무단차 경로 필수 · 가정',walkMps:1,stairsMps:null,rampMps:.8,requiresStepFree:true,requiresAssistance:false},
 'assistance-required':{id:'assistance-required',label:'지원 필요 · 도움 확인 필수',walkMps:.8,stairsMps:.4,rampMps:.6,requiresStepFree:false,requiresAssistance:true},
 'assisted-step-free':{id:'assisted-step-free',label:'무단차 + 지원 필요',walkMps:.8,stairsMps:null,rampMps:.6,requiresStepFree:true,requiresAssistance:true},
};
export function validateScopeContract(scope){
 const errors=[];
 if(!scope||scope.schema!=='cheonggye-evacuation-scope/1')return {valid:false,errors:['적용 범위 계약이 없거나 형식이 다릅니다.']};
 const population=scope.population,operation=scope.operationalDirection,temporal=scope.temporalContract,numeric=scope.numericalStudyAssumptions;
 if(population?.allPublicPedestriansIncluded!==true||population?.profileConditionsMayOverlap!==true||population?.unimplementedNeedsRemainRequirements!==true||population?.notAutomaticPopulationLabels!==true)errors.push('모든 공공 보행 이용자·중첩 요구·미구현 요구 유지 정책이 일치하지 않습니다.');
 if(operation?.positiveEgressConfirmationRequired!==true||operation?.actualOperationFeedConnected!==false||operation?.ingressNoticeAloneConfirmsEgressOpen!==false||operation?.ingressNoticeAloneConfirmsEgressClosed!==false||scope.requiredConditions?.positiveEgressConfirmationRequired!==true)errors.push('대피방향 확인·실제 운영 미연결 정책이 일치하지 않습니다.');
 if(temporal?.inputBasis!=='synthetic_study_only_for_current_route_output'||temporal?.outsideHorizon!=='unknown_not_open'||temporal?.initialTimelineSupport!=='piecewise_constant_states_no_waiting_no_reopening_monotonic_permanent_closure'||temporal?.realMode!=='withhold_real_route_issuance_until_required_geometry_hydraulic_operational_and_accessibility_inputs_validated')errors.push('합성 전용·실제 미발행·시간 범위·단조 차단 정책이 일치하지 않습니다.');
 if(numeric?.tickSeconds!==5||numeric?.avoidAvailabilityExpansion!==true||numeric?.travelTimeDiscretization!=='upward_to_five_second_tick_if_used_by_engine')errors.push('5초 상향 이동 격자 조건이 일치하지 않습니다.');
 if(numeric?.additionalMarginSeconds!==0)errors.push('이번 구현의 추가 여유는 명시적0초만 지원합니다.');
 const profiles=scope.profiles;if(!Array.isArray(profiles)||profiles.length!==Object.keys(STUDY_PROFILES).length||new Set(profiles.map(p=>p?.id)).size!==profiles.length)errors.push('네 이동 조건 계약이 일치하지 않습니다.');
 else for(const declared of profiles){const profile=STUDY_PROFILES[declared?.id];if(!profile||declared.requiresStepFree!==profile.requiresStepFree||declared.requiresAssistance!==profile.requiresAssistance||declared.populationRestriction!==null||profile.requiresStepFree&&declared.stairsAllowed!==false||profile.requiresAssistance&&declared.requireScenarioAssistanceAndUserConfirmation!==true)errors.push('이동 조건 불일치: '+declared?.id)}
 return {valid:!errors.length,errors};
}
function stateBlocked(state){
 if(!state||state.depthM===null||typeof state.depthM!=='number'||!Number.isFinite(state.depthM)||state.depthM<0)return {blocked:true,unknown:true,reason:'unknown'};
 if(state.depthM>0)return {blocked:true,unknown:false,reason:'inundated'};
 if(state.operational==='closed'&&['egress','both'].includes(state.direction))return {blocked:true,unknown:false,reason:'egress-closed'};
 const egress=state.egressState??(state.egressConfirmed===true?'open':['egress','both'].includes(state.direction)?state.operational:'unknown');
 if(egress==='unknown')return {blocked:true,unknown:true,reason:'unknown'};
 if(egress==='closed')return {blocked:true,unknown:false,reason:'egress-closed'};
 return {blocked:false,unknown:false,reason:null};
}
export function temporalStateAt(series,timeSeconds,horizonSeconds){
 if(!Array.isArray(series)||!series.length||!Number.isFinite(timeSeconds)||timeSeconds<0||timeSeconds>horizonSeconds)return {depthM:null,operational:'unknown',direction:'unknown',blocked:true,unknown:true,reason:'outside-data'};
 let selected=null;for(const state of series){if(state.atSeconds<=timeSeconds)selected=state;else break}
 return {...(selected||{depthM:null,operational:'unknown',direction:'unknown'}),...stateBlocked(selected)};
}
export function validateTemporalScenario(graph,scenario){
 const errors=[];
 if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||!Array.isArray(graph.exits))return {valid:false,errors:['유효한 그래프가 필요합니다.']};
 if(!scenario||scenario.schema!==TEMPORAL_SCHEMA||scenario.provenance!=='synthetic-study'||scenario.graphId!==graph.id)errors.push('합성 시간 시나리오 형식·그래프 ID가 일치하지 않습니다.');
 if(!scenario||scenario.tickSeconds!==5||!Number.isInteger(scenario.horizonSeconds)||scenario.horizonSeconds<5||scenario.horizonSeconds>1800||scenario.horizonSeconds%5!==0)errors.push('시간격자는5초, 자료 범위는5~1800초의5초 배수여야 합니다.');
 if(errors.length)return {valid:false,errors};
 if(scenario.rainfallLinkageValidated!==false)errors.push('합성 시간 시나리오는 실제 강우와 연결할 수 없습니다.');
 if(scenario.additionalMarginSeconds!==0)errors.push('추가 여유는 이번 구현에서 명시적0초만 지원합니다.');
 const nodeIDs=new Set(graph.nodes.map(n=>n.id)),edgeIDs=new Set(graph.edges.map(e=>e.id)),exitIDs=new Set(graph.exits.map(e=>e.id));if(nodeIDs.size!==graph.nodes.length||edgeIDs.size!==graph.edges.length||exitIDs.size!==graph.exits.length||graph.edges.length>5000||graph.nodes.length>5000||graph.edges.some(e=>!nodeIDs.has(e.a)||!nodeIDs.has(e.b)||!Number.isFinite(e.lengthM)||e.lengthM<0)||graph.exits.some(e=>!nodeIDs.has(e.nodeId)))errors.push('그래프 연결·이동거리가 유효하지 않습니다.');
 for(const [key,ids]of [['edgeSeries',graph.edges.map(e=>e.id)],['nodeSeries',graph.nodes.map(n=>n.id)],['exitSeries',graph.exits.map(e=>e.id)]]){
  const mapping=scenario[key];if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)){errors.push(key+' 자료가 없습니다.');continue}
  for(const id of Object.keys(mapping)){if(!ids.includes(id)){errors.push(key+' 알 수 없는 ID '+id);continue}const series=mapping[id];if(!Array.isArray(series)||!series.length||series.length>361){errors.push(key+' 시계열 형식 '+id);continue}let last=-1,wasBlocked=false;
   for(const state of series){if(!state||!Number.isInteger(state.atSeconds)||state.atSeconds<0||state.atSeconds>scenario.horizonSeconds||state.atSeconds%5!==0||state.atSeconds<=last){errors.push(key+' 시각이 유효하지 않음 '+id);break}last=state.atSeconds;if(!(state.depthM===null||typeof state.depthM==='number'&&Number.isFinite(state.depthM)&&state.depthM>=0&&state.depthM<=100)||!['open','closed','unknown'].includes(state.operational)||!['egress','ingress','both','unknown'].includes(state.direction)||(state.egressState!==undefined&&!['open','closed','unknown'].includes(state.egressState))||(state.egressConfirmed!==undefined&&typeof state.egressConfirmed!=='boolean')){errors.push(key+' 상태가 유효하지 않음 '+id);break}const blocked=stateBlocked(state).blocked;if(wasBlocked&&!blocked){errors.push(key+' 재개방 입력은 지원하지 않음 '+id);break}wasBlocked=blocked}
   if(series[0]?.atSeconds!==0)errors.push(key+' 시작 시각0이 필요함 '+id);
  }
 }
 if(!scenario.accessibility||!scenario.accessibility.edges||!scenario.accessibility.exits||typeof scenario.accessibility.edges!=='object'||typeof scenario.accessibility.exits!=='object'||Array.isArray(scenario.accessibility.edges)||Array.isArray(scenario.accessibility.exits))errors.push('접근성 분류 자료가 필요합니다.');
 else if(graph.edges.some(edge=>edge.kind==='stairs'&&scenario.accessibility.edges[edge.id]!==undefined&&!['stairs','unknown'].includes(scenario.accessibility.edges[edge.id])))errors.push('기존 계단 형상을 평면·경사로로 재분류할 수 없습니다.');
 return {valid:!errors.length,errors};
}
function edgeDuration(edge,profile,accessibility,tick){
 if(!['level','ramp','stairs'].includes(accessibility))return {reason:'accessibility-unknown'};
 if(profile.requiresStepFree&&accessibility==='stairs')return {reason:'stairs-disallowed'};
 const speed=accessibility==='stairs'?profile.stairsMps:accessibility==='ramp'?profile.rampMps:profile.walkMps;
 if(!(speed>0))return {reason:'profile-disallowed'};
 return {seconds:edge.lengthM===0?0:Math.ceil(edge.lengthM/speed/tick)*tick};
}
export function findTemporalEvacuationRoute(graph,scenario,startId,options={}){
 if(options.requireScopeContract===true||options.scopeContract!==undefined){const scope=validateScopeContract(options.scopeContract);if(!scope.valid)return {status:'invalid-scope',errors:scope.errors,path:[],edgeIds:[],actualSafetyVerified:false};}
 const validation=validateTemporalScenario(graph,scenario);if(!validation.valid)return {status:'invalid',errors:validation.errors,path:[],edgeIds:[]};
 const {profileId='stairs-capable',delaySeconds=0,closedExitIds=[],assistanceConfirmed=false,operatingMode='synthetic-study'}=options,profile=STUDY_PROFILES[profileId],tick=5,horizon=scenario.horizonSeconds;
 const basis={actualSafetyVerified:false,rainfallToFloodCalculated:false,modelBasis:'synthetic-study',tickSeconds:tick,objective:'제약 충족 후5초 격자 내 최소 도착시각 · 동률 최소 거리 · 경로상 기다림 없음',profileId,departureSeconds:delaySeconds};
 if(operatingMode!=='synthetic-study')return {...basis,status:'operations-unverified',reason:'현장 대피방향 운영 자료 미연결',path:[],edgeIds:[]};
 if(!profile||!Number.isInteger(delaySeconds)||delaySeconds<0||delaySeconds>horizon||delaySeconds%tick!==0||!Array.isArray(closedExitIds))return {...basis,status:'invalid',errors:['이동 프로필·출발 지연이 유효하지 않습니다.'],path:[],edgeIds:[]};
 if(profile.requiresAssistance&&(assistanceConfirmed!==true||scenario.assistanceAvailable!==true))return {...basis,status:'assistance-unconfirmed',reason:'도움 제공의 합성 가용 조건과 확인이 모두 충족되지 않아 경로를 산출하지 않음',path:[],edgeIds:[]};
 const nodes=new Map(graph.nodes.map(n=>[n.id,n]));if(!nodes.has(startId))return {...basis,status:'invalid-start',path:[],edgeIds:[]};
 const rejectionCounts={inundated:0,'egress-closed':0,unknown:0,'outside-data':0,'accessibility-unknown':0,'stairs-disallowed':0,'profile-disallowed':0},record=reason=>{rejectionCounts[reason]=(rejectionCounts[reason]||0)+1};
 for(let time=0;time<=delaySeconds;time+=tick){const startState=temporalStateAt(scenario.nodeSeries[startId],time,horizon);if(startState.blocked)return {...basis,status:startState.unknown?'insufficient-data':'origin-blocked',reason:'출발 대기 중 시작점 '+startState.reason,blockedAtSeconds:time,path:[],edgeIds:[],rejectionCounts};}
 const adjacent=new Map(graph.nodes.map(n=>[n.id,[]]));for(const edge of [...graph.edges].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){adjacent.get(edge.a).push({edge,to:edge.b});adjacent.get(edge.b).push({edge,to:edge.a})}
 const allowedExits=graph.exits.filter(e=>!closedExitIds.map(String).includes(String(e.id))),goals=new Map(allowedExits.map(e=>[e.nodeId,e])),key=(node,time)=>node+'@'+time;
 const initial={node:startId,time:delaySeconds,length:0,key:key(startId,delaySeconds)},pending=[],best=new Map([[initial.key,0]]),previous=new Map(),states=new Map([[initial.key,initial]]);let found=null,expanded=0;
 const less=(a,b)=>a.time<b.time||a.time===b.time&&(a.length<b.length||a.length===b.length&&a.key<b.key);
 function push(item){pending.push(item);let i=pending.length-1;while(i>0){const p=Math.floor((i-1)/2);if(!less(pending[i],pending[p]))break;[pending[i],pending[p]]=[pending[p],pending[i]];i=p}}
 function pop(){const first=pending[0],last=pending.pop();if(pending.length){pending[0]=last;let i=0;while(true){const a=i*2+1,b=a+1;let smallest=i;if(a<pending.length&&less(pending[a],pending[smallest]))smallest=a;if(b<pending.length&&less(pending[b],pending[smallest]))smallest=b;if(smallest===i)break;[pending[i],pending[smallest]]=[pending[smallest],pending[i]];i=smallest}}return first}push(initial);
 while(pending.length){const current=pop();if(current.length!==best.get(current.key))continue;if(++expanded>100000)return {...basis,status:'invalid',errors:['시간 확장 상태 상한을 넘었습니다.'],path:[],edgeIds:[],expanded};
  const goal=goals.get(current.node);if(goal){const accessibility=scenario.accessibility.exits[goal.id];const state=temporalStateAt(scenario.exitSeries[goal.id],current.time,horizon);if(state.blocked)record(state.reason);else if(!['level','ramp','stairs'].includes(accessibility))record('accessibility-unknown');else if(profile.requiresStepFree&&accessibility==='stairs')record('stairs-disallowed');else{found=current;break}}
  for(const {edge,to}of adjacent.get(current.node)){
   const duration=edgeDuration(edge,profile,scenario.accessibility.edges[edge.id],tick);if(duration.reason){record(duration.reason);continue}const arrival=current.time+duration.seconds;if(arrival>horizon){record('outside-data');continue}let blocked=null;
   for(let time=current.time;time<=arrival;time+=tick){const edgeState=temporalStateAt(scenario.edgeSeries[edge.id],time,horizon);if(edgeState.blocked){blocked=edgeState.reason;break}}
   if(!blocked){const destination=temporalStateAt(scenario.nodeSeries[to],arrival,horizon);if(destination.blocked)blocked=destination.reason}
   if(blocked){record(blocked);continue}const targetKey=key(to,arrival),length=current.length+edge.lengthM;if(length<(best.get(targetKey)??Infinity)){const next={node:to,time:arrival,length,key:targetKey};best.set(targetKey,length);previous.set(targetKey,{from:current.key,edgeId:edge.id,departSeconds:current.time,arriveSeconds:arrival});states.set(targetKey,next);push(next)}
  }
 }
 if(!found){
  // Diagnose only relevant unknowns: relax missing/future data, retain all known
  // permanent closures and profile exclusions. This optimistic check never emits
  // a route. Monotonic closure permits one earliest-arrival label per node here.
  const knownBlocked=(series,time)=>{if(!Array.isArray(series))return false;for(const state of series){if(state.atSeconds>Math.min(time,horizon))break;const result=stateBlocked(state);if(result.blocked&&!result.unknown)return true}return false};
  const hopeful=new Map([[startId,delaySeconds]]),queue=[{node:startId,time:delaySeconds}],seen=new Set();let relevantUnknown=false;
  while(queue.length){queue.sort((a,b)=>a.time-b.time);const current=queue.shift();if(seen.has(current.node))continue;seen.add(current.node);const exit=goals.get(current.node);
   if(exit){const accessibility=scenario.accessibility.exits[exit.id];if(!(profile.requiresStepFree&&accessibility==='stairs')&&!knownBlocked(scenario.exitSeries[exit.id],current.time)){relevantUnknown=true;break}}
   for(const {edge,to}of adjacent.get(current.node)){
    let accessibility=scenario.accessibility.edges[edge.id];if(!['level','ramp','stairs'].includes(accessibility))accessibility=edge.kind==='stairs'?'stairs':edge.kind==='ramp'?'ramp':'level';
    const duration=edgeDuration(edge,profile,accessibility,tick);if(duration.reason||!Number.isFinite(duration.seconds))continue;const arrival=current.time+duration.seconds;if(!Number.isFinite(arrival))continue;
    const series=scenario.edgeSeries[edge.id];let blocked=knownBlocked(series,current.time);if(!blocked&&Array.isArray(series))for(const state of series)if(state.atSeconds>current.time&&state.atSeconds<=arrival){const value=stateBlocked(state);if(value.blocked&&!value.unknown){blocked=true;break}}
    if(blocked||knownBlocked(scenario.nodeSeries[to],arrival))continue;if(arrival<(hopeful.get(to)??Infinity)){hopeful.set(to,arrival);queue.push({node:to,time:arrival})}
   }
  }
  return {...basis,status:relevantUnknown?'insufficient-data':'no-route',path:[],edgeIds:[],lengthM:null,arrivalSeconds:null,rejectionCounts,expanded,relevantUnknown};
 }
 const routeStates=[found],legs=[];while(previous.has(routeStates[0].key)){const leg=previous.get(routeStates[0].key);legs.unshift(leg);routeStates.unshift(states.get(leg.from))}
 return {...basis,status:'route',path:routeStates.map(s=>({...nodes.get(s.node),atSeconds:s.time})),nodeIds:routeStates.map(s=>s.node),edgeIds:legs.map(l=>l.edgeId),legs,lengthM:found.length,arrivalSeconds:found.time,travelSeconds:found.time-delaySeconds,exit:goals.get(found.node),rejectionCounts,expanded};
}

// Geometry and routing only. No rainfall/runoff or hydraulic prediction is performed.
export const FLOOD_SCHEMA = 'cheonggye-flood-edges/1';
export const distance = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
export function buildFloodGraph(data,{spacingM=20,maxConnectorM=12}={}){
 if(!Number.isFinite(spacingM)||spacingM<2||spacingM>100||!Number.isFinite(maxConnectorM)||maxConnectorM<0)throw Error('그래프 간격 또는 연결 상한이 유효하지 않습니다.');
 const nodes=[],edges=[],exits=[],rejectedExits=[],banks=[],bankIds=new Set();
 const addNode=(id,point,bank,stationM,elevation=-3)=>{const node={id,point:[...point],bank,stationM,elevation,elevationBasis:'assumed-not-surveyed'};nodes.push(node);return node};
 const addEdge=(id,a,b,kind,bank,lengthM,extra={})=>{const edge={id,a:a.id,b:b.id,kind,bank,lengthM,elevationBasis:'assumed-not-surveyed',...extra};edges.push(edge);return edge};
 for(const walk of data.walks||[]){
  if(!['north','south'].includes(walk.side)||bankIds.has(walk.side))throw Error('보행로의 양안 구분이 없거나 중복됩니다.');bankIds.add(walk.side);
  if(!Array.isArray(walk.points)||walk.points.length<2||walk.points.some(p=>!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite)))throw Error('보행로 좌표가 유효하지 않습니다.');
  const points=walk.points[0][0]>walk.points.at(-1)[0]?[...walk.points].reverse():[...walk.points],segments=[];let length=0;
  for(let i=1;i<points.length;i++){const len=distance(points[i-1],points[i]);if(len>1e-6){segments.push({a:points[i-1],b:points[i],start:length,length:len});length+=len}}
  if(length<=0)continue;
  const at=s=>{const segment=segments.find(e=>s<=e.start+e.length+1e-6)||segments.at(-1);return lerp(segment.a,segment.b,Math.max(0,Math.min(1,(s-segment.start)/segment.length)))};
  const project=p=>segments.reduce((best,e)=>{const dx=e.b[0]-e.a[0],dz=e.b[1]-e.a[1],t=Math.max(0,Math.min(1,((p[0]-e.a[0])*dx+(p[1]-e.a[1])*dz)/(e.length**2))),point=lerp(e.a,e.b,t),d=distance(point,p);return d<best.distanceM?{distanceM:d,stationM:e.start+t*e.length,point}:best},{distanceM:Infinity});
  banks.push({id:walk.side,walkId:walk.id,width:walk.width||5,length,segments,at,project,anchors:[]});
 }
 for(const stair of data.stairs||[]){
  if(!Array.isArray(stair.points)||stair.points.length<2||stair.points.some(p=>!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite))){rejectedExits.push({id:String(stair.id),reason:'invalid-stair-geometry'});continue}
  const endpoints=[stair.points[0],stair.points.at(-1)],candidates=banks.flatMap(bank=>endpoints.map((point,index)=>({bank,point,index,...bank.project(point)}))).sort((a,b)=>a.distanceM-b.distanceM),candidate=candidates[0];
  if(!candidate||candidate.distanceM>maxConnectorM){rejectedExits.push({id:String(stair.id),reason:'connector-too-far',distanceM:candidate?.distanceM??null});continue}
  const low=endpoints[candidate.index],high=endpoints[1-candidate.index],path=candidate.index===0?stair.points:[...stair.points].reverse();
  candidate.bank.anchors.push({id:String(stair.id),name:stair.name||'지도 등록 계단',low,high,path,stationM:candidate.stationM,distanceM:candidate.distanceM});
 }
 for(const bank of banks){
  const stations=[0,bank.length,...bank.segments.map(s=>s.start),...bank.anchors.map(a=>a.stationM)];for(let s=spacingM;s<bank.length;s+=spacingM)stations.push(s);
  stations.sort((a,b)=>a-b);const unique=stations.filter((s,i)=>!i||s-stations[i-1]>.001),chain=unique.map((s,i)=>addNode(bank.id+':'+i,bank.at(s),bank.id,s));
  bank.nodeIds=chain.map(n=>n.id);
  for(let i=1;i<chain.length;i++)addEdge(bank.id+':walk:'+i,chain[i-1],chain[i],'walk',bank.id,chain[i].stationM-chain[i-1].stationM,{fromRatio:chain[i-1].stationM/bank.length,toRatio:chain[i].stationM/bank.length,width:bank.width});
  for(const anchor of bank.anchors){
   const attach=chain.reduce((best,n)=>Math.abs(n.stationM-anchor.stationM)<Math.abs(best.stationM-anchor.stationM)?n:best,chain[0]);
   const low=addNode('exit:'+anchor.id+':low',anchor.low,bank.id,anchor.stationM),high=addNode('exit:'+anchor.id+':high',anchor.high,bank.id,anchor.stationM,0);
   addEdge('exit:'+anchor.id+':connector',attach,low,'connector',bank.id,anchor.distanceM,{anchorNode:attach.id});
   let horizontal=0;for(let i=1;i<anchor.path.length;i++)horizontal+=distance(anchor.path[i-1],anchor.path[i]);
   addEdge('exit:'+anchor.id+':stairs',low,high,'stairs',bank.id,Math.hypot(horizontal,3),{anchorNode:attach.id,path:anchor.path,assumedRiseM:3});
   exits.push({id:anchor.id,name:anchor.name,bank:bank.id,nodeId:high.id,anchorNode:attach.id,connectorM:anchor.distanceM,operatingState:'unverified',elevationBasis:'assumed-not-surveyed'});
  }
 }
 const starts=banks.flatMap(bank=>[.1,.3,.5,.7,.9].map((ratio,i)=>{const candidates=nodes.filter(n=>bank.nodeIds.includes(n.id));const node=candidates.reduce((best,n)=>Math.abs(n.stationM-bank.length*ratio)<Math.abs(best.stationM-bank.length*ratio)?n:best,candidates[0]);return {id:node.id,bank:bank.id,ratio,label:(bank.id==='north'?'북안':'남안')+' · 서→동 '+(i*20+10)+'% 지점',point:node.point}}));
 let geometryHash=2166136261;for(const char of JSON.stringify({nodes:nodes.map(n=>[n.id,...n.point]),edges:edges.map(e=>[e.id,e.a,e.b,e.lengthM])})){geometryHash^=char.charCodeAt(0);geometryHash=Math.imul(geometryHash,16777619)>>>0}
 return {id:'cheonggye-v15-'+geometryHash.toString(16),schema:FLOOD_SCHEMA,nodes,edges,exits,rejectedExits,starts,config:{spacingM,maxConnectorM,crossBankEdges:false,elevationBasis:'assumed-not-surveyed'},banks:banks.map(b=>({id:b.id,lengthM:b.length,width:b.width}))};
}
export function validateFloodResult(input,graph){
 const errors=[];if(!input||typeof input!=='object')return {valid:false,errors:['입력이 객체가 아닙니다.']};
 if(input.schema!==FLOOD_SCHEMA)errors.push('지원하지 않는 침수 결과 형식입니다.');
 if(input.graphId!==graph.id)errors.push('현재 보행 그래프와 입력의 식별자가 다릅니다.');
 if(input.provenance!=='synthetic')errors.push('1.4는 합성 결과만 입력합니다. 실제 수리모형 결과는 좌표·표고·모형 검증 연결 후 지원합니다.');
 if(input.provenance==='synthetic'&&input.notHydraulicPrediction!==true)errors.push('합성 입력은 수리 예측이 아님을 명시해야 합니다.');
 if(input.provenance==='synthetic'&&(input.rainfall!==null||input.rainfallLinkageValidated!==false))errors.push('합성 침수 입력을 강우 산정 결과와 연결할 수 없습니다.');
 if(!input.coordinateBasis||input.coordinateBasis.horizontal!=='scene_precision_v5-local-xz-m'||input.coordinateBasis.vertical!=='assumed-walkway-y-minus3-m-not-datum')errors.push('좌표·가정 수직 기준이 일치하지 않습니다.');
 if(!(input.scenarioTimeSeconds===null||typeof input.scenarioTimeSeconds==='number'&&Number.isFinite(input.scenarioTimeSeconds)&&input.scenarioTimeSeconds>=0))errors.push('결과 시각이 유효하지 않습니다.');
 if(!input.source||typeof input.source!=='string')errors.push('자료 출처가 필요합니다.');
 if(!input.edgeStates||typeof input.edgeStates!=='object'||Array.isArray(input.edgeStates))errors.push('간선별 침수 입력이 필요합니다.');
 const ids=new Set(graph.edges.map(e=>e.id));
 for(const [id,state]of Object.entries(input.edgeStates||{})){
  if(!ids.has(id))errors.push('알 수 없는 간선: '+id);
  if(!state||typeof state!=='object'||!(state.depthM===null||typeof state.depthM==='number'&&Number.isFinite(state.depthM)&&state.depthM>=0&&state.depthM<=100))errors.push('유효하지 않은 수심: '+id);
  if(state?.velocityMps!==undefined&&state.velocityMps!==null&&!(typeof state.velocityMps==='number'&&Number.isFinite(state.velocityMps)&&state.velocityMps>=0&&state.velocityMps<=100))errors.push('유효하지 않은 유속: '+id);
 }
 return {valid:!errors.length,errors};
}
export function edgeHazard(edge,result){
 const depth=result?.edgeStates?.[edge.id]?.depthM;
 if(depth===null||typeof depth!=='number'||!Number.isFinite(depth)||depth<0)return {code:'unknown',depthM:null,blocked:true,color:'#7d8998',label:'자료 없음 · 제외'};
 if(depth===0)return {code:'dry',depthM:depth,blocked:false,color:'#16866a',label:'가정 건조'};
 return {code:depth<.25?'wet':'deep',depthM:depth,blocked:true,color:depth<.25?'#e4a72c':'#d65a55',label:depth<.25?'합성 침수':'합성 깊은 침수'};
}
export function findEvacuationRoute(graph,result,startId,{closedExitIds=[]}={}){
 if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||!Array.isArray(graph.exits))return {status:'invalid-graph',path:[],edgeIds:[]};
 const nodeIdsCheck=new Set(graph.nodes.map(n=>n.id)),edgeIdsCheck=new Set(graph.edges.map(e=>e.id));
 if(nodeIdsCheck.size!==graph.nodes.length||edgeIdsCheck.size!==graph.edges.length||graph.nodes.some(n=>!Array.isArray(n.point)||n.point.length<2||!n.point.slice(0,2).every(Number.isFinite))||graph.edges.some(e=>!nodeIdsCheck.has(e.a)||!nodeIdsCheck.has(e.b)||!Number.isFinite(e.lengthM)||e.lengthM<0)||graph.exits.some(e=>!nodeIdsCheck.has(e.nodeId)))return {status:'invalid-graph',path:[],edgeIds:[]};
 const validation=validateFloodResult(result,graph);if(!validation.valid)return {status:'invalid',errors:validation.errors,path:[],edgeIds:[]};
 const lookup=new Map(graph.nodes.map(n=>[n.id,n]));if(!lookup.has(startId))return {status:'invalid-start',path:[],edgeIds:[]};
 const adjacent=new Map(graph.nodes.map(n=>[n.id,[]]));let blockedEdges=0,unknownEdges=0;
 for(const edge of graph.edges){const hazard=edgeHazard(edge,result);if(hazard.blocked){blockedEdges++;if(hazard.code==='unknown')unknownEdges++;continue}adjacent.get(edge.a).push({to:edge.b,edge});adjacent.get(edge.b).push({to:edge.a,edge})}
 const allowed=graph.exits.filter(e=>!closedExitIds.map(String).includes(e.id)),goals=new Map(allowed.map(e=>[e.nodeId,e]));
 const dist=new Map([[startId,0]]),previous=new Map(),pending=new Set([startId]),visited=new Set();let found=null;
 while(pending.size){let current=null;for(const id of pending)if(current===null||dist.get(id)<dist.get(current))current=id;pending.delete(current);if(visited.has(current))continue;visited.add(current);if(goals.has(current)){found=current;break}
  for(const {to,edge}of adjacent.get(current)){const candidate=dist.get(current)+edge.lengthM;if(candidate<(dist.get(to)??Infinity)){dist.set(to,candidate);previous.set(to,{from:current,edgeId:edge.id});pending.add(to)}}
 }
 const common={blockedEdges,unknownEdges,closedExits:closedExitIds.length,eligibleExits:allowed.length,objective:'침수·결측 간선 제외 후 가정 그래프 이동거리 최소',actualSafetyVerified:false,hydraulicPrediction:false};
 if(found===null)return {...common,status:unknownEdges?'insufficient-data':'no-route',path:[],edgeIds:[],lengthM:null,exit:null};
 const nodeIds=[found],edgeIds=[];while(previous.has(nodeIds[0])){const prev=previous.get(nodeIds[0]);nodeIds.unshift(prev.from);edgeIds.unshift(prev.edgeId)}
 return {...common,status:'route',path:nodeIds.map(id=>lookup.get(id)),nodeIds,edgeIds,lengthM:dist.get(found),exit:goals.get(found)};
}

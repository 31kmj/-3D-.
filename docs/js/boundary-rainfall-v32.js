// Explicit experimental boundaries for a lumped storage model, never observed river flow.
export const BOUNDARY_APPLICATION=Object.freeze({id:'assumed-boundary-storage-v32',schema:'cheonggye-boundary-context/1',calibrated:false,actualCatchmentVerified:false,currentBoundaryVerified:false,downstreamStageBoundary:false,fluidSolver2D:false,equation:'dS/dt=C*i*A/3600000+qUpExcess+qLateralExcess-drainageFactor*S/900',scope:'constant experimental excess inflows and storage-proportional drainage, not a downstream stage hydrograph'});
export const BOUNDARY_DEFAULTS=Object.freeze({catchmentAreaM2:500000,runoffCoefficient:.65,upstreamExcessM3s:0,lateralExcessM3s:0,drainageFactor:1,initialStorageM3:0});
const fields=Object.keys(BOUNDARY_DEFAULTS),limits={catchmentAreaM2:[1,50000000],runoffCoefficient:[0,1],upstreamExcessM3s:[0,100],lateralExcessM3s:[0,100],drainageFactor:[0,1],initialStorageM3:[0,220000]},finite=n=>typeof n==='number'&&Number.isFinite(n);
export function resolveBoundaryContext(input){
 if(input===undefined)input={mode:'legacy'};
 const bad=reason=>Object.freeze({schema:BOUNDARY_APPLICATION.schema,mode:input?.mode??'invalid',valid:false,key:'boundary-invalid:'+String(input?.mode??'invalid'),reason,application:BOUNDARY_APPLICATION});
 if(!input||typeof input!=='object'||Array.isArray(input)||!['legacy','scenario','unverified'].includes(input.mode))return bad('경계 모드 또는 입력 형식을 확인하세요.');
 const allowed=new Set(['mode',...fields,'schema','key','valid','reason','application','responseSeconds','storageAreaM2','assumed']);if(Object.keys(input).some(k=>!allowed.has(k)))return bad('지원하지 않는 경계 매개변수입니다.');
 if(input.valid===false)return bad(typeof input.reason==='string'?input.reason:'경계 입력이 유효하지 않습니다.');
 if(input.mode==='unverified')return bad('현재 기여면적·상류/측방 추가유입·배수 조건 미연결 → 침수·경로 미산정.');
 const values=input.mode==='legacy'?{...BOUNDARY_DEFAULTS}:Object.fromEntries(fields.map(k=>[k,input[k]]));
 for(const k of fields){if(!finite(values[k])||values[k]<limits[k][0]||values[k]>limits[k][1])return bad('경계 가정값 범위 오류: '+k);if(input.mode==='legacy'&&Object.hasOwn(input,k)&&input[k]!==values[k])return bad('3.0 비교 경계는 고정값이어야 합니다.');}
 const key='boundary:'+input.mode+':'+fields.map(k=>values[k]).join(':');
 if(Object.hasOwn(input,'key')&&input.key!==key||Object.hasOwn(input,'schema')&&input.schema!==BOUNDARY_APPLICATION.schema||Object.hasOwn(input,'valid')&&input.valid!==true||Object.hasOwn(input,'responseSeconds')&&input.responseSeconds!==900||Object.hasOwn(input,'storageAreaM2')&&input.storageAreaM2!==22000)return bad('경계 키·단위 계약이 일치하지 않습니다.');
 return Object.freeze({schema:BOUNDARY_APPLICATION.schema,mode:input.mode,valid:true,key,...values,responseSeconds:900,storageAreaM2:22000,assumed:true,application:BOUNDARY_APPLICATION});
}
export function integrateBoundaryStorage(context,intensityMmH,durationSeconds,initialStorageM3){
 const b=resolveBoundaryContext(context),s0=initialStorageM3===undefined?b.initialStorageM3:initialStorageM3;
 if(!b.valid||!finite(intensityMmH)||intensityMmH<0||intensityMmH>500||!finite(durationSeconds)||durationSeconds<0||durationSeconds>86400||!finite(s0)||s0<0)return {valid:false,reason:b.reason||'강우·시간·초기저류 단위 또는 범위 오류'};
 const runoffInflowM3s=b.runoffCoefficient*intensityMmH*b.catchmentAreaM2/3600000,upstreamExcessM3s=b.upstreamExcessM3s,lateralExcessM3s=b.lateralExcessM3s,inflowM3s=runoffInflowM3s+upstreamExcessM3s+lateralExcessM3s,lambda=b.drainageFactor/b.responseSeconds,inputRunoffM3=runoffInflowM3s*durationSeconds,inputUpstreamExcessM3=upstreamExcessM3s*durationSeconds,inputLateralExcessM3=lateralExcessM3s*durationSeconds,inputTotalM3=inflowM3s*durationSeconds;
 let storageM3;if(durationSeconds===0)storageM3=s0;else if(lambda===0)storageM3=s0+inputTotalM3;else if(b.mode==='legacy'){const eq=inflowM3s*b.responseSeconds;storageM3=s0===0?eq*(-Math.expm1(-durationSeconds/b.responseSeconds)):eq+(s0-eq)*Math.exp(-durationSeconds/b.responseSeconds)}else storageM3=s0*Math.exp(-lambda*durationSeconds)+inflowM3s*(-Math.expm1(-lambda*durationSeconds))/lambda;
 const drainedM3=Math.max(0,s0+inputTotalM3-storageM3),massBalanceResidualM3=s0+inputTotalM3-storageM3-drainedM3;
 return {valid:true,boundaryContextKey:b.key,initialStorageM3:s0,durationSeconds,runoffInflowM3s,upstreamExcessM3s,lateralExcessM3s,inflowM3s,inputRunoffM3,inputUpstreamExcessM3,inputLateralExcessM3,inputTotalM3,storageM3,stageM:storageM3/b.storageAreaM2,drainedM3,massBalanceResidualM3,drainageFactor:b.drainageFactor};
}
export function validateBoundaryResult(result){
 const b=resolveBoundaryContext(result?.boundary),c=result?.calculation;
 if(!result?.valid||result.schema!=='cheonggye-rain-prototype/1'||!['manual-rainfall-prototype','observed-rainfall-prototype'].includes(result.provenance)||!b.valid||typeof result.id!=='string'||!result.id.includes(b.key)||result.boundaryContextKey!==b.key||c?.boundaryContextKey!==b.key||!c||!finite(c.storageM3)||c.storageM3<0||!finite(c.stageM)||Math.abs(c.stageM-c.storageM3/b.storageAreaM2)>1e-8)return false;
 if(!result.model||result.model.id!==BOUNDARY_APPLICATION.id||result.model.catchmentAreaM2!==b.catchmentAreaM2||result.model.runoffCoefficient!==b.runoffCoefficient||result.model.initialStorageM3!==b.initialStorageM3||result.model.responseSeconds!==900||result.model.storageAreaM2!==22000||result.model.boundaryContextKey!==b.key)return false;
 for(const k of ['initialStorageM3','inputRunoffM3','inputUpstreamExcessM3','inputLateralExcessM3','inputTotalM3','drainedM3','runoffInflowM3s','upstreamExcessM3s','lateralExcessM3s','inflowM3s'])if(!finite(c[k])||c[k]<0)return false;
 const elapsed=result.futureAtSeconds===undefined?0:result.futureAtSeconds,duration=result.rainfall?.durationMinutes*60+elapsed;
 if(!finite(result.rainfall?.intensityMmH)||result.rainfall.intensityMmH<0||result.rainfall.intensityMmH>500||!finite(elapsed)||elapsed<0||elapsed>1800||!finite(c.durationSeconds)||c.durationSeconds!==duration||c.drainageFactor!==b.drainageFactor||Math.abs(c.runoffInflowM3s-b.runoffCoefficient*result.rainfall.intensityMmH*b.catchmentAreaM2/3600000)>1e-8)return false;
 const tol=1e-7*Math.max(1,c.storageM3,c.inputTotalM3,c.initialStorageM3);
 return Math.abs(c.inputUpstreamExcessM3-b.upstreamExcessM3s*duration)<=tol&&Math.abs(c.inputLateralExcessM3-b.lateralExcessM3s*duration)<=tol&&Math.abs(c.inputTotalM3-c.inputRunoffM3-c.inputUpstreamExcessM3-c.inputLateralExcessM3)<=tol&&Math.abs(c.initialStorageM3+c.inputTotalM3-c.storageM3-c.drainedM3)<=tol&&c.initialStorageM3===b.initialStorageM3&&c.upstreamExcessM3s===b.upstreamExcessM3s&&c.lateralExcessM3s===b.lateralExcessM3s&&Math.abs(c.inflowM3s-c.runoffInflowM3s-c.upstreamExcessM3s-c.lateralExcessM3s)<1e-8;
}

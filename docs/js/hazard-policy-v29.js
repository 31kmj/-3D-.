// Applied prototype policy; source H classes are general vulnerability classes,
// while the three colours and routing permissions below are our authored choices.
import {classifyLiteratureHazard,HAZARD_METHOD} from './hazard-rules-v17.js';

export const HAZARD_COLORS=Object.freeze({dry:'#16866a',wet:'#f4cb42',deep:'#dc5148',unknown:'#7d8998'});
export const HAZARD_APPLICATION=Object.freeze({
 id:'cheonggye-public-walk-prototype/1',methodId:HAZARD_METHOD.id,
 source:'https://www.environment.nsw.gov.au/sites/default/files/flood-risk-management-flood-hazard-230231.pdf',
 sourceLocation:'NSW FB03 (2023-06), Table 1, 인쇄 4쪽 / PDF 8쪽',
 originalSource:HAZARD_METHOD.source,
 selectionReason:'수심과 유속의 곱뿐 아니라 각각의 상한도 함께 제한하는 공개 일반취약성 분류를 선택했습니다. 국내 현장 검증 전 보수적 보행 시제품에만 적용합니다.',
 localApplicabilityValidated:false,pedestrianSafetyValidated:false,hydraulicCalibrationValidated:false,
 mappingAuthoredHere:true,units:Object.freeze({depth:'m',velocity:'m/s',depthVelocity:'m²/s'}),
 mapping:'유효 수심0=초록; 양의 수심 H1=노랑·비용×3; H2~H6=빨강·차단; 결측/잘못된 입력=회색·차단',
});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function resolveHazardPolicy(input={}){
 const object=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const id=object.id===undefined?'aidr-prototype':object.id;
 const velocityMode=id==='legacy-depth'?'not-required':object.velocityMode===undefined?'missing':object.velocityMode;
 const assumedVelocityMps=velocityMode==='assumed-constant'?object.assumedVelocityMps:null;
 const valid=(id==='legacy-depth'||id==='aidr-prototype'&&['missing','assumed-constant'].includes(velocityMode))&&(velocityMode!=='assumed-constant'||finite(assumedVelocityMps)&&assumedVelocityMps>=0);
 const key=JSON.stringify([HAZARD_APPLICATION.id,id,velocityMode,velocityMode==='assumed-constant'?(finite(assumedVelocityMps)?assumedVelocityMps:'invalid') : null,valid]);
 return Object.freeze({id,velocityMode,assumedVelocityMps:finite(assumedVelocityMps)?assumedVelocityMps:null,valid,key,applicationId:HAZARD_APPLICATION.id,methodId:id==='aidr-prototype'?HAZARD_METHOD.id:'legacy-depth-0.25m',velocityProvenance:velocityMode==='assumed-constant'?'user-assumed-constant-not-observed':velocityMode==='missing'?'unavailable':'not-required',localApplicabilityValidated:false,pedestrianSafetyValidated:false});
}
export const DEFAULT_HAZARD_POLICY=resolveHazardPolicy();
export function appliedRainfallHazard(edge,result){
 const policy=resolveHazardPolicy(result?.hazardPolicy),depth=result?.valid===true?result?.edgeStates?.[edge?.id]?.depthM:null;
 const basis={policyId:policy.id,policyKey:policy.key,methodId:policy.methodId,applicationId:policy.applicationId,classId:null,depthVelocity:null,velocityMps:policy.assumedVelocityMps,velocityProvenance:policy.velocityProvenance,mapApplied:true,mappingAuthoredHere:true,localApplicabilityValidated:false,pedestrianSafetyValidated:false};
 const out=(code,label,reason,extra={})=>({...basis,code,color:HAZARD_COLORS[code],label,reason,depthM:finite(depth)&&depth>=0?depth:null,blocked:['deep','unknown'].includes(code),costMultiplier:code==='dry'?1:code==='wet'?3:null,...extra});
 if(!policy.valid)return out('unknown','미확인','선택한 위험 분류 또는 가정 유속 입력이 유효하지 않습니다.');
 if(result?.schema!=='cheonggye-rain-prototype/1'||!['manual-rainfall-prototype','observed-rainfall-prototype'].includes(result?.provenance))return out('unknown','미확인','강우 근사 결과의 형식·입력 출처를 확인할 수 없습니다.');
 if(!finite(depth)||depth<0)return out('unknown','미확인','유효한 근사 수심 결과가 없습니다. 결측을 건조로 처리하지 않습니다.');
 if(depth===0)return out('dry','건조(모형)','유효한 근사 모형 수심이 0입니다. 실제 건조 관측·안전 인증이 아닙니다.');
 if(policy.id==='legacy-depth')return depth<.25?out('wet','주의(이전 시연)','이전 0.25m 수심 전용 시연 규칙입니다.'):out('deep','위험(이전 시연)','이전 0.25m 수심 전용 시연 규칙입니다.');
 if(policy.velocityMode==='missing')return out('unknown','유속 미확인','양의 수심에는 유속이 필요합니다. 강우·표면 물결로 유속을 만들어 넣지 않습니다.');
 const classified=classifyLiteratureHazard({depthM:depth,velocityMps:policy.assumedVelocityMps});
 if(classified.status!=='classified')return out('unknown','미확인',classified.message);
 const extra={classId:classified.classId,depthVelocity:classified.depthVelocity,classLimits:classified.limits};
 return classified.classId==='H1'?out('wet','주의(가정 H1)','일반취약성 H1을 자체 보행 시제품에서 노랑·비용×3으로 묶었습니다. 보행 안전 보장이 아닙니다.',extra):out('deep','위험(가정 '+classified.classId+')','일반취약성 H2~H6을 자체 보행 시제품에서 빨강·통과 제외로 묶었습니다.',extra);
}
